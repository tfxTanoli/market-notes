export interface FinanceInfo {
  shortAnswer: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  confidenceScore: number;
}

export enum EntryStatus {
  EMPTY = 'EMPTY',
  TYPING = 'TYPING',
  THINKING = 'THINKING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface JournalEntry {
  id: string;
  text: string;
  status: EntryStatus;
  data?: FinanceInfo;
}

export interface MarketSummary {
  positive: number;
  negative: number;
  neutral: number;
}

export interface UserProfile {
  name: string;
  email: string;
}