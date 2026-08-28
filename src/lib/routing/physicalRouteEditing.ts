import type { ManualConstraint } from "@/lib/constraints/types";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  buildEquipmentIndex,
  getRoutePath,
  projectPointToRouteSegmentPath,
  resolveRouteNodePosition,
  resolveRouteSegments,
  segmentIdsForNodePath,
} from "@/lib/routing/network";
import { pointAlmostEqual, projectPointToSegment } from "@/lib/routing/geometry";
import type {
  ManualRouteNetwork,
  RouteNode,
  RouteSegment,
} from "@/lib/routing/types";

export type PhysicalRouteEditSelection =
  | {
      kind: "node";
      nodeId: string;
    }
  | {
      kind: "segment";
      segmentId: string;
    }
  | {
      kind: "terminal";
      equipmentId: string;
      nodeId: string;
    }
  | {
      kind: "vertex";
      segmentId: string;
      vertexIndex: number;
    };

export type PhysicalRouteSnapOptions = {
  axes: boolean;
  enabled: boolean;
  orthogonal: boolean;
  structure: boolean;
  vertices: boolean;
};

export const DEFAULT_PHYSICAL_ROUTE_SNAP_OPTIONS: PhysicalRouteSnapOptions = {
  axes: true,
  enabled: true,
  orthogonal: true,
  structure: true,
  vertices: true,
};

export type PhysicalRouteEditResult =
  | {
      network: ManualRouteNetwork;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export function movePhysicalRouteNode(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  nodeId: string;
  point: Point2D;
  tolerance: number;
}): PhysicalRouteEditResult {
  const node =
    params.network.nodes.find((candidate) => candidate.id === params.nodeId) ??
    null;

  if (!node) {
    return {
      message: "El nodo seleccionado ya no existe.",
      ok: false,
    };
  }

  if (node.kind !== "route" || !node.position) {
    return {
      message: "Solo se mueven nodos tecnicos de derivacion desde la planta.",
      ok: false,
    };
  }

  const nodePosition = node.position;
  const nextNetwork = {
    ...params.network,
    nodes: params.network.nodes.map((candidate) =>
      candidate.id === node.id
        ? {
            ...candidate,
            position: preserveZ(params.point, nodePosition),
          }
        : candidate,
    ),
  };

  if (hasCollapsedConnectedSegment(nextNetwork, params.equipment, params.tolerance)) {
    return {
      message: "La derivacion no puede quedar sobre otro extremo del tramo.",
      ok: false,
    };
  }

  return {
    network: nextNetwork,
    ok: true,
  };
}

export function movePhysicalRouteVertex(params: {
  network: ManualRouteNetwork;
  point: Point2D;
  segmentId: string;
  vertexIndex: number;
}): PhysicalRouteEditResult {
  const segment =
    params.network.segments.find(
      (candidate) => candidate.id === params.segmentId,
    ) ?? null;
  const vertex = segment?.vertices?.[params.vertexIndex] ?? null;

  if (!segment || !vertex) {
    return {
      message: "El vertice seleccionado ya no existe.",
      ok: false,
    };
  }

  return {
    network: {
      ...params.network,
      segments: params.network.segments.map((candidate) =>
        candidate.id === segment.id
          ? {
              ...candidate,
              vertices: (candidate.vertices ?? []).map((point, index) =>
                index === params.vertexIndex
                  ? preserveZ(params.point, point)
                  : point,
              ),
            }
          : candidate,
      ),
    },
    ok: true,
  };
}

