import type { ClassificationIndex } from "@/lib/semantic/types";
import type { Point2D } from "@/lib/geometry/types";
import type {
  ConstraintHit,
  ConstraintSource,
  ConstraintSummary,
  ConstraintVertexHit,
  ManualConstraint,
  PolygonBounds,
  StructuralConstraintIndex,
} from "./types";

export function buildStructuralConstraintIndex(
  classificationIndex: ClassificationIndex,
): StructuralConstraintIndex {
  const entityIds = Object.entries(classificationIndex)
    .filter(([, classification]) => classification.category === "hard_structure")
    .map(([entityId]) => entityId)
    .sort();

  return {
    entityIds,
    byEntityId: Object.fromEntries(
      entityIds.map((entityId) => [entityId, true] as const),
    ),
  };
}

export function createRectanglePolygon(
  start: Point2D,
  end: Point2D,
): Point2D[] {
  return [
    { x: start.x, y: start.y },
    { x: end.x, y: start.y },
    { x: end.x, y: end.y },
    { x: start.x, y: end.y },
  ];
}

export function isValidPolygon(points: Point2D[]): boolean {
  return points.length >= 3 && Math.abs(polygonArea(points)) > 0.000001;
}

export function translateConstraint(
  constraint: ManualConstraint,
  delta: Point2D,
): ManualConstraint {
  return {
    ...constraint,
    polygon: constraint.polygon.map((point) => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    })),
  };
}

export function moveConstraintVertex(
  constraint: ManualConstraint,
  vertexIndex: number,
  point: Point2D,
): ManualConstraint {
  if (!constraint.polygon[vertexIndex]) {
    return constraint;
  }

  return {
    ...constraint,
    polygon: constraint.polygon.map((current, index) =>
      index === vertexIndex ? point : current,
    ),
  };
}

export function polygonBounds(points: Point2D[]): PolygonBounds | null {
  if (points.length === 0) {
    return null;
  }

  const initial: PolygonBounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const bounds = points.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      minY: Math.min(current.minY, point.y),
      maxX: Math.max(current.maxX, point.x),
      maxY: Math.max(current.maxY, point.y),
    }),
    initial,
  );

  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    return null;
  }

  return bounds;
}

export function findConstraintAtPoint(
  point: Point2D,
  constraints: ManualConstraint[],
): ConstraintHit | null {
  for (const constraint of [...constraints].reverse()) {
    if (pointInPolygon(point, constraint.polygon)) {
      return { constraintId: constraint.id };
    }
  }

  return null;
}

export function findNearestConstraintVertex(
  point: Point2D,
  constraints: ManualConstraint[],
  tolerance: number,
): ConstraintVertexHit | null {
  let nearest: ConstraintVertexHit | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const constraint of constraints) {
    for (const [vertexIndex, vertex] of constraint.polygon.entries()) {
      const distance = distanceBetween(point, vertex);

      if (distance <= tolerance && distance < nearestDistance) {
        nearest = {
          constraintId: constraint.id,
          vertexIndex,
        };
        nearestDistance = distance;
      }
    }
  }

  return nearest;
}

export function constraintBelongsToSource(
  constraint: ManualConstraint,
  source: ConstraintSource,
  pageNumber: number | null,
): boolean {
  return (
    constraint.source === source &&
    (source === "dxf" || constraint.pageNumber === pageNumber)
  );
}

export function summarizeConstraints(params: {
  constraints: ManualConstraint[];
  structuralIndex: StructuralConstraintIndex;
}): ConstraintSummary {
  const activeManual = params.constraints.filter((constraint) => constraint.active);

  return {
    structuralPrimitiveCount: params.structuralIndex.entityIds.length,
    manualObstacleCount: params.constraints.filter(
      (constraint) => constraint.type === "hard_obstacle",
    ).length,
    avoidZoneCount: params.constraints.filter(
      (constraint) => constraint.type === "avoid_zone",
    ).length,
    activeRestrictionCount:
      params.structuralIndex.entityIds.length + activeManual.length,
  };
}

export function polygonArea(points: Point2D[]): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

export function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  if (!isValidPolygon(polygon)) {
    return false;
  }

  let inside = false;

  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (crosses) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceBetween(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
