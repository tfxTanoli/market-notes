import { createFileRoute } from '@tanstack/react-router';
import { SettingsSection } from '@/components/settings';

export const Route = createFileRoute('/settings_/account')({
  validateSearch: (search: Record<string, unknown>): { mode: 'signup' | 'login' } => ({ mode: search['mode'] === 'signup' ? 'signup' : 'login' }),
  head: () => ({
    meta: [
      { title: 'Account details — Market Notes' },
      { name: 'description', content: 'Your Market Notes name and email.' },
      { property: 'og:title', content: 'Account details — Market Notes' },
      { property: 'og:description', content: 'Your Market Notes name and email.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { mode } = Route.useSearch();
  return <SettingsSection key={mode} initialSignup={mode === 'signup'} section="Account details" onDeleted={() => localStorage.removeItem('market-notes:v1')} />;
}
