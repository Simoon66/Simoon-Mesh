import { ITransport } from './Transport.ts';
import { TransportState, TransportType, TransportStats } from '../../types/index.ts';
import { getSignalingUrl } from '../../config.ts';
import { getIceConfiguration } from './webrtc/iceConfig.ts';
import { PublicSignalingChannel } from './webrtc/PublicSignalingChannel.ts';

const DRAIN_THRESHOLD = 64 * 1024; // 64 KB
const CONNECTION_TIMEOUT_MS = 25000; // 25 seconds timeout

export interface WebRTCConnectionOptions {
  isInitiator?: boolean;
}

export class WebRTCTransport implements ITransport {
  readonly type: TransportType = 'webrtc-p2p';
  state: TransportState = 'disconnected';
  peerId: string | null = null;
  localPeerId: string;

  // Free public WebRTC signaling relay fallback (for static hosts like Cloudflare Pages)
  public publicRelay: PublicSignalingChannel;

  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;

  private receiveCallbacks: ((data: string | ArrayBuffer) => void)[] = [];
  private stateCallbacks: ((state: TransportState) => void)[] = [];
  private statsCallbacks: ((stats: TransportStats) => void)[] = [];
  private drainResolvers: (() => void)[] = [];

  // ICE Candidates queue to prevent candidate-before-remoteDescription loss
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];

  // Polling control for signaling
  private pollingActive = false;
  private pollTimer: any = null;
  private consecutiveErrors = 0;

  // Rate and throughput metrics
  private bytesSentLastSec = 0;
  private bytesRecvLastSec = 0;
  private rateIntervalTimer: any = null;

  // Verification handshake state (SIMOON_MESH_TEST / ACK)
  public isDataChannelVerified = false;
  private testSentTimestamp = 0;
  private connectionTimer: any = null;

  stats: TransportStats = {
    bytesSent: 0,
    bytesReceived: 0,
    currentRateBytesPerSec: 0,
    packetsSent: 0,
    packetsReceived: 0,
    bufferedAmount: 0,
    iceConnectionState: 'new',
    iceGatheringState: 'new',
    peerConnectionState: 'new',
    signalingState: 'stable',
    signalingStatus: 'Initializing',
    dataChannelState: 'closed',
    lastError: null,
    lastActiveTimestamp: Date.now(),
  };

  constructor(localPeerId: string) {
    this.localPeerId = localPeerId;
    this.publicRelay = new PublicSignalingChannel(localPeerId);

    // Wire public relay incoming messages
    this.publicRelay.onMessage((msg) => {
      this.handleSignalingMessage(msg);
    });

    this.publicRelay.connect().then(() => {
      if (this.publicRelay.isConnected) {
        this.stats.signalingStatus = 'Public Relay (Active)';
        this.notifyStats();
      }
    });

    this.startRateMeter();
  }

  public setState(newState: TransportState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateCallbacks.forEach(cb => cb(newState));
    }
  }

  private setLastError(errorMsg: string) {
    this.stats.lastError = errorMsg;
    this.notifyStats();
  }

  private notifyStats() {
    this.stats.bufferedAmount = this.getBufferedAmount();
    if (this.pc) {
      this.stats.iceConnectionState = this.pc.iceConnectionState;
      this.stats.iceGatheringState = this.pc.iceGatheringState;
      this.stats.peerConnectionState = this.pc.connectionState;
      this.stats.signalingState = this.pc.signalingState;
    }
    if (this.channel) {
      this.stats.dataChannelState = this.channel.readyState;
    }
    this.statsCallbacks.forEach(cb => cb({ ...this.stats }));
  }

  private startRateMeter() {
    this.rateIntervalTimer = setInterval(() => {
      const currentRate = this.bytesSentLastSec + this.bytesRecvLastSec;
      this.bytesSentLastSec = 0;
      this.bytesRecvLastSec = 0;

      this.stats.currentRateBytesPerSec = currentRate;
      this.notifyStats();
    }, 1000);
  }

  /**
   * Initialize a pristine RTCPeerConnection instance with complete lifecycle event logging
   */
  private setupPeerConnection(targetPeerId?: string): RTCPeerConnection {
    if (this.pc) {
      this.cleanupPeerConnection();
    }

    const config = getIceConfiguration();
    const pc = new RTCPeerConnection(config);
    this.pc = pc;
    this.pendingRemoteCandidates = [];
    this.isDataChannelVerified = false;

    if (targetPeerId) {
      this.peerId = targetPeerId;
    }

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (this.peerId) {
          this.postSignal(this.peerId, 'candidate', event.candidate.toJSON());
        }
      }
    };

    // ICE Candidate Error
    pc.onicecandidateerror = (event: any) => {
      const msg = `ICE candidate error: code ${event.errorCode} (${event.errorText || 'Unknown'}) on ${event.url || 'STUN'}`;
      this.setLastError(msg);
    };

    // ICE Gathering State Change
    pc.onicegatheringstatechange = () => {
      this.stats.iceGatheringState = pc.iceGatheringState;
      this.notifyStats();
    };

    // Signaling State Change
    pc.onsignalingstatechange = () => {
      this.stats.signalingState = pc.signalingState;
      this.notifyStats();
    };

    // ICE Connection State Change
    pc.oniceconnectionstatechange = () => {
      this.stats.iceConnectionState = pc.iceConnectionState;
      this.notifyStats();

      if (pc.iceConnectionState === 'failed') {
        this.setLastError('ICE connection failed: Direct NAT traversal failed. Check network or try Airgap mode.');
        this.setState('failed');
      } else if (pc.iceConnectionState === 'disconnected') {
        this.setState('disconnected');
      }
    };

    // Peer Connection State Change
    pc.onconnectionstatechange = () => {
      this.stats.peerConnectionState = pc.connectionState;
      this.notifyStats();

      if (pc.connectionState === 'failed') {
        this.setLastError('WebRTC PeerConnection failed.');
        this.setState('failed');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        this.setState('disconnected');
      }
    };

    // Callee receives incoming DataChannel
    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    return pc;
  }

  /**
   * Configure and bind DataChannel events with verification handshake
   */
  private setupDataChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = DRAIN_THRESHOLD;
    this.stats.dataChannelState = channel.readyState;
    this.notifyStats();

    channel.onopen = () => {
      this.stats.dataChannelState = 'open';
      this.notifyStats();

      // Begin DataChannel verification handshake:
      // Initiator sends SIMOON_MESH_TEST
      this.testSentTimestamp = Date.now();
      try {
        const testPayload = JSON.stringify({
          type: 'SYSTEM_TEST',
          payload: 'SIMOON_MESH_TEST',
          timestamp: this.testSentTimestamp,
        });
        channel.send(testPayload);
      } catch (err) {
        console.error('Failed to send verification test on channel open:', err);
      }
    };

    channel.onclose = () => {
      this.stats.dataChannelState = 'closed';
      this.isDataChannelVerified = false;
      this.setState('disconnected');
      this.notifyStats();
    };

    channel.onerror = (err) => {
      this.setLastError(`DataChannel error: ${String(err)}`);
      this.notifyStats();
    };

    channel.onbufferedamountlow = () => {
      const resolvers = [...this.drainResolvers];
      this.drainResolvers = [];
      resolvers.forEach(r => r());
    };

    channel.onmessage = (event) => {
      this.stats.packetsReceived++;
      this.stats.lastActiveTimestamp = Date.now();

      const byteLength = typeof event.data === 'string'
        ? event.data.length
        : (event.data as ArrayBuffer).byteLength;

      this.stats.bytesReceived += byteLength;
      this.bytesRecvLastSec += byteLength;

      // Check for internal SYSTEM_TEST and SYSTEM_TEST_ACK verification messages
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'SYSTEM_TEST' && parsed.payload === 'SIMOON_MESH_TEST') {
            // Respond with ACK immediately
            const ackPayload = JSON.stringify({
              type: 'SYSTEM_TEST_ACK',
              payload: 'SIMOON_MESH_ACK',
              timestamp: Date.now(),
            });
            channel.send(ackPayload);
            // Callee verified!
            this.isDataChannelVerified = true;
            this.setState('connected');
            if (this.connectionTimer) {
              clearTimeout(this.connectionTimer);
              this.connectionTimer = null;
            }
            return;
          }

          if (parsed.type === 'SYSTEM_TEST_ACK' && parsed.payload === 'SIMOON_MESH_ACK') {
            // Initiator verified!
            this.isDataChannelVerified = true;
            this.stats.rttMs = Math.max(1, Date.now() - this.testSentTimestamp);
            this.setState('connected');
            if (this.connectionTimer) {
              clearTimeout(this.connectionTimer);
              this.connectionTimer = null;
            }
            return;
          }
        } catch (e) {
          // Normal message string (handled below)
        }
      }

      // Normal application message or binary chunk
      this.receiveCallbacks.forEach(cb => cb(event.data));
    };
  }

  /**
   * Drain queued remote ICE candidates after remote description is applied
   */
  private async drainPendingCandidates() {
    if (!this.pc || !this.pc.remoteDescription) return;
    while (this.pendingRemoteCandidates.length > 0) {
      const cand = this.pendingRemoteCandidates.shift()!;
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn('Error applying queued ICE candidate:', err);
      }
    }
  }

  /**
   * Connect to target peer via automated signaling
   */
  async connect(remotePeerId: string, options?: WebRTCConnectionOptions): Promise<void> {
    const targetId = remotePeerId.trim().toUpperCase();
    this.peerId = targetId;
    this.setState('connecting');
    this.stats.lastError = null;
    this.notifyStats();

    // Start 25-second connection timeout
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    this.connectionTimer = setTimeout(() => {
      if (this.state === 'connecting') {
        this.setLastError('Connection attempt timed out waiting for WebRTC negotiation.');
        this.setState('failed');
      }
    }, CONNECTION_TIMEOUT_MS);

    const pc = this.setupPeerConnection(targetId);

    // Create DataChannel (Initiator creates channel)
    const channel = pc.createDataChannel('simoon-mesh', { ordered: true });
    this.setupDataChannel(channel);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.postSignal(targetId, 'offer', offer);
    } catch (err: any) {
      this.setLastError(`Failed to create WebRTC offer: ${err.message || String(err)}`);
      this.setState('failed');
      throw err;
    }
  }

  /**
   * Airgap / Manual Mode: Generate an SDP Offer for QR / Token export
   */
  async generateAirgapOffer(): Promise<string> {
    this.setState('connecting');
    const pc = this.setupPeerConnection();
    const channel = pc.createDataChannel('simoon-mesh', { ordered: true });
    this.setupDataChannel(channel);

    const candidates: RTCIceCandidateInit[] = [];

    const offerPromise = new Promise<string>((resolve, reject) => {
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          candidates.push(e.candidate.toJSON());
        } else {
          // Gathering complete!
          const bundle = {
            sdp: pc.localDescription,
            candidates,
            senderId: this.localPeerId,
          };
          resolve(btoa(JSON.stringify(bundle)));
        }
      };

      setTimeout(() => {
        if (pc.localDescription) {
          const bundle = {
            sdp: pc.localDescription,
            candidates,
            senderId: this.localPeerId,
          };
          resolve(btoa(JSON.stringify(bundle)));
        } else {
          reject(new Error('ICE Gathering timed out for Airgap offer'));
        }
      }, 4000);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return await offerPromise;
  }

  /**
   * Airgap / Manual Mode: Accept an SDP Offer token, return an SDP Answer token
   */
  async acceptAirgapOffer(offerTokenBase64: string): Promise<string> {
    this.setState('connecting');
    const jsonStr = atob(offerTokenBase64);
    const bundle = JSON.parse(jsonStr);

    this.peerId = bundle.senderId;
    const pc = this.setupPeerConnection(bundle.senderId);

    const candidates: RTCIceCandidateInit[] = [];

    const answerPromise = new Promise<string>((resolve, reject) => {
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          candidates.push(e.candidate.toJSON());
        } else {
          const answerBundle = {
            sdp: pc.localDescription,
            candidates,
            senderId: this.localPeerId,
          };
          resolve(btoa(JSON.stringify(answerBundle)));
        }
      };

      setTimeout(() => {
        if (pc.localDescription) {
          const answerBundle = {
            sdp: pc.localDescription,
            candidates,
            senderId: this.localPeerId,
          };
          resolve(btoa(JSON.stringify(answerBundle)));
        } else {
          reject(new Error('ICE gathering timed out for Airgap answer'));
        }
      }, 4000);
    });

    await pc.setRemoteDescription(new RTCSessionDescription(bundle.sdp));

    if (Array.isArray(bundle.candidates)) {
      for (const cand of bundle.candidates) {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    return await answerPromise;
  }

  /**
   * Airgap / Manual Mode: Complete handshake with received SDP Answer token
   */
  async acceptAirgapAnswer(answerTokenBase64: string): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    const jsonStr = atob(answerTokenBase64);
    const bundle = JSON.parse(jsonStr);

    if (bundle.senderId) {
      this.peerId = bundle.senderId;
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(bundle.sdp));

    if (Array.isArray(bundle.candidates)) {
      for (const cand of bundle.candidates) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('ICE Candidate add error:', e);
        }
      }
    }
  }

  // --- Automated Signaling Helpers ---

  public async postSignal(targetId: string, type: string, payload: any) {
    // 1. Instant delivery via Public WebRTC Signaling Relay
    this.publicRelay.sendSignal(targetId, type as any, payload).catch((err) => {
      console.warn('[SIMOON] Public relay send warning:', err);
    });

    // 2. Dual-homed: Also post to local /api/signal if available
    try {
      const baseUrl = getSignalingUrl();
      const res = await fetch(`${baseUrl}/api/signal/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: this.localPeerId,
          targetId,
          type,
          payload,
        }),
      });

      if (res.ok) {
        this.stats.signalingStatus = 'HTTP + Relay (Active)';
        this.notifyStats();
      }
    } catch (e: any) {
      // Quietly ignore network/405 errors since publicRelay provides delivery
    }
  }

  public startSignalingPoll() {
    if (this.pollingActive) return;
    this.pollingActive = true;
    this.stats.signalingStatus = this.publicRelay.isConnected ? 'Public Relay (Active)' : 'Connecting Relay...';
    this.notifyStats();

    const poll = async () => {
      if (!this.pollingActive) return;

      try {
        const baseUrl = getSignalingUrl();
        const res = await fetch(`${baseUrl}/api/signal/poll/${encodeURIComponent(this.localPeerId)}`);
        if (res.ok) {
          this.consecutiveErrors = 0;
          this.stats.signalingStatus = 'HTTP + Relay (Active)';
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            for (const msg of data.messages) {
              await this.handleSignalingMessage(msg);
            }
          }
        } else {
          this.consecutiveErrors++;
          // When deployed on static Cloudflare Pages, /api/signal returns 405/404.
          // The public relay is active and handling messages!
          this.stats.signalingStatus = 'Public Relay (Active)';
        }
      } catch (e: any) {
        this.consecutiveErrors++;
        this.stats.signalingStatus = 'Public Relay (Active)';
      }

      this.notifyStats();

      if (this.pollingActive) {
        // Backoff if local signaling server is unavailable
        const interval = this.consecutiveErrors > 3 ? 10000 : 1500;
        this.pollTimer = setTimeout(poll, interval);
      }
    };

    poll();
  }

  public stopSignalingPoll() {
    this.pollingActive = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Handle incoming WebRTC signaling message
   */
  private async handleSignalingMessage(msg: any) {
    if (msg.type === 'session_joined') {
      // Guest joined our session. Set peerId and wait for guest's incoming offer
      const guestId = msg.senderId;
      this.peerId = guestId;
      this.setState('connecting');
      this.stats.lastError = null;
      console.log(`[SIMOON SIGNAL] Guest ${guestId} joined session. Awaiting WebRTC offer...`);
      return;
    }

    if (msg.type === 'offer') {
      this.peerId = msg.senderId;
      this.setState('connecting');
      this.stats.lastError = null;

      const pc = this.setupPeerConnection(msg.senderId);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        // Drain any candidates that arrived before remoteDescription
        await this.drainPendingCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.postSignal(msg.senderId, 'answer', answer);
      } catch (err: any) {
        this.setLastError(`Failed to handle incoming offer: ${err.message || String(err)}`);
        this.setState('failed');
      }
      return;
    }

    if (msg.type === 'answer') {
      if (!this.pc) return;
      try {
        if (this.pc.signalingState === 'have-local-offer') {
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          await this.drainPendingCandidates();
        }
      } catch (err: any) {
        this.setLastError(`Failed to apply incoming answer: ${err.message || String(err)}`);
      }
      return;
    }

    if (msg.type === 'candidate') {
      if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(msg.payload));
        } catch (e: any) {
          console.warn('Failed to add received ICE candidate:', e);
        }
      } else {
        // Queue candidate to apply right after remoteDescription is set!
        this.pendingRemoteCandidates.push(msg.payload);
      }
    }
  }

  // --- Send & Buffer Flow Control ---

  async send(data: string | ArrayBuffer): Promise<void> {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('Transport DataChannel is not open');
    }

    const byteLen = typeof data === 'string' ? data.length : data.byteLength;

    // Buffer flow control: wait if buffer exceeds threshold
    if (this.channel.bufferedAmount > 256 * 1024) {
      await this.waitForBufferDrain(128 * 1024);
    }

    if (typeof data === 'string') {
      this.channel.send(data);
    } else {
      this.channel.send(data);
    }

    this.stats.packetsSent++;
    this.stats.bytesSent += byteLen;
    this.bytesSentLastSec += byteLen;
    this.stats.lastActiveTimestamp = Date.now();
    this.notifyStats();
  }

  getBufferedAmount(): number {
    return this.channel ? this.channel.bufferedAmount : 0;
  }

  waitForBufferDrain(maxThreshold: number = DRAIN_THRESHOLD): Promise<void> {
    if (!this.channel || this.channel.bufferedAmount <= maxThreshold) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  async disconnect(): Promise<void> {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
    this.cleanupPeerConnection();
    this.setState('disconnected');
    this.peerId = null;
    this.notifyStats();
  }

  private cleanupPeerConnection() {
    if (this.channel) {
      try {
        this.channel.close();
      } catch (e) {}
      this.channel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch (e) {}
      this.pc = null;
    }
    this.pendingRemoteCandidates = [];
    this.isDataChannelVerified = false;
  }

  onReceive(handler: (data: string | ArrayBuffer) => void): void {
    this.receiveCallbacks.push(handler);
  }

  onStateChange(handler: (state: TransportState) => void): void {
    this.stateCallbacks.push(handler);
  }

  onStatsChange(handler: (stats: TransportStats) => void): void {
    this.statsCallbacks.push(handler);
  }

  destroy() {
    this.stopSignalingPoll();
    this.disconnect();
    this.publicRelay.destroy();
    if (this.rateIntervalTimer) {
      clearInterval(this.rateIntervalTimer);
      this.rateIntervalTimer = null;
    }
  }
}
