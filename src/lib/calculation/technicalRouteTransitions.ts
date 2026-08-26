import type {
  PipeDiameterReference,
  PipeDiameterTransitionEquivalentLengthResult,
  PipeDiameterTransitionTraversalKind,
  PipeSystem,
  PipeSystemResolution,
  PipeSystemResolutionStatus,
} from "@/lib/calculation/pipeSystem";
import {
  applyDiameterTransitionDecisions,
  type DiameterTransitionDecision,
  type DiameterTransitionKind,
  type DiameterTransitionProposal,
} from "@/lib/calculation/diameterTransitionProposals";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  buildEquipmentIndex,
  resolveRouteNodePosition,
} from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";

export type TechnicalRouteTransitionRoute = {
  id: string;
  nodeIds: string[];
  physicalLengthMeters: number | null;
  reason?: string;
  segmentIds: string[];
  status: "resolved" | "unresolved";
};

export type TechnicalRouteTransitionContributionStatus =
  | PipeSystemResolutionStatus
  | "inactive";

export type TechnicalRouteTransitionContributionSource =
  | "duplicate"
  | "not_required"
  | "pipe_system"
  | "rejected"
  | "unconfirmed";

export type TechnicalRouteTransitionContribution = {
  catalogCode?: string;
  catalogFamilyId?: string;
  downstreamDiameter: PipeDiameterReference | null;
  downstreamSegmentId: string | null;
  equivalentLengthMeters: number | null;
  equivalentLengthResolution:
    | PipeSystemResolution<PipeDiameterTransitionEquivalentLengthResult>
    | null;
  nodeId: string;
  order: number;
  reason?: string;
  routeId: string;
  source: TechnicalRouteTransitionContributionSource;
  status: TechnicalRouteTransitionContributionStatus;
  transitionId: string;
  transitionKind: DiameterTransitionKind;
  traversalKind: PipeDiameterTransitionTraversalKind | null;
  upstreamDiameter: PipeDiameterReference | null;
  upstreamSegmentId: string | null;
  variant: PipeDiameterTransitionEquivalentLengthResult["variant"] | null;
};

export type TechnicalRouteTransitionResolution = {
  branchTransitionEquivalentLengthMeters: number | null;
  contributions: TechnicalRouteTransitionContribution[];
  duplicateTransitionIds: string[];
  equivalentLengthMeters: number | null;
  projectedSizingLengthMeters: number | null;
  reasons: string[];
  routeId: string;
  simpleTransitionEquivalentLengthMeters: number | null;
  status: PipeSystemResolutionStatus;
};

export type DiameterBySegmentId =
  | Map<string, PipeDiameterReference | null | undefined>
  | Record<string, PipeDiameterReference | null | undefined>;

