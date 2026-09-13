import { encodeMessage, isFighterKey, parseServerMessage } from './protocol.js';

const CONNECTION_TIMEOUT_MS = 12_000;
const HEARTBEAT_INTERVAL_MS = 10_000;

function randomClientId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(36).padStart(2, '0')).join('');
}

export class QuickMatchClient extends EventTarget {
  constructor(endpoint) {
    super();
    this.endpoint = endpoint;
    this.socket = null;
    this.status = 'idle';
    this.role = null;
    this.matchId = null;
    this.clientId = randomClientId();
    this.heartbeatTimer = 0;
    this.connectionTimer = 0;
  }

  connect(fighter) {
    if (!this.endpoint) throw new Error('対戦サーバーのURLが設定されていません。');
    if (!isFighterKey(fighter)) throw new Error('選択されたファイターが不正です。');
    this.disconnect(false);

    const url = new URL(this.endpoint);
    url.searchParams.set('fighter', fighter);
    url.searchParams.set('client', this.clientId);
    this.status = 'connecting';
    this.emit('status', { status: this.status });

    const socket = new WebSocket(url);
    this.socket = socket;
    this.connectionTimer = window.setTimeout(() => {
      if (this.socket === socket && socket.readyState !== WebSocket.OPEN) {
        socket.close(4000, 'connection timeout');
      }
    }, CONNECTION_TIMEOUT_MS);

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      clearTimeout(this.connectionTimer);
      this.status = 'searching';
      this.emit('status', { status: this.status });
      this.heartbeatTimer = window.setInterval(() => this.send('heartbeat'), HEARTBEAT_INTERVAL_MS);
    });
    socket.addEventListener('message', event => this.receive(event.data));
    socket.addEventListener('error', () => this.emit('error', { message: '対戦サーバーに接続できません。' }));
    socket.addEventListener('close', event => {
      if (this.socket !== socket) return;
      this.clearTimers();
      this.socket = null;
      const previousStatus = this.status;
      this.status = 'disconnected';
      this.role = null;
      this.matchId = null;
      this.emit('status', { status: this.status, previousStatus, code: event.code });
    });
  }

  receive(raw) {
    const message = parseServerMessage(raw);
    if (!message) return;
    if (message.type === 'searching') this.status = 'searching';
    if (message.type === 'match_found') {
      this.status = 'matched';
      this.role = message.role;
      this.matchId = message.matchId;
    }
    if (message.type === 'opponent_left') this.status = 'opponent-left';
    this.emit(message.type, message);
    this.emit('status', { status: this.status });
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(encodeMessage(type, payload));
    return true;
  }

  sendInput(input, sequence) {
    return this.send('input', { input, sequence });
  }

  sendSnapshot(snapshot, sequence) {
    if (this.role !== 'host') return false;
    return this.send('snapshot', { snapshot, sequence });
  }

  disconnect(notifyServer = true) {
    if (notifyServer) this.send('leave');
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'client left');
    this.status = 'idle';
    this.role = null;
    this.matchId = null;
  }

  clearTimers() {
    clearTimeout(this.connectionTimer);
    clearInterval(this.heartbeatTimer);
    this.connectionTimer = 0;
    this.heartbeatTimer = 0;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

