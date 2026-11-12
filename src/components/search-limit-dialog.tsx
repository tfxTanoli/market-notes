import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function SearchLimitDialog({ open, signedIn, onOpenChange }: {
  open: boolean; signedIn: boolean; onOpenChange: (open: boolean) => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg font-display">
      <DialogHeader className="space-y-3 pr-5 text-left">
        <DialogTitle className="leading-snug tracking-normal">
          {signedIn ? 'You’ve ran out of 5 free searches today.' : 'You’ve ran out of 3 free searches today.'}
        </DialogTitle>
        <DialogDescription className="leading-relaxed">
          {signedIn ? 'You’ve ran out of free searches today. Come back tomorrow to get 5 free searches or upgrade your plan.' : 'Get 5 free searches a day when you log in.'}
        </DialogDescription>
      </DialogHeader>
      <div className="mt-2 flex flex-wrap gap-2">
        {signedIn ? <Button asChild className="w-full justify-center text-center"><Link to="/settings/subscriptions">Upgrade your plan</Link></Button> : <>
          <Button asChild variant="outline"><Link to="/settings/account" search={{ mode: 'signup' }}>Sign up</Link></Button>
          <Button asChild><Link to="/settings/account" search={{ mode: 'login' }}>Log in</Link></Button>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}