export type TransportState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'closed';

export type TransportType =
  | 'webrtc-p2p'
  | 'bluetooth-le'
  | 'wifi-direct'
  | 'mesh-relay';

export interface TransportStats {
  bytesSent: number;
  bytesReceived: number;
  currentRateBytesPerSec: number;
  packetsSent: number;
  packetsReceived: number;
  bufferedAmount: number;
  iceConnectionState?: string;
  iceGatheringState?: string;
  signalingState?: string;
  rttMs?: number;
  lastActiveTimestamp: number;
}

export interface SimoonIdentity {
  id: string; // Formatted 8F4A-29C1-7D52
  createdAt: number;
  ecdhPublicKeyJwk: JsonWebKey;
  ecdsaPublicKeyJwk: JsonWebKey;
  fingerprint: string; // Hex fingerprint of public keys
}

export interface StoredIdentityKeys {
  identity: SimoonIdentity;
  ecdhPrivateKeyJwk: JsonWebKey;
  ecdsaPrivateKeyJwk: JsonWebKey;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'failed';
  type: 'text' | 'file';
  text?: string;
  fileTransferId?: string;
  fileMetadata?: {
    name: string;
    size: number;
    mimeType: string;
    sha256: string;
  };
  isSelf: boolean;
}

export interface FileTransferRecord {
  transferId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
  sha256Checksum: string;
  senderId: string;
  recipientId: string;
  direction: 'outgoing' | 'incoming';
  status: 'pending' | 'transferring' | 'completed' | 'cancelled' | 'failed';
  chunksCompleted: number;
  bytesTransferred: number;
  transferSpeedBytesPerSec: number;
  estimatedSecondsRemaining: number;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
  blobUrl?: string; // For preview or download
  fileData?: Blob;
}

export interface PeerContact {
  peerId: string;
  nickname?: string;
  ecdhPublicKeyJwk?: JsonWebKey;
  ecdsaPublicKeyJwk?: JsonWebKey;
  fingerprint?: string;
  lastConnected?: number;
  messagesCount: number;
}

export interface ProtocolLogEntry {
  id: string;
  timestamp: number;
  direction: 'in' | 'out' | 'system';
  category: 'TRANSPORT' | 'CRYPTO' | 'PROTOCOL' | 'FILE';
  summary: string;
  details?: any;
}
