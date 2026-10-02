import {
  deriveSharedSecretKey,
  encryptAESGCM,
  decryptAESGCMToString,
  importECDHPublicKey,
  importECDSAPublicKey,
  signData,
  verifySignature,
} from '../crypto/crypto.ts';
import { SimoonIdentity, StoredIdentityKeys } from '../../types/index.ts';

export type ProtocolMessageType =
  | 'HANDSHAKE'
  | 'HANDSHAKE_ACK'
  | 'TEXT'
  | 'EDIT_TEXT'
  | 'UNSEND_MESSAGE'
  | 'TYPING_STATUS'
  | 'FILE_OFFER'
  | 'FILE_ACCEPT'
  | 'FILE_REJECT'
  | 'FILE_COMPLETE'
  | 'FILE_CANCEL'
  | 'FILE_REQUEST_CHUNK'
  | 'PING'
  | 'PONG';

export interface ProtocolEnvelope {
  version: 1;
  type: ProtocolMessageType;
  id: string;
  senderId: string;
  recipientId: string;
  timestamp: number;
  encrypted: boolean;
  iv?: string;
  payload: string; // JSON string (if unencrypted handshake) OR ciphertext (if encrypted)
  signature?: string;
}

export interface HandshakePayload {
  ecdhPublicKeyJwk: JsonWebKey;
  ecdsaPublicKeyJwk: JsonWebKey;
  simoonId: string;
  timestamp: number;
}

export class ProtocolEngine {
  private localIdentity: SimoonIdentity;
  private storedKeys: StoredIdentityKeys;
  private localECDHPrivateKey: CryptoKey;
  private localECDSAPrivateKey: CryptoKey;

  // Active E2EE session key for the peer
  private activeSharedKey: CryptoKey | null = null;
  private peerECDHPublicKey: CryptoKey | null = null;
  private peerECDSAPublicKey: CryptoKey | null = null;
  private peerIdentity: SimoonIdentity | null = null;

  constructor(
    localIdentity: SimoonIdentity,
    storedKeys: StoredIdentityKeys,
    localECDHPrivateKey: CryptoKey,
    localECDSAPrivateKey: CryptoKey
  ) {
    this.localIdentity = localIdentity;
    this.storedKeys = storedKeys;
    this.localECDHPrivateKey = localECDHPrivateKey;
    this.localECDSAPrivateKey = localECDSAPrivateKey;
  }

  get isEncryptedSessionReady(): boolean {
    return this.activeSharedKey !== null;
  }

  get remotePeer(): SimoonIdentity | null {
    return this.peerIdentity;
  }

  /**
   * Create an initial unencrypted E2EE Handshake Envelope containing public keys
   */
  async createHandshakeEnvelope(recipientId: string): Promise<string> {
    const handshakeData: HandshakePayload = {
      ecdhPublicKeyJwk: this.localIdentity.ecdhPublicKeyJwk,
      ecdsaPublicKeyJwk: this.localIdentity.ecdsaPublicKeyJwk,
      simoonId: this.localIdentity.id,
      timestamp: Date.now(),
    };

    const payloadJson = JSON.stringify(handshakeData);
    const signature = await signData(this.localECDSAPrivateKey, payloadJson);

    const envelope: ProtocolEnvelope = {
      version: 1,
      type: 'HANDSHAKE',
      id: Math.random().toString(36).substring(2, 10),
      senderId: this.localIdentity.id,
      recipientId,
      timestamp: Date.now(),
      encrypted: false,
      payload: payloadJson,
      signature,
    };

    return JSON.stringify(envelope);
  }

