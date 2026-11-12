import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { canSearch, dailyLimit, usageDay, VISITOR_COOKIE_OPTIONS } from './search-limits';

describe('daily free searches', () => {
  test('embedded previews retain a private, partitioned visitor identity', () => {
    assert.equal(VISITOR_COOKIE_OPTIONS.sameSite, 'none');
    assert.equal(VISITOR_COOKIE_OPTIONS.secure, true);
    assert.equal(VISITOR_COOKIE_OPTIONS.partitioned, true);
    assert.equal(VISITOR_COOKIE_OPTIONS.httpOnly, true);
  });
  test('visitors receive exactly 3 searches', () => {
    assert.equal(dailyLimit(false), 3);
    assert.deepEqual([0, 1, 2, 3].map((used) => canSearch(used, false)), [true, true, true, false]);
  });
  test('signed-in accounts receive exactly 5 searches', () => {
    assert.equal(dailyLimit(true), 5);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((used) => canSearch(used, true)), [true, true, true, true, true, false]);
  });
  test('a fresh UTC day has a separate allowance', () => {
    assert.equal(usageDay(new Date('2026-11-05T23:59:59Z')), '2026-11-05');
    assert.equal(usageDay(new Date('2026-11-06T00:00:00Z')), '2026-11-06');
  });
});