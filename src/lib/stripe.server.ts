// Server-only Stripe helpers. Never import this from client code: load it inside server
// handlers with `await import('@/lib/stripe.server')`.
import Stripe from 'stripe';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { PLAN_IDS, type PlanId } from '@/lib/billing-plans';
import { LIVE_STATUSES } from '@/lib/billing-rules';

/** Errors whose message is safe and meaningful to show to the user. */
export class BillingError extends Error {
  readonly userFacing = true;
}

let client: Stripe | undefined;

/** Stripe client pinned to the SDK's API version, using fetch so it runs on any server runtime. */
export function stripe(): Stripe {
  if (!client) {
    const key = process.env['STRIPE_SECRET_KEY'];
    if (!key) {
      console.error('[billing] STRIPE_SECRET_KEY is not configured');
      throw new BillingError('Payments are temporarily unavailable. Please try again later.');
    }
    client = new Stripe(key, {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
      appInfo: { name: 'Market Notes' },
    });
  }
  return client;
}

export const webCrypto = () => Stripe.createSubtleCryptoProvider();

// Single source of truth for Price IDs: server environment variables.
const PRICE_ENV: Record<PlanId, string> = {
  monthly: 'STRIPE_PRICE_MONTHLY',
  quarterly: 'STRIPE_PRICE_QUARTERLY',
  yearly: 'STRIPE_PRICE_YEARLY',
};

export function priceIdFor(plan: PlanId): string {
  const id = process.env[PRICE_ENV[plan]];
  if (!id) {
    console.error(`[billing] ${PRICE_ENV[plan]} is not configured`);
    throw new BillingError('This plan is temporarily unavailable. Please try again later.');
  }
  return id;
}

export function planForPrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  return PLAN_IDS.find((plan) => process.env[PRICE_ENV[plan]] === priceId) ?? null;
}

const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);
const idOf = (value: string | { id: string } | null | undefined) => (typeof value === 'string' ? value : value?.id ?? null);

/** The user's Stripe customer, created once and stored in billing_customers. */
export async function ensureCustomer(userId: string, email: string | undefined): Promise<string> {
  const existing = await supabaseAdmin.from('billing_customers').select('stripe_customer_id').eq('user_id', userId).maybeSingle();
  if (existing.error) throw new BillingError('Your billing account could not be loaded. Please try again.');
  if (existing.data) return existing.data.stripe_customer_id;

  const customer = await stripe().customers.create(
    { ...(email ? { email } : {}), metadata: { supabase_user_id: userId } },
    { idempotencyKey: `market-notes-customer-${userId}` },
  );
  const saved = await supabaseAdmin
    .from('billing_customers')
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (saved.error) throw new BillingError('Your billing account could not be saved. Please try again.');
  const stored = await supabaseAdmin.from('billing_customers').select('stripe_customer_id').eq('user_id', userId).single();
  if (stored.error) throw new BillingError('Your billing account could not be loaded. Please try again.');
  return stored.data.stripe_customer_id;
}

/** Record the customer → user link from a verified Checkout Session (webhook path). */
export async function linkCustomer(userId: string, customerId: string) {
  const saved = await supabaseAdmin
    .from('billing_customers')
    .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (saved.error && saved.error.code !== '23503' && saved.error.code !== '23505') throw new Error(`billing_customers upsert failed: ${saved.error.code}`);
}

async function userForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const customerId = idOf(sub.customer);
  if (customerId) {
    const row = await supabaseAdmin.from('billing_customers').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
    if (row.error) throw new Error(`billing_customers lookup failed: ${row.error.code}`);
    if (row.data) return row.data.user_id;
  }
  // Fallback for the rare case the customer link has not been stored yet.
  const fromMetadata = sub.metadata?.['supabase_user_id'];
  return fromMetadata && /^[0-9a-f-]{36}$/i.test(fromMetadata) ? fromMetadata : null;
}

