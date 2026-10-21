import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import { captureMessage, matchResult, opponentTurn } from './feedback';

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
  it('explains timeouts to both players', () => {
    const state = { ...createGame(), winner: 2 as const, endReason: 'timeout' as const };
    expect(matchResult(state, 1)).toMatchObject({ outcome: 'loss', detail: 'You ran out of time.' });
    expect(matchResult(state, 2)).toMatchObject({ outcome: 'win', detail: 'White ran out of time.' });
  });
  it('distinguishes the two draw reasons and unfinished games', () => {
    expect(matchResult(createGame(), 1)).toBeNull();
    expect(matchResult({ ...createGame(), winner: 3, endReason: 'repetition' }, 1)?.detail).toContain('three times');
    expect(matchResult({ ...createGame(), winner: 3, endReason: 'no-capture' }, 1)?.detail).toContain('50 full moves');
  });
  it('keeps the opponent’s last move visible after the viewer plays', () => {
    let game = createGame();
    for (const to of [0, 3, 1]) game = applyAction(game, { type: 'place', to });
    expect(opponentTurn(game, 1)).toMatchObject({ player: 2, title: 'Opponent’s last move', detail: 'Black placed at b6' });
    expect(opponentTurn(game, 2)?.detail).toBe('White placed at d7');
    expect(opponentTurn(game, null)?.player).toBe(1);
    expect(opponentTurn(createGame(), 1)).toBeNull();
  });
  it('describes an origin, destination, and capture from the same turn', () => {
    const state = createGame();
    state.lastTurns[1] = { action: { type: 'move', from: 1, to: 4 }, capturedAt: 3, ply: 22 };
    expect(opponentTurn(state, 1)?.detail).toBe('Black: d7 → d6 · captured at b6');
  });
});
