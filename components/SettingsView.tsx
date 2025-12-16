import React, { useState } from 'react';
import { LogOut, Trash2, User, Shield, CreditCard, Pencil } from 'lucide-react';
import { UserProfile } from '../types';
import { EditProfileDialog } from './EditProfileDialog';

interface SettingsViewProps {
  user: UserProfile | null;
  onLogout: () => void;
  onClearData: () => void;
  onUpdateProfile?: (name: string, email: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, onLogout, onClearData, onUpdateProfile }) => {
  const [showEditProfile, setShowEditProfile] = useState(false);

  return (
    <div className="px-6 py-6 animate-in slide-in-from-right duration-300">
      <h2 className="text-2xl font-bold text-stone-900 mb-8">Settings</h2>

      <div className="space-y-6">
        {/* Account Section */}
        <section>
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-4 px-2">Account</h3>
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
             <div className="p-4 flex items-center justify-between border-b border-stone-50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0">
                      <User className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden">
                      <p className="font-semibold text-stone-900 truncate">{user?.name || 'Guest User'}</p>
                      <p className="text-sm text-stone-400 truncate">{user?.email || 'Not logged in'}</p>
                  </div>
                </div>
                {onUpdateProfile && user && (
                  <button 
                    onClick={() => setShowEditProfile(true)}
                    className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-full transition-colors"
                    aria-label="Edit Profile"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
             </div>
             <button className="w-full p-4 flex items-center gap-3 text-stone-600 hover:bg-stone-50 transition-colors text-left text-sm font-medium">
                <Shield className="w-4 h-4" />
                Privacy & Security
             </button>
             <button className="w-full p-4 flex items-center gap-3 text-stone-600 hover:bg-stone-50 transition-colors text-left text-sm font-medium border-t border-stone-50">
                <CreditCard className="w-4 h-4" />
                Subscription Plan
                <span className="ml-auto text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">Pro</span>
             </button>
          </div>
        </section>

        {/* Data Section */}
        <section>
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-4 px-2">Data</h3>
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
             <button 
                onClick={onClearData}
                className="w-full p-4 flex items-center gap-3 text-rose-600 hover:bg-rose-50 transition-colors text-left text-sm font-medium"
             >
                <Trash2 className="w-4 h-4" />
                Clear Local History
             </button>
          </div>
        </section>

        <button 
            onClick={onLogout}
            className="w-full mt-8 py-4 bg-stone-100 rounded-2xl text-stone-900 font-semibold text-sm hover:bg-stone-200 transition-colors flex items-center justify-center gap-2"
        >
            <LogOut className="w-4 h-4" />
            Sign Out
        </button>

         <p className="text-center text-xs text-stone-300 mt-8">
            MarketNotes v1.0.2
        </p>
      </div>

      {/* Edit Profile Modal */}
      {showEditProfile && user && onUpdateProfile && (
        <EditProfileDialog 
          user={user}
          onSave={onUpdateProfile}
          onClose={() => setShowEditProfile(false)}
        />
      )}
    </div>
  );
};