export function resolveTechnicalRouteTransitions(params: {
  decisions?: DiameterTransitionDecision[];
  diameterBySegmentId?: DiameterBySegmentId;
  enableBranchTransitionPreview?: boolean;
  equipment?: WorkbenchEquipment[];
  governingRouteAccessoryEquivalentLengthMeters?: number | null;
  includeBranchTransitions?: boolean;
  network?: ManualRouteNetwork;
  pipeSystem: PipeSystem;
  route: TechnicalRouteTransitionRoute;
  transitions: DiameterTransitionProposal[];
}): TechnicalRouteTransitionResolution {
  const includeBranchTransitions =
    params.includeBranchTransitions ??
    params.enableBranchTransitionPreview ??
    false;
  const transitions =
    params.decisions === undefined
      ? params.transitions
      : applyDiameterTransitionDecisions({
          decisions: params.decisions,
          proposals: params.transitions,
        });
  const contributions: TechnicalRouteTransitionContribution[] = [];
  const duplicateTransitionIds: string[] = [];
  const reasons: string[] = [];
  const seenTransitionIds = new Set<string>();

  for (const crossing of findRouteTransitionCrossings({
    diameterBySegmentId: params.diameterBySegmentId,
    includeBranchTransitions,
    route: params.route,
    transitions,
  })) {
    if (seenTransitionIds.has(crossing.transition.id)) {
      const reason = `Transicion duplicada en el recorrido: ${crossing.transition.id}.`;
      duplicateTransitionIds.push(crossing.transition.id);
      addUniqueReason(reasons, reason);
      contributions.push(
        createDuplicateContribution({
          crossing,
          reason,
          routeId: params.route.id,
        }),
      );
      continue;
    }

    seenTransitionIds.add(crossing.transition.id);

    const contribution = createTransitionContribution({
      crossing,
      diameterBySegmentId: params.diameterBySegmentId,
      equipment: params.equipment,
      includeBranchTransitions,
      network: params.network,
      pipeSystem: params.pipeSystem,
      routeId: params.route.id,
    });

    if (
      contribution.reason &&
      (contribution.status === "unresolved" ||
        contribution.status === "unsupported")
    ) {
      addUniqueReason(reasons, contribution.reason);
    }

    contributions.push(contribution);
  }

  if (params.route.status !== "resolved" || params.route.physicalLengthMeters === null) {
    addUniqueReason(
      reasons,
      params.route.reason ?? "Falta longitud fisica del recorrido.",
    );
  }

  const status = resolveOverallStatus(contributions, reasons);
  const equivalentLengthMeters =
    status === "resolved"
      ? contributions.reduce(
          (sum, contribution) =>
            sum + (contribution.equivalentLengthMeters ?? 0),
          0,
        )
      : null;
  const simpleTransitionEquivalentLengthMeters =
    status === "resolved"
      ? sumTransitionContributions(contributions, ["simple_reduction"])
      : null;
  const branchTransitionEquivalentLengthMeters =
    status === "resolved"
      ? sumTransitionContributions(contributions, ["branch_transition"])
      : null;
  const projectedSizingLengthMeters =
    status === "resolved"
      ? calculateProjectedSizingLengthWithTransitions({
          governingRouteAccessoryEquivalentLengthMeters:
            params.governingRouteAccessoryEquivalentLengthMeters ?? null,
          governingRoutePhysicalLengthMeters: params.route.physicalLengthMeters,
          routeTransitionEquivalentLengthMeters: equivalentLengthMeters,
        })
      : null;

  return {
    branchTransitionEquivalentLengthMeters,
    contributions,
    duplicateTransitionIds: [...new Set(duplicateTransitionIds)].sort(),
    equivalentLengthMeters,
    projectedSizingLengthMeters,
    reasons,
    routeId: params.route.id,
    simpleTransitionEquivalentLengthMeters,
    status,
  };
}

export function calculateProjectedSizingLengthWithTransitions(params: {
  governingRouteAccessoryEquivalentLengthMeters: number | null;
  governingRoutePhysicalLengthMeters: number | null;
  routeTransitionEquivalentLengthMeters: number | null;
}) {
  if (
    params.governingRouteAccessoryEquivalentLengthMeters === null ||
    params.governingRoutePhysicalLengthMeters === null ||
    params.routeTransitionEquivalentLengthMeters === null
  ) {
    return null;
  }

  return (
    params.governingRoutePhysicalLengthMeters +
    params.governingRouteAccessoryEquivalentLengthMeters +
    params.routeTransitionEquivalentLengthMeters
  );
}

