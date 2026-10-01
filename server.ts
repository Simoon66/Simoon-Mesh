import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SignalingMessage {
  id: string;
  senderId: string;
  targetId: string;
  type: 'offer' | 'answer' | 'candidate' | 'session_joined';
  payload: any;
  timestamp: number;
}

interface PeerInfo {
  peerId: string;
  lastSeen: number;
  label?: string;
}

interface PairingSession {
  code: string;
  hostPeerId: string;
  guestPeerId: string | null;
  createdAt: number;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  // In-memory ephemeral signaling state (ONLY for WebRTC handshakes; zero chat/file data)
  const peerSignalingQueues = new Map<string, SignalingMessage[]>();
  const activePeers = new Map<string, PeerInfo>();
  const pairingSessions = new Map<string, PairingSession>();

  // Housekeeping interval to clean stale peers, messages, and pairing sessions
  setInterval(() => {
    const now = Date.now();
    // Clean stale signaling messages older than 60s
    for (const [peerId, queue] of peerSignalingQueues.entries()) {
      const filtered = queue.filter(msg => now - msg.timestamp < 60000);
      if (filtered.length === 0) {
        peerSignalingQueues.delete(peerId);
      } else {
        peerSignalingQueues.set(peerId, filtered);
      }
    }
    // Clean inactive peers (older than 45s)
    for (const [peerId, info] of activePeers.entries()) {
      if (now - info.lastSeen > 45000) {
        activePeers.delete(peerId);
      }
    }
    // Clean pairing sessions older than 10 minutes
    for (const [code, session] of pairingSessions.entries()) {
      if (now - session.createdAt > 10 * 60 * 1000) {
        pairingSessions.delete(code);
      }
    }
  }, 10000);

  // Health check endpoint
  app.get('/api/signal/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      activePeers: activePeers.size,
      activeSessions: pairingSessions.size,
      timestamp: Date.now(),
    });
  });

  // Announce peer presence
  app.post('/api/signal/announce', (req: Request, res: Response) => {
    const { peerId, label } = req.body;
    if (!peerId || typeof peerId !== 'string') {
      res.status(400).json({ error: 'Invalid peerId' });
      return;
    }
    activePeers.set(peerId, {
      peerId,
      lastSeen: Date.now(),
      label: label ? String(label).slice(0, 32) : undefined,
    });
    res.json({ success: true, registeredPeersCount: activePeers.size });
  });

  // Get active peers (excluding requester if provided)
  app.get('/api/signal/peers', (req: Request, res: Response) => {
    const requesterId = req.query.exclude as string | undefined;
    const now = Date.now();
    const peers: PeerInfo[] = [];

    for (const [id, info] of activePeers.entries()) {
      if (now - info.lastSeen <= 45000 && id !== requesterId) {
        peers.push(info);
      }
    }

    res.json({ peers });
  });

  // Create a 6-digit pairing session code (e.g. 482-195)
  app.post('/api/signal/session/create', (req: Request, res: Response) => {
    const { hostPeerId } = req.body;
    if (!hostPeerId || typeof hostPeerId !== 'string') {
      res.status(400).json({ error: 'Missing hostPeerId' });
      return;
    }

    // Generate random 6-digit formatted code
    const raw = Math.floor(100000 + Math.random() * 900000).toString();
    const code = `${raw.slice(0, 3)}-${raw.slice(3, 6)}`;

    const session: PairingSession = {
      code,
      hostPeerId,
      guestPeerId: null,
      createdAt: Date.now(),
    };

    pairingSessions.set(code, session);
    res.json({ success: true, code, hostPeerId });
  });

  // Join a pairing session using 6-digit code
  app.post('/api/signal/session/join', (req: Request, res: Response) => {
    const { code, guestPeerId } = req.body;
    if (!code || !guestPeerId) {
      res.status(400).json({ error: 'Missing code or guestPeerId' });
      return;
    }

    const cleanCode = String(code).trim().replace(/\s+/g, '');
    const formatted = cleanCode.includes('-') ? cleanCode : `${cleanCode.slice(0, 3)}-${cleanCode.slice(3, 6)}`;
    const session = pairingSessions.get(formatted);

    if (!session) {
      res.status(404).json({ error: 'Session code not found or expired' });
      return;
    }

    session.guestPeerId = guestPeerId;

    // Send a signaling message to the host notifying them of the guest
    if (!peerSignalingQueues.has(session.hostPeerId)) {
      peerSignalingQueues.set(session.hostPeerId, []);
    }
    peerSignalingQueues.get(session.hostPeerId)!.push({
      id: Math.random().toString(36).substring(2, 9),
      senderId: guestPeerId,
      targetId: session.hostPeerId,
      type: 'session_joined',
      payload: { code: session.code, guestPeerId },
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      code: session.code,
      hostPeerId: session.hostPeerId,
      guestPeerId,
    });
  });

  // Send signaling message (offer, answer, or ice-candidate)
  app.post('/api/signal/send', (req: Request, res: Response) => {
    const { senderId, targetId, type, payload } = req.body;

    if (!senderId || !targetId || !type || !payload) {
      res.status(400).json({ error: 'Missing required signaling fields' });
      return;
    }

    activePeers.set(senderId, {
      peerId: senderId,
      lastSeen: Date.now(),
    });

    const msg: SignalingMessage = {
      id: Math.random().toString(36).substring(2, 9),
      senderId,
      targetId,
      type,
      payload,
      timestamp: Date.now(),
    };

    if (!peerSignalingQueues.has(targetId)) {
      peerSignalingQueues.set(targetId, []);
    }
    const queue = peerSignalingQueues.get(targetId)!;
    queue.push(msg);

    res.json({ success: true, queuedMessageId: msg.id });
  });

  // Poll signaling messages for a peer
  app.get('/api/signal/poll/:peerId', (req: Request, res: Response) => {
    const { peerId } = req.params;
    if (!peerId) {
      res.status(400).json({ error: 'Missing peerId' });
      return;
    }

    if (activePeers.has(peerId)) {
      const peer = activePeers.get(peerId)!;
      peer.lastSeen = Date.now();
    } else {
      activePeers.set(peerId, { peerId, lastSeen: Date.now() });
    }

    const messages = peerSignalingQueues.get(peerId) || [];
    peerSignalingQueues.delete(peerId);

    res.json({ messages });
  });

  // Explicit leave
  app.post('/api/signal/leave', (req: Request, res: Response) => {
    const { peerId } = req.body;
    if (peerId) {
      activePeers.delete(peerId);
      peerSignalingQueues.delete(peerId);
    }
    res.json({ success: true });
  });

  // Dev server or static files
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SIMOON MESH] Signaling & Web Server operational on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[SIMOON MESH] Server startup failure:', err);
  process.exit(1);
});
