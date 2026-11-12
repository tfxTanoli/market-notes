// Pure subscription rules shared by server code, UI and tests.
// The database function public.has_unlimited_searches applies the same entitlement rule.

/** Stripe statuses that grant paid access while inside the paid period. */
export const ENTITLED_STATUSES = ['active', 'trialing'] as const;

/** Statuses for which the user still has a live Stripe subscription that may renew or recover. */
export const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'] as const;

/** Statuses where an outstanding invoice can be paid to recover the subscription. */
export const PAYMENT_ISSUE_STATUSES = ['past_due', 'unpaid', 'incomplete'] as const;

export type SubscriptionLike = {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancel_at?: string | null;
};

const includes = (list: readonly string[], value: string) => list.includes(value);

/** Unlimited searches only for a verified active/trialing subscription inside its paid period. */
export function hasUnlimitedAccess(sub: SubscriptionLike | null | undefined, now: Date = new Date()): boolean {
  if (!sub || !includes(ENTITLED_STATUSES, sub.status)) return false;
  if (!sub.current_period_end) return true;
  return new Date(sub.current_period_end).getTime() > now.getTime();
}

export function isLive(sub: SubscriptionLike | null | undefined): boolean {
  return Boolean(sub && includes(LIVE_STATUSES, sub.status));
}

/** A subscription that will charge again unless the user cancels it. */
export function willRenew(sub: SubscriptionLike | null | undefined): boolean {
  return Boolean(sub && isLive(sub) && sub.status !== 'incomplete' && !sub.cancel_at_period_end && !sub.cancel_at);
}

export function hasPaymentIssue(sub: SubscriptionLike | null | undefined): boolean {
  return Boolean(sub && includes(PAYMENT_ISSUE_STATUSES, sub.status));
}

/** When a cancellation takes effect: Stripe's cancel_at, else the end of the paid period. */
export function cancellationDate(sub: SubscriptionLike | null | undefined): string | null {
  if (!sub) return null;
  if (sub.cancel_at) return sub.cancel_at;
  return sub.cancel_at_period_end ? sub.current_period_end : null;
}

/** Pick the subscription to show: the newest live one, otherwise the newest of any status. */
export function pickCurrentSubscription<T extends SubscriptionLike & { created_at: string }>(rows: readonly T[]): T | null {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted.find((row) => isLive(row)) ?? sorted[0] ?? null;
}

export function statusLabel(sub: SubscriptionLike | null | undefined, now: Date = new Date()): string {
  if (!sub) return 'No active subscription';
  if (hasUnlimitedAccess(sub, now)) return cancellationDate(sub) ? 'Active — cancellation scheduled' : 'Active';
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return 'Expired';
    case 'past_due':
      return 'Payment failed — past due';
    case 'unpaid':
      return 'Unpaid';
    case 'incomplete':
      return 'Payment incomplete';
    case 'incomplete_expired':
      return 'Payment not completed';
    case 'paused':
      return 'Paused';
    case 'canceled':
      return 'Ended';
    default:
      return sub.status;
  }
}