function findRouteTransitionCrossings(params: {
  diameterBySegmentId: DiameterBySegmentId | undefined;
  includeBranchTransitions: boolean;
  route: TechnicalRouteTransitionRoute;
  transitions: DiameterTransitionProposal[];
}) {
  const crossings: Array<{
    downstreamSegmentId: string;
    order: number;
    transition: DiameterTransitionProposal;
    upstreamSegmentId: string;
  }> = [];

  for (let index = 1; index < params.route.nodeIds.length - 1; index += 1) {
    const nodeId = params.route.nodeIds[index] as string;
    const upstreamSegmentId = params.route.segmentIds[index - 1];
    const downstreamSegmentId = params.route.segmentIds[index];

    if (!upstreamSegmentId || !downstreamSegmentId) {
      continue;
    }

    const nodeTransitions = params.transitions
      .filter((transition) => transition.nodeId === nodeId)
      .filter((transition) => {
        const incidentSegmentIds = new Set(
          transition.incidentSegments.map((segment) => segment.segmentId),
        );

        return (
          incidentSegmentIds.has(upstreamSegmentId) &&
          incidentSegmentIds.has(downstreamSegmentId)
        );
      })
      .filter((transition) =>
        routeUsesRequiredDiameterChange({
          diameterBySegmentId: params.diameterBySegmentId,
          downstreamSegmentId,
          includeBranchTransitions: params.includeBranchTransitions,
          transition,
          upstreamSegmentId,
        }),
      )
      .sort((first, second) => first.id.localeCompare(second.id));

    for (const transition of nodeTransitions) {
      crossings.push({
        downstreamSegmentId,
        order: index,
        transition,
        upstreamSegmentId,
      });
    }
  }

  return crossings.sort(
    (first, second) =>
      first.order - second.order ||
      first.transition.id.localeCompare(second.transition.id),
  );
}

function routeUsesRequiredDiameterChange(params: {
  diameterBySegmentId: DiameterBySegmentId | undefined;
  downstreamSegmentId: string;
  includeBranchTransitions: boolean;
  transition: DiameterTransitionProposal;
  upstreamSegmentId: string;
}) {
  if (params.transition.state === "not_required") {
    return true;
  }

  if (
    params.includeBranchTransitions &&
    params.transition.kind === "branch_transition"
  ) {
    return true;
  }

  const upstreamDiameter =
    resolveDiameter(params.diameterBySegmentId, params.upstreamSegmentId) ??
    segmentDiameter(params.transition, params.upstreamSegmentId);
  const downstreamDiameter =
    resolveDiameter(params.diameterBySegmentId, params.downstreamSegmentId) ??
    segmentDiameter(params.transition, params.downstreamSegmentId);

  if (!upstreamDiameter || !downstreamDiameter) {
    return true;
  }

  return diameterKey(upstreamDiameter) !== diameterKey(downstreamDiameter);
}

