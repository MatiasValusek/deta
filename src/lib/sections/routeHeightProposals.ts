import type { AdoptedDiameterDecision } from "@/lib/calculation/professionalDiameterAdoption";
import type { PipeSegmentPipeContext, PipeSystem } from "@/lib/calculation/pipeSystem";
import type { ProjectGasConfig } from "@/lib/calculation/projectGas";
import { createTechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
  type TechnicalCalculationStatus,
  type TechnicalRoute,
} from "@/lib/calculation/technicalTree";
import type { DiameterTransitionDecision } from "@/lib/calculation/diameterTransitionProposals";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  DEFAULT_UNVERIFIED_ELEVATION,
  type ElevationMetadata,
  type ElevationSource,
} from "@/lib/geometry/height";
import type { Point2D } from "@/lib/geometry/types";
import {
  isEquipmentTerminalSegment,
  resolveRouteSegments,
  routeSegmentHorizontalLengthSource,
} from "@/lib/routing/network";
import type { AccessoryProposal } from "@/lib/routing/routeAccessoryProposals";
import type {
  AutomaticRouteRestriction,
  ManualRouteNetwork,
  RouteNode,
  RouteSegment,
} from "@/lib/routing/types";
import {
  applySectionRouteHeightEdit,
  sectionRouteHeightTargetKey,
  type SectionRouteHeightTarget,
} from "@/lib/sections/routeHeightEditing";
import { createTechnicalRouteNodeElevationIndex } from "@/lib/sections/technicalRouteElevation";
import {
  generateAutomaticRouteRisers,
  type AutomaticRouteRiserProposal,
} from "@/lib/sections/routeRiserProposals";
import {
  generateAutomaticInternalLevelChanges,
  type AutomaticInternalLevelProposal,
  type InternalLevelAlternative,
} from "@/lib/sections/routeInternalLevelProposals";

const HEIGHT_EPSILON_METERS = 0.000001;

export type RouteHeightProposalState = "suggested";

export type RouteHeightConfirmedReference = {
  heightMeters: number;
  source: ElevationSource;
  status: "confirmed";
  target: SectionRouteHeightTarget;
  targetKey: string;
};

export type RouteHeightProposalDiagnosticCode =
  | "automatic_risers_incomplete"
  | "internal_level_changes_incomplete"
  | "invalid_distribution_height"
  | "insufficient_confirmed_references"
  | "level_change_requires_definition"
  | "main_route_unavailable"
  | "simulation_failed";

export type RouteHeightProposalDiagnostic = {
  code: RouteHeightProposalDiagnosticCode;
  message: string;
  neededData: string;
  referenceTargetKeys: string[];
  targetKeys: string[];
};

export type RouteHeightProposalLengthImpact = {
  affectedSegments: Array<{
    afterMeters: number | null;
    beforeMeters: number | null;
    deltaMeters: number | null;
    segmentId: string;
  }>;
  mainRouteAfterMeters: number | null;
  mainRouteBeforeMeters: number | null;
  mainRouteDeltaMeters: number | null;
  totalAfterMeters: number | null;
  totalBeforeMeters: number | null;
  totalDeltaMeters: number | null;
};

export type RouteHeightProposalConnectionImpact = {
  changedEquipmentIds: string[];
  changedNodeIds: string[];
  changedSegmentIds: string[];
  topologyChanged: boolean;
};

export type RouteHeightProposalAccessoryImpact = {
  addedIds: string[];
  changedIds: string[];
  physicalCountAfter: number;
  physicalCountBefore: number;
  removedIds: string[];
  statusAfter: "pending" | "resolved" | "unavailable";
  statusBefore: "pending" | "resolved" | "unavailable";
};

export type RouteHeightProposalCalculationImpact = {
  addedIssues: string[];
  diameterChanges: Array<{
    afterDiameterId: string | null;
    beforeDiameterId: string | null;
    segmentId: string;
  }>;
  removedIssues: string[];
  statusAfter: TechnicalCalculationStatus;
  statusBefore: TechnicalCalculationStatus;
  validationsPreserved: boolean;
};

export type RouteHeightProposalMaterialImpact = {
  accessoryQuantityAfter: number;
  accessoryQuantityBefore: number;
  pipeLengthAfterMeters: number;
  pipeLengthBeforeMeters: number;
  pipeLengthDeltaMeters: number;
  pipeSegmentCountAfter: number;
  pipeSegmentCountBefore: number;
  statusAfter: "pending" | "resolved" | "unavailable";
  statusBefore: "pending" | "resolved" | "unavailable";
};

export type RouteHeightProposalSimulation = {
  accessories: RouteHeightProposalAccessoryImpact;
  calculations: RouteHeightProposalCalculationImpact;
  connections: RouteHeightProposalConnectionImpact;
  lengths: RouteHeightProposalLengthImpact;
  materials: RouteHeightProposalMaterialImpact;
  status: "ready";
};

export type RouteInternalLevelAlternativeEvaluation =
  InternalLevelAlternative & {
    score: {
      accessoryCount: number;
      addedCalculationIssueCount: number;
      directionChangeCount: number;
      physicalLengthMeters: number | null;
      pipeLengthMeters: number;
      topologyChanged: boolean;
    };
    simulation: RouteHeightProposalSimulation;
    technicallyViable: boolean;
  };

export type RouteInternalLevelProposalEvaluation = Omit<
  AutomaticInternalLevelProposal,
  "alternatives"
> & {
  alternatives: RouteInternalLevelAlternativeEvaluation[];
  recommendedAlternativeId: string | null;
};

export type ProfessionalDistributionHeight = {
  heightMeters: number;
  reference: "project_datum";
  source: "professional";
};

export type RouteHeightProposalSector = {
  confirmedReferenceTargetKeys: string[];
  id: string;
  neededData: string | null;
  reason: string;
  segmentIds: string[];
  status: "confirmed" | "resolved_by_proposal" | "requires_decision";
  targetKeys: string[];
};

export type CoordinatedRouteHeightProposalSimulation = {
  candidateEquipment: WorkbenchEquipment[];
  candidateNetwork: ManualRouteNetwork;
  proposalIds: string[];
  simulation: RouteHeightProposalSimulation;
  targetKeys: string[];
  technicalResult: TechnicalCalculationResult;
};

export type RouteHeightProposal = {
  heightMeters: number;
  id: string;
  justification: string;
  provenance: {
    method: "matching_confirmed_boundaries";
    references: [
      RouteHeightConfirmedReference,
      RouteHeightConfirmedReference,
    ];
    routeId: string;
  } | {
    method: "professional_distribution_height";
    reference: ProfessionalDistributionHeight;
    segmentIds: string[];
  };
  simulation: RouteHeightProposalSimulation;
  state: RouteHeightProposalState;
  suggestedElevation: ElevationMetadata & {
    source: "derived_calculation";
    status: "suggested";
  };
  target: SectionRouteHeightTarget;
  targetKey: string;
};

export type RouteHeightProposalMainRoute = {
  horizontalLengthMeters: number | null;
  horizontalLengthSource: number;
  id: string;
  nodeIds: string[];
  segmentIds: string[];
  selection: "explicit_terminal" | "longest_xy";
  terminalEquipmentId: string;
};

export type RouteHeightProposalEngineResult = {
  automaticRisers: AutomaticRouteRiserProposal | null;
  coordinatedSimulation: CoordinatedRouteHeightProposalSimulation | null;
  confirmedReferences: RouteHeightConfirmedReference[];
  diagnostics: RouteHeightProposalDiagnostic[];
  mainRoute: RouteHeightProposalMainRoute | null;
  internalLevelChanges: RouteInternalLevelProposalEvaluation | null;
  mode:
    | "matching_confirmed_boundaries"
    | "professional_distribution_height";
  proposals: RouteHeightProposal[];
  sectors: RouteHeightProposalSector[];
};

export type RouteHeightProposalEngineParams = {
  accessoryProposals?: AccessoryProposal[];
  adoptedDiameterDecisions?: AdoptedDiameterDecision[];
  diameterTransitionDecisions?: DiameterTransitionDecision[];
  equipment: WorkbenchEquipment[];
  mainRouteTerminalEquipmentId?: string | null;
  minSegmentLengthSource: number;
  network: ManualRouteNetwork;
  pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
  pipeSystem?: PipeSystem;
  professionalDistributionHeight?: ProfessionalDistributionHeight | null;
  projectGas?: ProjectGasConfig | null;
  restrictions?: AutomaticRouteRestriction[];
  scaleMetersPerSourceUnit: number | null;
};

