import { L402Error } from './errors.js';
import type { L402Payer } from './types.js';

export function requirePayer(payer: L402Payer | undefined): L402Payer {
  if (!payer) {
    throw new L402Error('An L402 payer is required for automatic invoice payment.', {
      code: 'payer_required'
    });
  }

  return payer;
}

export type { L402Payer, L402PaymentResult } from './types.js';
