import type { ArchitecturalRouteContext } from "@/lib/architecture/routeContext";
import type { AdoptedDiameterDecision } from "@/lib/calculation/professionalDiameterAdoption";
import type {
  PipeSegmentPipeContext,
  PipeSystem,
} from "@/lib/calculation/pipeSystem";
import type { ProjectGasConfig } from "@/lib/calculation/projectGas";
import {
  createTechnicalMaterialTakeoff,
  type TechnicalMaterialTakeoff,
} from "@/lib/calculation/technicalMaterialTakeoff";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import type { DiameterTransitionDecision } from "@/lib/calculation/diameterTransitionProposals";
import {
  equipmentTerminalHeightIsConfirmed,
} from "@/lib/equipment/terminalConfig";
import type {
  EquipmentTerminalOutletSide,
  WorkbenchEquipment,
} from "@/lib/equipment/types";
import { pointZMeters } from "@/lib/geometry/height";
import type { Bounds, Point2D } from "@/lib/geometry/types";
import {
  generateAutomaticRouteProposal,
  type GenerateAutomaticRouteProposalInput,
} from "@/lib/routing/autoProposal";
import {
  applianceNodesAreTerminal,
  detectRouteCycle,
  findRouteNodeByEquipment,
  getConnectedApplianceEquipmentIds,
  getRouteNodeDegree,
  hasDuplicateNodeIds,
  hasDuplicateSegmentIds,
  hasDuplicateSegments,
  hasRouteCrossingsWithoutNode,
  hasSegmentsWithMissingEndpoints,
  hasZeroLengthSegments,
  resolveRouteSegments,
  resolveRouteNodePosition,
  routeEquipmentNodeId,
  routeEquipmentTerminalSegmentId,
  routeEquipmentTerminalStartNodeId,
} from "@/lib/routing/network";
import {
  detectRouteAccessoryProposals,
  type AccessoryProposal,
  type AccessoryProposalDecision,
} from "@/lib/routing/routeAccessoryProposals";
import { applyConfirmedEquipmentTerminalConnection } from "@/lib/routing/terminalConnection";
import type {
  AutomaticRouteProposal,
  AutomaticRouteRestriction,
  ManualRouteNetwork,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import {
  createRouteHeightProposals,
  type ProfessionalDistributionHeight,
  type RouteHeightProposalEngineResult,
  type RouteHeightProposalSimulation,
} from "@/lib/sections/routeHeightProposals";

const GEOMETRY_EPSILON = 0.000001;
const FINGERPRINT_PREFIX = "installation-proposal";

export type CoordinatedInstallationProposalStatus =
  | "complete"
  | "incomplete"
  | "invalid";

export type CoordinatedInstallationPendingDecision = {
  code:
    | "accessory_decision_reference_invalid"
    | "adopted_diameter_reference_invalid"
    | "distribution_height_required"
    | "height_definition_required"
    | "material_definition_required"
    | "pipe_context_reference_invalid"
    | "riser_definition_required"
    | "technical_definition_required"
    | "transition_decision_reference_invalid";
  message: string;
  neededData: string;
  referenceIds: string[];
};

export type CoordinatedInstallationWarning = {
  code:
    | "architectural_reference_unverified"
    | "bounded_internal_alternatives"
    | "unverified_3d_clearance";
  message: string;
  referenceIds: string[];
};

export type CoordinatedInstallationInvalidity = {
  code:
    | "confirmed_elevation_lost"
    | "duplicate_ids"
    | "invalid_input"
    | "invalid_orthogonal_geometry"
    | "invalid_riser_geometry"
    | "invalid_technical_result"
    | "invalid_topology"
    | "known_restriction_collision"
    | "manual_accessory_lost";
  message: string;
  referenceIds: string[];
};

export type CoordinatedInstallationSnapshot = {
  adoptedDiameterDecisions?: AdoptedDiameterDecision[];
  architecture?: ArchitecturalRouteContext;
  bounds: Bounds | null;
  diameterTransitionDecisions?: DiameterTransitionDecision[];
  equipment: WorkbenchEquipment[];
  marginMeters: number;
  minSegmentLengthSource: number;
  network: ManualRouteNetwork;
  pdfPageNumber?: number;
  pipeContextBySegmentId?: Record<
    string,
    PipeSegmentPipeContext | undefined
  >;
  pipeSystem?: PipeSystem;
  planBaseId: string;
  preferredApplianceOrder?: string[];
  preferredBranchEquipmentIdsByApplianceId?: Record<string, string[]>;
  professionalDistributionHeight?: ProfessionalDistributionHeight | null;
  projectGas?: ProjectGasConfig | null;
  restrictions?: AutomaticRouteRestriction[];
  routeAccessoryProposalDecisions?: AccessoryProposalDecision[];
  scaleMetersPerSourceUnit: number | null;
};

export type CoordinatedInstallationProposal = {
  candidateEquipment: WorkbenchEquipment[];
  candidateNetwork: ManualRouteNetwork;
  fingerprint: string;
  heightResult: RouteHeightProposalEngineResult | null;
  id: string;
  invalidities: CoordinatedInstallationInvalidity[];
  justification: string[];
  materialTakeoff: TechnicalMaterialTakeoff;
  pendingDecisions: CoordinatedInstallationPendingDecision[];
  simulation: RouteHeightProposalSimulation | null;
  status: CoordinatedInstallationProposalStatus;
  technicalResult: TechnicalCalculationResult;
  warnings: CoordinatedInstallationWarning[];
  xyProposal: AutomaticRouteProposal | null;
};

/**
 * Coordinates the existing XY and height engines over isolated copies. It does
 * not accept technical decisions and never mutates the supplied snapshot.
 */
export function createCoordinatedInstallationProposal(
  snapshot: CoordinatedInstallationSnapshot,
): CoordinatedInstallationProposal {
  const fingerprint = createCoordinatedInstallationFingerprint(snapshot);
  const xyFingerprint = createCoordinatedInstallationXyFingerprint(snapshot);
  const copied = cloneSnapshotState(snapshot);
  const invalidities = validateSnapshotInput(snapshot);
  const pendingDecisions: CoordinatedInstallationPendingDecision[] = [];
  const warnings: CoordinatedInstallationWarning[] = [];
  const justification: string[] = [];
  const restrictions = cloneRestrictions(
    snapshot.restrictions ?? snapshot.architecture?.restrictions ?? [],
  );
  const terminalPreparation = prepareTerminalConnections({
    equipment: copied.equipment,
    network: copied.network,
    pdfPageNumber: snapshot.pdfPageNumber,
    planBaseId: snapshot.planBaseId,
    scaleMetersPerSourceUnit: snapshot.scaleMetersPerSourceUnit,
  });

  if (!terminalPreparation.ok) {
    pendingDecisions.push({
      code: "riser_definition_required",
      message: terminalPreparation.message,
      neededData:
        "Revise la configuracion y la geometria confirmada de la conexion terminal indicada.",
      referenceIds: terminalPreparation.equipmentId
        ? [terminalPreparation.equipmentId]
        : [],
    });
  }

  let xyProposal: AutomaticRouteProposal | null = null;
  let candidateEquipment = copied.equipment;
  let candidateNetwork = terminalPreparation.ok
    ? terminalPreparation.network
    : copied.network;
  let heightResult: RouteHeightProposalEngineResult | null = null;
  let simulation: RouteHeightProposalSimulation | null = null;

  if (invalidities.length === 0 && terminalPreparation.ok) {
    const xyInput: GenerateAutomaticRouteProposalInput = {
      architecture: cloneArchitecture(snapshot.architecture),
      baseNetwork: terminalPreparation.network,
      bounds: snapshot.bounds ? { ...snapshot.bounds } : null,
      equipment: candidateEquipment,
      fingerprint: xyFingerprint,
      marginMeters: snapshot.marginMeters,
      minSegmentLengthSource: snapshot.minSegmentLengthSource,
      pdfPageNumber: snapshot.pdfPageNumber,
      planBaseId: snapshot.planBaseId,
      preferredApplianceOrder: snapshot.preferredApplianceOrder
        ? [...snapshot.preferredApplianceOrder]
        : undefined,
      preferredBranchEquipmentIdsByApplianceId:
        snapshot.preferredBranchEquipmentIdsByApplianceId
          ? clonePlainRecord(
              snapshot.preferredBranchEquipmentIdsByApplianceId,
            )
          : undefined,
      restrictions,
      scaleMetersPerSourceUnit: snapshot.scaleMetersPerSourceUnit ?? 0,
    };
    xyProposal = generateAutomaticRouteProposal(xyInput);
    if (xyProposal.status !== "invalid") {
      candidateNetwork = cloneRouteNetwork({
        nodes: xyProposal.nodes,
        segments: xyProposal.segments,
      });
    }
    justification.push(
      `El motor XY conecto ${xyProposal.reachedEquipmentIds.length} artefactos con ${xyProposal.segmentCount} tramos y ${xyProposal.turnCount} giros.`,
    );

    if (xyProposal.status !== "invalid") {
      const xyAccessoryProposals = detectRouteAccessoryProposals({
        decisions: snapshot.routeAccessoryProposalDecisions,
        equipment: candidateEquipment,
        network: candidateNetwork,
        scaleMetersPerSourceUnit: snapshot.scaleMetersPerSourceUnit,
      });
      heightResult = createRouteHeightProposals({
        accessoryProposals: xyAccessoryProposals,
        adoptedDiameterDecisions: snapshot.adoptedDiameterDecisions,
        diameterTransitionDecisions: snapshot.diameterTransitionDecisions,
        equipment: candidateEquipment,
        minSegmentLengthSource: snapshot.minSegmentLengthSource,
        network: candidateNetwork,
        pipeContextBySegmentId: copied.pipeContextBySegmentId,
        pipeSystem: snapshot.pipeSystem,
        professionalDistributionHeight:
          snapshot.professionalDistributionHeight ?? null,
        projectGas: copied.projectGas,
        restrictions,
        scaleMetersPerSourceUnit: snapshot.scaleMetersPerSourceUnit,
      });

      const coordinated = heightResult.coordinatedSimulation;
      const recommendedInternal = recommendedInternalAlternative(heightResult);

      if (coordinated) {
        candidateEquipment = cloneEquipment(coordinated.candidateEquipment);
        candidateNetwork = cloneRouteNetwork(coordinated.candidateNetwork);
        simulation = clonePlainRecord(coordinated.simulation);
      } else if (recommendedInternal) {
        candidateNetwork = cloneRouteNetwork(recommendedInternal.network);
        simulation = clonePlainRecord(recommendedInternal.simulation);
      } else if (heightResult.automaticRisers?.status === "ready") {
        candidateNetwork = cloneRouteNetwork(
          heightResult.automaticRisers.network,
        );
      }

      appendHeightOutcome({
        heightResult,
        invalidities,
        justification,
        pendingDecisions,
        warnings,
      });
    }
  }

  const technicalResult =
    heightResult?.coordinatedSimulation &&
    networksEquivalent(
      candidateNetwork,
      heightResult.coordinatedSimulation.candidateNetwork,
    )
      ? clonePlainRecord(heightResult.coordinatedSimulation.technicalResult)
      : calculateTechnicalTree({
          adoptedDiameterDecisions: snapshot.adoptedDiameterDecisions,
          diameterTransitionDecisions: snapshot.diameterTransitionDecisions,
          equipment: candidateEquipment,
          minSegmentLengthSource: snapshot.minSegmentLengthSource,
          network: candidateNetwork,
          pipeContextBySegmentId: copied.pipeContextBySegmentId,
          pipeSystem: snapshot.pipeSystem,
          projectGas: copied.projectGas,
          scaleMetersPerSourceUnit: snapshot.scaleMetersPerSourceUnit,
        });
  const finalAccessoryProposals = detectRouteAccessoryProposals({
    decisions: snapshot.routeAccessoryProposalDecisions,
    equipment: candidateEquipment,
    network: candidateNetwork,
    scaleMetersPerSourceUnit: snapshot.scaleMetersPerSourceUnit,
  });
  const transitionProposals =
    technicalResult.transitionAwareNetworkSizing?.transitions ?? [];
  const materialTakeoff = createTechnicalMaterialTakeoff({
    accessoryProposals: finalAccessoryProposals,
    diameterTransitionProposals: transitionProposals,
    result: technicalResult,
  });

  invalidities.push(
    ...validateCandidateGeometry({
      equipment: candidateEquipment,
      minSegmentLengthSource: snapshot.minSegmentLengthSource,
      network: candidateNetwork,
      requireAllAppliances: xyProposal?.status !== "partial",
    }),
    ...validatePreservedConfirmedState({
      afterEquipment: candidateEquipment,
      afterNetwork: candidateNetwork,
      beforeEquipment: copied.equipment,
      beforeNetwork: copied.network,
    }),
  );
  pendingDecisions.push(
    ...invalidTechnicalReferences({
      accessoryDecisions: snapshot.routeAccessoryProposalDecisions ?? [],
      accessoryProposals: finalAccessoryProposals,
      adoptedDiameterDecisions: snapshot.adoptedDiameterDecisions ?? [],
      candidateNetwork,
      diameterTransitionDecisions:
        snapshot.diameterTransitionDecisions ?? [],
      pipeContextBySegmentId: copied.pipeContextBySegmentId,
      transitionProposals,
    }),
  );

  if (technicalResult.status === "invalid") {
    invalidities.push({
      code: "invalid_technical_result",
      message:
        technicalResult.issues[0]?.message ??
        "La red candidata no produce un arbol tecnico valido.",
      referenceIds: technicalResult.issues.flatMap((issue) =>
        issue.segmentId ? [issue.segmentId] : [],
      ),
    });
  } else if (technicalResult.status === "incomplete") {
    pendingDecisions.push(
      ...technicalResult.issues.map((issue) => ({
        code: "technical_definition_required" as const,
        message: issue.message,
        neededData:
          "Complete o revise el dato tecnico indicado antes de aceptar la propuesta como completa.",
        referenceIds: [issue.segmentId, issue.equipmentId, issue.nodeId].filter(
          (value): value is string => Boolean(value),
        ),
      })),
    );
  }

  if (materialTakeoff.status === "pending") {
    pendingDecisions.push(
      ...materialTakeoff.pendingItems.map((item) => ({
        code: "material_definition_required" as const,
        message: item.reason,
        neededData:
          "Resuelva la seleccion tecnica pendiente para cerrar el computo de materiales.",
        referenceIds: [
          item.segmentId,
          item.transitionId,
          item.sourceId,
        ].filter((value): value is string => Boolean(value)),
      })),
    );
  }

  if (xyProposal?.status === "invalid") {
    invalidities.push({
      code: "invalid_topology",
      message: "El motor XY no pudo producir una red valida.",
      referenceIds: [...xyProposal.unreachedEquipmentIds],
    });
  } else if (xyProposal?.status === "partial") {
    pendingDecisions.push({
      code: "technical_definition_required",
      message: "El recorrido XY no alcanza todos los artefactos.",
      neededData:
        "Revise restricciones o defina profesionalmente el recorrido de los artefactos pendientes.",
      referenceIds: [...xyProposal.unreachedEquipmentIds],
    });
  }

  for (const warning of xyProposal?.architecturalWarnings ?? []) {
    warnings.push({
      code: "architectural_reference_unverified",
      message: warning.message,
      referenceIds: [...warning.featureIds],
    });
  }

  justification.push(
    `La simulacion tecnica final quedo ${technicalResult.status} y el computo de materiales ${materialTakeoff.status}.`,
  );

  const dedupedInvalidities = dedupeByKey(invalidities, invalidityKey);
  const dedupedPending = dedupeByKey(pendingDecisions, pendingDecisionKey);
  const dedupedWarnings = dedupeByKey(warnings, warningKey);
  const status: CoordinatedInstallationProposalStatus =
    dedupedInvalidities.length > 0
      ? "invalid"
      : dedupedPending.length > 0 || !xyProposal
        ? "incomplete"
        : "complete";

  return {
    candidateEquipment: cloneEquipment(candidateEquipment),
    candidateNetwork: cloneRouteNetwork(candidateNetwork),
    fingerprint,
    heightResult: heightResult ? clonePlainRecord(heightResult) : null,
    id: `${FINGERPRINT_PREFIX}:${fingerprint}`,
    invalidities: dedupedInvalidities,
    justification: [...new Set(justification)],
    materialTakeoff: clonePlainRecord(materialTakeoff),
    pendingDecisions: dedupedPending,
    simulation,
    status,
    technicalResult: clonePlainRecord(technicalResult),
    warnings: dedupedWarnings,
    xyProposal: xyProposal ? clonePlainRecord(xyProposal) : null,
  };
}

export function createCoordinatedInstallationFingerprint(
  snapshot: CoordinatedInstallationSnapshot,
) {
  const signature = stableSerialize({
    adoptedDiameterDecisions: sortedByStableKey(
      snapshot.adoptedDiameterDecisions ?? [],
    ),
    architecture: canonicalArchitecture(snapshot.architecture),
    bounds: snapshot.bounds,
    diameterTransitionDecisions: sortedByStableKey(
      snapshot.diameterTransitionDecisions ?? [],
    ),
    equipment: [...snapshot.equipment].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    marginMeters: snapshot.marginMeters,
    minSegmentLengthSource: snapshot.minSegmentLengthSource,
    network: canonicalNetwork(snapshot.network),
    pdfPageNumber: snapshot.pdfPageNumber ?? null,
    pipeContextBySegmentId: snapshot.pipeContextBySegmentId ?? {},
    pipeSystem: snapshot.pipeSystem?.identity ?? null,
    planBaseId: snapshot.planBaseId,
    preferredApplianceOrder: snapshot.preferredApplianceOrder ?? [],
    preferredBranchEquipmentIdsByApplianceId:
      snapshot.preferredBranchEquipmentIdsByApplianceId ?? {},
    professionalDistributionHeight:
      snapshot.professionalDistributionHeight ?? null,
    projectGas: snapshot.projectGas ?? null,
    restrictions: canonicalRestrictions(
      snapshot.restrictions ?? snapshot.architecture?.restrictions ?? [],
    ),
    routeAccessoryProposalDecisions: sortedByStableKey(
      snapshot.routeAccessoryProposalDecisions ?? [],
    ),
    scaleMetersPerSourceUnit: snapshot.scaleMetersPerSourceUnit,
  });

  return `${stableHash(signature)}:${signature.length}`;
}

function createCoordinatedInstallationXyFingerprint(
  snapshot: CoordinatedInstallationSnapshot,
) {
  const signature = stableSerialize({
    architecture: canonicalArchitecture(snapshot.architecture),
    bounds: snapshot.bounds,
    equipment: [...snapshot.equipment].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    marginMeters: snapshot.marginMeters,
    minSegmentLengthSource: snapshot.minSegmentLengthSource,
    network: canonicalNetwork(snapshot.network),
    pdfPageNumber: snapshot.pdfPageNumber ?? null,
    planBaseId: snapshot.planBaseId,
    preferredApplianceOrder: snapshot.preferredApplianceOrder ?? [],
    preferredBranchEquipmentIdsByApplianceId:
      snapshot.preferredBranchEquipmentIdsByApplianceId ?? {},
    restrictions: canonicalRestrictions(
      snapshot.restrictions ?? snapshot.architecture?.restrictions ?? [],
    ),
    scaleMetersPerSourceUnit: snapshot.scaleMetersPerSourceUnit,
  });

  return `xy:${stableHash(signature)}:${signature.length}`;
}

function validateSnapshotInput(
  snapshot: CoordinatedInstallationSnapshot,
): CoordinatedInstallationInvalidity[] {
  const issues: CoordinatedInstallationInvalidity[] = [];
  const supplyIds = snapshot.equipment
    .filter((item) => item.role === "supply")
    .map((item) => item.id);

  if (!snapshot.planBaseId || supplyIds.length !== 1) {
    issues.push({
      code: "invalid_input",
      message:
        supplyIds.length === 1
          ? "Falta identificar la Planta de la propuesta."
          : "La propuesta requiere exactamente un medidor o alimentacion.",
      referenceIds: supplyIds,
    });
  }

  if (
    snapshot.scaleMetersPerSourceUnit === null ||
    !Number.isFinite(snapshot.scaleMetersPerSourceUnit) ||
    snapshot.scaleMetersPerSourceUnit <= 0 ||
    !Number.isFinite(snapshot.marginMeters) ||
    snapshot.marginMeters < 0 ||
    !Number.isFinite(snapshot.minSegmentLengthSource) ||
    snapshot.minSegmentLengthSource <= 0
  ) {
    issues.push({
      code: "invalid_input",
      message: "La escala, el margen o la tolerancia geometrica no son validos.",
      referenceIds: [],
    });
  }

  return issues;
}

function appendHeightOutcome(params: {
  heightResult: RouteHeightProposalEngineResult;
  invalidities: CoordinatedInstallationInvalidity[];
  justification: string[];
  pendingDecisions: CoordinatedInstallationPendingDecision[];
  warnings: CoordinatedInstallationWarning[];
}) {
  const { heightResult } = params;
  params.justification.push(
    heightResult.mode === "professional_distribution_height"
      ? `01C-B evaluo ${heightResult.proposals.length} puntos con la altura profesional de distribucion.`
      : `01C-B evaluo ${heightResult.proposals.length} puntos entre referencias confirmadas.`,
  );

  if (
    heightResult.mode === "matching_confirmed_boundaries" &&
    heightResult.proposals.length > 0
  ) {
    params.pendingDecisions.push({
      code: "distribution_height_required",
      message:
        "Existen alturas sugeridas entre referencias, pero no una altura profesional unica para coordinar los montantes terminales.",
      neededData:
        "Confirme la altura general de distribucion o revise individualmente las alturas sugeridas.",
      referenceIds: heightResult.proposals.map((proposal) => proposal.targetKey),
    });
  }

  params.pendingDecisions.push(
    ...heightResult.diagnostics.map((diagnostic) => ({
      code: "height_definition_required" as const,
      message: diagnostic.message,
      neededData: diagnostic.neededData,
      referenceIds: [...diagnostic.targetKeys],
    })),
  );

  const risers = heightResult.automaticRisers;
  if (risers) {
    params.justification.push(
      `01C-C1 genero ${risers.risers.length} montantes con estado ${risers.status}.`,
    );
    params.warnings.push(
      ...risers.interferences
        .filter((item) => item.status === "unverified")
        .map((item) => ({
          code: "unverified_3d_clearance" as const,
          message: item.message,
          referenceIds: [item.riserId],
        })),
    );
    if (risers.status === "invalid") {
      params.invalidities.push(
        ...risers.diagnostics
          .filter(
            (diagnostic) =>
              diagnostic.code === "invalid_vertical_geometry" ||
              diagnostic.code === "known_restriction_collision",
          )
          .map((diagnostic) => ({
            code:
              diagnostic.code === "known_restriction_collision"
                ? ("known_restriction_collision" as const)
                : ("invalid_riser_geometry" as const),
            message: diagnostic.message,
            referenceIds: [
              diagnostic.equipmentId,
              diagnostic.segmentId,
            ].filter((value): value is string => Boolean(value)),
          })),
      );
    }
    if (risers.status === "incomplete") {
      params.pendingDecisions.push(
        ...risers.diagnostics.map((diagnostic) => ({
          code: "riser_definition_required" as const,
          message: diagnostic.message,
          neededData: diagnostic.neededData,
          referenceIds: [diagnostic.equipmentId, diagnostic.segmentId].filter(
            (value): value is string => Boolean(value),
          ),
        })),
      );
    }
  }

  const internal = heightResult.internalLevelChanges;
  if (internal) {
    const selected = recommendedInternalAlternative(heightResult);
    params.justification.push(
      internal.status === "not_needed"
        ? "01C-C2 no detecto cambios de nivel internos necesarios."
        : `01C-C2 evaluo ${internal.evaluatedCandidateCount} ubicaciones y selecciono ${selected?.changes.length ?? 0} cambios internos.`,
    );
    if (selected) {
      params.warnings.push(
        ...selected.interferences.map((item) => ({
          code: "unverified_3d_clearance" as const,
          message: item.message,
          referenceIds: [item.changeId],
        })),
      );
    }
    if (internal.truncated) {
      params.warnings.push({
        code: "bounded_internal_alternatives",
        message:
          "La comparacion de cambios internos se limito al maximo deterministico del motor.",
        referenceIds: [],
      });
    }
    if (internal.status === "incomplete") {
      params.pendingDecisions.push(
        ...internal.diagnostics
          .filter((diagnostic) => diagnostic.severity === "blocking")
          .map((diagnostic) => ({
            code: "height_definition_required" as const,
            message: diagnostic.message,
            neededData: diagnostic.neededData,
            referenceIds: [diagnostic.sectorId, diagnostic.candidateId].filter(
              (value): value is string => Boolean(value),
            ),
          })),
      );
    }
  }
}

function recommendedInternalAlternative(result: RouteHeightProposalEngineResult) {
  const evaluation = result.internalLevelChanges;
  return (
    evaluation?.alternatives.find(
      (alternative) => alternative.id === evaluation.recommendedAlternativeId,
    ) ?? null
  );
}

function validateCandidateGeometry(params: {
  equipment: WorkbenchEquipment[];
  minSegmentLengthSource: number;
  network: ManualRouteNetwork;
  requireAllAppliances: boolean;
}): CoordinatedInstallationInvalidity[] {
  const issues: CoordinatedInstallationInvalidity[] = [];
  const network = params.network;

  if (hasDuplicateNodeIds(network) || hasDuplicateSegmentIds(network)) {
    issues.push({
      code: "duplicate_ids",
      message: "La red candidata contiene identificadores duplicados.",
      referenceIds: [],
    });
  }

  if (
    hasSegmentsWithMissingEndpoints(network) ||
    hasDuplicateSegments(network) ||
    hasZeroLengthSegments(
      network,
      params.equipment,
      params.minSegmentLengthSource,
    ) ||
    detectRouteCycle(network) ||
    hasRouteCrossingsWithoutNode(network, params.equipment) ||
    !applianceNodesAreTerminal(network)
  ) {
    issues.push({
      code: "invalid_topology",
      message:
        "La red candidata no conserva una topologia valida, conexa y terminal.",
      referenceIds: [],
    });
  }

  const applianceCount = params.equipment.filter(
    (item) => item.role === "appliance",
  ).length;
  if (
    params.requireAllAppliances &&
    getConnectedApplianceEquipmentIds(network, params.equipment).size !==
    applianceCount
  ) {
    issues.push({
      code: "invalid_topology",
      message: "No todos los artefactos tienen camino hasta la alimentacion.",
      referenceIds: [],
    });
  }

  const diagonalSegmentIds = resolveRouteSegments(network, params.equipment)
    .filter((segment) =>
      segment.path.some((point, index) => {
        const next = segment.path[index + 1];
        return next ? legMovesInPlanAndHeight(point, next) : false;
      }),
    )
    .map((segment) => segment.id);
  if (diagonalSegmentIds.length > 0) {
    issues.push({
      code: "invalid_orthogonal_geometry",
      message: "La red candidata contiene patas diagonales en XY/Z.",
      referenceIds: diagonalSegmentIds,
    });
  }

  for (const segment of network.segments) {
    for (const accessory of segment.accessories ?? []) {
      if (accessory.segmentId !== segment.id) {
        issues.push({
          code: "invalid_topology",
          message: `El accesorio ${accessory.id} referencia un tramo distinto de su propietario.`,
          referenceIds: [accessory.id, accessory.segmentId, segment.id],
        });
      }
    }
  }

  return issues;
}

function validatePreservedConfirmedState(params: {
  afterEquipment: WorkbenchEquipment[];
  afterNetwork: ManualRouteNetwork;
  beforeEquipment: WorkbenchEquipment[];
  beforeNetwork: ManualRouteNetwork;
}): CoordinatedInstallationInvalidity[] {
  const issues: CoordinatedInstallationInvalidity[] = [];
  const afterEquipmentById = new Map(
    params.afterEquipment.map((item) => [item.id, item]),
  );
  const beforeEquipmentById = new Map(
    params.beforeEquipment.map((item) => [item.id, item]),
  );
  const afterNodeById = new Map(
    params.afterNetwork.nodes.map((node) => [node.id, node]),
  );
  const afterSegmentById = new Map(
    params.afterNetwork.segments.map((segment) => [segment.id, segment]),
  );

  for (const before of params.beforeEquipment) {
    const after = afterEquipmentById.get(before.id);
    const confirmedEquipmentHeight = before.elevation?.status === "confirmed";
    const confirmedTerminalHeight =
      before.terminalConfig?.heightStatus === "confirmed";

    if (
      !after ||
      (confirmedEquipmentHeight &&
        (!sameNumber(
          pointZMeters(before.connectionPoint),
          pointZMeters(after.connectionPoint),
        ) ||
          stableSerialize(after.elevation) !==
            stableSerialize(before.elevation))) ||
      (confirmedTerminalHeight &&
        stableSerialize(before.terminalConfig) !==
          stableSerialize(after.terminalConfig))
    ) {
      issues.push({
        code: "confirmed_elevation_lost",
        message: `La propuesta no conserva la cota confirmada de ${before.name}.`,
        referenceIds: [before.id],
      });
    }
  }

  for (const before of params.beforeNetwork.nodes) {
    if (before.elevation?.status !== "confirmed") {
      continue;
    }
    const after = afterNodeById.get(before.id);
    const beforePosition = resolveRouteNodePosition(
      before,
      beforeEquipmentById,
    );
    const afterPosition = after
      ? resolveRouteNodePosition(after, afterEquipmentById)
      : null;
    if (
      !after ||
      !samePoint3d(beforePosition, afterPosition) ||
      stableSerialize(after.elevation) !== stableSerialize(before.elevation)
    ) {
      issues.push({
        code: "confirmed_elevation_lost",
        message: `La propuesta no conserva la cota confirmada del nodo ${before.id}.`,
        referenceIds: [before.id],
      });
    }
  }

  for (const before of params.beforeNetwork.segments) {
    const after = afterSegmentById.get(before.id);
    const confirmedPoints = (before.vertices ?? []).flatMap((point, index) => {
      const elevation = before.vertexElevations?.[index];
      return elevation?.status === "confirmed" ? [{ elevation, point }] : [];
    });
    if (
      confirmedPoints.some(
        ({ elevation, point }) =>
          !after?.vertices?.some(
            (candidate, index) =>
              samePoint3d(point, candidate) &&
              stableSerialize(after.vertexElevations?.[index]) ===
                stableSerialize(elevation),
          ),
      )
    ) {
      issues.push({
        code: "confirmed_elevation_lost",
        message: `La propuesta no conserva vertices confirmados del tramo ${before.id}.`,
        referenceIds: [before.id],
      });
    }
  }

  const afterAccessories = new Map(
    params.afterNetwork.segments.flatMap((segment) =>
      (segment.accessories ?? []).map((accessory) => [accessory.id, accessory]),
    ),
  );
  for (const accessory of params.beforeNetwork.segments.flatMap(
    (segment) => segment.accessories ?? [],
  )) {
    if (!isPreservedAccessory(accessory)) {
      continue;
    }
    const after = afterAccessories.get(accessory.id);
    if (!after || stableSerialize(after) !== stableSerialize(accessory)) {
      issues.push({
        code: "manual_accessory_lost",
        message: `La propuesta no conserva el accesorio confirmado ${accessory.id}.`,
        referenceIds: [accessory.id, accessory.segmentId],
      });
    }
  }

  return issues;
}

function invalidTechnicalReferences(params: {
  accessoryDecisions: AccessoryProposalDecision[];
  accessoryProposals: AccessoryProposal[];
  adoptedDiameterDecisions: AdoptedDiameterDecision[];
  candidateNetwork: ManualRouteNetwork;
  diameterTransitionDecisions: DiameterTransitionDecision[];
  pipeContextBySegmentId: Record<
    string,
    PipeSegmentPipeContext | undefined
  >;
  transitionProposals: Array<{ geometryKey: string; id: string }>;
}): CoordinatedInstallationPendingDecision[] {
  const pending: CoordinatedInstallationPendingDecision[] = [];
  const segmentIds = new Set(
    params.candidateNetwork.segments.map((segment) => segment.id),
  );
  const accessoryById = new Map(
    params.accessoryProposals.map((proposal) => [proposal.id, proposal]),
  );
  const transitionById = new Map(
    params.transitionProposals.map((proposal) => [proposal.id, proposal]),
  );

  for (const decision of params.adoptedDiameterDecisions) {
    if (!segmentIds.has(decision.segmentId)) {
      pending.push({
        code: "adopted_diameter_reference_invalid",
        message: `El diametro adoptado referencia el tramo inexistente ${decision.segmentId}.`,
        neededData:
          "Revise y vuelva a confirmar el diametro sobre un tramo vigente.",
        referenceIds: [decision.segmentId],
      });
    }
  }

  for (const decision of params.accessoryDecisions) {
    const proposal = accessoryById.get(decision.proposalId);
    if (
      !proposal ||
      proposal.geometryKey !== decision.geometryKey ||
      (decision.ownerSegmentId && !segmentIds.has(decision.ownerSegmentId))
    ) {
      pending.push({
        code: "accessory_decision_reference_invalid",
        message: `La seleccion de accesorio ${decision.proposalId} ya no coincide con la geometria candidata.`,
        neededData:
          "Revise y vuelva a confirmar la seleccion SIGAS sobre la geometria vigente.",
        referenceIds: [decision.proposalId, decision.ownerSegmentId].filter(
          (value): value is string => Boolean(value),
        ),
      });
    }
  }

  for (const decision of params.diameterTransitionDecisions) {
    const proposal = transitionById.get(decision.transitionId);
    if (!proposal || proposal.geometryKey !== decision.geometryKey) {
      pending.push({
        code: "transition_decision_reference_invalid",
        message: `La decision de transicion ${decision.transitionId} ya no coincide con la geometria candidata.`,
        neededData:
          "Revise y vuelva a confirmar la transicion sobre la geometria vigente.",
        referenceIds: [decision.transitionId],
      });
    }
  }

  for (const segmentId of Object.keys(params.pipeContextBySegmentId)) {
    if (!segmentIds.has(segmentId)) {
      pending.push({
        code: "pipe_context_reference_invalid",
        message: `El contexto tecnico referencia el tramo inexistente ${segmentId}.`,
        neededData:
          "Revise el material o contexto de tuberia asociado al tramo reemplazado.",
        referenceIds: [segmentId],
      });
    }
  }

  return pending;
}

type TerminalPreparationResult =
  | { network: ManualRouteNetwork; ok: true }
  | { equipmentId?: string; message: string; ok: false };

function prepareTerminalConnections(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pdfPageNumber?: number;
  planBaseId: string;
  scaleMetersPerSourceUnit: number | null;
}): TerminalPreparationResult {
  let network = cloneRouteNetwork(params.network);

  for (const equipment of [...params.equipment].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (
      equipment.role !== "appliance" ||
      !equipmentTerminalHeightIsConfirmed(equipment.terminalConfig) ||
      equipment.terminalConfig?.connectionHeightMeters === null
    ) {
      continue;
    }

    const applianceNode = findRouteNodeByEquipment(network, equipment.id);
    const terminalStartNodeId = routeEquipmentTerminalStartNodeId(
      params.planBaseId,
      equipment.id,
    );
    const hasTerminalStart = network.nodes.some(
      (node) => node.id === terminalStartNodeId,
    );

    if (
      applianceNode &&
      !hasTerminalStart &&
      getRouteNodeDegree(network, applianceNode.id) > 0
    ) {
      const update = applyConfirmedEquipmentTerminalConnection({
        equipment: params.equipment,
        equipmentId: equipment.id,
        network,
        scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
      });
      if (!update.ok) {
        return { equipmentId: equipment.id, message: update.message, ok: false };
      }
      network = update.network;
      continue;
    }

    const terminalStartPoint = equipmentTerminalStartPoint({
      equipment,
      scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
    });
    if (!terminalStartPoint.ok) {
      return {
        equipmentId: equipment.id,
        message: terminalStartPoint.message,
        ok: false,
      };
    }

    const applianceNodeId = routeEquipmentNodeId(
      params.planBaseId,
      equipment.id,
    );
    const terminalSegmentId = routeEquipmentTerminalSegmentId(
      params.planBaseId,
      equipment.id,
    );
    const nodes = network.nodes.map((node) =>
      node.id === terminalStartNodeId
        ? {
            ...node,
            kind: "route" as const,
            origin: node.origin ?? "manual",
            pdfPageNumber: equipment.pdfPageNumber ?? params.pdfPageNumber,
            position: terminalStartPoint.point,
          }
        : node,
    );
    if (!nodes.some((node) => node.id === terminalStartNodeId)) {
      nodes.push({
        id: terminalStartNodeId,
        kind: "route",
        origin: "manual",
        pdfPageNumber: equipment.pdfPageNumber ?? params.pdfPageNumber,
        position: terminalStartPoint.point,
      });
    }
    if (!nodes.some((node) => node.id === applianceNodeId)) {
      nodes.push({
        equipmentId: equipment.id,
        id: applianceNodeId,
        kind: "appliance",
        origin: "manual",
        pdfPageNumber: equipment.pdfPageNumber ?? params.pdfPageNumber,
      });
    }
    const segments = network.segments.map((segment) =>
      segment.id === terminalSegmentId
        ? {
            ...segment,
            fromNodeId: terminalStartNodeId,
            origin: segment.origin ?? "manual",
            toNodeId: applianceNodeId,
          }
        : segment,
    );
    if (!segments.some((segment) => segment.id === terminalSegmentId)) {
      segments.push({
        fromNodeId: terminalStartNodeId,
        id: terminalSegmentId,
        origin: "manual",
        toNodeId: applianceNodeId,
      });
    }
    const update = applyConfirmedEquipmentTerminalConnection({
      equipment: params.equipment,
      equipmentId: equipment.id,
      network: { nodes, segments },
      scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
    });
    if (!update.ok) {
      return { equipmentId: equipment.id, message: update.message, ok: false };
    }
    network = update.network;
  }

  return { network, ok: true };
}

