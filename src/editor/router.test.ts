import { describe, expect, test } from 'bun:test';
import { pathMidpoint, pointsToPath, routeOrthogonal } from './router';

const orthogonal = (points: { x: number; y: number }[]) =>
  points.slice(1).every((point, index) => {
    const previous = points[index];
    return point.x === previous.x || point.y === previous.y;
  });

describe('orthogonal SVG router', () => {
  test('keeps endpoints and every segment axis aligned', () => {
    const points = routeOrthogonal(
      { point: { x: 0, y: 20 }, direction: 'right' },
      { point: { x: 240, y: 140 }, direction: 'left' },
    );
    expect(points[0]).toEqual({ x: 0, y: 20 });
    expect(points.at(-1)).toEqual({ x: 240, y: 140 });
    expect(orthogonal(points)).toBe(true);
  });

  test('creates a rounded SVG path', () => {
    const path = pointsToPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
    ]);
    expect(path).toContain('Q 100 0');
    expect(path).toMatch(/^M /);
  });

  test('finds geometric midpoint along the route', () => {
    expect(
      pathMidpoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ]),
    ).toEqual({ x: 100, y: 0 });
  });
});