type OrderedRouteHeightPoint = {
  heightMeters: number | null;
  metadata: ElevationMetadata;
  target: SectionRouteHeightTarget;
  targetKey: string;
};

type PendingHeightGroup = {
  after: OrderedRouteHeightPoint | null;
  before: OrderedRouteHeightPoint | null;
  points: OrderedRouteHeightPoint[];
};

type DistributionHeightTarget = OrderedRouteHeightPoint & {
  segmentIds: string[];
};

export function createRouteHeightProposals(
  params: RouteHeightProposalEngineParams,
): RouteHeightProposalEngineResult {
  const baseline = calculateHeightProposalTechnicalTree(params, {
    equipment: params.equipment,
    network: params.network,
  });
  const mainRouteSelection = selectMainRoute(params, baseline);
  const professionalDistributionHeight =
    params.professionalDistributionHeight ?? null;

  if (professionalDistributionHeight) {
    return createProfessionalDistributionHeightProposals({
      baseline,
      mainRouteSelection,
      params,
      reference: professionalDistributionHeight,
    });
  }

  if (!mainRouteSelection) {
    return {
      automaticRisers: null,
      coordinatedSimulation: null,
      confirmedReferences: [],
      diagnostics: [
        {
          code: "main_route_unavailable",
          message:
            "No se pudo identificar un recorrido principal tecnico para analizar alturas.",
          neededData:
            "Complete una red valida y conectada entre la alimentacion y al menos un artefacto.",
          referenceTargetKeys: [],
          targetKeys: [],
        },
      ],
      internalLevelChanges: null,
      mainRoute: null,
      mode: "matching_confirmed_boundaries",
      proposals: [],
      sectors: [],
    };
  }

  const routePoints = orderedMainRouteHeightPoints({
    equipment: params.equipment,
    network: params.network,
    route: mainRouteSelection.route,
  });
  const confirmedReferences = routePoints
    .filter(isConfirmedHeightReference)
    .map(confirmedReference);
  const proposals: RouteHeightProposal[] = [];
  const diagnostics: RouteHeightProposalDiagnostic[] = [];

  for (const group of pendingHeightGroups(routePoints)) {
    const before = group.before;
    const after = group.after;

    if (
      !before ||
      !after ||
      !isConfirmedHeightReference(before) ||
      !isConfirmedHeightReference(after)
    ) {
      diagnostics.push(insufficientReferencesDiagnostic(group));
      continue;
    }

    if (!sameHeight(before.heightMeters, after.heightMeters)) {
      diagnostics.push(levelChangeDiagnostic(group, before, after));
      continue;
    }

    const beforeReference = confirmedReference(before);
    const afterReference = confirmedReference(after);

    for (const point of group.points) {
      const proposal = simulateHeightProposal({
        afterReference,
        baseline,
        beforeReference,
        params,
        point,
        route: mainRouteSelection.route,
      });

      if (proposal.ok) {
        proposals.push(proposal.proposal);
      } else {
        diagnostics.push(proposal.diagnostic);
      }
    }
  }

  const internalLevelChanges = evaluateInternalLevelChanges({
    baseline,
    equipment: params.equipment,
    network: params.network,
    params,
  });
  const effectiveDiagnostics =
    internalLevelChanges.status === "ready" &&
    internalLevelChanges.requiredChangeCount > 0 &&
    internalLevelChanges.recommendedAlternativeId
      ? diagnostics.filter(
          (diagnostic) =>
            diagnostic.code !== "level_change_requires_definition",
        )
      : diagnostics;

  if (
    internalLevelChanges.requiredChangeCount > 0 &&
    !internalLevelChanges.recommendedAlternativeId
  ) {
    effectiveDiagnostics.push(internalLevelChangeDiagnostic(internalLevelChanges));
  }

  return {
    automaticRisers: null,
    coordinatedSimulation: null,
    confirmedReferences,
    diagnostics: effectiveDiagnostics,
    internalLevelChanges,
    mainRoute: mainRouteResult(
      mainRouteSelection,
      params.scaleMetersPerSourceUnit,
    ),
    mode: "matching_confirmed_boundaries",
    proposals,
    sectors: fallbackRouteSectors({
      diagnostics: effectiveDiagnostics,
      proposals,
      route: mainRouteSelection.route,
    }),
  };
}

function createProfessionalDistributionHeightProposals(params: {
  baseline: TechnicalCalculationResult;
  mainRouteSelection: NonNullable<ReturnType<typeof selectMainRoute>> | null;
  params: RouteHeightProposalEngineParams;
  reference: ProfessionalDistributionHeight;
}): RouteHeightProposalEngineResult {
  if (!Number.isFinite(params.reference.heightMeters)) {
    return {
      automaticRisers: null,
      coordinatedSimulation: null,
      confirmedReferences: [],
      diagnostics: [
        {
          code: "invalid_distribution_height",
          message: "La altura de distribucion debe ser un numero finito.",
          neededData:
            "Indique una altura de distribucion valida referida a la cota del proyecto.",
          referenceTargetKeys: [],
          targetKeys: [],
        },
      ],
      internalLevelChanges: null,
      mainRoute: params.mainRouteSelection
        ? mainRouteResult(
            params.mainRouteSelection,
            params.params.scaleMetersPerSourceUnit,
          )
        : null,
      mode: "professional_distribution_height",
      proposals: [],
      sectors: params.params.network.segments.map((segment) => ({
        confirmedReferenceTargetKeys: [],
        id: `segment:${segment.id}`,
        neededData:
          "Indique una altura de distribucion valida referida a la cota del proyecto.",
        reason: "La referencia profesional de distribucion no es valida.",
        segmentIds: [segment.id],
        status: "requires_decision" as const,
        targetKeys: [],
      })),
    };
  }

  if (params.baseline.status === "invalid") {
    return {
      automaticRisers: null,
      coordinatedSimulation: null,
      confirmedReferences: [],
      diagnostics: [
        {
          code: "main_route_unavailable",
          message:
            "La red no permite validar tecnicamente una propuesta coordinada de alturas.",
          neededData:
            "Corrija primero la conectividad y la geometria invalida de la red.",
          referenceTargetKeys: [],
          targetKeys: [],
        },
      ],
      internalLevelChanges: null,
      mainRoute: params.mainRouteSelection
        ? mainRouteResult(
            params.mainRouteSelection,
            params.params.scaleMetersPerSourceUnit,
          )
        : null,
      mode: "professional_distribution_height",
      proposals: [],
      sectors: params.params.network.segments.map((segment) => ({
        confirmedReferenceTargetKeys: [],
        id: `segment:${segment.id}`,
        neededData:
          "Corrija primero la conectividad y la geometria invalida de la red.",
        reason: "La simulacion tecnica de la red de base no es valida.",
        segmentIds: [segment.id],
        status: "requires_decision" as const,
        targetKeys: [],
      })),
    };
  }

  const analysis = analyzeDistributionNetwork({
    equipment: params.params.equipment,
    heightMeters: params.reference.heightMeters,
    network: params.params.network,
  });
  const proposals: RouteHeightProposal[] = [];
  const diagnostics: RouteHeightProposalDiagnostic[] = [];

  for (const target of analysis.targets) {
    const proposal = simulateProfessionalDistributionHeightProposal({
      baseline: params.baseline,
      params: params.params,
      reference: params.reference,
      target,
    });

    if (proposal.ok) {
      proposals.push(proposal.proposal);
    } else {
      diagnostics.push(proposal.diagnostic);
    }
  }

  const coordinated = simulateCoordinatedHeightProposals({
    baseline: params.baseline,
    params: params.params,
    proposals,
  });
  const recommendedInternalAlternative =
    coordinated.internalLevelChanges?.alternatives.find(
      (alternative) =>
        alternative.id ===
        coordinated.internalLevelChanges?.recommendedAlternativeId,
    ) ?? null;
  const automaticallyResolvedSegmentIds = new Set([
    ...(coordinated.riserProposal.status === "ready"
      ? coordinated.riserProposal.risers.map((riser) => riser.segmentId)
      : []),
    ...(recommendedInternalAlternative?.changes.map(
      (change) => change.segmentId,
    ) ?? []),
  ]);
  const analysisDiagnostics = analysis.diagnostics.filter(
    (diagnostic) =>
      !diagnosticResolvedByAutomaticRiser(
        diagnostic,
        analysis.sectors,
        automaticallyResolvedSegmentIds,
      ),
  );
  const analysisSectors = analysis.sectors.map((sector) =>
    sector.status === "requires_decision" &&
    sector.segmentIds.some((segmentId) =>
      automaticallyResolvedSegmentIds.has(segmentId),
    )
      ? {
          ...sector,
          neededData: null,
          reason:
            "El cambio entre cotas conocidas queda resuelto por un montante automatico ortogonal propuesto.",
          status: "resolved_by_proposal" as const,
        }
      : sector,
  );
  const proposedTargetKeys = new Set(
    proposals.map((proposal) => proposal.targetKey),
  );
  const individuallyEvaluatedSectors = analysisSectors.map((sector) =>
    sector.status === "resolved_by_proposal" &&
    sector.targetKeys.some((targetKey) => !proposedTargetKeys.has(targetKey))
      ? {
          ...sector,
          neededData:
            "Revise los puntos cuya simulacion individual no conserva las validaciones tecnicas.",
          reason:
            "Uno o mas puntos del sector no superaron la simulacion tecnica individual.",
          status: "requires_decision" as const,
        }
      : sector,
  );

  if (!coordinated.ok) {
    diagnostics.push(coordinated.diagnostic);
  } else if (coordinated.riserProposal.status === "incomplete") {
    diagnostics.push({
      code: "automatic_risers_incomplete",
      message:
        "La distribucion en altura pudo simularse, pero uno o mas montantes necesitan datos profesionales.",
      neededData:
        coordinated.riserProposal.diagnostics[0]?.neededData ??
        "Complete las cotas y configuraciones pendientes de medidor y terminales.",
      referenceTargetKeys: [],
      targetKeys: coordinated.riserProposal.diagnostics.flatMap((diagnostic) =>
        diagnostic.segmentId ? [`segment:${diagnostic.segmentId}`] : [],
      ),
    });
  }

  const acceptedProposals = coordinated.ok
    ? proposals.map((proposal) => ({
        ...proposal,
        simulation: coordinated.simulation,
      }))
    : [];
  const sectors = coordinated.ok
    ? individuallyEvaluatedSectors
    : individuallyEvaluatedSectors.map((sector) =>
        sector.status === "resolved_by_proposal"
          ? {
              ...sector,
              neededData:
                "Revise el sector y resuelva las observaciones de la simulacion tecnica conjunta.",
              reason:
                "La propuesta coordinada no conserva las validaciones tecnicas.",
              status: "requires_decision" as const,
            }
          : sector,
      );

  return {
    automaticRisers: coordinated.riserProposal,
    coordinatedSimulation: coordinated.ok
      ? {
          candidateEquipment: coordinated.candidateEquipment,
          candidateNetwork: coordinated.candidateNetwork,
          proposalIds: acceptedProposals.map((proposal) => proposal.id),
          simulation: coordinated.simulation,
          targetKeys: acceptedProposals.map((proposal) => proposal.targetKey),
          technicalResult: coordinated.technicalResult,
        }
      : null,
    confirmedReferences: analysis.confirmedReferences,
    diagnostics: [
      ...analysisDiagnostics,
      ...diagnostics,
    ],
    internalLevelChanges: coordinated.internalLevelChanges,
    mainRoute: params.mainRouteSelection
      ? mainRouteResult(
          params.mainRouteSelection,
          params.params.scaleMetersPerSourceUnit,
        )
      : null,
    mode: "professional_distribution_height",
    proposals: acceptedProposals,
    sectors,
  };
}

