export const POINTS = [
  [0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1],
  [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3],
  [4, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4],
  [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6],
] as const;

export const MILLS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11],
  [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7],
  [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
] as const;

export const NEIGHBORS: readonly number[][] = POINTS.map((_, point) =>
  [...new Set(MILLS.flatMap((mill) => {
    const index = (mill as readonly number[]).indexOf(point);
    return index === -1 ? [] : [mill[index - 1], mill[index + 1]].filter((n) => n !== undefined);
  }))],
);

export function pointName(point: number): string {
  const [x, y] = POINTS[point];
  return `${'abcdefg'[x]}${7 - y}`;
}