function createTransitionContribution(params: {
  crossing: {
    downstreamSegmentId: string;
    order: number;
    transition: DiameterTransitionProposal;
    upstreamSegmentId: string;
  };
  diameterBySegmentId: DiameterBySegmentId | undefined;
  equipment: WorkbenchEquipment[] | undefined;
  includeBranchTransitions: boolean;
  network: ManualRouteNetwork | undefined;
  pipeSystem: PipeSystem;
  routeId: string;
}): TechnicalRouteTransitionContribution {
  const transition = params.crossing.transition;
  const upstreamSegmentId =
    transition.upstreamSegmentId ?? params.crossing.upstreamSegmentId;
  const downstreamSegmentId = params.crossing.downstreamSegmentId;
  const upstreamDiameter =
    resolveDiameter(params.diameterBySegmentId, upstreamSegmentId) ??
    segmentDiameter(transition, upstreamSegmentId);
  const downstreamDiameter =
    resolveDiameter(params.diameterBySegmentId, downstreamSegmentId) ??
    segmentDiameter(transition, downstreamSegmentId);
  const base = createBaseContribution({
    downstreamDiameter,
    downstreamSegmentId,
    order: params.crossing.order,
    routeId: params.routeId,
    transition,
    upstreamDiameter,
    upstreamSegmentId,
  });

  if (transition.state === "not_required") {
    return {
      ...base,
      equivalentLengthMeters: 0,
      reason: "Transicion inactiva: los diametros actuales son iguales.",
      source: "not_required",
      status: "inactive",
    };
  }

  if (transition.state === "unresolved") {
    return unresolvedContribution({
      ...base,
      reason: transition.reason,
      source: "unconfirmed",
    });
  }

  if (transition.state === "unsupported") {
    return unsupportedContribution({
      ...base,
      reason: transition.reason,
      source: "unconfirmed",
    });
  }

  if (
    transition.state === "rejected" ||
    transition.decision?.status === "rejected"
  ) {
    return unresolvedContribution({
      ...base,
      reason:
        "Transicion de diametro rechazada pero aun requerida por los diametros actuales.",
      source: "rejected",
    });
  }

  if (transition.kind === "compound_turn_transition") {
    return unresolvedContribution({
      ...base,
      reason:
        "Codo con cambio de diametro pendiente de modelado tecnico compuesto.",
      source: "unconfirmed",
    });
  }

  if (transition.kind === "branch_transition") {
    return createBranchTransitionContribution({
      base,
      diameterBySegmentId: params.diameterBySegmentId,
      downstreamSegmentId,
      equipment: params.equipment,
      includeBranchTransitions: params.includeBranchTransitions,
      network: params.network,
      pipeSystem: params.pipeSystem,
      transition,
      upstreamDiameter,
      upstreamSegmentId,
    });
  }

  if (transition.kind !== "simple_reduction") {
    return unsupportedContribution({
      ...base,
      reason:
        "Solo las reducciones simples colineales se resuelven en 09C2A.",
      source: "unconfirmed",
    });
  }

  if (transition.decision?.status !== "confirmed") {
    return unresolvedContribution({
      ...base,
      reason:
        "Transicion activa sin familia profesional confirmada; no se asume perdida cero.",
      source: "unconfirmed",
    });
  }

  if (!transition.decision.catalogFamilyId) {
    return unresolvedContribution({
      ...base,
      reason: "La decision confirmada no contiene familia SIGAS.",
      source: "unconfirmed",
    });
  }

  if (!upstreamDiameter || !downstreamDiameter) {
    return unresolvedContribution({
      ...base,
      catalogFamilyId: transition.decision.catalogFamilyId,
      reason:
        "Faltan diametros actuales para resolver la transicion confirmada.",
      source: "pipe_system",
    });
  }

  const equivalentLengthResolution =
    params.pipeSystem.resolveDiameterTransitionEquivalentLength({
      downstreamDiameter,
      junction: {
        downstreamSegmentId,
        geometryKey: transition.geometryKey,
        upstreamSegmentId,
      },
      transition: {
        catalogFamilyId: transition.decision.catalogFamilyId,
        id: transition.id,
        kind: transition.kind,
        nodeId: transition.nodeId,
      },
      upstreamDiameter,
    });

  if (equivalentLengthResolution.status !== "resolved") {
    return {
      ...base,
      catalogFamilyId: transition.decision.catalogFamilyId,
      equivalentLengthResolution,
      reason: equivalentLengthResolution.reason,
      source: "pipe_system",
      status: equivalentLengthResolution.status,
    };
  }

  return {
    ...base,
    catalogCode: equivalentLengthResolution.value.catalogCode,
    catalogFamilyId: equivalentLengthResolution.value.catalogFamilyId,
    equivalentLengthMeters:
      equivalentLengthResolution.value.equivalentLengthMeters,
    equivalentLengthResolution,
    source: "pipe_system",
    status: "resolved",
    variant: equivalentLengthResolution.value.variant,
  };
}

function createBaseContribution(params: {
  downstreamDiameter: PipeDiameterReference | null;
  downstreamSegmentId: string | null;
  order: number;
  routeId: string;
  transition: DiameterTransitionProposal;
  upstreamDiameter: PipeDiameterReference | null;
  upstreamSegmentId: string | null;
}): TechnicalRouteTransitionContribution {
  return {
    catalogFamilyId: params.transition.decision?.catalogFamilyId,
    downstreamDiameter: params.downstreamDiameter,
    downstreamSegmentId: params.downstreamSegmentId,
    equivalentLengthMeters: null,
    equivalentLengthResolution: null,
    nodeId: params.transition.nodeId,
    order: params.order,
    routeId: params.routeId,
    source: "unconfirmed",
    status: "unresolved",
    transitionId: params.transition.id,
    transitionKind: params.transition.kind,
    traversalKind: null,
    upstreamDiameter: params.upstreamDiameter,
    upstreamSegmentId: params.upstreamSegmentId,
    variant: null,
  };
}

