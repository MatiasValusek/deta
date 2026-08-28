import {
  demandUnitLabel,
  type DemandUnit,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import {
  createDemandNormalizationIndex,
  normalizeEquipmentDemands,
  type EquipmentDemandNormalization,
} from "@/lib/calculation/demandNormalization";
import {
  projectGasConfigOrDefault,
  type ProjectGasConfig,
} from "@/lib/calculation/projectGas";
import {
  UNCONFIGURED_PIPE_SYSTEM,
  type PipeDiameterReference,
  type PipeSegmentSizingResult,
  type PipeSegmentPipeContext,
  type PipeSystem,
  type PipeSystemIdentity,
  type PipeSystemResolution,
  type PipeSystemResolutionStatus,
} from "@/lib/calculation/pipeSystem";
import {
  solveTechnicalNetworkSizing,
  type TechnicalNetworkSizingResult,
  type TechnicalNetworkSizingSegmentResult,
} from "@/lib/calculation/technicalNetworkSizing";
import {
  solveTechnicalNetworkSizingWithTransitions,
  type TechnicalTransitionAwareNetworkSizingResult,
} from "@/lib/calculation/technicalNetworkSizingWithTransitions";
import {
  validateProfessionalDiameterAdoption,
  type AdoptedDiameterDecision,
  type ProfessionalDiameterAdoptionResult,
} from "@/lib/calculation/professionalDiameterAdoption";
import type { TechnicalRouteAccessoryResolution } from "@/lib/calculation/technicalRouteAccessories";
import type { DiameterTransitionDecision } from "@/lib/calculation/diameterTransitionProposals";
import {
  applianceNodesAreTerminal,
  buildEquipmentIndex,
  detectRouteCycle,
  findRouteNodeByEquipment,
  getConnectedApplianceEquipmentIds,
  getRouteNeighbors,
  hasDuplicateNodeIds,
  hasDuplicateSegmentIds,
  hasDuplicateSegments,
  hasSegmentsWithMissingEndpoints,
  hasZeroLengthSegments,
  resolveRouteSegmentPath,
  resolveRouteNodePosition,
  routeSegmentHorizontalLengthSource,
  routeSegmentPhysicalLengthMeters,
  segmentConnects,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  RouteAccessoryEquivalentLengthSource,
  RouteAccessoryType,
  RouteNode,
  RouteSegment,
} from "@/lib/routing/types";

export type {
  TechnicalNetworkSizingResult,
  TechnicalNetworkSizingSegmentResult,
} from "@/lib/calculation/technicalNetworkSizing";

export type {
  TechnicalTransitionAwareNetworkSizingResult,
  TechnicalTransitionAwareNetworkSizingSegmentResult,
} from "@/lib/calculation/technicalNetworkSizingWithTransitions";

export type {
  TechnicalRouteAccessoryContribution,
  TechnicalRouteAccessoryResolution,
} from "@/lib/calculation/technicalRouteAccessories";

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
    | "unresolved_demand_normalization"
    | "mixed_demand_units"
    | "pending_equivalent_length"
    | "pending_diameter_sizing"
    | "pending_route_sizing_length"
    | "pending_adopted_diameter_validation"
    | "incompatible_adopted_diameter"
    | "unresolved_adopted_diameter";
  equipmentId?: string;
  message: string;
  nodeId?: string;
  segmentId?: string;
};

export type TechnicalSegmentAccessoryResult = {
  catalogCode?: string;
  catalogFamilyId?: string;
  equivalentLengthResolution: PipeSystemResolution<number>;
  equivalentLengthMetersPerUnit: number | null;
  equivalentLengthSource: RouteAccessoryEquivalentLengthSource;
  id: string;
  quantity: number;
  segmentId: string;
  totalEquivalentLengthMeters: number | null;
  type: RouteAccessoryType;
};

export type TechnicalSegmentDimensioningResult = {
  accessories: TechnicalSegmentAccessoryResult[];
  accessoryEquivalentLengthMeters: number;
  calculatedDiameter: PipeDiameterReference;
  calculationLengthMeters: number;
  candidateCount: number;
  physicalLengthMeters: number;
  sizingResult: PipeSegmentSizingResult;
};

export type TechnicalRoute = {
  id: string;
  nodeIds: string[];
  physicalLengthMeters: number | null;
  reason?: string;
  segmentIds: string[];
  status: "resolved" | "unresolved";
  terminalEquipmentId: string;
  terminalNodeId: string;
};

export type TechnicalSegmentGoverningRoute = {
  nodeIds: string[];
  physicalLengthMeters: number;
  routeId: string;
  segmentIds: string[];
  terminalEquipmentId: string;
  terminalNodeId: string;
  tiedRouteIds: string[];
};

export type TechnicalSegmentSizingBasis = {
  governingRouteAccessoryEquivalentLengthMeters: number | null;
  governingRoutePhysicalLengthMeters: number | null;
  reasons: string[];
  routeAccessoryResolutionId: string | null;
  sizingLengthMeters: number | null;
  status: PipeSystemResolutionStatus;
};

export type TechnicalSegmentResult = {
  accessories: TechnicalSegmentAccessoryResult[];
  accessoryEquivalentLengthMeters: number | null;
  accumulatedFlow: number | null;
  accumulatedFlowUnit: DemandUnit | null;
  calculatedDiameter: PipeDiameterReference | null;
  calculationLengthMeters: number | null;
  consumptionM3h?: number | null;
  depth: number;
  dimensioningResolution: PipeSystemResolution<TechnicalSegmentDimensioningResult>;
  downstreamApplianceIds: string[];
  drawingLength: number;
  fromNodeId: string;
  governingRoute: TechnicalSegmentGoverningRoute | null;
  governingRoutePhysicalLengthMeters: number | null;
  governingRouteResolution: PipeSystemResolution<TechnicalSegmentGoverningRoute>;
  missingDemandEquipmentIds: string[];
  parentSegmentId: string | null;
  physicalLengthMeters: number | null;
  provisionalDiameter?: PipeDiameterReference | null;
  provisionalDiameterExplanation?: string | null;
  routeSizingBasis: TechnicalSegmentSizingBasis;
  segmentId: string;
  segmentPhysicalLengthMeters: number | null;
  terminalRouteIds: string[];
  toNodeId: string;
  unresolvedDemandEquipmentIds: string[];
};

