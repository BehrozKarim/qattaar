import { MILLS, NEIGHBORS, pointName } from './board';
import { DEFAULT_VARIANT, VARIANTS } from './variants';
import type { Variant } from './variants';

export const RULESET = VARIANTS[DEFAULT_VARIANT].ruleset;

export type Player = 1 | 2;
export type Cell = 0 | Player;
export type Action = { type: 'place'; to: number } | { type: 'move'; from: number; to: number } | { type: 'capture'; at: number };
export interface Capture { at: number; player: Player; by: Player; ply: number }
export interface TurnRecord { action: Exclude<Action, { type: 'capture' }>; capturedAt?: number; ply: number }
export type EndReason = 'pieces' | 'blocked' | 'repetition' | 'no-capture';
export interface GameState {
  variant: Variant;
  board: Cell[];
  reserves: [number, number];
  turn: Player;
  capture: boolean;
  winner: 0 | Player | 3;
  ply: number;
  quietTurns: number;
  repetitions: Record<string, number>;
  lastAction: string;
  lastMove: { action: Action; player: Player } | null;
  lastTurns: [TurnRecord | null, TurnRecord | null];
  lastCapture: Capture | null;
  endReason: EndReason | null;
}

export const opponent = (player: Player): Player => player === 1 ? 2 : 1;
export const playerName = (player: Player): string => player === 1 ? 'White' : 'Black';
export const stoneCount = (state: GameState, player: Player): number => state.board.filter((cell) => cell === player).length;
export const inMill = (board: Cell[], point: number): boolean => board[point] !== 0 && MILLS.some((mill) => mill.includes(point as never) && mill.every((p) => board[p] === board[point]));
const positionKey = (state: GameState): string => `${state.board.join('')}_${state.turn}_${state.reserves.join('')}`;

export function createGame(variant: Variant = DEFAULT_VARIANT): GameState {
  return { variant, board: Array<Cell>(24).fill(0), reserves: [9, 9], turn: 1, capture: false, winner: 0, ply: 0, quietTurns: 0, repetitions: {}, lastAction: 'A new game begins.', lastMove: null, lastTurns: [null, null], lastCapture: null, endReason: null };
}

export function phase(state: GameState): 'placing' | 'moving' | 'flying' {
  if (state.reserves.some((n) => n > 0)) return 'placing';
  return state.variant === 'classic' && stoneCount(state, state.turn) === 3 ? 'flying' : 'moving';
}

export function legalActions(state: GameState): Action[] {
  if (state.winner) return [];
  const empty = state.board.flatMap((cell, p) => cell === 0 ? [p] : []);
  if (state.capture) {
    const theirs = state.board.flatMap((cell, p) => cell === opponent(state.turn) ? [p] : []);
    const exposed = theirs.filter((p) => !inMill(state.board, p));
    return (exposed.length ? exposed : theirs).map((at) => ({ type: 'capture', at }));
  }
  if (state.reserves[state.turn - 1] > 0) return empty.map((to) => ({ type: 'place', to }));
  return state.board.flatMap((cell, from) => cell === state.turn
    ? (phase(state) === 'flying' ? empty : NEIGHBORS[from].filter((to) => state.board[to] === 0)).map((to) => ({ type: 'move' as const, from, to }))
    : []);
}

export function sameAction(a: Action, b: Action): boolean {
  return a.type === b.type && (a.type === 'capture' && b.type === 'capture' ? a.at === b.at
    : a.type === 'place' && b.type === 'place' ? a.to === b.to
      : a.type === 'move' && b.type === 'move' && a.from === b.from && a.to === b.to);
}

export function applyAction(state: GameState, action: Action): GameState {
  if (!legalActions(state).some((candidate) => sameAction(candidate, action))) throw new Error('That move is not allowed.');
  const next: GameState = { ...state, board: [...state.board], reserves: [...state.reserves], lastTurns: [...state.lastTurns], repetitions: { ...state.repetitions }, ply: state.ply + 1, lastMove: { action, player: state.turn } };
  const name = playerName(state.turn);
  if (action.type === 'capture') {
    next.board[action.at] = 0;
    next.capture = false;
    next.quietTurns = 0;
    next.lastCapture = { at: action.at, player: opponent(state.turn), by: state.turn, ply: next.ply };
    const turn = next.lastTurns[state.turn - 1];
    if (turn) next.lastTurns[state.turn - 1] = { ...turn, capturedAt: action.at };
    next.lastAction = `${name} captured a ${playerName(opponent(state.turn)).toLowerCase()} piece at ${pointName(action.at)}.`;
  } else {
    next.lastTurns[state.turn - 1] = { action, ply: next.ply };
    next.board[action.to] = state.turn;
    if (action.type === 'place') {
      next.reserves[state.turn - 1]--;
      next.quietTurns = 0;
      next.lastAction = `${name} placed at ${pointName(action.to)}.`;
    } else {
      next.board[action.from] = 0;
      next.quietTurns++;
      next.lastAction = `${name} moved ${pointName(action.from)} to ${pointName(action.to)}.`;
    }
    next.capture = inMill(next.board, action.to) && next.board.some((cell) => cell === opponent(state.turn));
    if (next.capture) return next;
  }
  next.turn = opponent(state.turn);
  if (next.reserves.every((n) => n === 0)) {
    if (stoneCount(next, next.turn) < 3) { next.winner = state.turn; next.endReason = 'pieces'; }
    else if (stoneCount(next, state.turn) < 3) { next.winner = next.turn; next.endReason = 'pieces'; }
    else if (legalActions(next).length === 0) { next.winner = state.turn; next.endReason = 'blocked'; }
    const key = positionKey(next);
    next.repetitions[key] = (next.repetitions[key] ?? 0) + 1;
    if (!next.winner && next.repetitions[key] >= 3) { next.winner = 3; next.endReason = 'repetition'; }
    else if (!next.winner && next.quietTurns >= 100) { next.winner = 3; next.endReason = 'no-capture'; }
  }
  return next;
}

export function instruction(state: GameState): string {
  if (state.winner === 3) return 'A draw. Well played on both sides.';
  if (state.winner) return `${playerName(state.winner)} wins the game.`;
  if (state.capture) return 'Three in a row! Choose an opponent’s piece to capture.';
  if (phase(state) === 'placing') return 'Place a piece on an empty point.';
  if (phase(state) === 'flying') return 'Three pieces left: fly to any empty point.';
  return state.variant === 'balochi' ? 'Move to an adjacent empty point, even with three pieces.' : 'Move a piece to an adjacent empty point.';
}
