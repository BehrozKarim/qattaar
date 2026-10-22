import { pointName } from './board';
import { opponent, playerName } from './engine';
import type { Capture, GameState, Player } from './engine';

export const CAPTURE_FEEDBACK_MS = 1800;
export const MILL_PREVIEW_MS = 1000;

export function opponentTurn(state: GameState, viewer: Player | null) {
  const player = opponent(viewer ?? state.turn);
  const turn = state.lastTurns[player - 1];
  if (!turn) return null;
  const name = playerName(player);
  const action = turn.action;
  const detail = action.type === 'move' ? `${name}: ${pointName(action.from)} → ${pointName(action.to)}` : `${name} placed at ${pointName(action.to)}`;
  return { player, turn, title: viewer ? 'Opponent’s last move' : `${name}’s last move`, detail: `${detail}${turn.capturedAt === undefined ? '' : ` · captured at ${pointName(turn.capturedAt)}`}` };
}

export function captureMessage(capture: Capture, viewer: Player | null) {
  const color = playerName(capture.player).toLowerCase();
  const title = viewer === capture.player ? 'Your piece was captured' : viewer === capture.by ? 'You captured a piece' : `${playerName(capture.by)} captured a piece`;
  return { title, detail: `${playerName(capture.by)} took ${viewer === capture.player ? 'your' : 'a'} ${color} piece at ${pointName(capture.at)}.` };
}

export function matchResult(state: GameState, viewer: Player | null) {
  if (!state.winner) return null;
  if (state.winner === 3) return {
    outcome: 'draw' as const, title: 'It’s a draw',
    detail: state.endReason === 'repetition' ? 'The same position occurred three times.' : 'Neither player captured a piece for 50 full moves.',
  };
  const loser = opponent(state.winner);
  const subject = viewer === loser ? 'You have' : `${playerName(loser)} has`;
  const outcome = viewer === null || viewer === state.winner ? 'win' as const : 'loss' as const;
  const title = viewer === null ? `${playerName(state.winner)} wins!` : outcome === 'win' ? 'You won!' : 'You lost';
  const detail = state.endReason === 'blocked' ? `${subject} no legal moves left.`
    : state.endReason === 'timeout' ? `${viewer === loser ? 'You ran' : `${playerName(loser)} ran`} out of time.`
    : state.endReason === 'resigned' ? `${viewer === loser ? 'You resigned' : 'Your opponent resigned'} from the game.`
    : state.endReason === 'disconnected' ? `${viewer === loser ? 'You did' : 'Your opponent did'} not reconnect before the grace period ended.`
    : state.endReason === 'pieces' ? `${subject} fewer than three pieces left.` : `${playerName(state.winner)} wins the game.`;
  return { outcome, title, detail };
}
