import React, { useState } from 'react';
import {
  Shield,
  Key,
  Database,
  Lock,
  Trash2,
  AlertTriangle,
  Info,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  CheckCircle,
} from 'lucide-react';
import { SimoonIdentity, StoredIdentityKeys } from '../types/index.ts';

interface SecurityViewProps {
  myIdentity: SimoonIdentity;
  storedKeys: StoredIdentityKeys;
  messagesCount: number;
  transfersCount: number;
  onResetNode: () => Promise<void>;
}

export const SecurityView: React.FC<SecurityViewProps> = ({
  myIdentity,
  storedKeys,
  messagesCount,
  transfersCount,
  onResetNode,
}) => {
  const [showKeyDetails, setShowKeyDetails] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    try {
      setIsResetting(true);
      await onResetNode();
    } catch (e) {
      console.error('Failed to reset node:', e);
      setIsResetting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      {/* Intro */}
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-neutral-100">
          Security & Identity Configuration
        </h2>
        <p className="text-xs text-neutral-400 mt-1">
          SIMOON MESH relies on client-generated cryptography, zero cloud accounts, and local device persistence.
        </p>
      </div>

      {/* Cryptographic Identity Card */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-neutral-200">
              Local Cryptographic Identity
            </h3>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> Private Key Stored in IndexedDB
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="rounded border border-neutral-800 bg-neutral-950/80 p-3">
            <span className="text-[10px] text-neutral-400 uppercase">SIMOON ID (Fingerprint)</span>
            <div className="mt-1 text-sm font-bold text-amber-400">{myIdentity.id}</div>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950/80 p-3">
            <span className="text-[10px] text-neutral-400 uppercase">Identity Generation Time</span>
            <div className="mt-1 text-neutral-300">
              {new Date(myIdentity.createdAt).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="rounded border border-neutral-800 bg-neutral-950/80 p-3 text-xs font-mono">
          <span className="text-[10px] text-neutral-400 uppercase">Full SHA-256 Public Key Fingerprint</span>
          <div className="mt-1 break-all text-neutral-300 text-[11px] leading-relaxed">
            {myIdentity.fingerprint}
          </div>
        </div>

        {/* Technical Key Inspection Accordion */}
        <div className="border-t border-neutral-800 pt-3">
          <button
            onClick={() => setShowKeyDetails(!showKeyDetails)}
            className="flex items-center gap-1.5 text-xs font-mono text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            {showKeyDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>{showKeyDetails ? 'Hide Raw Public Keys (JWK)' : 'Inspect Raw Public Keys (JWK)'}</span>
          </button>

          {showKeyDetails && (
            <div className="mt-3 space-y-3 font-mono text-[10px]">
              <div>
                <span className="text-neutral-400">ECDH P-256 Public Key (Key Agreement):</span>
                <pre className="mt-1 rounded bg-neutral-950 p-2 text-neutral-300 overflow-x-auto border border-neutral-800">
                  {JSON.stringify(myIdentity.ecdhPublicKeyJwk, null, 2)}
                </pre>
              </div>
              <div>
                <span className="text-neutral-400">ECDSA P-256 Public Key (Identity Signing):</span>
                <pre className="mt-1 rounded bg-neutral-950 p-2 text-neutral-300 overflow-x-auto border border-neutral-800">
                  {JSON.stringify(myIdentity.ecdsaPublicKeyJwk, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Model & Technical Limitations */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-neutral-200">
            Security Model & Cryptographic Guarantees
          </h3>
        </div>

        <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
          <p>
            <strong className="text-neutral-100">Standard Web Crypto Primitives:</strong> SIMOON MESH implements established cryptographic specifications via the browser <code className="text-amber-400">crypto.subtle</code> standard:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-neutral-400 font-mono text-[11px]">
            <li><strong>Key Agreement:</strong> Elliptic Curve Diffie-Hellman (ECDH) on NIST curve P-256 (prime256v1).</li>
            <li><strong>Key Derivation:</strong> HKDF with SHA-256 to derive symmetric keys from the shared secret.</li>
            <li><strong>Symmetric Encryption:</strong> AES-GCM (256-bit) with unique 96-bit random IVs for authenticated encryption with associated data (AEAD).</li>
            <li><strong>Signatures:</strong> ECDSA with SHA-256 for identity verification and anti-tamper envelope validation.</li>
            <li><strong>Integrity:</strong> SHA-256 checksums calculated over reconstructed file payloads before file assembly.</li>
          </ul>

          <div className="mt-4 rounded border border-neutral-800/80 bg-neutral-950/60 p-3.5 space-y-2">
            <h4 className="font-semibold text-neutral-200 flex items-center gap-1.5 text-xs">
              <Info className="h-3.5 w-3.5 text-cyan-400" />
              Current Security Limitations & Scope
            </h4>
            <div className="text-[11px] text-neutral-400 space-y-1.5">
              <p>
                <strong>1. No Ratcheting (Current Web MVP):</strong> Each P2P session derives a symmetric key per connection. Future protocol iterations (v0.5) will incorporate a Double Ratchet mechanism for per-message forward secrecy.
              </p>
              <p>
                <strong>2. WebRTC Metadata:</strong> Direct peer-to-peer WebRTC connections expose public IP addresses to connected peers and STUN servers. Anonymity requires routing traffic through Tor or VPN.
              </p>
              <p>
                <strong>3. Host Environment Trust:</strong> Web applications are bound to browser security sandboxes. Malicious browser extensions or compromised device memory can theoretically access decrypted state.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Local Storage & Wipe Action */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-neutral-200">
              Local Storage Vault (IndexedDB)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-neutral-400">
            {messagesCount} Messages · {transfersCount} File Transfers
          </span>
        </div>

        <p className="text-xs text-neutral-400 leading-relaxed">
          All chats, transferred file records, and identity keys are stored solely in your browser's private local IndexedDB. Nothing is ever sent to or retained on any cloud database.
        </p>

        <div className="border-t border-neutral-800 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-rose-300">Wipe Node & Reset Identity</div>
            <div className="text-[11px] text-neutral-500">
              Irreversibly deletes local cryptographic private keys and all chat history.
            </div>
          </div>

          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-400 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/40 rounded transition-colors whitespace-nowrap self-start sm:self-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Local Data</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded transition-colors"
              >
                {isResetting ? 'Wiping...' : 'Confirm Wipe & Regenerate'}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Protocol Architecture & Roadmap Card */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200">
          Architecture & Future Offline Roadmap
        </h3>
        <p className="text-xs text-neutral-400 leading-relaxed">
          The <code className="text-amber-400">ITransport</code> abstraction isolates the messaging and chunked binary file engine from WebRTC. This architecture allows future Android native targets to swap in Bluetooth Low Energy (BLE) and Wi-Fi Direct transports using the exact same protocol envelopes.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono">
          <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-center">
            <span className="text-amber-400 font-bold">v0.1 Web MVP</span>
            <div className="text-[10px] text-neutral-400 mt-0.5">WebRTC P2P DataChannels</div>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-center">
            <span className="text-neutral-300 font-bold">v0.3 Android</span>
            <div className="text-[10px] text-neutral-400 mt-0.5">Kotlin / Android SDK</div>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-center">
            <span className="text-neutral-300 font-bold">v0.4 BLE / Wi-Fi</span>
            <div className="text-[10px] text-neutral-400 mt-0.5">Offline Direct Radios</div>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-center">
            <span className="text-neutral-300 font-bold">v0.7 Mesh Relay</span>
            <div className="text-[10px] text-neutral-400 mt-0.5">Multi-hop Store & Forward</div>
          </div>
        </div>
      </div>
    </div>
  );
};
