import { pointPosition } from './boardGeometry';
import type { opponentTurn } from '../game/feedback';

export type LastTurn = NonNullable<ReturnType<typeof opponentTurn>>;

/** Static markers remain legible without motion and do not intercept board input. */
export function MoveTrail({ move }: { move: LastTurn }) {
  const action = move.turn.action;
  const end = pointPosition(action.to);
  const start = action.type === 'move' ? pointPosition(action.from) : null;
  const dx = start ? end.x - start.x : 0;
  const dy = start ? end.y - start.y : 0;
  const length = Math.hypot(dx, dy);
  return <svg className="move-trail" viewBox="0 0 600 600" aria-hidden="true" data-last-player={move.player}>
    {start && <>
      <line className="move-trail-line" x1={start.x * 600} y1={start.y * 600} x2={end.x * 600 - dx / length * 38} y2={end.y * 600 - dy / length * 38} />
      <circle className="move-origin" data-from={action.type === 'move' ? action.from : undefined} cx={start.x * 600} cy={start.y * 600} r="16" />
      <path className="move-arrow" d="M-9 -5L0 0L-9 5" transform={`translate(${end.x * 600 - dx / length * 38} ${end.y * 600 - dy / length * 38}) rotate(${Math.atan2(dy, dx) * 180 / Math.PI})`} />
    </>}
    <circle className="move-destination" data-to={action.to} cx={end.x * 600} cy={end.y * 600} r="35" />
  </svg>;
}
