import { ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { MOVE_TIMES, timerLabel } from '../multiplayer/room';
import type { MoveSeconds } from '../multiplayer/room';

export function NameField({ name, busy, onName, onRandomize }: { name: string; busy: boolean; onName(name: string): void; onRandomize(): void }) {
  return <div className="name-field"><label htmlFor="player-name">Your name</label><div className="join-row"><input id="player-name" value={name} onChange={(event) => onName(event.target.value)} maxLength={20} autoComplete="nickname" disabled={busy} /><button type="button" className="icon-button" aria-label="Generate a nickname" title="Generate a nickname" disabled={busy} onClick={onRandomize}><ArrowsClockwiseIcon size={20} aria-hidden="true" /></button></div><p className="field-hint">Choose a name or keep your generated nickname.</p></div>;
}

export function TurnTimer({ seconds, busy, onSeconds }: { seconds: MoveSeconds; busy: boolean; onSeconds(seconds: MoveSeconds): void }) {
  return <div className="timer-field"><label htmlFor="move-timer">Time per turn</label><select id="move-timer" value={seconds} disabled={busy} onChange={(event) => onSeconds(Number(event.target.value) as MoveSeconds)}>{MOVE_TIMES.map((value) => <option key={value} value={value}>{timerLabel(value)}</option>)}</select><p className="field-hint">{seconds ? 'Running out of time loses the game. A disconnect pauses the clock for 90 seconds; your friend can pause longer.' : 'Take your time. There is no turn timer. Disconnects still have a 90-second grace period.'}</p></div>;
}
