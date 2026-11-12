import { createFileRoute } from '@tanstack/react-router';
import { Settings } from '@/components/settings';

export const Route = createFileRoute('/settings')({
  head: () => ({
    meta: [
      { title: 'Settings — Market Notes' },
      { name: 'description', content: 'Manage your Market Notes account details, subscriptions and security.' },
      { property: 'og:title', content: 'Settings — Market Notes' },
      { property: 'og:description', content: 'Manage your Market Notes account details, subscriptions and security.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return <Settings />;
}