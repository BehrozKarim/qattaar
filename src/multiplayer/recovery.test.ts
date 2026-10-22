import { describe, expect, it } from 'vitest';
import { RULESET } from '../game/engine';
import { replayRoom, turnDeadline } from './room';
import type { StoredRoom } from './room';
import { recoveryState } from './recovery';

const room = (): StoredRoom => ({ ruleset: RULESET, protocol: 4, host: 'host', guest: 'guest', hostName: 'Host', guestName: 'Guest', slot: '0', createdAt: 1, expiresAt: 7200000, round: 0, revision: 0, turn: 1, startedAt: 1000, turnStartedAt: 4000, turnDelayMs: 0, moveSeconds: 30, finished: 0, timeout: 0, resigned: 0, abandoned: 0, ready: { host: true, guest: true }, presence: { host: true, guest: false }, awayAt: { guest: 14000 }, clockPausedMs: 0, turnPausedBaseMs: 0 });

describe('reconnection grace and clock accounting', () => {
  it('freezes the remaining turn time for 90 seconds, then resumes the same allowance', () => {
    const current = room();
    expect(turnDeadline(current, 24000)! - 24000).toBe(20000);
    expect(turnDeadline(current, 100000)! - 100000).toBe(20000);
    expect(recoveryState(current, 104000).paused).toBe(false);
    expect(turnDeadline(current, 110000)! - 110000).toBe(14000);
  });
  it('counts overlapping absences once even if both players disconnect', () => {
    const current = { ...room(), presence: { host: false, guest: false }, awayAt: { host: 18000, guest: 14000 } };
    expect(recoveryState(current, 24000).total).toBe(10000);
    const returned = { ...current, presence: { host: true, guest: true }, recovery: { since: 14000, endedAt: 25000, extendedBy: '' } };
    expect(turnDeadline(returned, 50000)).toBe(45000);
    expect(recoveryState(returned, 50000).paused).toBe(false);
  });
  it('keeps the initial background time when the server later detects a network drop', () => {
    const current = { ...room(), awayAt: { guest: 24000 }, backgroundAt: { guest: 14000 } };
    expect(turnDeadline(current, 30000)! - 30000).toBe(20000);
    expect(recoveryState(current, 30000).graceUntil).toBe(104000);
  });
  it('preserves completed pauses and starts a new interval for a later disconnect', () => {
    const current = { ...room(), recovery: { since: 5000, endedAt: 10000, extendedBy: '' } };
    const pause = recoveryState(current, 24000);
    expect(pause.accumulated).toBe(5000);
    expect(pause.total).toBe(15000);
    expect(turnDeadline({ ...current, clockPausedMs: 5000, recovery: { since: 14000, endedAt: 25000, extendedBy: '' } }, 30000)).toBe(50000);
  });
  it('lets the opponent extend waiting and resumes without granting a new grace for the same absence', () => {
    const current = { ...room(), recovery: { since: 14000, endedAt: 0, extendedBy: 'host' } };
    expect(recoveryState(current, 200000).paused).toBe(true);
    expect(turnDeadline(current, 200000)! - 200000).toBe(20000);
    const resumed = { ...current, recovery: { ...current.recovery, endedAt: 200000 } };
    expect(recoveryState(resumed, 201000).paused).toBe(false);
    expect(turnDeadline(resumed, 201000)! - 201000).toBe(19000);
  });
  it('does not carry an earlier turn’s pause allowance into a fresh turn', () => {
    const current = { ...room(), presence: { host: true, guest: true }, recovery: { since: 14000, endedAt: 24000, extendedBy: '' }, turnStartedAt: 25000, turnPausedBaseMs: 10000 };
    expect(turnDeadline(current, 26000)).toBe(55000);
  });
  it('supports untimed games and preserves pre-existing protocol-three games', () => {
    expect(turnDeadline({ ...room(), moveSeconds: 0 }, 24000)).toBeNull();
    expect(recoveryState({ ...room(), moveSeconds: 0 }, 24000).paused).toBe(true);
    expect(turnDeadline({ ...room(), protocol: 3 }, 24000)).toBe(34000);
    expect(replayRoom({ ...room(), protocol: 3 }).ply).toBe(0);
  });
  it('replays resignation and disconnection results without modifying the board', () => {
    expect(replayRoom({ ...room(), resigned: 2, finished: 1 })).toMatchObject({ winner: 1, endReason: 'resigned', ply: 0 });
    expect(replayRoom({ ...room(), abandoned: 1, finished: 2 })).toMatchObject({ winner: 2, endReason: 'disconnected', ply: 0 });
    expect(() => replayRoom({ ...room(), resigned: 2, finished: 2 })).toThrow('invalid forfeit');
    expect(() => replayRoom({ ...room(), resigned: 2, abandoned: 1, finished: 1 })).toThrow('invalid forfeit');
  });
});