function createBranchTransitionContribution(params: {
  base: TechnicalRouteTransitionContribution;
  diameterBySegmentId: DiameterBySegmentId | undefined;
  downstreamSegmentId: string;
  equipment: WorkbenchEquipment[] | undefined;
  includeBranchTransitions: boolean;
  network: ManualRouteNetwork | undefined;
  pipeSystem: PipeSystem;
  transition: DiameterTransitionProposal;
  upstreamDiameter: PipeDiameterReference | null;
  upstreamSegmentId: string | null;
}): TechnicalRouteTransitionContribution {
  if (!params.includeBranchTransitions) {
    return unresolvedContribution({
      ...params.base,
      reason: "Tee multidiametro pendiente de modelar por variante de recorrido.",
      source: "unconfirmed",
    });
  }

  if (params.transition.decision?.status !== "confirmed") {
    return unresolvedContribution({
      ...params.base,
      reason:
        "Tee reductora activa sin familia profesional confirmada; no se asume perdida cero.",
      source: "unconfirmed",
    });
  }

  if (!params.transition.decision.catalogFamilyId) {
    return unresolvedContribution({
      ...params.base,
      reason: "La decision confirmada no contiene familia SIGAS.",
      source: "unconfirmed",
    });
  }

  if (!params.upstreamDiameter || !params.base.downstreamDiameter) {
    return unresolvedContribution({
      ...params.base,
      catalogFamilyId: params.transition.decision.catalogFamilyId,
      reason:
        "Faltan diametros actuales para resolver la tee reductora confirmada.",
      source: "pipe_system",
    });
  }

  const pairResolution = resolveBranchTransitionRepresentablePair({
    diameterBySegmentId: params.diameterBySegmentId,
    transition: params.transition,
  });

  if (pairResolution.status !== "resolved") {
    return {
      ...params.base,
      catalogFamilyId: params.transition.decision.catalogFamilyId,
      reason: pairResolution.reason,
      source: "pipe_system",
      status: pairResolution.status,
    };
  }

  const traversalKind = classifyBranchTraversalKind({
    downstreamSegmentId: params.downstreamSegmentId,
    equipment: params.equipment,
    network: params.network,
    transition: params.transition,
    upstreamSegmentId: params.upstreamSegmentId,
  });

  if (!traversalKind) {
    return unsupportedContribution({
      ...params.base,
      catalogFamilyId: params.transition.decision.catalogFamilyId,
      reason:
        "No se pudo distinguir si el recorrido atraviesa la tee o gira a 90.",
      source: "pipe_system",
    });
  }

  const equivalentLengthResolution =
    params.pipeSystem.resolveDiameterTransitionEquivalentLength({
      downstreamDiameter: pairResolution.smallerDiameter,
      junction: {
        downstreamSegmentId: params.downstreamSegmentId,
        geometryKey: params.transition.geometryKey,
        upstreamSegmentId: params.upstreamSegmentId,
      },
      transition: {
        catalogFamilyId: params.transition.decision.catalogFamilyId,
        id: params.transition.id,
        kind: params.transition.kind,
        nodeId: params.transition.nodeId,
        traversalKind,
      },
      upstreamDiameter: pairResolution.largerDiameter,
    });

  if (equivalentLengthResolution.status !== "resolved") {
    return {
      ...params.base,
      catalogFamilyId: params.transition.decision.catalogFamilyId,
      equivalentLengthResolution,
      reason: equivalentLengthResolution.reason,
      source: "pipe_system",
      status: equivalentLengthResolution.status,
      traversalKind,
    };
  }

  return {
    ...params.base,
    catalogCode: equivalentLengthResolution.value.catalogCode,
    catalogFamilyId: equivalentLengthResolution.value.catalogFamilyId,
    equivalentLengthMeters:
      equivalentLengthResolution.value.equivalentLengthMeters,
    equivalentLengthResolution,
    source: "pipe_system",
    status: "resolved",
    traversalKind,
    variant: equivalentLengthResolution.value.variant,
  };
}

