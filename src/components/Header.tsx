import React from 'react';
import { Activity, Shield, Wifi, WifiOff } from 'lucide-react';
import { TransportState } from '../types/index.ts';

interface HeaderProps {
  activeTab: 'chat' | 'connect' | 'files' | 'security';
  onTabChange: (tab: 'chat' | 'connect' | 'files' | 'security') => void;
  connectionState: TransportState;
  connectedPeerId: string | null;
  showDiagnostics: boolean;
  onToggleDiagnostics: () => void;
  myId: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  connectionState,
  connectedPeerId,
  showDiagnostics,
  onToggleDiagnostics,
  myId,
}) => {
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onTabChange('chat')}
            className="group flex items-center gap-2 text-left focus-visible:outline-none"
          >
            <span className="font-display text-lg font-bold tracking-wider text-neutral-100 group-hover:text-amber-400 transition-colors">
              SIMOON MESH
            </span>
          </button>
          <span className="hidden sm:inline-block text-xs font-mono text-neutral-500 border-l border-neutral-800 pl-3">
            Human × AI
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => onTabChange('chat')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            Messages
          </button>
          <button
            onClick={() => onTabChange('connect')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'connect'
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            Connect
          </button>
          <button
            onClick={() => onTabChange('files')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'files'
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            Vault
          </button>
          <button
            onClick={() => onTabChange('security')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'security'
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            Security
          </button>
        </nav>

        {/* Zone 3: Connection & Diagnostic Actions */}
        <div className="flex items-center gap-2.5">
          <div
            className={`hidden md:flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded border ${
              isConnected
                ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400'
                : isConnecting
                ? 'border-amber-500/30 bg-amber-950/20 text-amber-400'
                : 'border-neutral-800 bg-neutral-900/50 text-neutral-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected
                  ? 'bg-emerald-400 animate-pulse'
                  : isConnecting
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-neutral-500'
              }`}
            />
            <span>
              {isConnected
                ? `Peer: ${connectedPeerId || 'Connected'}`
                : isConnecting
                ? 'Connecting...'
                : 'P2P Offline'}
            </span>
          </div>

          <button
            onClick={onToggleDiagnostics}
            title="Toggle Protocol & Transport Diagnostics"
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded border transition-colors whitespace-nowrap ${
              showDiagnostics
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Diagnostics</span>
          </button>
        </div>
      </div>
    </header>
  );
};
