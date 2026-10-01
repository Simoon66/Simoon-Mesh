import React, { useState } from 'react';
import {
  X,
  Radio,
  Lock,
  ArrowUpRight,
  ArrowDownLeft,
  Cpu,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Server,
  Activity,
} from 'lucide-react';
import { TransportStats, TransportState, ProtocolLogEntry, SimoonIdentity } from '../types/index.ts';
import { formatBytes } from './FileTransferCard.tsx';

interface TestingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  connectionState: TransportState;
  connectedPeer: SimoonIdentity | null;
  stats: TransportStats;
  logs: ProtocolLogEntry[];
  myIdentity: SimoonIdentity;
  onClearLogs?: () => void;
}

export const TestingPanel: React.FC<TestingPanelProps> = ({
  isOpen,
  onClose,
  connectionState,
  connectedPeer,
  stats,
  logs,
  myIdentity,
  onClearLogs,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'TRANSPORT' | 'CRYPTO' | 'PROTOCOL' | 'FILE'>('ALL');

  if (!isOpen) return null;

  const filteredLogs = filter === 'ALL' ? logs : logs.filter(l => l.category === filter);

  const isSignalingOk = stats.signalingStatus?.includes('Connected') || stats.signalingStatus?.includes('200');

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-neutral-800 bg-neutral-950/98 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-neutral-800 px-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-amber-400" />
          <h3 className="font-display text-sm font-semibold tracking-wide text-neutral-100">
            Developer Diagnostics & Telemetry
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error Callout if Last Error is present */}
        {stats.lastError && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-950/30 p-3 text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-rose-300">Underlying Diagnostic Error:</span>
                <p className="font-mono text-[11px] text-rose-200 leading-relaxed break-words">
                  {stats.lastError}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Section 5 Required Diagnostics Grid */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
            <span className="text-[11px] font-semibold text-neutral-200 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              WebRTC Connection Matrix
            </span>
            <span className="text-[10px] text-neutral-400">
              Transport: <strong className="text-neutral-200">WebRTC DataChannel</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">My SIMOON ID</span>
              <span className="font-bold text-amber-400">{myIdentity.id}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Peer ID</span>
              <span className="font-bold text-neutral-200">
                {connectedPeer ? connectedPeer.id : stats.lastError ? 'Failed' : 'None connected'}
              </span>
            </div>

            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Signaling Status</span>
              <span className={`flex items-center gap-1 font-semibold ${isSignalingOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isSignalingOk ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                {stats.signalingStatus || 'Idle'}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Signaling State</span>
              <span className="text-neutral-300">{stats.signalingState || 'stable'}</span>
            </div>

            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">ICE Gathering</span>
              <span className="text-neutral-300 capitalize">{stats.iceGatheringState || 'new'}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">ICE Connection</span>
              <span className={`capitalize ${stats.iceConnectionState === 'connected' || stats.iceConnectionState === 'completed' ? 'text-emerald-400 font-bold' : stats.iceConnectionState === 'failed' ? 'text-rose-400 font-bold' : 'text-neutral-300'}`}>
                {stats.iceConnectionState || 'new'}
              </span>
            </div>

            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Peer Connection</span>
              <span className={`capitalize ${stats.peerConnectionState === 'connected' ? 'text-emerald-400 font-bold' : stats.peerConnectionState === 'failed' ? 'text-rose-400 font-bold' : 'text-neutral-300'}`}>
                {stats.peerConnectionState || 'new'}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">DataChannel State</span>
              <span className={`capitalize ${stats.dataChannelState === 'open' ? 'text-emerald-400 font-bold' : 'text-amber-400'}`}>
                {stats.dataChannelState || 'closed'}
              </span>
            </div>
          </div>

          {stats.rttMs !== undefined && (
            <div className="border-t border-neutral-800/80 pt-2 flex justify-between text-[11px]">
              <span className="text-neutral-500">DataChannel Verified RTT:</span>
              <span className="text-emerald-400 font-bold">{stats.rttMs} ms</span>
            </div>
          )}
        </div>

        {/* Cryptographic Session Details */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-amber-400" />
              Cryptographic Suite
            </span>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> ECDH + AES-GCM 256
            </span>
          </div>

          <div className="font-mono text-[10px] text-neutral-400 space-y-1 pt-1 border-t border-neutral-800">
            <div className="flex justify-between">
              <span>Key Agreement:</span>
              <span className="text-neutral-200">ECDH (P-256)</span>
            </div>
            <div className="flex justify-between">
              <span>Key Derivation:</span>
              <span className="text-neutral-200">HKDF (SHA-256)</span>
            </div>
            <div className="flex justify-between">
              <span>Symmetric Cipher:</span>
              <span className="text-neutral-200">AES-GCM (256-bit, 96-bit IV)</span>
            </div>
          </div>
        </div>

        {/* Real-time Throughput & Buffer */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-cyan-400" />
              DataChannel Throughput & Buffer
            </span>
            <span className="text-[11px] font-mono text-cyan-400">
              {formatBytes(stats.currentRateBytesPerSec)}/s
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-neutral-300 font-mono text-[11px]">
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Sent: {formatBytes(stats.bytesSent)}</span>
              <span className="text-[10px] text-neutral-500">({stats.packetsSent} pkts)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>Recv: {formatBytes(stats.bytesReceived)}</span>
              <span className="text-[10px] text-neutral-500">({stats.packetsReceived} pkts)</span>
            </div>
          </div>

          {/* DataChannel bufferedAmount gauge */}
          <div>
            <div className="flex justify-between text-[10px] font-mono text-neutral-400 mb-1">
              <span>Buffer Backpressure</span>
              <span className={stats.bufferedAmount > 128 * 1024 ? 'text-amber-400' : 'text-neutral-300'}>
                {formatBytes(stats.bufferedAmount)} / 256 KB max
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-200"
                style={{
                  width: `${Math.min(100, (stats.bufferedAmount / (256 * 1024)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Live Protocol Logs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-300">Protocol Envelope Traffic</span>
            {onClearLogs && (
              <button
                onClick={onClearLogs}
                title="Clear event logs"
                className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-1 p-0.5 bg-neutral-900 rounded border border-neutral-800 text-[10px] font-mono">
            {(['ALL', 'TRANSPORT', 'CRYPTO', 'PROTOCOL', 'FILE'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`flex-1 py-1 rounded transition-colors ${
                  filter === cat ? 'bg-neutral-800 text-neutral-100 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="h-56 overflow-y-auto rounded border border-neutral-800 bg-neutral-950 p-2 font-mono text-[10px] space-y-1.5">
            {filteredLogs.length === 0 ? (
              <div className="p-4 text-center text-neutral-500">No protocol events recorded</div>
            ) : (
              filteredLogs.map(log => {
                const timeStr = new Date(log.timestamp).toLocaleTimeString();
                const dirColor =
                  log.direction === 'in'
                    ? 'text-emerald-400'
                    : log.direction === 'out'
                    ? 'text-amber-400'
                    : 'text-neutral-400';

                return (
                  <div key={log.id} className="border-b border-neutral-900 pb-1 last:border-0">
                    <div className="flex items-center gap-1.5 text-neutral-500">
                      <span>{timeStr}</span>
                      <span className={`font-bold ${dirColor}`}>[{log.direction.toUpperCase()}]</span>
                      <span className="text-neutral-400">[{log.category}]</span>
                    </div>
                    <div className="text-neutral-300 mt-0.5 break-all">{log.summary}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
