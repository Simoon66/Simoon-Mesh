import { SimoonIdentity, StoredIdentityKeys, ChatMessage, FileTransferRecord, TransportStats, TransportState, ProtocolLogEntry, PeerContact } from '../types/index.ts';
import { getOrCreateIdentity, wipeLocalIdentity } from './identity/identity.ts';
import { WebRTCTransport } from './transport/WebRTCTransport.ts';
import { ProtocolEngine, ProtocolEnvelope } from './messaging/protocol.ts';
import { FileTransferManager } from './files/fileTransfer.ts';
import { localDB } from './storage/db.ts';
import { getSignalingUrl } from '../config.ts';
import { contactManager } from './contacts/ContactManager.ts';
import { notificationService } from '../utils/notifications.ts';

export type SimoonMeshEvent =
  | { type: 'STATE_CHANGED'; state: TransportState }
  | { type: 'PEER_CONNECTED'; peer: SimoonIdentity }
  | { type: 'PEER_DISCONNECTED' }
  | { type: 'MESSAGE_RECEIVED'; message: ChatMessage }
  | { type: 'MESSAGE_EDITED'; messageId: string; newText: string; editedAt: number }
  | { type: 'MESSAGE_UNSENT'; messageId: string }
  | { type: 'TYPING_STATUS'; peerId: string; isTyping: boolean }
  | { type: 'TRANSFER_UPDATED'; transfer: FileTransferRecord }
  | { type: 'STATS_UPDATED'; stats: TransportStats }
  | { type: 'LOG_ENTRY'; log: ProtocolLogEntry };

export class SimoonMeshClient {
  public identity!: SimoonIdentity;
  public storedKeys!: StoredIdentityKeys;
  public transport!: WebRTCTransport;
  public protocol!: ProtocolEngine;
  public fileManager!: FileTransferManager;

  public connectedPeer: SimoonIdentity | null = null;
  public connectionState: TransportState = 'disconnected';
  public logs: ProtocolLogEntry[] = [];

  private listeners: ((event: SimoonMeshEvent) => void)[] = [];
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Initialize local cryptographic identity
    const idResult = await getOrCreateIdentity();
    this.identity = idResult.identity;
    this.storedKeys = idResult.storedKeys;

    // 2. Initialize transport
    this.transport = new WebRTCTransport(this.identity.id);

    // 3. Initialize protocol engine
    this.protocol = new ProtocolEngine(
      this.identity,
      this.storedKeys,
      idResult.ecdhPrivateKey,
      idResult.ecdsaPrivateKey
    );

    // 4. Initialize file transfer manager
    this.fileManager = new FileTransferManager(this.transport, this.identity.id);

    // Wire file manager control sender to use E2EE protocol
    this.fileManager.setControlSender(async (type, data) => {
      if (!this.connectedPeer) return;
      this.log('out', 'FILE', `Send control packet: ${type}`);
      const envelopeJson = await this.protocol.createEncryptedEnvelope(
        type as any,
        this.connectedPeer.id,
        data
      );
      await this.transport.send(envelopeJson);
    });

    // Wire file manager updates
    this.fileManager.onTransferUpdate(async (record) => {
      await localDB.saveTransfer(record);
      this.emit({ type: 'TRANSFER_UPDATED', transfer: record });
    });

    // Wire transport listeners
    this.transport.onStateChange(async (state) => {
      this.connectionState = state;
      this.emit({ type: 'STATE_CHANGED', state });
      this.log('system', 'TRANSPORT', `Connection state changed: ${state}`);

      if (state === 'connected') {
        this.log('system', 'TRANSPORT', `DataChannel verified via SIMOON_MESH_TEST handshake!`);
        // Establish E2EE keys
        if (this.transport.peerId) {
          this.log('out', 'CRYPTO', `Initiating E2EE cryptographic handshake with ${this.transport.peerId}`);
          try {
            const handshakeJson = await this.protocol.createHandshakeEnvelope(this.transport.peerId);
            await this.transport.send(handshakeJson);
          } catch (e: any) {
            this.log('system', 'CRYPTO', `Handshake send error: ${e.message}`);
          }
        }
      } else if (state === 'disconnected' || state === 'failed') {
        const prevId = this.connectedPeer?.id;
        if (prevId) {
          notificationService.notifyPeerDisconnected(prevId);
        }
        this.connectedPeer = null;
        this.protocol.resetSession();
        this.emit({ type: 'PEER_DISCONNECTED' });
      }
    });

