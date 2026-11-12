-- Stripe subscriptions: customers, subscription snapshots, webhook idempotency,
-- and subscription-aware search allowances.
-- Only the service role (server code) writes billing data. Signed-in users may read
-- their own subscription rows; nothing billing-related is visible to guests.

-- Profiles belong to an auth user and disappear with it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_fkey') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- One Stripe customer per Market Notes account.
CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS touch_billing_customer ON public.billing_customers;
CREATE TRIGGER touch_billing_customer BEFORE UPDATE ON public.billing_customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
REVOKE ALL ON public.billing_customers FROM anon, authenticated;
GRANT ALL ON public.billing_customers TO service_role;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

-- One row per Stripe subscription. Stripe is the source of truth: rows are only ever
-- written from data fetched from the Stripe API by server code, never from client input.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_price_id text,
  plan text CHECK (plan IN ('monthly', 'quarterly', 'yearly')),
  status text NOT NULL,
  billing_interval text,
  billing_interval_count integer,
  currency text,
  unit_amount integer,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  stripe_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON public.subscriptions (stripe_customer_id);
DROP TRIGGER IF EXISTS touch_subscription ON public.subscriptions;
CREATE TRIGGER touch_subscription BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own subscriptions" ON public.subscriptions;
CREATE POLICY "Read own subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Webhook idempotency ledger.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Claim an event for processing. Returns false when it was already processed or another
-- delivery is processing it right now; failed or stale (5 min) claims are retried.
CREATE OR REPLACE FUNCTION public.claim_stripe_event(p_event_id text, p_event_type text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claimed text;
BEGIN
  INSERT INTO public.stripe_webhook_events AS e (id, type)
  VALUES (p_event_id, p_event_type)
  ON CONFLICT (id) DO UPDATE
    SET status = 'processing', attempts = e.attempts + 1, received_at = now(), last_error = NULL
    WHERE e.status = 'failed' OR (e.status = 'processing' AND e.received_at < now() - interval '5 minutes')
  RETURNING id INTO v_claimed;
  RETURN v_claimed IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text) TO service_role;

-- Store a subscription snapshot fetched from Stripe. A snapshot fetched earlier never
-- overwrites one fetched later, so out-of-order webhook deliveries cannot regress state.
-- A subscription can never be moved to a different user.
CREATE OR REPLACE FUNCTION public.apply_subscription_snapshot(p_row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.subscriptions;
BEGIN
  r := jsonb_populate_record(NULL::public.subscriptions, p_row);
  INSERT INTO public.subscriptions AS s (
    user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan, status,
    billing_interval, billing_interval_count, currency, unit_amount,
    current_period_start, current_period_end, cancel_at_period_end, cancel_at,
    canceled_at, ended_at, stripe_synced_at
  ) VALUES (
    r.user_id, r.stripe_customer_id, r.stripe_subscription_id, r.stripe_price_id, r.plan, r.status,
    r.billing_interval, r.billing_interval_count, r.currency, r.unit_amount,
    r.current_period_start, r.current_period_end, COALESCE(r.cancel_at_period_end, false), r.cancel_at,
    r.canceled_at, r.ended_at, COALESCE(r.stripe_synced_at, now())
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    billing_interval = EXCLUDED.billing_interval,
    billing_interval_count = EXCLUDED.billing_interval_count,
    currency = EXCLUDED.currency,
    unit_amount = EXCLUDED.unit_amount,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    cancel_at = EXCLUDED.cancel_at,
    canceled_at = EXCLUDED.canceled_at,
    ended_at = EXCLUDED.ended_at,
    stripe_synced_at = EXCLUDED.stripe_synced_at
  WHERE s.user_id = EXCLUDED.user_id AND s.stripe_synced_at <= EXCLUDED.stripe_synced_at;
END; $$;
REVOKE ALL ON FUNCTION public.apply_subscription_snapshot(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_snapshot(jsonb) TO service_role;

-- Paid access follows Stripe: only active/trialing subscriptions inside their paid period
-- unlock unlimited searches. past_due, unpaid, incomplete, incomplete_expired, paused and
-- canceled subscriptions fall back to the free allowance.
CREATE OR REPLACE FUNCTION public.has_unlimited_searches(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  );
$$;
REVOKE ALL ON FUNCTION public.has_unlimited_searches(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_unlimited_searches(uuid) TO service_role;

-- Subscription-aware allowances. Same signatures as before; daily_limit is NULL (unlimited)
-- for verified subscribers. Guests and free accounts keep 3 and 5 searches per UTC day.
CREATE OR REPLACE FUNCTION public.consume_daily_search(p_visitor_id uuid DEFAULT NULL)
RETURNS TABLE(allowed boolean, used integer, daily_limit integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key text;
  v_limit integer;
  v_used integer;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_key := 'account:' || auth.uid()::text;
    IF public.has_unlimited_searches(auth.uid()) THEN
      v_used := COALESCE((SELECT searches FROM public.daily_search_usage WHERE identity_key = v_key AND usage_day = v_day), 0);
      RETURN QUERY SELECT true, v_used, NULL::integer;
      RETURN;
    END IF;
    v_limit := 5;
  ELSIF auth.role() = 'service_role' AND p_visitor_id IS NOT NULL THEN
    v_key := 'visitor:' || p_visitor_id::text;
    v_limit := 3;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.daily_search_usage AS usage (identity_key, usage_day, searches)
  VALUES (v_key, v_day, 1)
  ON CONFLICT (identity_key, usage_day) DO UPDATE
  SET searches = usage.searches + 1
  WHERE usage.searches < v_limit
  RETURNING searches INTO v_used;
  IF v_used IS NULL THEN
    SELECT searches INTO v_used FROM public.daily_search_usage WHERE identity_key = v_key AND usage_day = v_day;
    RETURN QUERY SELECT false, v_used, v_limit;
  ELSE
    RETURN QUERY SELECT true, v_used, v_limit;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_daily_search(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_daily_search(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.peek_daily_search(p_visitor_id uuid DEFAULT NULL)
RETURNS TABLE(used integer, daily_limit integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_key text; v_limit integer; v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_key := 'account:' || auth.uid()::text;
    v_limit := CASE WHEN public.has_unlimited_searches(auth.uid()) THEN NULL ELSE 5 END;
  ELSIF auth.role() = 'service_role' AND p_visitor_id IS NOT NULL THEN
    v_key := 'visitor:' || p_visitor_id::text; v_limit := 3;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT COALESCE((SELECT searches FROM public.daily_search_usage WHERE identity_key = v_key AND usage_day = v_day), 0), v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.peek_daily_search(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.peek_daily_search(uuid) TO authenticated, service_role;