function diagnosticResolvedByAutomaticRiser(
  diagnostic: RouteHeightProposalDiagnostic,
  sectors: RouteHeightProposalSector[],
  resolvedSegmentIds: Set<string>,
) {
  if (
    diagnostic.code !== "level_change_requires_definition" ||
    resolvedSegmentIds.size === 0
  ) {
    return false;
  }

  return sectors.some(
    (sector) =>
      sector.segmentIds.some((segmentId) =>
        resolvedSegmentIds.has(segmentId),
      ) &&
      diagnostic.referenceTargetKeys.every((targetKey) =>
        sector.confirmedReferenceTargetKeys.includes(targetKey),
      ) &&
      diagnostic.targetKeys.every((targetKey) =>
        sector.targetKeys.includes(targetKey),
      ),
  );
}

function analyzeDistributionNetwork(params: {
  equipment: WorkbenchEquipment[];
  heightMeters: number;
  network: ManualRouteNetwork;
}) {
  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const nodeElevationById = createTechnicalRouteNodeElevationIndex(params);
  const nodePoints = new Map(
    params.network.nodes.map((node) => [
      node.id,
      routeNodeHeightPoint(node.id, nodeById, nodeElevationById),
    ]),
  );
  const confirmedReferencesByKey = new Map<
    string,
    RouteHeightConfirmedReference
  >();
  const targetsByKey = new Map<string, DistributionHeightTarget>();
  const diagnostics: RouteHeightProposalDiagnostic[] = [];
  const sectors: RouteHeightProposalSector[] = [];

  for (const point of nodePoints.values()) {
    if (isConfirmedHeightReference(point)) {
      confirmedReferencesByKey.set(point.targetKey, confirmedReference(point));
    }
  }

  for (const node of params.network.nodes) {
    if (node.kind !== "route") {
      continue;
    }

    const point = nodePoints.get(node.id);

    if (!point || isConfirmedHeightReference(point)) {
      continue;
    }

    const segmentIds = params.network.segments
      .filter(
        (segment) =>
          segment.fromNodeId === node.id || segment.toNodeId === node.id,
      )
      .map((segment) => segment.id)
      .sort();

    targetsByKey.set(point.targetKey, { ...point, segmentIds });
  }

  for (const segment of params.network.segments) {
    const fromNode = nodeById.get(segment.fromNodeId) ?? null;
    const toNode = nodeById.get(segment.toNodeId) ?? null;
    const endpointPoints = [
      nodePoints.get(segment.fromNodeId),
      nodePoints.get(segment.toNodeId),
    ].filter((point): point is OrderedRouteHeightPoint => Boolean(point));
    const vertexPoints = (segment.vertices ?? []).map((point, vertexIndex) =>
      routeVertexHeightPoint(segment, { point, vertexIndex }),
    );
    const confirmedPoints = [...endpointPoints, ...vertexPoints].filter(
      isConfirmedHeightReference,
    );

    for (const point of confirmedPoints) {
      confirmedReferencesByKey.set(point.targetKey, confirmedReference(point));
    }

    const conflictingReferences = confirmedPoints.filter(
      (point) => !sameHeight(point.heightMeters, params.heightMeters),
    );
    const touchesAppliance =
      fromNode?.kind === "appliance" || toNode?.kind === "appliance";
    const terminalSegment =
      touchesAppliance || isEquipmentTerminalSegment(segment);
    const unconfirmedEquipmentPoints = endpointPoints.filter((point, index) => {
      const node = index === 0 ? fromNode : toNode;

      return (
        Boolean(node && (node.kind === "supply" || node.kind === "appliance")) &&
        !isConfirmedHeightReference(point)
      );
    });
    const skippedVertexPoints = vertexPoints.filter(
      (point) => !isConfirmedHeightReference(point),
    );

    if (!terminalSegment && conflictingReferences.length === 0) {
      for (const point of skippedVertexPoints) {
        targetsByKey.set(point.targetKey, {
          ...point,
          segmentIds: [segment.id],
        });
      }
    }

    const targetKeys = [
      ...endpointPoints
        .filter((point) => targetsByKey.has(point.targetKey))
        .map((point) => point.targetKey),
      ...(!terminalSegment && conflictingReferences.length === 0
        ? skippedVertexPoints.map((point) => point.targetKey)
        : []),
    ].sort();
    const confirmedReferenceTargetKeys = confirmedPoints
      .map((point) => point.targetKey)
      .sort();
    let sector: RouteHeightProposalSector;

    if (conflictingReferences.length > 0) {
      sector = {
        confirmedReferenceTargetKeys,
        id: `segment:${segment.id}`,
        neededData:
          "Defina el punto y la geometria del cambio de nivel en este sector.",
        reason:
          "El sector contiene una cota confirmada diferente de la altura general de distribucion.",
        segmentIds: [segment.id],
        status: "requires_decision",
        targetKeys,
      };
      diagnostics.push({
        code: "level_change_requires_definition",
        message: `El tramo ${segment.id} contiene una cota confirmada diferente de ${formatHeightMeters(
          params.heightMeters,
        )} m.`,
        neededData:
          sector.neededData ??
          "Defina el punto y la geometria del cambio de nivel en este sector.",
        referenceTargetKeys: conflictingReferences.map(
          (point) => point.targetKey,
        ),
        targetKeys,
      });
    } else if (
      unconfirmedEquipmentPoints.length > 0 ||
      (terminalSegment && skippedVertexPoints.length > 0)
    ) {
      sector = {
        confirmedReferenceTargetKeys,
        id: `segment:${segment.id}`,
        neededData: touchesAppliance
          ? "Confirme la cota y la resolucion fisica de la conexion terminal."
          : "Confirme la cota del medidor o del extremo de alimentacion.",
        reason: touchesAppliance
          ? "La altura general no reemplaza la conexion terminal del artefacto."
          : "La altura general no modifica automaticamente el medidor.",
        segmentIds: [segment.id],
        status: "requires_decision",
        targetKeys,
      };
    } else {
      sector = {
        confirmedReferenceTargetKeys,
        id: `segment:${segment.id}`,
        neededData: null,
        reason:
          targetKeys.length > 0
            ? "Los puntos de distribucion pendientes quedan cubiertos por la propuesta coordinada."
            : "Las alturas del sector ya estan confirmadas.",
        segmentIds: [segment.id],
        status:
          targetKeys.length > 0 ? "resolved_by_proposal" : "confirmed",
        targetKeys,
      };
    }

    sectors.push(sector);
  }

  return {
    confirmedReferences: [...confirmedReferencesByKey.values()].sort(
      (first, second) => first.targetKey.localeCompare(second.targetKey),
    ),
    diagnostics,
    sectors: sectors.sort((first, second) => first.id.localeCompare(second.id)),
    targets: [...targetsByKey.values()].sort((first, second) =>
      first.targetKey.localeCompare(second.targetKey),
    ),
  };
}

