import {
  demandUnitLabel,
  hasPendingDemand,
  type DemandUnit,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import {
  UNCONFIGURED_PIPE_SYSTEM,
  type PipeSegmentPipeContext,
  type PipeSystem,
  type PipeSystemIdentity,
  type PipeSystemResolution,
} from "@/lib/calculation/pipeSystem";
import {
  applianceNodesAreTerminal,
  buildEquipmentIndex,
  detectRouteCycle,
  distanceBetween,
  findRouteNodeByEquipment,
  getConnectedApplianceEquipmentIds,
  getRouteNeighbors,
  hasDuplicateNodeIds,
  hasDuplicateSegmentIds,
  hasDuplicateSegments,
  hasSegmentsWithMissingEndpoints,
  hasZeroLengthSegments,
  resolveRouteNodePosition,
  segmentConnects,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  RouteAccessoryEquivalentLengthSource,
  RouteAccessoryType,
  RouteNode,
  RouteSegment,
} from "@/lib/routing/types";

export type TechnicalCalculationStatus = "valid" | "incomplete" | "invalid";

export type TechnicalCalculationIssue = {
  accessoryId?: string;
  code:
    | "duplicate_ids"
    | "duplicate_segments"
    | "cycle"
    | "missing_scale"
    | "missing_supply"
    | "multiple_supply"
    | "missing_supply_node"
    | "missing_endpoints"
    | "missing_node_position"
    | "zero_length_segment"
    | "disconnected_component"
    | "appliance_not_terminal"
    | "appliance_unreachable"
    | "appliance_not_connected"
    | "missing_demand"
    | "mixed_demand_units"
    | "pending_equivalent_length";
  equipmentId?: string;
  message: string;
  nodeId?: string;
  segmentId?: string;
};

export type TechnicalSegmentAccessoryResult = {
  equivalentLengthResolution: PipeSystemResolution<number>;
  equivalentLengthMetersPerUnit: number | null;
  equivalentLengthSource: RouteAccessoryEquivalentLengthSource;
  id: string;
  quantity: number;
  segmentId: string;
  totalEquivalentLengthMeters: number | null;
  type: RouteAccessoryType;
};

export type TechnicalSegmentResult = {
  accessories: TechnicalSegmentAccessoryResult[];
  accessoryEquivalentLengthMeters: number | null;
  accumulatedFlow: number | null;
  accumulatedFlowUnit: DemandUnit | null;
  calculationLengthMeters: number | null;
  depth: number;
  downstreamApplianceIds: string[];
  drawingLength: number;
  fromNodeId: string;
  missingDemandEquipmentIds: string[];
  parentSegmentId: string | null;
  physicalLengthMeters: number | null;
  segmentId: string;
  toNodeId: string;
};

export type TechnicalCalculationResult = {
  connectedApplianceIds: string[];
  issues: TechnicalCalculationIssue[];
  nodeLabels: Record<string, string>;
  pipeSystem: PipeSystemIdentity;
  rootNodeId: string | null;
  segments: TechnicalSegmentResult[];
  status: TechnicalCalculationStatus;
  totals: {
    accumulatedFlow: number | null;
    accumulatedFlowUnit: DemandUnit | null;
    applianceCount: number;
    accessoryEquivalentLengthMeters: number | null;
    calculationLengthMeters: number | null;
    physicalLengthMeters: number | null;
    segmentCount: number;
  };
};

type OrientedSegment = {
  depth: number;
  fromNodeId: string;
  parentSegmentId: string | null;
  segment: RouteSegment;
  toNodeId: string;
};

export function calculateTechnicalTree(params: {
  equipment: WorkbenchEquipment[];
  minSegmentLengthSource: number;
  network: ManualRouteNetwork;
  pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
  pipeSystem?: PipeSystem;
  scaleMetersPerSourceUnit: number | null;
}): TechnicalCalculationResult {
  const pipeSystem = params.pipeSystem ?? UNCONFIGURED_PIPE_SYSTEM;
  const invalidIssues = validateNetworkStructure(params);

  if (invalidIssues.length > 0) {
    return createResult({
      connectedApplianceIds: [],
      issues: invalidIssues,
      nodeLabels: createNodeLabels(params.network, params.equipment, []),
      pipeSystem: pipeSystem.identity,
      rootNodeId: null,
      segments: [],
      status: "invalid",
      totals: createEmptyTotals(),
    });
  }

  const supply = params.equipment.find((item) => item.role === "supply") ?? null;
  const supplyNode = supply
    ? findRouteNodeByEquipment(params.network, supply.id)
    : null;

  if (!supplyNode) {
    return createResult({
      connectedApplianceIds: [],
      issues: [
        {
          code: "missing_supply_node",
          equipmentId: supply?.id,
          message: "No se encontro el nodo de alimentacion en la red confirmada.",
        },
      ],
      nodeLabels: createNodeLabels(params.network, params.equipment, []),
      pipeSystem: pipeSystem.identity,
      rootNodeId: null,
      segments: [],
      status: "invalid",
      totals: createEmptyTotals(),
    });
  }

  const orientation = orientNetworkFromRoot(params.network, supplyNode.id);

  if (orientation.unvisitedNodeIds.length > 0) {
    return createResult({
      connectedApplianceIds: [],
      issues: orientation.unvisitedNodeIds.map((nodeId) => ({
        code: "disconnected_component" as const,
        message: "Existe un componente desconectado de la alimentacion.",
        nodeId,
      })),
      nodeLabels: createNodeLabels(params.network, params.equipment, []),
      pipeSystem: pipeSystem.identity,
      rootNodeId: supplyNode.id,
      segments: [],
      status: "invalid",
      totals: createEmptyTotals(),
    });
  }

  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const equipmentById = buildEquipmentIndex(params.equipment);
  const childSegmentsByNodeId = createChildSegmentsByNodeId(
    orientation.segments,
  );
  const nodeLabels = createNodeLabels(
    params.network,
    params.equipment,
    orientation.segments,
  );
  const connectedApplianceIds = [
    ...getConnectedApplianceEquipmentIds(params.network, params.equipment),
  ].sort();
  const incompleteIssues: TechnicalCalculationIssue[] = createProjectCompletenessIssues(
    params,
    connectedApplianceIds,
  );
  const technicalSegments = orientation.segments.map((oriented) =>
    createTechnicalSegmentResult({
      childSegmentsByNodeId,
      equipmentById,
      nodeById,
      oriented,
      pipeContext: params.pipeContextBySegmentId?.[oriented.segment.id],
      pipeSystem,
      scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
    }),
  );

  for (const segment of technicalSegments) {
    for (const equipmentId of segment.missingDemandEquipmentIds) {
      incompleteIssues.push({
        code: "missing_demand",
        equipmentId,
        message: `Falta consumo en ${equipmentById.get(equipmentId)?.name ?? equipmentId}.`,
        segmentId: segment.segmentId,
      });
    }

    if (
      segment.accumulatedFlow === null &&
      segment.missingDemandEquipmentIds.length === 0 &&
      segment.downstreamApplianceIds.length > 0
    ) {
      incompleteIssues.push({
        code: "mixed_demand_units",
        message:
          "El tramo combina artefactos con unidades de consumo distintas.",
        segmentId: segment.segmentId,
      });
    }

    if (segment.accessoryEquivalentLengthMeters === null) {
      incompleteIssues.push(...createEquivalentLengthIssues(segment));
    }
  }

  if (params.scaleMetersPerSourceUnit === null) {
    incompleteIssues.push({
      code: "missing_scale",
      message: "Confirma la escala para obtener longitudes fisicas.",
    });
  }

  const totals = createTotals(technicalSegments, params.equipment);
  const status: TechnicalCalculationStatus =
    incompleteIssues.length > 0 ? "incomplete" : "valid";

  return createResult({
    connectedApplianceIds,
    issues: dedupeIssues(incompleteIssues),
    nodeLabels,
    pipeSystem: pipeSystem.identity,
    rootNodeId: supplyNode.id,
    segments: technicalSegments,
    status,
    totals,
  });
}

export function technicalCalculationStatusLabel(
  status: TechnicalCalculationStatus,
) {
  if (status === "valid") {
    return "Completo";
  }

  if (status === "incomplete") {
    return "Incompleto";
  }

  return "No calculable";
}

export function formatTechnicalFlow(
  value: number | null,
  unit: DemandUnit | null,
) {
  if (value === null || !unit) {
    return "Pendiente";
  }

  return `${formatCalculationNumber(value)} ${demandUnitLabel(unit)}`;
}

export function formatCalculationMeters(
  value: number | null,
  pendingLabel = "Escala pendiente",
) {
  if (value === null) {
    return pendingLabel;
  }

  return `${formatCalculationNumber(value)} m`;
}

export function routeAccessoryTypeLabel(type: RouteAccessoryType) {
  if (type === "elbow") {
    return "Codo";
  }

  if (type === "tee") {
    return "Tee";
  }

  if (type === "valve") {
    return "Valvula";
  }

  return "Otro";
}

export function equivalentLengthSourceLabel(
  source: RouteAccessoryEquivalentLengthSource,
) {
  if (source === "manual") {
    return "Manual";
  }

  if (source === "pipe_system") {
    return "PipeSystem";
  }

  return "Pendiente";
}

function validateNetworkStructure(params: {
  equipment: WorkbenchEquipment[];
  minSegmentLengthSource: number;
  network: ManualRouteNetwork;
}): TechnicalCalculationIssue[] {
  const issues: TechnicalCalculationIssue[] = [];
  const supplyEquipment = params.equipment.filter((item) => item.role === "supply");
  const supply = supplyEquipment[0] ?? null;

  if (params.network.segments.length === 0) {
    issues.push({
      code: "disconnected_component",
      message: "Primero acepta un trazado para calcular.",
    });
  }

  if (supplyEquipment.length === 0) {
    issues.push({
      code: "missing_supply",
      message: "Falta colocar una alimentacion.",
    });
  }

  if (supplyEquipment.length > 1) {
    issues.push({
      code: "multiple_supply",
      message: "Hay mas de una alimentacion colocada.",
    });
  }

  if (supply && !findRouteNodeByEquipment(params.network, supply.id)) {
    issues.push({
      code: "missing_supply_node",
      equipmentId: supply.id,
      message: "La red confirmada no contiene el nodo de alimentacion.",
    });
  }

  if (
    hasDuplicateNodeIds(params.network) ||
    hasDuplicateSegmentIds(params.network)
  ) {
    issues.push({
      code: "duplicate_ids",
      message: "La red contiene IDs duplicados.",
    });
  }

  if (hasSegmentsWithMissingEndpoints(params.network)) {
    issues.push({
      code: "missing_endpoints",
      message: "La red contiene tramos con extremos inexistentes.",
    });
  }

  if (hasDuplicateSegments(params.network)) {
    issues.push({
      code: "duplicate_segments",
      message: "La red contiene tramos duplicados.",
    });
  }

  if (detectRouteCycle(params.network)) {
    issues.push({
      code: "cycle",
      message: "La red contiene un ciclo.",
    });
  }

  if (!applianceNodesAreTerminal(params.network)) {
    issues.push({
      code: "appliance_not_terminal",
      message: "Cada artefacto conectado debe quedar como terminal.",
    });
  }

  if (
    hasZeroLengthSegments(
      params.network,
      params.equipment,
      params.minSegmentLengthSource,
    )
  ) {
    issues.push({
      code: "zero_length_segment",
      message: "La red contiene un tramo sin longitud.",
    });
  }

  issues.push(...createMissingPositionIssues(params.network, params.equipment));

  return issues;
}

function orientNetworkFromRoot(
  network: ManualRouteNetwork,
  rootNodeId: string,
) {
  const nodeIds = new Set(network.nodes.map((node) => node.id));
  const neighbors = getRouteNeighbors(network);
  const visited = new Set<string>([rootNodeId]);
  const queue: Array<{
    depth: number;
    nodeId: string;
    parentSegmentId: string | null;
  }> = [{ depth: 0, nodeId: rootNodeId, parentSegmentId: null }];
  const orientedSegments: OrientedSegment[] = [];

  while (queue.length > 0) {
    const current = queue.shift() as {
      depth: number;
      nodeId: string;
      parentSegmentId: string | null;
    };
    const nextNodeIds = [...(neighbors.get(current.nodeId) ?? [])]
      .filter((nodeId) => !visited.has(nodeId))
      .sort((first, second) => first.localeCompare(second));

    for (const nextNodeId of nextNodeIds) {
      const segment =
        network.segments
          .filter((item) => segmentConnects(item, current.nodeId, nextNodeId))
          .sort((first, second) => first.id.localeCompare(second.id))[0] ?? null;

      if (!segment) {
        continue;
      }

      visited.add(nextNodeId);
      orientedSegments.push({
        depth: current.depth + 1,
        fromNodeId: current.nodeId,
        parentSegmentId: current.parentSegmentId,
        segment,
        toNodeId: nextNodeId,
      });
      queue.push({
        depth: current.depth + 1,
        nodeId: nextNodeId,
        parentSegmentId: segment.id,
      });
    }
  }

  return {
    segments: orientedSegments.sort(
      (first, second) =>
        first.depth - second.depth ||
        first.fromNodeId.localeCompare(second.fromNodeId) ||
        first.toNodeId.localeCompare(second.toNodeId) ||
        first.segment.id.localeCompare(second.segment.id),
    ),
    unvisitedNodeIds: [...nodeIds]
      .filter(
        (nodeId) =>
          !visited.has(nodeId) && (neighbors.get(nodeId)?.size ?? 0) > 0,
      )
      .sort(),
  };
}

function createTechnicalSegmentResult(params: {
  childSegmentsByNodeId: Map<string, OrientedSegment[]>;
  equipmentById: Map<string, WorkbenchEquipment>;
  nodeById: Map<string, RouteNode>;
  oriented: OrientedSegment;
  pipeContext: PipeSegmentPipeContext | undefined;
  pipeSystem: PipeSystem;
  scaleMetersPerSourceUnit: number | null;
}): TechnicalSegmentResult {
  const downstreamApplianceIds = collectDownstreamApplianceIds(
    params.oriented.toNodeId,
    params.nodeById,
    params.childSegmentsByNodeId,
  );
  const flow = calculateAccumulatedFlow(
    downstreamApplianceIds,
    params.equipmentById,
  );
  const from = params.nodeById.get(params.oriented.fromNodeId);
  const to = params.nodeById.get(params.oriented.toNodeId);
  const fromPoint = from
    ? resolveRouteNodePosition(from, params.equipmentById)
    : null;
  const toPoint = to ? resolveRouteNodePosition(to, params.equipmentById) : null;
  const drawingLength =
    fromPoint && toPoint ? distanceBetween(fromPoint, toPoint) : 0;
  const physicalLengthMeters =
    params.scaleMetersPerSourceUnit === null
      ? null
      : drawingLength * params.scaleMetersPerSourceUnit;
  const accessoryContext = {
    accumulatedFlow: flow.value,
    accumulatedFlowUnit: flow.unit,
    drawingLength,
    id: params.oriented.segment.id,
    physicalLengthMeters,
  };
  const accessories = createTechnicalAccessoryResults({
    pipeContext: params.pipeContext,
    pipeSystem: params.pipeSystem,
    segment: params.oriented.segment,
    segmentContext: accessoryContext,
  });
  const accessoryEquivalentLengthMeters =
    calculateAccessoryEquivalentLength(accessories);
  const calculationLengthMeters =
    physicalLengthMeters !== null && accessoryEquivalentLengthMeters !== null
      ? physicalLengthMeters + accessoryEquivalentLengthMeters
      : null;

  return {
    accessories,
    accessoryEquivalentLengthMeters,
    accumulatedFlow: flow.value,
    accumulatedFlowUnit: flow.unit,
    calculationLengthMeters,
    depth: params.oriented.depth,
    downstreamApplianceIds,
    drawingLength,
    fromNodeId: params.oriented.fromNodeId,
    missingDemandEquipmentIds: flow.missingEquipmentIds,
    parentSegmentId: params.oriented.parentSegmentId,
    physicalLengthMeters,
    segmentId: params.oriented.segment.id,
    toNodeId: params.oriented.toNodeId,
  };
}

function createTechnicalAccessoryResults(params: {
  pipeContext: PipeSegmentPipeContext | undefined;
  pipeSystem: PipeSystem;
  segment: RouteSegment;
  segmentContext: {
    accumulatedFlow: number | null;
    accumulatedFlowUnit: DemandUnit | null;
    drawingLength: number;
    id: string;
    physicalLengthMeters: number | null;
  };
}): TechnicalSegmentAccessoryResult[] {
  return (params.segment.accessories ?? [])
    .map((accessory) => {
      const quantity = normalizeAccessoryQuantity(accessory.quantity);
      const equivalentLengthResolution = resolveAccessoryEquivalentLength({
        accessory: {
          id: accessory.id,
          quantity,
          type: accessory.type,
        },
        declaredEquivalentLengthMetersPerUnit:
          accessory.equivalentLengthMetersPerUnit,
        equivalentLengthSource: accessory.equivalentLengthSource,
        pipeContext: params.pipeContext,
        pipeSystem: params.pipeSystem,
        segment: params.segmentContext,
      });
      const equivalentLengthMetersPerUnit =
        equivalentLengthResolution.status === "resolved"
          ? equivalentLengthResolution.value
          : null;

      return {
        equivalentLengthResolution,
        equivalentLengthMetersPerUnit,
        equivalentLengthSource: accessory.equivalentLengthSource,
        id: accessory.id,
        quantity,
        segmentId: params.segment.id,
        totalEquivalentLengthMeters:
          equivalentLengthMetersPerUnit === null
            ? null
            : equivalentLengthMetersPerUnit * quantity,
        type: accessory.type,
      };
    })
    .sort(
      (first, second) =>
        first.type.localeCompare(second.type) ||
        first.id.localeCompare(second.id),
    );
}

function resolveAccessoryEquivalentLength(params: {
  accessory: {
    id: string;
    quantity: number;
    type: RouteAccessoryType;
  };
  declaredEquivalentLengthMetersPerUnit: number | null;
  equivalentLengthSource: RouteAccessoryEquivalentLengthSource;
  pipeContext: PipeSegmentPipeContext | undefined;
  pipeSystem: PipeSystem;
  segment: {
    accumulatedFlow: number | null;
    accumulatedFlowUnit: DemandUnit | null;
    drawingLength: number;
    id: string;
    physicalLengthMeters: number | null;
  };
}): PipeSystemResolution<number> {
  if (params.equivalentLengthSource === "manual") {
    const value = normalizeEquivalentLengthMetersPerUnit(
      params.declaredEquivalentLengthMetersPerUnit,
    );

    if (value === null) {
      return {
        reason: "Falta longitud equivalente manual del accesorio.",
        status: "unresolved",
      };
    }

    return {
      explanation: "Longitud equivalente indicada manualmente.",
      status: "resolved",
      value,
    };
  }

  if (params.equivalentLengthSource === "pipe_system") {
    const resolution = params.pipeSystem.resolveAccessoryEquivalentLength({
      accessory: params.accessory,
      pipe: params.pipeContext,
      segment: params.segment,
    });

    return sanitizeEquivalentLengthResolution(resolution);
  }

  return {
    reason: "Longitud equivalente pendiente de resolver.",
    status: "unresolved",
  };
}

function sanitizeEquivalentLengthResolution(
  resolution: PipeSystemResolution<number>,
): PipeSystemResolution<number> {
  if (resolution.status !== "resolved") {
    return resolution;
  }

  const value = normalizeEquivalentLengthMetersPerUnit(resolution.value);

  if (value === null) {
    return {
      reason:
        "El sistema de canerias devolvio una longitud equivalente invalida.",
      status: "unresolved",
    };
  }

  return {
    ...resolution,
    value,
  };
}

function calculateAccessoryEquivalentLength(
  accessories: TechnicalSegmentAccessoryResult[],
) {
  if (
    accessories.some(
      (accessory) => accessory.totalEquivalentLengthMeters === null,
    )
  ) {
    return null;
  }

  return accessories.reduce(
    (sum, accessory) => sum + (accessory.totalEquivalentLengthMeters ?? 0),
    0,
  );
}

function normalizeAccessoryQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  return quantity;
}

