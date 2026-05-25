# @liveauth-labs/l402-sdk

Standalone TypeScript SDK for LiveAuth L402 invoice and HTTP 402 payment flows.

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

Phase 1 includes pay-per-call invoice/token helpers, token caching, 402 parsing helpers, and one-retry request payment negotiation when a payer adapter is provided.

Current LiveAuth v0.1 L402 tokens are project-bound, time-scoped bearer tokens. They are not single-use yet.
