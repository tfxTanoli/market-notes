import React, { useEffect } from 'react';

interface AdUnitProps {
  variant?: 'native' | 'banner';
  className?: string;
}

export const AdUnit: React.FC<AdUnitProps> = ({ variant = 'native', className = '' }) => {
  const isProduction = false; // Set to true when you have real AdSense credentials

  useEffect(() => {
    // This is where you would initialize the AdSense push if using real ads
    if (isProduction) {
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (err) {
        console.error('AdSense error', err);
      }
    }
  }, [isProduction]);

  if (isProduction) {
    // REAL ADSENSE IMPLEMENTATION
    return (
      <div className={`w-full overflow-hidden flex justify-center my-4 ${className}`}>
        {/* Replace data-ad-client and data-ad-slot with your actual Google AdSense IDs */}
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
          data-ad-slot="1234567890"
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  // PLACEHOLDER / NATIVE AD DESIGN
  // This mimics the app's design while clearly labeling itself as an Ad
  if (variant === 'native') {
    return (
      <div className={`relative py-4 border-b border-stone-50 group ${className}`}>
        <div className="flex items-start justify-between">
           <div className="pr-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 border border-stone-200 px-1.5 py-0.5 rounded">
                  Sponsored
                </span>
                <span className="text-xs text-stone-400">Trusted Partner</span>
              </div>
              <p className="text-stone-800 text-lg font-medium leading-relaxed">
                Zero-fee crypto trading for the first 30 days. Sign up now.
              </p>
           </div>
           
           <div className="flex-shrink-0 min-w-[80px] flex justify-end">
              <button className="bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                Open
              </button>
           </div>
        </div>
      </div>
    );
  }

  // Standard Banner Placeholder
  return (
    <div className={`w-full bg-stone-50 border border-stone-100 rounded-xl p-4 flex flex-col items-center justify-center text-center gap-2 my-4 ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-300">Advertisement</span>
      <div className="w-full h-12 bg-stone-200/50 rounded-lg flex items-center justify-center text-stone-400 text-sm">
        Banner Ad Slot (320x50)
      </div>
    </div>
  );
};