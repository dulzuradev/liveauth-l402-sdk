import type { L402StoredToken, L402TokenStore } from './types.js';

export class MemoryTokenStore implements L402TokenStore {
  private token: L402StoredToken | null = null;

  get(): L402StoredToken | null {
    return this.token;
  }

  set(token: L402StoredToken): void {
    this.token = token;
  }

  clear(): void {
    this.token = null;
  }
}

export function isStoredTokenFresh(token: L402StoredToken | null, nowUnix = currentUnix()): token is L402StoredToken {
  return Boolean(token && token.token && token.tokenType === 'L402' && token.expiresAtUnix > nowUnix);
}

export function currentUnix(): number {
  return Math.floor(Date.now() / 1000);
}
