import { createFileRoute } from '@tanstack/react-router';

// Stripe webhook endpoint: POST /api/stripe/webhook
// Signature verification and processing live in a server-only module loaded on demand.
export const Route = createFileRoute('/api/stripe/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleStripeWebhook } = await import('@/lib/stripe-webhook.server');
        return handleStripeWebhook(request);
      },
    },
  },
});
