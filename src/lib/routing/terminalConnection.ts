import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { pointZMeters } from "@/lib/geometry/height";
import {
  buildEquipmentIndex,
  findRouteNodeByEquipment,
  getRouteNeighbors,
  resolveRouteNodePosition,
  segmentConnects,
} from "./network";
import type {
  ManualRouteNetwork,
  RouteSegment,
  RouteSegmentAccessory,
} from "./types";

const TERMINAL_ACCESSORY_ID_PREFIX = "route-terminal:";
const TERMINAL_VALVE_FAMILY_ID = "llave-esferica";
const TERMINAL_RH_FAMILY_ID = "codo-90-rosca-hembra";
const EPSILON = 0.000001;

export type TerminalConnectionUpdateResult =
  | {
      changed: boolean;
      network: ManualRouteNetwork;
      ok: true;
      segmentId?: string;
    }
  | {
      message: string;
      ok: false;
    };

export function applyConfirmedEquipmentTerminalConnection(params: {
  equipment: WorkbenchEquipment[];
  equipmentId: string;
  network: ManualRouteNetwork;
  scaleMetersPerSourceUnit?: number | null;
}): TerminalConnectionUpdateResult {
  const equipment =
    params.equipment.find((item) => item.id === params.equipmentId) ?? null;

  if (!equipment || equipment.role !== "appliance") {
    return { changed: false, network: params.network, ok: true };
  }

  const terminalConfig = equipment.terminalConfig ?? null;

  if (
    !terminalConfig ||
    terminalConfig.heightStatus !== "confirmed" ||
    terminalConfig.connectionHeightMeters === null
  ) {
    const network = removeGeneratedTerminalConnection({
      equipment: params.equipment,
      equipmentId: equipment.id,
      network: params.network,
    });

    return {
      changed: JSON.stringify(params.network) !== JSON.stringify(network),
      network,
      ok: true,
    };
  }

  const branch = resolveTerminalBranch({
    equipment: params.equipment,
    equipmentId: equipment.id,
    network: params.network,
  });

  if (!branch.ok) {
    return branch;
  }

  const offsetSource = terminalLateralOffsetSource({
    lateralOffsetMeters: terminalConfig.lateralOffsetMeters,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit ?? null,
  });

  if (!offsetSource.ok) {
    return offsetSource;
  }

  const connectionPoint = withZ(
    equipment.connectionPoint,
    terminalConfig.connectionHeightMeters,
  );
  const tangent = terminalTangent(equipment);
  const signedOffset =
    terminalConfig.outletSide === "left"
      ? -offsetSource.value
      : terminalConfig.outletSide === "right"
        ? offsetSource.value
        : 0;
  const terminalApproachPoint = withZ(
    {
      x: connectionPoint.x + tangent.x * signedOffset,
      y: connectionPoint.y + tangent.y * signedOffset,
    },
    terminalConfig.connectionHeightMeters,
  );
  const vertices = terminalBranchVertices({
    connectionPoint,
    originPoint: branch.originPoint,
    terminalApproachPoint,
  });
  const terminalAccessories = terminalRouteAccessories({
    equipmentId: equipment.id,
    segmentId: branch.segment.id,
    terminalRequired: true,
    valveRequired: terminalConfig.requiresShutoffValve,
  });
  const networkWithoutGenerated = removeGeneratedTerminalAccessories(
    params.network,
    equipment.id,
  );
  const network = {
    nodes: networkWithoutGenerated.nodes,
    segments: networkWithoutGenerated.segments.map((segment) =>
      segment.id === branch.segment.id
        ? {
            ...segment,
            accessories: mergeTerminalAccessories(
              segment.accessories,
              terminalAccessories,
            ),
            vertices: vertices.length > 0 ? vertices : undefined,
          }
        : segment,
    ),
  };

  return {
    changed:
      JSON.stringify(params.network) !== JSON.stringify(network),
    network,
    ok: true,
    segmentId: branch.segment.id,
  };
}

