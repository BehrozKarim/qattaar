import { CircleNotchIcon, RobotIcon, UserIcon } from '@phosphor-icons/react';
import type { GameState, Player } from '../game/engine';
import { stoneCount } from '../game/engine';

interface PlayerCardProps { player: Player; state: GameState; name: string; subtitle: string; robot?: boolean; thinking?: boolean; captured?: boolean }

export function PlayerCard({ player, state, name, subtitle, robot, thinking, captured }: PlayerCardProps) {
  const active = !state.winner && state.turn === player;
  const reserves = state.reserves[player - 1];
  const lost = 9 - reserves - stoneCount(state, player);
  return <section className={`player-card ${active ? 'active' : ''} ${captured ? 'piece-lost' : ''}`} aria-label={`${name}, ${active ? 'current turn, ' : ''}${reserves} stones in hand, ${lost} lost`}>
    <div className={`player-avatar ${player === 1 ? 'light' : 'dark'}`}>{robot ? <RobotIcon size={24} aria-hidden="true" /> : <UserIcon size={23} aria-hidden="true" />}</div>
    <div className="player-identity"><strong>{name}</strong><span>{subtitle}</span></div>
    {thinking ? <CircleNotchIcon className="spin" size={20} aria-label="Thinking" /> : active && <span className="turn-label">To play</span>}
    <div className="stone-rack" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} className={`rack-stone ${player === 1 ? 'ivory' : 'onyx'} ${i >= reserves ? 'used' : ''}`} />)}</div>
    <div className="player-stats"><span><b>{reserves}</b> in hand</span><span><b>{stoneCount(state, player)}</b> on board</span><span className="lost-count"><b>{lost}</b> lost{captured && <strong className="lost-change"> −1</strong>}</span></div>
  </section>;
}
