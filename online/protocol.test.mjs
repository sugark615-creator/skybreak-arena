import assert from 'node:assert/strict';
import {
  CLIENT_MESSAGE_TYPES,
  PROTOCOL_VERSION,
  encodeMessage,
  isFighterKey,
  parseClientMessage,
  parseServerMessage,
  safeClientId,
} from './protocol.js';

assert.equal(PROTOCOL_VERSION, 1);
assert.equal(isFighterKey('arc'), true);
assert.equal(isFighterKey('kirby'), false);
assert.equal(safeClientId('player_123456789'), 'player_123456789');
assert.equal(safeClientId('short'), null);

for (const type of CLIENT_MESSAGE_TYPES) {
  const encoded = encodeMessage(type, { sequence: 3 });
  assert.equal(parseClientMessage(encoded)?.type, type);
}

assert.equal(parseClientMessage('{bad json'), null);
assert.equal(parseClientMessage(encodeMessage('match_found')), null);
assert.equal(parseServerMessage(encodeMessage('match_found'))?.type, 'match_found');
assert.equal(parseServerMessage(JSON.stringify({ v: 999, type: 'searching' })), null);
assert.equal(parseClientMessage('x'.repeat(16_385)), null);

console.log('Online protocol checks passed.');