function resolveTerminalBranch(params: {
  equipment: WorkbenchEquipment[];
  equipmentId: string;
  network: ManualRouteNetwork;
}):
  | {
      ok: true;
      originPoint: Point2D;
      segment: RouteSegment;
    }
  | {
      message: string;
      ok: false;
    } {
  const applianceNode = findRouteNodeByEquipment(
    params.network,
    params.equipmentId,
  );

  if (!applianceNode || applianceNode.kind !== "appliance") {
    return {
      message: "El artefacto no esta conectado a la red.",
      ok: false,
    };
  }

  const neighbors = getRouteNeighbors(params.network).get(applianceNode.id);

  if (!neighbors || neighbors.size !== 1) {
    return {
      message: "El artefacto no tiene una rama terminal unica.",
      ok: false,
    };
  }

  const [originNodeId] = [...neighbors];
  const originNode =
    params.network.nodes.find((node) => node.id === originNodeId) ?? null;
  const segment =
    params.network.segments.find((candidate) =>
      segmentConnects(candidate, applianceNode.id, originNodeId),
    ) ?? null;

  if (!originNode || originNode.kind === "appliance" || !segment) {
    return {
      message: "La rama terminal no tiene un origen de red valido.",
      ok: false,
    };
  }

  const equipmentById = buildEquipmentIndex(params.equipment);
  const originPoint = resolveRouteNodePosition(originNode, equipmentById);

  if (!originPoint) {
    return {
      message: "No se pudo resolver el origen de la rama terminal.",
      ok: false,
    };
  }

  return {
    ok: true,
    originPoint,
    segment,
  };
}

function terminalLateralOffsetSource(params: {
  lateralOffsetMeters: number;
  scaleMetersPerSourceUnit: number | null;
}):
  | {
      ok: true;
      value: number;
    }
  | {
      message: string;
      ok: false;
    } {
  if (Math.abs(params.lateralOffsetMeters) <= EPSILON) {
    return { ok: true, value: 0 };
  }

  if (
    !params.scaleMetersPerSourceUnit ||
    params.scaleMetersPerSourceUnit <= 0
  ) {
    return {
      message:
        "Confirme la escala antes de generar un desplazamiento terminal en metros.",
      ok: false,
    };
  }

  return {
    ok: true,
    value: params.lateralOffsetMeters / params.scaleMetersPerSourceUnit,
  };
}

function terminalTangent(equipment: WorkbenchEquipment): Point2D {
  const orientation = equipment.wallAnchor?.orientationRadians;

  if (orientation !== null && orientation !== undefined && Number.isFinite(orientation)) {
    return {
      x: Math.cos(orientation),
      y: Math.sin(orientation),
    };
  }

  return { x: 1, y: 0 };
}

function terminalBranchVertices(params: {
  connectionPoint: Point2D;
  originPoint: Point2D;
  terminalApproachPoint: Point2D;
}) {
  const heightMeters = pointZMeters(params.connectionPoint);
  const vertices: Point2D[] = [];
  const verticalPoint = withZ(
    {
      x: params.originPoint.x,
      y: params.originPoint.y,
    },
    heightMeters,
  );

  if (Math.abs(pointZMeters(params.originPoint) - heightMeters) > EPSILON) {
    vertices.push(verticalPoint);
  }

  if (!sameXY(verticalPoint, params.terminalApproachPoint)) {
    vertices.push(stripRedundantZ(params.terminalApproachPoint));
  }

  return dedupeConsecutiveVertices(
    vertices,
    params.originPoint,
    params.connectionPoint,
  );
}

function terminalRouteAccessories(params: {
  equipmentId: string;
  segmentId: string;
  terminalRequired: boolean;
  valveRequired: boolean;
}) {
  const accessories: RouteSegmentAccessory[] = [];

  if (params.valveRequired) {
    accessories.push(
      terminalAccessory({
        catalogFamilyId: TERMINAL_VALVE_FAMILY_ID,
        equipmentId: params.equipmentId,
        kind: "valve",
        segmentId: params.segmentId,
        type: "valve",
      }),
    );
  }

  if (params.terminalRequired) {
    accessories.push(
      terminalAccessory({
        catalogFamilyId: TERMINAL_RH_FAMILY_ID,
        equipmentId: params.equipmentId,
        kind: "terminal",
        segmentId: params.segmentId,
        type: "elbow",
      }),
    );
  }

  return accessories;
}

