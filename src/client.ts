import { PaymentFailedError, PaymentRequiredError, TokenValidationError } from './errors.js';
import { cleanBaseUrl, publicHeaders, readJson, requestJson, requireFetch } from './http.js';
import { extractInvoiceFrom402, isPaymentRequiredResponse, withL402Token } from './parse.js';
import { currentUnix, isStoredTokenFresh, MemoryTokenStore } from './token-store.js';
import type {
  FetchLike,
  L402ClientConfig,
  L402Invoice,
  L402StoredToken,
  L402TokenResult,
  L402TokenStore,
  L402VerifyResult
} from './types.js';

interface InvoiceResponse {
  paymentHash: string;
  bolt11: string;
  amountSats: number;
  expiresAtUnix: number;
}

interface ValidateResponse {
  token: string;
  tokenType: 'L402';
  expiresInSeconds: number;
  expiresAtUnix?: number;
  tokenScope?: string;
  remainingCalls?: number;
}

export class L402Client {
  readonly publicKey: string;
  readonly baseUrl: string;

  private readonly amountSats: number | undefined;
  private readonly destination: string | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly payer: L402ClientConfig['payer'];
  private readonly tokenStore: L402TokenStore;

  constructor(config: L402ClientConfig) {
    if (!config.publicKey) {
      throw new TokenValidationError('L402Client requires config.publicKey');
    }

    this.publicKey = config.publicKey;
    this.baseUrl = cleanBaseUrl(config.baseUrl);
    this.amountSats = config.amountSats;
    this.destination = config.destination;
    this.fetchImpl = requireFetch(config.fetch);
    this.payer = config.payer;
    this.tokenStore = config.tokenStore ?? new MemoryTokenStore();
  }

  async createInvoice(options: { destination?: string; amountSats?: number } = {}): Promise<L402Invoice> {
    const url = new URL(`${this.baseUrl}/api/public/l402/invoice`);
    const destination = options.destination ?? this.destination;
    const amountSats = options.amountSats ?? this.amountSats;

    if (destination) url.searchParams.set('destination', destination);
    if (amountSats != null) url.searchParams.set('amountSats', String(amountSats));

    return requestJson<InvoiceResponse>(this.fetchImpl, url.toString(), {
      method: 'POST',
      headers: publicHeaders(this.publicKey)
    });
  }

  async validatePayment(paymentHash: string): Promise<L402TokenResult> {
    const url = new URL(`${this.baseUrl}/api/public/l402/validate`);
    url.searchParams.set('paymentHash', paymentHash);

    const response = await requestJson<ValidateResponse>(this.fetchImpl, url.toString(), {
      method: 'POST',
      headers: publicHeaders(this.publicKey)
    });

    const result = {
      token: response.token,
      tokenType: response.tokenType,
      expiresInSeconds: response.expiresInSeconds,
      expiresAtUnix: response.expiresAtUnix ?? currentUnix() + response.expiresInSeconds,
      tokenScope: response.tokenScope,
      remainingCalls: response.remainingCalls
    };

    await this.setToken(result.token, result.expiresAtUnix);
    return result;
  }

  async verifyToken(token?: string): Promise<L402VerifyResult> {
    const resolvedToken = token ?? (await this.getToken());
    if (!resolvedToken) {
      return { valid: false, tokenType: 'L402' };
    }

    const url = new URL(`${this.baseUrl}/api/public/l402/verify`);
    url.searchParams.set('token', resolvedToken);

    return requestJson<L402VerifyResult>(this.fetchImpl, url.toString(), {
      method: 'GET',
      headers: publicHeaders(this.publicKey)
    });
  }

  async request(
    url: string,
    init?: RequestInit,
    options: { amountSats?: number; destination?: string; maxPaymentAttempts?: 0 | 1 } = {}
  ): Promise<Response> {
    const cachedToken = await this.getToken();
    const firstInit = cachedToken ? withL402Token(init, cachedToken) : init;
    const firstResponse = await this.fetchImpl(url, firstInit);

    if (!isPaymentRequiredResponse(firstResponse)) {
      return firstResponse;
    }

    if (options.maxPaymentAttempts === 0 || !this.payer) {
      throw await this.paymentRequired(firstResponse);
    }

    const invoice = (await this.extractInvoice(firstResponse)) ?? (await this.createInvoice(options));
    const payment = await this.payer.payInvoice(invoice);
    if (payment.paymentHash && payment.paymentHash !== invoice.paymentHash) {
      throw new PaymentFailedError('Payer returned a different payment hash', { expected: invoice.paymentHash, actual: payment.paymentHash });
    }

    const token = await this.validatePayment(invoice.paymentHash);
    const retryResponse = await this.fetchImpl(url, withL402Token(init, token.token));

    if (isPaymentRequiredResponse(retryResponse)) {
      throw await this.paymentRequired(retryResponse);
    }

    return retryResponse;
  }

  async hasValidToken(): Promise<boolean> {
    return isStoredTokenFresh(await this.readStoredToken());
  }

  async getToken(): Promise<string | null> {
    const stored = await this.readStoredToken();
    return isStoredTokenFresh(stored) ? stored.token : null;
  }

  async setToken(token: string, expiresAtUnix: number): Promise<void> {
    await this.tokenStore.set({ token, tokenType: 'L402', expiresAtUnix });
  }

  async clearToken(): Promise<void> {
    await this.tokenStore.clear();
  }

  private async readStoredToken(): Promise<L402StoredToken | null> {
    return this.tokenStore.get();
  }

  private async extractInvoice(response: Response): Promise<L402Invoice | null> {
    const clone = response.clone();
    const body = await readJson<unknown>(clone).catch(() => null);
    return extractInvoiceFrom402(body);
  }

  private async paymentRequired(response: Response): Promise<PaymentRequiredError> {
    const clone = response.clone();
    const body = await readJson<unknown>(clone).catch(() => null);
    return new PaymentRequiredError('Payment required', {
      invoice: extractInvoiceFrom402(body) ?? undefined,
      response,
      details: body
    });
  }
}
