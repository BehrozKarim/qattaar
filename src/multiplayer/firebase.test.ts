import { describe, expect, it } from 'vitest';
import { normalizeCode, replayRoom } from './firebase';
import type { StoredRoom } from './firebase';

const room = (): StoredRoom => ({ host: 'host', guest: 'guest', slot: '0', createdAt: 0, expiresAt: 1000, revision: 0, turn: 1 });
describe('multiplayer protocol', () => {
  it('normalizes shared room codes', () => expect(normalizeCode(' abcd-efgh ')).toBe('ABCDEFGH'));
  it('replays the history through the shared rules engine', () => {
    const state = replayRoom({ ...room(), revision: 2, moves: { 0: { uid: 'host', action: { type: 'place', to: 0 } }, 1: { uid: 'guest', action: { type: 'place', to: 3 } } } });
    expect(state.board[0]).toBe(1); expect(state.board[3]).toBe(2);
  });
  it('rejects illegal, missing, and incorrectly authored moves', () => {
    expect(() => replayRoom({ ...room(), revision: 1 })).toThrow();
    expect(() => replayRoom({ ...room(), revision: 1, turn: 2, moves: { 0: { uid: 'guest', action: { type: 'place', to: 0 } } } })).toThrow();
    expect(() => replayRoom({ ...room(), revision: 2, moves: { 0: { uid: 'host', action: { type: 'place', to: 0 } }, 1: { uid: 'guest', action: { type: 'place', to: 0 } } } })).toThrow();
  });
  it('rejects turn manipulation', () => expect(() => replayRoom({ ...room(), turn: 2 })).toThrow());
});
