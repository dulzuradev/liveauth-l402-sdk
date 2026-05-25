import assert from 'node:assert/strict';
import { L402BundleClient, L402Client } from '../dist/index.js';

const apiUrl = process.env.LIVEAUTH_API_URL ?? 'http://127.0.0.1:5167';
const publicKey = process.env.LIVEAUTH_PUBLIC_KEY ?? 'la_pk_smoke';

const l402 = new L402Client({ publicKey, baseUrl: apiUrl });
const invoice = await l402.createInvoice({ destination: 'smoke-agent', amountSats: 1 });
assert.equal(invoice.amountSats, 1);
assert.ok(invoice.paymentHash);
assert.ok(invoice.bolt11);
console.log('invoice', invoice.paymentHash);

const token = await l402.validatePayment(invoice.paymentHash);
assert.equal(token.tokenType, 'L402');
assert.ok(token.token);
console.log('token', token.expiresInSeconds);

const verification = await l402.verifyToken(token.token);
assert.equal(verification.valid, true);
console.log('verify', verification.valid);

const bundles = new L402BundleClient({ publicKey, baseUrl: apiUrl });
const bundleInvoice = await bundles.createInvoice('starter', { agentId: 'smoke-agent' });
assert.equal(bundleInvoice.bolt11, bundleInvoice.invoice);
assert.equal(bundleInvoice.tier, 'starter');
console.log('bundle invoice', bundleInvoice.bundleId);

const statusBeforeClaim = await bundles.getStatus({ bundleId: bundleInvoice.bundleId });
assert.equal(statusBeforeClaim.remainingCalls, 100);
console.log('bundle status', statusBeforeClaim.remainingCalls);

const claim = await bundles.claim(bundleInvoice.paymentHash);
assert.ok(claim.macaroon);
assert.equal(claim.bundleId, bundleInvoice.bundleId);
console.log('bundle claim', claim.remainingCalls);

const session = await bundles.createMcpSession({ macaroon: claim.macaroon });
assert.ok(session.jwt);
assert.ok(session.quoteId);
console.log('mcp session', session.expiresIn, session.remainingBudgetSats);