export type SyncResult = { status: 'synced' | 'skipped'; reason?: string };

/**
 * Fetch the subscription's CURRENT state from Stripe and store it. Event payloads are never
 * trusted for state, so events can arrive in any order or more than once.
 */
export async function syncSubscription(subscriptionId: string): Promise<SyncResult> {
  const fetchedAt = new Date().toISOString();
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const userId = await userForSubscription(sub);
  if (!userId) return { status: 'skipped', reason: 'no Market Notes user for this customer' };

  const item = sub.items.data[0];
  const price = item?.price;
  const row = {
    user_id: userId,
    stripe_customer_id: idOf(sub.customer),
    stripe_subscription_id: sub.id,
    stripe_price_id: price?.id ?? null,
    plan: planForPrice(price?.id),
    status: sub.status,
    billing_interval: price?.recurring?.interval ?? null,
    billing_interval_count: price?.recurring?.interval_count ?? null,
    currency: price?.currency ?? sub.currency ?? null,
    unit_amount: price?.unit_amount ?? null,
    current_period_start: iso(item?.current_period_start),
    current_period_end: iso(item?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    cancel_at: iso(sub.cancel_at),
    canceled_at: iso(sub.canceled_at),
    ended_at: iso(sub.ended_at),
    stripe_synced_at: fetchedAt,
  };
  const { error } = await supabaseAdmin.rpc('apply_subscription_snapshot', { p_row: row });
  if (error?.code === '23503') return { status: 'skipped', reason: 'account no longer exists' };
  if (error) throw new Error(`apply_subscription_snapshot failed: ${error.code}`);
  return { status: 'synced' };
}

export type SubscriptionRow = {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  plan: string | null;
  status: string;
  billing_interval: string | null;
  billing_interval_count: number | null;
  currency: string | null;
  unit_amount: number | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  ended_at: string | null;
  stripe_synced_at: string;
  created_at: string;
};

const SUBSCRIPTION_COLUMNS =
  'id, user_id, stripe_subscription_id, plan, status, billing_interval, billing_interval_count, currency, unit_amount, current_period_end, cancel_at_period_end, cancel_at, ended_at, stripe_synced_at, created_at';

/** All of a user's subscriptions (service role; callers pass the authenticated user id). */
export async function subscriptionsFor(userId: string): Promise<SubscriptionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new BillingError('Your subscription could not be loaded. Please try again.');
  return data;
}

/** The user's live subscription (active, trialing, past_due, unpaid, paused or incomplete), if any. */
export async function liveSubscriptionFor(userId: string): Promise<SubscriptionRow | null> {
  const rows = await subscriptionsFor(userId);
  return rows.find((row) => (LIVE_STATUSES as readonly string[]).includes(row.status)) ?? null;
}

/**
 * Self-heal if a webhook was missed: a subscription still marked live after its paid period
 * ended is re-read from Stripe (at most once every 2 minutes per subscription).
 */
export async function refreshStaleSubscriptions(userId: string): Promise<void> {
  try {
    const now = Date.now();
    const rows = await subscriptionsFor(userId);
    const stale = rows.filter(
      (row) =>
        (LIVE_STATUSES as readonly string[]).includes(row.status) &&
        row.current_period_end !== null &&
        new Date(row.current_period_end).getTime() <= now &&
        new Date(row.stripe_synced_at).getTime() < now - 2 * 60_000,
    );
    for (const row of stale) await syncSubscription(row.stripe_subscription_id);
  } catch (error) {
    console.error('[billing] stale subscription refresh failed:', error instanceof Error ? error.message : 'unknown error');
  }
}

/** Origin for Stripe redirect URLs: APP_URL when configured, otherwise the request's own origin. */
export async function appOrigin(): Promise<string> {
  const configured = process.env['APP_URL'];
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      console.error('[billing] APP_URL is not a valid URL');
    }
  }
  const { getRequest } = await import('@tanstack/react-start/server');
  return new URL(getRequest().url).origin;
}
