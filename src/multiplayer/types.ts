import type { Action, GameState, Player } from '../game/engine';
import type { Variant } from '../game/variants';
import type { MoveSeconds } from './room';

export interface RoomView {
  code: string;
  player: Player;
  state: GameState;
  ready: boolean;
  opponentOnline: boolean;
  connected: boolean;
  names: [string, string];
  round: number;
  moveSeconds: MoveSeconds;
  deadline: number | null;
  serverOffset: number;
  rematchRequested: boolean;
  opponentRequestedRematch: boolean;
  supportsRematch: boolean;
}

/** UI depends on this contract, not on a particular realtime provider. */
export interface MultiplayerSession {
  create(variant: Variant, name: string, moveSeconds: MoveSeconds): Promise<void>;
  join(code: string, name: string): Promise<void>;
  move(action: Action): Promise<void>;
  requestRematch(): Promise<void>;
  close(): Promise<void>;
}

export interface SessionCallbacks {
  onRoom(room: RoomView): void;
  onError(message: string): void;
}
