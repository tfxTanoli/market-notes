import { createFileRoute } from '@tanstack/react-router';
import { SettingsSection } from '@/components/settings';

type SubscriptionsSearch = { checkout?: 'success' | 'cancelled'; session_id?: string };

export const Route = createFileRoute('/settings_/subscriptions')({
  // Stripe Checkout returns here with ?checkout=success&session_id=… or ?checkout=cancelled.
  // These only trigger a server-side re-check with Stripe; they never grant access by themselves.
  validateSearch: (search: Record<string, unknown>): SubscriptionsSearch => {
    const out: SubscriptionsSearch = {};
    if (search['checkout'] === 'success' || search['checkout'] === 'cancelled') out.checkout = search['checkout'];
    const id = search['session_id'];
    if (typeof id === 'string' && /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) out.session_id = id;
    return out;
  },
  head: () => ({
    meta: [
      { title: 'Subscriptions — Market Notes' },
      { name: 'description', content: 'Market Notes Starter, Plus and Pro plans with unlimited searches.' },
      { property: 'og:title', content: 'Subscriptions — Market Notes' },
      { property: 'og:description', content: 'Market Notes Starter, Plus and Pro plans with unlimited searches.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { checkout, session_id } = Route.useSearch();
  return <SettingsSection section="Subscriptions" checkout={checkout} sessionId={session_id} onDeleted={() => localStorage.removeItem('market-notes:v1')} />;
}
