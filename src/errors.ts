import type { L402Invoice } from './types.js';

export class L402Error extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'L402Error';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export class PaymentRequiredError extends L402Error {
  readonly invoice: L402Invoice | undefined;
  readonly response: Response | undefined;

  constructor(
    message = 'Payment required',
    options: { invoice?: L402Invoice; response?: Response; details?: unknown } = {}
  ) {
    super(message, { status: 402, code: 'payment_required', details: options.details });
    this.name = 'PaymentRequiredError';
    this.invoice = options.invoice;
    this.response = options.response;
  }
}

export class PaymentFailedError extends L402Error {
  constructor(message = 'Payment failed', details?: unknown) {
    super(message, { code: 'payment_failed', details });
    this.name = 'PaymentFailedError';
  }
}

export class TokenValidationError extends L402Error {
  constructor(message = 'Token validation failed', options: { status?: number; details?: unknown } = {}) {
    super(message, { status: options.status, code: 'token_validation_failed', details: options.details });
    this.name = 'TokenValidationError';
  }
}

export class BundleClaimTimeoutError extends L402Error {
  constructor(message = 'Bundle claim timed out', details?: unknown) {
    super(message, { code: 'bundle_claim_timeout', details });
    this.name = 'BundleClaimTimeoutError';
  }
}

export class BundleDepletedError extends L402Error {
  constructor(message = 'Bundle depleted', details?: unknown) {
    super(message, { code: 'bundle_depleted', details });
    this.name = 'BundleDepletedError';
  }
}