function simulateProfessionalDistributionHeightProposal(params: {
  baseline: TechnicalCalculationResult;
  params: RouteHeightProposalEngineParams;
  reference: ProfessionalDistributionHeight;
  target: DistributionHeightTarget;
}):
  | { ok: true; proposal: RouteHeightProposal }
  | { diagnostic: RouteHeightProposalDiagnostic; ok: false } {
  const simulated = simulateHeightTarget({
    allowUnpreservedCalculation: true,
    baseline: params.baseline,
    heightMeters: params.reference.heightMeters,
    params: params.params,
    target: params.target,
  });

  if (!simulated.ok) {
    return simulated;
  }

  return {
    ok: true,
    proposal: {
      heightMeters: params.reference.heightMeters,
      id: `height-proposal:distribution:${params.target.targetKey}:${formatHeightId(
        params.reference.heightMeters,
      )}`,
      justification:
        `La cota ${formatHeightMeters(
          params.reference.heightMeters,
        )} m fue definida expresamente por el profesional como altura de distribucion ` +
        "referida a la cota del proyecto.",
      provenance: {
        method: "professional_distribution_height",
        reference: { ...params.reference },
        segmentIds: [...params.target.segmentIds],
      },
      simulation: simulated.simulation,
      state: "suggested",
      suggestedElevation: {
        source: "derived_calculation",
        status: "suggested",
      },
      target: cloneHeightTarget(params.target.target),
      targetKey: params.target.targetKey,
    },
  };
}

function simulateHeightTarget(params: {
  allowUnpreservedCalculation?: boolean;
  baseline: TechnicalCalculationResult;
  heightMeters: number;
  params: RouteHeightProposalEngineParams;
  target: OrderedRouteHeightPoint;
}):
  | { ok: true; simulation: RouteHeightProposalSimulation }
  | { diagnostic: RouteHeightProposalDiagnostic; ok: false } {
  const copied = cloneHeightProposalState(
    params.params.equipment,
    params.params.network,
  );
  const edit = applySectionRouteHeightEdit({
    equipment: copied.equipment,
    heightMeters: params.heightMeters,
    network: copied.network,
    scaleMetersPerSourceUnit: params.params.scaleMetersPerSourceUnit,
    target: params.target.target,
  });

  if (!edit.ok) {
    return {
      diagnostic: simulationFailureDiagnostic(params.target, edit.message),
      ok: false,
    };
  }

  const candidate = calculateHeightProposalTechnicalTree(params.params, {
    equipment: edit.equipment,
    network: edit.network,
  });
  const simulation = createHeightProposalSimulation({
    after: { equipment: edit.equipment, network: edit.network, result: candidate },
    baseline: params.baseline,
    params: params.params,
  });

  if (
    !params.allowUnpreservedCalculation &&
    !simulation.calculations.validationsPreserved
  ) {
    return {
      diagnostic: simulationFailureDiagnostic(
        params.target,
        "La simulacion introduce nuevas observaciones o degrada el estado del calculo tecnico.",
      ),
      ok: false,
    };
  }

  return { ok: true, simulation };
}

function simulateCoordinatedHeightProposals(params: {
  baseline: TechnicalCalculationResult;
  params: RouteHeightProposalEngineParams;
  proposals: RouteHeightProposal[];
}):
  | {
      candidateEquipment: WorkbenchEquipment[];
      candidateNetwork: ManualRouteNetwork;
      internalLevelChanges: RouteInternalLevelProposalEvaluation | null;
      ok: true;
      riserProposal: AutomaticRouteRiserProposal;
      simulation: RouteHeightProposalSimulation;
      technicalResult: TechnicalCalculationResult;
    }
  | {
      diagnostic: RouteHeightProposalDiagnostic;
      internalLevelChanges: RouteInternalLevelProposalEvaluation | null;
      ok: false;
      riserProposal: AutomaticRouteRiserProposal;
    } {
  const copied = cloneHeightProposalState(
    params.params.equipment,
    params.params.network,
  );
  let equipment = copied.equipment;
  let network = copied.network;

  for (const proposal of params.proposals) {
    const edit = applySectionRouteHeightEdit({
      equipment,
      heightMeters: proposal.heightMeters,
      network,
      scaleMetersPerSourceUnit: params.params.scaleMetersPerSourceUnit,
      target: proposal.target,
    });

    if (!edit.ok) {
      const riserProposal = generateAutomaticRouteRisers({
        distributionHeightMeters:
          params.params.professionalDistributionHeight?.heightMeters ?? NaN,
        equipment,
        network,
        restrictions: params.params.restrictions,
        scaleMetersPerSourceUnit: params.params.scaleMetersPerSourceUnit,
      });
      return {
        diagnostic: {
          ...simulationFailureDiagnostic(
            {
              heightMeters: null,
              metadata: DEFAULT_UNVERIFIED_ELEVATION,
              target: proposal.target,
              targetKey: proposal.targetKey,
            },
            edit.message,
          ),
          message: `Fallo la simulacion coordinada en ${proposal.targetKey}: ${edit.message}`,
        },
        internalLevelChanges: null,
        ok: false,
        riserProposal,
      };
    }

    equipment = edit.equipment;
    network = edit.network;
  }

  const riserProposal = generateAutomaticRouteRisers({
    distributionHeightMeters:
      params.params.professionalDistributionHeight?.heightMeters ?? NaN,
    equipment,
    network,
    restrictions: params.params.restrictions,
    scaleMetersPerSourceUnit: params.params.scaleMetersPerSourceUnit,
  });

  if (riserProposal.status === "invalid") {
    return {
      diagnostic: {
        code: "simulation_failed",
        message:
          "La geometria automatica de montantes contiene una interferencia o una pata invalida.",
        neededData:
          riserProposal.diagnostics[0]?.neededData ??
          "Revise la ubicacion y geometria de los montantes propuestos.",
        referenceTargetKeys: [],
        targetKeys: riserProposal.diagnostics.flatMap((diagnostic) =>
          diagnostic.segmentId ? [`segment:${diagnostic.segmentId}`] : [],
        ),
      },
      internalLevelChanges: null,
      ok: false,
      riserProposal,
    };
  }

  const boundaryNetwork =
    riserProposal.status === "ready" ? riserProposal.network : network;
  const internalLevelChanges = evaluateInternalLevelChanges({
    baseline: params.baseline,
    equipment,
    network: boundaryNetwork,
    params: params.params,
  });
  const recommendedInternalAlternative =
    internalLevelChanges.alternatives.find(
      (alternative) =>
        alternative.id === internalLevelChanges.recommendedAlternativeId,
    ) ?? null;

  if (
    internalLevelChanges.requiredChangeCount > 0 &&
    !recommendedInternalAlternative
  ) {
    return {
      diagnostic: internalLevelChangeDiagnostic(internalLevelChanges),
      internalLevelChanges,
      ok: false,
      riserProposal,
    };
  }

  const simulatedNetwork =
    recommendedInternalAlternative?.network ?? boundaryNetwork;

  const candidate = calculateHeightProposalTechnicalTree(params.params, {
    equipment,
    network: simulatedNetwork,
  });
  const simulation = createHeightProposalSimulation({
    after: { equipment, network: simulatedNetwork, result: candidate },
    baseline: params.baseline,
    params: params.params,
  });

  if (!simulation.calculations.validationsPreserved) {
    return {
      diagnostic: {
        code: "simulation_failed",
        message:
          "La simulacion coordinada introduce nuevas observaciones o degrada el calculo tecnico.",
        neededData:
          "Revise las decisiones de altura y las validaciones tecnicas de los sectores afectados.",
        referenceTargetKeys: [],
        targetKeys: params.proposals.map((proposal) => proposal.targetKey),
      },
      internalLevelChanges,
      ok: false,
      riserProposal,
    };
  }

  return {
    candidateEquipment: equipment,
    candidateNetwork: simulatedNetwork,
    internalLevelChanges,
    ok: true,
    riserProposal,
    simulation,
    technicalResult: candidate,
  };
}