function equipmentTerminalStartPoint(params: {
  equipment: WorkbenchEquipment;
  scaleMetersPerSourceUnit: number | null;
}): { ok: true; point: Point2D } | { message: string; ok: false } {
  const config = params.equipment.terminalConfig;
  if (!config) {
    return { message: "El artefacto no tiene configuracion terminal.", ok: false };
  }
  if (
    config.lateralOffsetMeters > 0 &&
    (!params.scaleMetersPerSourceUnit ||
      params.scaleMetersPerSourceUnit <= 0)
  ) {
    return {
      message:
        "Confirme la escala antes de aplicar el desplazamiento fisico terminal.",
      ok: false,
    };
  }
  const orientation = params.equipment.wallAnchor?.orientationRadians;
  const wallPoint =
    params.equipment.wallAnchor?.wallPoint ?? params.equipment.connectionPoint;
  const tangent =
    orientation !== null &&
    orientation !== undefined &&
    Number.isFinite(orientation)
      ? { x: Math.cos(orientation), y: Math.sin(orientation) }
      : { x: 1, y: 0 };
  const offsetSource =
    config.lateralOffsetMeters > 0 && params.scaleMetersPerSourceUnit
      ? config.lateralOffsetMeters / params.scaleMetersPerSourceUnit
      : 0;
  const sign = terminalSideSign(config.outletSide);

  return {
    ok: true,
    point: {
      x: wallPoint.x + tangent.x * sign * offsetSource,
      y: wallPoint.y + tangent.y * sign * offsetSource,
      z: 0,
    },
  };
}