function normalizeEquivalentLengthMetersPerUnit(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function collectDownstreamApplianceIds(
  nodeId: string,
  nodeById: Map<string, RouteNode>,
  childSegmentsByNodeId: Map<string, OrientedSegment[]>,
) {
  const node = nodeById.get(nodeId);
  const ids: string[] = [];

  if (node?.kind === "appliance" && node.equipmentId) {
    ids.push(node.equipmentId);
  }

  for (const child of childSegmentsByNodeId.get(nodeId) ?? []) {
    ids.push(
      ...collectDownstreamApplianceIds(
        child.toNodeId,
        nodeById,
        childSegmentsByNodeId,
      ),
    );
  }

  return ids;
}

function calculateAccumulatedFlow(
  downstreamApplianceIds: string[],
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  const missingEquipmentIds: string[] = [];
  const units = new Set<DemandUnit>();
  let value = 0;

  for (const equipmentId of downstreamApplianceIds) {
    const equipment = equipmentById.get(equipmentId);

    if (!equipment || hasPendingDemand(equipment)) {
      missingEquipmentIds.push(equipmentId);
      continue;
    }

    value += equipment.demandValue as number;
    units.add(equipment.demandUnit as DemandUnit);
  }

  if (missingEquipmentIds.length > 0 || units.size !== 1) {
    return {
      missingEquipmentIds,
      unit: null,
      value: null,
    };
  }

  return {
    missingEquipmentIds,
    unit: [...units][0] ?? null,
    value,
  };
}

function createChildSegmentsByNodeId(orientedSegments: OrientedSegment[]) {
  const map = new Map<string, OrientedSegment[]>();

  for (const segment of orientedSegments) {
    const current = map.get(segment.fromNodeId) ?? [];
    current.push(segment);
    map.set(segment.fromNodeId, current);
  }

  for (const [nodeId, segments] of map) {
    map.set(
      nodeId,
      segments.sort(
        (first, second) =>
          first.toNodeId.localeCompare(second.toNodeId) ||
          first.segment.id.localeCompare(second.segment.id),
      ),
    );
  }

  return map;
}

function createProjectCompletenessIssues(
  params: {
    equipment: WorkbenchEquipment[];
    network: ManualRouteNetwork;
    scaleMetersPerSourceUnit: number | null;
  },
  connectedApplianceIds: string[],
) {
  const connected = new Set(connectedApplianceIds);

  return params.equipment
    .filter((item) => item.role === "appliance")
    .filter((item) => !connected.has(item.id))
    .map((item) => ({
      code: "appliance_not_connected" as const,
      equipmentId: item.id,
      message: `Falta conexion confirmada en ${item.name}.`,
    }));
}

function createEquivalentLengthIssues(segment: TechnicalSegmentResult) {
  const unresolvedAccessories = segment.accessories.filter(
    (accessory) => accessory.equivalentLengthResolution.status !== "resolved",
  );

  if (unresolvedAccessories.length === 0) {
    return [
      {
        code: "pending_equivalent_length" as const,
        message: "Longitud equivalente pendiente de resolver.",
        segmentId: segment.segmentId,
      },
    ];
  }

  return unresolvedAccessories.map((accessory) => {
    const resolution = accessory.equivalentLengthResolution;

    return {
      accessoryId: accessory.id,
      code: "pending_equivalent_length" as const,
      message:
        resolution.status === "resolved"
          ? "Longitud equivalente pendiente de resolver."
          : resolution.status === "unsupported"
            ? `Accesorio no soportado: ${resolution.reason}`
            : resolution.reason,
      segmentId: segment.segmentId,
    };
  });
}

function createMissingPositionIssues(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  const equipmentById = buildEquipmentIndex(equipment);
  const issues: TechnicalCalculationIssue[] = [];

  for (const node of network.nodes) {
    if (!resolveRouteNodePosition(node, equipmentById)) {
      issues.push({
        code: "missing_node_position",
        message: "No se pudo resolver la posicion de un nodo de la red.",
        nodeId: node.id,
      });
    }
  }

  return issues;
}

function createNodeLabels(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
  orientedSegments: OrientedSegment[],
) {
  const equipmentById = buildEquipmentIndex(equipment);
  const labels: Record<string, string> = {};
  let routeNodeIndex = 0;

  for (const node of network.nodes) {
    if (node.kind === "supply") {
      labels[node.id] = "M";
    }

    if (node.kind === "appliance" && node.equipmentId) {
      labels[node.id] = equipmentById.get(node.equipmentId)?.name ?? node.equipmentId;
    }
  }

  for (const nodeId of orientedSegments.flatMap((segment) => [
    segment.fromNodeId,
    segment.toNodeId,
  ])) {
    const node = network.nodes.find((item) => item.id === nodeId);

    if (!node || node.kind !== "route" || labels[node.id]) {
      continue;
    }

    routeNodeIndex += 1;
    labels[node.id] = `N${routeNodeIndex}`;
  }

  for (const node of network.nodes) {
    if (!labels[node.id]) {
      routeNodeIndex += 1;
      labels[node.id] = node.kind === "route" ? `N${routeNodeIndex}` : node.id;
    }
  }

  return labels;
}

function createTotals(
  segments: TechnicalSegmentResult[],
  equipment: WorkbenchEquipment[],
) {
  const connectedApplianceIds = new Set(
    segments.flatMap((segment) => segment.downstreamApplianceIds),
  );
  const appliances = equipment.filter(
    (item) => item.role === "appliance" && connectedApplianceIds.has(item.id),
  );
  const totalFlow = calculateAccumulatedFlow(
    appliances.map((item) => item.id).sort(),
    buildEquipmentIndex(equipment),
  );
  const physicalLengthMeters = segments.every(
    (segment) => segment.physicalLengthMeters !== null,
  )
    ? segments.reduce(
        (sum, segment) => sum + (segment.physicalLengthMeters ?? 0),
        0,
      )
    : null;
  const accessoryEquivalentLengthMeters = segments.every(
    (segment) => segment.accessoryEquivalentLengthMeters !== null,
  )
    ? segments.reduce(
        (sum, segment) => sum + (segment.accessoryEquivalentLengthMeters ?? 0),
        0,
      )
    : null;
  const calculationLengthMeters =
    physicalLengthMeters !== null && accessoryEquivalentLengthMeters !== null
      ? physicalLengthMeters + accessoryEquivalentLengthMeters
      : null;

  return {
    accumulatedFlow: totalFlow.value,
    accumulatedFlowUnit: totalFlow.unit,
    applianceCount: appliances.length,
    accessoryEquivalentLengthMeters,
    calculationLengthMeters,
    physicalLengthMeters,
    segmentCount: segments.length,
  };
}

function createEmptyTotals(): TechnicalCalculationResult["totals"] {
  return {
    accumulatedFlow: null,
    accumulatedFlowUnit: null,
    applianceCount: 0,
    accessoryEquivalentLengthMeters: null,
    calculationLengthMeters: null,
    physicalLengthMeters: null,
    segmentCount: 0,
  };
}

function createResult(
  result: TechnicalCalculationResult,
): TechnicalCalculationResult {
  return {
    ...result,
    issues: dedupeIssues(result.issues),
    segments: result.segments.sort(
      (first, second) =>
        first.depth - second.depth ||
        first.fromNodeId.localeCompare(second.fromNodeId) ||
        first.toNodeId.localeCompare(second.toNodeId) ||
        first.segmentId.localeCompare(second.segmentId),
    ),
  };
}

function dedupeIssues(issues: TechnicalCalculationIssue[]) {
  const seen = new Set<string>();
  const next: TechnicalCalculationIssue[] = [];

  for (const issue of issues) {
    const key = [
      issue.code,
      issue.accessoryId ?? "",
      issue.equipmentId ?? "",
      issue.nodeId ?? "",
      issue.segmentId ?? "",
      issue.message,
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(issue);
  }

  return next;
}

function formatCalculationNumber(value: number) {
  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}
