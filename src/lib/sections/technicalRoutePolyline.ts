import { DEFAULT_POINT_Z_METERS } from "@/lib/geometry/height";
import type { Point2D } from "@/lib/geometry/types";
import type { ResolvedRouteSegment } from "@/lib/routing/types";

export type TechnicalRoutePolylinePointSource =
  | "connection"
  | "node"
  | "vertex"
  | "vertical";

export type TechnicalRoutePolylineElevationStatus =
  | "explicit"
  | "inferred"
  | "pending";

export type TechnicalRoutePolylinePoint = {
  elevationMeters: number;
  elevationStatus: TechnicalRoutePolylineElevationStatus;
  planPoint: Point2D;
  segmentVertexIndex: number | null;
  source: TechnicalRoutePolylinePointSource;
  targetNodeId: string | null;
};

export type TechnicalRoutePolyline = {
  hasPendingElevation: boolean;
  pendingReason: string | null;
  points: TechnicalRoutePolylinePoint[];
};

export function createTechnicalRoutePolyline(
  segment: ResolvedRouteSegment,
): TechnicalRoutePolyline {
  const rawPath = createRawSegmentPath(segment);
  const first = rawPath[0];
  const last = rawPath[rawPath.length - 1];

  if (!first || !last) {
    return {
      hasPendingElevation: true,
      pendingReason: "Falta geometria fisica del tramo.",
      points: [],
    };
  }

  const fromElevation = explicitZMeters(first.point) ?? DEFAULT_POINT_Z_METERS;
  const toElevation = explicitZMeters(last.point) ?? DEFAULT_POINT_Z_METERS;
  const hasExplicitIntermediateElevation = rawPath
    .slice(1, -1)
    .some((point) => explicitZMeters(point.point) !== null);
  const hasPendingElevation =
    explicitZMeters(first.point) === null || explicitZMeters(last.point) === null;
  const points: TechnicalRoutePolylinePoint[] = [
    {
      elevationMeters: fromElevation,
      elevationStatus: pointElevationStatus(first.point, false),
      planPoint: first.point,
      segmentVertexIndex: null,
      source: "node",
      targetNodeId: segment.fromNodeId,
    },
  ];
  const terminalStatus = pointElevationStatus(last.point, false);

  if (
    !hasExplicitIntermediateElevation &&
    Math.abs(fromElevation - toElevation) > Number.EPSILON
  ) {
    points.push({
      elevationMeters: toElevation,
      elevationStatus: terminalStatus,
      planPoint: first.point,
      segmentVertexIndex: null,
      source: "vertical",
      targetNodeId: segment.toNodeId,
    });
  }

  let carriedElevation = hasExplicitIntermediateElevation
    ? fromElevation
    : toElevation;
  let carriedStatus: TechnicalRoutePolylineElevationStatus =
    hasExplicitIntermediateElevation
      ? pointElevationStatus(first.point, false)
      : terminalStatus;
  let previousPlanPoint = first.point;

  rawPath.slice(1, -1).forEach((rawPoint) => {
    const explicitElevation = explicitZMeters(rawPoint.point);
    const previousElevation = carriedElevation;
    let elevationStatus = pointElevationStatus(rawPoint.point, true);
    let source: TechnicalRoutePolylinePointSource = "vertex";
    let targetNodeId: string | null = null;

    if (explicitElevation !== null) {
      carriedElevation = explicitElevation;
      carriedStatus = "explicit";
      source =
        samePlanPoint(previousPlanPoint, rawPoint.point) &&
        Math.abs(carriedElevation - previousElevation) > Number.EPSILON
          ? "vertical"
          : "vertex";
      targetNodeId = null;
    } else if (!hasExplicitIntermediateElevation) {
      carriedElevation = toElevation;
      carriedStatus = terminalStatus === "pending" ? "pending" : "inferred";
      elevationStatus = carriedStatus;
      targetNodeId = segment.toNodeId;
    } else {
      elevationStatus = carriedStatus === "pending" ? "pending" : "inferred";
    }

    points.push({
      elevationMeters: carriedElevation,
      elevationStatus,
      planPoint: rawPoint.point,
      segmentVertexIndex: rawPoint.vertexIndex,
      source,
      targetNodeId,
    });
    previousPlanPoint = rawPoint.point;
  });

  points.push({
    elevationMeters: toElevation,
    elevationStatus: terminalStatus,
    planPoint: last.point,
    segmentVertexIndex: null,
    source: "connection",
    targetNodeId: segment.toNodeId,
  });

  return {
    hasPendingElevation,
    pendingReason: hasPendingElevation
      ? "Falta cota Z confirmada en un extremo del tramo."
      : null,
    points: dedupeTechnicalRoutePolylinePoints(points),
  };
}

function createRawSegmentPath(segment: ResolvedRouteSegment) {
  const path =
    segment.path.length >= 2
      ? segment.path
      : [
          segment.from,
          ...(segment.vertices ?? []).map((point) => ({ ...point })),
          segment.to,
        ];

  return path.map((point, index) => ({
    point,
    vertexIndex: index > 0 && index < path.length - 1 ? index - 1 : null,
  }));
}

function dedupeTechnicalRoutePolylinePoints(
  points: TechnicalRoutePolylinePoint[],
) {
  const deduped: TechnicalRoutePolylinePoint[] = [];

  for (const point of points) {
    const previous = deduped[deduped.length - 1];

    if (
      previous &&
      samePlanPoint(previous.planPoint, point.planPoint) &&
      Math.abs(previous.elevationMeters - point.elevationMeters) <=
        Number.EPSILON
    ) {
      if (point.source === "connection") {
        deduped[deduped.length - 1] = point;
      }

      continue;
    }

    deduped.push(point);
  }

  return deduped;
}

function pointElevationStatus(
  point: Point2D,
  defaultInferred: boolean,
): TechnicalRoutePolylineElevationStatus {
  return explicitZMeters(point) !== null
    ? "explicit"
    : defaultInferred
      ? "inferred"
      : "pending";
}

function explicitZMeters(point: Point2D) {
  return typeof point.z === "number" && Number.isFinite(point.z)
    ? point.z
    : null;
}

function samePlanPoint(first: Point2D, second: Point2D) {
  return (
    Math.abs(first.x - second.x) <= Number.EPSILON &&
    Math.abs(first.y - second.y) <= Number.EPSILON
  );
}
