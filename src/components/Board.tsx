import { useState } from 'react';
import { MILLS, POINTS, pointName } from '../game/board';
import { legalActions } from '../game/engine';
import type { Action, GameState } from '../game/engine';

interface BoardProps { state: GameState; enabled: boolean; onMove(action: Action): void }

export function Board({ state, enabled, onMove }: BoardProps) {
  const [selection, setSelection] = useState<{ point: number; ply: number } | null>(null);
  const selected = selection?.ply === state.ply ? selection.point : null;
  const actions = enabled ? legalActions(state) : [];
  const destinations = actions.filter((a) => a.type === 'place' || a.type === 'capture' || a.from === selected)
    .map((a) => a.type === 'capture' ? a.at : a.to);
  const mills = MILLS.filter((mill) => mill.every((p) => state.board[p] === state.turn) && state.capture);

  function choose(point: number) {
    const action = actions.find((a) => a.type === 'capture' ? a.at === point : a.type === 'place' ? a.to === point : a.from === selected && a.to === point);
    if (action) { setSelection(null); onMove(action); return; }
    if (actions.some((a) => a.type === 'move' && a.from === point)) setSelection(selected === point ? null : { point, ply: state.ply });
  }

  return <div className="board-frame">
    <div className="board-coordinate top">a <span>d</span> g</div>
    <div className="board" role="group" aria-label="Nine Men's Morris board. Use Tab to choose a point and Enter to play.">
      <svg className="board-lines" viewBox="0 0 600 600" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M48 48H552V552H48ZM132 132H468V468H132ZM216 216H384V384H216Z" />
          <path d="M300 48V216M300 384V552M48 300H216M384 300H552" />
        </g>
        {mills.map((mill) => <line key={mill[0]} x1={48 + POINTS[mill[0]][0] * 84} y1={48 + POINTS[mill[0]][1] * 84} x2={48 + POINTS[mill[2]][0] * 84} y2={48 + POINTS[mill[2]][1] * 84} className="mill-line" />)}
      </svg>
      <div className="board-center" aria-hidden="true"><span>Q</span><small>QATTAAR</small></div>
      {POINTS.map(([x, y], point) => {
        const cell = state.board[point];
        const canSelect = actions.some((a) => a.type === 'move' && a.from === point);
        const legal = destinations.includes(point);
        return <button
          key={point} className={`point ${cell ? `stone ${cell === 1 ? 'ivory' : 'onyx'}` : 'empty'} ${selected === point ? 'selected' : ''} ${legal ? 'legal' : ''} ${state.capture && legal ? 'capturable' : ''}`}
          style={{ left: `${8 + x * 14}%`, top: `${8 + y * 14}%` }}
          aria-label={`${pointName(point)}: ${cell === 1 ? 'Ivory stone' : cell === 2 ? 'Onyx stone' : 'empty'}${legal ? state.capture ? ', capture' : ', available destination' : ''}`}
          aria-pressed={selected === point} aria-disabled={!enabled || (!legal && !canSelect)}
          onClick={() => { if (enabled) choose(point); }}
        ><span className="point-surface">{cell === 2 && <span className="onyx-mark" aria-hidden="true" />}</span></button>;
      })}
    </div>
    <div className="board-coordinate bottom"><span>7</span><span>4</span><span>1</span></div>
  </div>;
}