function evaluateInternalLevelChanges(params: {
  baseline: TechnicalCalculationResult;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  params: RouteHeightProposalEngineParams;
}): RouteInternalLevelProposalEvaluation {
  const generated = generateAutomaticInternalLevelChanges({
    equipment: params.equipment,
    network: params.network,
    restrictions: params.params.restrictions,
    scaleMetersPerSourceUnit: params.params.scaleMetersPerSourceUnit,
  });
  const alternatives = generated.alternatives
    .map<RouteInternalLevelAlternativeEvaluation>((alternative) => {
      const result = calculateHeightProposalTechnicalTree(params.params, {
        equipment: params.equipment,
        network: alternative.network,
      });
      const simulation = createHeightProposalSimulation({
        after: {
          equipment: params.equipment,
          network: alternative.network,
          result,
        },
        baseline: params.baseline,
        params: params.params,
      });

      return {
        ...alternative,
        score: {
          accessoryCount: simulation.accessories.physicalCountAfter,
          addedCalculationIssueCount:
            simulation.calculations.addedIssues.length,
          directionChangeCount: alternative.metrics.directionChangeCount,
          physicalLengthMeters: simulation.lengths.totalAfterMeters,
          pipeLengthMeters: simulation.materials.pipeLengthAfterMeters,
          topologyChanged: simulation.connections.topologyChanged,
        },
        simulation,
        technicallyViable:
          simulation.calculations.validationsPreserved &&
          !simulation.connections.topologyChanged,
      };
    })
    .sort(compareInternalLevelAlternatives);
  const recommended = alternatives.find(
    (alternative) => alternative.technicallyViable,
  );

  return {
    ...generated,
    alternatives,
    recommendedAlternativeId: recommended?.id ?? null,
    status:
      generated.status === "ready" && !recommended
        ? "invalid"
        : generated.status,
  };
}

function compareInternalLevelAlternatives(
  first: RouteInternalLevelAlternativeEvaluation,
  second: RouteInternalLevelAlternativeEvaluation,
) {
  return (
    Number(second.technicallyViable) - Number(first.technicallyViable) ||
    Number(first.score.topologyChanged) - Number(second.score.topologyChanged) ||
    first.score.addedCalculationIssueCount -
      second.score.addedCalculationIssueCount ||
    first.score.directionChangeCount - second.score.directionChangeCount ||
    first.score.accessoryCount - second.score.accessoryCount ||
    nullableNumberForRanking(first.score.physicalLengthMeters) -
      nullableNumberForRanking(second.score.physicalLengthMeters) ||
    first.score.pipeLengthMeters - second.score.pipeLengthMeters ||
    first.id.localeCompare(second.id)
  );
}

function internalLevelChangeDiagnostic(
  proposal: RouteInternalLevelProposalEvaluation,
): RouteHeightProposalDiagnostic {
  const blocking = proposal.diagnostics.find(
    (diagnostic) => diagnostic.severity === "blocking",
  );

  return {
    code: "internal_level_changes_incomplete",
    message:
      proposal.status === "invalid"
        ? "Las ubicaciones internas evaluadas no conservan una geometria y simulacion tecnica validas."
        : "No hay una ubicacion interna justificable con los datos actualmente disponibles.",
    neededData:
      blocking?.neededData ??
      "Defina profesionalmente el nodo o vertice del cambio de nivel y verifique sus interferencias tridimensionales.",
    referenceTargetKeys: [],
    targetKeys: proposal.diagnostics.flatMap((diagnostic) =>
      diagnostic.sectorId ? [diagnostic.sectorId] : [],
    ),
  };
}

function nullableNumberForRanking(value: number | null) {
  return value ?? Number.POSITIVE_INFINITY;
}

function simulateHeightProposal(params: {
  afterReference: RouteHeightConfirmedReference;
  baseline: TechnicalCalculationResult;
  beforeReference: RouteHeightConfirmedReference;
  params: RouteHeightProposalEngineParams;
  point: OrderedRouteHeightPoint;
  route: TechnicalRoute;
}):
  | { ok: true; proposal: RouteHeightProposal }
  | { diagnostic: RouteHeightProposalDiagnostic; ok: false } {
  const heightMeters = params.beforeReference.heightMeters;
  const simulated = simulateHeightTarget({
    baseline: params.baseline,
    heightMeters,
    params: params.params,
    target: params.point,
  });

  if (!simulated.ok) {
    return simulated;
  }

  return {
    ok: true,
    proposal: {
      heightMeters,
      id: `height-proposal:${params.route.id}:${params.point.targetKey}:${formatHeightId(
        heightMeters,
      )}`,
      justification:
        `La cota ${formatHeightMeters(heightMeters)} m esta delimitada por ` +
        `dos referencias confirmadas del recorrido principal (${params.beforeReference.targetKey} y ` +
        `${params.afterReference.targetKey}) sin un cambio de nivel confirmado entre ellas.`,
      provenance: {
        method: "matching_confirmed_boundaries",
        references: [params.beforeReference, params.afterReference],
        routeId: params.route.id,
      },
      simulation: simulated.simulation,
      state: "suggested",
      suggestedElevation: {
        source: "derived_calculation",
        status: "suggested",
      },
      target: cloneHeightTarget(params.point.target),
      targetKey: params.point.targetKey,
    },
  };
}

function selectMainRoute(
  params: RouteHeightProposalEngineParams,
  result: TechnicalCalculationResult,
):
  | {
      horizontalLengthSource: number;
      route: TechnicalRoute;
      selection: "explicit_terminal" | "longest_xy";
    }
  | null {
  const resolvedRoutes = result.technicalRoutes.filter(
    (route) => route.status === "resolved",
  );

  if (resolvedRoutes.length === 0) {
    return null;
  }

  const horizontalLengthBySegmentId = new Map(
    resolveRouteSegments(params.network, params.equipment).map((segment) => [
      segment.id,
      routeSegmentHorizontalLengthSource(segment),
    ]),
  );
  const ranked = resolvedRoutes
    .map((route) => ({
      horizontalLengthSource: route.segmentIds.reduce(
        (total, segmentId) =>
          total + (horizontalLengthBySegmentId.get(segmentId) ?? 0),
        0,
      ),
      route,
    }))
    .sort(
      (first, second) =>
        second.horizontalLengthSource - first.horizontalLengthSource ||
        first.route.terminalEquipmentId.localeCompare(
          second.route.terminalEquipmentId,
        ) ||
        first.route.id.localeCompare(second.route.id),
    );
  const explicitTerminalId = params.mainRouteTerminalEquipmentId ?? null;

  if (explicitTerminalId) {
    const explicit = ranked.find(
      (candidate) =>
        candidate.route.terminalEquipmentId === explicitTerminalId,
    );

    return explicit ? { ...explicit, selection: "explicit_terminal" } : null;
  }

  const selected = ranked[0];

  return selected ? { ...selected, selection: "longest_xy" } : null;
}

