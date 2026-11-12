import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link, useNavigate } from '@tanstack/react-router';
import { Settings as SettingsIcon, UserRound, CreditCard, Shield, LogOut, Loader2, ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccount } from '@/components/account-provider';
import { getAccount, deleteAccount } from '@/lib/account.functions';
import { supabase } from '@/integrations/supabase/client';
import { SubscriptionPanel } from '@/components/subscription-panel';

type Section = 'Account details' | 'Subscriptions' | 'Security';

export function SettingsLink() {
  const { user, loading } = useAccount();
  if (loading) return null;
  if (!user) return <div className="fixed right-4 top-4 z-20 flex gap-2">
    <Button asChild variant="outline" size="sm"><Link to="/settings/account" search={{ mode: 'signup' }}>Sign up</Link></Button>
    <Button asChild size="sm"><Link to="/settings/account" search={{ mode: 'login' }}>Log in</Link></Button>
  </div>;
  return <Button asChild variant="ghost" className="fixed right-4 top-4 z-20"><Link to="/settings"><SettingsIcon />Settings</Link></Button>;
}

const paths = { 'Account details': '/settings/account', Subscriptions: '/settings/subscriptions', Security: '/settings/security' } as const;

export function Settings() {
  const { user, loading } = useAccount();
  if (!loading && !user) return <main className="mx-auto min-h-screen w-full max-w-2xl px-6 pb-24 pt-6 font-display text-foreground sm:px-8">
    <Button asChild variant="ghost" className="-ml-4"><Link to="/"><ArrowLeft />Back to Market Notes</Link></Button>
    <h1 className="mt-10 text-3xl font-semibold">Sign up or log in to see Settings</h1>
    <div className="mt-6 flex gap-2">
      <Button asChild variant="outline"><Link to="/settings/account" search={{ mode: 'signup' }}>Sign up</Link></Button>
      <Button asChild><Link to="/settings/account" search={{ mode: 'login' }}>Log in</Link></Button>
    </div>
  </main>;
  return <main className="mx-auto min-h-screen w-full max-w-2xl px-6 pb-24 pt-6 font-display text-foreground sm:px-8">
    <Button asChild variant="ghost" className="-ml-4"><Link to="/"><ArrowLeft />Back to Market Notes</Link></Button>
    <h1 className="mt-10 text-3xl font-semibold">Settings</h1>
    <nav aria-label="Settings sections" className="mt-8 space-y-2">
      {([{ title: 'Account details', icon: UserRound }, { title: 'Subscriptions', icon: CreditCard }, { title: 'Security', icon: Shield }] as const).map(({ title, icon: Icon }) =>
        <Button asChild variant="ghost" key={title} className="h-16 w-full justify-start gap-4 px-0 text-lg hover:bg-transparent"><Link to={paths[title]}><Icon /><span className="flex-1 text-left">{title}</span><ChevronRight className="text-muted-foreground" /></Link></Button>)}
    </nav>
  </main>;
}

