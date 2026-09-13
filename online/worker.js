import { encodeMessage, isFighterKey, parseClientMessage, safeClientId } from './protocol.js';

const MAX_MESSAGES_PER_SECOND = 90;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const configured = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (configured.includes(origin)) return true;
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'skybreak-matchmaker', protocol: 1 });
    }
    if (url.pathname !== '/match') return json({ error: 'not found' }, 404);
    if (!allowedOrigin(request, env)) return json({ error: 'origin not allowed' }, 403);
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'websocket required' }, 426, { upgrade: 'websocket' });
    }
    const id = env.MATCHMAKER.idFromName('quick-match-japan-v1');
    return env.MATCHMAKER.get(id).fetch(request);
  },
};

export class Matchmaker {
  constructor(state) {
    this.state = state;
    this.waiting = [];
    this.meta = new Map();
  }

  fetch(request) {
    const url = new URL(request.url);
    const fighter = url.searchParams.get('fighter');
    const clientId = safeClientId(url.searchParams.get('client'));
    if (!isFighterKey(fighter) || !clientId) return json({ error: 'invalid player' }, 400);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const player = {
      socket: server,
      clientId,
      fighter,
      peer: null,
      matchId: null,
      role: null,
      rateWindow: Date.now(),
      rateCount: 0,
    };
    this.meta.set(server, player);
    server.addEventListener('message', event => this.onMessage(player, event));
    server.addEventListener('close', () => this.remove(player));
    server.addEventListener('error', () => this.remove(player));
    this.enqueue(player);
    return new Response(null, { status: 101, webSocket: client });
  }

  enqueue(player) {
    const opponent = this.waiting.find(candidate => candidate.socket.readyState === WebSocket.OPEN && candidate.clientId !== player.clientId);
    if (!opponent) {
      this.waiting.push(player);
      this.send(player, 'searching', { queuedAt: Date.now() });
      return;
    }
    this.waiting = this.waiting.filter(candidate => candidate !== opponent);
    const matchId = crypto.randomUUID();
    Object.assign(opponent, { peer: player, matchId, role: 'host' });
    Object.assign(player, { peer: opponent, matchId, role: 'guest' });
    this.send(opponent, 'match_found', {
      matchId,
      role: opponent.role,
      fighter: opponent.fighter,
      opponentFighter: player.fighter,
    });
    this.send(player, 'match_found', {
      matchId,
      role: player.role,
      fighter: player.fighter,
      opponentFighter: opponent.fighter,
    });
  }

  onMessage(player, event) {
    if (!this.withinRateLimit(player)) {
      player.socket.close(1008, 'rate limit');
      return;
    }
    const message = parseClientMessage(event.data);
    if (!message) {
      player.socket.close(1008, 'invalid message');
      return;
    }
    if (message.type === 'heartbeat') return;
    if (message.type === 'leave') {
      player.socket.close(1000, 'left match');
      return;
    }
    if (!player.peer || player.peer.socket.readyState !== WebSocket.OPEN) return;
    if ((message.type === 'snapshot' || message.type === 'combat_event') && player.role !== 'host') return;
    this.send(player.peer, 'peer_message', {
      matchId: player.matchId,
      from: player.role,
      message,
    });
  }

  withinRateLimit(player) {
    const now = Date.now();
    if (now - player.rateWindow >= 1000) {
      player.rateWindow = now;
      player.rateCount = 0;
    }
    player.rateCount += 1;
    return player.rateCount <= MAX_MESSAGES_PER_SECOND;
  }

  send(player, type, payload = {}) {
    if (player.socket.readyState === WebSocket.OPEN) player.socket.send(encodeMessage(type, payload));
  }

  remove(player) {
    if (!this.meta.has(player.socket)) return;
    this.meta.delete(player.socket);
    this.waiting = this.waiting.filter(candidate => candidate !== player);
    const peer = player.peer;
    player.peer = null;
    if (peer) {
      peer.peer = null;
      peer.matchId = null;
      this.send(peer, 'opponent_left');
    }
  }
}

