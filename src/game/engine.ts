import { MILLS, NEIGHBORS, pointName } from './board';

export type Player = 1 | 2;
export type Cell = 0 | Player;
export type Action = { type: 'place'; to: number } | { type: 'move'; from: number; to: number } | { type: 'capture'; at: number };
export interface GameState {
  board: Cell[];
  reserves: [number, number];
  turn: Player;
  capture: boolean;
  winner: 0 | Player | 3;
  ply: number;
  quietTurns: number;
  repetitions: Record<string, number>;
  lastAction: string;
}

export const opponent = (player: Player): Player => player === 1 ? 2 : 1;
export const stoneCount = (state: GameState, player: Player): number => state.board.filter((cell) => cell === player).length;
export const inMill = (board: Cell[], point: number): boolean => board[point] !== 0 && MILLS.some((mill) => mill.includes(point as never) && mill.every((p) => board[p] === board[point]));
const positionKey = (state: GameState): string => `${state.board.join('')}_${state.turn}_${state.reserves.join('')}`;

export function createGame(): GameState {
  return { board: Array<Cell>(24).fill(0), reserves: [9, 9], turn: 1, capture: false, winner: 0, ply: 0, quietTurns: 0, repetitions: {}, lastAction: 'A new game begins.' };
}

export function phase(state: GameState): 'placing' | 'moving' | 'flying' {
  if (state.reserves.some((n) => n > 0)) return 'placing';
  return stoneCount(state, state.turn) === 3 ? 'flying' : 'moving';
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
    ? (stoneCount(state, state.turn) === 3 ? empty : NEIGHBORS[from].filter((to) => state.board[to] === 0)).map((to) => ({ type: 'move' as const, from, to }))
    : []);
}

export function sameAction(a: Action, b: Action): boolean {
  return a.type === b.type && (a.type === 'capture' && b.type === 'capture' ? a.at === b.at
    : a.type === 'place' && b.type === 'place' ? a.to === b.to
      : a.type === 'move' && b.type === 'move' && a.from === b.from && a.to === b.to);
}

export function applyAction(state: GameState, action: Action): GameState {
  if (!legalActions(state).some((candidate) => sameAction(candidate, action))) throw new Error('That move is not allowed.');
  const next: GameState = { ...state, board: [...state.board], reserves: [...state.reserves], repetitions: { ...state.repetitions }, ply: state.ply + 1 };
  const name = state.turn === 1 ? 'Ivory' : 'Onyx';
  if (action.type === 'capture') {
    next.board[action.at] = 0;
    next.capture = false;
    next.quietTurns = 0;
    next.lastAction = `${name} captured ${pointName(action.at)}.`;
  } else {
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
    if (stoneCount(next, next.turn) < 3 || legalActions(next).length === 0) next.winner = state.turn;
    else if (stoneCount(next, state.turn) < 3) next.winner = next.turn;
    const key = positionKey(next);
    next.repetitions[key] = (next.repetitions[key] ?? 0) + 1;
    if (!next.winner && (next.repetitions[key] >= 3 || next.quietTurns >= 100)) next.winner = 3;
  }
  return next;
}

export function instruction(state: GameState): string {
  if (state.winner === 3) return 'A draw. Well played on both sides.';
  if (state.winner) return `${state.winner === 1 ? 'Ivory' : 'Onyx'} wins the game.`;
  if (state.capture) return 'Mill formed. Remove an opponent’s stone.';
  if (phase(state) === 'placing') return 'Place a stone on an empty point.';
  if (phase(state) === 'flying') return 'Three stones left. Fly to any empty point.';
  return 'Select a stone, then an adjacent empty point.';
}
