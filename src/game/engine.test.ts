import { describe, expect, it } from 'vitest';
import { applyAction, createGame, inMill, legalActions, phase } from './engine';
import type { Cell, GameState, Player } from './engine';
import { chooseAction } from './ai';
import { MILLS, NEIGHBORS } from './board';

function position(ivory: number[], onyx: number[], extras: Partial<GameState> = {}): GameState {
  const board = Array<Cell>(24).fill(0);
  ivory.forEach((p) => board[p] = 1); onyx.forEach((p) => board[p] = 2);
  return { ...createGame(), board, reserves: [0, 0], ...extras };
}

describe('board topology', () => {
  it('has 16 mills and symmetric, consecutive connections without crossing the center', () => {
    expect(MILLS).toHaveLength(16);
    expect(NEIGHBORS[1]).toEqual(expect.arrayContaining([0, 2, 4]));
    expect(NEIGHBORS[7]).not.toContain(16);
    NEIGHBORS.forEach((list, from) => list.forEach((to) => expect(NEIGHBORS[to]).toContain(from)));
  });
});

describe('Balochi Qattaar rules', () => {
  it('places alternately and rejects occupied points without mutating state', () => {
    const game = createGame(); const next = applyAction(game, { type: 'place', to: 0 });
    expect(next.turn).toBe(2); expect(next.reserves).toEqual([8, 9]); expect(game.board[0]).toBe(0);
    expect(() => applyAction(next, { type: 'place', to: 0 })).toThrow();
  });
  it('keeps the turn after a mill and requires a capture', () => {
    const game = position([0, 1], [3, 5, 6], { reserves: [7, 6] });
    const mill = applyAction(game, { type: 'place', to: 2 });
    expect(mill.capture).toBe(true); expect(mill.turn).toBe(1);
    expect(legalActions(mill).every((a) => a.type === 'capture')).toBe(true);
    expect(applyAction(mill, { type: 'capture', at: 6 }).turn).toBe(2);
  });
  it('protects mills unless every opposing stone is in a mill', () => {
    const game = position([0, 1, 2], [3, 4, 5, 6], { capture: true });
    expect(legalActions(game)).toEqual([{ type: 'capture', at: 6 }]);
    game.board[6] = 0;
    expect(legalActions(game)).toHaveLength(3);
  });
  it('only permits adjacent movement with more than three stones', () => {
    const game = position([0, 3, 6, 9], [2, 5, 8, 14]);
    expect(phase(game)).toBe('moving');
    expect(() => applyAction(game, { type: 'move', from: 0, to: 23 })).toThrow();
    expect(applyAction(game, { type: 'move', from: 0, to: 1 }).board[1]).toBe(1);
  });
  it('keeps movement adjacent with exactly three pieces', () => {
    const game = position([0, 3, 6], [2, 5, 8, 14]);
    expect(phase(game)).toBe('moving');
    expect(() => applyAction(game, { type: 'move', from: 0, to: 23 })).toThrow();
    expect(applyAction(game, { type: 'move', from: 0, to: 1 }).board[1]).toBe(1);
    for (const action of legalActions(game)) if (action.type === 'move') expect(NEIGHBORS[action.from]).toContain(action.to);
  });
  it('wins when a capture leaves fewer than three stones', () => {
    const game = position([0, 1, 2, 21], [3, 5, 6], { capture: true });
    const next = applyAction(game, { type: 'capture', at: 3 });
    expect(next.winner).toBe(1); expect(legalActions(next)).toEqual([]);
    expect(next.endReason).toBe('pieces');
    expect(next.lastCapture).toEqual({ at: 3, player: 2, by: 1, ply: 1 });
  });
  it('does not end during placement when stones are still in reserve', () => {
    const game = position([0, 1, 2], [3, 5], { capture: true, reserves: [6, 7] });
    expect(applyAction(game, { type: 'capture', at: 3 }).winner).toBe(0);
  });
  it('wins when the next player is blocked', () => {
    const game = position([1, 9, 4, 10, 7, 11, 22, 20], [0, 3, 6, 21]);
    expect(applyAction(game, { type: 'move', from: 20, to: 19 }).winner).toBe(1);
  });
  it.each([1, 2] as Player[])('player %s wins by blocking all three opposing pieces', (player) => {
    const blockers = [1, 4, 7, 9, 10, 11, 20];
    const blocked = [0, 3, 6];
    const game = position(player === 1 ? blockers : blocked, player === 1 ? blocked : blockers, { turn: player });
    const next = applyAction(game, { type: 'move', from: 20, to: 19 });
    expect(next.winner).toBe(player); expect(next.endReason).toBe('blocked');
    expect(legalActions(next)).toEqual([]);
  });
  it('retains capture details after later moves for the match history', () => {
    const game = position([0, 1, 2], [3, 5, 6], { capture: true, reserves: [6, 6] });
    const captured = applyAction(game, { type: 'capture', at: 6 });
    const moved = applyAction(captured, { type: 'place', to: 8 });
    expect(moved.lastCapture).toEqual(captured.lastCapture);
    expect(moved.lastMove).toEqual({ action: { type: 'place', to: 8 }, player: 2 });
  });
  it('draws after 100 half moves without a capture', () => {
    const game = position([0, 3, 6, 9], [2, 5, 8, 14], { quietTurns: 99 });
    expect(applyAction(game, { type: 'move', from: 0, to: 1 }).winner).toBe(3);
  });
  it('draws on the third occurrence of a position with the same player to move', () => {
    let game = position([0, 3, 6, 9], [2, 5, 8, 14]);
    const cycle = [{ type: 'move', from: 0, to: 1 }, { type: 'move', from: 5, to: 4 }, { type: 'move', from: 1, to: 0 }, { type: 'move', from: 4, to: 5 }] as const;
    for (let i = 0; i < 12 && !game.winner; i++) game = applyAction(game, cycle[i % cycle.length]);
    expect(game.winner).toBe(3); expect(game.quietTurns).toBeLessThan(100);
  });
  it('awards only one capture when two mills form at once', () => {
    const game = position([0, 2, 4, 7], [3, 5, 6], { reserves: [5, 6] });
    const mill = applyAction(game, { type: 'place', to: 1 });
    expect(mill.capture).toBe(true);
    const captured = applyAction(mill, { type: 'capture', at: 6 });
    expect(captured.capture).toBe(false); expect(captured.turn).toBe(2);
  });
  it('recognizes every mill', () => MILLS.forEach((mill) => {
    const board = Array<Cell>(24).fill(0); mill.forEach((p) => board[p] = 1);
    mill.forEach((p) => expect(inMill(board, p)).toBe(true));
  }));
});

