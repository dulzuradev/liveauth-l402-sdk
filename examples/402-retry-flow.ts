import {
  L402Client,
  extractInvoiceFrom402,
  withL402Token,
  type L402Invoice
} from '@liveauth-labs/l402-sdk';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const publicKey = process.env.LIVEAUTH_PUBLIC_KEY;
const targetUrl = process.env.LIVEAUTH_TARGET_URL;
const baseUrl = process.env.LIVEAUTH_API_URL;

if (!publicKey || !targetUrl) {
  throw new Error('Set LIVEAUTH_PUBLIC_KEY and LIVEAUTH_TARGET_URL');
}

const l402 = new L402Client({
  publicKey,
  baseUrl
});

const firstResponse = await fetch(targetUrl);

if (firstResponse.status !== 402) {
  console.log(await firstResponse.text());
  process.exit(0);
}

const challengeBody = await firstResponse.clone().json().catch(() => null);
const invoice =
  extractInvoiceFrom402(challengeBody) ??
  await l402.createInvoice({ destination: '402-retry-example' });

await waitForManualPayment(invoice);

const token = await l402.validatePayment(invoice.paymentHash);
const paidResponse = await fetch(
  targetUrl,
  withL402Token(undefined, token.token)
);

console.log(await paidResponse.text());

async function waitForManualPayment(invoice: L402Invoice): Promise<void> {
  console.log(`Pay ${invoice.amountSats} sats:`);
  console.log(invoice.bolt11);

  const rl = createInterface({ input, output });
  await rl.question('Press Enter after the invoice is paid...');
  rl.close();
}
