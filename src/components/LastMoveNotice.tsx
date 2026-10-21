import type { LastTurn } from './MoveTrail';

export function LastMoveNotice({ move }: { move: LastTurn }) {
  return <div className="last-move" role="status" aria-live="polite" aria-atomic="true">
    <span className="move-legend" aria-hidden="true">○ → ●</span>
    <div><span>{move.title}</span><strong>{move.detail}</strong></div>
  </div>;
}
