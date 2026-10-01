import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Copy,
  Check,
  Link,
  Radio,
  Share2,
  RefreshCw,
  Terminal,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { SimoonIdentity, TransportState } from '../types/index.ts';
import { getSignalingUrl } from '../config.ts';

interface ConnectViewProps {
  myIdentity: SimoonIdentity;
  connectionState: TransportState;
  connectedPeer: SimoonIdentity | null;
  onConnect: (peerId: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onCreatePairingSession: () => Promise<string>;
  onJoinPairingSession: (code: string) => Promise<string>;
  onCreateAirgapOffer: () => Promise<string>;
  onAcceptAirgapOffer: (offerToken: string) => Promise<string>;
  onAcceptAirgapAnswer: (answerToken: string) => Promise<void>;
  lastError?: string | null;
}

export const ConnectView: React.FC<ConnectViewProps> = ({
  myIdentity,
  connectionState,
  connectedPeer,
  onConnect,
  onDisconnect,
  onCreatePairingSession,
  onJoinPairingSession,
  onCreateAirgapOffer,
  onAcceptAirgapOffer,
  onAcceptAirgapAnswer,
  lastError,
}) => {
  const [peerInput, setPeerInput] = useState('');
  const [sessionInput, setSessionInput] = useState('');
  const [createdSessionCode, setCreatedSessionCode] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Discovered nearby peers on local network
  const [discoveredPeers, setDiscoveredPeers] = useState<{ peerId: string; lastSeen: number }[]>([]);
  const [isRefreshingPeers, setIsRefreshingPeers] = useState(false);
  const [signalingAvailable, setSignalingAvailable] = useState<boolean | null>(null);

  // Airgap / Manual mode
  const [showAirgap, setShowAirgap] = useState(false);
  const [airgapStep, setAirgapStep] = useState<'idle' | 'created_offer' | 'paste_offer' | 'created_answer' | 'paste_answer'>('idle');
  const [airgapToken, setAirgapToken] = useState('');
  const [airgapInputToken, setAirgapInputToken] = useState('');
  const [copiedAirgap, setCopiedAirgap] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate QR Code on mount or identity/session change
  useEffect(() => {
    if (canvasRef.current) {
      const qrValue = createdSessionCode
        ? `${window.location.origin}/?join=${encodeURIComponent(createdSessionCode)}`
        : `${window.location.origin}/?peer=${encodeURIComponent(myIdentity.id)}`;

      QRCode.toCanvas(
        canvasRef.current,
        qrValue,
        {
          width: 170,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        },
        (error) => {
          if (error) console.error('QR code generation failed:', error);
        }
      );
    }
  }, [myIdentity.id, createdSessionCode]);

  // Poll for nearby announced peers
  const fetchNearbyPeers = async () => {
    try {
      setIsRefreshingPeers(true);
      const baseUrl = getSignalingUrl();
      const res = await fetch(`${baseUrl}/api/signal/peers?exclude=${encodeURIComponent(myIdentity.id)}`);
      if (res.ok) {
        const data = await res.json();
        setDiscoveredPeers(data.peers || []);
        setSignalingAvailable(true);
      } else {
        setSignalingAvailable(false);
      }
    } catch (e) {
      setSignalingAvailable(false);
    } finally {
      setIsRefreshingPeers(false);
    }
  };

  useEffect(() => {
    fetchNearbyPeers();
    const interval = setInterval(fetchNearbyPeers, 6000);
    return () => clearInterval(interval);
  }, [myIdentity.id]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(myIdentity.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    if (createdSessionCode) {
      url.searchParams.set('join', createdSessionCode);
    } else {
      url.searchParams.set('peer', myIdentity.id);
    }
    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCreateSession = async () => {
    try {
      setIsConnecting(true);
      setErrorMessage(null);
      const code = await onCreatePairingSession();
      setCreatedSessionCode(code);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create session code');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionInput.trim()) return;

    try {
      setIsConnecting(true);
      setErrorMessage(null);
      await onJoinPairingSession(sessionInput.trim());
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to join session');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peerInput.trim()) return;

    try {
      setIsConnecting(true);
      setErrorMessage(null);
      await onConnect(peerInput.trim());
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initiate connection');
    } finally {
      setIsConnecting(false);
    }
  };

  // Airgap manual flows
  const handleGenerateOffer = async () => {
    try {
      setIsConnecting(true);
      const offerToken = await onCreateAirgapOffer();
      setAirgapToken(offerToken);
      setAirgapStep('created_offer');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate SDP offer');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleProcessOfferAndMakeAnswer = async () => {
    if (!airgapInputToken.trim()) return;
    try {
      setIsConnecting(true);
      const answerToken = await onAcceptAirgapOffer(airgapInputToken.trim());
      setAirgapToken(answerToken);
      setAirgapStep('created_answer');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to accept offer token');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCompleteAnswer = async () => {
    if (!airgapInputToken.trim()) return;
    try {
      setIsConnecting(true);
      await onAcceptAirgapAnswer(airgapInputToken.trim());
      setAirgapStep('idle');
      setShowAirgap(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete answer token');
    } finally {
      setIsConnecting(false);
    }
  };

  const isConnected = connectionState === 'connected';
  const isConnectionAttemptActive = connectionState === 'connecting' || isConnecting;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Intro Hero */}
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight text-neutral-100">
          Device Pairing & Connection
        </h2>
        <p className="text-xs text-neutral-400">
          Establish direct browser-to-browser WebRTC DataChannels. Messages and files travel directly between peers.
        </p>
      </div>

      {/* Real Connected State Banner (ONLY shown when genuinely connected) */}
      {isConnected && connectedPeer && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wide">
                CONNECTED (DataChannel Verified)
              </div>
              <div className="text-sm font-mono text-neutral-100 mt-0.5">
                Peer: <span className="font-bold text-amber-400">{connectedPeer.id}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onDisconnect}
            className="px-3.5 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 rounded transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            Disconnect Peer
          </button>
        </div>
      )}

      {/* Active Connecting Indicator Banner */}
      {isConnectionAttemptActive && !isConnected && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-950/20 p-4 text-xs font-mono text-amber-300">
          <RefreshCw className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
          <div className="space-y-0.5">
            <span className="font-semibold block">Negotiating WebRTC Connection...</span>
            <span className="text-[11px] text-amber-400/80">
              Exchanging SDP offer/answer and gathering ICE candidates. Awaiting DataChannel verification handshake...
            </span>
          </div>
        </div>
      )}

      {/* Error Callout if connection failed */}
      {(errorMessage || lastError) && !isConnected && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-950/30 p-3.5 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-rose-300">Connection Failed:</span>
              <p className="font-mono text-[11px] text-rose-200 leading-relaxed">
                {errorMessage || lastError}
              </p>
              <p className="text-[10px] text-neutral-400 pt-1">
                Tip: If on different restrictive Wi-Fi networks without TURN, try the Airgap & Zero-Server Manual Handshake below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main 2-Column Pairing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Device Identity & Session Creator */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 flex flex-col items-center text-center space-y-4">
          <div className="space-y-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400">
              My SIMOON ID
            </span>
            <div className="font-display text-2xl font-bold tracking-wider text-neutral-100 font-mono-nums">
              {myIdentity.id}
            </div>
          </div>

          {/* Dynamic QR Code Canvas */}
          <div className="rounded-lg bg-white p-3 shadow-md">
            <canvas ref={canvasRef} className="block" />
          </div>

          {/* Session Code Highlight (if created) */}
          {createdSessionCode ? (
            <div className="w-full rounded border border-amber-500/40 bg-amber-950/20 p-3 text-center space-y-1">
              <span className="text-[10px] font-mono uppercase text-amber-400">Active Pairing Code</span>
              <div className="text-xl font-bold font-mono text-neutral-100 tracking-widest">
                {createdSessionCode}
              </div>
              <p className="text-[10px] text-neutral-400 font-mono">
                Tell other device to enter this 6-digit code or scan the QR above.
              </p>
            </div>
          ) : (
            <button
              onClick={handleCreateSession}
              disabled={isConnectionAttemptActive}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-950 transition-colors disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              <span>Generate 6-Digit Session Code</span>
            </button>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap justify-center gap-2 w-full pt-1">
            <button
              onClick={handleCopyId}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
            >
              {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedId ? 'Copied ID' : 'Copy ID'}</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Link className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'Copied Link' : 'Copy Share Link'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Connect via Code or Peer ID */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            {/* Option A: Enter 6-digit session code */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-semibold">
                Method 1: Enter 6-Digit Code
              </span>
              <form onSubmit={handleJoinSession} className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 482-195"
                  value={sessionInput}
                  onChange={(e) => setSessionInput(e.target.value)}
                  className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3.5 py-2 font-mono text-sm tracking-wider uppercase text-neutral-100 placeholder-neutral-500 focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isConnectionAttemptActive || !sessionInput.trim()}
                  className="rounded-md bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-950 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  Join Code
                </button>
              </form>
            </div>

            {/* Option B: Enter direct SIMOON ID */}
            <div className="space-y-2 border-t border-neutral-800/80 pt-4">
              <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
                Method 2: Connect by SIMOON ID
              </span>
              <form onSubmit={handleConnectSubmit} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 8F4A-29C1-7D52"
                    value={peerInput}
                    onChange={(e) => setPeerInput(e.target.value.toUpperCase())}
                    className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3.5 py-2 font-mono text-sm uppercase text-neutral-100 placeholder-neutral-500 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isConnectionAttemptActive || !peerInput.trim()}
                    className="rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    Connect ID
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Active Nodes on Network / Multi-Tab Discovery */}
          <div className="border-t border-neutral-800 pt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="font-mono text-[11px] uppercase">
                Active Nodes on Network ({discoveredPeers.length})
              </span>
              <button
                onClick={fetchNearbyPeers}
                className="hover:text-neutral-200 transition-colors"
                title="Refresh network nodes"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshingPeers ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {discoveredPeers.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">
                {signalingAvailable === false
                  ? 'Signaling relay offline or static host mode. Use Airgap Mode below or set VITE_SIGNALING_URL.'
                  : 'Open SIMOON MESH in another tab or device on same network to discover peers automatically.'}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {discoveredPeers.map((peer) => (
                  <div
                    key={peer.peerId}
                    className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-950/60 px-3 py-1.5 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span className="text-neutral-200">{peer.peerId}</span>
                    </div>
                    <button
                      onClick={() => {
                        setPeerInput(peer.peerId);
                        onConnect(peer.peerId);
                      }}
                      disabled={isConnectionAttemptActive}
                      className="text-xs text-amber-400 hover:text-amber-300 font-semibold disabled:opacity-40"
                    >
                      Connect →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Airgap / Serverless Mode Accordion */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="h-4 w-4 text-cyan-400" />
            <div>
              <h4 className="text-xs font-semibold text-neutral-200">
                Airgap & Zero-Server Manual Handshake (Offline Fallback)
              </h4>
              <p className="text-[11px] text-neutral-400">
                Connect two devices directly even without internet or signaling server by exchanging SDP tokens manually.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAirgap(!showAirgap)}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline"
          >
            {showAirgap ? 'Hide Manual Mode' : 'Show Manual Mode'}
          </button>
        </div>

        {showAirgap && (
          <div className="mt-4 border-t border-neutral-800 pt-4 space-y-4 text-xs font-mono">
            {/* Step options */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateOffer}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
              >
                1. Device A: Create Offer Token
              </button>
              <button
                onClick={() => setAirgapStep('paste_offer')}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
              >
                2. Device B: Accept Offer & Answer
              </button>
              <button
                onClick={() => setAirgapStep('paste_answer')}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
              >
                3. Device A: Complete Handshake
              </button>
            </div>

            {/* Generated token display */}
            {(airgapStep === 'created_offer' || airgapStep === 'created_answer') && (
              <div className="space-y-2">
                <div className="text-amber-400 font-semibold">
                  {airgapStep === 'created_offer'
                    ? 'Generated SDP Offer Token. Send this token to Device B:'
                    : 'Generated SDP Answer Token. Send this token back to Device A:'}
                </div>
                <textarea
                  readOnly
                  rows={4}
                  value={airgapToken}
                  className="w-full rounded border border-neutral-800 bg-neutral-950 p-2 text-[10px] text-neutral-300 break-all select-all font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(airgapToken);
                    setCopiedAirgap(true);
                    setTimeout(() => setCopiedAirgap(false), 2000);
                  }}
                  className="px-3 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700"
                >
                  {copiedAirgap ? 'Copied Token!' : 'Copy Token to Clipboard'}
                </button>
              </div>
            )}

            {/* Input token flow */}
            {airgapStep === 'paste_offer' && (
              <div className="space-y-2">
                <div className="text-neutral-300">Paste SDP Offer Token from Device A:</div>
                <textarea
                  rows={4}
                  value={airgapInputToken}
                  onChange={(e) => setAirgapInputToken(e.target.value)}
                  placeholder="Paste base64 offer token here..."
                  className="w-full rounded border border-neutral-800 bg-neutral-950 p-2 text-[10px] text-neutral-200 font-mono"
                />
                <button
                  onClick={handleProcessOfferAndMakeAnswer}
                  disabled={!airgapInputToken.trim() || isConnecting}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-neutral-950 font-bold rounded"
                >
                  Generate Answer Token
                </button>
              </div>
            )}

            {airgapStep === 'paste_answer' && (
              <div className="space-y-2">
                <div className="text-neutral-300">Paste SDP Answer Token from Device B:</div>
                <textarea
                  rows={4}
                  value={airgapInputToken}
                  onChange={(e) => setAirgapInputToken(e.target.value)}
                  placeholder="Paste base64 answer token here..."
                  className="w-full rounded border border-neutral-800 bg-neutral-950 p-2 text-[10px] text-neutral-200 font-mono"
                />
                <button
                  onClick={handleCompleteAnswer}
                  disabled={!airgapInputToken.trim() || isConnecting}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-bold rounded"
                >
                  Finalize Direct Connection
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
