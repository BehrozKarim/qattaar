import { POINTS } from '../game/board';

export interface BoardBounds { left: number; top: number; width: number; height: number }

export function pointPosition(point: number) {
  const [x, y] = POINTS[point];
  return { x: 0.08 + x * 0.14, y: 0.08 + y * 0.14 };
}

/** Snap to the closest physical point first. Legality is checked by the rules engine. */
export function dropPoint(clientX: number, clientY: number, bounds: BoardBounds): number | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const x = (clientX - bounds.left) / bounds.width;
  const y = (clientY - bounds.top) / bounds.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  let nearest: number | null = null;
  let distance = 0.065;
  POINTS.forEach((_, point) => {
    const position = pointPosition(point);
    const candidate = Math.hypot(position.x - x, position.y - y);
    if (candidate < distance) { nearest = point; distance = candidate; }
  });
  return nearest;
}
