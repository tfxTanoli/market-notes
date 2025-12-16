import React from 'react';
import { TrendingUp, LogOut } from 'lucide-react';

interface HeaderProps {
    onNavigate: (page: 'home' | 'login' | 'signup') => void;
    isLoggedIn: boolean;
    onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNavigate, isLoggedIn, onLogout }) => {
  return (
    <div className="flex items-center justify-between px-6 py-4 sticky top-0 bg-[#fcfcfc]/90 backdrop-blur-sm z-10 border-b border-transparent">
      {/* Left Title */}
      <div 
        className="flex items-center gap-2 text-stone-800 cursor-pointer select-none"
        onClick={() => onNavigate('home')}
      >
         <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
            <TrendingUp className="w-5 h-5" />
         </div>
         <span className="font-semibold text-lg tracking-tight">MarketNotes</span>
      </div>

      {/* Date Pill (Kept for context, minimalist) */}
      <div className="hidden sm:block bg-stone-100 px-4 py-1 rounded-full text-stone-500 font-medium text-xs border border-stone-200/50">
        Today
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {isLoggedIn ? (
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 text-stone-500 hover:text-stone-900 transition-colors text-sm font-medium px-3 py-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        ) : (
          <>
            <button 
                onClick={() => onNavigate('login')}
                className="bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-5 py-2 rounded-full transition-all shadow-sm active:scale-95"
            >
              Log In
            </button>
            <button 
                onClick={() => onNavigate('signup')}
                className="hidden sm:block bg-white hover:bg-stone-50 text-stone-900 border border-stone-200 text-sm font-medium px-5 py-2 rounded-full transition-all shadow-sm active:scale-95"
            >
              Sign Up
            </button>
          </>
        )}
      </div>
    </div>
  );
};