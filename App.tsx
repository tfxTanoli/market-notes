import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { NoteRow } from './components/NoteRow';
import { Footer } from './components/Footer';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { LoginPage } from './components/LoginPage';
import { SignUpPage } from './components/SignUpPage';
import { LimitDialog } from './components/LimitDialog';
import { AdUnit } from './components/AdUnit';
import { JournalEntry, EntryStatus, UserProfile } from './types';
import { analyzeFinanceEntry } from './services/geminiService';

// Workaround for missing uuid
const generateId = () => Math.random().toString(36).substr(2, 9);

const INITIAL_ENTRY: JournalEntry = {
  id: generateId(),
  text: '',
  status: EntryStatus.EMPTY,
};

type ViewState = 'home' | 'login' | 'signup';
type TabState = 'current' | 'history' | 'settings';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('home');
  const [activeTab, setActiveTab] = useState<TabState>('current');
  
  const [entries, setEntries] = useState<JournalEntry[]>([INITIAL_ENTRY]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [searchCount, setSearchCount] = useState(0);
  
  // Dialog State
  const [dialogConfig, setDialogConfig] = useState<{show: boolean, title: string, message: string}>({
      show: false,
      title: '',
      message: ''
  });

  // Load state from local storage on mount
  useEffect(() => {
    const savedAuth = localStorage.getItem('isLoggedIn');
    if (savedAuth === 'true') {
      setIsLoggedIn(true);
      const savedUser = localStorage.getItem('userProfile');
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {
          console.error("Failed to parse user profile", e);
        }
      }

      const savedEntries = localStorage.getItem('entries');
      if (savedEntries) {
        try {
          setEntries(JSON.parse(savedEntries));
        } catch (e) {
          console.error("Failed to parse saved entries", e);
        }
      }
    }
  }, []);

  // Save to local storage ONLY if logged in
  useEffect(() => {
    if (isLoggedIn) {
      localStorage.setItem('entries', JSON.stringify(entries));
      localStorage.setItem('isLoggedIn', 'true');
      if (user) {
        localStorage.setItem('userProfile', JSON.stringify(user));
      }
    }
  }, [entries, isLoggedIn, user]);

  const updateEntryText = (id: string, text: string) => {
    setEntries(prev => prev.map(entry => {
      if (entry.id === id) {
        return { 
          ...entry, 
          text, 
          status: entry.status === EntryStatus.EMPTY || entry.status === EntryStatus.COMPLETED ? EntryStatus.TYPING : entry.status 
        };
      }
      return entry;
    }));
  };

  const handleCommit = useCallback(async (id: string, isAuto: boolean = false) => {
    const entryIndex = entries.findIndex(e => e.id === id);
    if (entryIndex === -1) return;

    const entry = entries[entryIndex];

    if (!entry.text.trim()) return;

    // CHECK SEARCH LIMIT
    if (!isLoggedIn && searchCount >= 3) {
      setDialogConfig({
          show: true,
          title: "Unlock Unlimited Access",
          message: "You've used your 3 free searches. Create an account to unlock unlimited market insights and automatically save your research."
      });
      return;
    }

    const isLast = entryIndex === entries.length - 1;
    
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: EntryStatus.THINKING } : e));

    if (!isLoggedIn) {
      setSearchCount(prev => prev + 1);
    }

    const data = await analyzeFinanceEntry(entry.text);

    setEntries(prev => {
        const newEntries = [...prev];
        const index = newEntries.findIndex(e => e.id === id);
        
        if (index !== -1) {
            newEntries[index] = {
                ...newEntries[index],
                status: data ? EntryStatus.COMPLETED : EntryStatus.ERROR,
                data: data || undefined,
            };
        }

        if (isLast && data && !isAuto) {
            newEntries.push({
                id: generateId(),
                text: '',
                status: EntryStatus.EMPTY
            });
        }
        return newEntries;
    });

  }, [entries, isLoggedIn, searchCount]);

  const handleAuthSuccess = (name: string, email: string) => {
    setIsLoggedIn(true);
    setUser({ name, email });
    setView('home');
    setDialogConfig(prev => ({ ...prev, show: false }));
  };

  const handleUpdateProfile = (name: string, email: string) => {
    setUser({ name, email });
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUser(null);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userProfile');
    localStorage.removeItem('entries');
    setEntries([INITIAL_ENTRY]);
    setSearchCount(0);
    setActiveTab('current'); // Reset to home tab
  };

  const handleClearData = () => {
      setEntries([INITIAL_ENTRY]);
      localStorage.removeItem('entries');
      // Keep login state
  };

  const handleTabChange = (tab: TabState) => {
      if (tab !== 'current' && !isLoggedIn) {
          setDialogConfig({
              show: true,
              title: `Unlock ${tab === 'history' ? 'Previous Searches' : 'Settings'}`,
              message: `Create an account to view your ${tab === 'history' ? 'history' : 'settings'} and unlock unlimited features.`
          });
          return;
      }
      setActiveTab(tab);
  };

  // Route Views (Full page overlays)
  if (view === 'login') {
      return <LoginPage onBack={() => setView('home')} onLoginSuccess={handleAuthSuccess} />;
  }

  if (view === 'signup') {
      return <SignUpPage onBack={() => setView('home')} onSignUpSuccess={handleAuthSuccess} />;
  }

  // Helper to render Main Content based on Tab
  const renderTabContent = () => {
      switch(activeTab) {
          case 'history':
              return <HistoryView entries={entries} />;
          case 'settings':
              return (
                <SettingsView 
                  user={user} 
                  onLogout={handleLogout} 
                  onClearData={handleClearData} 
                  onUpdateProfile={handleUpdateProfile}
                />
              );
          case 'current':
          default:
              return (
                <>
                    <div className="px-6 mt-6 flex flex-col gap-2">
                        {entries.map((entry, index) => (
                          <React.Fragment key={entry.id}>
                            <NoteRow
                                entry={entry}
                                onUpdateText={updateEntryText}
                                onCommit={handleCommit}
                                onFocus={() => {}} 
                                isLast={index === entries.length - 1}
                            />
                            {/* Insert Native Ad after the 2nd entry (index 1) */}
                            {index === 1 && entries.length > 2 && (
                              <AdUnit variant="native" />
                            )}
                          </React.Fragment>
                        ))}
                    </div>
                    {/* Empty state hint */}
                    {entries.length === 1 && entries[0].text === '' && (
                        <div className="absolute top-1/3 left-0 right-0 text-center pointer-events-none opacity-30 px-10">
                            <p className="text-xl font-medium text-stone-400">Ask about market trends, tickers, or crypto prices.</p>
                        </div>
                    )}
                </>
              );
      }
  };

  return (
    <div className="min-h-screen bg-[#fcfcfc] pb-32">
        <div className="max-w-2xl mx-auto min-h-screen bg-[#fcfcfc] shadow-sm relative overflow-hidden sm:border-x sm:border-stone-100">
            <Header 
              onNavigate={setView} 
              isLoggedIn={isLoggedIn} 
              onLogout={handleLogout} 
            />
            
            {renderTabContent()}

            <Footer 
                activeTab={activeTab} 
                onTabChange={handleTabChange} 
            />

            {/* Universal Limit/Lock Dialog */}
            {dialogConfig.show && (
              <LimitDialog 
                title={dialogConfig.title}
                message={dialogConfig.message}
                onLogin={() => {
                  setDialogConfig(prev => ({ ...prev, show: false }));
                  setView('login');
                }}
                onSignUp={() => {
                  setDialogConfig(prev => ({ ...prev, show: false }));
                  setView('signup');
                }}
                onClose={() => setDialogConfig(prev => ({ ...prev, show: false }))}
              />
            )}
        </div>
    </div>
  );
};

export default App;