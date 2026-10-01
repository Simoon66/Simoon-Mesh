import mqtt, { MqttClient } from 'mqtt';

export interface SignalingPayload {
  id: string;
  senderId: string;
  targetId: string;
  type: 'offer' | 'answer' | 'candidate' | 'session_joined';
  payload: any;
  timestamp: number;
}

export type SignalingMessageHandler = (msg: SignalingPayload) => void;

// Public secure MQTT WebSockets brokers (zero API keys, 100% free, high uptime)
const PUBLIC_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

export class PublicSignalingChannel {
  private client: MqttClient | null = null;
  private localPeerId: string;
  private messageHandlers: SignalingMessageHandler[] = [];
  private activeSubscriptions = new Set<string>();
  public isConnected = false;
  private activeBrokerIndex = 0;

  constructor(localPeerId: string) {
    this.localPeerId = localPeerId;
  }

  public connect(): Promise<void> {
    if (this.client && this.isConnected) return Promise.resolve();

    return new Promise((resolve) => {
      const brokerUrl = PUBLIC_BROKERS[this.activeBrokerIndex % PUBLIC_BROKERS.length];
      const clientId = `simoon_${this.localPeerId.replace(/[^a-zA-Z0-9]/g, '')}_${Math.random().toString(36).substring(2, 6)}`;

      try {
        const client = mqtt.connect(brokerUrl, {
          clientId,
          clean: true,
          connectTimeout: 7000,
          reconnectPeriod: 3000,
        });
        this.client = client;

        client.on('connect', () => {
          this.isConnected = true;
          console.log(`[SIMOON MESH] Connected to public WebRTC signaling relay: ${brokerUrl}`);

          // Subscribe to personal inbox for direct offers, answers, and candidates
          const inboxTopic = `simoon/mesh/signal/${this.localPeerId}`;
          this.subscribeTopic(inboxTopic);

          resolve();
        });

        client.on('message', (topic, messageBuffer) => {
          try {
            const raw = messageBuffer.toString();
            const data = JSON.parse(raw);
            if (data && data.senderId && data.type) {
              // Ignore our own echo if received
              if (data.senderId !== this.localPeerId) {
                this.messageHandlers.forEach(handler => handler(data));
              }
            }
          } catch (e) {
            console.warn('[SIMOON MESH] Signaling parse error:', e);
          }
        });

        client.on('error', (err) => {
          console.warn('[SIMOON MESH] Signaling broker error, trying next broker:', err);
          this.activeBrokerIndex++;
        });

        client.on('close', () => {
          this.isConnected = false;
        });
      } catch (err) {
        console.warn('[SIMOON MESH] Failed to initialize public signaling client:', err);
        resolve();
      }
    });
  }

  public subscribeTopic(topic: string) {
    if (!this.client || this.activeSubscriptions.has(topic)) return;
    this.activeSubscriptions.add(topic);
    this.client.subscribe(topic, { qos: 0 });
  }

  public unsubscribeTopic(topic: string) {
    if (!this.client || !this.activeSubscriptions.has(topic)) return;
    this.activeSubscriptions.delete(topic);
    this.client.unsubscribe(topic);
  }

  public onMessage(handler: SignalingMessageHandler) {
    this.messageHandlers.push(handler);
  }

  public async sendSignal(targetId: string, type: SignalingPayload['type'], payload: any): Promise<void> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }

    const msg: SignalingPayload = {
      id: Math.random().toString(36).substring(2, 9),
      senderId: this.localPeerId,
      targetId,
      type,
      payload,
      timestamp: Date.now(),
    };

    const targetTopic = `simoon/mesh/signal/${targetId}`;
    this.client?.publish(targetTopic, JSON.stringify(msg), { qos: 0 });
  }

  /**
   * Session / 6-digit code support over public relay
   */
  public listenToSession(sessionCode: string) {
    const formatted = sessionCode.trim().replace(/\s+/g, '');
    const code = formatted.includes('-') ? formatted : `${formatted.slice(0, 3)}-${formatted.slice(3, 6)}`;
    const sessionTopic = `simoon/mesh/session/${code}`;
    this.subscribeTopic(sessionTopic);
  }

  public async announceJoinSession(sessionCode: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }

    const formatted = sessionCode.trim().replace(/\s+/g, '');
    const code = formatted.includes('-') ? formatted : `${formatted.slice(0, 3)}-${formatted.slice(3, 6)}`;
    const sessionTopic = `simoon/mesh/session/${code}`;

    const msg: SignalingPayload = {
      id: Math.random().toString(36).substring(2, 9),
      senderId: this.localPeerId,
      targetId: 'HOST',
      type: 'session_joined',
      payload: { code, guestPeerId: this.localPeerId },
      timestamp: Date.now(),
    };

    this.client?.publish(sessionTopic, JSON.stringify(msg), { qos: 0 });
  }

  public destroy() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.isConnected = false;
      this.activeSubscriptions.clear();
      this.messageHandlers = [];
    }
  }
}