export type TechnicalCalculationResult = {
  connectedApplianceIds: string[];
  demandNormalizations: EquipmentDemandNormalization[];
  issues: TechnicalCalculationIssue[];
  networkSizing: TechnicalNetworkSizingResult | null;
  nodeLabels: Record<string, string>;
  pipeSystem: PipeSystemIdentity;
  professionalDiameterAdoption: ProfessionalDiameterAdoptionResult | null;
  projectGas: ProjectGasConfig | null;
  rootNodeId: string | null;
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  segments: TechnicalSegmentResult[];
  status: TechnicalCalculationStatus;
  technicalRoutes: TechnicalRoute[];
  totals: {
    accumulatedFlow: number | null;
    accumulatedFlowUnit: DemandUnit | null;
    applianceCount: number;
    accessoryEquivalentLengthMeters: number | null;
    calculationLengthMeters: number | null;
    dimensionedSegmentCount: number;
    pendingDimensioningSegmentCount: number;
    physicalLengthMeters: number | null;
    segmentCount: number;
  };
  transitionAwareNetworkSizing: TechnicalTransitionAwareNetworkSizingResult | null;
};

type OrientedSegment = {
  depth: number;
  fromNodeId: string;
  parentSegmentId: string | null;
  segment: RouteSegment;
  toNodeId: string;
};

const ROUTE_LENGTH_EPSILON = 0.000001;

