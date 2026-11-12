-- Daily free-search allowances (recreated from drizzle/migrations 0000 + 0001 for the new Supabase project).
-- Guests: 3 searches per UTC day (server-issued visitor id, service role only).
-- Accounts: 5 searches per UTC day (authenticated identity).
CREATE TABLE IF NOT EXISTS public.daily_search_usage (
  identity_key text NOT NULL,
  usage_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  searches integer NOT NULL DEFAULT 0,
  PRIMARY KEY (identity_key, usage_day)
);
REVOKE ALL ON public.daily_search_usage FROM anon, authenticated;
GRANT SELECT ON public.daily_search_usage TO authenticated;
GRANT ALL ON public.daily_search_usage TO service_role;
ALTER TABLE public.daily_search_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own daily search usage" ON public.daily_search_usage;
CREATE POLICY "Read own daily search usage" ON public.daily_search_usage
  FOR SELECT TO authenticated USING (identity_key = 'account:' || auth.uid()::text);

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
    v_key := 'account:' || auth.uid()::text; v_limit := 5;
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
