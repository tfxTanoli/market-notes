// Stripe webhook processing. Server-only: loaded from src/routes/api/stripe/webhook.ts.
import type Stripe from 'stripe';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { linkCustomer, stripe, syncSubscription, webCrypto } from '@/lib/stripe.server';

export const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === 'string' ? value : value?.id ?? null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Error text safe to log/store: no payment details, emails or secrets — just a short message. */
function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'unknown error';
  return message.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').slice(0, 300);
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // Current API versions use invoice.parent; endpoints pinned to older versions send invoice.subscription.
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  return idOf(invoice.parent?.subscription_details?.subscription ?? legacy ?? null);
}

async function processEvent(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription') return 'ignored: not a subscription checkout';
      const userId = session.client_reference_id ?? session.metadata?.['supabase_user_id'] ?? null;
      const customerId = idOf(session.customer);
      if (userId && UUID_RE.test(userId) && customerId) await linkCustomer(userId, customerId);
      const subscriptionId = idOf(session.subscription);
      if (!subscriptionId) return 'ignored: no subscription on session';
      return (await syncSubscription(subscriptionId)).status;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return (await syncSubscription(event.data.object.id)).status;
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const subscriptionId = subscriptionIdFromInvoice(event.data.object);
      if (!subscriptionId) return 'ignored: invoice has no subscription';
      return (await syncSubscription(subscriptionId)).status;
    }
    default:
      return 'ignored';
  }
}

export async function handleStripeWebhook(request: Request): Promise<Response> {
  const secret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return json({ error: 'Webhook not configured' }, 500);
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Missing Stripe-Signature header' }, 400);

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(payload, signature, secret, undefined, webCrypto());
  } catch {
    console.warn('[stripe-webhook] rejected request with an invalid signature');
    return json({ error: 'Invalid signature' }, 400);
  }

  if (!HANDLED_EVENTS.has(event.type)) return json({ received: true, ignored: event.type });

  const claim = await supabaseAdmin.rpc('claim_stripe_event', { p_event_id: event.id, p_event_type: event.type });
  if (claim.error) {
    console.error(`[stripe-webhook] ${event.id} ${event.type}: could not record event (${claim.error.code})`);
    return json({ error: 'Temporary failure' }, 500);
  }
  if (!claim.data) return json({ received: true, duplicate: true });

  try {
    const outcome = await processEvent(event);
    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', event.id);
    console.info(`[stripe-webhook] ${event.id} ${event.type}: ${outcome}`);
    return json({ received: true });
  } catch (error) {
    const message = safeMessage(error);
    console.error(`[stripe-webhook] ${event.id} ${event.type} failed: ${message}`);
    await supabaseAdmin.from('stripe_webhook_events').update({ status: 'failed', last_error: message }).eq('id', event.id);
    // Non-2xx makes Stripe retry with backoff; reprocessing is safe because state is re-read from Stripe.
    return json({ error: 'Processing failed' }, 500);
  }
}