function mainRouteResult(
  selection: NonNullable<ReturnType<typeof selectMainRoute>>,
  scaleMetersPerSourceUnit: number | null,
): RouteHeightProposalMainRoute {
  return {
    horizontalLengthMeters:
      scaleMetersPerSourceUnit === null
        ? null
        : selection.horizontalLengthSource * scaleMetersPerSourceUnit,
    horizontalLengthSource: selection.horizontalLengthSource,
    id: selection.route.id,
    nodeIds: [...selection.route.nodeIds],
    segmentIds: [...selection.route.segmentIds],
    selection: selection.selection,
    terminalEquipmentId: selection.route.terminalEquipmentId,
  };
}

function fallbackRouteSectors(params: {
  diagnostics: RouteHeightProposalDiagnostic[];
  proposals: RouteHeightProposal[];
  route: TechnicalRoute;
}): RouteHeightProposalSector[] {
  const needsDecision = params.diagnostics.length > 0;

  return [
    {
      confirmedReferenceTargetKeys: params.diagnostics.flatMap(
        (diagnostic) => diagnostic.referenceTargetKeys,
      ),
      id: `route:${params.route.id}`,
      neededData: needsDecision
        ? params.diagnostics[0]?.neededData ?? null
        : null,
      reason: needsDecision
        ? "El recorrido principal conserva sectores sin referencias suficientes."
        : params.proposals.length > 0
          ? "Los puntos pendientes quedan delimitados por referencias confirmadas iguales."
          : "Las alturas del recorrido principal ya estan confirmadas.",
      segmentIds: [...params.route.segmentIds],
      status: needsDecision
        ? "requires_decision"
        : params.proposals.length > 0
          ? "resolved_by_proposal"
          : "confirmed",
      targetKeys: [
        ...params.proposals.map((proposal) => proposal.targetKey),
        ...params.diagnostics.flatMap((diagnostic) => diagnostic.targetKeys),
      ].sort(),
    },
  ];
}

function orderedMainRouteHeightPoints(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  route: TechnicalRoute;
}) {
  const nodeElevationById = createTechnicalRouteNodeElevationIndex(params);
  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const segmentById = new Map(
    params.network.segments.map((segment) => [segment.id, segment]),
  );
  const points: OrderedRouteHeightPoint[] = [];
  const firstNodeId = params.route.nodeIds[0];

  if (firstNodeId) {
    points.push(
      routeNodeHeightPoint(firstNodeId, nodeById, nodeElevationById),
    );
  }

  params.route.segmentIds.forEach((segmentId, routeSegmentIndex) => {
    const segment = segmentById.get(segmentId);
    const fromNodeId = params.route.nodeIds[routeSegmentIndex];
    const toNodeId = params.route.nodeIds[routeSegmentIndex + 1];

    if (!segment || !fromNodeId || !toNodeId) {
      return;
    }

    const forward =
      segment.fromNodeId === fromNodeId && segment.toNodeId === toNodeId;
    const vertices = (segment.vertices ?? []).map((point, vertexIndex) => ({
      point,
      vertexIndex,
    }));

    for (const vertex of forward ? vertices : [...vertices].reverse()) {
      points.push(routeVertexHeightPoint(segment, vertex));
    }

    points.push(routeNodeHeightPoint(toNodeId, nodeById, nodeElevationById));
  });

  return points;
}

function routeNodeHeightPoint(
  nodeId: string,
  nodeById: Map<string, RouteNode>,
  nodeElevationById: ReturnType<
    typeof createTechnicalRouteNodeElevationIndex
  >,
): OrderedRouteHeightPoint {
  const node = nodeById.get(nodeId);
  const elevation = nodeElevationById.get(nodeId);
  const target: SectionRouteHeightTarget = { kind: "node", nodeId };

  return {
    heightMeters: elevation?.zMeters ?? explicitZMeters(node?.position),
    metadata:
      elevation?.source && elevation.verificationStatus
        ? {
            source: elevation.source,
            status: elevation.verificationStatus,
          }
        : node?.elevation ?? DEFAULT_UNVERIFIED_ELEVATION,
    target,
    targetKey: sectionRouteHeightTargetKey(target),
  };
}

function routeVertexHeightPoint(
  segment: RouteSegment,
  vertex: { point: Point2D; vertexIndex: number },
): OrderedRouteHeightPoint {
  const target: SectionRouteHeightTarget = {
    kind: "segment_vertex",
    segmentId: segment.id,
    vertexIndex: vertex.vertexIndex,
  };

  return {
    heightMeters: explicitZMeters(vertex.point),
    metadata:
      segment.vertexElevations?.[vertex.vertexIndex] ??
      DEFAULT_UNVERIFIED_ELEVATION,
    target,
    targetKey: sectionRouteHeightTargetKey(target),
  };
}

function pendingHeightGroups(points: OrderedRouteHeightPoint[]) {
  const groups: PendingHeightGroup[] = [];
  let pending: OrderedRouteHeightPoint[] = [];
  let before: OrderedRouteHeightPoint | null = null;

  for (const point of points) {
    if (isConfirmedHeightReference(point)) {
      if (pending.length > 0) {
        groups.push({ after: point, before, points: pending });
        pending = [];
      }

      before = point;
    } else {
      pending.push(point);
    }
  }

  if (pending.length > 0) {
    groups.push({ after: null, before, points: pending });
  }

  return groups;
}

function isConfirmedHeightReference(
  point: OrderedRouteHeightPoint,
): point is OrderedRouteHeightPoint & { heightMeters: number } {
  return (
    point.metadata.status === "confirmed" &&
    (point.metadata.source === "professional_edit" ||
      point.metadata.source === "derived_calculation") &&
    point.heightMeters !== null &&
    Number.isFinite(point.heightMeters)
  );
}

function confirmedReference(
  point: OrderedRouteHeightPoint & { heightMeters: number },
): RouteHeightConfirmedReference {
  return {
    heightMeters: point.heightMeters,
    source: point.metadata.source,
    status: "confirmed",
    target: cloneHeightTarget(point.target),
    targetKey: point.targetKey,
  };
}

function insufficientReferencesDiagnostic(
  group: PendingHeightGroup,
): RouteHeightProposalDiagnostic {
  const reference = group.before ?? group.after;

  return {
    code: "insufficient_confirmed_references",
    message: reference
      ? "El tramo pendiente tiene una sola referencia de altura confirmada."
      : "El tramo pendiente no tiene referencias de altura confirmadas.",
    neededData: reference
      ? "Confirme una segunda altura que delimite el tramo pendiente."
      : "Confirme las alturas que delimitan el tramo pendiente.",
    referenceTargetKeys: reference ? [reference.targetKey] : [],
    targetKeys: group.points.map((point) => point.targetKey),
  };
}

function levelChangeDiagnostic(
  group: PendingHeightGroup,
  before: OrderedRouteHeightPoint & { heightMeters: number },
  after: OrderedRouteHeightPoint & { heightMeters: number },
): RouteHeightProposalDiagnostic {
  return {
    code: "level_change_requires_definition",
    message:
      `Las referencias confirmadas cambian de ${formatHeightMeters(
        before.heightMeters,
      )} m a ${formatHeightMeters(after.heightMeters)} m y no permiten ubicar ` +
      "automaticamente el cambio de nivel.",
    neededData:
      "Confirme la cota y el punto o vertice donde ocurre el cambio de nivel.",
    referenceTargetKeys: [before.targetKey, after.targetKey],
    targetKeys: group.points.map((point) => point.targetKey),
  };
}

function simulationFailureDiagnostic(
  point: OrderedRouteHeightPoint,
  reason: string,
): RouteHeightProposalDiagnostic {
  return {
    code: "simulation_failed",
    message: `No se genero la propuesta para ${point.targetKey}: ${reason}`,
    neededData:
      "Revise la geometria, las conexiones y las validaciones tecnicas del punto indicado.",
    referenceTargetKeys: [],
    targetKeys: [point.targetKey],
  };
}