function createDuplicateContribution(params: {
  crossing: {
    downstreamSegmentId: string;
    order: number;
    transition: DiameterTransitionProposal;
    upstreamSegmentId: string;
  };
  reason: string;
  routeId: string;
}) {
  const transition = params.crossing.transition;

  return {
    catalogFamilyId: transition.decision?.catalogFamilyId,
    downstreamDiameter: segmentDiameter(
      transition,
      params.crossing.downstreamSegmentId,
    ),
    downstreamSegmentId: params.crossing.downstreamSegmentId,
    equivalentLengthMeters: null,
    equivalentLengthResolution: null,
    nodeId: transition.nodeId,
    order: params.crossing.order,
    reason: params.reason,
    routeId: params.routeId,
    source: "duplicate" as const,
    status: "unresolved" as const,
    transitionId: transition.id,
    transitionKind: transition.kind,
    traversalKind: null,
    upstreamDiameter: segmentDiameter(
      transition,
      transition.upstreamSegmentId ?? params.crossing.upstreamSegmentId,
    ),
    upstreamSegmentId:
      transition.upstreamSegmentId ?? params.crossing.upstreamSegmentId,
    variant: null,
  };
}

function unresolvedContribution(
  contribution: TechnicalRouteTransitionContribution & {
    reason: string;
    source: TechnicalRouteTransitionContributionSource;
  },
) {
  return {
    ...contribution,
    source: contribution.source,
    status: "unresolved" as const,
  };
}

function unsupportedContribution(
  contribution: TechnicalRouteTransitionContribution & {
    reason: string;
    source: TechnicalRouteTransitionContributionSource;
  },
) {
  return {
    ...contribution,
    source: contribution.source,
    status: "unsupported" as const,
  };
}

function resolveBranchTransitionRepresentablePair(params: {
  diameterBySegmentId: DiameterBySegmentId | undefined;
  transition: DiameterTransitionProposal;
}):
  | {
      largerDiameter: PipeDiameterReference;
      smallerDiameter: PipeDiameterReference;
      status: "resolved";
    }
  | {
      reason: string;
      status: "unresolved" | "unsupported";
    } {
  const diameters = params.transition.incidentSegments.map((segment) =>
    resolveDiameter(params.diameterBySegmentId, segment.segmentId) ??
    segment.diameter,
  );

  if (diameters.some((diameter) => !diameter)) {
    return {
      reason:
        "Faltan diametros actuales para representar la tee reductora.",
      status: "unresolved",
    };
  }

  const byExternalMillimeters = new Map<number, PipeDiameterReference>();

  for (const diameter of diameters as PipeDiameterReference[]) {
    const value = diameter.externalDiameterMillimeters;

    if (value === undefined || !Number.isFinite(value)) {
      return {
        reason:
          "La tee reductora requiere diametros con diametro exterior reconocible.",
        status: "unsupported",
      };
    }

    byExternalMillimeters.set(value, diameter);
  }

  const values = [...byExternalMillimeters.keys()].sort(
    (first, second) => first - second,
  );

  if (values.length !== 2) {
    return {
      reason:
        values.length < 2
          ? "La tee no requiere reduccion con los diametros actuales."
          : "La tee tiene tres diametros distintos y no es representable por Te Reduc. Central.",
      status: values.length < 2 ? "unresolved" : "unsupported",
    };
  }

  const smallerDiameter = byExternalMillimeters.get(values[0] as number);
  const largerDiameter = byExternalMillimeters.get(values[1] as number);

  if (!smallerDiameter || !largerDiameter) {
    return {
      reason: "No se pudo reconstruir el par de diametros de la tee reductora.",
      status: "unresolved",
    };
  }

  return {
    largerDiameter,
    smallerDiameter,
    status: "resolved",
  };
}

