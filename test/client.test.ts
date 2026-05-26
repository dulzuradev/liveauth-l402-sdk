import { describe, expect, it, vi } from 'vitest';
import { L402Client, MemoryTokenStore, PaymentRequiredError } from '../src/index.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('L402Client', () => {
  it('creates invoices with the public key header', async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse({
        paymentHash: 'hash-test',
        bolt11: 'lnbc1test',
        amountSats: 2,
        expiresAtUnix: 999
      })
    );

    const client = new L402Client({ publicKey: 'la_pk_test', baseUrl: 'https://api.test', fetch: fakeFetch });
    const invoice = await client.createInvoice({ destination: 'agent-1', amountSats: 2 });

    expect(invoice.paymentHash).toBe('hash-test');
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://api.test/api/public/l402/invoice?destination=agent-1&amountSats=2',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-LW-Public': 'la_pk_test' })
      })
    );
  });

  it('normalizes validatePayment and stores the token', async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse({
        token: 'token-test',
        tokenType: 'L402',
        expiresInSeconds: 60,
        tokenScope: 'allowance_scoped_bearer',
        remainingCalls: 1
      })
    );
    const store = new MemoryTokenStore();
    const client = new L402Client({ publicKey: 'la_pk_test', baseUrl: 'https://api.test', fetch: fakeFetch, tokenStore: store });

    const result = await client.validatePayment('hash-test');

    expect(result.expiresAtUnix).toBeGreaterThan(0);
    expect(result.tokenScope).toBe('allowance_scoped_bearer');
    expect(result.remainingCalls).toBe(1);
    expect(await client.getToken()).toBe('token-test');
  });

  it('verifies cached tokens and exposes cache helpers', async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse({
        valid: true,
        tokenType: 'L402'
      })
    );
    const client = new L402Client({ publicKey: 'la_pk_test', baseUrl: 'https://api.test', fetch: fakeFetch });

    await client.setToken('token-test', Math.floor(Date.now() / 1000) + 60);

    expect(await client.hasValidToken()).toBe(true);
    await expect(client.verifyToken()).resolves.toEqual({ valid: true, tokenType: 'L402' });
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://api.test/api/public/l402/verify?token=token-test',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-LW-Public': 'la_pk_test' })
      })
    );

    await client.clearToken();
    expect(await client.getToken()).toBeNull();
  });

  it('throws PaymentRequiredError without a payer', async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse(
        {
          invoice: {
            paymentHash: 'hash-test',
            bolt11: 'lnbc1test',
            amountSats: 1,
            expiresAtUnix: 123
          }
        },
        { status: 402 }
      )
    );
    const client = new L402Client({ publicKey: 'la_pk_test', fetch: fakeFetch });

    await expect(client.request('https://resource.test')).rejects.toMatchObject({
      name: 'PaymentRequiredError',
      invoice: expect.objectContaining({ paymentHash: 'hash-test' })
    } satisfies Partial<PaymentRequiredError>);
  });

  it('pays and retries once with an L402 token', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            paymentHash: 'hash-test',
            bolt11: 'lnbc1test',
            amountSats: 1,
            expiresAtUnix: 123
          },
          { status: 402 }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'token-test',
          tokenType: 'L402',
          expiresInSeconds: 60
        })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const client = new L402Client({
      publicKey: 'la_pk_test',
      baseUrl: 'https://api.test',
      fetch: fakeFetch,
      payer: {
        async payInvoice(invoice) {
          return { paymentHash: invoice.paymentHash };
        }
      }
    });

    const response = await client.request('https://resource.test', { headers: { Accept: 'application/json' } });

    expect(response.status).toBe(200);
    expect(fakeFetch).toHaveBeenNthCalledWith(
      3,
      'https://resource.test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'L402 token-test'
        })
      })
    );
  });

  it('creates an invoice when a 402 challenge does not include one', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            message: 'Call /api/public/l402/invoice to get an invoice'
          },
          { status: 402 }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          paymentHash: 'hash-fallback',
          bolt11: 'lnbc1fallback',
          amountSats: 3,
          expiresAtUnix: 123
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'token-fallback',
          tokenType: 'L402',
          expiresInSeconds: 60
        })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const client = new L402Client({
      publicKey: 'la_pk_test',
      baseUrl: 'https://api.test',
      fetch: fakeFetch,
      payer: {
        async payInvoice(invoice) {
          return { paymentHash: invoice.paymentHash };
        }
      }
    });

    const response = await client.request('https://resource.test', undefined, {
      amountSats: 3,
      destination: 'agent-1'
    });

    expect(response.status).toBe(200);
    expect(fakeFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.test/api/public/l402/invoice?destination=agent-1&amountSats=3',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fakeFetch).toHaveBeenNthCalledWith(
      4,
      'https://resource.test',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'L402 token-fallback' })
      })
    );
  });
});