export function insertPhysicalRouteVertex(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  point: Point2D;
  segmentId: string;
  tolerance: number;
}): PhysicalRouteEditResult & { vertexIndex?: number } {
  const segment =
    params.network.segments.find(
      (candidate) => candidate.id === params.segmentId,
    ) ?? null;

  if (!segment) {
    return {
      message: "El tramo seleccionado ya no existe.",
      ok: false,
    };
  }

  const resolved =
    resolveRouteSegments(params.network, params.equipment).find(
      (candidate) => candidate.id === segment.id,
    ) ?? null;

  if (!resolved) {
    return {
      message: "No se pudo resolver la geometria del tramo.",
      ok: false,
    };
  }

  const projection = projectPointToRouteSegmentPath(params.point, resolved);

  if (projection.distance > params.tolerance) {
    return {
      message: "El punto debe estar sobre el tramo seleccionado.",
      ok: false,
    };
  }

  const path = resolved.path;
  const legIndex = Math.max(0, Math.min(projection.legIndex, path.length - 2));
  const previous = path[legIndex];
  const next = path[legIndex + 1];

  if (
    !previous ||
    !next ||
    pointAlmostEqual(projection.point, previous, params.tolerance) ||
    pointAlmostEqual(projection.point, next, params.tolerance)
  ) {
    return {
      message: "El vertice nuevo necesita separarse de los extremos.",
      ok: false,
    };
  }

  const vertexIndex = legIndex;

  return {
    network: {
      ...params.network,
      segments: params.network.segments.map((candidate) =>
        candidate.id === segment.id
          ? {
              ...candidate,
              vertices: [
                ...(candidate.vertices ?? []).slice(0, vertexIndex),
                projection.point,
                ...(candidate.vertices ?? []).slice(vertexIndex),
              ],
            }
          : candidate,
      ),
    },
    ok: true,
    vertexIndex,
  };
}

export function removePhysicalRouteVertex(params: {
  network: ManualRouteNetwork;
  segmentId: string;
  vertexIndex: number;
}): PhysicalRouteEditResult {
  const segment =
    params.network.segments.find(
      (candidate) => candidate.id === params.segmentId,
    ) ?? null;

  if (!segment?.vertices?.[params.vertexIndex]) {
    return {
      message: "El vertice seleccionado ya no existe.",
      ok: false,
    };
  }

  return {
    network: {
      ...params.network,
      segments: params.network.segments.map((candidate) => {
        if (candidate.id !== segment.id) {
          return candidate;
        }

        const vertices = (candidate.vertices ?? []).filter(
          (_point, index) => index !== params.vertexIndex,
        );

        if (vertices.length === 0) {
          const { vertices: _vertices, ...withoutVertices } = candidate;
          return withoutVertices;
        }

        return {
          ...candidate,
          vertices,
        };
      }),
    },
    ok: true,
  };
}

export function snapPhysicalRouteEditPoint(params: {
  constraints?: ManualConstraint[];
  equipment: WorkbenchEquipment[];
  movingSelection: PhysicalRouteEditSelection;
  network: ManualRouteNetwork;
  options: PhysicalRouteSnapOptions;
  point: Point2D;
  tolerance: number;
}): Point2D {
  if (!params.options.enabled) {
    return params.point;
  }

  const candidates = collectSnapCandidates({
    constraints: params.options.structure ? params.constraints ?? [] : [],
    equipment: params.equipment,
    network: params.network,
    point: params.point,
    skipSelection: params.movingSelection,
  });
  const nearestVertex = params.options.vertices
    ? nearestPoint(params.point, candidates.points, params.tolerance)
    : null;
  let snapped = nearestVertex ?? params.point;

  if (params.options.axes) {
    snapped = snapToAxes({
      axisPoints: candidates.axisPoints,
      point: snapped,
      tolerance: params.tolerance,
    });
  }

  if (params.options.orthogonal) {
    snapped = snapToOrthogonalNeighbors({
      equipment: params.equipment,
      movingSelection: params.movingSelection,
      network: params.network,
      point: snapped,
      tolerance: params.tolerance,
    });
  }

  return snapped;
}

