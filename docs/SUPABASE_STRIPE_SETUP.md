# Market Notes — Supabase & Stripe setup

This app is a TanStack Start (React + Vite) app with server functions, deployed on Vercel.
Supabase provides auth and Postgres; Stripe provides subscriptions.

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and in a local `.env`,
copied from `.env.example`, for development). `.env` is git-ignored — never commit it.

| Variable | Where it is used | Secret? |
| --- | --- | --- |
| `VITE_SUPABASE_PROJECT_ID` | Browser | no |
| `VITE_SUPABASE_URL` | Browser Supabase client | no |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser Supabase client | no (publishable) |
| `SUPABASE_URL` | Server | no |
| `SUPABASE_PUBLISHABLE_KEY` | Server (JWT verification client) | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only — the project's `sb_secret_…` key | **yes** |
| `VISITOR_TOKEN_SECRET` | Server — HMAC for guest search-allowance tokens | **yes** |
| `STRIPE_SECRET_KEY` | Server only | **yes** |
| `STRIPE_WEBHOOK_SECRET` | Server — `whsec_…` from the webhook endpoint | **yes** |
| `STRIPE_PRICE_MONTHLY` / `_QUARTERLY` / `_YEARLY` | Server — the only place Price IDs are configured | no |
| `APP_URL` | Server — origin for Stripe success/cancel URLs (optional) | no |
| `NITRO_PRESET` | Build — set to `vercel` on Vercel | no |

Only `VITE_*` variables reach the browser. The Stripe publishable key is not needed: the app
redirects to Stripe-hosted Checkout created on the server.

## 2. Supabase project

Project ref `lfxikfguangsfdjliwaj`. Schema lives in `supabase/migrations/` (applied in order):

1. `…051733_70ff1248…sql` — `profiles` table, RLS (own row only), `updated_at` trigger.
2. `…051745_daily_search_allowances.sql` — `daily_search_usage`, `consume_daily_search`, `peek_daily_search`.
3. `…051749_stripe_subscriptions.sql` — `billing_customers`, `subscriptions`, `stripe_webhook_events`,
   `claim_stripe_event`, `apply_subscription_snapshot`, `has_unlimited_searches`, subscription-aware quota RPCs,
   `profiles → auth.users` foreign key.
4. `…051817_x_revoke_anon_profiles.sql` — removes guest table privileges on `profiles`.

To recreate on another project: `supabase link --project-ref <ref>` then `supabase db push`,
or paste the files in order into the SQL editor.

Security model:
- RLS is enabled on every table. Signed-in users can read only their own `profiles`,
  `daily_search_usage` and `subscriptions` rows. Nobody but the service role can write billing tables.
- `billing_customers` and `stripe_webhook_events` have no client access at all.
- Quota RPCs are `SECURITY DEFINER`; guests can only be counted via the server (service role) using a
  server-issued visitor id, so clients cannot choose their identity.
- No storage buckets, views, enums or edge functions are used.

Auth settings (Dashboard → Authentication → URL Configuration) — already set:
- Site URL: `https://market-notes-silk.vercel.app`
- Redirect URLs: the production URL, Vercel preview URLs, and `http://localhost:8080/**`.

**Still to do manually — email delivery.** The project uses Supabase's built-in mailer, which is
heavily rate-limited and is not meant for real users. Configure custom SMTP
(Authentication → Emails → SMTP Settings, e.g. Resend/Postmark/SES) so password-reset and
email-change emails are delivered. "Confirm email" is currently **off** (users are signed in
immediately after sign-up); turn it on after SMTP works if you want email verification.

## 3. Migrating from the old project

The old backend was Lovable Cloud project `hydzcumonybtysokvcha`. Its database and auth users are
managed by Lovable and no credentials for them were available, so **no data was copied**:

- `daily_search_usage` — daily counters only; nothing to migrate (resets every UTC day).
- `profiles` — display names only.
- Auth users — passwords are hashed in the old project's `auth.users`; they cannot be moved by
  changing keys. Existing users must **sign up again** on the new project.

If you can export from the old project (Lovable → Cloud → database export, or a `pg_dump` of
`auth.users`, `auth.identities` and `public.profiles`), the rows can be imported into the new
project with the same UUIDs and bcrypt hashes so users keep their passwords. Ask before running
such an import — it copies personal data. The old project was not modified or deleted.

## 4. Stripe

Products and prices (test mode, created via API with lookup keys):

| Plan | Price ID | Amount | Interval | Lookup key |
| --- | --- | --- | --- | --- |
| Starter | `price_1UaqEmLKdv7PigRdxRR4oDTL` | £10.99 | every month | `market_notes_monthly` |
| Plus | `price_1UaqEnLKdv7PigRdYmZXcpxY` | £16.00 | every 3 months | `market_notes_quarterly` |
| Pro | `price_1UaqEnLKdv7PigRdU22ce3Qb` | £75.00 | every year | `market_notes_yearly` |

All three belong to product `prod_Vc4NGgufXHDmYp` ("Market Notes Unlimited"). For live mode,
create the same product/prices in live mode and put the live IDs and `sk_live_…` key in Vercel.

Checkout sessions disable Adaptive Pricing, so customers are always charged in GBP.

### Webhook endpoint

1. Stripe Dashboard (test mode) → **Developers → Webhooks → Add destination**.
2. Events from: **Your account**. API version: latest.
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Destination type: **Webhook endpoint**. URL: `https://market-notes-silk.vercel.app/api/stripe/webhook`
5. Create it, then reveal the **Signing secret** (`whsec_…`).
6. Vercel → Settings → Environment Variables → add `STRIPE_WEBHOOK_SECRET` (Sensitive,
   Production + Preview) → **Redeploy** the latest production deployment.
7. Back in Stripe, open the endpoint and use **Send test event** → `customer.subscription.updated`;
   a `200` response means signature verification works.

### How webhook handling works

- Signature verified with `STRIPE_WEBHOOK_SECRET`; unsigned or forged requests get `400`.
- Each event id is claimed in `stripe_webhook_events`; duplicates are acknowledged and skipped.
  Failures are recorded and return `500` so Stripe retries.
- The handler never trusts event payloads for state: it re-fetches the subscription from the
  Stripe API and stores that snapshot. Older snapshots never overwrite newer ones, so events
  can arrive in any order.
- If a webhook is missed, a subscription still marked active after its paid period ended is
  re-read from Stripe the next time that user searches or opens Subscriptions.

### Access rules

| Situation | Searches |
| --- | --- |
| Guest | 3 / UTC day |
| Signed in, no paid subscription | 5 / UTC day |
| Stripe status `active`/`trialing` and before `current_period_end` | Unlimited |
| Cancelled (cancel at period end), still inside paid period | Unlimited until period end |
| `past_due`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, `canceled`, or period ended | Free limits |

Enforced in Postgres (`consume_daily_search`); the UI only displays the result.

## 5. Testing (Stripe test mode)

Cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0341` (attaches, later charges fail),
`4000 0025 0000 3155` (3-D Secure). Any future expiry, any CVC.

1. Sign up → Settings → Subscriptions → select Starter/Plus/Pro → Subscribe → pay with 4242.
   You return to Subscriptions; status becomes **Active** once Stripe confirms; the notebook shows ∞.
2. Cancel checkout with the back arrow → "Checkout cancelled. You have not been charged."
3. Cancel Subscription → Keep Subscription / Esc / Go Back all leave it unchanged →
   Continue → Confirm Cancellation → "won't renew", unlimited until the period end.
4. Renewal / failure / expiry: in Stripe Dashboard → Billing → **Test clocks**, create a clock and
   a customer on it, or use the e2e approach described in the implementation report.
