import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAccount } from '@/components/account-provider';
import { PLANS, planById, type PlanId } from '@/lib/billing-plans';
import { cancellationDate, hasPaymentIssue, hasUnlimitedAccess, statusLabel, willRenew } from '@/lib/billing-rules';
import {
  cancelSubscription,
  changePlan,
  confirmCheckout,
  getBillingStatus,
  resumeSubscription,
  startCheckout,
  type BillingSubscription,
} from '@/lib/billing.functions';

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

function formatPrice(sub: BillingSubscription) {
  if (sub.unitAmount == null || !sub.currency) return planById(sub.plan)?.price ?? '';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: sub.currency.toUpperCase() }).format(sub.unitAmount / 100);
}

function formatInterval(sub: BillingSubscription) {
  if (!sub.billingInterval) return planById(sub.plan)?.period ?? '';
  const count = sub.billingIntervalCount ?? 1;
  return count === 1 ? `every ${sub.billingInterval}` : `every ${count} ${sub.billingInterval}s`;
}

// Shape used by the shared billing rules.
const asRuleInput = (sub: BillingSubscription) => ({
  status: sub.status,
  current_period_end: sub.currentPeriodEnd,
  cancel_at_period_end: sub.cancelAtPeriodEnd,
  cancel_at: sub.cancelAt,
});

