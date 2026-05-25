import { L402Error } from './errors.js';
import type { FetchLike } from './types.js';

export const DEFAULT_BASE_URL = 'https://api.liveauth.app';

export function cleanBaseUrl(baseUrl = DEFAULT_BASE_URL): string {
  return baseUrl.replace(/\/+$/, '');
}

export function requireFetch(fetchImpl?: FetchLike): FetchLike {
  const resolved = fetchImpl ?? globalThis.fetch;
  if (!resolved) {
    throw new L402Error('LiveAuth L402 SDK requires fetch. Use Node 18+ or pass config.fetch.');
  }

  return resolved.bind(globalThis) as FetchLike;
}

export function publicHeaders(publicKey: string, headers?: HeadersInit): HeadersInit {
  return {
    ...headersToRecord(headers),
    'Content-Type': headersToRecord(headers)['Content-Type'] ?? 'application/json',
    'X-LW-Public': publicKey
  };
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new L402Error(`LiveAuth L402 returned non-JSON response: ${text.slice(0, 120)}`, {
      status: response.status
    });
  }
}

export async function requestJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit
): Promise<T> {
  const response = await fetchImpl(url, init);
  const json = await readJson<unknown>(response);

  if (!response.ok) {
    throw new L402Error(getErrorMessage(json) ?? `LiveAuth L402 request failed with status ${response.status}`, {
      status: response.status,
      details: json
    });
  }

  return json as T;
}

export function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

function getErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const description = record.error_description ?? record.message ?? record.error;
  return typeof description === 'string' ? description : undefined;
}
