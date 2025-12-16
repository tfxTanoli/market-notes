import React from 'react';
import { History, Zap, Settings } from 'lucide-react';

interface FooterProps {
  activeTab: 'current' | 'history' | 'settings';
  onTabChange: (tab: 'current' | 'history' | 'settings') => void;
}

export const Footer: React.FC<FooterProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-100 pb-safe z-20">
      <div className="max-w-2xl mx-auto flex items-center justify-around py-2 px-4">
        
        <button 
          onClick={() => onTabChange('history')}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200 w-24 ${
            activeTab === 'history' 
              ? 'text-stone-900' 
              : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
          }`}
        >
          <History className={`w-6 h-6 ${activeTab === 'history' ? 'stroke-[2.5px]' : 'stroke-2'}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wide">Previous</span>
        </button>

        <button 
          onClick={() => onTabChange('current')}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200 w-24 ${
            activeTab === 'current' 
              ? 'text-indigo-600' 
              : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
          }`}
        >
           <div className={`relative ${activeTab === 'current' ? '-mt-1 mb-1' : ''}`}>
             <div className={`absolute inset-0 bg-indigo-100 blur-lg rounded-full opacity-0 transition-opacity ${activeTab === 'current' ? 'opacity-100' : ''}`} />
             <Zap className={`relative z-10 w-6 h-6 ${activeTab === 'current' ? 'stroke-[2.5px] fill-indigo-100' : 'stroke-2'}`} />
           </div>
          <span className="text-[10px] font-semibold uppercase tracking-wide">Current</span>
        </button>

        <button 
          onClick={() => onTabChange('settings')}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200 w-24 ${
            activeTab === 'settings' 
              ? 'text-stone-900' 
              : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
          }`}
        >
          <Settings className={`w-6 h-6 ${activeTab === 'settings' ? 'stroke-[2.5px]' : 'stroke-2'}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wide">Settings</span>
        </button>

      </div>
    </div>
  );
};