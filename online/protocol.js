export const PROTOCOL_VERSION = 1;

export const FIGHTER_KEYS = Object.freeze(['arc', 'jet', 'mist', 'brick', 'spring']);
export const CLIENT_MESSAGE_TYPES = Object.freeze([
  'ready',
  'input',
  'snapshot',
  'combat_event',
  'rematch',
  'leave',
  'heartbeat',
]);
export const SERVER_MESSAGE_TYPES = Object.freeze([
  'searching',
  'match_found',
  'peer_message',
  'opponent_left',
  'error',
]);

const clientTypes = new Set(CLIENT_MESSAGE_TYPES);
const serverTypes = new Set(SERVER_MESSAGE_TYPES);

export function isFighterKey(value) {
  return typeof value === 'string' && FIGHTER_KEYS.includes(value);
}

export function safeClientId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{12,80}$/.test(value) ? value : null;
}

export function encodeMessage(type, payload = {}) {
  return JSON.stringify({ v: PROTOCOL_VERSION, type, ...payload });
}

export function parseMessage(raw, allowedTypes) {
  if (typeof raw !== 'string' || raw.length > 16_384) return null;
  try {
    const message = JSON.parse(raw);
    if (!message || message.v !== PROTOCOL_VERSION || typeof message.type !== 'string') return null;
    if (allowedTypes && !allowedTypes.has(message.type)) return null;
    return message;
  } catch {
    return null;
  }
}

export function parseClientMessage(raw) {
  return parseMessage(raw, clientTypes);
}

export function parseServerMessage(raw) {
  return parseMessage(raw, serverTypes);
}

