import { createTechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import type { PipeSystem } from "@/lib/calculation/pipeSystem";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  getConnectedApplianceEquipmentIds,
  getDerivationNodeIds,
  totalRouteLengthSource,
} from "@/lib/routing/network";
import type { AccessoryProposal } from "@/lib/routing/routeAccessoryProposals";
import type {
  AutomaticRouteProposal,
  ManualRouteNetwork,
} from "@/lib/routing/types";
import {
  collectStandardTechnicalReviewGeometryPendingItems,
  createStandardTechnicalAxonometricView,
  createStandardTechnicalSectionView,
  type StandardTechnicalReviewGeometryPendingItem,
  type StandardTechnicalSectionView,
} from "@/lib/sections/standardTechnicalViews";
import type { TechnicalAxonometricView } from "@/lib/calculation/technicalAxonometric";
import type {
  CoordinatedInstallationDraft,
  CoordinatedInstallationDraftTechnicalState,
} from "./coordinatedInstallationDraft";
import type {
  CoordinatedInstallationInvalidity,
  CoordinatedInstallationPendingDecision,
  CoordinatedInstallationProposal,
  CoordinatedInstallationProposalStatus,
  CoordinatedInstallationWarning,
} from "./coordinatedInstallationProposal";

export type CoordinatedInstallationVisualization = {
  accessoryProposals: AccessoryProposal[];
  candidateFingerprint: string;
  equipment: WorkbenchEquipment[];
  invalidities: CoordinatedInstallationInvalidity[];
  network: ManualRouteNetwork;
  pendingDecisions: CoordinatedInstallationPendingDecision[];
  source: "candidate" | "draft";
  sourceId: string;
  status: CoordinatedInstallationProposalStatus;
  technicalApproval: "not_approved";
  technicalResult: TechnicalCalculationResult;
  technicalState: CoordinatedInstallationDraftTechnicalState;
  warnings: CoordinatedInstallationWarning[];
};

export type CoordinatedInstallationTechnicalViews = {
  axonometricView: TechnicalAxonometricView;
  geometryPendingItems: StandardTechnicalReviewGeometryPendingItem[];
  sectionViews: {
    "section-aa": StandardTechnicalSectionView;
    "section-bb": StandardTechnicalSectionView;
  };
};

/**
 * Selects the single immutable candidate shown by every 02C1 viewer. This
 * function intentionally does not run XY, height or technical engines.
 */
export function createCoordinatedInstallationVisualization(params: {
  draft: CoordinatedInstallationDraft | null;
  proposal: CoordinatedInstallationProposal;
}): CoordinatedInstallationVisualization {
  const draft =
    params.draft?.sourceProposalId === params.proposal.id ? params.draft : null;

  if (draft) {
    return {
      accessoryProposals: draft.evaluation.accessoryProposals,
      candidateFingerprint: draft.draftFingerprint,
      equipment: draft.proposalDraftEquipment,
      invalidities: draft.evaluation.invalidities,
      network: draft.proposalDraftNetwork,
      pendingDecisions: draft.evaluation.pendingDecisions,
      source: "draft",
      sourceId: draft.id,
      status: draft.evaluation.status,
      technicalApproval: "not_approved",
      technicalResult: draft.evaluation.technicalResult,
      technicalState: draft.technicalState,
      warnings: mergeWarnings(params.proposal.warnings, draft.evaluation.warnings),
    };
  }

  return {
    accessoryProposals: [],
    candidateFingerprint: params.proposal.fingerprint,
    equipment: params.proposal.candidateEquipment,
    invalidities: params.proposal.invalidities,
    network: params.proposal.candidateNetwork,
    pendingDecisions: params.proposal.pendingDecisions,
    source: "candidate",
    sourceId: params.proposal.id,
    status: params.proposal.status,
    technicalApproval: "not_approved",
    technicalResult: params.proposal.technicalResult,
    technicalState: {
      adoptedDiameterDecisions: [],
      diameterTransitionDecisions: [],
      pipeContextBySegmentId: {},
      routeAccessoryProposalDecisions: [],
    },
    warnings: params.proposal.warnings,
  };
}