function calculateHeightProposalTechnicalTree(
  params: RouteHeightProposalEngineParams,
  state: {
    equipment: WorkbenchEquipment[];
    network: ManualRouteNetwork;
  },
) {
  return calculateTechnicalTree({
    adoptedDiameterDecisions: params.adoptedDiameterDecisions,
    diameterTransitionDecisions: params.diameterTransitionDecisions,
    equipment: state.equipment,
    minSegmentLengthSource: params.minSegmentLengthSource,
    network: state.network,
    pipeContextBySegmentId: params.pipeContextBySegmentId,
    pipeSystem: params.pipeSystem,
    projectGas: params.projectGas,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
  });
}

function createHeightProposalSimulation(params: {
  after: {
    equipment: WorkbenchEquipment[];
    network: ManualRouteNetwork;
    result: TechnicalCalculationResult;
  };
  baseline: TechnicalCalculationResult;
  params: RouteHeightProposalEngineParams;
}): RouteHeightProposalSimulation {
  const mainRouteId = selectMainRoute(params.params, params.baseline)?.route.id ??
    null;
  const before = {
    equipment: params.params.equipment,
    network: params.params.network,
    result: params.baseline,
  };

  return {
    accessories: accessoryImpact({
      accessoryProposals: params.params.accessoryProposals,
      after: params.after,
      before,
    }),
    calculations: calculationImpact(params.baseline, params.after.result),
    connections: connectionImpact({
      afterEquipment: params.after.equipment,
      afterNetwork: params.after.network,
      beforeEquipment: params.params.equipment,
      beforeNetwork: params.params.network,
    }),
    lengths: lengthImpact(
      params.baseline,
      params.after.result,
      mainRouteId,
    ),
    materials: materialImpact({
      accessoryProposals: params.params.accessoryProposals,
      after: params.after,
      before,
    }),
    status: "ready",
  };
}

function calculationImpact(
  before: TechnicalCalculationResult,
  after: TechnicalCalculationResult,
): RouteHeightProposalCalculationImpact {
  const beforeIssues = calculationIssueKeySet(before);
  const afterIssues = calculationIssueKeySet(after);
  const addedIssues = [...afterIssues].filter((key) => !beforeIssues.has(key));
  const removedIssues = [...beforeIssues].filter((key) => !afterIssues.has(key));
  const diameterChanges = diameterImpact(before, after);
  const validationsPreserved =
    calculationStatusRank(after.status) >= calculationStatusRank(before.status) &&
    addedIssues.length === 0;

  return {
    addedIssues: addedIssues.sort(),
    diameterChanges,
    removedIssues: removedIssues.sort(),
    statusAfter: after.status,
    statusBefore: before.status,
    validationsPreserved,
  };
}

function lengthImpact(
  before: TechnicalCalculationResult,
  after: TechnicalCalculationResult,
  mainRouteId: string | null,
): RouteHeightProposalLengthImpact {
  const beforeBySegmentId = new Map(
    before.segments.map((segment) => [
      segment.segmentId,
      segment.segmentPhysicalLengthMeters,
    ]),
  );
  const afterBySegmentId = new Map(
    after.segments.map((segment) => [
      segment.segmentId,
      segment.segmentPhysicalLengthMeters,
    ]),
  );
  const segmentIds = new Set([
    ...beforeBySegmentId.keys(),
    ...afterBySegmentId.keys(),
  ]);
  const affectedSegments = [...segmentIds]
    .map((segmentId) => {
      const beforeMeters = beforeBySegmentId.get(segmentId) ?? null;
      const afterMeters = afterBySegmentId.get(segmentId) ?? null;

      return {
        afterMeters,
        beforeMeters,
        deltaMeters: nullableDelta(afterMeters, beforeMeters),
        segmentId,
      };
    })
    .filter(
      (item) =>
        item.deltaMeters === null ||
        Math.abs(item.deltaMeters) > HEIGHT_EPSILON_METERS,
    )
    .sort((first, second) => first.segmentId.localeCompare(second.segmentId));
  const mainRouteBeforeMeters = mainRouteId
    ? routeLength(before, mainRouteId)
    : null;
  const mainRouteAfterMeters = mainRouteId
    ? routeLength(after, mainRouteId)
    : null;
  const totalBeforeMeters = before.totals.physicalLengthMeters;
  const totalAfterMeters = after.totals.physicalLengthMeters;

  return {
    affectedSegments,
    mainRouteAfterMeters,
    mainRouteBeforeMeters,
    mainRouteDeltaMeters: nullableDelta(
      mainRouteAfterMeters,
      mainRouteBeforeMeters,
    ),
    totalAfterMeters,
    totalBeforeMeters,
    totalDeltaMeters: nullableDelta(totalAfterMeters, totalBeforeMeters),
  };
}

function connectionImpact(params: {
  afterEquipment: WorkbenchEquipment[];
  afterNetwork: ManualRouteNetwork;
  beforeEquipment: WorkbenchEquipment[];
  beforeNetwork: ManualRouteNetwork;
}): RouteHeightProposalConnectionImpact {
  return {
    changedEquipmentIds: changedEntityIds(
      params.beforeEquipment,
      params.afterEquipment,
    ),
    changedNodeIds: changedEntityIds(
      params.beforeNetwork.nodes,
      params.afterNetwork.nodes,
    ),
    changedSegmentIds: changedEntityIds(
      params.beforeNetwork.segments,
      params.afterNetwork.segments,
    ),
    topologyChanged:
      networkTopologyKey(params.beforeNetwork) !==
      networkTopologyKey(params.afterNetwork),
  };
}

function accessoryImpact(params: {
  accessoryProposals?: AccessoryProposal[];
  after: {
    equipment: WorkbenchEquipment[];
    network: ManualRouteNetwork;
    result: TechnicalCalculationResult;
  };
  before: {
    equipment: WorkbenchEquipment[];
    network: ManualRouteNetwork;
    result: TechnicalCalculationResult;
  };
}): RouteHeightProposalAccessoryImpact {
  const before = createTechnicalPhysicalAccessoryInventory({
    accessoryProposals: params.accessoryProposals,
    diameterTransitionProposals:
      params.before.result.transitionAwareNetworkSizing?.transitions,
    equipment: params.before.equipment,
    network: params.before.network,
    result: params.before.result,
    routeTransitionResolutions:
      params.before.result.transitionAwareNetworkSizing
        ?.routeTransitionResolutions,
  });
  const after = createTechnicalPhysicalAccessoryInventory({
    accessoryProposals: params.accessoryProposals,
    diameterTransitionProposals:
      params.after.result.transitionAwareNetworkSizing?.transitions,
    equipment: params.after.equipment,
    network: params.after.network,
    result: params.after.result,
    routeTransitionResolutions:
      params.after.result.transitionAwareNetworkSizing
        ?.routeTransitionResolutions,
  });
  const beforeById = new Map(before.items.map((item) => [item.id, item]));
  const afterById = new Map(after.items.map((item) => [item.id, item]));

  return {
    addedIds: [...afterById.keys()]
      .filter((id) => !beforeById.has(id))
      .sort(),
    changedIds: [...afterById.keys()]
      .filter(
        (id) =>
          beforeById.has(id) &&
          stableValue(beforeById.get(id)) !== stableValue(afterById.get(id)),
      )
      .sort(),
    physicalCountAfter: after.items.length,
    physicalCountBefore: before.items.length,
    removedIds: [...beforeById.keys()]
      .filter((id) => !afterById.has(id))
      .sort(),
    statusAfter: after.status,
    statusBefore: before.status,
  };
}

