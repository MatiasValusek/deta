import {
  equipmentTerminalElevationMetadata,
  terminalEndHeightMeters,
} from "@/lib/equipment/terminalConfig";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  DEFAULT_POINT_Z_METERS,
  DEFAULT_UNVERIFIED_ELEVATION,
  withPointZ,
  type ElevationMetadata,
  type ElevationSource,
  type ElevationVerificationStatus,
} from "@/lib/geometry/height";
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

export type TechnicalRouteElevationSource = ElevationSource;

export type TechnicalRouteNodeElevation = {
  reason: string | null;
  source: TechnicalRouteElevationSource | null;
  status: "pending" | "resolved";
  verificationStatus: ElevationVerificationStatus;
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

  if (params.node.equipmentId) {
    const equipment = params.equipmentById.get(params.node.equipmentId) ?? null;
    const metadata = equipment
      ? resolveEquipmentElevationMetadata(equipment)
      : DEFAULT_UNVERIFIED_ELEVATION;

    if (explicitZ !== null) {
      return resolvedElevation(explicitZ, metadata);
    }

    const equipmentElevation = equipment
      ? resolveEquipmentFallbackElevation(equipment)
      : null;

    if (equipmentElevation) {
      return resolvedElevation(
        equipmentElevation.zMeters,
        equipmentElevation.metadata,
      );
    }

    return resolvedElevation(DEFAULT_POINT_Z_METERS, metadata);
  }

  const metadata = params.node.elevation ?? DEFAULT_UNVERIFIED_ELEVATION;

  if (explicitZ !== null) {
    return resolvedElevation(explicitZ, metadata);
  }

  return resolvedElevation(DEFAULT_POINT_Z_METERS, metadata);
}

function resolveEquipmentFallbackElevation(
  equipment: WorkbenchEquipment,
): { metadata: ElevationMetadata; zMeters: number } | null {
  const metadata = resolveEquipmentElevationMetadata(equipment);
  const explicitConnectionZ = explicitZMeters(equipment.connectionPoint);

  if (explicitConnectionZ !== null) {
    return {
      metadata,
      zMeters: explicitConnectionZ,
    };
  }

  if (equipment.role === "supply") {
    return {
      metadata,
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
      metadata,
      zMeters:
        terminalEndHeightMeters(config) ?? config.connectionHeightMeters,
    };
  }

  const bodyZ = explicitZMeters(equipment.bodyPoint);

  if (bodyZ !== null) {
    return {
      metadata,
      zMeters: bodyZ,
    };
  }

  const wallZ = explicitZMeters(equipment.wallAnchor?.wallPoint);

  if (wallZ !== null) {
    return {
      metadata,
      zMeters: wallZ,
    };
  }

  return null;
}

function resolveEquipmentElevationMetadata(
  equipment: WorkbenchEquipment,
): ElevationMetadata {
  if (equipment.terminalConfig) {
    return equipmentTerminalElevationMetadata(equipment.terminalConfig);
  }

  return equipment.elevation ?? DEFAULT_UNVERIFIED_ELEVATION;
}

function resolvedElevation(
  zMeters: number,
  metadata: ElevationMetadata,
): TechnicalRouteNodeElevation {
  return {
    reason: null,
    source: metadata.source,
    status: "resolved",
    verificationStatus: metadata.status,
    zMeters,
  };
}

function pendingElevation(reason: string): TechnicalRouteNodeElevation {
  return {
    reason,
    source: null,
    status: "pending",
    verificationStatus: "unverified",
    zMeters: null,
  };
}

function explicitZMeters(point: Point2D | null | undefined) {
  return typeof point?.z === "number" && Number.isFinite(point.z)
    ? point.z
    : null;
}
