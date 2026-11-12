import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getAccount = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.auth.getUser();
    if (error || !data.user) throw new Error('Please sign in again.');
    const profile = await context.supabase.from('profiles').select('display_name').eq('id', context.userId).maybeSingle();
    if (profile.error) throw new Error('Account details could not be loaded.');
    let name = profile.data?.display_name;
    if (name === undefined) {
      name = String(data.user.user_metadata?.['display_name'] ?? data.user.user_metadata?.['full_name'] ?? '');
      const saved = await context.supabase.from('profiles').upsert({ id: context.userId, display_name: name }, { onConflict: 'id', ignoreDuplicates: true });
      if (saved.error) throw new Error('Your profile could not be saved.');
    }
    return { name, email: data.user.email ?? '' };
  });

export const deleteAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ confirmation: z.literal('DELETE') }).parse(input))
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.auth.getUser();
    if (error || !data.user || data.user.id !== context.userId) throw new Error('Please sign in again.');
    // Never delete an account that Stripe would keep charging.
    const { liveSubscriptionFor } = await import('@/lib/stripe.server');
    const { willRenew } = await import('@/lib/billing-rules');
    const live = await liveSubscriptionFor(context.userId);
    if (live && willRenew(live)) throw new Error('Cancel your subscription in Settings → Subscriptions before deleting your account.');
    const removedProfile = await context.supabase.from('profiles').delete().eq('id', context.userId);
    if (removedProfile.error) throw new Error('Your account could not be deleted. Please try again.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const deleted = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (deleted.error) throw new Error('Your account could not be deleted. Please try again.');
    return { success: true };
  });