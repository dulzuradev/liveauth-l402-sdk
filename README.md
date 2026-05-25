# @liveauth-labs/l402-sdk

Standalone TypeScript SDK for LiveAuth L402 invoice and HTTP 402 payment flows.

## Install

```sh
npm install @liveauth-labs/l402-sdk
```

Node 18+ is required. The core SDK uses global `fetch` and has no runtime dependencies.

## Manual Pay-Per-Call

```ts
import { L402Client } from '@liveauth-labs/l402-sdk';

const l402 = new L402Client({
  publicKey: process.env.LIVEAUTH_PUBLIC_KEY!
});

const invoice = await l402.createInvoice({ destination: 'agent-001', amountSats: 1 });
console.log(invoice.bolt11);

const token = await l402.validatePayment(invoice.paymentHash);

const response = await fetch('https://api.example.com/protected', {
  headers: { Authorization: `L402 ${token.token}` }
});
```

## Auto-Pay With A Payer

The SDK never pays invoices by itself. To automate payment, provide a payer adapter.

```ts
import { L402Client } from '@liveauth-labs/l402-sdk';

const l402 = new L402Client({
  publicKey: process.env.LIVEAUTH_PUBLIC_KEY!,
  payer: {
    async payInvoice(invoice) {
      return myLightningWallet.pay(invoice.bolt11);
    }
  }
});

const response = await l402.request('https://api.example.com/protected', undefined, {
  amountSats: 1,
  destination: 'agent-001'
});
```

`request()` retries at most once after a 402. If no payer is configured, it throws `PaymentRequiredError` with invoice details when the 402 response includes them.

## Token Cache

```ts
await l402.setToken('token', Math.floor(Date.now() / 1000) + 3600);
const token = await l402.getToken();
const valid = await l402.hasValidToken();
await l402.clearToken();
```

Current LiveAuth v0.1 L402 tokens are project-bound, time-scoped bearer tokens. They are not single-use yet.

## Bundle Purchase

```ts
import { L402BundleClient } from '@liveauth-labs/l402-sdk';

const bundles = new L402BundleClient({
  publicKey: process.env.LIVEAUTH_PUBLIC_KEY!
});

const invoice = await bundles.createInvoice('starter', { agentId: 'agent-001' });
console.log(invoice.bolt11);

const claim = await bundles.claim(invoice.paymentHash, { poll: true });
const session = await bundles.createMcpSession({ macaroon: claim.macaroon });
console.log(session.jwt);
```

## Bundle Auto-Purchase

```ts
import { L402BundleClient } from '@liveauth-labs/l402-sdk';

const bundles = new L402BundleClient({
  publicKey: process.env.LIVEAUTH_PUBLIC_KEY!,
  payer: {
    async payInvoice(invoice) {
      return myLightningWallet.pay(invoice.bolt11);
    }
  }
});

const claim = await bundles.purchase('starter', {
  agentId: 'agent-001',
  pollIntervalMs: 2000,
  timeoutMs: 600_000
});
```

## Helpers

```ts
import {
  extractInvoiceFrom402,
  parseWwwAuthenticate,
  withL402Token
} from '@liveauth-labs/l402-sdk';
```

LiveAuth accepts `Authorization: L402 <token>` for L402-protected calls and `Authorization: Bearer <jwt>` for MCP-gated calls.
