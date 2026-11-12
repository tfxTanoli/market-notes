// Client-safe plan catalogue. Stripe Price IDs are NOT here: they live in server-only
// environment variables (STRIPE_PRICE_MONTHLY / _QUARTERLY / _YEARLY) and are resolved in
// src/lib/stripe.server.ts. Amounts here are for display only; Stripe charges the Price.
export const PLAN_IDS = ['monthly', 'quarterly', 'yearly'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Plan = {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  searches: string;
  saving: string;
};

export const PLANS: readonly Plan[] = [
  { id: 'monthly', name: 'Starter', price: '£10.99', period: 'every month', searches: 'Unlimited searches', saving: '' },
  { id: 'quarterly', name: 'Plus', price: '£16', period: 'every 3 months', searches: 'Unlimited searches', saving: 'Save £67.88 a year' },
  { id: 'yearly', name: 'Pro', price: '£75', period: 'every year', searches: 'Unlimited searches', saving: 'Save £56.88 a year' },
];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export function planById(id: PlanId | null | undefined): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}
