import { MILLS, NEIGHBORS } from './board';
import { applyAction, legalActions, opponent, stoneCount } from './engine';
import type { Action, GameState, Player } from './engine';

export type Difficulty = 'easy' | 'medium' | 'hard';
const LEVELS = { easy: { depth: 1, ms: 150 }, medium: { depth: 2, ms: 450 }, hard: { depth: 4, ms: 1200 } };

function evaluate(state: GameState, player: Player): number {
  if (state.winner) return state.winner === 3 ? 0 : state.winner === player ? 100000 - state.ply : -100000 + state.ply;
  const score = (p: Player): number => {
    let value = (stoneCount(state, p) + state.reserves[p - 1]) * 120;
    for (const mill of MILLS) {
      const own = mill.filter((point) => state.board[point] === p).length;
      const blank = mill.filter((point) => state.board[point] === 0).length;
      if (own === 3) value += 32;
      else if (own === 2 && blank === 1) value += 24;
      else if (own === 1 && blank === 2) value += 3;
    }
    state.board.forEach((cell, point) => { if (cell === p) value += NEIGHBORS[point].filter((n) => state.board[n] === 0).length * 2; });
    return value;
  };
  return score(player) - score(opponent(player)) + (state.capture ? (state.turn === player ? 90 : -90) : 0);
}

/** Iterative deepening always keeps a completed search result within a time budget. */
export function chooseAction(state: GameState, difficulty: Difficulty, random: () => number = Math.random): Action | null {
  const actions = legalActions(state);
  if (!actions.length) return null;
  if (difficulty === 'easy' && random() < 0.4) return actions[Math.min(actions.length - 1, Math.floor(random() * actions.length))];
  const { depth: maxDepth, ms } = LEVELS[difficulty];
  const deadline = performance.now() + ms;
  const player = state.turn;
  const expired = Symbol('search deadline');
  let nodes = 0;
  const ordered = (s: GameState) => legalActions(s).map((action) => {
    const next = applyAction(s, action);
    return { action, next, score: evaluate(next, player) };
  }).sort((a, b) => s.turn === player ? b.score - a.score : a.score - b.score);
  const search = (s: GameState, depth: number, alpha: number, beta: number): number => {
    if (++nodes % 32 === 0 && performance.now() > deadline) throw expired;
    if (s.winner || (depth <= 0 && !s.capture)) return evaluate(s, player);
    let best = s.turn === player ? -Infinity : Infinity;
    for (const { next } of ordered(s)) {
      const score = search(next, depth - (next.turn !== s.turn ? 1 : 0), alpha, beta);
      if (s.turn === player) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
      else { best = Math.min(best, score); beta = Math.min(beta, best); }
      if (beta <= alpha) break;
    }
    return Number.isFinite(best) ? best : evaluate(s, player);
  };
  const roots = ordered(state);
  let bestAction = roots[0].action;
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let bestScore = -Infinity;
      let candidate = bestAction;
      for (const { action, next } of roots) {
        const score = search(next, depth - (next.turn !== state.turn ? 1 : 0), bestScore, Infinity);
        if (score > bestScore) { bestScore = score; candidate = action; }
      }
      bestAction = candidate;
    } catch (error) {
      if (error !== expired) throw error;
      break;
    }
  }
  return bestAction;
}
