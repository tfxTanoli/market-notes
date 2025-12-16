import React from 'react';
import { Lock } from 'lucide-react';

interface LimitDialogProps {
  onLogin: () => void;
  onSignUp: () => void;
  onClose: () => void;
  title?: string;
  message?: string;
}

export const LimitDialog: React.FC<LimitDialogProps> = ({ 
  onLogin, 
  onSignUp, 
  onClose,
  title = "Unlock Unlimited Access",
  message = "You've used your 3 free searches. Create an account to unlock unlimited market insights and automatically save your research."
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center border border-stone-100 transform transition-all scale-100 animate-in zoom-in-95 duration-200">
        <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-900">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-stone-900 mb-2">{title}</h2>
        <p className="text-stone-500 mb-8 leading-relaxed">
          {message}
        </p>
        <div className="flex flex-col gap-3">
          <button 
            onClick={onSignUp} 
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3.5 rounded-xl transition-all active:scale-[0.98]"
          >
            Create Free Account
          </button>
          <button 
            onClick={onLogin} 
            className="w-full bg-white hover:bg-stone-50 text-stone-900 border border-stone-200 font-semibold py-3.5 rounded-xl transition-all active:scale-[0.98]"
          >
            Log In
          </button>
          <button 
            onClick={onClose} 
            className="text-stone-400 text-sm hover:text-stone-600 mt-2 font-medium"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};