import { equipmentCode, type WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { buildEquipmentIndex, getRouteNeighbors, resolveRouteNodePosition } from "@/lib/routing/network";
import type { ManualRouteNetwork, RouteNode } from "@/lib/routing/types";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { TechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import {
  technicalPhysicalAccessoryKindLabel,
  type TechnicalPhysicalAccessory,
  type TechnicalPhysicalAccessoryInventory,
} from "@/lib/calculation/technicalPhysicalAccessories";

export type TechnicalAxonometricStatus =
  | "pending"
  | "resolved"
  | "unavailable";

export type TechnicalAxonometricNodeKind =
  | "appliance"
  | "derivation"
  | "route"
  | "supply";

export type TechnicalAxonometricProjectedPoint = {
  x: number;
  y: number;
};

export type TechnicalAxonometricPoint3D = {
  source: Point2D;
  xMeters: number;
  yMeters: number;
  zMeters: number | null;
};

export type TechnicalAxonometricNode = {
  degree: number;
  equipmentId: string | null;
  id: string;
  kind: TechnicalAxonometricNodeKind;
  label: string;
  pendingReasons: string[];
  point: TechnicalAxonometricPoint3D | null;
  projected: TechnicalAxonometricProjectedPoint | null;
};

export type TechnicalAxonometricSegment = {
  adoptedDiameter: PipeDiameterReference | null;
  adoptedDiameterLabel: string;
  fromNodeId: string;
  fromProjected: TechnicalAxonometricProjectedPoint | null;
  id: string;
  labelPosition: TechnicalAxonometricProjectedPoint | null;
  pendingReasons: string[];
  physicalLengthMeters: number | null;
  status: TechnicalAxonometricStatus;
  toNodeId: string;
  toProjected: TechnicalAxonometricProjectedPoint | null;
  zDeltaMeters: number | null;
};

export type TechnicalAxonometricAccessory = {
  id: string;
  kind: TechnicalPhysicalAccessory["kind"];
  label: string;
  nodeId: string | null;
  pendingReasons: string[];
  projected: TechnicalAxonometricProjectedPoint | null;
  segmentIds: string[];
  status: TechnicalAxonometricStatus;
};

export type TechnicalAxonometricPendingItem = {
  id: string;
  message: string;
  sourceId: string;
  type: "accessory" | "node" | "scale" | "segment";
};

export type TechnicalAxonometricViewBox = {
  height: number;
  minX: number;
  minY: number;
  width: number;
};

export type TechnicalAxonometricView = {
  accessories: TechnicalAxonometricAccessory[];
  nodes: TechnicalAxonometricNode[];
  pendingItems: TechnicalAxonometricPendingItem[];
  scaleStatus: "pending" | "resolved";
  segments: TechnicalAxonometricSegment[];
  status: TechnicalAxonometricStatus;
  viewBox: TechnicalAxonometricViewBox;
};

type RawNode = Omit<TechnicalAxonometricNode, "projected"> & {
  rawProjected: TechnicalAxonometricProjectedPoint | null;
};

type RawSegment = Omit<
  TechnicalAxonometricSegment,
  "fromProjected" | "labelPosition" | "toProjected"
>;

type RawAccessory = Omit<TechnicalAxonometricAccessory, "projected"> & {
  rawProjected: TechnicalAxonometricProjectedPoint | null;
};

const AXONOMETRIC_PADDING = 28;
const DEFAULT_VIEWBOX: TechnicalAxonometricViewBox = {
  height: 260,
  minX: 0,
  minY: 0,
  width: 520,
};

export function createTechnicalAxonometricView(params: {
  adoptedDiameterValidation?: TechnicalAdoptedDiameterValidation;
  equipment: WorkbenchEquipment[];
  inventory: TechnicalPhysicalAccessoryInventory;
  network: ManualRouteNetwork;
  result: TechnicalCalculationResult | null;
  scaleMetersPerSourceUnit: number | null;
}): TechnicalAxonometricView {
  const scaleStatus =
    params.scaleMetersPerSourceUnit !== null &&
    Number.isFinite(params.scaleMetersPerSourceUnit)
      ? "resolved"
      : "pending";

  if (!params.result || params.network.nodes.length === 0) {
    return {
      accessories: [],
      nodes: [],
      pendingItems:
        params.network.nodes.length === 0
          ? []
          : [
              {
                id: "axonometric:calculation",
                message: "Calculo tecnico pendiente para axonometrica.",
                sourceId: "calculation",
                type: "segment",
              },
            ],
      scaleStatus,
      segments: [],
      status: "unavailable",
      viewBox: DEFAULT_VIEWBOX,
    };
  }

  const equipmentById = buildEquipmentIndex(params.equipment);
  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const neighbors = getRouteNeighbors(params.network);
  const resultSegmentById = new Map(
    params.result.segments.map((segment) => [segment.segmentId, segment]),
  );
  const adoptedSegmentById = new Map(
    params.adoptedDiameterValidation?.segments.map((segment) => [
      segment.segmentId,
      segment,
    ]) ?? [],
  );
  const rawNodeById = new Map(
    sortNodes(params.network.nodes).map((node) => {
      const raw = createRawNode({
        equipmentById,
        neighbors,
        node,
        nodeLabels: params.result?.nodeLabels ?? {},
        scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
      });

      return [raw.id, raw];
    }),
  );
  const rawSegments = sortRouteSegments(params.network.segments).map(
    (segment) => {
      const resultSegment = resultSegmentById.get(segment.id) ?? null;

      return createRawSegment({
        adoptedSegment: adoptedSegmentById.get(segment.id) ?? null,
        fallbackFromNodeId: segment.fromNodeId,
        fallbackToNodeId: segment.toNodeId,
        fromNode: rawNodeById.get(
          resultSegment?.fromNodeId ?? segment.fromNodeId,
        ) ?? null,
        resultSegment,
        segmentId: segment.id,
        toNode:
          rawNodeById.get(resultSegment?.toNodeId ?? segment.toNodeId) ?? null,
      });
    },
  );
  const rawAccessories = params.inventory.items
    .map((item) =>
      createRawAccessory({
        equipmentById,
        item,
        nodeById,
        scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
      }),
    )
    .sort((first, second) => first.id.localeCompare(second.id));
  const projection = createProjectionTransform([
    ...[...rawNodeById.values()].map((node) => node.rawProjected),
    ...rawAccessories.map((accessory) => accessory.rawProjected),
  ]);
  const nodes = [...rawNodeById.values()].map((node) => ({
    ...node,
    projected: node.rawProjected
      ? projection.project(node.rawProjected)
      : null,
  }));
  const nodeByIdWithProjection = new Map(nodes.map((node) => [node.id, node]));
  const segments = rawSegments.map((segment) => {
    const fromProjected =
      nodeByIdWithProjection.get(segment.fromNodeId)?.projected ?? null;
    const toProjected =
      nodeByIdWithProjection.get(segment.toNodeId)?.projected ?? null;

    return {
      ...segment,
      fromProjected,
      labelPosition:
        fromProjected && toProjected
          ? midpointProjected(fromProjected, toProjected)
          : null,
      toProjected,
    };
  });
  const accessories = rawAccessories.map((accessory) => ({
    ...accessory,
    projected: accessory.rawProjected
      ? projection.project(accessory.rawProjected)
      : null,
  }));
  const pendingItems = createPendingItems({
    accessories,
    inventory: params.inventory,
    nodes,
    scaleStatus,
    segments,
  });

  return {
    accessories,
    nodes,
    pendingItems,
    scaleStatus,
    segments,
    status:
      nodes.length === 0 && segments.length === 0
        ? "unavailable"
        : pendingItems.length > 0
          ? "pending"
          : "resolved",
    viewBox: projection.viewBox,
  };
}

function createRawNode(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  neighbors: Map<string, Set<string>>;
  node: RouteNode;
  nodeLabels: Record<string, string>;
  scaleMetersPerSourceUnit: number | null;
}): RawNode {
  const point = resolveRouteNodePosition(params.node, params.equipmentById);
  const degree = params.neighbors.get(params.node.id)?.size ?? 0;
  const point3d = point
    ? createPoint3D(point, params.scaleMetersPerSourceUnit)
    : null;
  const pendingReasons = [
    ...(!point ? ["Falta posicion del nodo."] : []),
    ...(point && point3d?.zMeters === null
      ? ["Altura z pendiente en el nodo."]
      : []),
  ];

  return {
    degree,
    equipmentId: params.node.equipmentId ?? null,
    id: params.node.id,
    kind: axonometricNodeKind(params.node, degree),
    label: nodeLabel(params.node, params.equipmentById, params.nodeLabels),
    pendingReasons,
    point: point3d,
    rawProjected: point3d ? projectPoint3D(point3d) : null,
  };
}

function createRawSegment(params: {
  adoptedSegment:
    | NonNullable<TechnicalAdoptedDiameterValidation["segments"]>[number]
    | null;
  fallbackFromNodeId: string;
  fallbackToNodeId: string;
  fromNode: RawNode | null;
  resultSegment:
    | NonNullable<TechnicalCalculationResult["segments"]>[number]
    | null;
  segmentId: string;
  toNode: RawNode | null;
}): RawSegment {
  const fromNodeId =
    params.resultSegment?.fromNodeId ?? params.fallbackFromNodeId;
  const toNodeId = params.resultSegment?.toNodeId ?? params.fallbackToNodeId;
  const adoptedDiameter =
    params.adoptedSegment?.status === "valid"
      ? params.adoptedSegment.adoptedDiameter
      : null;
  const zDeltaMeters =
    params.fromNode?.point?.zMeters !== null &&
    params.fromNode?.point?.zMeters !== undefined &&
    params.toNode?.point?.zMeters !== null &&
    params.toNode?.point?.zMeters !== undefined
      ? params.toNode.point.zMeters - params.fromNode.point.zMeters
      : null;
  const pendingReasons = [
    ...(!params.fromNode?.point || !params.toNode?.point
      ? ["Falta posicion de extremo del tramo."]
      : []),
    ...(zDeltaMeters === null
      ? ["Diferencia de altura pendiente por z faltante."]
      : []),
    ...(!adoptedDiameter
      ? [
          params.adoptedSegment?.reason ??
            "Diametro adoptado pendiente para el tramo.",
        ]
      : []),
    ...(params.resultSegment?.segmentPhysicalLengthMeters === null ||
    params.resultSegment?.segmentPhysicalLengthMeters === undefined
      ? ["Longitud fisica pendiente para el tramo."]
      : []),
  ];

  return {
    adoptedDiameter,
    adoptedDiameterLabel: formatDiameterSymbol(adoptedDiameter),
    fromNodeId,
    id: params.segmentId,
    pendingReasons,
    physicalLengthMeters:
      params.resultSegment?.segmentPhysicalLengthMeters ?? null,
    status: pendingReasons.length > 0 ? "pending" : "resolved",
    toNodeId,
    zDeltaMeters,
  };
}

function createRawAccessory(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  item: TechnicalPhysicalAccessory;
  nodeById: Map<string, RouteNode>;
  scaleMetersPerSourceUnit: number | null;
}): RawAccessory {
  const nodePoint = params.item.nodeId
    ? resolveNodePosition(
        params.item.nodeId,
        params.nodeById,
        params.equipmentById,
      )
    : null;
  const anchorPoint = createAccessoryAnchorPoint(
    params.item.position ?? null,
    nodePoint,
  );
  const point = anchorPoint
    ? createPoint3D(anchorPoint, params.scaleMetersPerSourceUnit)
    : null;
  const pendingReasons = [
    ...(!point ? ["Falta posicion de la pieza fisica."] : []),
    ...(point?.zMeters === null ? ["Altura z pendiente en la pieza."] : []),
  ];

  return {
    id: params.item.id,
    kind: params.item.kind,
    label: `${technicalPhysicalAccessoryKindLabel(
      params.item.kind,
    )} ${physicalAccessoryDiameterLabel(params.item)}`.trim(),
    nodeId: params.item.nodeId,
    pendingReasons,
    rawProjected: point ? projectPoint3D(point) : null,
    segmentIds: [...params.item.segmentIds].sort(),
    status: pendingReasons.length > 0 ? "pending" : "resolved",
  };
}

