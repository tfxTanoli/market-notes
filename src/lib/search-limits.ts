export const VISITOR_DAILY_LIMIT = 3;
export const ACCOUNT_DAILY_LIMIT = 5;

// Partition visitor identity by the embedding site so an HTTPS preview iframe
// can retain its allowance without exposing the cookie to browser scripts.
export const VISITOR_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  partitioned: true,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
} as const;

export function dailyLimit(signedIn: boolean) {
  return signedIn ? ACCOUNT_DAILY_LIMIT : VISITOR_DAILY_LIMIT;
}

export function usageDay(now: Date) {
  return now.toISOString().slice(0, 10);
}

export function canSearch(used: number, signedIn: boolean) {
  return used < dailyLimit(signedIn);
}