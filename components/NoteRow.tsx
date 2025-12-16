import React, { useRef, useEffect, useState } from 'react';
import { JournalEntry, EntryStatus } from '../types';
import { ArrowUpRight, ArrowDownRight, Minus, Search, BrainCircuit } from 'lucide-react';

interface NoteRowProps {
  entry: JournalEntry;
  onUpdateText: (id: string, text: string) => void;
  onCommit: (id: string, isAuto?: boolean) => void;
  onFocus: () => void;
  isLast: boolean;
}

export const NoteRow: React.FC<NoteRowProps> = ({ entry, onUpdateText, onCommit, onFocus, isLast }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localStatus, setLocalStatus] = useState(entry.status);
  const [thinkingStep, setThinkingStep] = useState(0);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [entry.text]);

  useEffect(() => {
    setLocalStatus(entry.status);
    // Cycle through thinking steps for visual effect when status is THINKING
    if (entry.status === EntryStatus.THINKING) {
      setThinkingStep(0);
      const interval = setInterval(() => {
        setThinkingStep(prev => (prev + 1) % 3);
      }, 800); // Change text every 800ms
      return () => clearInterval(interval);
    }
  }, [entry.status]);

  // Automatic Answer Trigger (Debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only auto-commit if typing, text is sufficient length (>3 chars)
      if (entry.status === EntryStatus.TYPING && entry.text.trim().length > 3) {
        onCommit(entry.id, true); // true = isAuto
      }
    }, 300); // 300ms for immediate feel

    return () => clearTimeout(timer);
  }, [entry.text, entry.status, entry.id, onCommit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(entry.id, false); // false = explicit commit (Enter key)
    }
  };

  const handleBlur = () => {
    // If user leaves field while typing, trigger auto-commit to save/analyze
    if (entry.text.trim().length > 0 && entry.status === EntryStatus.TYPING) {
        onCommit(entry.id, true);
    }
  };

  const getSentimentIcon = (sentiment?: string) => {
     switch (sentiment) {
      case 'positive': return <ArrowUpRight className="w-5 h-5" strokeWidth={3} />;
      case 'negative': return <ArrowDownRight className="w-5 h-5" strokeWidth={3} />;
      default: return <Minus className="w-5 h-5" strokeWidth={3} />;
    }
  };
  
  const getThinkingContent = () => {
      switch(thinkingStep) {
          case 0: return (
              <span className="text-stone-300 text-lg font-bold flex items-center gap-2 animate-pulse">
                  Thinking...
              </span>
          );
          case 1: return (
               <span className="text-stone-300 text-lg font-bold flex items-center gap-2 animate-pulse">
                  <Search className="w-4 h-4" /> Searching
              </span>
          );
          case 2: return (
               <span className="text-stone-300 text-lg font-bold flex items-center gap-2 animate-pulse">
                  <BrainCircuit className="w-4 h-4" /> Analyzing
              </span>
          );
          default: return null;
      }
  }

  return (
    <div className="flex items-start justify-between group py-4 animate-in fade-in slide-in-from-bottom-2 duration-200 border-b border-stone-50 last:border-0 relative">
      {/* Left: Input */}
      <div className="flex-grow pr-6 relative z-0">
        <textarea
          ref={textareaRef}
          value={entry.text}
          onChange={(e) => onUpdateText(entry.id, e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={handleBlur}
          placeholder="Ask about crypto or stocks..."
          className="w-full bg-transparent resize-none outline-none text-stone-800 placeholder:text-stone-300 text-xl font-medium leading-relaxed overflow-hidden py-1"
          rows={1}
          autoFocus={isLast && entry.status === EntryStatus.EMPTY}
        />
      </div>

      {/* Right: Output/Status */}
      <div className="flex-shrink-0 min-w-[120px] flex justify-end items-start pt-[6px]">
        {localStatus === EntryStatus.THINKING && (
          <div className="select-none">
            {getThinkingContent()}
          </div>
        )}

        {localStatus === EntryStatus.COMPLETED && entry.data && (
          <div className="flex items-center gap-2 transition-all duration-200 animate-in slide-in-from-right-2 fade-in text-emerald-500">
            <span className="text-xl font-bold tracking-tight whitespace-nowrap">
               {entry.data.shortAnswer.replace(/-/g, '')}
            </span>
             {/* Icon integrated blatantly */}
             {getSentimentIcon(entry.data.sentiment)}
          </div>
        )}

        {localStatus === EntryStatus.ERROR && (
          <span className="text-red-300 text-sm italic">Failed</span>
        )}
      </div>
    </div>
  );
};