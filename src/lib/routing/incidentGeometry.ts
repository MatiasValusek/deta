import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  resolveRouteNodePosition,
  resolveRouteSegmentPath,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  RouteNode,
  RouteSegment,
} from "@/lib/routing/types";

const INCIDENT_GEOMETRY_EPSILON_METERS = 0.000000001;

export type RouteDirectionVector = {
  x: number;
  y: number;
  z: number;
};

export type ResolvedIncidentRouteSegment = {
  adjacentPosition: Point2D;
  neighborNodeId: string;
  neighborPosition: Point2D;
  segment: RouteSegment;
  vector: RouteDirectionVector;
};

export type IncidentRouteGeometry = {
  incident: ResolvedIncidentRouteSegment[];
  topologicalSegmentCount: number;
  unresolvedSegmentIds: string[];
};

export function resolveIncidentRouteGeometry(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  network: ManualRouteNetwork;
  node: RouteNode;
  nodeById: Map<string, RouteNode>;
  position: Point2D;
  scaleMetersPerSourceUnit?: number | null;
}): IncidentRouteGeometry {
  const scaleMetersPerSourceUnit =
    params.scaleMetersPerSourceUnit && params.scaleMetersPerSourceUnit > 0
      ? params.scaleMetersPerSourceUnit
      : 1;
  const incidentSegments = params.network.segments.filter(
    (segment) =>
      segment.fromNodeId === params.node.id ||
      segment.toNodeId === params.node.id,
  );
  const unresolvedSegmentIds: string[] = [];
  const incident: ResolvedIncidentRouteSegment[] = [];

  for (const segment of incidentSegments) {
    const nodeIsFrom = segment.fromNodeId === params.node.id;
    const neighborNodeId = nodeIsFrom
      ? segment.toNodeId
      : segment.fromNodeId;
    const neighborNode = params.nodeById.get(neighborNodeId);
    const neighborPosition = neighborNode
      ? resolveRouteNodePosition(neighborNode, params.equipmentById) ??
        neighborNode.position ??
        null
      : null;

    if (!neighborNode || !neighborPosition) {
      unresolvedSegmentIds.push(segment.id);
      continue;
    }

    const path = resolveRouteSegmentPath(
      segment,
      nodeIsFrom ? params.position : neighborPosition,
      nodeIsFrom ? neighborPosition : params.position,
    );
    const orientedPath = nodeIsFrom ? path : [...path].reverse();
    const adjacentPosition = orientedPath
      .slice(1)
      .find(
        (point) =>
          physicalDistanceMeters(
            params.position,
            point,
            scaleMetersPerSourceUnit,
          ) > INCIDENT_GEOMETRY_EPSILON_METERS,
      );

    if (!adjacentPosition) {
      unresolvedSegmentIds.push(segment.id);
      continue;
    }

    incident.push({
      adjacentPosition,
      neighborNodeId,
      neighborPosition,
      segment,
      vector: routeDirectionVector(
        params.position,
        adjacentPosition,
        scaleMetersPerSourceUnit,
      ),
    });
  }

  return {
    incident: incident.sort((first, second) =>
      first.segment.id.localeCompare(second.segment.id),
    ),
    topologicalSegmentCount: incidentSegments.length,
    unresolvedSegmentIds: unresolvedSegmentIds.sort(),
  };
}

export function angleBetweenRouteDirections(
  first: RouteDirectionVector,
  second: RouteDirectionVector,
) {
  const firstLength = Math.hypot(first.x, first.y, first.z);
  const secondLength = Math.hypot(second.x, second.y, second.z);

  if (firstLength === 0 || secondLength === 0) {
    return null;
  }

  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (first.x * second.x +
        first.y * second.y +
        first.z * second.z) /
        (firstLength * secondLength),
    ),
  );

  return (Math.acos(cosine) * 180) / Math.PI;
}

function routeDirectionVector(
  from: Point2D,
  to: Point2D,
  scaleMetersPerSourceUnit: number,
): RouteDirectionVector {
  return {
    x: (to.x - from.x) * scaleMetersPerSourceUnit,
    y: (to.y - from.y) * scaleMetersPerSourceUnit,
    z: pointZ(to) - pointZ(from),
  };
}

function physicalDistanceMeters(
  first: Point2D,
  second: Point2D,
  scaleMetersPerSourceUnit: number,
) {
  const vector = routeDirectionVector(
    first,
    second,
    scaleMetersPerSourceUnit,
  );

  return Math.hypot(vector.x, vector.y, vector.z);
}

function pointZ(point: Point2D) {
  return typeof point.z === "number" && Number.isFinite(point.z) ? point.z : 0;
}
