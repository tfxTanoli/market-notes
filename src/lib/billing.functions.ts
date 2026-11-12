import { createServerFn } from '@tanstack/react-start';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { PLAN_IDS, type PlanId } from '@/lib/billing-plans';
import { hasPaymentIssue, hasUnlimitedAccess, pickCurrentSubscription } from '@/lib/billing-rules';

// Every function here derives the user from the verified Supabase JWT (requireSupabaseAuth) and
// acts only on that user's own Stripe customer/subscription. The client never sends a
// subscription or customer id, so it cannot act on someone else's billing.

export type BillingSubscription = {
  plan: PlanId | null;
  status: string;
  currency: string | null;
  unitAmount: number | null;
  billingInterval: string | null;
  billingIntervalCount: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  endedAt: string | null;
};

export type BillingStatus = {
  subscription: BillingSubscription | null;
  unlimited: boolean;
  paymentUrl: string | null;
};

const planInput = (input: unknown) => z.object({ plan: z.enum(PLAN_IDS) }).parse(input);

function friendly(error: unknown, fallback: string): never {
  // BillingError messages are written for users; anything else (Stripe/DB internals) is logged only.
  if (error instanceof Error && (error as { userFacing?: boolean }).userFacing === true) throw new Error(error.message);
  console.error('[billing]', error instanceof Error ? error.message : 'unknown error');
  throw new Error(fallback);
}

async function verifiedUser(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.auth.getUser();
  if (error || !data.user || data.user.id !== context.userId) throw new Error('Please sign in again.');
  return data.user;
}

export const getBillingStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingStatus> => {
    const billing = await import('@/lib/stripe.server');
    await billing.refreshStaleSubscriptions(context.userId);
    // Read through the user's own session so RLS ("Read own subscriptions") applies.
    const { data, error } = await context.supabase
      .from('subscriptions')
      .select('plan, status, currency, unit_amount, billing_interval, billing_interval_count, current_period_end, cancel_at_period_end, cancel_at, ended_at, created_at, stripe_subscription_id')
      .order('created_at', { ascending: false });
    if (error) throw new Error('Your subscription could not be loaded. Please try again.');
    const current = pickCurrentSubscription(data);
    let paymentUrl: string | null = null;
    if (current && hasPaymentIssue(current)) {
      try {
        const sub = await billing.stripe().subscriptions.retrieve(current.stripe_subscription_id, { expand: ['latest_invoice'] });
        const invoice = sub.latest_invoice;
        if (invoice && typeof invoice !== 'string' && invoice.status === 'open') paymentUrl = invoice.hosted_invoice_url ?? null;
      } catch {
        paymentUrl = null;
      }
    }
    return {
      unlimited: data.some((row) => hasUnlimitedAccess(row)),
      paymentUrl,
      subscription: current && {
        plan: (PLAN_IDS as readonly string[]).includes(current.plan ?? '') ? (current.plan as PlanId) : null,
        status: current.status,
        currency: current.currency,
        unitAmount: current.unit_amount,
        billingInterval: current.billing_interval,
        billingIntervalCount: current.billing_interval_count,
        currentPeriodEnd: current.current_period_end,
        cancelAtPeriodEnd: current.cancel_at_period_end,
        cancelAt: current.cancel_at,
        endedAt: current.ended_at,
      },
    };
  });

export const startCheckout = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(planInput)
  .handler(async ({ context, data }) => {
    const user = await verifiedUser(context);
    const billing = await import('@/lib/stripe.server');
    try {
      if (await billing.liveSubscriptionFor(user.id)) {
        throw new billing.BillingError('You already have a subscription. Manage it on this page instead of starting a new one.');
      }
      const price = billing.priceIdFor(data.plan);
      const customer = await billing.ensureCustomer(user.id, user.email);
      const origin = await billing.appOrigin();
      // Double-clicks within the same minute reuse the same Checkout Session.
      const window = Math.floor(Date.now() / 60_000);
      const session = await billing.stripe().checkout.sessions.create(
        {
          mode: 'subscription',
          customer,
          client_reference_id: user.id,
          line_items: [{ price, quantity: 1 }],
          // Always bill in GBP: don't let Stripe present/charge a converted local currency.
          adaptive_pricing: { enabled: false },
          metadata: { supabase_user_id: user.id, plan: data.plan },
          subscription_data: { metadata: { supabase_user_id: user.id, plan: data.plan } },
          success_url: `${origin}/settings/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/settings/subscriptions?checkout=cancelled`,
        },
        { idempotencyKey: `market-notes-checkout-${user.id}-${data.plan}-${window}` },
      );
      if (!session.url) throw new billing.BillingError('Checkout could not be started. Please try again.');
      return { url: session.url };
    } catch (error) {
      friendly(error, 'Checkout could not be started. Please try again.');
    }
  });

