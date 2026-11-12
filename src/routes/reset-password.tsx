import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/reset-password')({
  head: () => ({
    meta: [
      { title: 'Choose a new password — Market Notes' },
      { name: 'description', content: 'Set a new password for your Market Notes account.' },
      { property: 'og:title', content: 'Choose a new password — Market Notes' },
      { property: 'og:description', content: 'Set a new password for your Market Notes account.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && alive) setRecovering(true);
    });
    if (window.location.hash.includes('type=recovery')) setRecovering(true);
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  async function choose(form: HTMLFormElement) {
    const fields = new FormData(form);
    const password = String(fields.get('password') ?? '');
    setError(''); setMessage('');
    if (password !== String(fields.get('confirm') ?? '')) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(updateError.message);
    else {
      setMessage('Your password has been changed. Taking you to your notes...');
      setTimeout(() => void navigate({ to: '/' }), 1500);
    }
  }

  async function sendLink(form: HTMLFormElement) {
    const email = String(new FormData(form).get('email') ?? '').trim();
    if (!email) { setError('Enter your email address first.'); return; }
    setBusy(true); setError(''); setMessage('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (resetError) setError(resetError.message); else setMessage('Check your email for a link to choose a new password.');
  }

  return <main className="mx-auto min-h-screen w-full max-w-2xl px-6 pb-24 pt-6 font-display text-foreground sm:px-8">
    <Button asChild variant="ghost" className="-ml-4"><Link to="/"><ArrowLeft />Back to Market Notes</Link></Button>
    <h1 className="mt-10 text-3xl font-semibold">Choose a new password</h1>
    <p className="mb-8 mt-2 text-sm text-muted-foreground">{recovering ? 'Pick a new password for your account.' : 'This reset link has expired or was opened in the wrong place. Send yourself a new one.'}</p>
    <div className="w-full max-w-md space-y-4">
      {recovering ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void choose(event.currentTarget); }}>
        <label className="block space-y-2 text-sm"><span>New password</span><Input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label className="block space-y-2 text-sm"><span>Confirm new password</span><Input name="confirm" type="password" defaultValue="" autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" minLength={8} required /></label>
        <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="animate-spin" />}Change password</Button>
      </form> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void sendLink(event.currentTarget); }}>
        <label className="block space-y-2 text-sm"><span>Email</span><Input name="email" type="email" autoComplete="email" required /></label>
        <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="animate-spin" />}Send reset link</Button>
      </form>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  </main>;
}