export function calculateTechnicalTree(params: {
  adoptedDiameterDecisions?: AdoptedDiameterDecision[];
  diameterTransitionDecisions?: DiameterTransitionDecision[];
  equipment: WorkbenchEquipment[];
  minSegmentLengthSource: number;
  network: ManualRouteNetwork;
  pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
  pipeSystem?: PipeSystem;
  projectGas?: ProjectGasConfig | null;
  scaleMetersPerSourceUnit: number | null;
}): TechnicalCalculationResult {
  const pipeSystem = params.pipeSystem ?? UNCONFIGURED_PIPE_SYSTEM;
  const projectGas = projectGasConfigOrDefault(params.projectGas);
  const demandNormalizations = normalizeEquipmentDemands(
    params.equipment,
    projectGas,
  );
  const demandNormalizationByEquipmentId = createDemandNormalizationIndex(
    demandNormalizations,
  );
  const invalidIssues = validateNetworkStructure(params);

  if (invalidIssues.length > 0) {
    return createResult({
      connectedApplianceIds: [],
      demandNormalizations,
      issues: invalidIssues,
      networkSizing: null,
      nodeLabels: createNodeLabels(params.network, params.equipment, []),
      pipeSystem: pipeSystem.identity,
      professionalDiameterAdoption: null,
      projectGas,
      rootNodeId: null,
      routeAccessoryResolutions: {},
      segments: [],
      status: "invalid",
      technicalRoutes: [],
      totals: createEmptyTotals(),
      transitionAwareNetworkSizing: null,
    });
  }

  const supply = params.equipment.find((item) => item.role === "supply") ?? null;
  const supplyNode = supply
    ? findRouteNodeByEquipment(params.network, supply.id)
    : null;

  if (!supplyNode) {
    return createResult({
      connectedApplianceIds: [],
      demandNormalizations,
      issues: [
        {
          code: "missing_supply_node",
          equipmentId: supply?.id,
          message: "No se encontro el nodo de alimentacion en la red confirmada.",
        },
      ],
      networkSizing: null,
      nodeLabels: createNodeLabels(params.network, params.equipment, []),
      pipeSystem: pipeSystem.identity,
      professionalDiameterAdoption: null,
      projectGas,
      rootNodeId: null,
      routeAccessoryResolutions: {},
      segments: [],
      status: "invalid",
      technicalRoutes: [],
      totals: createEmptyTotals(),
      transitionAwareNetworkSizing: null,
    });
  }

  const orientation = orientNetworkFromRoot(params.network, supplyNode.id);

  if (orientation.unvisitedNodeIds.length > 0) {
    return createResult({
      connectedApplianceIds: [],
      demandNormalizations,
      issues: orientation.unvisitedNodeIds.map((nodeId) => ({
        code: "disconnected_component" as const,
        message: "Existe un componente desconectado de la alimentacion.",
        nodeId,
      })),
      networkSizing: null,
      nodeLabels: createNodeLabels(params.network, params.equipment, []),
      pipeSystem: pipeSystem.identity,
      professionalDiameterAdoption: null,
      projectGas,
      rootNodeId: supplyNode.id,
      routeAccessoryResolutions: {},
      segments: [],
      status: "invalid",
      technicalRoutes: [],
      totals: createEmptyTotals(),
      transitionAwareNetworkSizing: null,
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
  const segmentLengthById = createSegmentPhysicalLengthIndex({
    equipmentById,
    nodeById,
    orientedSegments: orientation.segments,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
  });
  const technicalRoutes = createTechnicalRoutes({
    nodeById,
    orientedSegments: orientation.segments,
    rootNodeId: supplyNode.id,
    segmentLengthById,
  });
  const routesBySegmentId = createRoutesBySegmentId(technicalRoutes);
  const governingRouteBySegmentId =
    createGoverningRouteBySegmentId(routesBySegmentId);
  const technicalSegments = orientation.segments.map((oriented) =>
    createTechnicalSegmentResult({
      childSegmentsByNodeId,
      demandNormalizationByEquipmentId,
      equipmentById,
      governingRouteResolution:
        governingRouteBySegmentId.get(oriented.segment.id) ??
        createMissingSegmentRouteResolution(oriented.segment.id),
      nodeById,
      oriented,
      pipeContext: params.pipeContextBySegmentId?.[oriented.segment.id],
      pipeSystem,
      scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
      terminalRouteIds: (routesBySegmentId.get(oriented.segment.id) ?? []).map(
        (route) => route.id,
      ),
    }),
  );
  const networkSizing = solveTechnicalNetworkSizing({
    pipeContextBySegmentId: params.pipeContextBySegmentId,
    pipeSystem,
    routeSegments: params.network.segments,
    routes: technicalRoutes,
    segments: technicalSegments,
  });
  const transitionAwareNetworkSizing = solveTechnicalNetworkSizingWithTransitions({
    baselineSizing: networkSizing,
    decisions: params.diameterTransitionDecisions ?? [],
    equipment: params.equipment,
    network: params.network,
    pipeContextBySegmentId: params.pipeContextBySegmentId,
    pipeSystem,
    routeSegments: params.network.segments,
    routes: technicalRoutes,
    segments: technicalSegments,
  });
  const professionalDiameterAdoption = validateProfessionalDiameterAdoption({
    calculatedSizing: transitionAwareNetworkSizing,
    decisions: params.adoptedDiameterDecisions ?? [],
    diameterTransitionDecisions: params.diameterTransitionDecisions ?? [],
    equipment: params.equipment,
    network: params.network,
    pipeContextBySegmentId: params.pipeContextBySegmentId,
    pipeSystem,
    routeSegments: params.network.segments,
    routes: technicalRoutes,
    segments: technicalSegments,
  });
  const networkSizingSegmentById = new Map(
    networkSizing.segments.map((segment) => [segment.segmentId, segment]),
  );
  const routeAccessoryResolutions = networkSizing.routeAccessoryResolutions;
  const technicalSegmentsWithRouteSizing = technicalSegments.map((segment) => {
    const networkSizingSegment =
      networkSizingSegmentById.get(segment.segmentId) ?? null;
    const routeSizingBasis = createRouteSizingBasisFromNetworkSizing({
      governingRouteResolution: segment.governingRouteResolution,
      networkSizingSegment,
    });
    const consumptionM3h = resolveSegmentConsumptionM3h({
      networkSizingSegment,
      segment,
    });

    return {
      ...segment,
      calculationLengthMeters: routeSizingBasis.sizingLengthMeters,
      consumptionM3h,
      provisionalDiameter:
        networkSizingSegment?.status === "resolved"
          ? networkSizingSegment.calculatedDiameter
          : null,
      provisionalDiameterExplanation:
        networkSizingSegment?.status === "resolved"
          ? networkSizingSegment.explanation
          : networkSizingSegment?.issues[0]?.message ?? null,
      routeSizingBasis,
    };
  });

  for (const segment of technicalSegmentsWithRouteSizing) {
    for (const equipmentId of segment.missingDemandEquipmentIds) {
      incompleteIssues.push({
        code: "missing_demand",
        equipmentId,
        message: `Falta consumo en ${equipmentById.get(equipmentId)?.name ?? equipmentId}.`,
        segmentId: segment.segmentId,
      });
    }

    for (const equipmentId of segment.unresolvedDemandEquipmentIds) {
      const normalization = demandNormalizationByEquipmentId.get(equipmentId);
      const equipment = equipmentById.get(equipmentId);

      incompleteIssues.push({
        code: "unresolved_demand_normalization",
        equipmentId,
        message:
          `${equipment?.name ?? equipmentId}: ` +
          (normalization?.reason ??
            "No se pudo normalizar el consumo del artefacto a m3/h."),
        segmentId: segment.segmentId,
      });
    }

    if (
      segment.accumulatedFlow === null &&
      segment.missingDemandEquipmentIds.length === 0 &&
      segment.unresolvedDemandEquipmentIds.length === 0 &&
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

    if (segment.dimensioningResolution.status !== "resolved") {
      incompleteIssues.push(createDimensioningIssue(segment));
    }

    if (segment.routeSizingBasis.status !== "resolved") {
      incompleteIssues.push(createRouteSizingIssue(segment));
    }
  }

  if ((params.adoptedDiameterDecisions?.length ?? 0) > 0) {
    incompleteIssues.push(
      ...createProfessionalDiameterAdoptionIssues(professionalDiameterAdoption),
    );
  }

  if (params.scaleMetersPerSourceUnit === null) {
    incompleteIssues.push({
      code: "missing_scale",
      message: "Confirma la escala para obtener longitudes fisicas.",
    });
  }

  const totals = createTotals({
    demandNormalizationByEquipmentId,
    equipment: params.equipment,
    segments: technicalSegmentsWithRouteSizing,
  });
  const status: TechnicalCalculationStatus =
    incompleteIssues.length > 0 ? "incomplete" : "valid";

  return createResult({
    connectedApplianceIds,
    demandNormalizations,
    issues: dedupeIssues(incompleteIssues),
    nodeLabels,
    pipeSystem: pipeSystem.identity,
    professionalDiameterAdoption,
    projectGas,
    rootNodeId: supplyNode.id,
    routeAccessoryResolutions,
    networkSizing,
    segments: technicalSegmentsWithRouteSizing,
    status,
    technicalRoutes,
    totals,
    transitionAwareNetworkSizing,
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

  return `${formatFlowNumber(value)} ${demandUnitLabel(unit)}`;
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

function createSegmentPhysicalLengthIndex(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  nodeById: Map<string, RouteNode>;
  orientedSegments: OrientedSegment[];
  scaleMetersPerSourceUnit: number | null;
}) {
  const map = new Map<string, number | null>();

  for (const oriented of params.orientedSegments) {
    map.set(
      oriented.segment.id,
      calculateSegmentPhysicalLengthMeters({
        equipmentById: params.equipmentById,
        fromNodeId: oriented.fromNodeId,
        nodeById: params.nodeById,
        scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
        segment: oriented.segment,
        toNodeId: oriented.toNodeId,
      }),
    );
  }

  return map;
}

function calculateSegmentPhysicalLengthMeters(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  fromNodeId: string;
  nodeById: Map<string, RouteNode>;
  scaleMetersPerSourceUnit: number | null;
  segment: RouteSegment;
  toNodeId: string;
}) {
  if (params.scaleMetersPerSourceUnit === null) {
    return null;
  }

  const fromPoint = resolveTechnicalRouteNodePosition(
    params.fromNodeId,
    params.nodeById,
    params.equipmentById,
  );
  const toPoint = resolveTechnicalRouteNodePosition(
    params.toNodeId,
    params.nodeById,
    params.equipmentById,
  );

  if (!fromPoint || !toPoint) {
    return null;
  }

  return routeSegmentPhysicalLengthMeters(
    {
      ...params.segment,
      from: fromPoint,
      path: resolveRouteSegmentPath(params.segment, fromPoint, toPoint),
      to: toPoint,
    },
    params.scaleMetersPerSourceUnit,
  );
}

function resolveTechnicalRouteNodePosition(
  nodeId: string,
  nodeById: Map<string, RouteNode>,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  const node = nodeById.get(nodeId);

  return node ? resolveRouteNodePosition(node, equipmentById) : null;
}

function createTechnicalRoutes(params: {
  nodeById: Map<string, RouteNode>;
  orientedSegments: OrientedSegment[];
  rootNodeId: string;
  segmentLengthById: Map<string, number | null>;
}) {
  const parentByToNodeId = new Map(
    params.orientedSegments.map((oriented) => [oriented.toNodeId, oriented]),
  );

  return [...params.nodeById.values()]
    .filter((node) => node.kind === "appliance" && node.equipmentId)
    .sort((first, second) =>
      (first.equipmentId ?? first.id).localeCompare(
        second.equipmentId ?? second.id,
      ),
    )
    .map((terminalNode) =>
      createTechnicalRoute({
        parentByToNodeId,
        rootNodeId: params.rootNodeId,
        segmentLengthById: params.segmentLengthById,
        terminalNode,
      }),
    );
}

function createTechnicalRoute(params: {
  parentByToNodeId: Map<string, OrientedSegment>;
  rootNodeId: string;
  segmentLengthById: Map<string, number | null>;
  terminalNode: RouteNode;
}): TechnicalRoute {
  const terminalEquipmentId = params.terminalNode.equipmentId as string;
  const reversedNodeIds = [params.terminalNode.id];
  const reversedSegmentIds: string[] = [];
  let currentNodeId = params.terminalNode.id;

  while (currentNodeId !== params.rootNodeId) {
    const parent = params.parentByToNodeId.get(currentNodeId);

    if (!parent) {
      return {
        id: createTechnicalRouteId(terminalEquipmentId),
        nodeIds: reversedNodeIds.reverse(),
        physicalLengthMeters: null,
        reason:
          "No se pudo reconstruir el recorrido desde la alimentacion hasta el terminal.",
        segmentIds: reversedSegmentIds.reverse(),
        status: "unresolved",
        terminalEquipmentId,
        terminalNodeId: params.terminalNode.id,
      };
    }

    reversedSegmentIds.push(parent.segment.id);
    currentNodeId = parent.fromNodeId;
    reversedNodeIds.push(currentNodeId);
  }

  const segmentIds = reversedSegmentIds.reverse();
  const nodeIds = reversedNodeIds.reverse();
  let physicalLengthMeters = 0;

  for (const segmentId of segmentIds) {
    const length = params.segmentLengthById.get(segmentId) ?? null;

    if (length === null) {
      return {
        id: createTechnicalRouteId(terminalEquipmentId),
        nodeIds,
        physicalLengthMeters: null,
        reason: "Falta longitud fisica en uno o mas tramos del recorrido.",
        segmentIds,
        status: "unresolved",
        terminalEquipmentId,
        terminalNodeId: params.terminalNode.id,
      };
    }

    physicalLengthMeters += length;
  }

  return {
    id: createTechnicalRouteId(terminalEquipmentId),
    nodeIds,
    physicalLengthMeters,
    segmentIds,
    status: "resolved",
    terminalEquipmentId,
    terminalNodeId: params.terminalNode.id,
  };
}

function createTechnicalRouteId(terminalEquipmentId: string) {
  return `technical-route:${terminalEquipmentId}`;
}

function createRoutesBySegmentId(routes: TechnicalRoute[]) {
  const map = new Map<string, TechnicalRoute[]>();

  for (const route of routes) {
    for (const segmentId of route.segmentIds) {
      const current = map.get(segmentId) ?? [];
      current.push(route);
      current.sort((first, second) =>
        first.terminalEquipmentId.localeCompare(second.terminalEquipmentId),
      );
      map.set(segmentId, current);
    }
  }

  return map;
}

function createGoverningRouteBySegmentId(
  routesBySegmentId: Map<string, TechnicalRoute[]>,
) {
  const map = new Map<
    string,
    PipeSystemResolution<TechnicalSegmentGoverningRoute>
  >();

  for (const [segmentId, routes] of routesBySegmentId) {
    map.set(segmentId, resolveGoverningRouteForSegment(segmentId, routes));
  }

  return map;
}

function resolveGoverningRouteForSegment(
  segmentId: string,
  routes: TechnicalRoute[],
): PipeSystemResolution<TechnicalSegmentGoverningRoute> {
  if (routes.length === 0) {
    return createMissingSegmentRouteResolution(segmentId);
  }

  const unresolvedRoute = routes.find((route) => route.status !== "resolved");

  if (unresolvedRoute) {
    return {
      data: {
        routeId: unresolvedRoute.id,
        segmentId,
        terminalEquipmentId: unresolvedRoute.terminalEquipmentId,
      },
      reason: unresolvedRoute.reason ?? "Recorrido de calculo pendiente.",
      status: "unresolved",
    };
  }

  const resolvedRoutes = routes.filter(
    (route): route is TechnicalRoute & { physicalLengthMeters: number } =>
      route.physicalLengthMeters !== null,
  );

  if (resolvedRoutes.length === 0) {
    return {
      data: { segmentId },
      reason: "No hay recorridos resueltos para el tramo.",
      status: "unresolved",
    };
  }

  const maxLength = Math.max(
    ...resolvedRoutes.map((route) => route.physicalLengthMeters),
  );
  const tiedRoutes = resolvedRoutes
    .filter(
      (route) =>
        Math.abs(route.physicalLengthMeters - maxLength) <= ROUTE_LENGTH_EPSILON,
    )
    .sort((first, second) =>
      first.terminalEquipmentId.localeCompare(second.terminalEquipmentId) ||
      first.id.localeCompare(second.id),
    );
  const selectedRoute = tiedRoutes[0] as TechnicalRoute & {
    physicalLengthMeters: number;
  };

  return {
    explanation: "Recorrido terminal mas largo que contiene el tramo.",
    status: "resolved",
    value: {
      nodeIds: selectedRoute.nodeIds,
      physicalLengthMeters: selectedRoute.physicalLengthMeters,
      routeId: selectedRoute.id,
      segmentIds: selectedRoute.segmentIds,
      terminalEquipmentId: selectedRoute.terminalEquipmentId,
      terminalNodeId: selectedRoute.terminalNodeId,
      tiedRouteIds:
        tiedRoutes.length > 1 ? tiedRoutes.map((route) => route.id) : [],
    },
  };
}

function createMissingSegmentRouteResolution(
  segmentId: string,
): PipeSystemResolution<TechnicalSegmentGoverningRoute> {
  return {
    data: { segmentId },
    reason: "El tramo no pertenece a ningun recorrido terminal.",
    status: "unresolved",
  };
}

function createPendingRouteSizingBasis(
  governingRouteResolution: PipeSystemResolution<TechnicalSegmentGoverningRoute>,
): TechnicalSegmentSizingBasis {
  if (governingRouteResolution.status !== "resolved") {
    return {
      governingRouteAccessoryEquivalentLengthMeters: null,
      governingRoutePhysicalLengthMeters: null,
      reasons: [governingRouteResolution.reason],
      routeAccessoryResolutionId: null,
      sizingLengthMeters: null,
      status: governingRouteResolution.status,
    };
  }

  return {
    governingRouteAccessoryEquivalentLengthMeters: null,
    governingRoutePhysicalLengthMeters:
      governingRouteResolution.value.physicalLengthMeters,
    reasons: [
      "Falta acumular accesorios por recorrido antes del dimensionado definitivo.",
    ],
    routeAccessoryResolutionId: null,
    sizingLengthMeters: null,
    status: "unresolved",
  };
}

function createRouteSizingBasisFromNetworkSizing(params: {
  governingRouteResolution: PipeSystemResolution<TechnicalSegmentGoverningRoute>;
  networkSizingSegment: TechnicalNetworkSizingSegmentResult | null;
}): TechnicalSegmentSizingBasis {
  if (params.governingRouteResolution.status !== "resolved") {
    return createPendingRouteSizingBasis(params.governingRouteResolution);
  }

  const routeId = params.governingRouteResolution.value.routeId;

  if (!params.networkSizingSegment) {
    return {
      governingRouteAccessoryEquivalentLengthMeters: null,
      governingRoutePhysicalLengthMeters:
        params.governingRouteResolution.value.physicalLengthMeters,
      reasons: ["No se encontro el resultado global del tramo."],
      routeAccessoryResolutionId: routeId,
      sizingLengthMeters: null,
      status: "unresolved",
    };
  }

  return {
    governingRouteAccessoryEquivalentLengthMeters:
      params.networkSizingSegment
        .governingRouteAccessoryEquivalentLengthMeters,
    governingRoutePhysicalLengthMeters:
      params.networkSizingSegment.governingRoutePhysicalLengthMeters,
    reasons: params.networkSizingSegment.issues.map((issue) => issue.message),
    routeAccessoryResolutionId:
      params.networkSizingSegment.routeAccessoryResolutionId ?? routeId,
    sizingLengthMeters: params.networkSizingSegment.sizingLengthMeters,
    status: params.networkSizingSegment.status,
  };
}

function resolveSegmentConsumptionM3h(params: {
  networkSizingSegment: TechnicalNetworkSizingSegmentResult | null;
  segment: TechnicalSegmentResult;
}) {
  if (
    params.networkSizingSegment?.accumulatedFlowUnit === "m3_h" &&
    params.networkSizingSegment.accumulatedFlow !== null
  ) {
    return params.networkSizingSegment.accumulatedFlow;
  }

  return params.segment.accumulatedFlowUnit === "m3_h"
    ? params.segment.accumulatedFlow
    : null;
}

function createTechnicalSegmentResult(params: {
  childSegmentsByNodeId: Map<string, OrientedSegment[]>;
  demandNormalizationByEquipmentId: Map<string, EquipmentDemandNormalization>;
  equipmentById: Map<string, WorkbenchEquipment>;
  governingRouteResolution: PipeSystemResolution<TechnicalSegmentGoverningRoute>;
  nodeById: Map<string, RouteNode>;
  oriented: OrientedSegment;
  pipeContext: PipeSegmentPipeContext | undefined;
  pipeSystem: PipeSystem;
  scaleMetersPerSourceUnit: number | null;
  terminalRouteIds: string[];
}): TechnicalSegmentResult {
  const downstreamApplianceIds = collectDownstreamApplianceIds(
    params.oriented.toNodeId,
    params.nodeById,
    params.childSegmentsByNodeId,
  );
  const flow = calculateAccumulatedFlow(
    downstreamApplianceIds,
    params.demandNormalizationByEquipmentId,
  );
  const from = params.nodeById.get(params.oriented.fromNodeId);
  const to = params.nodeById.get(params.oriented.toNodeId);
  const fromPoint = from
    ? resolveRouteNodePosition(from, params.equipmentById)
    : null;
  const toPoint = to ? resolveRouteNodePosition(to, params.equipmentById) : null;
  const resolvedRouteSegment =
    fromPoint && toPoint
      ? {
          ...params.oriented.segment,
          from: fromPoint,
          path: resolveRouteSegmentPath(params.oriented.segment, fromPoint, toPoint),
          to: toPoint,
        }
      : null;
  const drawingLength = resolvedRouteSegment
    ? routeSegmentHorizontalLengthSource(resolvedRouteSegment)
    : 0;
  const physicalLengthMeters =
    params.scaleMetersPerSourceUnit === null || !resolvedRouteSegment
      ? null
      : routeSegmentPhysicalLengthMeters(
          resolvedRouteSegment,
          params.scaleMetersPerSourceUnit,
        );
  const accessoryContext = {
    accumulatedFlow: flow.value,
    accumulatedFlowUnit: flow.unit,
    drawingLength,
    id: params.oriented.segment.id,
    physicalLengthMeters,
  };
  const preliminaryAccessories = createTechnicalAccessoryResults({
    pipeContext: params.pipeContext,
    pipeSystem: params.pipeSystem,
    segment: params.oriented.segment,
    segmentContext: accessoryContext,
  });
  const preliminaryAccessoryEquivalentLengthMeters =
    calculateAccessoryEquivalentLength(preliminaryAccessories);
  const preliminaryCalculationLengthMeters =
    physicalLengthMeters !== null &&
    preliminaryAccessoryEquivalentLengthMeters !== null
      ? physicalLengthMeters + preliminaryAccessoryEquivalentLengthMeters
      : null;
  const dimensioningResolution = resolveSegmentDimensioning({
    drawingLength,
    flow,
    physicalLengthMeters,
    pipeContext: params.pipeContext,
    pipeSystem: params.pipeSystem,
    segment: params.oriented.segment,
  });
  const resolvedDimensioning =
    dimensioningResolution.status === "resolved"
      ? dimensioningResolution.value
      : null;
  const accessories =
    resolvedDimensioning?.accessories ?? preliminaryAccessories;
  const accessoryEquivalentLengthMeters =
    resolvedDimensioning?.accessoryEquivalentLengthMeters ??
    preliminaryAccessoryEquivalentLengthMeters;
  const calculationLengthMeters =
    resolvedDimensioning?.calculationLengthMeters ??
    preliminaryCalculationLengthMeters;
  const governingRoute =
    params.governingRouteResolution.status === "resolved"
      ? params.governingRouteResolution.value
      : null;

  return {
    accessories,
    accessoryEquivalentLengthMeters,
    accumulatedFlow: flow.value,
    accumulatedFlowUnit: flow.unit,
    calculatedDiameter: resolvedDimensioning?.calculatedDiameter ?? null,
    calculationLengthMeters,
    consumptionM3h: flow.unit === "m3_h" ? flow.value : null,
    depth: params.oriented.depth,
    dimensioningResolution,
    downstreamApplianceIds,
    drawingLength,
    fromNodeId: params.oriented.fromNodeId,
    governingRoute,
    governingRoutePhysicalLengthMeters:
      governingRoute?.physicalLengthMeters ?? null,
    governingRouteResolution: params.governingRouteResolution,
    missingDemandEquipmentIds: flow.missingEquipmentIds,
    parentSegmentId: params.oriented.parentSegmentId,
    physicalLengthMeters,
    provisionalDiameter: null,
    provisionalDiameterExplanation: null,
    routeSizingBasis: createPendingRouteSizingBasis(
      params.governingRouteResolution,
    ),
    segmentId: params.oriented.segment.id,
    segmentPhysicalLengthMeters: physicalLengthMeters,
    terminalRouteIds: params.terminalRouteIds,
    toNodeId: params.oriented.toNodeId,
    unresolvedDemandEquipmentIds: flow.unresolvedEquipmentIds,
  };
}

type SegmentDimensioningFailure = {
  data?: Record<string, unknown>;
  reason: string;
  status: "unresolved" | "unsupported";
};

function resolveSegmentDimensioning(params: {
  drawingLength: number;
  flow: {
    missingEquipmentIds: string[];
    unresolvedEquipmentIds: string[];
    unit: DemandUnit | null;
    value: number | null;
  };
  physicalLengthMeters: number | null;
  pipeContext: PipeSegmentPipeContext | undefined;
  pipeSystem: PipeSystem;
  segment: RouteSegment;
}): PipeSystemResolution<TechnicalSegmentDimensioningResult> {
  if (params.physicalLengthMeters === null) {
    return {
      reason: "Falta longitud fisica para dimensionar el tramo.",
      status: "unresolved",
    };
  }

  if (params.flow.value === null) {
    return {
      reason:
        params.flow.missingEquipmentIds.length > 0
          ? "Falta consumo aguas abajo para dimensionar el tramo."
          : params.flow.unresolvedEquipmentIds.length > 0
            ? "El consumo aguas abajo no pudo normalizarse a m3/h."
          : "El caudal acumulado del tramo no esta disponible en una unidad unica.",
      status: "unresolved",
    };
  }

  if (params.flow.unit === null) {
    return {
      reason: "Falta unidad de caudal acumulado para dimensionar el tramo.",
      status: "unresolved",
    };
  }

  const availableDiametersResolution = params.pipeSystem.getAvailableDiameters({
    pipe: params.pipeContext,
  });

  if (availableDiametersResolution.status !== "resolved") {
    return {
      data: availableDiametersResolution.data,
      reason: availableDiametersResolution.reason,
      status: availableDiametersResolution.status,
    };
  }

  const candidates = sortDiameterReferences(availableDiametersResolution.value);

  if (candidates.length === 0) {
    return {
      reason: "El sistema de canerias no informo diametros disponibles.",
      status: "unresolved",
    };
  }

  const failures: SegmentDimensioningFailure[] = [];

  for (const candidate of candidates) {
    const candidatePipeContext = {
      ...(params.pipeContext ?? {}),
      diameter: candidate,
    };
    const segmentContext = {
      accumulatedFlow: params.flow.value,
      accumulatedFlowUnit: params.flow.unit,
      drawingLength: params.drawingLength,
      id: params.segment.id,
      physicalLengthMeters: params.physicalLengthMeters,
    };
    const accessories = createTechnicalAccessoryResults({
      pipeContext: candidatePipeContext,
      pipeSystem: params.pipeSystem,
      segment: params.segment,
      segmentContext,
    });
    const accessoryFailure = accessories.find(
      (accessory) => accessory.equivalentLengthResolution.status !== "resolved",
    );

    if (accessoryFailure) {
      failures.push(createAccessoryDimensioningFailure(accessoryFailure));
      continue;
    }

    const accessoryEquivalentLengthMeters =
      calculateAccessoryEquivalentLength(accessories);

    if (accessoryEquivalentLengthMeters === null) {
      failures.push({
        reason: "No se pudo resolver la longitud equivalente de accesorios.",
        status: "unresolved",
      });
      continue;
    }

    const calculationLengthMeters =
      params.physicalLengthMeters + accessoryEquivalentLengthMeters;
    const sizingResolution = params.pipeSystem.sizeSegment({
      accessoryEquivalentLengthMeters,
      accumulatedFlow: params.flow.value,
      accumulatedFlowUnit: params.flow.unit,
      calculationLengthMeters,
      physicalLengthMeters: params.physicalLengthMeters,
      pipe: candidatePipeContext,
      segmentId: params.segment.id,
    });

    if (sizingResolution.status !== "resolved") {
      failures.push({
        data: sizingResolution.data,
        reason: sizingResolution.reason,
        status: sizingResolution.status,
      });
      continue;
    }

    if (
      diameterIsLessOrEqual(
        sizingResolution.value.selectedDiameter,
        candidate,
        candidates,
      )
    ) {
      return {
        data: {
          candidateCount: candidates.length,
          evaluatedCandidateDiameterId: candidate.id,
        },
        explanation:
          `Diametro ${candidate.label} resuelto con accesorios del mismo diametro.`,
        status: "resolved",
        value: {
          accessories,
          accessoryEquivalentLengthMeters,
          calculatedDiameter: candidate,
          calculationLengthMeters,
          candidateCount: candidates.length,
          physicalLengthMeters: params.physicalLengthMeters,
          sizingResult: sizingResolution.value,
        },
      };
    }

    failures.push({
      data: {
        candidateDiameterId: candidate.id,
        requiredDiameterId: sizingResolution.value.selectedDiameter.id,
      },
      reason:
        `El candidato ${candidate.label} no alcanza; ` +
        `el sistema requiere ${sizingResolution.value.selectedDiameter.label}.`,
      status: "unresolved",
    });
  }

  return createFailedDimensioningResolution(failures, candidates.length);
}

function createAccessoryDimensioningFailure(
  accessory: TechnicalSegmentAccessoryResult,
): SegmentDimensioningFailure {
  const resolution = accessory.equivalentLengthResolution;

  if (resolution.status === "resolved") {
    return {
      reason: "Longitud equivalente pendiente de resolver.",
      status: "unresolved",
    };
  }

  return {
    data: resolution.data,
    reason: resolution.reason,
    status: resolution.status,
  };
}

function createFailedDimensioningResolution(
  failures: SegmentDimensioningFailure[],
  candidateCount: number,
): PipeSystemResolution<TechnicalSegmentDimensioningResult> {
  const firstUnsupported = failures.find(
    (failure) => failure.status === "unsupported",
  );
  const firstFailure = firstUnsupported ?? failures[0];

  if (!firstFailure) {
    return {
      data: { candidateCount },
      reason: "No se encontro un diametro candidato valido.",
      status: "unresolved",
    };
  }

  return {
    data: {
      ...firstFailure.data,
      candidateCount,
      failureCount: failures.length,
    },
    reason: firstFailure.reason,
    status: firstFailure.status,
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
          catalogCode: accessory.catalogCode,
          catalogFamilyId: accessory.catalogFamilyId,
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
        catalogCode: accessory.catalogCode,
        catalogFamilyId: accessory.catalogFamilyId,
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
    catalogCode?: string;
    catalogFamilyId?: string;
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

function sortDiameterReferences(diameters: PipeDiameterReference[]) {
  return diameters
    .map((diameter, index) => ({
      diameter,
      index,
      order: diameterSortValue(diameter),
    }))
    .sort((first, second) => {
      if (first.order !== null && second.order !== null) {
        return first.order - second.order;
      }

      if (first.order !== null) {
        return -1;
      }

      if (second.order !== null) {
        return 1;
      }

      return first.index - second.index;
    })
    .map((item) => item.diameter);
}

function diameterIsLessOrEqual(
  first: PipeDiameterReference,
  second: PipeDiameterReference,
  orderedDiameters: PipeDiameterReference[],
) {
  const firstIndex = diameterOrderIndex(first, orderedDiameters);
  const secondIndex = diameterOrderIndex(second, orderedDiameters);

  if (firstIndex !== null && secondIndex !== null) {
    return firstIndex <= secondIndex;
  }

  const firstValue = diameterSortValue(first);
  const secondValue = diameterSortValue(second);

  return firstValue !== null && secondValue !== null && firstValue <= secondValue;
}

function diameterOrderIndex(
  diameter: PipeDiameterReference,
  orderedDiameters: PipeDiameterReference[],
) {
  const byId = orderedDiameters.findIndex((item) => item.id === diameter.id);

  if (byId >= 0) {
    return byId;
  }

  const value = diameterSortValue(diameter);

  if (value === null) {
    return null;
  }

  const byValue = orderedDiameters.findIndex((item) => {
    const itemValue = diameterSortValue(item);

    return itemValue !== null && Math.abs(itemValue - value) <= 0.000001;
  });

  return byValue >= 0 ? byValue : null;
}

function diameterSortValue(diameter: PipeDiameterReference) {
  const numericValue =
    diameter.externalDiameterMillimeters ??
    diameter.internalDiameterMillimeters ??
    parseDiameterMillimeters(diameter.nominalDiameter) ??
    parseDiameterMillimeters(diameter.label) ??
    parseDiameterMillimeters(diameter.id);

  return numericValue !== undefined && Number.isFinite(numericValue)
    ? numericValue
    : null;
}

function parseDiameterMillimeters(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const match = value.match(/(?:^|[^0-9])([0-9]{2,3})(?:\s*mm)?(?:$|[^0-9])/i);

  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);

  return Number.isFinite(parsed) ? parsed : undefined;
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
  demandNormalizationByEquipmentId: Map<string, EquipmentDemandNormalization>,
) {
  const missingEquipmentIds: string[] = [];
  const unresolvedEquipmentIds: string[] = [];
  let value = 0;

  for (const equipmentId of downstreamApplianceIds) {
    const normalization = demandNormalizationByEquipmentId.get(equipmentId);

    if (!normalization) {
      missingEquipmentIds.push(equipmentId);
      continue;
    }

    if (
      normalization.status !== "resolved" ||
      normalization.normalizedFlowM3h === null
    ) {
      if (
        normalization.source === "missing_declared_demand" ||
        normalization.originalValue === null ||
        !normalization.originalUnit
      ) {
        missingEquipmentIds.push(equipmentId);
      } else {
        unresolvedEquipmentIds.push(equipmentId);
      }

      continue;
    }

    value += normalization.normalizedFlowM3h;
  }

  if (
    downstreamApplianceIds.length === 0 ||
    missingEquipmentIds.length > 0 ||
    unresolvedEquipmentIds.length > 0
  ) {
    return {
      missingEquipmentIds,
      unresolvedEquipmentIds,
      unit: null,
      value: null,
    };
  }

  return {
    missingEquipmentIds,
    unresolvedEquipmentIds,
    unit: "m3_h" as const,
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

function createDimensioningIssue(
  segment: TechnicalSegmentResult,
): TechnicalCalculationIssue {
  const resolution = segment.dimensioningResolution;

  return {
    code: "pending_diameter_sizing",
    message:
      resolution.status === "unsupported"
        ? `Dimensionado no soportado: ${resolution.reason}`
        : resolution.status === "resolved"
          ? "Dimensionado pendiente."
          : resolution.reason,
    segmentId: segment.segmentId,
  };
}

function createRouteSizingIssue(
  segment: TechnicalSegmentResult,
): TechnicalCalculationIssue {
  const reason =
    segment.routeSizingBasis.reasons[0] ??
    "Longitud de dimensionado por recorrido pendiente.";

  return {
    code: "pending_route_sizing_length",
    message:
      segment.routeSizingBasis.status === "unsupported"
        ? `Recorrido no soportado: ${reason}`
        : `Recorrido pendiente: ${reason}`,
    segmentId: segment.segmentId,
  };
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

function createTotals(params: {
  demandNormalizationByEquipmentId: Map<string, EquipmentDemandNormalization>;
  equipment: WorkbenchEquipment[];
  segments: TechnicalSegmentResult[];
}) {
  const connectedApplianceIds = new Set(
    params.segments.flatMap((segment) => segment.downstreamApplianceIds),
  );
  const appliances = params.equipment.filter(
    (item) => item.role === "appliance" && connectedApplianceIds.has(item.id),
  );
  const totalFlow = calculateAccumulatedFlow(
    appliances.map((item) => item.id).sort(),
    params.demandNormalizationByEquipmentId,
  );
  const physicalLengthMeters = params.segments.every(
    (segment) => segment.physicalLengthMeters !== null,
  )
    ? params.segments.reduce(
        (sum, segment) => sum + (segment.physicalLengthMeters ?? 0),
        0,
      )
    : null;
  const accessoryEquivalentLengthMeters = params.segments.every(
    (segment) => segment.accessoryEquivalentLengthMeters !== null,
  )
    ? params.segments.reduce(
        (sum, segment) => sum + (segment.accessoryEquivalentLengthMeters ?? 0),
        0,
      )
    : null;
  const calculationLengthMeters =
    physicalLengthMeters !== null && accessoryEquivalentLengthMeters !== null
      ? physicalLengthMeters + accessoryEquivalentLengthMeters
      : null;
  const dimensionedSegmentCount = params.segments.filter(
    (segment) => segment.dimensioningResolution.status === "resolved",
  ).length;

  return {
    accumulatedFlow: totalFlow.value,
    accumulatedFlowUnit: totalFlow.unit,
    applianceCount: appliances.length,
    accessoryEquivalentLengthMeters,
    calculationLengthMeters,
    dimensionedSegmentCount,
    pendingDimensioningSegmentCount:
      params.segments.length - dimensionedSegmentCount,
    physicalLengthMeters,
    segmentCount: params.segments.length,
  };
}

function createProfessionalDiameterAdoptionIssues(
  adoption: ProfessionalDiameterAdoptionResult,
): TechnicalCalculationIssue[] {
  return adoption.segments
    .filter(
      (segment) =>
        segment.decision &&
        segment.status !== "validated" &&
        segment.status !== "using_calculated",
    )
    .map((segment): TechnicalCalculationIssue => {
      if (segment.status === "pending_validation") {
        return {
          code: "pending_adopted_diameter_validation",
          message:
            `Adopción pendiente de validación en ${segment.segmentId}: ` +
            (segment.reason ?? "requiere confirmar una transición generada."),
          segmentId: segment.segmentId,
        };
      }

      if (segment.status === "incompatible") {
        return {
          code: "incompatible_adopted_diameter",
          message:
            `Adopción incompatible en ${segment.segmentId}: ` +
            (segment.reason ?? "el diámetro adoptado no puede validarse."),
          segmentId: segment.segmentId,
        };
      }

      return {
        code: "unresolved_adopted_diameter",
        message:
          `Adopción no resuelta en ${segment.segmentId}: ` +
          (segment.reason ?? "falta validar el diámetro efectivo."),
        segmentId: segment.segmentId,
      };
    });
}

function createEmptyTotals(): TechnicalCalculationResult["totals"] {
  return {
    accumulatedFlow: null,
    accumulatedFlowUnit: null,
    applianceCount: 0,
    accessoryEquivalentLengthMeters: null,
    calculationLengthMeters: null,
    dimensionedSegmentCount: 0,
    pendingDimensioningSegmentCount: 0,
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
    technicalRoutes: result.technicalRoutes.sort(
      (first, second) =>
        first.terminalEquipmentId.localeCompare(second.terminalEquipmentId) ||
        first.id.localeCompare(second.id),
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

function formatFlowNumber(value: number) {
  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  });
}
