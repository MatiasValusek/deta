import { terminalEndHeightMeters } from "@/lib/equipment/terminalConfig";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { DEFAULT_POINT_Z_METERS, withPointZ } from "@/lib/geometry/height";
import type { Point2D } from "@/lib/geometry/types";
import {
  buildEquipmentIndex,
  resolveRouteNodePosition,
  resolveRouteSegmentPath,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  ResolvedRouteSegment,
  RouteNode,
} from "@/lib/routing/types";

export type TechnicalRouteElevationSource =
  | "equipment"
  | "explicit"
  | "geometry"
  | "meter"
  | "preset";

export type TechnicalRouteNodeElevation = {
  reason: string | null;
  source: TechnicalRouteElevationSource | null;
  status: "pending" | "resolved";
  zMeters: number | null;
};

export function createTechnicalRouteNodeElevationIndex(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
}) {
  const equipmentById = buildEquipmentIndex(params.equipment);
  const elevations = new Map<string, TechnicalRouteNodeElevation>();

  for (const node of params.network.nodes) {
    elevations.set(
      node.id,
      resolveTechnicalRouteNodeElevation({
        equipmentById,
        node,
      }),
    );
  }

  return elevations;
}

export function resolveTechnicalRouteSegments(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  nodeElevationById?: Map<string, TechnicalRouteNodeElevation>;
}): ResolvedRouteSegment[] {
  const equipmentById = buildEquipmentIndex(params.equipment);
  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const nodeElevationById =
    params.nodeElevationById ??
    createTechnicalRouteNodeElevationIndex({
      equipment: params.equipment,
      network: params.network,
    });
  const resolved: ResolvedRouteSegment[] = [];

  for (const segment of params.network.segments) {
    const fromNode = nodeById.get(segment.fromNodeId);
    const toNode = nodeById.get(segment.toNodeId);

    if (!fromNode || !toNode) {
      continue;
    }

    const from = resolveTechnicalRouteNodePosition({
      equipmentById,
      node: fromNode,
      nodeElevationById,
    });
    const to = resolveTechnicalRouteNodePosition({
      equipmentById,
      node: toNode,
      nodeElevationById,
    });

    if (!from || !to) {
      continue;
    }

    resolved.push({
      ...segment,
      from,
      path: resolveRouteSegmentPath(segment, from, to),
      to,
    });
  }

  return resolved;
}

export function resolveTechnicalRouteNodePosition(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  node: RouteNode;
  nodeElevationById: Map<string, TechnicalRouteNodeElevation>;
}): Point2D | null {
  const point = resolveRouteNodePosition(params.node, params.equipmentById);
  const elevation = params.nodeElevationById.get(params.node.id) ?? null;

  if (!point || elevation?.zMeters === null || elevation?.zMeters === undefined) {
    return point;
  }

  return withPointZ(point, elevation.zMeters);
}

function resolveTechnicalRouteNodeElevation(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  node: RouteNode;
}): TechnicalRouteNodeElevation {
  const point = resolveRouteNodePosition(params.node, params.equipmentById);

  if (!point) {
    return pendingElevation("Falta posicion del nodo.");
  }

  const explicitZ = explicitZMeters(point);

  if (explicitZ !== null) {
    return resolvedElevation(explicitZ, "explicit");
  }

  if (params.node.equipmentId) {
    const equipment = params.equipmentById.get(params.node.equipmentId) ?? null;
    const equipmentElevation = equipment
      ? resolveEquipmentFallbackElevation(equipment)
      : null;

    if (equipmentElevation) {
      return resolvedElevation(
        equipmentElevation.zMeters,
        equipmentElevation.source,
      );
    }

    return pendingElevation("Falta cota Z confirmada del equipo conectado.");
  }

  if (params.node.kind === "supply") {
    return resolvedElevation(DEFAULT_POINT_Z_METERS, "meter");
  }

  return resolvedElevation(DEFAULT_POINT_Z_METERS, "geometry");
}

function resolveEquipmentFallbackElevation(
  equipment: WorkbenchEquipment,
): { source: TechnicalRouteElevationSource; zMeters: number } | null {
  const explicitConnectionZ = explicitZMeters(equipment.connectionPoint);

  if (explicitConnectionZ !== null) {
    return {
      source: "explicit",
      zMeters: explicitConnectionZ,
    };
  }

  if (equipment.role === "supply") {
    return {
      source: "meter",
      zMeters: DEFAULT_POINT_Z_METERS,
    };
  }

  const config = equipment.terminalConfig;

  if (
    config &&
    config.connectionHeightMeters !== null &&
    Number.isFinite(config.connectionHeightMeters)
  ) {
    return {
      source: config.heightStatus === "confirmed" ? "equipment" : "preset",
      zMeters:
        terminalEndHeightMeters(config) ?? config.connectionHeightMeters,
    };
  }

  const bodyZ = explicitZMeters(equipment.bodyPoint);

  if (bodyZ !== null) {
    return {
      source: "equipment",
      zMeters: bodyZ,
    };
  }

  const wallZ = explicitZMeters(equipment.wallAnchor?.wallPoint);

  if (wallZ !== null) {
    return {
      source: "equipment",
      zMeters: wallZ,
    };
  }

  return null;
}

function resolvedElevation(
  zMeters: number,
  source: TechnicalRouteElevationSource,
): TechnicalRouteNodeElevation {
  return {
    reason: null,
    source,
    status: "resolved",
    zMeters,
  };
}

function pendingElevation(reason: string): TechnicalRouteNodeElevation {
  return {
    reason,
    source: null,
    status: "pending",
    zMeters: null,
  };
}

function explicitZMeters(point: Point2D | null | undefined) {
  return typeof point?.z === "number" && Number.isFinite(point.z)
    ? point.z
    : null;
}
