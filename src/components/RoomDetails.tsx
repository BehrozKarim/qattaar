import { CheckIcon, CopyIcon, LinkIcon } from '@phosphor-icons/react';
import { timerLabel } from '../multiplayer/room';
import type { RoomView } from '../multiplayer/types';
import { VARIANTS } from '../game/variants';

export function RoomDetails({ room, copied, onCopy }: { room: RoomView; copied: boolean; onCopy(link?: boolean): void }) {
  return <div className="room-details"><span className="eyebrow">YOUR ROOM CODE</span><div className="room-code"><span>{room.code.slice(0, 4)}-{room.code.slice(4)}</span><button className="icon-button" aria-label="Copy room code" onClick={() => onCopy()}>{copied ? <CheckIcon size={20} aria-hidden="true" /> : <CopyIcon size={20} aria-hidden="true" />}</button></div><button className="secondary-button" onClick={() => onCopy(true)}><LinkIcon size={18} aria-hidden="true" />{copied ? 'Copied' : 'Copy invite link'}</button><p className="room-summary">{VARIANTS[room.state.variant].shortName} · {timerLabel(room.moveSeconds)}{room.moveSeconds ? ' per turn' : ''}</p></div>;
}