function materialImpact(params: {
  accessoryProposals?: AccessoryProposal[];
  after: {
    equipment: WorkbenchEquipment[];
    network: ManualRouteNetwork;
    result: TechnicalCalculationResult;
  };
  before: {
    equipment: WorkbenchEquipment[];
    network: ManualRouteNetwork;
    result: TechnicalCalculationResult;
  };
}): RouteHeightProposalMaterialImpact {
  const beforeInventory = createTechnicalPhysicalAccessoryInventory({
    accessoryProposals: params.accessoryProposals,
    diameterTransitionProposals:
      params.before.result.transitionAwareNetworkSizing?.transitions,
    equipment: params.before.equipment,
    network: params.before.network,
    result: params.before.result,
    routeTransitionResolutions:
      params.before.result.transitionAwareNetworkSizing
        ?.routeTransitionResolutions,
  });
  const afterInventory = createTechnicalPhysicalAccessoryInventory({
    accessoryProposals: params.accessoryProposals,
    diameterTransitionProposals:
      params.after.result.transitionAwareNetworkSizing?.transitions,
    equipment: params.after.equipment,
    network: params.after.network,
    result: params.after.result,
    routeTransitionResolutions:
      params.after.result.transitionAwareNetworkSizing
        ?.routeTransitionResolutions,
  });
  const before = createTechnicalMaterialTakeoff({
    accessoryProposals: params.accessoryProposals,
    diameterTransitionProposals:
      params.before.result.transitionAwareNetworkSizing?.transitions,
    physicalAccessoryInventory: beforeInventory,
    result: params.before.result,
    routeTransitionResolutions:
      params.before.result.transitionAwareNetworkSizing
        ?.routeTransitionResolutions,
  });
  const after = createTechnicalMaterialTakeoff({
    accessoryProposals: params.accessoryProposals,
    diameterTransitionProposals:
      params.after.result.transitionAwareNetworkSizing?.transitions,
    physicalAccessoryInventory: afterInventory,
    result: params.after.result,
    routeTransitionResolutions:
      params.after.result.transitionAwareNetworkSizing
        ?.routeTransitionResolutions,
  });

  return {
    accessoryQuantityAfter:
      after.physicalMaterialQuantities.accessoryQuantity,
    accessoryQuantityBefore:
      before.physicalMaterialQuantities.accessoryQuantity,
    pipeLengthAfterMeters:
      after.physicalMaterialQuantities.pipeLengthMeters,
    pipeLengthBeforeMeters:
      before.physicalMaterialQuantities.pipeLengthMeters,
    pipeLengthDeltaMeters:
      after.physicalMaterialQuantities.pipeLengthMeters -
      before.physicalMaterialQuantities.pipeLengthMeters,
    pipeSegmentCountAfter:
      after.physicalMaterialQuantities.pipeSegmentCount,
    pipeSegmentCountBefore:
      before.physicalMaterialQuantities.pipeSegmentCount,
    statusAfter: after.status,
    statusBefore: before.status,
  };
}

function diameterImpact(
  before: TechnicalCalculationResult,
  after: TechnicalCalculationResult,
) {
  const beforeDiameters = finalDiameters(before);
  const afterDiameters = finalDiameters(after);
  const segmentIds = new Set([
    ...Object.keys(beforeDiameters),
    ...Object.keys(afterDiameters),
  ]);

  return [...segmentIds]
    .map((segmentId) => ({
      afterDiameterId: afterDiameters[segmentId]?.id ?? null,
      beforeDiameterId: beforeDiameters[segmentId]?.id ?? null,
      segmentId,
    }))
    .filter(
      (change) => change.afterDiameterId !== change.beforeDiameterId,
    )
    .sort((first, second) => first.segmentId.localeCompare(second.segmentId));
}

function finalDiameters(result: TechnicalCalculationResult) {
  return (
    result.transitionAwareNetworkSizing?.finalDiameterBySegmentId ??
    result.networkSizing?.finalDiameterBySegmentId ??
    {}
  );
}

function calculationIssueKeySet(result: TechnicalCalculationResult) {
  const groups: Array<[
    string,
    Array<{
      accessoryId?: string;
      code: string;
      equipmentId?: string;
      nodeId?: string;
      routeId?: string;
      segmentId?: string;
      transitionId?: string;
    }>,
  ]> = [
    ["technical", result.issues],
    ["network-sizing", result.networkSizing?.issues ?? []],
    [
      "transition-sizing",
      result.transitionAwareNetworkSizing?.issues ?? [],
    ],
    ["diameter-adoption", result.professionalDiameterAdoption?.issues ?? []],
    [
      "diameter-adoption-evaluation",
      result.professionalDiameterAdoption?.evaluation?.issues ?? [],
    ],
  ];

  return new Set(
    groups.flatMap(([group, issues]) =>
      issues.map((issue) => `${group}:${technicalIssueKey(issue)}`),
    ),
  );
}

function technicalIssueKey(issue: {
  accessoryId?: string;
  code: string;
  equipmentId?: string;
  nodeId?: string;
  routeId?: string;
  segmentId?: string;
  transitionId?: string;
}) {
  return [
    issue.code,
    issue.accessoryId ?? "",
    issue.equipmentId ?? "",
    issue.nodeId ?? "",
    issue.routeId ?? "",
    issue.segmentId ?? "",
    issue.transitionId ?? "",
  ].join(":");
}

function calculationStatusRank(status: TechnicalCalculationStatus) {
  if (status === "valid") {
    return 2;
  }

  return status === "incomplete" ? 1 : 0;
}

function routeLength(result: TechnicalCalculationResult, routeId: string) {
  return (
    result.technicalRoutes.find((route) => route.id === routeId)
      ?.physicalLengthMeters ?? null
  );
}

function nullableDelta(after: number | null, before: number | null) {
  return after === null || before === null ? null : after - before;
}

function sameHeight(first: number | null, second: number | null) {
  return (
    first !== null &&
    second !== null &&
    Math.abs(first - second) <= HEIGHT_EPSILON_METERS
  );
}

function explicitZMeters(point: Point2D | null | undefined) {
  return typeof point?.z === "number" && Number.isFinite(point.z)
    ? point.z
    : null;
}

function formatHeightMeters(value: number) {
  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  });
}

function formatHeightId(value: number) {
  return value.toFixed(6).replace("-", "minus-").replace(".", "-");
}

function cloneHeightTarget(
  target: SectionRouteHeightTarget,
): SectionRouteHeightTarget {
  return target.kind === "node"
    ? { kind: "node", nodeId: target.nodeId }
    : {
        kind: "segment_vertex",
        segmentId: target.segmentId,
        vertexIndex: target.vertexIndex,
      };
}

function cloneHeightProposalState(
  equipment: WorkbenchEquipment[],
  network: ManualRouteNetwork,
) {
  return {
    equipment: equipment.map((item) => ({
      ...item,
      ...(item.bodyPoint ? { bodyPoint: { ...item.bodyPoint } } : {}),
      connectionPoint: { ...item.connectionPoint },
      ...(item.elevation ? { elevation: { ...item.elevation } } : {}),
      ...(item.terminalConfig
        ? { terminalConfig: { ...item.terminalConfig } }
        : {}),
      ...(item.wallAnchor
        ? {
            wallAnchor: {
              ...item.wallAnchor,
              ...(item.wallAnchor.normal
                ? { normal: { ...item.wallAnchor.normal } }
                : {}),
              ...(item.wallAnchor.wallPoint
                ? { wallPoint: { ...item.wallAnchor.wallPoint } }
                : {}),
            },
          }
        : {}),
    })),
    network: {
      nodes: network.nodes.map((node) => ({
        ...node,
        ...(node.elevation ? { elevation: { ...node.elevation } } : {}),
        ...(node.position ? { position: { ...node.position } } : {}),
      })),
      segments: network.segments.map((segment) => ({
        ...segment,
        ...(segment.accessories
          ? {
              accessories: segment.accessories.map((accessory) => ({
                ...accessory,
              })),
            }
          : {}),
        ...(segment.vertexElevations
          ? {
              vertexElevations: segment.vertexElevations.map((elevation) =>
                elevation ? { ...elevation } : null,
              ),
            }
          : {}),
        ...(segment.vertices
          ? { vertices: segment.vertices.map((point) => ({ ...point })) }
          : {}),
      })),
    },
  };
}

function changedEntityIds<T extends { id: string }>(before: T[], after: T[]) {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);

  return [...ids]
    .filter(
      (id) => stableValue(beforeById.get(id)) !== stableValue(afterById.get(id)),
    )
    .sort();
}

function networkTopologyKey(network: ManualRouteNetwork) {
  return stableValue({
    nodeIds: network.nodes.map((node) => node.id).sort(),
    segments: network.segments
      .map((segment) => ({
        fromNodeId: segment.fromNodeId,
        id: segment.id,
        toNodeId: segment.toNodeId,
      }))
      .sort((first, second) => first.id.localeCompare(second.id)),
  });
}

function stableValue(value: unknown) {
  return JSON.stringify(value) ?? "undefined";
}
