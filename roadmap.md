# Settings
- [x] Fix and verify visitor allowance persistence in embedded previews, fourth-search blocking, dismissal, and reload.
- [x] Enforce 3 daily visitor searches and 5 daily account searches.
- [x] Add dismissible limit pop-ups with account and plan links.
- [x] Test allowance rules and visitor flow on desktop and mobile.
- [ ] Verify signed-in five-search flow; blocked by no available requesting-user account session.
- [x] Save user profiles and support sign-in.
- [x] Add top-right settings with account details, display-only monthly plans, and double-confirmation cancellation preview.
- [x] Add secure account deletion and verify settings flows.

# Billing
- [x] Move Supabase to the owner's project and recreate schema, RLS and RPCs.
- [x] Stripe Checkout for Starter (£10.99/month), Plus (£16/3 months), Pro (£75/year) in GBP.
- [x] Signed, idempotent Stripe webhooks syncing subscription state from the Stripe API.
- [x] Unlimited searches for verified active subscribers; free limits otherwise.
- [x] In-app plan display, plan switching, double-confirmation cancel-at-period-end, resume.
- [ ] Configure custom SMTP in Supabase so password-reset/verification emails reach real users.
