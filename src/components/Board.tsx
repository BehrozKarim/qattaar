import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { MILLS, POINTS, pointName } from '../game/board';
import { legalActions, phase } from '../game/engine';
import type { Action, Capture, GameState } from '../game/engine';
import { dropPoint, pointPosition } from './boardGeometry';
import type { BoardBounds } from './boardGeometry';
import { MoveTrail } from './MoveTrail';
import type { LastTurn } from './MoveTrail';

interface BoardProps { state: GameState; enabled: boolean; onMove(action: Action): void; captureFeedback?: Capture | null; lastTurn?: LastTurn | null; children?: ReactNode }
interface Drag { from: number; ply: number; pointerId: number; x: number; y: number; active: boolean; element: HTMLButtonElement; bounds: BoardBounds }

export function Board({ state, enabled, onMove, captureFeedback, lastTurn, children }: BoardProps) {
  const [selection, setSelection] = useState<{ point: number; ply: number } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const landing = useRef<HTMLElement | null>(null);
  const suppressClick = useRef(false);
  const selected = selection?.ply === state.ply ? selection.point : null;
  const actions = enabled ? legalActions(state) : [];
  const destinations = actions.filter((a) => a.type === 'place' || a.type === 'capture' || a.from === selected)
    .map((a) => a.type === 'capture' ? a.at : a.to);
  const mills = MILLS.filter((mill) => mill.every((p) => state.board[p] === state.turn) && state.capture);

  const clearDrag = useCallback(() => {
    const current = drag.current;
    drag.current = null;
    landing.current?.removeAttribute('data-drop-target');
    landing.current = null;
    if (!current) return;
    current.element.removeAttribute('data-dragging');
    current.element.style.removeProperty('--drag-x');
    current.element.style.removeProperty('--drag-y');
    if (current.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
  }, []);

  useEffect(() => {
    window.addEventListener('blur', clearDrag);
    window.addEventListener('resize', clearDrag);
    return () => { clearDrag(); window.removeEventListener('blur', clearDrag); window.removeEventListener('resize', clearDrag); };
  }, [clearDrag, enabled, state.ply]);

  function startDrag(event: PointerEvent<HTMLButtonElement>, from: number) {
    if (!event.isPrimary) return;
    suppressClick.current = false;
    if (event.button !== 0 || drag.current || !board.current || !actions.some((a) => a.type === 'move' && a.from === from)) return;
    drag.current = { from, ply: state.ply, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false, element: event.currentTarget, bounds: board.current.getBoundingClientRect() };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!enabled || state.ply !== current.ply) { clearDrag(); return; }
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.active && Math.hypot(dx, dy) < 6) return;
    event.preventDefault();
    if (!current.active) {
      current.active = true;
      suppressClick.current = true;
      current.element.setAttribute('data-dragging', 'true');
      setSelection({ point: current.from, ply: current.ply });
    }
    // Pointer movement updates only a transform; no React render per frame.
    current.element.style.setProperty('--drag-x', `${dx}px`);
    current.element.style.setProperty('--drag-y', `${dy}px`);
    const to = dropPoint(event.clientX, event.clientY, current.bounds);
    const valid = actions.some((a) => a.type === 'move' && a.from === current.from && a.to === to);
    const target = valid ? board.current?.querySelector<HTMLElement>(`[data-point="${to}"]`) ?? null : null;
    if (landing.current !== target) {
      landing.current?.removeAttribute('data-drop-target');
      landing.current = target;
      target?.setAttribute('data-drop-target', 'true');
    }
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const to = dropPoint(event.clientX, event.clientY, current.bounds);
    clearDrag();
    if (!current.active || !enabled || state.ply !== current.ply) return;
    const action = actions.find((a) => a.type === 'move' && a.from === current.from && a.to === to);
    if (action) { setSelection(null); onMove(action); }
  }

  function choose(point: number) {
    const action = actions.find((a) => a.type === 'capture' ? a.at === point : a.type === 'place' ? a.to === point : a.from === selected && a.to === point);
    if (action) { setSelection(null); onMove(action); return; }
    if (actions.some((a) => a.type === 'move' && a.from === point)) setSelection(selected === point ? null : { point, ply: state.ply });
  }

  return <div className="board-frame">
    <div className="board-coordinate top">a <span>d</span> g</div>
    <div ref={board} className="board" role="group" aria-label={`Qattaar board. ${state.capture ? 'Choose an opposing piece to capture.' : phase(state) === 'placing' ? 'Choose an empty point to place a piece.' : phase(state) === 'flying' ? 'Fly to any empty point.' : 'Move to an adjacent point.'} Move by dragging, or select a piece and its destination. Keyboard: Tab and Enter.`}>
      <svg className="board-lines" viewBox="0 0 600 600" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M48 48H552V552H48ZM132 132H468V468H132ZM216 216H384V384H216Z" />
          <path d="M300 48V216M300 384V552M48 300H216M384 300H552" />
        </g>
        {mills.map((mill) => <line key={mill[0]} x1={48 + POINTS[mill[0]][0] * 84} y1={48 + POINTS[mill[0]][1] * 84} x2={48 + POINTS[mill[2]][0] * 84} y2={48 + POINTS[mill[2]][1] * 84} className="mill-line" />)}
      </svg>
      {lastTurn && <MoveTrail move={lastTurn} />}
      <div className="board-center" aria-hidden="true"><span>Q</span><small>QATTAAR</small></div>
      {POINTS.map((_, point) => {
        const position = pointPosition(point);
        const cell = state.board[point];
        const canSelect = actions.some((a) => a.type === 'move' && a.from === point);
        const legal = destinations.includes(point);
        return <button
          key={point} data-point={point} className={`point ${cell ? `stone ${cell === 1 ? 'ivory' : 'onyx'}` : 'empty'} ${canSelect ? 'draggable' : ''} ${selected === point ? 'selected' : ''} ${legal ? 'legal' : ''} ${state.capture && legal ? 'capturable' : ''}`}
          style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
          aria-label={`${pointName(point)}: ${cell === 1 ? 'White piece' : cell === 2 ? 'Black piece' : 'empty'}${legal ? state.capture ? ', capture' : ', available destination' : ''}${lastTurn?.turn.action.to === point ? ', last move destination' : lastTurn?.turn.action.type === 'move' && lastTurn.turn.action.from === point ? ', last move origin' : ''}`}
          aria-pressed={selected === point} aria-disabled={!enabled || (!legal && !canSelect)}
          tabIndex={state.winner ? -1 : 0}
          onPointerDown={(event) => startDrag(event, point)} onPointerMove={moveDrag} onPointerUp={finishDrag}
          onPointerCancel={clearDrag} onLostPointerCapture={clearDrag}
          onKeyDown={(event) => { if (event.key === 'Escape') { clearDrag(); setSelection(null); } }}
          onDragStart={(event) => event.preventDefault()}
          onClick={(event) => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; } suppressClick.current = false; if (enabled) choose(point); }}
        ><span className="point-surface">{cell === 2 && <span className="onyx-mark" aria-hidden="true" />}</span></button>;
      })}
      {captureFeedback && <div key={captureFeedback.ply} className={`point stone capture-ghost ${captureFeedback.player === 1 ? 'ivory' : 'onyx'}`} style={{ left: `${pointPosition(captureFeedback.at).x * 100}%`, top: `${pointPosition(captureFeedback.at).y * 100}%` }} aria-hidden="true"><span className="point-surface"><span className="capture-cross">×</span></span><span className="capture-badge">−1</span></div>}
      {children}
    </div>
    <div className="board-coordinate bottom"><span>7</span><span>4</span><span>1</span></div>
  </div>;
}
