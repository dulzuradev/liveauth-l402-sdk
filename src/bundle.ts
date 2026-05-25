import { BundleClaimTimeoutError, L402Error, PaymentRequiredError } from './errors.js';
import { cleanBaseUrl, publicHeaders, readJson, requestJson, requireFetch } from './http.js';
import { requirePayer } from './payer.js';
import type {
  FetchLike,
  L402BundleClaim,
  L402BundleClientConfig,
  L402BundleInvoice,
  L402BundleStatus,
  L402BundleTier,
  L402BundleTierName,
  L402McpSession,
  L402Payer
} from './types.js';

export const L402BundleTiers: L402BundleTier[] = [
  { name: 'starter', totalCalls: 100, priceSats: 50, effectiveRate: 0.5, validDays: 90 },
  { name: 'growth', totalCalls: 1_000, priceSats: 400, effectiveRate: 0.4, validDays: 90 },
  { name: 'scale', totalCalls: 10_000, priceSats: 3_000, effectiveRate: 0.3, validDays: 90 },
  { name: 'enterprise', totalCalls: 100_000, priceSats: 20_000, effectiveRate: 0.2, validDays: 90 }
];

interface BundleInvoiceResponse extends Omit<L402BundleInvoice, 'bolt11'> {
  bolt11?: string;
}

interface McpStartResponse {
  quoteId: string;
}

export class L402BundleClient {
  readonly publicKey: string;
  readonly baseUrl: string;

  private readonly fetchImpl: FetchLike;
  private readonly payer: L402Payer | undefined;

  constructor(config: L402BundleClientConfig) {
    if (!config.publicKey) {
      throw new L402Error('L402BundleClient requires config.publicKey', { code: 'public_key_required' });
    }

    this.publicKey = config.publicKey;
    this.baseUrl = cleanBaseUrl(config.baseUrl);
    this.fetchImpl = requireFetch(config.fetch);
    this.payer = config.payer;
  }

  async createInvoice(
    tier: L402BundleTierName,
    options: { agentId?: string } = {}
  ): Promise<L402BundleInvoice> {
    const response = await requestJson<BundleInvoiceResponse>(this.fetchImpl, `${this.baseUrl}/api/public/l402/bundle/invoice`, {
      method: 'POST',
      headers: publicHeaders(this.publicKey),
      body: JSON.stringify({
        tier,
        ...(options.agentId ? { agentId: options.agentId } : {})
      })
    });

    const bolt11 = response.bolt11 ?? response.invoice;
    return { ...response, bolt11 };
  }

  async claim(
    paymentHash: string,
    options: { poll?: boolean; pollIntervalMs?: number; timeoutMs?: number } = {}
  ): Promise<L402BundleClaim> {
    const { poll = false, pollIntervalMs = 2_000, timeoutMs = 600_000 } = options;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const response = await this.fetchImpl(`${this.baseUrl}/api/public/l402/bundle/claim`, {
        method: 'POST',
        headers: publicHeaders(this.publicKey),
        body: JSON.stringify({ paymentHash })
      });
      const body = await readJson<unknown>(response).catch(() => undefined);

      if (response.ok) {
        return body as L402BundleClaim;
      }

      if (response.status !== 402 || !poll) {
        throw new PaymentRequiredError('Bundle payment required', { response, details: body });
      }

      if (Date.now() + pollIntervalMs > deadline) {
        throw new BundleClaimTimeoutError('Timed out waiting for bundle payment', { paymentHash });
      }

      await sleep(pollIntervalMs);
    }
  }

  async getStatus(query: { bundleId?: string; paymentHash?: string }): Promise<L402BundleStatus> {
    if (!query.bundleId && !query.paymentHash) {
      throw new L402Error('getStatus requires bundleId or paymentHash', { code: 'invalid_status_query' });
    }

    const url = new URL(`${this.baseUrl}/api/public/l402/bundle/status`);
    if (query.bundleId) url.searchParams.set('bundleId', query.bundleId);
    if (query.paymentHash) url.searchParams.set('paymentHash', query.paymentHash);

    return requestJson<L402BundleStatus>(this.fetchImpl, url.toString(), {
      method: 'GET',
      headers: publicHeaders(this.publicKey)
    });
  }

  async purchase(
    tier: L402BundleTierName,
    options: { agentId?: string; pollIntervalMs?: number; timeoutMs?: number } = {}
  ): Promise<L402BundleClaim> {
    const payer = requirePayer(this.payer);
    const invoice = await this.createInvoice(tier, options);
    await payer.payInvoice(invoice);
    return this.claim(invoice.paymentHash, {
      poll: true,
      pollIntervalMs: options.pollIntervalMs,
      timeoutMs: options.timeoutMs
    });
  }

  async createMcpSession(options: { apiUrl?: string; macaroon: string }): Promise<L402McpSession> {
    const apiUrl = cleanBaseUrl(options.apiUrl ?? this.baseUrl);
    const start = await requestJson<McpStartResponse>(this.fetchImpl, `${apiUrl}/api/mcp/start`, {
      method: 'POST',
      headers: publicHeaders(this.publicKey),
      body: JSON.stringify({ forceL402: true })
    });

    const confirm = await requestJson<Omit<L402McpSession, 'quoteId'> & { quoteId?: string }>(this.fetchImpl, `${apiUrl}/api/mcp/confirm`, {
      method: 'POST',
      headers: publicHeaders(this.publicKey),
      body: JSON.stringify({
        quoteId: start.quoteId,
        macaroon: options.macaroon
      })
    });

    return {
      ...confirm,
      quoteId: confirm.quoteId ?? start.quoteId
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
