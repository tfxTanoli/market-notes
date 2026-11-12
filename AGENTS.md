<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep account identity in one root AccountProvider; private profile reads and deletion use authenticated server functions so the public notebook stays accessible.
- Provision missing profiles on the first authenticated account-details read; never add triggers to the auth schema (public tables may reference auth.users with ON DELETE CASCADE).
- Billing runs on Stripe (see docs/SUPABASE_STRIPE_SETUP.md). Paid access comes only from Stripe-verified rows in public.subscriptions, written by server code via apply_subscription_snapshot; never grant access from client state or the Checkout success URL. Cancellation keeps the two-step confirmation and uses cancel-at-period-end.
- Supabase is the user's own project (lfxikfguangsfdjliwaj), not Lovable Cloud; schema changes go in supabase/migrations.
- Enforce free-search quotas through an atomic database RPC: authenticated identity for accounts, an HTTP-only visitor cookie for guests (falling back to an HMAC-signed server-issued visitor token kept in browser storage when embedded browsers drop cookies), and UTC calendar-day resets; never grant guest clients access to usage rows or let plan selection bypass limits; verified active/trialing subscribers get daily_limit NULL (unlimited) from the same RPC.
- Visitor cookies must be Secure, SameSite=None, and Partitioned so embedded previews retain their server-issued identity without granting cross-site access.
- Account deletion revalidates the current user server-side and deletes only that identity; privileged auth access is imported inside the handler.
- Keep the settings hub on its own public route and reuse the existing account dialogs so notebook access and account safeguards stay unchanged.
