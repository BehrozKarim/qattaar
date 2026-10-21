import { EqualsIcon, FlagIcon, TrophyIcon } from '@phosphor-icons/react';
import type { matchResult } from '../game/feedback';

interface Props { result: NonNullable<ReturnType<typeof matchResult>>; online: boolean; onAgain(): void; onDismiss(): void }

export function MatchResult({ result, online, onAgain, onDismiss }: Props) {
  const Icon = result.outcome === 'win' ? TrophyIcon : result.outcome === 'loss' ? FlagIcon : EqualsIcon;
  return <div className={`result-overlay ${result.outcome}`}>
    <section className="result-card" aria-label="Game result">
      <Icon size={40} weight="duotone" aria-hidden="true" />
      <span className="eyebrow">GAME OVER</span>
      <h2>{result.title}</h2><p>{result.detail}</p>
      <button className="primary-button" onClick={onAgain}>{online ? 'Leave room' : 'Play again'}</button>
      <button className="text-button" onClick={onDismiss}>View board</button>
    </section>
  </div>;
}