function terminalSideSign(side: EquipmentTerminalOutletSide) {
  return side === "left" ? -1 : side === "right" ? 1 : 0;
}

function cloneSnapshotState(snapshot: CoordinatedInstallationSnapshot) {
  return {
    equipment: cloneEquipment(snapshot.equipment),
    network: cloneRouteNetwork(snapshot.network),
    pipeContextBySegmentId: clonePlainRecord(
      snapshot.pipeContextBySegmentId ?? {},
    ),
    projectGas:
      snapshot.projectGas === undefined
        ? undefined
        : snapshot.projectGas === null
          ? null
          : { ...snapshot.projectGas },
  };
}

function cloneEquipment(equipment: WorkbenchEquipment[]) {
  return clonePlainRecord(equipment);
}

function cloneRouteNetwork(network: ManualRouteNetwork): ManualRouteNetwork {
  return clonePlainRecord(network);
}

function cloneArchitecture(
  architecture: ArchitecturalRouteContext | undefined,
) {
  return architecture ? clonePlainRecord(architecture) : undefined;
}

function cloneRestrictions(restrictions: AutomaticRouteRestriction[]) {
  return clonePlainRecord(restrictions);
}

function clonePlainRecord<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalNetwork(network: ManualRouteNetwork) {
  return {
    nodes: [...network.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    segments: [...network.segments]
      .map((segment) => ({
        ...segment,
        ...(segment.accessories
          ? {
              accessories: [...segment.accessories].sort((a, b) =>
                a.id.localeCompare(b.id),
              ),
            }
          : {}),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function canonicalArchitecture(
  architecture: ArchitecturalRouteContext | undefined,
) {
  if (!architecture) {
    return null;
  }

  return {
    features: sortedByStableKey(architecture.features),
    guides: sortedByStableKey(architecture.guides),
    openings: sortedByStableKey(architecture.openings),
    pendingStructures: sortedByStableKey(architecture.pendingStructures),
    restrictions: canonicalRestrictions(architecture.restrictions),
  };
}

function canonicalRestrictions(restrictions: AutomaticRouteRestriction[]) {
  return sortedByStableKey(restrictions);
}

function sortedByStableKey<T>(items: T[]) {
  return [...items].sort((a, b) =>
    stableSerialize(a).localeCompare(stableSerialize(b)),
  );
}

function networksEquivalent(
  first: ManualRouteNetwork,
  second: ManualRouteNetwork,
) {
  return (
    stableSerialize(canonicalNetwork(first)) ===
    stableSerialize(canonicalNetwork(second))
  );
}

function legMovesInPlanAndHeight(first: Point2D, second: Point2D) {
  const movesInPlan =
    !sameNumber(first.x, second.x) || !sameNumber(first.y, second.y);
  const changesHeight = !sameNumber(
    pointZMeters(first),
    pointZMeters(second),
  );
  return movesInPlan && changesHeight;
}

function samePoint3d(
  first: Point2D | null | undefined,
  second: Point2D | null | undefined,
) {
  return Boolean(
    first &&
      second &&
      sameNumber(first.x, second.x) &&
      sameNumber(first.y, second.y) &&
      sameNumber(pointZMeters(first), pointZMeters(second)),
  );
}

function sameNumber(first: number, second: number) {
  return Math.abs(first - second) <= GEOMETRY_EPSILON;
}

function isPreservedAccessory(accessory: RouteSegmentAccessory) {
  return (
    accessory.origin === undefined ||
    accessory.origin === "manual" ||
    accessory.origin === "user_confirmed" ||
    accessory.origin === "automatic_confirmed"
  );
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function dedupeByKey<T>(items: T[], keyFor: (item: T) => string) {
  const unique = new Map<string, T>();
  for (const item of items) {
    unique.set(keyFor(item), item);
  }
  return [...unique.values()].sort((a, b) =>
    keyFor(a).localeCompare(keyFor(b)),
  );
}

function invalidityKey(item: CoordinatedInstallationInvalidity) {
  return `${item.code}:${item.message}:${item.referenceIds.join("|")}`;
}

function pendingDecisionKey(item: CoordinatedInstallationPendingDecision) {
  return `${item.code}:${item.message}:${item.referenceIds.join("|")}`;
}

function warningKey(item: CoordinatedInstallationWarning) {
  return `${item.code}:${item.message}:${item.referenceIds.join("|")}`;
}
