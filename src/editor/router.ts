import type { Point, PortDirection } from '../domain/types';

const isHorizontal = (direction: PortDirection) =>
  direction === 'left' || direction === 'right';

function stubOut(point: Point, direction: PortDirection, stub: number): Point {
  switch (direction) {
    case 'left':
      return { x: point.x - stub, y: point.y };
    case 'right':
      return { x: point.x + stub, y: point.y };
    case 'top':
      return { x: point.x, y: point.y - stub };
    case 'bottom':
      return { x: point.x, y: point.y + stub };
  }
}

function bends(
  first: Point,
  firstDirection: PortDirection,
  second: Point,
  secondDirection: PortDirection,
): Point[] {
  const firstHorizontal = isHorizontal(firstDirection);
  const secondHorizontal = isHorizontal(secondDirection);

  if (firstHorizontal && secondHorizontal) {
    if (Math.abs(first.y - second.y) < 0.5) return [];
    if (firstDirection !== secondDirection) {
      const forward =
        firstDirection === 'right' ? second.x >= first.x : second.x <= first.x;
      if (forward) {
        const middleX = (first.x + second.x) / 2;
        return [
          { x: middleX, y: first.y },
          { x: middleX, y: second.y },
        ];
      }
      const middleY = (first.y + second.y) / 2;
      return [
        { x: first.x, y: middleY },
        { x: second.x, y: middleY },
      ];
    }
    const outsideX =
      firstDirection === 'right' ? Math.max(first.x, second.x) : Math.min(first.x, second.x);
    return [
      { x: outsideX, y: first.y },
      { x: outsideX, y: second.y },
    ];
  }

  if (!firstHorizontal && !secondHorizontal) {
    if (Math.abs(first.x - second.x) < 0.5) return [];
    if (firstDirection !== secondDirection) {
      const forward =
        firstDirection === 'bottom' ? second.y >= first.y : second.y <= first.y;
      if (forward) {
        const middleY = (first.y + second.y) / 2;
        return [
          { x: first.x, y: middleY },
          { x: second.x, y: middleY },
        ];
      }
      const middleX = (first.x + second.x) / 2;
      return [
        { x: middleX, y: first.y },
        { x: middleX, y: second.y },
      ];
    }
    const outsideY =
      firstDirection === 'bottom' ? Math.max(first.y, second.y) : Math.min(first.y, second.y);
    return [
      { x: first.x, y: outsideY },
      { x: second.x, y: outsideY },
    ];
  }

  return firstHorizontal
    ? [{ x: second.x, y: first.y }]
    : [{ x: first.x, y: second.y }];
}

function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (
      previous &&
      Math.abs(previous.x - point.x) < 0.5 &&
      Math.abs(previous.y - point.y) < 0.5
    ) {
      continue;
    }
    result.push(point);
    while (result.length >= 3) {
      const [first, middle, last] = result.slice(-3);
      const collinear =
        (Math.abs(first.x - middle.x) < 0.5 && Math.abs(middle.x - last.x) < 0.5) ||
        (Math.abs(first.y - middle.y) < 0.5 && Math.abs(middle.y - last.y) < 0.5);
      if (!collinear) break;
      result.splice(result.length - 2, 1);
    }
  }
  return result;
}

export function routeOrthogonal(
  source: { point: Point; direction: PortDirection },
  target: { point: Point; direction: PortDirection },
  stub = 24,
): Point[] {
  const first = stubOut(source.point, source.direction, stub);
  const second = stubOut(target.point, target.direction, stub);
  return simplify([
    source.point,
    first,
    ...bends(first, source.direction, second, target.direction),
    second,
    target.point,
  ]);
}

export function pointsToPath(points: Point[], radius = 10): string {
  if (points.length === 0) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incomingLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoingLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const cornerRadius = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    if (cornerRadius < 1) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const incomingX = corner.x - ((corner.x - previous.x) / incomingLength) * cornerRadius;
    const incomingY = corner.y - ((corner.y - previous.y) / incomingLength) * cornerRadius;
    const outgoingX = corner.x + ((next.x - corner.x) / outgoingLength) * cornerRadius;
    const outgoingY = corner.y + ((next.y - corner.y) / outgoingLength) * cornerRadius;
    path += ` L ${incomingX} ${incomingY} Q ${corner.x} ${corner.y} ${outgoingX} ${outgoingY}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

export function pathMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
    length: Math.hypot(point.x - points[index].x, point.y - points[index].y),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = total / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length === 0 ? 0 : remaining / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
      };
    }
    remaining -= segment.length;
  }
  return points[points.length - 1];
}