export function relatedRouteSegmentIds(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  result?: TechnicalCalculationResult | null;
  selectedEquipmentId?: string | null;
  selection?: PhysicalRouteEditSelection | null;
}): Set<string> {
  if (params.selection?.kind === "segment") {
    return governingRouteSegmentIds(params.result, params.selection.segmentId);
  }

  if (params.selection?.kind === "vertex") {
    return governingRouteSegmentIds(params.result, params.selection.segmentId);
  }

  if (params.selection?.kind === "node") {
    const nodeId = params.selection.nodeId;

    return new Set(
      params.network.segments
        .filter(
          (segment) =>
            segment.fromNodeId === nodeId || segment.toNodeId === nodeId,
        )
        .map((segment) => segment.id),
    );
  }

  const equipmentId =
    params.selection?.kind === "terminal"
      ? params.selection.equipmentId
      : params.selectedEquipmentId;

  if (!equipmentId) {
    return new Set<string>();
  }

  return routeSegmentIdsToEquipment({
    equipment: params.equipment,
    equipmentId,
    network: params.network,
  });
}

function governingRouteSegmentIds(
  result: TechnicalCalculationResult | null | undefined,
  segmentId: string,
) {
  const segment = result?.segments.find((item) => item.segmentId === segmentId);
  const governingRoute =
    segment?.governingRouteResolution.status === "resolved"
      ? segment.governingRouteResolution.value
      : segment?.governingRoute;

  return new Set(governingRoute?.segmentIds ?? [segmentId]);
}

function routeSegmentIdsToEquipment(params: {
  equipment: WorkbenchEquipment[];
  equipmentId: string;
  network: ManualRouteNetwork;
}) {
  const supply = params.equipment.find((item) => item.role === "supply") ?? null;
  const supplyNode = supply
    ? params.network.nodes.find((node) => node.equipmentId === supply.id) ?? null
    : null;
  const terminalNode =
    params.network.nodes.find((node) => node.equipmentId === params.equipmentId) ??
    null;

  if (!supplyNode || !terminalNode) {
    return new Set<string>();
  }

  return new Set(
    segmentIdsForNodePath(
      params.network,
      getRoutePath(params.network, supplyNode.id, terminalNode.id),
    ),
  );
}

function collectSnapCandidates(params: {
  constraints: ManualConstraint[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  point: Point2D;
  skipSelection: PhysicalRouteEditSelection;
}) {
  const equipmentById = buildEquipmentIndex(params.equipment);
  const points: Point2D[] = [];

  for (const node of params.network.nodes) {
    if (
      params.skipSelection.kind === "node" &&
      params.skipSelection.nodeId === node.id
    ) {
      continue;
    }

    const position = resolveRouteNodePosition(node, equipmentById);

    if (position) {
      points.push(position);
    }
  }

  for (const segment of params.network.segments) {
    for (const [vertexIndex, vertex] of (segment.vertices ?? []).entries()) {
      if (
        params.skipSelection.kind === "vertex" &&
        params.skipSelection.segmentId === segment.id &&
        params.skipSelection.vertexIndex === vertexIndex
      ) {
        continue;
      }

      points.push(vertex);
    }
  }

  for (const constraint of params.constraints) {
    if (!constraint.active) {
      continue;
    }

    points.push(...constraint.polygon);
    points.push(...constraintEdgeProjections(params.point, constraint.polygon));
  }

  return {
    axisPoints: points,
    points,
  };
}

function constraintEdgeProjections(point: Point2D, polygon: Point2D[]) {
  const projected: Point2D[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index];
    const to = polygon[(index + 1) % polygon.length];

    if (from && to) {
      projected.push(projectPointToSegment(point, from, to).point);
    }
  }

  return projected;
}

function nearestPoint(point: Point2D, candidates: Point2D[], tolerance: number) {
  return (
    candidates
      .map((candidate) => ({
        distance: Math.hypot(candidate.x - point.x, candidate.y - point.y),
        point: candidate,
      }))
      .filter((candidate) => candidate.distance <= tolerance)
      .sort((first, second) => first.distance - second.distance)[0]?.point ??
    null
  );
}

