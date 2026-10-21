import { applyAction, createGame, opponent } from '../game/engine';
import type { Action, GameState, Player } from '../game/engine';
import { variantFromRuleset } from '../game/variants';

export const ROOM_PROTOCOL = 2;
export const MOVE_TIMES = [0, 30, 60, 120] as const;
export type MoveSeconds = typeof MOVE_TIMES[number];
export const timerLabel = (seconds: number) => seconds === 0 ? 'No timer' : seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;

export interface StoredRoom {
  ruleset: string; host: string; guest: string; slot: string;
  createdAt: number; expiresAt: number; revision: number; turn: Player;
  moves?: Record<string, { uid: string; action: Action }>;
  presence?: Record<string, boolean>;
  protocol?: number; round?: number; hostName?: string; guestName?: string;
  moveSeconds?: MoveSeconds; turnStartedAt?: number; turnDelayMs?: number;
  finished?: GameState['winner']; timeout?: 0 | Player;
  rematch?: Record<string, boolean>;
}

export const validName = (name: unknown): name is string => typeof name === 'string' && name.length >= 1 && name.length <= 20 && name.trim().length > 0 && Array.from(name).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);

/** One server-stamped allowance covers the move and its capture. */
export function turnDeadline(room: StoredRoom): number | null {
  if (room.protocol !== ROOM_PROTOCOL || !room.guest || !room.moveSeconds || !room.turnStartedAt || room.finished) return null;
  return room.turnStartedAt + room.moveSeconds * 1000 + (room.turnDelayMs ?? 0);
}

export function replayRoom(room: StoredRoom) {
  const variant = variantFromRuleset(room.ruleset);
  if (!variant) throw new Error('This room uses different rules. Both players should refresh and create a new room.');
  if (room.protocol !== undefined && room.protocol !== ROOM_PROTOCOL) throw new Error('This room needs a newer version. Refresh both browsers.');
  if (!Number.isInteger(room.revision) || room.revision < 0 || room.revision > 2000) throw new Error('This room has an invalid move history.');
  if (room.protocol === ROOM_PROTOCOL && (!validName(room.hostName) || (room.guest && !validName(room.guestName)) || !MOVE_TIMES.includes(room.moveSeconds as MoveSeconds) || !Number.isInteger(room.round) || (room.round ?? -1) < 0 || !Number.isFinite(room.turnStartedAt) || (room.turnStartedAt ?? -1) < 0 || ![0, 1800].includes(room.turnDelayMs ?? -1))) throw new Error('This room has invalid settings. Create a new room.');
  let state = createGame(variant);
  for (let i = 0; i < room.revision; i++) {
    const move = room.moves?.[i];
    if (!move || move.uid !== (state.turn === 1 ? room.host : room.guest)) throw new Error('This room has an invalid move history.');
    state = applyAction(state, move.action);
  }
  if (state.turn !== room.turn) throw new Error('The room is out of sync. Please leave and create a new room.');
  if (room.protocol === ROOM_PROTOCOL) {
    if (room.timeout) {
      if (!room.guest || !room.moveSeconds || room.timeout !== state.turn || state.winner || room.finished !== opponent(state.turn)) throw new Error('This room has an invalid timeout.');
      state = { ...state, winner: opponent(state.turn), endReason: 'timeout' };
    } else if (room.finished !== state.winner) throw new Error('The room result is out of sync. Refresh the page.');
  }
  return state;
}