function createAccessoryAnchorPoint(
  position: Point2D | null,
  nodePoint: Point2D | null,
): Point2D | null {
  if (!position && !nodePoint) {
    return null;
  }

  const xy = (position ?? nodePoint) as Point2D;
  const zPoint =
    position && pointHasExplicitZ(position)
      ? position
      : nodePoint && pointHasExplicitZ(nodePoint)
        ? nodePoint
        : null;

  return zPoint
    ? {
        ...xy,
        z: zPoint.z,
      }
    : xy;
}

function createPendingItems(params: {
  accessories: TechnicalAxonometricAccessory[];
  inventory: TechnicalPhysicalAccessoryInventory;
  nodes: TechnicalAxonometricNode[];
  scaleStatus: TechnicalAxonometricView["scaleStatus"];
  segments: TechnicalAxonometricSegment[];
}) {
  const pending: TechnicalAxonometricPendingItem[] = [];

  if (params.scaleStatus === "pending") {
    pending.push({
      id: "axonometric:scale",
      message: "Escala de planta pendiente; la vista usa coordenadas fuente.",
      sourceId: "scale",
      type: "scale",
    });
  }

  for (const node of params.nodes) {
    for (const reason of node.pendingReasons) {
      pending.push({
        id: `axonometric:node:${node.id}:${reason}`,
        message: reason,
        sourceId: node.id,
        type: "node",
      });
    }
  }

  for (const segment of params.segments) {
    for (const reason of segment.pendingReasons) {
      pending.push({
        id: `axonometric:segment:${segment.id}:${reason}`,
        message: reason,
        sourceId: segment.id,
        type: "segment",
      });
    }
  }

  for (const accessory of params.accessories) {
    for (const reason of accessory.pendingReasons) {
      pending.push({
        id: `axonometric:accessory:${accessory.id}:${reason}`,
        message: reason,
        sourceId: accessory.id,
        type: "accessory",
      });
    }
  }

  for (const item of params.inventory.pendingItems) {
    pending.push({
      id: `axonometric:physical-pending:${item.id}`,
      message: item.reason,
      sourceId: item.id,
      type: "accessory",
    });
  }

  return pending.sort(
    (first, second) =>
      first.type.localeCompare(second.type) ||
      first.sourceId.localeCompare(second.sourceId) ||
      first.message.localeCompare(second.message),
  );
}

