import type { ManualConstraint } from "@/lib/constraints/types";
import type {
  DrawingPrimitive,
  NormalizedDrawing,
  Point2D,
} from "@/lib/geometry/types";
import { projectPointToSegment } from "@/lib/routing/geometry";
import type { ClassificationIndex } from "@/lib/semantic/types";
import type {
  EquipmentRole,
  EquipmentWallAnchor,
  EquipmentWallReferenceKind,
  EquipmentWallPlacementAlternative,
} from "./types";

export type EquipmentPhysicalPlacement = {
  bodyPoint: Point2D;
  connectionPoint: Point2D;
  wallAnchor: EquipmentWallAnchor | null;
};

type EquipmentWallHit = {
  distance: number;
  point: Point2D;
  segment: WallSegment;
};

type WallSegment = {
  from: Point2D;
  id: string;
  kind: EquipmentWallReferenceKind;
  pageNumber: number | null;
  source: "dxf" | "pdf";
  to: Point2D;
};

export const APPLIANCE_WALL_OFFSET_METERS = 0;
export const DEFAULT_WALL_SNAP_TOLERANCE_SOURCE = 0.35;

export function resolveEquipmentPhysicalPlacement(params: {
  classificationIndex?: ClassificationIndex;
  constraints?: ManualConstraint[];
  drawing?: NormalizedDrawing | null;
  heightMeters: number;
  pageNumber?: number | null;
  point: Point2D;
  role: EquipmentRole;
  scaleMetersPerSourceUnit?: number | null;
  snapToleranceSource?: number;
  source: "dxf" | "pdf";
}): EquipmentPhysicalPlacement {
  const point = withZ(params.point, params.heightMeters);

  if (params.role !== "appliance") {
    return {
      bodyPoint: point,
      connectionPoint: point,
      wallAnchor: null,
    };
  }

  const tolerance =
    params.snapToleranceSource ?? DEFAULT_WALL_SNAP_TOLERANCE_SOURCE;
  const [placement] = resolveEquipmentPhysicalPlacementAlternatives({
    ...params,
    snapToleranceSource: tolerance,
  });

  if (!placement) {
    return {
      bodyPoint: point,
      connectionPoint: point,
      wallAnchor: pendingWallAnchor(params.source, params.pageNumber ?? null),
    };
  }

  return placement;
}

export function resolveEquipmentPhysicalPlacementAlternatives(params: {
  classificationIndex?: ClassificationIndex;
  constraints?: ManualConstraint[];
  drawing?: NormalizedDrawing | null;
  heightMeters: number;
  pageNumber?: number | null;
  point: Point2D;
  role: EquipmentRole;
  scaleMetersPerSourceUnit?: number | null;
  snapToleranceSource?: number;
  source: "dxf" | "pdf";
}): EquipmentWallPlacementAlternative[] {
  if (params.role !== "appliance") {
    return [];
  }

  const point = withZ(params.point, params.heightMeters);
  const tolerance =
    params.snapToleranceSource ?? DEFAULT_WALL_SNAP_TOLERANCE_SOURCE;

  return findNearestEquipmentWalls({
    classificationIndex: params.classificationIndex ?? {},
    constraints: params.constraints ?? [],
    drawing: params.drawing ?? null,
    pageNumber: params.pageNumber ?? null,
    point,
    source: params.source,
    tolerance,
  }).map((wall) => anchoredPlacementFromWall(wall, point, params.heightMeters));
}

export function withEquipmentWallAnchorZ(
  anchor: EquipmentWallAnchor | null | undefined,
  heightMeters: number,
): EquipmentWallAnchor | null {
  if (!anchor) {
    return null;
  }

  return {
    ...anchor,
    wallPoint: anchor.wallPoint ? withZ(anchor.wallPoint, heightMeters) : null,
  };
}

export function createPendingEquipmentWallAnchor(params: {
  pageNumber?: number | null;
  source: "dxf" | "pdf";
}): EquipmentWallAnchor {
  return pendingWallAnchor(params.source, params.pageNumber ?? null);
}

function findNearestEquipmentWalls(params: {
  classificationIndex: ClassificationIndex;
  constraints: ManualConstraint[];
  drawing: NormalizedDrawing | null;
  pageNumber: number | null;
  point: Point2D;
  source: "dxf" | "pdf";
  tolerance: number;
}): EquipmentWallHit[] {
  return wallSegments({
    classificationIndex: params.classificationIndex,
    constraints: params.constraints,
    drawing: params.drawing,
    pageNumber: params.pageNumber,
    source: params.source,
  })
    .map((segment) => {
      const projection = projectPointToSegment(
        params.point,
        segment.from,
        segment.to,
      );

      return {
        distance: projection.distance,
        point: projection.point,
        segment,
      };
    })
    .filter((hit) => hit.distance <= params.tolerance)
    .sort(
      (first, second) =>
        first.distance - second.distance ||
        first.segment.id.localeCompare(second.segment.id),
    );
}

