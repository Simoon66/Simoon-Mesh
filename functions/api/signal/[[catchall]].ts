// Cloudflare Pages Function: Ephemeral WebRTC Signaling Relay
// Handles /api/signal/* on Cloudflare Pages edge network without an Express server

interface Env {}

// Ephemeral in-memory store for Cloudflare edge isolates
const memoryQueues = new Map<string, any[]>();
const sessions = new Map<string, { code: string; hostPeerId: string; guestPeerId: string | null; createdAt: number }>();

export const onRequest = async (context: any): Promise<Response> => {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check
  if (path.endsWith('/health') || path === '/api/signal/health') {
    return new Response(
      JSON.stringify({ status: 'ok', runtime: 'cloudflare-pages-function', timestamp: Date.now() }),
      { headers: corsHeaders }
    );
  }

  // Create 6-digit session
  if (path.endsWith('/session/create') || path === '/api/signal/session/create') {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
    }
    try {
      const body: any = await request.json();
      const hostPeerId = body.hostPeerId;
      if (!hostPeerId) {
        return new Response(JSON.stringify({ error: 'Missing hostPeerId' }), { status: 400, headers: corsHeaders });
      }

      const raw = Math.floor(100000 + Math.random() * 900000).toString();
      const code = `${raw.slice(0, 3)}-${raw.slice(3, 6)}`;

      sessions.set(code, {
        code,
        hostPeerId,
        guestPeerId: null,
        createdAt: Date.now(),
      });

      return new Response(JSON.stringify({ success: true, code, hostPeerId }), { headers: corsHeaders });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: corsHeaders });
    }
  }

  // Join 6-digit session
  if (path.endsWith('/session/join') || path === '/api/signal/session/join') {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
    }
    try {
      const body: any = await request.json();
      const { code, guestPeerId } = body;
      const cleanCode = String(code).trim().replace(/\s+/g, '');
      const formatted = cleanCode.includes('-') ? cleanCode : `${cleanCode.slice(0, 3)}-${cleanCode.slice(3, 6)}`;
      const session = sessions.get(formatted);

      if (!session) {
        return new Response(JSON.stringify({ error: 'Session code not found or expired' }), { status: 404, headers: corsHeaders });
      }

      session.guestPeerId = guestPeerId;

      // Queue session_joined message for host
      if (!memoryQueues.has(session.hostPeerId)) {
        memoryQueues.set(session.hostPeerId, []);
      }
      memoryQueues.get(session.hostPeerId)!.push({
        id: Math.random().toString(36).substring(2, 9),
        senderId: guestPeerId,
        targetId: session.hostPeerId,
        type: 'session_joined',
        payload: { code: session.code, guestPeerId },
        timestamp: Date.now(),
      });

      return new Response(
        JSON.stringify({ success: true, code: session.code, hostPeerId: session.hostPeerId, guestPeerId }),
        { headers: corsHeaders }
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: corsHeaders });
    }
  }

  // Send signaling message (offer, answer, candidate)
  if (path.endsWith('/send') || path === '/api/signal/send') {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
    }
    try {
      const body: any = await request.json();
      const { senderId, targetId, type, payload } = body;

      if (!senderId || !targetId || !type || !payload) {
        return new Response(JSON.stringify({ error: 'Missing required signaling fields' }), { status: 400, headers: corsHeaders });
      }

      const msg = {
        id: Math.random().toString(36).substring(2, 9),
        senderId,
        targetId,
        type,
        payload,
        timestamp: Date.now(),
      };

      if (!memoryQueues.has(targetId)) {
        memoryQueues.set(targetId, []);
      }
      memoryQueues.get(targetId)!.push(msg);

      return new Response(JSON.stringify({ success: true, queuedMessageId: msg.id }), { headers: corsHeaders });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: corsHeaders });
    }
  }

  // Poll signaling messages
  if (path.includes('/poll/')) {
    const parts = path.split('/poll/');
    const peerId = decodeURIComponent(parts[1] || '');

    const messages = memoryQueues.get(peerId) || [];
    memoryQueues.delete(peerId);

    return new Response(JSON.stringify({ messages }), { headers: corsHeaders });
  }

  // Default announce/peers
  if (path.endsWith('/announce') || path === '/api/signal/announce') {
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  if (path.endsWith('/peers') || path === '/api/signal/peers') {
    return new Response(JSON.stringify({ peers: [] }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
};
