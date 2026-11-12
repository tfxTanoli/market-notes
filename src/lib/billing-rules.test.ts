import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cancellationDate, hasPaymentIssue, hasUnlimitedAccess, pickCurrentSubscription, statusLabel, willRenew } from './billing-rules.ts';
import { PLANS, isPlanId } from './billing-plans.ts';

const now = new Date('2026-11-12T12:00:00Z');
const future = '2026-12-12T12:00:00Z';
const past = '2026-11-01T12:00:00Z';
const sub = (status: string, extra: Partial<{ current_period_end: string | null; cancel_at_period_end: boolean; cancel_at: string | null }> = {}) => ({
  status,
  current_period_end: future,
  cancel_at_period_end: false,
  cancel_at: null,
  ...extra,
});

describe('plans', () => {
  test('three GBP plans with the agreed prices and intervals', () => {
    assert.deepEqual(PLANS.map((p) => [p.id, p.price, p.period]), [
      ['monthly', '£10.99', 'every month'],
      ['quarterly', '£16', 'every 3 months'],
      ['yearly', '£75', 'every year'],
    ]);
    assert.equal(isPlanId('yearly'), true);
    assert.equal(isPlanId('lifetime'), false);
    assert.equal(isPlanId(undefined), false);
  });
});

describe('subscription entitlement', () => {
  test('active and trialing subscriptions inside the paid period are unlimited', () => {
    assert.equal(hasUnlimitedAccess(sub('active'), now), true);
    assert.equal(hasUnlimitedAccess(sub('trialing'), now), true);
  });
  test('failed, incomplete, unpaid, paused and ended subscriptions are not unlimited', () => {
    for (const status of ['past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'canceled']) {
      assert.equal(hasUnlimitedAccess(sub(status), now), false, status);
    }
    assert.equal(hasUnlimitedAccess(null, now), false);
  });
  test('cancelled-at-period-end keeps access until the paid period ends', () => {
    const cancelling = sub('active', { cancel_at_period_end: true });
    assert.equal(hasUnlimitedAccess(cancelling, now), true);
    assert.equal(willRenew(cancelling), false);
    assert.equal(cancellationDate(cancelling), future);
    assert.equal(statusLabel(cancelling, now), 'Active — cancellation scheduled');
  });
  test('an expired paid period returns the user to free limits', () => {
    const expired = sub('active', { current_period_end: past, cancel_at_period_end: true });
    assert.equal(hasUnlimitedAccess(expired, now), false);
    assert.equal(statusLabel(expired, now), 'Expired');
    assert.equal(hasUnlimitedAccess(sub('canceled', { current_period_end: past }), now), false);
  });
  test('renewal and payment issue flags follow Stripe status', () => {
    assert.equal(willRenew(sub('active')), true);
    assert.equal(willRenew(sub('past_due')), true);
    assert.equal(willRenew(sub('canceled')), false);
    assert.equal(hasPaymentIssue(sub('past_due')), true);
    assert.equal(hasPaymentIssue(sub('active')), false);
    assert.equal(statusLabel(sub('past_due'), now), 'Payment failed — past due');
  });
  test('the newest live subscription is shown before older ended ones', () => {
    const rows = [
      { ...sub('canceled'), created_at: '2026-10-01T00:00:00Z', id: 'old' },
      { ...sub('active'), created_at: '2026-09-01T00:00:00Z', id: 'live' },
      { ...sub('incomplete_expired'), created_at: '2026-11-01T00:00:00Z', id: 'newest-dead' },
    ];
    assert.equal(pickCurrentSubscription(rows)?.id, 'live');
    assert.equal(pickCurrentSubscription(rows.filter((r) => r.id !== 'live'))?.id, 'newest-dead');
    assert.equal(pickCurrentSubscription([]), null);
  });
});
