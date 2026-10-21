import type { Difficulty } from '../game/ai';
import type { GameState } from '../game/engine';
import type { RoomView } from '../multiplayer/types';
import { PlayerCard } from './PlayerCard';

interface Props { state: GameState; mode: 'ai' | 'local' | 'online'; room: RoomView | null; difficulty: Difficulty; thinking: boolean }

export function MatchPlayers({ state, mode, room, difficulty, thinking }: Props) {
  return <div className="match-players" role="group" aria-label="Players">
    <PlayerCard player={1} state={state} name={mode === 'ai' ? 'You' : room ? room.player === 1 ? 'You' : 'Your friend' : 'Player one'} subtitle="Ivory" />
    <PlayerCard player={2} state={state} name={mode === 'ai' ? 'Computer' : room ? room.player === 2 ? 'You' : room.ready ? 'Your friend' : 'Waiting for a friend' : 'Player two'} subtitle={mode === 'ai' ? `${difficulty[0].toUpperCase()}${difficulty.slice(1)} · Onyx` : 'Onyx'} robot={mode === 'ai'} thinking={mode === 'ai' && thinking} />
  </div>;
}