/** After Stripe redirects back: re-read the session and subscription from Stripe (never trust the URL). */
export const confirmCheckout = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{10,200}$/) }).parse(input))
  .handler(async ({ context, data }) => {
    const user = await verifiedUser(context);
    const billing = await import('@/lib/stripe.server');
    try {
      const session = await billing.stripe().checkout.sessions.retrieve(data.sessionId);
      if (session.client_reference_id !== user.id) throw new billing.BillingError('This checkout belongs to a different account.');
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (session.status === 'complete' && subscriptionId) await billing.syncSubscription(subscriptionId);
      return { complete: session.status === 'complete' };
    } catch (error) {
      friendly(error, 'We could not confirm your checkout yet. Your subscription will update shortly.');
    }
  });

export const changePlan = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(planInput)
  .handler(async ({ context, data }) => {
    const user = await verifiedUser(context);
    const billing = await import('@/lib/stripe.server');
    try {
      const current = await billing.liveSubscriptionFor(user.id);
      if (!current || !['active', 'trialing'].includes(current.status)) throw new billing.BillingError('You need an active subscription to change plans.');
      if (current.cancel_at_period_end || current.cancel_at) throw new billing.BillingError('Resume your subscription before changing plans.');
      if (current.plan === data.plan) throw new billing.BillingError('You are already on this plan.');
      const sub = await billing.stripe().subscriptions.retrieve(current.stripe_subscription_id);
      const item = sub.items.data[0];
      if (!item) throw new billing.BillingError('Your subscription could not be changed. Please try again.');
      // pending_if_incomplete: the switch only takes effect if any payment Stripe needs succeeds.
      await billing.stripe().subscriptions.update(
        sub.id,
        {
          items: [{ id: item.id, price: billing.priceIdFor(data.plan) }],
          payment_behavior: 'pending_if_incomplete',
        },
        { idempotencyKey: `market-notes-change-${sub.id}-${data.plan}-${current.stripe_synced_at}` },
      );
      await billing.syncSubscription(sub.id);
      return { success: true };
    } catch (error) {
      friendly(error, 'Your plan could not be changed. Please try again.');
    }
  });

export const cancelSubscription = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ confirmation: z.literal('CANCEL') }).parse(input))
  .handler(async ({ context }) => {
    const user = await verifiedUser(context);
    const billing = await import('@/lib/stripe.server');
    try {
      const current = await billing.liveSubscriptionFor(user.id);
      if (!current) throw new billing.BillingError('You have no subscription to cancel.');
      if (current.cancel_at_period_end) return { success: true, accessUntil: current.current_period_end };
      // Cancel at period end: no further renewals; paid access continues until the period ends.
      await billing.stripe().subscriptions.update(
        current.stripe_subscription_id,
        { cancel_at_period_end: true },
        { idempotencyKey: `market-notes-cancel-${current.stripe_subscription_id}-${current.stripe_synced_at}` },
      );
      await billing.syncSubscription(current.stripe_subscription_id);
      const updated = await billing.liveSubscriptionFor(user.id);
      return { success: true, accessUntil: updated?.cancel_at ?? updated?.current_period_end ?? current.current_period_end };
    } catch (error) {
      friendly(error, 'Your subscription could not be cancelled. Please try again.');
    }
  });

export const resumeSubscription = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const user = await verifiedUser(context);
    const billing = await import('@/lib/stripe.server');
    try {
      const current = await billing.liveSubscriptionFor(user.id);
      if (!current || !['active', 'trialing'].includes(current.status) || !current.cancel_at_period_end) {
        throw new billing.BillingError('There is no scheduled cancellation to undo.');
      }
      await billing.stripe().subscriptions.update(
        current.stripe_subscription_id,
        { cancel_at_period_end: false },
        { idempotencyKey: `market-notes-resume-${current.stripe_subscription_id}-${current.stripe_synced_at}` },
      );
      await billing.syncSubscription(current.stripe_subscription_id);
      return { success: true };
    } catch (error) {
      friendly(error, 'Your subscription could not be resumed. Please try again.');
    }
  });
