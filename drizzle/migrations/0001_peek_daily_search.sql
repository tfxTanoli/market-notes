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
REVOKE ALL ON FUNCTION public.peek_daily_search(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.peek_daily_search(uuid) TO authenticated, service_role;