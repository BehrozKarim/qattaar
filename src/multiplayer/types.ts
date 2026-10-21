import type { Action, GameState, Player } from '../game/engine';

export interface RoomView {
  code: string;
  player: Player;
  state: GameState;
  ready: boolean;
  opponentOnline: boolean;
  connected: boolean;
}

/** UI depends on this contract, not on a particular realtime provider. */
export interface MultiplayerSession {
  create(): Promise<void>;
  join(code: string): Promise<void>;
  move(action: Action): Promise<void>;
  close(): Promise<void>;
}

export interface SessionCallbacks {
  onRoom(room: RoomView): void;
  onError(message: string): void;
}
