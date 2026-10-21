import type { Difficulty } from '../game/ai';
import type { Capture, GameState } from '../game/engine';
import type { RoomView } from '../multiplayer/types';
import { PlayerCard } from './PlayerCard';

interface Props { state: GameState; mode: 'ai' | 'local' | 'online'; room: RoomView | null; difficulty: Difficulty; thinking: boolean; captureFeedback?: Capture | null }

export function MatchPlayers({ state, mode, room, difficulty, thinking, captureFeedback }: Props) {
  return <div className="match-players" role="group" aria-label="Players">
    <PlayerCard player={1} state={state} name={mode === 'ai' ? 'You' : room ? room.names[0] : 'Player one'} subtitle={`White${room?.player === 1 ? ' · You' : ''}`} captured={captureFeedback?.player === 1} />
    <PlayerCard player={2} state={state} name={mode === 'ai' ? 'Computer' : room ? room.names[1] : 'Player two'} subtitle={mode === 'ai' ? `${difficulty[0].toUpperCase()}${difficulty.slice(1)} · Black` : `Black${room?.player === 2 ? ' · You' : ''}`} robot={mode === 'ai'} thinking={mode === 'ai' && thinking} captured={captureFeedback?.player === 2} />
  </div>;
}
