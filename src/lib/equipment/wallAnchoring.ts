import type { ManualConstraint } from "@/lib/constraints/types";
import { drawingPrimitiveSegments } from "@/lib/architecture/geometry";
import { classifyArchitecturalNames } from "@/lib/architecture/semantics";
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
  confidence: number;
  directOnly: boolean;
  from: Point2D;
  id: string;
  kind: EquipmentWallReferenceKind;
  lengthSource: number;
  pageNumber: number | null;
  source: "dxf" | "pdf";
  to: Point2D;
};

export const APPLIANCE_WALL_OFFSET_METERS = 0;
export const DEFAULT_WALL_SNAP_TOLERANCE_SOURCE = 0.35;
const DEFAULT_WALL_SNAP_RADIUS_METERS = 0.5;
const DIRECT_WALL_CLICK_RADIUS_METERS = 0.08;
const MIN_WALL_SEGMENT_LENGTH_METERS = 0.3;

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

  const [placement] = resolveEquipmentPhysicalPlacementAlternatives(params);

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
  const tolerance = wallSnapToleranceSource({
    requestedToleranceSource: params.snapToleranceSource,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit ?? null,
  });
  const directClickTolerance = sourceDistanceFromMeters({
    fallbackSource: Math.min(tolerance, DEFAULT_WALL_SNAP_TOLERANCE_SOURCE),
    meters: DIRECT_WALL_CLICK_RADIUS_METERS,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit ?? null,
  });
  const minSegmentLength = sourceDistanceFromMeters({
    fallbackSource: MIN_WALL_SEGMENT_LENGTH_METERS,
    meters: MIN_WALL_SEGMENT_LENGTH_METERS,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit ?? null,
  });

  return findNearestEquipmentWalls({
    classificationIndex: params.classificationIndex ?? {},
    constraints: params.constraints ?? [],
    directClickTolerance,
    drawing: params.drawing ?? null,
    minSegmentLength,
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
  directClickTolerance: number;
  drawing: NormalizedDrawing | null;
  minSegmentLength: number;
  pageNumber: number | null;
  point: Point2D;
  source: "dxf" | "pdf";
  tolerance: number;
}): EquipmentWallHit[] {
  const hits = wallSegments({
    classificationIndex: params.classificationIndex,
    constraints: params.constraints,
    drawing: params.drawing,
    minSegmentLength: params.minSegmentLength,
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
    .filter((hit) => {
      const tolerance = hit.segment.directOnly
        ? params.directClickTolerance
        : params.tolerance;

      return hit.distance <= tolerance;
    })
    .sort(
      (first, second) =>
        compareWallHits(first, second, {
          directClickTolerance: params.directClickTolerance,
          tolerance: params.tolerance,
        }),
    );
  const [best] = hits;

  if (!best) {
    return [];
  }

  const similar = hits.find(
    (hit) => hit !== best && wallHitIsSimilar(best, hit, params),
  );

  return similar ? [best, similar] : [best];
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
  minSegmentLength: number;
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
      params.minSegmentLength,
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

  const visibleByLayer = new Map(
    drawing.layers.map((layer) => [layer.name, layer.visible]),
  );

  return drawing.entities.flatMap((entity) => {
    const classification = classificationIndex[entity.id]?.category;
    const visible = visibleByLayer.get(entity.layer) ?? true;

    if (!visible) {
      return [];
    }

    const detection = detectWallEntity(entity, classification);

    if (!detection) {
      return [];
    }

    return drawingPrimitiveSegments(entity).flatMap((segment, index) => {
      const lengthSource = distanceBetween(segment.from, segment.to);

      if (lengthSource <= Number.EPSILON) {
        return [];
      }

      return [
        {
          confidence: detection.confidence,
          directOnly: detection.directOnly,
          from: segment.from,
          id: `${entity.id}:wall:${index}`,
          kind: detection.kind,
          lengthSource,
          pageNumber: null,
          source,
          to: segment.to,
        },
      ];
    });
  });
}

function constraintWallSegments(
  constraints: ManualConstraint[],
  minSegmentLength: number,
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
      polygonSegments(constraint.polygon).flatMap((segment, index) => {
        const lengthSource = distanceBetween(segment.from, segment.to);

        if (lengthSource < minSegmentLength) {
          return [];
        }

        return [
          {
            confidence: 4,
            directOnly: false,
            from: segment.from,
            id: `${constraint.id}:wall:${index}`,
            kind: "manual_constraint" as const,
            lengthSource,
            pageNumber: constraint.pageNumber,
            source: constraint.source,
            to: segment.to,
          },
        ];
      }),
    );
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

function wallSnapToleranceSource(params: {
  requestedToleranceSource?: number;
  scaleMetersPerSourceUnit: number | null;
}) {
  if (
    params.requestedToleranceSource !== undefined &&
    Number.isFinite(params.requestedToleranceSource)
  ) {
    return params.requestedToleranceSource;
  }

  return sourceDistanceFromMeters({
    fallbackSource: DEFAULT_WALL_SNAP_TOLERANCE_SOURCE,
    meters: DEFAULT_WALL_SNAP_RADIUS_METERS,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
  });
}

function sourceDistanceFromMeters(params: {
  fallbackSource: number;
  meters: number;
  scaleMetersPerSourceUnit: number | null;
}) {
  return params.scaleMetersPerSourceUnit && params.scaleMetersPerSourceUnit > 0
    ? params.meters / params.scaleMetersPerSourceUnit
    : params.fallbackSource;
}

function compareWallHits(
  first: EquipmentWallHit,
  second: EquipmentWallHit,
  params: {
    directClickTolerance: number;
    tolerance: number;
  },
) {
  const distanceWindow = Math.max(
    params.directClickTolerance,
    params.tolerance * 0.08,
  );
  const distanceDelta = first.distance - second.distance;

  if (Math.abs(distanceDelta) > distanceWindow) {
    return distanceDelta;
  }

  if (first.segment.directOnly !== second.segment.directOnly) {
    return first.segment.directOnly ? 1 : -1;
  }

  const confidenceDelta = second.segment.confidence - first.segment.confidence;

  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  const lengthDelta = second.segment.lengthSource - first.segment.lengthSource;
  const lengthWindow =
    Math.max(first.segment.lengthSource, second.segment.lengthSource, 1) * 0.1;

  if (Math.abs(lengthDelta) > lengthWindow) {
    return lengthDelta;
  }

  const orientationDelta =
    wallOrientationPenalty(first.segment) -
    wallOrientationPenalty(second.segment);

  if (Math.abs(orientationDelta) > Number.EPSILON) {
    return orientationDelta;
  }

  return first.segment.id.localeCompare(second.segment.id);
}

function wallHitIsSimilar(
  best: EquipmentWallHit,
  candidate: EquipmentWallHit,
  params: {
    directClickTolerance: number;
    tolerance: number;
  },
) {
  if (best.segment.directOnly || candidate.segment.directOnly) {
    return false;
  }

  const distanceWindow = Math.max(
    params.directClickTolerance,
    params.tolerance * 0.18,
  );
  const lengthRatio =
    Math.min(best.segment.lengthSource, candidate.segment.lengthSource) /
    Math.max(best.segment.lengthSource, candidate.segment.lengthSource, 1);

  return (
    Math.abs(candidate.distance - best.distance) <= distanceWindow &&
    lengthRatio >= 0.35
  );
}

function detectWallEntity(
  entity: DrawingPrimitive,
  category: ClassificationIndex[string]["category"] | undefined,
): Pick<WallSegment, "confidence" | "directOnly" | "kind"> | null {
  const classifiedKind = wallKindFromClassification(category);

  if (classifiedKind) {
    return {
      confidence: 4,
      directOnly: false,
      kind: classifiedKind,
    };
  }

  const semanticMatch = classifyArchitecturalNames(entitySearchNames(entity));

  if (category === "opening" || semanticMatch?.category === "opening") {
    return null;
  }

  const inferredKind =
    semanticMatch?.category === "hard_structure" ||
    semanticMatch?.category === "reference_wall"
      ? semanticMatch.category
      : null;

  if (inferredKind) {
    return {
      confidence: 3,
      directOnly: false,
      kind: inferredKind,
    };
  }

  return {
    confidence: 1,
    directOnly: true,
    kind: "reference_wall",
  };
}

function wallOrientationPenalty(segment: WallSegment) {
  const orientation = Math.abs(
    normalizeAngleRadians(wallOrientation(segment.from, segment.to)),
  );
  const quarterTurn = Math.PI / 2;
  const offsetFromAxis = Math.min(
    orientation % quarterTurn,
    quarterTurn - (orientation % quarterTurn),
  );

  return offsetFromAxis / (Math.PI / 4);
}

function normalizeAngleRadians(angle: number) {
  let normalized = angle % Math.PI;

  if (normalized < 0) {
    normalized += Math.PI;
  }

  return normalized;
}

function wallKindFromClassification(
  category: ClassificationIndex[string]["category"] | undefined,
): EquipmentWallReferenceKind | null {
  return category === "hard_structure" || category === "reference_wall"
    ? category
    : null;
}

function entitySearchNames(entity: DrawingPrimitive) {
  return [
    entity.layer,
    entity.visual.originalLayer,
    entity.visual.resolvedLayer,
    entity.visual.blockName,
    entity.visual.sourceEntityType,
    entity.sourceType,
  ].filter((value): value is string => Boolean(value));
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
