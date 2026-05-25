import { describe, expect, it } from 'vitest';
import { extractInvoiceFrom402, parseWwwAuthenticate, withL402Token } from '../src/index.js';

describe('L402 parse helpers', () => {
  it('parses authenticate schemes and params', () => {
    const parsed = parseWwwAuthenticate('L402 realm="liveauth", x402 realm="liveauth", invoice="required"');

    expect(parsed?.schemes).toEqual(['L402', 'x402']);
    expect(parsed?.params).toMatchObject({
      realm: 'liveauth',
      invoice: 'required'
    });
  });

  it('extracts LiveAuth invoice bodies', () => {
    expect(
      extractInvoiceFrom402({
        invoice: 'lnbc1test',
        paymentHash: 'hash-test',
        amountSats: 1,
        expiresAtUnix: 123
      })
    ).toEqual({
      bolt11: 'lnbc1test',
      paymentHash: 'hash-test',
      amountSats: 1,
      expiresAtUnix: 123
    });
  });

  it('adds L402 authorization without dropping headers', () => {
    expect(withL402Token({ headers: { Accept: 'application/json' } }, 'token-test').headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'L402 token-test'
    });
  });
});