function classifyBranchTraversalKind(params: {
  downstreamSegmentId: string;
  equipment: WorkbenchEquipment[] | undefined;
  network: ManualRouteNetwork | undefined;
  transition: DiameterTransitionProposal;
  upstreamSegmentId: string | null;
}): PipeDiameterTransitionTraversalKind | null {
  if (!params.network || !params.equipment || !params.upstreamSegmentId) {
    return null;
  }

  const upstreamVector = incidentVectorAtTransitionNode({
    equipment: params.equipment,
    network: params.network,
    segmentId: params.upstreamSegmentId,
    transition: params.transition,
  });
  const downstreamVector = incidentVectorAtTransitionNode({
    equipment: params.equipment,
    network: params.network,
    segmentId: params.downstreamSegmentId,
    transition: params.transition,
  });

  if (!upstreamVector || !downstreamVector) {
    return null;
  }

  const angle = angleBetweenVectors(upstreamVector, downstreamVector);
  const straightDistance = Math.min(angle, Math.abs(180 - angle));
  const turnDistance = Math.abs(90 - angle);

  if (straightDistance <= 5) {
    return "through";
  }

  if (turnDistance <= 15) {
    return "turn_90";
  }

  return null;
}

function incidentVectorAtTransitionNode(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  segmentId: string;
  transition: DiameterTransitionProposal;
}) {
  const incident = params.transition.incidentSegments.find(
    (segment) => segment.segmentId === params.segmentId,
  );

  if (!incident) {
    return null;
  }

  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const neighborNode = nodeById.get(incident.neighborNodeId);
  const equipmentById = buildEquipmentIndex(params.equipment);
  const neighborPosition = neighborNode
    ? resolveRouteNodePosition(neighborNode, equipmentById)
    : null;

  if (!neighborPosition) {
    return null;
  }

  return {
    x: neighborPosition.x - params.transition.position.x,
    y: neighborPosition.y - params.transition.position.y,
  };
}

function angleBetweenVectors(
  first: { x: number; y: number },
  second: { x: number; y: number },
) {
  const firstLength = Math.hypot(first.x, first.y);
  const secondLength = Math.hypot(second.x, second.y);

  if (firstLength === 0 || secondLength === 0) {
    return 0;
  }

  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (first.x * second.x + first.y * second.y) /
        (firstLength * secondLength),
    ),
  );

  return (Math.acos(cosine) * 180) / Math.PI;
}

function resolveOverallStatus(
  contributions: TechnicalRouteTransitionContribution[],
  reasons: string[],
): PipeSystemResolutionStatus {
  if (
    contributions.some((contribution) => contribution.status === "unsupported")
  ) {
    return "unsupported";
  }

  if (
    reasons.length > 0 ||
    contributions.some((contribution) => contribution.status === "unresolved")
  ) {
    return "unresolved";
  }

  return "resolved";
}

function sumTransitionContributions(
  contributions: TechnicalRouteTransitionContribution[],
  kinds: DiameterTransitionKind[],
) {
  return contributions
    .filter((contribution) => kinds.includes(contribution.transitionKind))
    .reduce(
      (sum, contribution) => sum + (contribution.equivalentLengthMeters ?? 0),
      0,
    );
}

function segmentDiameter(
  transition: DiameterTransitionProposal,
  segmentId: string | null,
) {
  if (!segmentId) {
    return null;
  }

  return (
    transition.incidentSegments.find((segment) => segment.segmentId === segmentId)
      ?.diameter ?? null
  );
}

function resolveDiameter(
  diameterBySegmentId: DiameterBySegmentId | undefined,
  segmentId: string | null,
) {
  if (!diameterBySegmentId || !segmentId) {
    return null;
  }

  return diameterBySegmentId instanceof Map
    ? diameterBySegmentId.get(segmentId) ?? null
    : diameterBySegmentId[segmentId] ?? null;
}

function diameterKey(diameter: PipeDiameterReference) {
  return [
    diameter.id,
    diameter.externalDiameterMillimeters ?? "",
    diameter.internalDiameterMillimeters ?? "",
    diameter.nominalDiameter ?? "",
  ].join(":");
}

function addUniqueReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}
