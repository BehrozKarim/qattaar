import { useEffect, useState } from 'react';
import type { RoomView } from '../multiplayer/types';

interface Props { room: RoomView; busy: boolean; onPause(): void; onResume(): void; onClaim(): void }

export function ConnectionNotice({ room, busy, onPause, onResume, onClaim }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!room.graceUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [room.graceUntil]);
  if (room.state.winner || (room.connected && room.opponentOnline && !room.paused)) return null;
  const seconds = Math.min(90, Math.max(0, Math.ceil(((room.graceUntil ?? now) - now - room.serverOffset) / 1000)));
  const opponentName = room.names[room.player === 1 ? 1 : 0];
  return <aside className="connection-notice" aria-label="Connection status">
    <div role="status" aria-live="polite">
      <strong>{!room.connected ? 'Reconnecting to your game…' : room.waitingLonger ? 'Game paused' : `${opponentName} is reconnecting…`}</strong>
      <p>{!room.connected ? 'Keep this page open. Your seat and moves are saved; reconnecting happens automatically.'
        : room.waitingLonger ? 'The board and clock are paused. Play resumes when your friend returns, or you resume the clock.'
        : room.paused ? 'The board and turn clock are paused for the reconnection grace period.'
        : 'The grace period has ended. The turn clock can run again, or you can claim the game.'}</p>
    </div>
    {room.connected && room.paused && !room.waitingLonger && <span className="grace-countdown" aria-label="Reconnection grace time remaining">{seconds}s to reconnect</span>}
    {room.connected && room.supportsRecovery && <div className="connection-actions">
      {room.paused && !room.waitingLonger && !room.opponentOnline && <button className="secondary-button" disabled={busy} onClick={onPause}>Pause while waiting</button>}
      {room.pausedByYou && <button className="secondary-button" disabled={busy} onClick={onResume}>Resume clock</button>}
      {room.canClaimDisconnect && <button className="secondary-button" disabled={busy} onClick={onClaim}>Claim game</button>}
    </div>}
  </aside>;
}
