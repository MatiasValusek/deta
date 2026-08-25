import type {
  ArcPrimitive,
  Bounds,
  DrawingPrimitive,
  Point2D,
} from "./types";

export function createEmptyBounds(): Bounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

export function isValidBounds(bounds: Bounds): boolean {
  return (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY) &&
    bounds.maxX >= bounds.minX &&
    bounds.maxY >= bounds.minY
  );
}

export function addPointToBounds(bounds: Bounds, point: Point2D): Bounds {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return bounds;
  }

  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

export function addEntityToBounds(
  bounds: Bounds,
  entity: DrawingPrimitive,
): Bounds {
  if (entity.kind === "line") {
    return addPointToBounds(addPointToBounds(bounds, entity.start), entity.end);
  }

  if (entity.kind === "polyline") {
    return entity.points.reduce(addPointToBounds, bounds);
  }

  if (entity.kind === "hatch") {
    return entity.rings.flat().reduce(addPointToBounds, bounds);
  }

  return addArcToBounds(bounds, entity);
}

export function boundsFromEntities(entities: DrawingPrimitive[]): Bounds | null {
  const bounds = entities.reduce(addEntityToBounds, createEmptyBounds());
  return isValidBounds(bounds) ? bounds : null;
}

export function boundsWidth(bounds: Bounds): number {
  return Math.max(bounds.maxX - bounds.minX, 0);
}

export function boundsHeight(bounds: Bounds): number {
  return Math.max(bounds.maxY - bounds.minY, 0);
}

function addArcToBounds(bounds: Bounds, arc: ArcPrimitive): Bounds {
  let next = bounds;
  const start = pointOnArc(arc, arc.startAngle);
  const end = pointOnArc(arc, arc.endAngle);

  next = addPointToBounds(next, start);
  next = addPointToBounds(next, end);

  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    if (angleIsOnArc(angle, arc.startAngle, arc.endAngle)) {
      next = addPointToBounds(next, pointOnArc(arc, angle));
    }
  }

  return next;
}

function pointOnArc(arc: ArcPrimitive, angle: number): Point2D {
  return {
    x: arc.center.x + Math.cos(angle) * arc.radius,
    y: arc.center.y + Math.sin(angle) * arc.radius,
  };
}

function angleIsOnArc(angle: number, startAngle: number, endAngle: number) {
  const start = normalizeAngle(startAngle);
  const end = normalizeAngle(endAngle);
  const target = normalizeAngle(angle);
  const sweep = normalizePositive(end - start);
  const targetSweep = normalizePositive(target - start);

  return targetSweep <= sweep;
}

export function normalizeAngle(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

export function normalizePositive(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}