export function SettingsSection({ section, onDeleted, initialSignup = false, checkout, sessionId }: { section: Section; onDeleted: () => void; initialSignup?: boolean; checkout?: 'success' | 'cancelled' | undefined; sessionId?: string | undefined }) {
  const [signup, setSignup] = useState(initialSignup);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleteStep, setDeleteStep] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const { user, loading } = useAccount();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getAccount);
  const removeAccount = useServerFn(deleteAccount);
  const account = useQuery({ queryKey: ['account', user?.id], queryFn: () => fetchAccount(), enabled: Boolean(user) && section === 'Account details' });

  function reset() { setError(''); setMessage(''); setDeleteStep(false); setConfirmation(''); }
  async function signOut() {
    await queryClient.cancelQueries(); queryClient.clear();
    await supabase.auth.signOut();
  }
  async function authenticate(form: HTMLFormElement) {
    setBusy(true); setError(''); setMessage('');
    const fields = new FormData(form);
    const email = String(fields.get('email') ?? '').trim();
    const password = String(fields.get('password') ?? '');
    try {
      const result = signup
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { display_name: String(fields.get('name') ?? '').trim() } } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (result.data.session) { navigate({ to: '/' }); return; }
      if (signup) setMessage('Check your email to verify your account.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  }
  async function recover(form: HTMLFormElement | null) {
    if (!form) return;
    const email = String(new FormData(form).get('email') ?? '').trim();
    if (!email) { setError('Enter your email first, then tap Forgot password?'); return; }
    setBusy(true); setError(''); setMessage('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (resetError) setError(resetError.message); else setMessage('Check your email for a link to choose a new password.');
  }
  async function destroy() {
    setBusy(true); setError('');
    try {
      await removeAccount({ data: { confirmation: 'DELETE' } });
      await signOut(); onDeleted(); reset();
    } catch (e) { setError(e instanceof Error ? e.message : 'Account deletion failed.'); }
    finally { setBusy(false); }
  }

  return <main className={`mx-auto min-h-screen w-full max-w-2xl px-6 pt-6 font-display text-foreground sm:px-8 ${section === 'Subscriptions' ? 'flex flex-col items-start pb-6' : 'pb-24'}`}>
      <Button asChild variant="ghost" className="-ml-4">{!loading && !user ? <Link to="/"><ArrowLeft />Back to Market Notes</Link> : <Link to="/settings"><ArrowLeft />Back to Settings</Link>}</Button>
      <h1 className="mt-10 text-3xl font-semibold">{section}</h1>
      <p className="mb-8 mt-2 text-sm text-muted-foreground">{section === 'Subscriptions' ? 'Unlimited searches with any plan. Billed securely by Stripe.' : section === 'Security' ? 'Manage your account security.' : 'Your Market Notes account.'}</p>
      <div className="w-full max-w-md space-y-4">
        {section === 'Subscriptions' ? <SubscriptionPanel checkout={checkout} sessionId={sessionId} /> : loading ? <Loader2 className="size-5 animate-spin" aria-label="Loading account" /> : !user ? <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Sign in to {section === 'Security' ? 'manage your account.' : 'see your name and email.'}</p>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void authenticate(event.currentTarget); }}>
            {signup && <label className="block space-y-2 text-sm"><span>Name</span><Input name="name" autoComplete="name" maxLength={100} required /></label>}
            <label className="block space-y-2 text-sm"><span>Email</span><Input name="email" type="email" autoComplete="email" required /></label>
            <div className="space-y-2 text-sm"><div className="flex items-center justify-between"><label htmlFor="auth-password">Password</label>{!signup && <Button type="button" variant="link" className="h-auto px-0 text-sm" onClick={(event) => void recover(event.currentTarget.closest('form'))}>Forgot password?</Button>}</div><Input id="auth-password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={8} required /></div>
            <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="animate-spin" />}{signup ? 'Sign up' : 'Sign in'}</Button>
          </form>
          <Button variant="link" className="h-auto px-0" onClick={() => { setSignup(!signup); setError(''); setMessage(''); }}>{signup ? 'Already have an account? Sign in' : 'Create an account'}</Button>
        </div> : section === 'Account details' ? <div className="space-y-5">
{account.isPending ? <Loader2 className="size-5 animate-spin" aria-label="Loading details" /> : account.isError ? <><p role="alert" className="text-sm text-destructive">Account details could not be loaded.</p><Button variant="outline" onClick={() => account.refetch()}>Try again</Button></> : <form key={`${account.data.name}|${account.data.email}`} className="space-y-4" onSubmit={async (event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            const name = String(fields.get('name') ?? '').trim().slice(0, 100);
            const email = String(fields.get('email') ?? '').trim();
            setBusy(true); setError(''); setMessage('');
            try {
              const notes: string[] = [];
              if (name !== account.data.name) {
                const { error: nameError } = await supabase.from('profiles').upsert({ id: user.id, display_name: name }, { onConflict: 'id' });
                if (nameError) throw new Error('Your name could not be saved.');
                notes.push('Your name has been updated.');
              }
              if (email && email !== account.data.email) {
                const { error: emailError } = await supabase.auth.updateUser({ email }, { emailRedirectTo: window.location.origin });
                if (emailError) throw emailError;
                notes.push('Check your email to confirm your new email address.');
              }
              setMessage(notes.join(' ') || 'No changes to save.');
              await account.refetch();
            } catch (e) { setError(e instanceof Error ? e.message : 'Your details could not be saved.'); }
            finally { setBusy(false); }
          }}>
            <label className="block space-y-2 text-sm"><span>Name</span><Input name="name" defaultValue={account.data.name} autoComplete="name" maxLength={100} /></label>
            <label className="block space-y-2 text-sm"><span>Email</span><Input name="email" type="email" defaultValue={account.data.email} autoComplete="email" maxLength={255} required /></label>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save changes</Button>
          </form>}
          <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); await signOut(); setBusy(false); }}><LogOut />Sign out</Button>
        </div> : <div className="space-y-4">
          <h3 className="font-semibold">Change password</h3>
          <form className="space-y-4" onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const fields = new FormData(form);
            const password = String(fields.get('newPassword') ?? '');
            setError(''); setMessage('');
            if (password !== String(fields.get('confirmPassword') ?? '')) { setError('Passwords do not match.'); return; }
            setBusy(true);
            const { error: updateError } = await supabase.auth.updateUser({ password });
            setBusy(false);
            if (updateError) setError(updateError.message); else { form.reset(); setMessage('Your password has been changed.'); }
          }}>
            <label className="block space-y-2 text-sm"><span>New password</span><Input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <label className="block space-y-2 text-sm"><span>Confirm new password</span><Input name="confirmPassword" type="password" defaultValue="" autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" minLength={8} required /></label>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Change password</Button>
          </form>
          <h3 className="pt-6 font-semibold">Delete account</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">Permanently delete your account and profile. Notes saved on this device will also be cleared. This cannot be undone.</p>
          {!deleteStep ? <Button variant="destructive" onClick={() => setDeleteStep(true)}>Delete account</Button> : <><label className="block space-y-2 text-sm"><span>Type DELETE to confirm</span><Input aria-label="Deletion confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { setDeleteStep(false); setConfirmation(''); }}>Keep account</Button><Button variant="destructive" disabled={busy || confirmation !== 'DELETE'} onClick={destroy}>{busy && <Loader2 className="animate-spin" />}Permanently delete account</Button></div></>}
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
      {section === 'Subscriptions' && <footer className="mt-auto pt-8 text-left text-xs text-muted-foreground">Market Notes doesn’t accept refunds.</footer>}
    </main>;
}