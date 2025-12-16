import React from 'react';
import { JournalEntry, EntryStatus } from '../types';
import { ArrowUpRight, ArrowDownRight, Minus, Calendar } from 'lucide-react';
import { AdUnit } from './AdUnit';

interface HistoryViewProps {
  entries: JournalEntry[];
}

export const HistoryView: React.FC<HistoryViewProps> = ({ entries }) => {
  // Filter only completed entries with data
  const historyItems = entries.filter(
    (e) => e.status === EntryStatus.COMPLETED && e.data
  ).reverse(); // Show newest first

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return <ArrowUpRight className="w-4 h-4 text-emerald-500" strokeWidth={2.5} />;
      case 'negative': return <ArrowDownRight className="w-4 h-4 text-rose-500" strokeWidth={2.5} />;
      default: return <Minus className="w-4 h-4 text-stone-400" strokeWidth={2.5} />;
    }
  };

  if (historyItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4 text-stone-400">
          <Calendar className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-stone-900 mb-2">No history yet</h3>
        <p className="text-stone-500">
          Your completed financial searches will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-4 animate-in slide-in-from-right duration-300">
      <h2 className="text-2xl font-bold text-stone-900 mb-6">Previous Searches</h2>
      
      <div className="grid gap-4">
        {historyItems.map((entry, index) => (
          <div 
            key={entry.id} 
            className="bg-white p-5 rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-2">
               <p className="text-stone-900 font-medium text-lg leading-snug line-clamp-2">
                 {entry.text}
               </p>
               <div className="bg-stone-50 p-2 rounded-lg ml-3">
                 {getSentimentIcon(entry.data?.sentiment)}
               </div>
            </div>
            
            <div className="flex items-center gap-2 mt-3">
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                    entry.data?.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-600' :
                    entry.data?.sentiment === 'negative' ? 'bg-rose-50 text-rose-600' :
                    'bg-stone-100 text-stone-600'
                }`}>
                    {entry.data?.shortAnswer.replace(/-/g, '')}
                </span>
            </div>
          </div>
        ))}

        {/* Ad at the bottom of history */}
        <AdUnit variant="banner" className="mt-8" />
      </div>
    </div>
  );
};