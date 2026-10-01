import { ITransport } from './Transport.ts';
import { TransportState, TransportType, TransportStats } from '../../types/index.ts';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const DRAIN_THRESHOLD = 64 * 1024; // 64 KB

export class WebRTCTransport implements ITransport {
  readonly type: TransportType = 'webrtc-p2p';
  state: TransportState = 'disconnected';
  peerId: string | null = null;
  localPeerId: string;

  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;

  private receiveCallbacks: ((data: string | ArrayBuffer) => void)[] = [];
  private stateCallbacks: ((state: TransportState) => void)[] = [];
  private statsCallbacks: ((stats: TransportStats) => void)[] = [];

  private drainResolvers: (() => void)[] = [];

  // Polling control for automated signaling
  private pollingActive = false;
  private pollTimer: any = null;

  // Rate metrics
  private bytesSentLastSec = 0;
  private bytesRecvLastSec = 0;
  private rateIntervalTimer: any = null;

  stats: TransportStats = {
    bytesSent: 0,
    bytesReceived: 0,
    currentRateBytesPerSec: 0,
    packetsSent: 0,
    packetsReceived: 0,
    bufferedAmount: 0,
    lastActiveTimestamp: Date.now(),
  };

  constructor(localPeerId: string) {
    this.localPeerId = localPeerId;
    this.startRateMeter();
  }

  private setState(newState: TransportState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateCallbacks.forEach(cb => cb(newState));
    }
  }

  private startRateMeter() {
    this.rateIntervalTimer = setInterval(() => {
      const currentRate = this.bytesSentLastSec + this.bytesRecvLastSec;
      this.bytesSentLastSec = 0;
      this.bytesRecvLastSec = 0;

      this.stats.currentRateBytesPerSec = currentRate;
      this.stats.bufferedAmount = this.getBufferedAmount();
      if (this.pc) {
        this.stats.iceConnectionState = this.pc.iceConnectionState;
        this.stats.iceGatheringState = this.pc.iceGatheringState;
        this.stats.signalingState = this.pc.signalingState;
      }
      this.statsCallbacks.forEach(cb => cb({ ...this.stats }));
    }, 1000);
  }

  private setupPeerConnection(): RTCPeerConnection {
    if (this.pc) {
      this.cleanupPeerConnection();
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        // DataChannel will set connected state
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
        this.setState('disconnected');
      } else if (pc.iceConnectionState === 'failed') {
        this.setState('failed');
      }
    };

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    return pc;
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = DRAIN_THRESHOLD;

    channel.onopen = () => {
      this.setState('connected');
      // Once P2P connection is achieved, stop polling signaling server to save bandwidth
      this.stopSignalingPoll();
    };

    channel.onclose = () => {
      this.setState('disconnected');
    };

    channel.onerror = (err) => {
      console.error('[WebRTC DataChannel error]', err);
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

      this.receiveCallbacks.forEach(cb => cb(event.data));
    };
  }

  /**
   * Connect using automated signaling over /api/signal
   */
  async connect(remotePeerId: string): Promise<void> {
    this.peerId = remotePeerId;
    this.setState('connecting');

    const pc = this.setupPeerConnection();

    // Determine roles deterministically by comparing IDs to avoid offer-offer collisions
    const isInitiator = this.localPeerId.localeCompare(remotePeerId) > 0;

    if (isInitiator) {
      const channel = pc.createDataChannel('simoon-mesh', { ordered: true });
      this.setupDataChannel(channel);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.postSignal(remotePeerId, 'candidate', event.candidate);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.postSignal(remotePeerId, 'offer', offer);
    } else {
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.postSignal(remotePeerId, 'candidate', event.candidate);
        }
      };
    }

    this.startSignalingPoll();
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

      // Fallback timeout in case ICE gathering pauses
      setTimeout(() => {
        if (pc.localDescription) {
          const bundle = {
            sdp: pc.localDescription,
            candidates,
            senderId: this.localPeerId,
          };
          resolve(btoa(JSON.stringify(bundle)));
        } else {
          reject(new Error('ICE Gathering timed out'));
        }
      }, 3000);
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
    const pc = this.setupPeerConnection();

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
          reject(new Error('ICE gathering timed out'));
        }
      }, 3000);
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

  private async postSignal(targetId: string, type: string, payload: any) {
    try {
      await fetch('/api/signal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: this.localPeerId,
          targetId,
          type,
          payload,
        }),
      });
    } catch (e) {
      console.warn('Failed to send signaling message:', e);
    }
  }

  public startSignalingPoll() {
    if (this.pollingActive) return;
    this.pollingActive = true;

    const poll = async () => {
      if (!this.pollingActive) return;

      try {
        const res = await fetch(`/api/signal/poll/${encodeURIComponent(this.localPeerId)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            for (const msg of data.messages) {
              await this.handleSignalingMessage(msg);
            }
          }
        }
      } catch (e) {
        // Transient network error or idle
      }

      if (this.pollingActive) {
        this.pollTimer = setTimeout(poll, 1200);
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

  private async handleSignalingMessage(msg: any) {
    if (!this.pc) {
      this.setupPeerConnection();
    }
    const pc = this.pc!;

    if (msg.type === 'offer') {
      this.peerId = msg.senderId;
      this.setState('connecting');
      await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.postSignal(msg.senderId, 'answer', answer);
    } else if (msg.type === 'answer') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
      }
    } else if (msg.type === 'candidate') {
      try {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
        }
      } catch (e) {
        console.warn('Failed to add received ICE candidate:', e);
      }
    }
  }

  // --- Send & Buffer Flow Control ---

  async send(data: string | ArrayBuffer): Promise<void> {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('Transport DataChannel not open');
    }

    const byteLen = typeof data === 'string' ? data.length : data.byteLength;

    // Buffer flow control check: if buffer is getting full, backoff
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
    this.stopSignalingPoll();
    this.cleanupPeerConnection();
    this.setState('disconnected');
    this.peerId = null;
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
    this.disconnect();
    if (this.rateIntervalTimer) {
      clearInterval(this.rateIntervalTimer);
      this.rateIntervalTimer = null;
    }
  }
}