/** Builds the three derived technical canvases once from the selected network. */
export function createCoordinatedInstallationTechnicalViews(params: {
  pipeSystem: PipeSystem;
  scaleMetersPerSourceUnit: number | null;
  visualization: CoordinatedInstallationVisualization;
}): CoordinatedInstallationTechnicalViews {
  const visualization = params.visualization;
  const transitionProposals =
    visualization.technicalResult.transitionAwareNetworkSizing?.transitions ?? [];
  const inventory = createTechnicalPhysicalAccessoryInventory({
    accessoryProposals: visualization.accessoryProposals,
    diameterTransitionProposals: transitionProposals,
    equipment: visualization.equipment,
    network: visualization.network,
    result: visualization.technicalResult,
  });
  const equivalentVerificationBySegmentId =
    createTechnicalEquivalentAccessoryVerification({
      inventory,
      pipeSystem: params.pipeSystem,
      result: visualization.technicalResult,
    });
  const adoptedDiameterValidation = createTechnicalAdoptedDiameterValidation({
    decisions: visualization.technicalState.adoptedDiameterDecisions,
    equivalentVerificationBySegmentId,
    pipeSystem: params.pipeSystem,
    result: visualization.technicalResult,
  });
  const shared = {
    adoptedDiameterValidation,
    equipment: visualization.equipment,
    inventory,
    network: visualization.network,
    result: visualization.technicalResult,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
  };
  const sectionViews = {
    "section-aa": createStandardTechnicalSectionView({
      ...shared,
      axis: "x",
      id: "section-aa",
      title: "Corte A-A",
    }),
    "section-bb": createStandardTechnicalSectionView({
      ...shared,
      axis: "y",
      id: "section-bb",
      title: "Corte B-B",
    }),
  };
  const axonometricView = createStandardTechnicalAxonometricView(shared);

  return {
    axonometricView,
    geometryPendingItems: collectStandardTechnicalReviewGeometryPendingItems({
      axonometricView,
      sectionViews: Object.values(sectionViews),
    }),
    sectionViews,
  };
}

/** Adapts the same candidate network to the existing plan overlay. */
export function createCoordinatedInstallationPlanProposal(params: {
  pdfPageNumber?: number;
  planBaseId: string;
  proposal: CoordinatedInstallationProposal;
  scaleMetersPerSourceUnit?: number | null;
  visualization: CoordinatedInstallationVisualization;
}): AutomaticRouteProposal {
  const fallbackLengthSource = totalRouteLengthSource(
    params.visualization.network,
    params.visualization.equipment,
  );
  const fallbackScale = params.scaleMetersPerSourceUnit ?? 0;
  const xyProposal: AutomaticRouteProposal = params.proposal.xyProposal ?? {
    architecturalWarnings: [],
    baseId: params.planBaseId,
    derivationCount: 0,
    diagnostics: [],
    id: `${params.proposal.id}:xy-unavailable`,
    lengthMeters: fallbackLengthSource * fallbackScale,
    lengthSource: fallbackLengthSource,
    nodes: params.visualization.network.nodes,
    params: {
      fingerprint: params.proposal.fingerprint,
      marginMeters: 0,
      scaleMetersPerSourceUnit: fallbackScale,
    },
    pdfPageNumber: params.pdfPageNumber,
    reachedEquipmentIds: [],
    segmentCount: params.visualization.network.segments.length,
    segments: params.visualization.network.segments,
    status: "invalid",
    turnCount: 0,
    unreachedEquipmentIds: [],
    validation: {
      allConnected: false,
      appliancesTerminal: false,
      canAccept: false,
      connectedToSupply: false,
      hasCrossingsWithoutNode: false,
      hasCycle: false,
      hasDuplicateSegments: false,
      hasZeroLengthSegments: false,
      restrictionCount: params.proposal.invalidities.length,
    },
  };

  const connected = getConnectedApplianceEquipmentIds(
    params.visualization.network,
    params.visualization.equipment,
  );
  const applianceIds = params.visualization.equipment
    .filter((equipment) => equipment.role === "appliance")
    .map((equipment) => equipment.id);
  const reachedEquipmentIds = applianceIds.filter((id) => connected.has(id));
  const unreachedEquipmentIds = applianceIds.filter((id) => !connected.has(id));

  return {
    ...xyProposal,
    derivationCount: getDerivationNodeIds(params.visualization.network).length,
    id: `${params.visualization.sourceId}:plan`,
    nodes: params.visualization.network.nodes,
    reachedEquipmentIds,
    segmentCount: params.visualization.network.segments.length,
    segments: params.visualization.network.segments,
    status:
      params.visualization.status === "invalid"
        ? "invalid"
        : params.visualization.status === "incomplete"
          ? "partial"
          : "ready",
    unreachedEquipmentIds,
    validation: {
      ...xyProposal.validation,
      allConnected: unreachedEquipmentIds.length === 0,
      canAccept: false,
    },
  };
}

function mergeWarnings(
  first: CoordinatedInstallationWarning[],
  second: CoordinatedInstallationWarning[],
) {
  const warnings = new Map<string, CoordinatedInstallationWarning>();

  for (const warning of [...first, ...second]) {
    const key = `${warning.code}:${warning.referenceIds.join(",")}:${warning.message}`;
    warnings.set(key, warning);
  }

  return [...warnings.values()];
}