    this.transport.onStatsChange((stats) => {
      this.emit({ type: 'STATS_UPDATED', stats });
    });

    this.transport.onReceive((data) => {
      this.handleIncomingData(data);
    });

    // Start background signaling listener so device can receive calls anytime
    this.transport.startSignalingPoll();

    this.isInitialized = true;
    this.log('system', 'PROTOCOL', `SIMOON MESH node initialized: ${this.identity.id}`);

    // Announce presence on network
    this.announcePresence();
  }

  private log(direction: 'in' | 'out' | 'system', category: ProtocolLogEntry['category'], summary: string, details?: any) {
    const entry: ProtocolLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      direction,
      category,
      summary,
      details,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 100) this.logs.pop();
    this.emit({ type: 'LOG_ENTRY', log: entry });
  }

  private async announcePresence() {
    try {
      const baseUrl = getSignalingUrl();
      await fetch(`${baseUrl}/api/signal/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: this.identity.id }),
      });
    } catch (e) {}
  }

  private async handleIncomingData(data: string | ArrayBuffer) {
    // 1. Binary frames (File chunks)
    if (data instanceof ArrayBuffer) {
      this.log('in', 'FILE', `Received raw binary chunk frame (${data.byteLength} bytes)`);
      await this.fileManager.handleIncomingChunkFrame(data);
      return;
    }

    // 2. Text / JSON Envelope
    try {
      const envelope: ProtocolEnvelope = JSON.parse(data);

      if (envelope.type === 'HANDSHAKE') {
        this.log('in', 'CRYPTO', `Received E2EE Handshake from ${envelope.senderId}`);
        const success = await this.protocol.processHandshake(envelope);
        if (success && this.protocol.remotePeer) {
          this.connectedPeer = this.protocol.remotePeer;
          this.log('system', 'CRYPTO', `E2EE established! AES-GCM 256 session key active.`);

          // Update contact last seen
          contactManager.updateLastConnected(this.connectedPeer.id);
          await localDB.saveContact({
            peerId: this.connectedPeer.id,
            ecdhPublicKeyJwk: this.connectedPeer.ecdhPublicKeyJwk,
            ecdsaPublicKeyJwk: this.connectedPeer.ecdsaPublicKeyJwk,
            fingerprint: this.connectedPeer.fingerprint,
            lastConnected: Date.now(),
            messagesCount: 0,
          });

          // Send HANDSHAKE_ACK
          const ackJson = await this.protocol.createHandshakeAckEnvelope(envelope.senderId);
          await this.transport.send(ackJson);

          const contact = contactManager.get(this.connectedPeer.id);
          notificationService.notifyPeerConnected(this.connectedPeer.id, contact?.alias);
          this.emit({ type: 'PEER_CONNECTED', peer: this.connectedPeer });
        }
        return;
      }

      if (envelope.type === 'HANDSHAKE_ACK') {
        this.log('in', 'CRYPTO', `Received E2EE Handshake ACK from ${envelope.senderId}`);
        const success = await this.protocol.processHandshake(envelope);
        if (success && this.protocol.remotePeer) {
          this.connectedPeer = this.protocol.remotePeer;
          this.log('system', 'CRYPTO', `E2EE mutual verification verified! AES-GCM 256 ready.`);

          contactManager.updateLastConnected(this.connectedPeer.id);
          await localDB.saveContact({
            peerId: this.connectedPeer.id,
            ecdhPublicKeyJwk: this.connectedPeer.ecdhPublicKeyJwk,
            ecdsaPublicKeyJwk: this.connectedPeer.ecdsaPublicKeyJwk,
            fingerprint: this.connectedPeer.fingerprint,
            lastConnected: Date.now(),
            messagesCount: 0,
          });

          const contact = contactManager.get(this.connectedPeer.id);
          notificationService.notifyPeerConnected(this.connectedPeer.id, contact?.alias);
          this.emit({ type: 'PEER_CONNECTED', peer: this.connectedPeer });
        }
        return;
      }

      // Handle encrypted application payloads
      const { type, data: payloadData } = await this.protocol.unwrapEnvelope(envelope);
      this.log('in', 'PROTOCOL', `Decrypted message: ${type}`);

      if (type === 'TEXT') {
        const msgId = payloadData.messageId || envelope.id;
        const chatMsg: ChatMessage = {
          id: msgId,
          conversationId: envelope.senderId,
          senderId: envelope.senderId,
          recipientId: this.identity.id,
          timestamp: envelope.timestamp,
          status: 'delivered',
          type: 'text',
          text: payloadData.text,
          isSelf: false,
        };
        await localDB.saveMessage(chatMsg);
        this.emit({ type: 'MESSAGE_RECEIVED', message: chatMsg });

        // Trigger notification
        const contact = contactManager.get(envelope.senderId);
        const senderName = contact?.alias || `Peer ${envelope.senderId.slice(0, 4)}`;
        notificationService.notifyIncoming(senderName, payloadData.text || 'Sent a message');
      } else if (type === 'EDIT_TEXT') {
        const { messageId, newText, editedAt } = payloadData;
        await localDB.updateMessageText(messageId, newText, editedAt);
        this.emit({ type: 'MESSAGE_EDITED', messageId, newText, editedAt });
        this.log('in', 'PROTOCOL', `Peer edited message ${messageId}`);
      } else if (type === 'UNSEND_MESSAGE') {
        const { messageId } = payloadData;
        await localDB.deleteMessage(messageId);
        this.emit({ type: 'MESSAGE_UNSENT', messageId });
        this.log('in', 'PROTOCOL', `Peer unsent message ${messageId}`);
      } else if (type === 'TYPING_STATUS') {
        const isTyping = Boolean(payloadData?.isTyping);
        this.emit({
          type: 'TYPING_STATUS',
          peerId: envelope.senderId,
          isTyping,
        });
      } else if (type === 'FILE_OFFER') {
        this.log('in', 'FILE', `Incoming file offer: ${payloadData.name} (${payloadData.size} bytes)`);
        const transfer = this.fileManager.handleFileOffer(payloadData);
        // Also post a chat message representing this file
        const chatMsg: ChatMessage = {
          id: `file-msg-${transfer.transferId}`,
          conversationId: envelope.senderId,
          senderId: envelope.senderId,
          recipientId: this.identity.id,
          timestamp: Date.now(),
          status: 'delivered',
          type: 'file',
          fileTransferId: transfer.transferId,
          fileMetadata: {
            name: transfer.fileName,
            size: transfer.fileSize,
            mimeType: transfer.mimeType,
            sha256: transfer.sha256Checksum,
          },
          isSelf: false,
        };
        await localDB.saveMessage(chatMsg);
        this.emit({ type: 'MESSAGE_RECEIVED', message: chatMsg });

        const contact = contactManager.get(envelope.senderId);
        const senderName = contact?.alias || `Peer ${envelope.senderId.slice(0, 4)}`;
        notificationService.notifyIncoming(senderName, `Sent file: ${transfer.fileName}`);
      } else if (type === 'FILE_ACCEPT') {
        this.log('in', 'FILE', `Peer accepted file transfer ${payloadData.transferId}. Starting streaming...`);
        this.fileManager.startStreamingFileChunks(payloadData.transferId).catch(console.error);
      } else if (type === 'FILE_CANCEL') {
        this.log('in', 'FILE', `Peer cancelled file transfer ${payloadData.transferId}`);
        this.fileManager.handleRemoteCancellation(payloadData.transferId);
      }
    } catch (err) {
      console.error('[SIMOON] Error processing incoming payload:', err);
      this.log('system', 'PROTOCOL', `Payload decode/decrypt error: ${String(err)}`);
    }
  }

  /**
   * Send a text message to the currently connected peer
   */
  async sendMessage(text: string): Promise<ChatMessage> {
    if (!this.connectedPeer || this.connectionState !== 'connected') {
      throw new Error('No peer currently connected.');
    }

    const messageId = Math.random().toString(36).substring(2, 12);
    const chatMsg: ChatMessage = {
      id: messageId,
      conversationId: this.connectedPeer.id,
      senderId: this.identity.id,
      recipientId: this.connectedPeer.id,
      timestamp: Date.now(),
      status: 'sent',
      type: 'text',
      text,
      isSelf: true,
    };

    // Save to local database
    await localDB.saveMessage(chatMsg);

    // Encrypt and send
    this.log('out', 'CRYPTO', `Encrypting message with AES-GCM 256 for ${this.connectedPeer.id}`);
    const envelopeJson = await this.protocol.createEncryptedEnvelope(
      'TEXT',
      this.connectedPeer.id,
      { messageId, text }
    );
    await this.transport.send(envelopeJson);

    this.emit({ type: 'MESSAGE_RECEIVED', message: chatMsg });
    return chatMsg;
  }

  /**
   * Edit a text message and sync with remote peer if connected
   */
  async editText(messageId: string, newText: string): Promise<void> {
    const editedAt = Date.now();
    await localDB.updateMessageText(messageId, newText, editedAt);
    this.emit({ type: 'MESSAGE_EDITED', messageId, newText, editedAt });

    // Send encrypted frame to peer if connected
    if (this.connectedPeer && this.connectionState === 'connected' && this.protocol.isEncryptedSessionReady) {
      try {
        const envelopeJson = await this.protocol.createEncryptedEnvelope(
          'EDIT_TEXT',
          this.connectedPeer.id,
          { messageId, newText, editedAt }
        );
        await this.transport.send(envelopeJson);
      } catch (err) {
        console.warn('[SIMOON] Could not transmit message edit to peer over WebRTC:', err);
      }
    }
  }

  /**
   * Send real-time typing status over E2EE WebRTC channel
   */
  async sendTypingStatus(isTyping: boolean): Promise<void> {
    if (!this.connectedPeer || this.connectionState !== 'connected' || !this.protocol.isEncryptedSessionReady) {
      return;
    }
    try {
      const envelopeJson = await this.protocol.createEncryptedEnvelope(
        'TYPING_STATUS',
        this.connectedPeer.id,
        { isTyping }
      );
      await this.transport.send(envelopeJson);
    } catch {
      // Non-critical: ignore typing status delivery failure
    }
  }

  /**
   * Delete message for me: removes from local IndexedDB only (does not delete for peer)
   */
  async deleteMessageForMe(messageId: string): Promise<void> {
    await localDB.deleteMessage(messageId);
    this.emit({ type: 'MESSAGE_UNSENT', messageId });
  }

  /**
   * Delete message for everyone (Unsend): removes from local database AND sends encrypted unsend frame to remote peer
   */
  async deleteMessageForEveryone(messageId: string): Promise<void> {
    await localDB.deleteMessage(messageId);
    this.emit({ type: 'MESSAGE_UNSENT', messageId });

    // Send encrypted unsend frame to peer if connected
    if (this.connectedPeer && this.connectionState === 'connected' && this.protocol.isEncryptedSessionReady) {
      try {
        const envelopeJson = await this.protocol.createEncryptedEnvelope(
          'UNSEND_MESSAGE',
          this.connectedPeer.id,
          { messageId }
        );
        await this.transport.send(envelopeJson);
        this.log('out', 'PROTOCOL', `Sent unsend packet for ${messageId}`);
      } catch (err) {
        console.warn('[SIMOON] Could not transmit message unsend to peer over WebRTC:', err);
      }
    }
  }

  /**
   * Alias for deleteMessageForEveryone
   */
  async unsendMessage(messageId: string): Promise<void> {
    return this.deleteMessageForEveryone(messageId);
  }

  /**
   * Send a file to connected peer
   */
  async sendFile(file: File): Promise<string> {
    if (!this.connectedPeer || this.connectionState !== 'connected') {
      throw new Error('No peer currently connected.');
    }

    const transferId = await this.fileManager.sendFile(file, this.connectedPeer.id);
    const transfer = this.fileManager.getTransfer(transferId)!;

    // Create chat message entry for this file
    const chatMsg: ChatMessage = {
      id: `file-msg-${transferId}`,
      conversationId: this.connectedPeer.id,
      senderId: this.identity.id,
      recipientId: this.connectedPeer.id,
      timestamp: Date.now(),
      status: 'sent',
      type: 'file',
      fileTransferId: transferId,
      fileMetadata: {
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        sha256: transfer.sha256Checksum,
      },
      isSelf: true,
    };

    await localDB.saveMessage(chatMsg);
    this.emit({ type: 'MESSAGE_RECEIVED', message: chatMsg });

    return transferId;
  }

  /**
   * Connect to target peer ID via automated signaling
   */
  async connectToPeer(remotePeerId: string): Promise<void> {
    const cleanId = remotePeerId.trim().toUpperCase();
    this.log('system', 'TRANSPORT', `Initiating WebRTC connection to peer ${cleanId}...`);
    await this.transport.connect(cleanId);
  }

  /**
   * Create a 6-digit pairing session code (e.g. 482-195)
   * Works on both full-stack servers and static hosting via the Public WebRTC Relay!
   */
  async createPairingSession(): Promise<string> {
    // Generate random 6-digit formatted code
    const raw = Math.floor(100000 + Math.random() * 900000).toString();
    const localCode = `${raw.slice(0, 3)}-${raw.slice(3, 6)}`;

    // 1. Immediately subscribe host to the session topic on Public Relay
    this.transport.publicRelay.listenToSession(localCode);

    // 2. Dual-homed: Attempt server-side registration if available, but gracefully fallback
    try {
      const baseUrl = getSignalingUrl();
      const res = await fetch(`${baseUrl}/api/signal/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostPeerId: this.identity.id }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.code) {
          this.transport.publicRelay.listenToSession(data.code);
          this.log('system', 'TRANSPORT', `Pairing session created: ${data.code}. Waiting for peer to connect...`);
          return data.code;
        }
      }
    } catch (e) {
      // Ignore 405/network error on static hosts
    }

    this.log('system', 'TRANSPORT', `Pairing session created: ${localCode} (via Public WebRTC Relay). Waiting for peer to connect...`);
    return localCode;
  }

  /**
   * Join an existing pairing session by 6-digit code
   * Works on both full-stack servers and static hosting via the Public WebRTC Relay!
   */
  async joinPairingSession(code: string): Promise<string> {
    const cleanCode = code.trim().replace(/\s+/g, '');
    const formatted = cleanCode.includes('-') ? cleanCode : `${cleanCode.slice(0, 3)}-${cleanCode.slice(3, 6)}`;

    this.log('system', 'TRANSPORT', `Joining session ${formatted} via Public WebRTC Relay...`);

    // 1. Announce join on Public Relay
    await this.transport.publicRelay.announceJoinSession(formatted);

    // 2. Dual-homed: Also notify REST backend if available
    try {
      const baseUrl = getSignalingUrl();
      const res = await fetch(`${baseUrl}/api/signal/session/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: formatted, guestPeerId: this.identity.id }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.hostPeerId) {
          this.log('system', 'TRANSPORT', `Host resolved: ${data.hostPeerId}. Initiating WebRTC...`);
          await this.connectToPeer(data.hostPeerId);
          return data.hostPeerId;
        }
      }
    } catch (e) {
      // Ignore 405 on static CDN
    }

    return formatted;
  }

  /**
   * Airgap mode: Generate SDP Offer for offline/QR pairing
   */
  async createAirgapOffer(): Promise<string> {
    this.log('system', 'TRANSPORT', 'Generating airgapped SDP offer bundle...');
    return await this.transport.generateAirgapOffer();
  }

  /**
   * Airgap mode: Accept SDP Offer, generate SDP Answer
   */
  async acceptAirgapOffer(offerToken: string): Promise<string> {
    this.log('system', 'TRANSPORT', 'Accepting airgapped SDP offer bundle...');
    return await this.transport.acceptAirgapOffer(offerToken);
  }

  /**
   * Airgap mode: Accept SDP Answer
   */
  async acceptAirgapAnswer(answerToken: string): Promise<void> {
    this.log('system', 'TRANSPORT', 'Accepting airgapped SDP answer bundle...');
    await this.transport.acceptAirgapAnswer(answerToken);
  }

  /**
   * Disconnect from current peer
   */
  async disconnect(): Promise<void> {
    this.log('system', 'TRANSPORT', 'Disconnecting peer transport...');
    const prevId = this.connectedPeer?.id;
    await this.transport.disconnect();
    this.connectedPeer = null;
    this.protocol.resetSession();
    if (prevId) {
      notificationService.notifyPeerDisconnected(prevId);
    }
    this.emit({ type: 'PEER_DISCONNECTED' });
  }

  /**
   * Wipe all local data and regenerate identity
   */
  async resetNode(): Promise<void> {
    await this.transport.disconnect();
    await wipeLocalIdentity();
    await localDB.clearAll();
    window.location.reload();
  }

  // --- Subscriptions ---
  subscribe(callback: (event: SimoonMeshEvent) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private emit(event: SimoonMeshEvent) {
    this.listeners.forEach(cb => {
      try {
        cb(event);
      } catch (e) {
        console.error('Error in subscriber callback:', e);
      }
    });
  }
}

// Singleton client instance
export const simoonClient = new SimoonMeshClient();
