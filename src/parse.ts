import type { L402Invoice } from './types.js';
import { headersToRecord } from './http.js';

export function parseWwwAuthenticate(header: string | null): {
  schemes: string[];
  params: Record<string, string>;
} | null {
  if (!header?.trim()) return null;

  const schemes: string[] = [];
  const params: Record<string, string> = {};
  const parts = splitHeader(header);

  for (const part of parts) {
    const [rawKey, ...rawValueParts] = part.split('=');
    const key = rawKey?.trim();
    if (!key) continue;

    if (rawValueParts.length === 0) {
      schemes.push(...key.split(/\s+/).filter(Boolean));
      continue;
    }

    const tokens = key.split(/\s+/);
    if (tokens.length > 1) {
      schemes.push(...tokens.slice(0, -1));
    }

    const paramKey = tokens[tokens.length - 1];
    if (paramKey) params[paramKey] = unquote(rawValueParts.join('=').trim());
  }

  return { schemes: Array.from(new Set(schemes)), params };
}

export function extractInvoiceFrom402(responseBody: unknown): L402Invoice | null {
  if (!responseBody || typeof responseBody !== 'object') return null;
  const body = responseBody as Record<string, unknown>;

  const candidate =
    getRecord(body.invoice) ??
    getRecord(body.payment) ??
    getRecord(body.l402) ??
    body;

  const bolt11 = firstString(candidate.bolt11, candidate.invoice, candidate.paymentRequest, candidate.request);
  const paymentHash = firstString(candidate.paymentHash, candidate.hash, candidate.rHash, candidate.r_hash);
  const amountSats = firstNumber(candidate.amountSats, candidate.amount, candidate.value);
  const expiresAtUnix = firstNumber(candidate.expiresAtUnix, candidate.expiresAt, candidate.expiry);

  if (!bolt11 || !paymentHash || amountSats == null || expiresAtUnix == null) {
    return null;
  }

  return {
    bolt11,
    paymentHash,
    amountSats,
    expiresAtUnix
  };
}

export function withL402Token(init: RequestInit | undefined, token: string): RequestInit {
  const next: RequestInit = { ...(init ?? {}) };
  next.headers = {
    ...headersToRecord(init?.headers),
    Authorization: `L402 ${token}`
  };
  return next;
}

export function isPaymentRequiredResponse(response: Response): boolean {
  return response.status === 402;
}

function splitHeader(header: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of header) {
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}
