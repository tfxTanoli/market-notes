import { createFileRoute } from '@tanstack/react-router';
import { SettingsSection } from '@/components/settings';

export const Route = createFileRoute('/settings_/security')({
  head: () => ({
    meta: [
      { title: 'Security — Market Notes' },
      { name: 'description', content: 'Manage your Market Notes account security.' },
      { property: 'og:title', content: 'Security — Market Notes' },
      { property: 'og:description', content: 'Manage your Market Notes account security.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: () => <SettingsSection section="Security" onDeleted={() => localStorage.removeItem('market-notes:v1')} />,
});
