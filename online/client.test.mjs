import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { QuickMatchClient } from './client.js';
import { encodeMessage } from './protocol.js';

const originalWindow = globalThis.window;
const originalWebSocket = globalThis.WebSocket;

class FakeWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    super();
    this.url = String(url);
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  message(type, payload = {}) {
    this.dispatchEvent(new MessageEvent('message', { data: encodeMessage(type, payload) }));
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close(code = 1000) {
    this.readyState = FakeWebSocket.CLOSED;
    const event = new Event('close');
    Object.defineProperty(event, 'code', { value: code });
    this.dispatchEvent(event);
  }
}

globalThis.window = globalThis;
globalThis.WebSocket = FakeWebSocket;
after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  globalThis.WebSocket = originalWebSocket;
});

function createClient(t) {
  const client = new QuickMatchClient('wss://example.test/match');
  t.after(() => client.disconnect());
  return client;
}

function emitStaleEvents(socket) {
  socket.message('match_found', { role: 'host', matchId: 'stale-match', opponentFighter: 'jet' });
  socket.dispatchEvent(new Event('error'));
  socket.message('opponent_left');
}

test('cancelled socket cannot restart a match or emit errors', t => {
  const client = createClient(t);
  const events = [];
  for (const type of ['match_found', 'error', 'opponent_left', 'status']) {
    client.addEventListener(type, () => events.push(type));
  }
  client.connect('arc');
  const cancelledSocket = client.socket;
  client.disconnect();
  events.length = 0;

  emitStaleEvents(cancelledSocket);

  assert.equal(client.socket, null);
  assert.equal(client.status, 'idle');
  assert.equal(client.role, null);
  assert.equal(client.matchId, null);
  assert.deepEqual(events, []);
});

test('old socket cannot overwrite a new search or its active match', t => {
  const client = createClient(t);
  client.connect('arc');
  const oldSocket = client.socket;
  client.connect('jet');
  const currentSocket = client.socket;
  currentSocket.open();
  let unexpectedEvents = 0;
  const recordEvent = () => unexpectedEvents++;
  for (const type of ['match_found', 'error', 'opponent_left', 'status']) {
    client.addEventListener(type, recordEvent);
  }

  emitStaleEvents(oldSocket);
  assert.equal(client.socket, currentSocket);
  assert.equal(client.status, 'searching');
  assert.equal(client.role, null);
  assert.equal(client.matchId, null);
  assert.equal(unexpectedEvents, 0);

  currentSocket.message('match_found', { role: 'guest', matchId: 'current-match', opponentFighter: 'arc' });
  unexpectedEvents = 0;
  emitStaleEvents(oldSocket);
  assert.equal(client.socket, currentSocket);
  assert.equal(client.status, 'matched');
  assert.equal(client.role, 'guest');
  assert.equal(client.matchId, 'current-match');
  assert.equal(unexpectedEvents, 0);
});

test('current socket still delivers match, peer, error and disconnect events', t => {
  const client = createClient(t);
  const events = [];
  for (const type of ['match_found', 'peer_message', 'opponent_left', 'error', 'status']) {
    client.addEventListener(type, event => events.push({ type, detail: event.detail }));
  }
  client.connect('arc');
  const socket = client.socket;
  socket.open();
  socket.message('match_found', { role: 'host', matchId: 'active-match', opponentFighter: 'jet' });
  socket.message('peer_message', { matchId: 'active-match', message: { type: 'ready' } });
  assert.equal(client.sendSnapshot({ running: true }, 1), true);
  assert.equal(socket.sent.at(-1).type, 'snapshot');
  socket.message('opponent_left');
  assert.equal(client.status, 'opponent-left');
  socket.dispatchEvent(new Event('error'));
  socket.close(1006);

  assert.deepEqual(events.filter(event => event.type !== 'status').map(event => event.type),
    ['match_found', 'peer_message', 'opponent_left', 'error']);
  assert.deepEqual(events.at(-1), {
    type: 'status', detail: { status: 'disconnected', previousStatus: 'opponent-left', code: 1006 },
  });
  assert.equal(client.socket, null);
  assert.equal(client.role, null);
  assert.equal(client.matchId, null);
  assert.equal(client.connectionTimer, 0);
  assert.equal(client.heartbeatTimer, 0);
});