export function SubscriptionPanel({ checkout, sessionId }: { checkout?: 'success' | 'cancelled' | undefined; sessionId?: string | undefined }) {
  const { user, loading } = useAccount();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchStatus = useServerFn(getBillingStatus);
  const beginCheckout = useServerFn(startCheckout);
  const confirm = useServerFn(confirmCheckout);
  const switchPlan = useServerFn(changePlan);
  const cancel = useServerFn(cancelSubscription);
  const resume = useServerFn(resumeSubscription);

  const [selectedPlan, setSelectedPlan] = useState<PlanId | ''>('');
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // 0 = closed, 1 = first confirmation, 2 = final confirmation.
  const [cancelStep, setCancelStep] = useState<0 | 1 | 2>(0);
  const [activating, setActivating] = useState(checkout === 'success');

  const status = useQuery({
    queryKey: ['billing', user?.id],
    queryFn: () => fetchStatus(),
    enabled: Boolean(user),
    // While a completed checkout is being confirmed by Stripe's webhook, poll briefly.
    refetchInterval: activating ? 2000 : false,
  });
  const sub = status.data?.subscription ?? null;
  const rules = sub ? asRuleInput(sub) : null;
  const unlimited = status.data?.unlimited ?? false;
  const renewing = willRenew(rules);
  const cancelsOn = cancellationDate(rules);

  // Returning from Stripe Checkout. Access is granted only once Stripe confirms the subscription.
  useEffect(() => {
    if (!checkout || loading) return;
    if (checkout === 'cancelled') {
      setMessage('Checkout cancelled. You have not been charged.');
      void navigate({ to: '/settings/subscriptions', search: {}, replace: true });
      return;
    }
    if (!user) return;
    setMessage('Payment received. Confirming your subscription with Stripe…');
    if (sessionId) {
      confirm({ data: { sessionId } })
        .catch(() => undefined)
        .finally(() => void queryClient.invalidateQueries({ queryKey: ['billing', user.id] }));
    }
    void navigate({ to: '/settings/subscriptions', search: {}, replace: true });
    const timeout = setTimeout(() => setActivating(false), 30_000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout, loading, user?.id]);

  useEffect(() => {
    if (activating && unlimited) {
      setActivating(false);
      setMessage('Your subscription is active. Enjoy unlimited searches.');
    }
  }, [activating, unlimited]);

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (user) await queryClient.invalidateQueries({ queryKey: ['billing', user.id] });
    }
  }

  const subscribe = (plan: PlanId) =>
    run(async () => {
      const result = await beginCheckout({ data: { plan } });
      if (!result?.url) throw new Error('Checkout could not be started. Please try again.');
      setRedirecting(true); // keep buttons disabled while the browser leaves for Stripe
      window.location.assign(result.url);
    });

  const change = (plan: PlanId) =>
    run(async () => {
      await switchPlan({ data: { plan } });
      setSelectedPlan('');
      setMessage(`Your plan has been changed to ${planById(plan)?.name ?? plan}.`);
    });

  const confirmCancellation = () =>
    run(async () => {
      try {
        const result = await cancel({ data: { confirmation: 'CANCEL' } });
        const until = result?.accessUntil ? ` You keep unlimited searches until ${formatDate(result.accessUntil)}.` : '';
        setMessage(`Your subscription has been cancelled and will not renew.${until}`);
      } finally {
        setCancelStep(0);
      }
    });

  const undoCancellation = () =>
    run(async () => {
      await resume();
      setMessage('Your subscription will continue to renew.');
    });

  const currentPlan = sub && hasUnlimitedAccess(rules) ? sub.plan : null;
  const selected = selectedPlan || null;
  const canSwitch = Boolean(sub && renewing && unlimited && sub.status !== 'past_due');
  const hasLiveSub = Boolean(sub && ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(sub.status));

  let primary: { label: string; onClick: () => void; disabled: boolean } | null = null;
  if (user && selected && selected !== currentPlan) {
    const name = planById(selected)?.name ?? selected;
    if (!hasLiveSub) primary = { label: redirecting ? 'Opening secure checkout…' : `Subscribe to ${name}`, onClick: () => void subscribe(selected), disabled: busy || redirecting };
    else if (canSwitch) primary = { label: `Switch to ${name}`, onClick: () => void change(selected), disabled: busy };
  }

  return (
    <div>
      {!loading && !user ? (
        <p className="mb-5 text-sm text-muted-foreground">
          Free daily search limits apply. <Link to="/settings/account" search={{ mode: 'login' }} className="font-semibold text-foreground underline underline-offset-4">Log in</Link> or{' '}
          <Link to="/settings/account" search={{ mode: 'signup' }} className="font-semibold text-foreground underline underline-offset-4">sign up</Link> to subscribe.
        </p>
      ) : status.isPending && user ? (
        <Loader2 className="mb-5 size-5 animate-spin" aria-label="Loading subscription" />
      ) : status.isError ? (
        <div className="mb-5 space-y-2">
          <p role="alert" className="text-sm text-destructive">Your subscription could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => void status.refetch()}>Try again</Button>
        </div>
      ) : sub ? (
        <section aria-label="Current subscription" className="mb-6 space-y-1 rounded-md border border-border p-4 text-sm">
          <p className="flex items-baseline justify-between gap-4">
            <span className="font-semibold">{planById(sub.plan)?.name ?? 'Subscription'}</span>
            <span className="text-right font-semibold">
              {formatPrice(sub)} <span className="font-normal text-muted-foreground">{formatInterval(sub)}</span>
            </span>
          </p>
          <p>
            Status: <span className="font-semibold">{statusLabel(rules)}</span>
          </p>
          {unlimited && renewing && sub.currentPeriodEnd && <p className="text-muted-foreground">Next billing date: {formatDate(sub.currentPeriodEnd)}</p>}
          {unlimited && cancelsOn && <p className="text-muted-foreground">Cancelled — won’t renew. Unlimited searches until {formatDate(cancelsOn)}.</p>}
          {hasPaymentIssue(rules) && (
            <p className="text-destructive">
              Your last payment didn’t go through, so free daily limits apply until it’s paid.{' '}
              {status.data?.paymentUrl && (
                <a href={status.data.paymentUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
                  Pay outstanding invoice
                </a>
              )}
            </p>
          )}
          {!unlimited && !hasLiveSub && <p className="text-muted-foreground">Free daily search limits apply. Choose a plan to subscribe again.</p>}
        </section>
      ) : (
        <p className="mb-5 text-sm text-muted-foreground">No active subscription. Free daily search limits apply.</p>
      )}

      <div className="divide-y divide-border">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <button
              type="button"
              key={plan.id}
              aria-pressed={selectedPlan === plan.id}
              disabled={busy || redirecting}
              onClick={() => {
                setSelectedPlan(plan.id);
                setError('');
                setMessage('');
              }}
              className={`flex w-full items-start justify-between gap-4 rounded-md px-3 py-4 text-left transition-colors hover:bg-muted disabled:opacity-60 ${selectedPlan === plan.id ? 'bg-muted ring-2 ring-foreground' : ''}`}
            >
              <div>
                <h3 className="font-semibold">
                  {plan.name}
                  {isCurrent && <span className="ml-2 rounded-sm bg-foreground px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-background">Current plan</span>}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.searches}</p>
                {plan.saving && <p className="mt-1 text-sm font-bold">{plan.saving}</p>}
              </div>
              <p className="shrink-0 text-right font-semibold">
                {plan.price}
                <span className="block text-xs font-normal text-muted-foreground">{plan.period}</span>
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-3">
        {!user && !loading && selected && (
          <Button asChild className="w-full">
            <Link to="/settings/account" search={{ mode: 'login' }}>Log in to subscribe</Link>
          </Button>
        )}
        {user && selected && selected === currentPlan && <p className="text-sm text-muted-foreground">This is your current plan.</p>}
        {user && selected && selected !== currentPlan && hasLiveSub && !canSwitch && (
          <p className="text-sm text-muted-foreground">
            {cancelsOn ? 'Resume your subscription to change plans.' : 'Plan changes are available once your subscription is active and paid.'}
          </p>
        )}
        {primary && (
          <Button className="w-full" disabled={primary.disabled} onClick={primary.onClick}>
            {(busy || redirecting) && <Loader2 className="animate-spin" />}
            {primary.label}
          </Button>
        )}
        {user && sub && renewing && ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status) && (
          <Button variant="link" className="h-auto px-0 text-destructive" disabled={busy} onClick={() => setCancelStep(1)}>
            Cancel Subscription
          </Button>
        )}
        {user && sub && unlimited && sub.cancelAtPeriodEnd && (
          <Button variant="outline" disabled={busy} onClick={() => void undoCancellation()}>
            {busy && <Loader2 className="animate-spin" />}Keep my subscription
          </Button>
        )}
        {activating && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Waiting for Stripe to confirm your payment…
          </p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>

      {/* Step 1: first confirmation. Closing or "Keep Subscription" changes nothing. */}
      <AlertDialog open={cancelStep === 1} onOpenChange={(open) => { if (!open && !busy) setCancelStep(0); }}>
        <AlertDialogContent className="font-display">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You’re about to cancel your {planById(sub?.plan)?.name ?? ''} subscription. Nothing changes until you confirm on the next step.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setCancelStep(0)}>Keep Subscription</Button>
            <Button variant="destructive" onClick={() => setCancelStep(2)}>Continue to Cancellation</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2: final confirmation. Only "Confirm Cancellation" contacts the server. */}
      <AlertDialog open={cancelStep === 2} onOpenChange={(open) => { if (!open && !busy) setCancelStep(0); }}>
        <AlertDialogContent className="font-display">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm cancellation</AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will not renew. You keep unlimited searches until {sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : 'the end of your current billing period'}, then
              free daily limits apply (5 searches a day). Market Notes doesn’t give refunds for the current period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setCancelStep(1)}>Go Back</Button>
            <Button variant="destructive" disabled={busy} onClick={() => void confirmCancellation()}>
              {busy && <Loader2 className="animate-spin" />}Confirm Cancellation
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
