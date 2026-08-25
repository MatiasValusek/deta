import type { Point2D } from "@/lib/geometry/types";
import { pointInPolygon } from "@/lib/constraints/geometry";

const EPSILON = 0.000001;

export function projectPointToSegment(
  point: Point2D,
  start: Point2D,
  end: Point2D,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= EPSILON) {
    return {
      point: start,
      t: 0,
      distance: Math.hypot(point.x - start.x, point.y - start.y),
    };
  }

  const rawT =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projection = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };

  return {
    point: projection,
    t,
    distance: Math.hypot(point.x - projection.x, point.y - projection.y),
  };
}

export function pointAlmostEqual(
  first: Point2D,
  second: Point2D,
  tolerance = EPSILON,
) {
  return Math.hypot(first.x - second.x, first.y - second.y) <= tolerance;
}

export function segmentIntersectsPolygon(
  start: Point2D,
  end: Point2D,
  polygon: Point2D[],
) {
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon)) {
    return true;
  }

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];

    if (segmentsIntersect(start, end, current, next)) {
      return true;
    }
  }

  return false;
}

export function segmentsIntersect(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D,
) {
  const o1 = orientation(firstStart, firstEnd, secondStart);
  const o2 = orientation(firstStart, firstEnd, secondEnd);
  const o3 = orientation(secondStart, secondEnd, firstStart);
  const o4 = orientation(secondStart, secondEnd, firstEnd);

  if (Math.abs(o1) <= EPSILON && pointOnSegment(secondStart, firstStart, firstEnd)) {
    return true;
  }

  if (Math.abs(o2) <= EPSILON && pointOnSegment(secondEnd, firstStart, firstEnd)) {
    return true;
  }

  if (Math.abs(o3) <= EPSILON && pointOnSegment(firstStart, secondStart, secondEnd)) {
    return true;
  }

  if (Math.abs(o4) <= EPSILON && pointOnSegment(firstEnd, secondStart, secondEnd)) {
    return true;
  }

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

export function pointOnSegment(
  point: Point2D,
  start: Point2D,
  end: Point2D,
) {
  return (
    Math.abs(orientation(start, end, point)) <= EPSILON &&
    point.x >= Math.min(start.x, end.x) - EPSILON &&
    point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.y >= Math.min(start.y, end.y) - EPSILON &&
    point.y <= Math.max(start.y, end.y) + EPSILON
  );
}

function orientation(a: Point2D, b: Point2D, c: Point2D) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
