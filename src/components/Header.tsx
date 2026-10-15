import React from 'react';
import { Truck, ShieldCheck, History, Camera } from 'lucide-react';

interface HeaderProps {
  activeTab: 'scan' | 'dashboard';
  setActiveTab: (tab: 'scan' | 'dashboard') => void;
  scanCount: number;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, scanCount }) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-inner shadow-blue-400/30">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-base tracking-tight">LOGIX VALIDATOR</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Driver
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Invoice &amp; Stamp Cross-Check</p>
          </div>
        </div>

        {/* Live Status indicator & Standalone link */}
        <div className="flex items-center space-x-2">
          <a
            href="/standalone.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Standalone Production Single-File HTML"
            className="flex items-center space-x-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/30 text-[11px] font-semibold transition-colors"
          >
            <span>Single HTML</span>
          </a>
          <div className="flex items-center space-x-1 bg-slate-800/80 px-2 py-1 rounded-full border border-slate-700/60">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono text-slate-300">ONLINE</span>
          </div>
        </div>
      </div>

      {/* Mobile Top Tabs */}
      <div className="max-w-md mx-auto px-4 pb-2.5 grid grid-cols-2 gap-2">
        <button
          onClick={() => setActiveTab('scan')}
          className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'scan'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>Scan Invoice</span>
        </button>

        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all relative ${
            activeTab === 'dashboard'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Logs</span>
          {scanCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-slate-700 text-slate-200 text-xs rounded-full font-mono">
              {scanCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
