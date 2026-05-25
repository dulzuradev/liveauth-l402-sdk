export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface L402ClientConfig {
  publicKey: string;
  baseUrl?: string;
  amountSats?: number;
  destination?: string;
  fetch?: FetchLike;
  payer?: L402Payer;
  tokenStore?: L402TokenStore;
}

export interface L402Invoice {
  paymentHash: string;
  bolt11: string;
  amountSats: number;
  expiresAtUnix: number;
}

export interface L402TokenResult {
  token: string;
  tokenType: 'L402';
  expiresInSeconds: number;
  expiresAtUnix: number;
}

export interface L402Payer {
  payInvoice(invoice: L402Invoice): Promise<L402PaymentResult>;
}

export interface L402PaymentResult {
  paymentHash?: string;
  preimage?: string;
}

export interface L402TokenStore {
  get(): Promise<L402StoredToken | null> | L402StoredToken | null;
  set(token: L402StoredToken): Promise<void> | void;
  clear(): Promise<void> | void;
}

export interface L402StoredToken {
  token: string;
  tokenType: 'L402';
  expiresAtUnix: number;
}

export interface L402VerifyResult {
  valid: boolean;
  tokenType: 'L402';
}
