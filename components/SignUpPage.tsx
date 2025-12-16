import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface SignUpPageProps {
  onBack: () => void;
  onSignUpSuccess: (name: string, email: string) => void;
}

export const SignUpPage: React.FC<SignUpPageProps> = ({ onBack, onSignUpSuccess }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;

    // Simulate API call
    setTimeout(() => {
        onSignUpSuccess(name, email);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-[#fcfcfc] flex flex-col items-center pt-10 px-6 animate-in slide-in-from-right duration-300">
      <div className="max-w-md w-full">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-stone-100 rounded-full text-stone-600 transition-colors mb-8 -ml-2"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <h1 className="text-3xl font-bold text-stone-900 mb-2">Create account</h1>
        <p className="text-stone-500 mb-8">Start tracking your market insights today.</p>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Full Name</label>
            <input 
              name="name"
              type="text" 
              className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 transition-all"
              placeholder="John Doe"
              required
            />
          </div>
           <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Email</label>
            <input 
              name="email"
              type="email" 
              className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 transition-all"
              placeholder="hello@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Password</label>
            <input 
              name="password"
              type="password" 
              className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 transition-all"
              placeholder="Create a password"
              required
            />
          </div>

          <button className="w-full bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm active:scale-[0.99] mt-2">
            Create Account
          </button>
          
          <p className="text-center text-stone-500 text-sm mt-4">
            Already have an account? <span className="text-stone-900 font-medium cursor-pointer hover:underline">Log in</span>
          </p>
        </form>
      </div>
    </div>
  );
};