describe('AI', () => {
  it.each(['easy', 'medium', 'hard'] as const)('%s returns a legal move', (level) => {
    const game = createGame(); const action = chooseAction(game, level, () => 0.9);
    expect(legalActions(game)).toContainEqual(action);
  });
  it('completes an immediate mill', () => {
    const game = position([0, 1], [3, 6], { reserves: [7, 7] });
    expect(chooseAction(game, 'medium', () => 0.9)).toEqual({ type: 'place', to: 2 });
  });
  it('returns no move for a finished game', () => expect(chooseAction({ ...createGame(), winner: 1 }, 'hard')).toBeNull());
  it.each(['easy', 'medium', 'hard'] as const)('%s obeys adjacent movement with three pieces', (level) => {
    const game = position([0, 3, 6], [2, 5, 8, 14]);
    const action = chooseAction(game, level, () => 0.9);
    expect(action?.type).toBe('move');
    if (action?.type === 'move') expect(NEIGHBORS[action.from]).toContain(action.to);
  });
  it.each(['easy', 'medium', 'hard'] as const)('%s can fly out of a blocked three-piece position in Classic', (level) => {
    const game = position([0, 3, 6], [1, 4, 7, 9, 10, 11, 20], { variant: 'classic' });
    const action = chooseAction(game, level, () => 0.9);
    expect(legalActions(game)).toContainEqual(action);
    expect(action?.type).toBe('move');
    if (action?.type === 'move') expect(NEIGHBORS[action.from]).not.toContain(action.to);
  });
});

describe('Classic Nine Men’s Morris', () => {
  it.each([1, 2] as Player[])('player %s may fly to any empty point with exactly three pieces', (player) => {
    const game = position(player === 1 ? [0, 3, 6] : [2, 5, 8, 14], player === 1 ? [2, 5, 8, 14] : [0, 3, 6], { variant: 'classic', turn: player });
    expect(phase(game)).toBe('flying');
    expect(applyAction(game, { type: 'move', from: 0, to: 23 }).board[23]).toBe(player);
    expect(() => applyAction(game, { type: 'move', from: 0, to: 2 })).toThrow();
  });
  it('requires adjacency with four pieces', () => {
    const game = position([0, 3, 6, 9], [2, 5, 8, 14], { variant: 'classic' });
    expect(phase(game)).toBe('moving');
    expect(() => applyAction(game, { type: 'move', from: 0, to: 23 })).toThrow();
  });
  it('does not award a blocked win when the next player can fly', () => {
    const game = position([1, 4, 7, 9, 10, 11, 20], [0, 3, 6], { variant: 'classic' });
    const next = applyAction(game, { type: 'move', from: 20, to: 19 });
    expect(next.winner).toBe(0); expect(legalActions(next).length).toBeGreaterThan(0);
  });
  it('still awards a win for blocking four opposing pieces', () => {
    const game = position([1, 9, 4, 10, 7, 11, 22, 20], [0, 3, 6, 21], { variant: 'classic' });
    const next = applyAction(game, { type: 'move', from: 20, to: 19 });
    expect(next.winner).toBe(1); expect(next.endReason).toBe('blocked');
  });
});

describe('last-turn history', () => {
  it('keeps a mill’s placement and capture together without mutating earlier states', () => {
    let game = createGame();
    for (const to of [0, 3, 1, 5, 2]) game = applyAction(game, { type: 'place', to });
    const captured = applyAction(game, { type: 'capture', at: 3 });
    expect(captured.lastTurns[0]).toEqual({ action: { type: 'place', to: 2 }, ply: 5, capturedAt: 3 });
    expect(game.lastTurns[0]?.capturedAt).toBeUndefined();
    const next = applyAction(captured, { type: 'place', to: 6 });
    expect(next.lastTurns[0]).toEqual(captured.lastTurns[0]);
    expect(next.lastTurns[1]?.action).toEqual({ type: 'place', to: 6 });
  });
});
