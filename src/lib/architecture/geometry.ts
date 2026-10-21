import { isValidPolygon } from "@/lib/constraints/geometry";
import type { DrawingPrimitive, Point2D } from "@/lib/geometry/types";
import type { AutomaticRouteRestriction } from "@/lib/routing/types";

export type ArchitecturalGeometry =
  | {
      kind: "polygon";
      polygon: Point2D[];
    }
  | {
      from: Point2D;
      kind: "segment";
      to: Point2D;
    };

export function drawingPrimitiveSegments(entity: DrawingPrimitive) {
  if (entity.kind === "line") {
    return validSegment(entity.start, entity.end)
      ? [{ from: entity.start, to: entity.end }]
      : [];
  }

  if (entity.kind === "polyline") {
    return polygonalSegments(entity.points, entity.closed);
  }

  if (entity.kind === "hatch") {
    return entity.rings.flatMap((ring) => polygonalSegments(ring, true));
  }

  return polygonalSegments(sampleDrawingArc(entity), false);
}

export function drawingPrimitiveRouteGeometries(
  entity: DrawingPrimitive,
): ArchitecturalGeometry[] {
  const geometries: ArchitecturalGeometry[] = [];

  if (entity.kind === "hatch" && isValidPolygon(entity.outerRing)) {
    geometries.push({ kind: "polygon", polygon: entity.outerRing });
  }

  if (
    entity.kind === "polyline" &&
    entity.closed &&
    isValidPolygon(entity.points)
  ) {
    geometries.push({ kind: "polygon", polygon: entity.points });
  }

  geometries.push(
    ...drawingPrimitiveSegments(entity).map((segment) => ({
      ...segment,
      kind: "segment" as const,
    })),
  );

  return geometries;
}

export function drawingPrimitiveHardRestrictions(
  entity: DrawingPrimitive,
  minSegmentLengthSource = Number.EPSILON,
): AutomaticRouteRestriction[] {
  if (entity.kind === "line") {
    return validSegment(entity.start, entity.end, minSegmentLengthSource)
      ? [
          {
            from: entity.start,
            id: `hard-structure:${entity.id}:line`,
            kind: "segment",
            to: entity.end,
          },
        ]
      : [];
  }

  if (entity.kind === "hatch") {
    return isValidPolygon(entity.outerRing)
      ? [
          {
            id: `hard-structure:${entity.id}:hatch`,
            kind: "polygon",
            polygon: entity.outerRing,
          },
        ]
      : [];
  }

  const restrictions: AutomaticRouteRestriction[] = [];

  if (
    entity.kind === "polyline" &&
    entity.closed &&
    isValidPolygon(entity.points)
  ) {
    restrictions.push({
      id: `hard-structure:${entity.id}:polygon`,
      kind: "polygon",
      polygon: entity.points,
    });
  }

  const segmentLabel = entity.kind === "arc" ? "arc" : "segment";
  restrictions.push(
    ...drawingPrimitiveSegments(entity)
      .filter((segment) =>
        validSegment(segment.from, segment.to, minSegmentLengthSource),
      )
      .map(
        (segment, index): AutomaticRouteRestriction => ({
          from: segment.from,
          id: `hard-structure:${entity.id}:${segmentLabel}:${index}`,
          kind: "segment",
          to: segment.to,
        }),
      ),
  );

  return restrictions;
}

export function sampleDrawingArc(
  entity: Extract<DrawingPrimitive, { kind: "arc" }>,
) {
  const sweep = normalizeArcSweep(entity.startAngle, entity.endAngle);
  const segmentCount = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
  const points: Point2D[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const angle = entity.startAngle + (sweep * index) / segmentCount;
    points.push({
      x: entity.center.x + Math.cos(angle) * entity.radius,
      y: entity.center.y + Math.sin(angle) * entity.radius,
    });
  }

  return points;
}

function polygonalSegments(points: Point2D[], closed: boolean) {
  const count = closed ? points.length : points.length - 1;
  const segments: Array<{ from: Point2D; to: Point2D }> = [];

  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];

    if (from && to && validSegment(from, to)) {
      segments.push({ from, to });
    }
  }

  return segments;
}

function normalizeArcSweep(startAngle: number, endAngle: number) {
  let sweep = endAngle - startAngle;

  while (sweep <= 0) {
    sweep += Math.PI * 2;
  }

  return sweep;
}

function validSegment(
  from: Point2D,
  to: Point2D,
  minLength = Number.EPSILON,
) {
  return Math.hypot(to.x - from.x, to.y - from.y) > minLength;
}
