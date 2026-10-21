import { describe, expect, it } from 'vitest';
import { dropPoint, pointPosition } from './boardGeometry';
import { POINTS } from '../game/board';

describe('board drop targeting', () => {
  it.each([280, 360, 640])('targets every point on a %ipx board with viewport offsets', (size) => {
    const bounds = { left: 17, top: 150, width: size, height: size };
    POINTS.forEach((_, point) => {
      const { x, y } = pointPosition(point);
      expect(dropPoint(bounds.left + x * size, bounds.top + y * size, bounds)).toBe(point);
    });
  });
  it('accepts a slightly imprecise fingertip drop', () => expect(dropPoint(33, 28, { left: 0, top: 0, width: 360, height: 360 })).toBe(0));
  it('does not snap a drop between distant points or outside the board', () => {
    const bounds = { left: 0, top: 0, width: 360, height: 360 };
    expect(dropPoint(180, 180, bounds)).toBeNull();
    expect(dropPoint(-1, 28, bounds)).toBeNull();
    expect(dropPoint(361, 28, bounds)).toBeNull();
    expect(dropPoint(0, 0, { ...bounds, width: 0 })).toBeNull();
  });
});
