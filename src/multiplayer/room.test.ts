import { describe, expect, it } from 'vitest';
import { applyAction, RULESET } from '../game/engine';
import type { Action } from '../game/engine';
import { CAPTURE_FEEDBACK_MS } from '../game/feedback';
import { randomPlayerName } from '../hooks/usePlayerName';
import { replayRoom, ROOM_PROTOCOL, scheduledStart, START_COUNTDOWN_MS, turnDeadline, validName } from './room';
import type { StoredRoom } from './room';

const room = (): StoredRoom => ({ ruleset: RULESET, host: 'host', guest: 'guest', slot: '0', createdAt: 0, expiresAt: 7200000, revision: 0, turn: 1, protocol: ROOM_PROTOCOL, clockPausedMs: 0, turnPausedBaseMs: 0, resigned: 0, abandoned: 0, round: 0, hostName: 'Behroz', guestName: 'Swift Falcon', moveSeconds: 30, turnStartedAt: 1000, turnDelayMs: 0, finished: 0, timeout: 0, startedAt: 1, ready: { host: true, guest: true } });
function move(current: StoredRoom, action: Action, now: number) {
  const state = replayRoom(current); const next = applyAction(state, action);
  return { ...current, moves: { ...current.moves, [current.revision]: { uid: state.turn === 1 ? current.host : current.guest, action } }, revision: current.revision + 1, turn: next.turn, turnStartedAt: next.turn === state.turn ? current.turnStartedAt : now, turnDelayMs: next.turn === state.turn ? current.turnDelayMs : action.type === 'capture' ? CAPTURE_FEEDBACK_MS : 0, finished: next.winner };
}

describe('named timed rooms', () => {
  it('accepts human names and generates usable defaults', () => {
    expect(validName('بہروز')).toBe(true);
    for (const invalid of ['', '   ', 'a'.repeat(21), 'a\nb']) expect(validName(invalid)).toBe(false);
    for (let i = 0; i < 20; i++) expect(validName(randomPlayerName())).toBe(true);
  });
  it('starts the clock only after readiness, with an optional unlimited mode', () => {
    expect(turnDeadline({ ...room(), guest: '', guestName: '', turnStartedAt: 0 })).toBeNull();
    expect(turnDeadline({ ...room(), moveSeconds: 0 })).toBeNull();
    expect(turnDeadline(room())).toBe(31000);
    expect(turnDeadline({ ...room(), startedAt: 0, turnStartedAt: 0 })).toBeNull();
  });
  it('schedules three seconds before play and includes that delay in the first turn', () => {
    const current = { ...room(), startedAt: 1000, turnStartedAt: 1000, turnDelayMs: START_COUNTDOWN_MS };
    expect(scheduledStart(current)).toBe(4000);
    expect(turnDeadline(current)).toBe(34000);
    expect(() => replayRoom({ ...current, ready: { host: true } })).toThrow('invalid start');
    expect(() => replayRoom({ ...current, startedAt: 0 })).toThrow('invalid start');
  });
  it('continues protocol-two clocks without readiness or a countdown', () => {
    const current = { ...room(), protocol: 2, startedAt: undefined, ready: undefined };
    expect(scheduledStart(current)).toBeNull();
    expect(turnDeadline(current)).toBe(31000);
    expect(replayRoom(current).ply).toBe(0);
  });
  it('shares the clock between a mill and its capture, then allows time for capture feedback', () => {
    let current = room();
    for (const [i, to] of [0, 3, 1, 5].entries()) current = move(current, { type: 'place', to }, 2000 + i * 1000);
    const started = current.turnStartedAt;
    current = move(current, { type: 'place', to: 2 }, 9000);
    expect(current.turnStartedAt).toBe(started);
    expect(turnDeadline(current)).toBe((started ?? 0) + 30000);
    current = move(current, { type: 'capture', at: 3 }, 10000);
    expect(turnDeadline(current)).toBe(10000 + 30000 + CAPTURE_FEEDBACK_MS);
  });
  it('replays a settled timeout and rejects an invented timeout winner', () => {
    const ended = { ...room(), timeout: 1 as const, finished: 2 as const };
    expect(replayRoom(ended)).toMatchObject({ winner: 2, endReason: 'timeout' });
    expect(turnDeadline(ended)).toBeNull();
    expect(() => replayRoom({ ...ended, finished: 1 })).toThrow('invalid timeout');
    expect(() => replayRoom({ ...ended, moveSeconds: 0 })).toThrow('invalid timeout');
  });
  it('rejects unsupported protocols, settings, and mismatched results', () => {
    expect(() => replayRoom({ ...room(), protocol: 999 })).toThrow('newer version');
    expect(() => replayRoom({ ...room(), hostName: '' })).toThrow('invalid settings');
    expect(() => replayRoom({ ...room(), turnStartedAt: -1 })).toThrow('invalid settings');
    expect(() => replayRoom({ ...room(), turnDelayMs: 30000 })).toThrow('invalid settings');
    expect(() => replayRoom({ ...room(), finished: 1 })).toThrow('out of sync');
  });
  it('preserves the capture-feedback allowance when the next player forms a mill', () => {
    let current = room();
    for (const [i, to] of [0, 3, 1, 4, 6, 9, 2].entries()) current = move(current, { type: 'place', to }, 2000 + i * 1000);
    current = move(current, { type: 'capture', at: 9 }, 10000);
    const deadline = turnDeadline(current);
    current = move(current, { type: 'place', to: 5 }, 20000);
    expect(replayRoom(current).capture).toBe(true);
    expect(turnDeadline(current)).toBe(deadline);
  });
  it('reconstructs a fresh rematch without carrying over captures, moves, or results', () => {
    const fresh = replayRoom({ ...room(), round: 1, turnStartedAt: 5000 });
    expect(fresh.ply).toBe(0); expect(fresh.lastCapture).toBeNull(); expect(fresh.winner).toBe(0);
    expect(fresh.reserves).toEqual([9, 9]);
  });
});
