import { TransportState, TransportType, TransportStats } from '../../types/index.ts';

export interface ITransport {
  readonly type: TransportType;
  readonly state: TransportState;
  readonly peerId: string | null;
  readonly stats: TransportStats;

  /**
   * Connect to target peer.
   * For WebRTC, this can be automated via the minimal signaling exchange,
   * or manual via airgapped SDP tokens.
   */
  connect(remotePeerId: string, options?: any): Promise<void>;

  /**
   * Disconnect the transport and clean up resources
   */
  disconnect(): Promise<void>;

  /**
   * Send binary data or serialized text string over the direct transport
   */
  send(data: string | ArrayBuffer): Promise<void>;

  /**
   * Register listener for incoming transport data
   */
  onReceive(handler: (data: string | ArrayBuffer) => void): void;

  /**
   * Register listener for transport connection state updates
   */
  onStateChange(handler: (state: TransportState) => void): void;

  /**
   * Register listener for transport statistics & throughput updates
   */
  onStatsChange(handler: (stats: TransportStats) => void): void;

  /**
   * Query the low-level transmission buffer size
   */
  getBufferedAmount(): number;

  /**
   * Wait until buffer drains below threshold (essential for non-blocking file streaming)
   */
  waitForBufferDrain(maxThreshold?: number): Promise<void>;
}
