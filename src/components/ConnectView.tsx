import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Copy,
  Check,
  Link,
  Wifi,
  Radio,
  ArrowRight,
  ShieldCheck,
  Share2,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { SimoonIdentity, TransportState } from '../types/index.ts';

interface ConnectViewProps {
  myIdentity: SimoonIdentity;
  connectionState: TransportState;
  connectedPeer: SimoonIdentity | null;
  onConnect: (peerId: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onCreateAirgapOffer: () => Promise<string>;
  onAcceptAirgapOffer: (offerToken: string) => Promise<string>;
  onAcceptAirgapAnswer: (answerToken: string) => Promise<void>;
}

export const ConnectView: React.FC<ConnectViewProps> = ({
  myIdentity,
  connectionState,
  connectedPeer,
  onConnect,
  onDisconnect,
  onCreateAirgapOffer,
  onAcceptAirgapOffer,
  onAcceptAirgapAnswer,
}) => {
  const [peerInput, setPeerInput] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Discovered nearby peers on local network
  const [discoveredPeers, setDiscoveredPeers] = useState<{ peerId: string; lastSeen: number }[]>([]);
  const [isRefreshingPeers, setIsRefreshingPeers] = useState(false);

  // Airgap / Manual mode
  const [showAirgap, setShowAirgap] = useState(false);
  const [airgapStep, setAirgapStep] = useState<'idle' | 'created_offer' | 'paste_offer' | 'created_answer' | 'paste_answer'>('idle');
  const [airgapToken, setAirgapToken] = useState('');
  const [airgapInputToken, setAirgapInputToken] = useState('');
  const [copiedAirgap, setCopiedAirgap] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate QR Code on mount or identity change
  useEffect(() => {
    if (canvasRef.current && myIdentity.id) {
      QRCode.toCanvas(
        canvasRef.current,
        myIdentity.id,
        {
          width: 180,
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
  }, [myIdentity.id]);

  // Poll for nearby announced peers
  const fetchNearbyPeers = async () => {
    try {
      setIsRefreshingPeers(true);
      const res = await fetch(`/api/signal/peers?exclude=${encodeURIComponent(myIdentity.id)}`);
      if (res.ok) {
        const data = await res.json();
        setDiscoveredPeers(data.peers || []);
      }
    } catch (e) {
      // Offline or network error
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
    url.searchParams.set('peer', myIdentity.id);
    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      {/* Intro Hero */}
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight text-neutral-100">
          Peer-to-Peer Pairing
        </h2>
        <p className="text-xs text-neutral-400">
          Connect directly to any browser or device over WebRTC DataChannel. No phone number or cloud account required.
        </p>
      </div>

      {/* Active Connection Banner (if connected) */}
      {isConnected && connectedPeer && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <div className="text-xs font-mono font-semibold text-emerald-300">
                Direct P2P Link Established
              </div>
              <div className="text-sm font-mono text-neutral-200">
                Connected with: <span className="font-bold text-neutral-100">{connectedPeer.id}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onDisconnect}
            className="px-3.5 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/50 rounded transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            Disconnect Peer
          </button>
        </div>
      )}

      {/* Main 2-Column Pairing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: My SIMOON ID Card */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 flex flex-col items-center text-center space-y-4">
          <div className="space-y-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400">
              My Cryptographic SIMOON ID
            </span>
            <div className="font-display text-2xl font-bold tracking-wider text-neutral-100 font-mono-nums">
              {myIdentity.id}
            </div>
          </div>

          {/* QR Code Container */}
          <div className="rounded-lg bg-white p-3 shadow-md">
            <canvas ref={canvasRef} className="block" />
          </div>

          <p className="text-xs text-neutral-400 max-w-xs">
            Derived locally from your ECDH and ECDSA keypair. Scan or share this ID with another device.
          </p>

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
              <span>{copiedLink ? 'Copied Link' : 'Share Connect Link'}</span>
            </button>
          </div>
        </div>

        {/* Right: Connect to Remote Peer */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
                Connect to a Peer
              </span>
              <h3 className="font-display text-lg font-semibold text-neutral-100">
                Enter Remote SIMOON ID
              </h3>
            </div>

            <form onSubmit={handleConnectSubmit} className="space-y-3">
              <div>
                <input
                  type="text"
                  placeholder="e.g. 8F4A-29C1-7D52"
                  value={peerInput}
                  onChange={(e) => setPeerInput(e.target.value.toUpperCase())}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 font-mono text-sm uppercase text-neutral-100 placeholder-neutral-500 focus:border-amber-400 focus:outline-none"
                />
              </div>

              {errorMessage && (
                <div className="text-xs text-rose-400 font-mono">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isConnecting || !peerInput.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-neutral-950 hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Establishing P2P Handshake...</span>
                  </>
                ) : (
                  <>
                    <Radio className="h-4 w-4" />
                    <span>Connect P2P Channel</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Discovered nearby nodes on local network / multi-tab */}
          <div className="border-t border-neutral-800 pt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="font-mono text-[11px] uppercase">
                Active Nodes on Network ({discoveredPeers.length})
              </span>
              <button
                onClick={fetchNearbyPeers}
                className="hover:text-neutral-200 transition-colors"
                title="Refresh nearby nodes"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshingPeers ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {discoveredPeers.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">
                Open this app in a second browser window or another device to discover peers automatically.
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
                      className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
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
                Airgap & Zero-Server Manual Handshake (Fallback)
              </h4>
              <p className="text-[11px] text-neutral-400">
                Connect two devices even if signaling servers are blocked or completely disabled by exchanging SDP tokens manually.
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
                <div className="text-amber-400">
                  {airgapStep === 'created_offer'
                    ? 'Generated SDP Offer Token. Send this to Device B:'
                    : 'Generated SDP Answer Token. Send this back to Device A:'}
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
