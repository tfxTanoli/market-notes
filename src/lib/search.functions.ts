import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { VISITOR_COOKIE_OPTIONS } from '@/lib/search-limits';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Unlimited searches are decided inside the database RPC from Stripe-verified subscription rows.
// Before checking, re-read any subscription whose paid period has lapsed in case a webhook was missed.
async function refreshSubscription(userId: string) {
  const { refreshStaleSubscriptions } = await import('@/lib/stripe.server');
  await refreshStaleSubscriptions(userId);
}

export const consumeAccountSearch = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await refreshSubscription(context.userId);
    const { data, error } = await context.supabase.rpc('consume_daily_search', {});
    if (error || !data?.[0]) throw new Error('Your search allowance could not be checked. Please try again.');
    return data[0];
  });

function toBase64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function signingKey() {
  const secret = process.env['VISITOR_TOKEN_SECRET'];
  if (!secret) throw new Error('Your search allowance could not be checked. Please try again.');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signVisitor(visitorId: string) {
  const sig = await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(visitorId));
  return `${visitorId}.${toBase64Url(sig)}`;
}

async function verifyVisitorToken(token: unknown) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [visitorId, sig] = token.split('.');
  if (!visitorId || !sig || !UUID_RE.test(visitorId)) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await signingKey(), fromBase64Url(sig), new TextEncoder().encode(visitorId));
    return ok ? visitorId : null;
  } catch {
    return null;
  }
}

// Identity comes from the HTTP-only cookie, or — in browsers that block
// cookies inside embedded previews (e.g. Safari) — from a server-signed
// token the browser keeps. Unsigned or forged identities are never accepted.
async function resolveVisitor(token: string | undefined) {
  const { getCookie, setCookie } = await import('@tanstack/react-start/server');
  const cookie = getCookie('market-notes-visitor');
  const fromCookie = cookie && UUID_RE.test(cookie) ? cookie : null;
  const visitorId = fromCookie ?? (await verifyVisitorToken(token)) ?? crypto.randomUUID();
  if (visitorId !== cookie) setCookie('market-notes-visitor', visitorId, VISITOR_COOKIE_OPTIONS);
  return visitorId;
}

const tokenInput = (input: { token?: string | undefined } | undefined) => ({
  token: typeof input?.token === 'string' ? input.token : undefined,
});

export const peekAccountSearch = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await refreshSubscription(context.userId);
    const { data, error } = await context.supabase.rpc('peek_daily_search', {});
    if (error || !data?.[0]) throw new Error('Could not load remaining searches.');
    return data[0];
  });

export const peekVisitorSearch = createServerFn({ method: 'POST' })
  .inputValidator(tokenInput)
  .handler(async ({ data: input }) => {
    const visitorId = await resolveVisitor(input.token);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.rpc('peek_daily_search', { p_visitor_id: visitorId });
    if (error || !data?.[0]) throw new Error('Could not load remaining searches.');
    return { ...data[0], token: await signVisitor(visitorId) };
  });

export const consumeVisitorSearch = createServerFn({ method: 'POST' })
  .inputValidator(tokenInput)
  .handler(async ({ data: input }) => {
    const visitorId = await resolveVisitor(input.token);
    // The database fixes the guest limit to 3 and atomically checks and increments it.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.rpc('consume_daily_search', { p_visitor_id: visitorId });
    if (error || !data?.[0]) throw new Error('Your search allowance could not be checked. Please try again.');
    return { ...data[0], token: await signVisitor(visitorId) };
  });