function anchoredPlacementFromWall(
  wall: EquipmentWallHit,
  sourcePoint: Point2D,
  heightMeters: number,
): EquipmentWallPlacementAlternative {
  const connectionPoint = withZ(wall.point, heightMeters);
  const bodyPoint = connectionPoint;
  const normal = wallNormal(wall.segment.from, wall.segment.to, sourcePoint);

  return {
    bodyPoint,
    connectionPoint,
    wallAnchor: {
      distanceSource: wall.distance,
      normal,
      orientationRadians: wallOrientation(
        wall.segment.from,
        wall.segment.to,
      ),
      pageNumber: wall.segment.pageNumber,
      referenceId: wall.segment.id,
      referenceKind: wall.segment.kind,
      source: wall.segment.source,
      status: "anchored",
      wallPoint: connectionPoint,
    },
  };
}

function wallSegments(params: {
  classificationIndex: ClassificationIndex;
  constraints: ManualConstraint[];
  drawing: NormalizedDrawing | null;
  pageNumber: number | null;
  source: "dxf" | "pdf";
}): WallSegment[] {
  return [
    ...drawingWallSegments(
      params.drawing,
      params.classificationIndex,
      params.source,
    ),
    ...constraintWallSegments(
      params.constraints,
      params.source,
      params.pageNumber,
    ),
  ];
}

function drawingWallSegments(
  drawing: NormalizedDrawing | null,
  classificationIndex: ClassificationIndex,
  source: "dxf" | "pdf",
): WallSegment[] {
  if (!drawing) {
    return [];
  }

  return drawing.entities.flatMap((entity) => {
    const classification = classificationIndex[entity.id]?.category;

    if (
      classification !== "hard_structure" &&
      classification !== "reference_wall"
    ) {
      return [];
    }

    return primitiveSegments(entity).map((segment, index) => ({
      from: segment.from,
      id: `${entity.id}:wall:${index}`,
      kind: classification,
      pageNumber: null,
      source,
      to: segment.to,
    }));
  });
}

function constraintWallSegments(
  constraints: ManualConstraint[],
  source: "dxf" | "pdf",
  pageNumber: number | null,
): WallSegment[] {
  return constraints
    .filter(
      (constraint) =>
        constraint.active &&
        constraint.type === "hard_obstacle" &&
        constraint.source === source &&
        constraint.pageNumber === pageNumber,
    )
    .flatMap((constraint) =>
      polygonSegments(constraint.polygon).map((segment, index) => ({
        from: segment.from,
        id: `${constraint.id}:wall:${index}`,
        kind: "manual_constraint" as const,
        pageNumber: constraint.pageNumber,
        source: constraint.source,
        to: segment.to,
      })),
    );
}

function primitiveSegments(entity: DrawingPrimitive) {
  if (entity.kind === "line") {
    return [{ from: entity.start, to: entity.end }];
  }

  if (entity.kind === "polyline") {
    return polygonalSegments(entity.points, entity.closed);
  }

  if (entity.kind === "hatch") {
    return entity.rings.flatMap((ring) => polygonalSegments(ring, true));
  }

  return polygonalSegments(sampleArc(entity), false);
}

function polygonSegments(points: Point2D[]) {
  return polygonalSegments(points, true);
}

function polygonalSegments(points: Point2D[], closed: boolean) {
  const count = closed ? points.length : points.length - 1;
  const segments: Array<{ from: Point2D; to: Point2D }> = [];

  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];

    if (from && to && distanceBetween(from, to) > Number.EPSILON) {
      segments.push({ from, to });
    }
  }

  return segments;
}

function sampleArc(entity: Extract<DrawingPrimitive, { kind: "arc" }>) {
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

function normalizeArcSweep(startAngle: number, endAngle: number) {
  let sweep = endAngle - startAngle;

  while (sweep <= 0) {
    sweep += Math.PI * 2;
  }

  return sweep;
}

function wallNormal(from: Point2D, to: Point2D, point: Point2D): Point2D {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length <= Number.EPSILON) {
    return { x: 0, y: -1 };
  }

  const projection = projectPointToSegment(point, from, to).point;
  const first = { x: -dy / length, y: dx / length };
  const vectorToPoint = {
    x: point.x - projection.x,
    y: point.y - projection.y,
  };
  const dot = first.x * vectorToPoint.x + first.y * vectorToPoint.y;

  return dot >= 0 ? first : { x: -first.x, y: -first.y };
}

function wallOrientation(from: Point2D, to: Point2D) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function pendingWallAnchor(
  source: "dxf" | "pdf",
  pageNumber: number | null,
): EquipmentWallAnchor {
  return {
    distanceSource: null,
    normal: null,
    orientationRadians: null,
    pageNumber,
    referenceId: null,
    referenceKind: null,
    source,
    status: "pending",
    wallPoint: null,
  };
}

function withZ(point: Point2D, z: number): Point2D {
  return {
    x: point.x,
    y: point.y,
    z,
  };
}

function distanceBetween(first: Point2D, second: Point2D) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