  /**
   * Create Handshake ACK envelope in response
   */
  async createHandshakeAckEnvelope(recipientId: string): Promise<string> {
    const handshakeData: HandshakePayload = {
      ecdhPublicKeyJwk: this.localIdentity.ecdhPublicKeyJwk,
      ecdsaPublicKeyJwk: this.localIdentity.ecdsaPublicKeyJwk,
      simoonId: this.localIdentity.id,
      timestamp: Date.now(),
    };

    const payloadJson = JSON.stringify(handshakeData);
    const signature = await signData(this.localECDSAPrivateKey, payloadJson);

    const envelope: ProtocolEnvelope = {
      version: 1,
      type: 'HANDSHAKE_ACK',
      id: Math.random().toString(36).substring(2, 10),
      senderId: this.localIdentity.id,
      recipientId,
      timestamp: Date.now(),
      encrypted: false,
      payload: payloadJson,
      signature,
    };

    return JSON.stringify(envelope);
  }

  /**
   * Handle incoming handshake or handshake ack and derive symmetric AES-GCM 256 key
   */
  async processHandshake(envelope: ProtocolEnvelope): Promise<boolean> {
    try {
      const payload: HandshakePayload = JSON.parse(envelope.payload);

      // 1. Import peer public keys
      const peerECDHKey = await importECDHPublicKey(payload.ecdhPublicKeyJwk);
      const peerECDSAKey = await importECDSAPublicKey(payload.ecdsaPublicKeyJwk);

      // 2. Verify signature
      if (envelope.signature) {
        const isValid = await verifySignature(peerECDSAKey, envelope.signature, envelope.payload);
        if (!isValid) {
          console.error('[SIMOON PROTOCOL] Invalid handshake signature!');
          return false;
        }
      }

      // 3. Derive 256-bit AES-GCM shared symmetric key using ECDH + HKDF
      const sharedKey = await deriveSharedSecretKey(this.localECDHPrivateKey, peerECDHKey);

      this.activeSharedKey = sharedKey;
      this.peerECDHPublicKey = peerECDHKey;
      this.peerECDSAPublicKey = peerECDSAKey;
      this.peerIdentity = {
        id: payload.simoonId,
        createdAt: payload.timestamp,
        ecdhPublicKeyJwk: payload.ecdhPublicKeyJwk,
        ecdsaPublicKeyJwk: payload.ecdsaPublicKeyJwk,
        fingerprint: envelope.senderId,
      };

      return true;
    } catch (e) {
      console.error('[SIMOON PROTOCOL] Failed to process handshake:', e);
      return false;
    }
  }

  /**
   * Package and encrypt an outgoing message or file control packet
   */
  async createEncryptedEnvelope(
    type: ProtocolMessageType,
    recipientId: string,
    data: any
  ): Promise<string> {
    if (!this.activeSharedKey) {
      throw new Error('E2EE Handshake not established. Cannot encrypt payload.');
    }

    const jsonString = JSON.stringify(data);
    const encrypted = await encryptAESGCM(this.activeSharedKey, jsonString);

    const envelope: ProtocolEnvelope = {
      version: 1,
      type,
      id: Math.random().toString(36).substring(2, 10),
      senderId: this.localIdentity.id,
      recipientId,
      timestamp: Date.now(),
      encrypted: true,
      iv: encrypted.iv,
      payload: encrypted.ciphertext,
    };

    return JSON.stringify(envelope);
  }

  /**
   * Decrypt and unpack an incoming message envelope
   */
  async unwrapEnvelope(envelope: ProtocolEnvelope): Promise<{
    type: ProtocolMessageType;
    data: any;
    envelope: ProtocolEnvelope;
  }> {
    if (!envelope.encrypted) {
      const data = JSON.parse(envelope.payload);
      return { type: envelope.type, data, envelope };
    }

    if (!this.activeSharedKey) {
      throw new Error('Received encrypted payload before E2EE key establishment.');
    }

    if (!envelope.iv) {
      throw new Error('Missing initialization vector (IV) in encrypted envelope.');
    }

    const plaintext = await decryptAESGCMToString(this.activeSharedKey, {
      iv: envelope.iv,
      ciphertext: envelope.payload,
    });

    const data = JSON.parse(plaintext);
    return { type: envelope.type, data, envelope };
  }

  resetSession() {
    this.activeSharedKey = null;
    this.peerECDHPublicKey = null;
    this.peerECDSAPublicKey = null;
    this.peerIdentity = null;
  }
}