function createPoint3D(
  point: Point2D,
  scaleMetersPerSourceUnit: number | null,
): TechnicalAxonometricPoint3D {
  const scale =
    scaleMetersPerSourceUnit !== null && Number.isFinite(scaleMetersPerSourceUnit)
      ? scaleMetersPerSourceUnit
      : 1;

  return {
    source: point,
    xMeters: point.x * scale,
    yMeters: point.y * scale,
    zMeters: pointHasExplicitZ(point) ? point.z as number : null,
  };
}

function projectPoint3D(
  point: TechnicalAxonometricPoint3D,
): TechnicalAxonometricProjectedPoint {
  const z = point.zMeters ?? 0;

  return {
    x: (point.xMeters - point.yMeters) * 0.8660254038,
    y: (point.xMeters + point.yMeters) * 0.5 - z * 1.35,
  };
}

function createProjectionTransform(
  rawPoints: Array<TechnicalAxonometricProjectedPoint | null>,
) {
  const points = rawPoints.filter(
    (point): point is TechnicalAxonometricProjectedPoint => Boolean(point),
  );

  if (points.length === 0) {
    return {
      project: (point: TechnicalAxonometricProjectedPoint) => point,
      viewBox: DEFAULT_VIEWBOX,
    };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = Math.max(maxX - minX + AXONOMETRIC_PADDING * 2, 120);
  const height = Math.max(maxY - minY + AXONOMETRIC_PADDING * 2, 120);

  return {
    project: (point: TechnicalAxonometricProjectedPoint) => ({
      x: roundLayout(point.x - minX + AXONOMETRIC_PADDING),
      y: roundLayout(point.y - minY + AXONOMETRIC_PADDING),
    }),
    viewBox: {
      height: roundLayout(height),
      minX: 0,
      minY: 0,
      width: roundLayout(width),
    },
  };
}

function midpointProjected(
  first: TechnicalAxonometricProjectedPoint,
  second: TechnicalAxonometricProjectedPoint,
) {
  return {
    x: roundLayout((first.x + second.x) / 2),
    y: roundLayout((first.y + second.y) / 2 - 6),
  };
}

function axonometricNodeKind(
  node: RouteNode,
  degree: number,
): TechnicalAxonometricNodeKind {
  if (node.kind === "supply") {
    return "supply";
  }

  if (node.kind === "appliance") {
    return "appliance";
  }

  return degree >= 3 ? "derivation" : "route";
}

function nodeLabel(
  node: RouteNode,
  equipmentById: Map<string, WorkbenchEquipment>,
  nodeLabels: Record<string, string>,
) {
  if (node.kind === "supply") {
    return "M";
  }

  if (node.kind === "appliance" && node.equipmentId) {
    const equipment = equipmentById.get(node.equipmentId);
    return equipment ? equipmentCode(equipment.type) : nodeLabels[node.id] ?? node.id;
  }

  return nodeLabels[node.id] ?? node.id;
}

function resolveNodePosition(
  nodeId: string,
  nodeById: Map<string, RouteNode>,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  const node = nodeById.get(nodeId);

  return node ? resolveRouteNodePosition(node, equipmentById) : null;
}

function physicalAccessoryDiameterLabel(item: TechnicalPhysicalAccessory) {
  const labels = item.diameters
    .map((entry) => entry.diameter)
    .filter((diameter): diameter is PipeDiameterReference => Boolean(diameter))
    .map(formatDiameterSymbol);

  return [...new Set(labels)].sort().join("/");
}

function formatDiameterSymbol(diameter: PipeDiameterReference | null) {
  if (!diameter) {
    return "diametro pendiente";
  }

  return diameter.externalDiameterMillimeters
    ? `Ø${formatNumber(diameter.externalDiameterMillimeters)}`
    : diameter.label;
}

function pointHasExplicitZ(point: Point2D) {
  return typeof point.z === "number" && Number.isFinite(point.z);
}

function sortNodes(nodes: RouteNode[]) {
  return [...nodes].sort(
    (first, second) =>
      nodeKindSortValue(first.kind) - nodeKindSortValue(second.kind) ||
      first.id.localeCompare(second.id),
  );
}

function sortRouteSegments(segments: ManualRouteNetwork["segments"]) {
  return [...segments].sort((first, second) => first.id.localeCompare(second.id));
}

function nodeKindSortValue(kind: RouteNode["kind"]) {
  if (kind === "supply") {
    return 0;
  }

  if (kind === "route") {
    return 1;
  }

  return 2;
}

function roundLayout(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatNumber(value: number) {
  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}