function snapToAxes(params: {
  axisPoints: Point2D[];
  point: Point2D;
  tolerance: number;
}) {
  let x = params.point.x;
  let y = params.point.y;
  let bestXDistance = params.tolerance;
  let bestYDistance = params.tolerance;

  for (const axisPoint of params.axisPoints) {
    const xDistance = Math.abs(axisPoint.x - params.point.x);
    const yDistance = Math.abs(axisPoint.y - params.point.y);

    if (xDistance <= bestXDistance) {
      bestXDistance = xDistance;
      x = axisPoint.x;
    }

    if (yDistance <= bestYDistance) {
      bestYDistance = yDistance;
      y = axisPoint.y;
    }
  }

  return preserveZ({ x, y }, params.point);
}

function snapToOrthogonalNeighbors(params: {
  equipment: WorkbenchEquipment[];
  movingSelection: PhysicalRouteEditSelection;
  network: ManualRouteNetwork;
  point: Point2D;
  tolerance: number;
}) {
  const neighbors = adjacentPointsForSelection(params);
  let best = params.point;
  let bestDistance = params.tolerance;

  for (const neighbor of neighbors) {
    const xCandidate = preserveZ({ x: params.point.x, y: neighbor.y }, params.point);
    const yCandidate = preserveZ({ x: neighbor.x, y: params.point.y }, params.point);
    const xDistance = Math.abs(params.point.y - neighbor.y);
    const yDistance = Math.abs(params.point.x - neighbor.x);

    if (xDistance <= bestDistance) {
      best = xCandidate;
      bestDistance = xDistance;
    }

    if (yDistance <= bestDistance) {
      best = yCandidate;
      bestDistance = yDistance;
    }
  }

  return best;
}

function adjacentPointsForSelection(params: {
  equipment: WorkbenchEquipment[];
  movingSelection: PhysicalRouteEditSelection;
  network: ManualRouteNetwork;
}) {
  const equipmentById = buildEquipmentIndex(params.equipment);

  if (params.movingSelection.kind === "node") {
    const points: Point2D[] = [];

    for (const segment of params.network.segments) {
      const nodeId =
        segment.fromNodeId === params.movingSelection.nodeId
          ? segment.toNodeId
          : segment.toNodeId === params.movingSelection.nodeId
            ? segment.fromNodeId
            : null;
      const node = nodeId
        ? params.network.nodes.find((candidate) => candidate.id === nodeId) ??
          null
        : null;
      const point = node ? resolveRouteNodePosition(node, equipmentById) : null;

      if (point) {
        points.push(point);
      }
    }

    return points;
  }

  if (params.movingSelection.kind === "vertex") {
    const segmentId = params.movingSelection.segmentId;
    const segment =
      params.network.segments.find(
        (candidate) => candidate.id === segmentId,
      ) ?? null;
    const resolved =
      resolveRouteSegments(params.network, params.equipment).find(
        (candidate) => candidate.id === segmentId,
      ) ?? null;

    if (!segment || !resolved) {
      return [];
    }

    const path = resolved.path;
    const pathIndex = params.movingSelection.vertexIndex + 1;

    return [
      path[pathIndex - 1],
      path[pathIndex + 1],
    ].filter((point): point is Point2D => Boolean(point));
  }

  return [];
}

function hasCollapsedConnectedSegment(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
  tolerance: number,
) {
  return resolveRouteSegments(network, equipment).some((segment) =>
    pointAlmostEqual(segment.from, segment.to, tolerance),
  );
}

function preserveZ(point: Point2D, source: Point2D): Point2D {
  return typeof source.z === "number" && Number.isFinite(source.z)
    ? {
        ...point,
        z: source.z,
      }
    : {
        x: point.x,
        y: point.y,
      };
}
