import { describe, expect, it, vi } from 'vitest';
import { L402BundleClient, PaymentRequiredError } from '../src/index.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('L402BundleClient', () => {
  it('creates bundle invoices and normalizes bolt11', async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse({
        bundleId: 'bundle_starter_abc',
        invoice: 'lnbc1bundle',
        paymentHash: 'hash-test',
        amountSats: 50,
        expiresAtUnix: 123,
        tier: 'starter',
        totalCalls: 100
      })
    );
    const client = new L402BundleClient({ publicKey: 'la_pk_test', baseUrl: 'https://api.test', fetch: fakeFetch });

    const invoice = await client.createInvoice('starter', { agentId: 'agent-1' });

    expect(invoice.bolt11).toBe('lnbc1bundle');
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://api.test/api/public/l402/bundle/invoice',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-LW-Public': 'la_pk_test' }),
        body: JSON.stringify({ tier: 'starter', agentId: 'agent-1' })
      })
    );
  });

  it('polls bundle claims until paid', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Payment not yet received' }, { status: 402 }))
      .mockResolvedValueOnce(
        jsonResponse({
          macaroon: 'macaroon-test',
          bundleId: 'bundle_starter_abc',
          remainingCalls: 100,
          expiresAtUnix: 999,
          scopes: ['mcp.verify', 'auth.start']
        })
      );
    const client = new L402BundleClient({ publicKey: 'la_pk_test', baseUrl: 'https://api.test', fetch: fakeFetch });

    const claim = await client.claim('hash-test', { poll: true, pollIntervalMs: 1, timeoutMs: 100 });

    expect(claim.macaroon).toBe('macaroon-test');
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it('throws payment required when claim is unpaid and polling is disabled', async () => {
    const fakeFetch = vi.fn(async () => jsonResponse({ error: 'Payment not yet received' }, { status: 402 }));
    const client = new L402BundleClient({ publicKey: 'la_pk_test', baseUrl: 'https://api.test', fetch: fakeFetch });

    await expect(client.claim('hash-test')).rejects.toMatchObject({
      name: 'PaymentRequiredError'
    } satisfies Partial<PaymentRequiredError>);
  });

  it('requires a payer for purchase', async () => {
    const client = new L402BundleClient({ publicKey: 'la_pk_test', fetch: vi.fn() });

    await expect(client.purchase('starter')).rejects.toMatchObject({
      code: 'payer_required'
    });
  });

  it('gets status by bundle id', async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse({
        bundleId: 'bundle_starter_abc',
        tier: 'starter',
        totalCalls: 100,
        remainingCalls: 90,
        usedCalls: 10,
        expiresAtUnix: 999,
        isExpired: false,
        isDepleted: false
      })
    );
    const client = new L402BundleClient({ publicKey: 'la_pk_test', baseUrl: 'https://api.test', fetch: fakeFetch });

    const status = await client.getStatus({ bundleId: 'bundle_starter_abc' });

    expect(status.remainingCalls).toBe(90);
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://api.test/api/public/l402/bundle/status?bundleId=bundle_starter_abc',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-LW-Public': 'la_pk_test' })
      })
    );
  });

  it('creates MCP sessions with bundle macaroons', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ quoteId: 'quote-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          quoteId: 'quote-1',
          jwt: 'jwt-test',
          expiresIn: 600,
          remainingBudgetSats: 100,
          refreshToken: null
        })
      );
    const client = new L402BundleClient({ publicKey: 'la_pk_test', baseUrl: 'https://api.test', fetch: fakeFetch });

    const session = await client.createMcpSession({ macaroon: 'macaroon-test' });

    expect(session.jwt).toBe('jwt-test');
    expect(fakeFetch).toHaveBeenNthCalledWith(
      1,
      'https://api.test/api/mcp/start',
      expect.objectContaining({
        body: JSON.stringify({ forceL402: true })
      })
    );
    expect(fakeFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.test/api/mcp/confirm',
      expect.objectContaining({
        body: JSON.stringify({ quoteId: 'quote-1', macaroon: 'macaroon-test' })
      })
    );
  });
});