function terminalAccessory(params: {
  catalogFamilyId: string;
  equipmentId: string;
  kind: "terminal" | "valve";
  segmentId: string;
  type: RouteSegmentAccessory["type"];
}): RouteSegmentAccessory {
  return {
    catalogFamilyId: params.catalogFamilyId,
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id: `${TERMINAL_ACCESSORY_ID_PREFIX}${params.equipmentId}:${params.kind}`,
    origin: "user_confirmed",
    quantity: 1,
    segmentId: params.segmentId,
    type: params.type,
  };
}

function removeGeneratedTerminalAccessories(
  network: ManualRouteNetwork,
  equipmentId: string,
): ManualRouteNetwork {
  const prefix = `${TERMINAL_ACCESSORY_ID_PREFIX}${equipmentId}:`;

  return {
    nodes: network.nodes,
    segments: network.segments.map((segment) => {
      const accessories = (segment.accessories ?? []).filter(
        (accessory) => !accessory.id.startsWith(prefix),
      );

      return {
        ...segment,
        accessories: accessories.length > 0 ? accessories : undefined,
      };
    }),
  };
}

function removeGeneratedTerminalConnection(params: {
  equipment: WorkbenchEquipment[];
  equipmentId: string;
  network: ManualRouteNetwork;
}): ManualRouteNetwork {
  const prefix = `${TERMINAL_ACCESSORY_ID_PREFIX}${params.equipmentId}:`;
  const branch = resolveTerminalBranch(params);

  return {
    nodes: params.network.nodes,
    segments: params.network.segments.map((segment) => {
      const hadGeneratedTerminalAccessory = (segment.accessories ?? []).some(
        (accessory) => accessory.id.startsWith(prefix),
      );
      const accessories = (segment.accessories ?? []).filter(
        (accessory) => !accessory.id.startsWith(prefix),
      );

      return {
        ...segment,
        accessories: accessories.length > 0 ? accessories : undefined,
        vertices:
          branch.ok &&
          hadGeneratedTerminalAccessory &&
          segment.id === branch.segment.id
            ? undefined
            : segment.vertices,
      };
    }),
  };
}

function mergeTerminalAccessories(
  current: RouteSegmentAccessory[] | undefined,
  terminalAccessories: RouteSegmentAccessory[],
) {
  const terminalIds = new Set(
    terminalAccessories.map((accessory) => accessory.id),
  );

  return [
    ...(current ?? []).filter((accessory) => !terminalIds.has(accessory.id)),
    ...terminalAccessories,
  ].sort((first, second) => first.id.localeCompare(second.id));
}

function dedupeConsecutiveVertices(
  vertices: Point2D[],
  originPoint: Point2D,
  connectionPoint: Point2D,
) {
  const deduped: Point2D[] = [];
  let previous = originPoint;

  for (const vertex of vertices) {
    if (!samePoint(vertex, previous)) {
      deduped.push(vertex);
      previous = vertex;
    }
  }

  return deduped.filter((vertex, index) => {
    const next = deduped[index + 1] ?? connectionPoint;

    return !samePoint(vertex, next);
  });
}

function stripRedundantZ(point: Point2D): Point2D {
  return {
    x: point.x,
    y: point.y,
    z: point.z,
  };
}

function withZ(point: Point2D, z: number): Point2D {
  return {
    x: point.x,
    y: point.y,
    z,
  };
}

function sameXY(first: Point2D, second: Point2D) {
  return (
    Math.hypot(first.x - second.x, first.y - second.y) <= EPSILON
  );
}

function samePoint(first: Point2D, second: Point2D) {
  return (
    sameXY(first, second) &&
    Math.abs(pointZMeters(first) - pointZMeters(second)) <= EPSILON
  );
}
