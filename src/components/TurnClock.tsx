import { useEffect, useState } from 'react';
import type { RoomView } from '../multiplayer/types';
import { timerLabel } from '../multiplayer/room';

export function TurnClock({ room }: { room: RoomView }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (room.deadline === null) return;
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 250);
    window.addEventListener('focus', tick);
    return () => { clearInterval(interval); window.removeEventListener('focus', tick); };
  }, [room.deadline]);
  if (!room.moveSeconds) return null;
  const remaining = room.frozenRemainingMs !== null ? Math.ceil(room.frozenRemainingMs / 1000) : room.deadline === null ? room.state.endReason === 'timeout' ? 0 : room.moveSeconds : Math.min(room.moveSeconds, Math.max(0, Math.ceil((room.deadline - now - room.serverOffset) / 1000)));
  const label = room.state.winner ? 'Game finished' : room.paused ? 'Clock paused · reconnecting' : !room.ready ? 'Clock starts when your friend joins' : `${room.names[room.state.turn - 1]}’s turn`;
  const normalFinish = Boolean(room.state.winner && room.state.endReason !== 'timeout');
  return <div className={`turn-clock ${remaining <= 10 && room.deadline !== null ? 'clock-low' : ''}`} aria-label={normalFinish ? label : `${label}. ${remaining} seconds remaining.`}>
    <div><strong>{label}</strong><span>{timerLabel(room.moveSeconds)} per turn · includes capture</span></div>
    <time aria-hidden="true">{normalFinish || !room.connected ? '—' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</time>
  </div>;
}
