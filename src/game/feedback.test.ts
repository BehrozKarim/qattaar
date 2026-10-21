import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { captureMessage, matchResult } from './feedback';

describe('match feedback', () => {
  it('names the captured color and coordinate from each player’s perspective', () => {
    const capture = { at: 4, player: 1 as const, by: 2 as const, ply: 10 };
    expect(captureMessage(capture, 1)).toEqual({ title: 'Your piece was captured', detail: 'Black took your white piece at d6.' });
    expect(captureMessage(capture, 2).title).toBe('You captured a piece');
    expect(captureMessage(capture, null)).toEqual({ title: 'Black captured a piece', detail: 'Black took a white piece at d6.' });
  });
  it('explains a win or loss from the viewer’s perspective', () => {
    const state = { ...createGame(), winner: 2 as const, endReason: 'blocked' as const };
    expect(matchResult(state, 1)).toEqual({ outcome: 'loss', title: 'You lost', detail: 'You have no legal moves left.' });
    expect(matchResult(state, 2)).toEqual({ outcome: 'win', title: 'You won!', detail: 'White has no legal moves left.' });
    expect(matchResult(state, null)?.title).toBe('Black wins!');
  });
  it('shows a local white winner and piece-count reason', () => {
    expect(matchResult({ ...createGame(), winner: 1, endReason: 'pieces' }, null)).toEqual({ outcome: 'win', title: 'White wins!', detail: 'Black has fewer than three pieces left.' });
  });
  it('distinguishes the two draw reasons and unfinished games', () => {
    expect(matchResult(createGame(), 1)).toBeNull();
    expect(matchResult({ ...createGame(), winner: 3, endReason: 'repetition' }, 1)?.detail).toContain('three times');
    expect(matchResult({ ...createGame(), winner: 3, endReason: 'no-capture' }, 1)?.detail).toContain('50 full moves');
  });
});
