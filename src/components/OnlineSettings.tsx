import { ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { MOVE_TIMES, timerLabel } from '../multiplayer/room';
import type { MoveSeconds } from '../multiplayer/room';

interface Props { name: string; seconds: MoveSeconds; busy: boolean; onName(name: string): void; onRandomize(): void; onSeconds(seconds: MoveSeconds): void }

export function OnlineSettings({ name, seconds, busy, onName, onRandomize, onSeconds }: Props) {
  return <div className="online-settings">
    <label htmlFor="player-name">Your name</label><div className="join-row"><input id="player-name" value={name} onChange={(event) => onName(event.target.value)} maxLength={20} autoComplete="nickname" disabled={busy} /><button className="icon-button" aria-label="Generate a nickname" title="Generate a nickname" disabled={busy} onClick={onRandomize}><ArrowsClockwiseIcon size={20} /></button></div>
    <label htmlFor="move-timer">Time per turn</label><select id="move-timer" value={seconds} disabled={busy} onChange={(event) => onSeconds(Number(event.target.value) as MoveSeconds)}>{MOVE_TIMES.map((value) => <option key={value} value={value}>{timerLabel(value)}</option>)}</select>
    <p>The host chooses the timer. Running out of time loses the game. Timed turns continue if a player disconnects.</p>
  </div>;
}
