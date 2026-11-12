-- Guests never read profiles; RLS already hides rows, this also removes the table privileges.
REVOKE ALL ON public.profiles FROM anon;
