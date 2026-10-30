import {
  accessoryCatalogSelectionFromCandidate,
  type AccessoryProposalTechnicalReview,
} from "@/lib/calculation/accessoryCatalogCandidates";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import {
  getSigasAccessoryCatalogCandidates,
  matchSigasAccessoryProposal,
} from "@/lib/calculation/pipeSystems/sigas/sigasAccessoryProposal";
import {
  createSigasAccessoryExactSelectionDecisions,
  createSigasAccessorySelectionDiameterIndex,
  reconcileSigasAccessoryExactCatalogRows,
  selectSigasAccessoryExactCatalogRow,
  type SigasAccessoryExactSelectionDecision,
} from "@/lib/calculation/pipeSystems/sigas/sigasAccessoryExactSelection";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  insertPhysicalRouteVertex,
  movePhysicalRouteNode,
  movePhysicalRouteVertex,
  removePhysicalRouteVertex,
} from "@/lib/routing/physicalRouteEditing";
import {
  confirmRouteAccessoryProposal,
  detectRouteAccessoryProposals,
  rejectRouteAccessoryProposal,
  resolveAccessoryProposalTechnicalOwner,
  routeAccessoryProposalHasManualAccessory,
  upsertAccessoryProposalDecision,
  withAccessoryProposalSystemMatch,
  type AccessoryProposal,
} from "@/lib/routing/routeAccessoryProposals";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  applySectionRouteHeightEdit,
  type SectionRouteHeightTarget,
} from "@/lib/sections/routeHeightEditing";
import {
  createCoordinatedInstallationCandidateFingerprint,
  createCoordinatedInstallationFingerprint,
  createCoordinatedInstallationProposal,
  evaluateCoordinatedInstallationCandidate,
  type CoordinatedInstallationCandidateTechnicalState,
  type CoordinatedInstallationCandidateEvaluation,
  type CoordinatedInstallationProposal,
  type CoordinatedInstallationSnapshot,
  type CoordinatedInstallationWarning,
} from "./coordinatedInstallationProposal";

export type CoordinatedInstallationDraftEdit =
  | {
      kind: "insert_vertex";
      point: Point2D;
      segmentId: string;
      tolerance: number;
    }
  | {
      kind: "move_node";
      nodeId: string;
      point: Point2D;
      tolerance: number;
    }
  | {
      kind: "move_vertex";
      point: Point2D;
      segmentId: string;
      vertexIndex: number;
    }
  | {
      kind: "remove_vertex";
      segmentId: string;
      vertexIndex: number;
    }
  | {
      heightMeters: number;
      kind: "set_height";
      target: SectionRouteHeightTarget;
    };

export type CoordinatedInstallationDraftTechnicalState =
  CoordinatedInstallationCandidateTechnicalState;

export type CoordinatedInstallationDraftReadiness = {
  geometricAcceptance: "blocked" | "ready";
  requiredTechnicalApprovalWarningKeys: string[];
  technicalApproval: "blocked" | "not_required" | "required";
};

export type CoordinatedInstallationDraftEditImpact = {
  affectedEquipmentIds: string[];
  affectedNodeIds: string[];
  affectedSegmentIds: string[];
  editKind:
    | CoordinatedInstallationDraftEdit["kind"]
    | "accessory_catalog_selection"
    | "accessory_decision";
  invalidatedDecisionReferenceIds: string[];
};

export type CoordinatedInstallationDraft = {
  baseFingerprint: string;
  draftFingerprint: string;
  evaluation: CoordinatedInstallationCandidateEvaluation;
  id: string;
  inheritedWarnings: CoordinatedInstallationWarning[];
  integrityFingerprint: string;
  lastEdit: CoordinatedInstallationDraftEditImpact | null;
  proposalDraftEquipment: WorkbenchEquipment[];
  proposalDraftNetwork: ManualRouteNetwork;
  readiness: CoordinatedInstallationDraftReadiness;
  revision: number;
  sourceProposalId: string;
  technicalState: CoordinatedInstallationDraftTechnicalState;
};

export type CoordinatedInstallationDraftSnapshot = {
  baseFingerprint: string;
  draftFingerprint: string;
  inheritedWarnings: CoordinatedInstallationWarning[];
  proposalDraftEquipment: WorkbenchEquipment[];
  proposalDraftNetwork: ManualRouteNetwork;
  revision: number;
  sourceProposalId: string;
  technicalState?: CoordinatedInstallationDraftTechnicalState;
};

export type CoordinatedInstallationDraftFailureCode =
  | "draft_modified_outside_session"
  | "edit_rejected"
  | "geometry_invalid"
  | "proposal_incomplete"
  | "proposal_invalid"
  | "proposal_outdated"
  | "technical_approval_required";

export type CoordinatedInstallationDraftFailure = {
  code: CoordinatedInstallationDraftFailureCode;
  evaluation?: CoordinatedInstallationCandidateEvaluation;
  message: string;
  ok: false;
};

export type CoordinatedInstallationDraftResult =
  | { draft: CoordinatedInstallationDraft; ok: true }
  | CoordinatedInstallationDraftFailure;

export type CoordinatedInstallationDraftAcceptance = {
  approved: true;
  candidateFingerprint: string;
  warningKeys: string[];
};

export type CoordinatedInstallationDraftAtomicUpdate = {
  acceptedCandidateFingerprint: string;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  technicalState: CoordinatedInstallationDraftTechnicalState;
  warnings: CoordinatedInstallationWarning[];
};

export type CoordinatedInstallationDraftAccessoryReview = {
  diameterBySegmentId: Map<string, PipeDiameterReference>;
  exactSelectionDecisions: SigasAccessoryExactSelectionDecision[];
  proposals: AccessoryProposal[];
  reviews: AccessoryProposalTechnicalReview[];
};

export function createCoordinatedInstallationDraft(params: {
  proposal: CoordinatedInstallationProposal;
  snapshot: CoordinatedInstallationSnapshot;
}): CoordinatedInstallationDraftResult {
  const baseFingerprint = createCoordinatedInstallationFingerprint(
    params.snapshot,
  );

  if (params.proposal.fingerprint !== baseFingerprint) {
    return outdatedFailure();
  }

  const inheritedWarnings = clone(params.proposal.warnings);
  const technicalState = technicalStateFromSnapshot(params.snapshot);
  const evaluation = evaluateCoordinatedInstallationCandidate({
    candidateEquipment: params.proposal.candidateEquipment,
    candidateNetwork: params.proposal.candidateNetwork,
    inheritedWarnings,
    snapshot: params.snapshot,
    technicalState,
  });
  const draft = createDraftState({
    baseFingerprint,
    evaluation,
    id: `${params.proposal.id}:draft`,
    inheritedWarnings,
    lastEdit: null,
    revision: 0,
    sourceProposalId: params.proposal.id,
    technicalState,
  });

  return { draft, ok: true };
}

export function editCoordinatedInstallationDraft(params: {
  draft: CoordinatedInstallationDraft;
  edit: CoordinatedInstallationDraftEdit;
  snapshot: CoordinatedInstallationSnapshot;
}): CoordinatedInstallationDraftResult {
  const contextFailure = validateDraftContext(params.draft, params.snapshot);

  if (contextFailure) {
    return contextFailure;
  }

  const beforeEquipment = clone(params.draft.proposalDraftEquipment);
  const beforeNetwork = clone(params.draft.proposalDraftNetwork);
  let equipment = clone(beforeEquipment);
  let network = clone(beforeNetwork);
  const edit = params.edit;

  if (
    (edit.kind === "move_node" || edit.kind === "insert_vertex") &&
    (!Number.isFinite(edit.tolerance) || edit.tolerance < 0)
  ) {
    return editFailure("La tolerancia geometrica de edicion no es valida.");
  }

  if (edit.kind === "move_node") {
    const result = movePhysicalRouteNode({
      equipment,
      network,
      nodeId: edit.nodeId,
      point: clone(edit.point),
      tolerance: edit.tolerance,
    });
    if (!result.ok) {
      return editFailure(result.message);
    }
    network = result.network;
  } else if (edit.kind === "move_vertex") {
    const result = movePhysicalRouteVertex({
      network,
      point: clone(edit.point),
      segmentId: edit.segmentId,
      vertexIndex: edit.vertexIndex,
    });
    if (!result.ok) {
      return editFailure(result.message);
    }
    network = result.network;
  } else if (edit.kind === "insert_vertex") {
    const result = insertPhysicalRouteVertex({
      equipment,
      network,
      point: clone(edit.point),
      segmentId: edit.segmentId,
      tolerance: edit.tolerance,
    });
    if (!result.ok) {
      return editFailure(result.message);
    }
    network = result.network;
  } else if (edit.kind === "remove_vertex") {
    const result = removePhysicalRouteVertex({
      network,
      segmentId: edit.segmentId,
      vertexIndex: edit.vertexIndex,
    });
    if (!result.ok) {
      return editFailure(result.message);
    }
    network = result.network;
  } else {
    const result = applySectionRouteHeightEdit({
      equipment,
      heightMeters: edit.heightMeters,
      network,
      scaleMetersPerSourceUnit: params.snapshot.scaleMetersPerSourceUnit,
      target: clone(edit.target),
    });
    if (!result.ok) {
      return editFailure(result.message);
    }
    equipment = result.equipment;
    network = result.network;
  }

  const evaluation = evaluateCoordinatedInstallationCandidate({
    candidateEquipment: equipment,
    candidateNetwork: network,
    inheritedWarnings: params.draft.inheritedWarnings,
    snapshot: params.snapshot,
    technicalState: params.draft.technicalState,
  });
  const lastEdit = createEditImpact({
    afterEquipment: evaluation.candidateEquipment,
    afterNetwork: evaluation.candidateNetwork,
    beforeEquipment,
    beforeNetwork,
    editKind: edit.kind,
    evaluation,
  });
  const draft = createDraftState({
    baseFingerprint: params.draft.baseFingerprint,
    evaluation,
    id: params.draft.id,
    inheritedWarnings: params.draft.inheritedWarnings,
    lastEdit,
    revision: params.draft.revision + 1,
    sourceProposalId: params.draft.sourceProposalId,
    technicalState: params.draft.technicalState,
  });

  return { draft, ok: true };
}

export function regenerateCoordinatedInstallationDraft(
  snapshot: CoordinatedInstallationSnapshot,
): CoordinatedInstallationDraftResult & {
  proposal?: CoordinatedInstallationProposal;
} {
  const proposal = createCoordinatedInstallationProposal(snapshot);
  const result = createCoordinatedInstallationDraft({ proposal, snapshot });

  return result.ok ? { ...result, proposal } : result;
}

export function createCoordinatedInstallationDraftSnapshot(
  draft: CoordinatedInstallationDraft,
): CoordinatedInstallationDraftSnapshot {
  return clone({
    baseFingerprint: draft.baseFingerprint,
    draftFingerprint: draft.draftFingerprint,
    inheritedWarnings: draft.inheritedWarnings,
    proposalDraftEquipment: draft.proposalDraftEquipment,
    proposalDraftNetwork: draft.proposalDraftNetwork,
    revision: draft.revision,
    sourceProposalId: draft.sourceProposalId,
    technicalState: draft.technicalState,
  });
}

/**
 * Restores only persisted source data and rebuilds every derived evaluation.
 * A stale snapshot remains visible but cannot be edited or accepted until it
 * is regenerated against the current confirmed installation.
 */
export function restoreCoordinatedInstallationDraft(params: {
  persisted: CoordinatedInstallationDraftSnapshot;
  snapshot: CoordinatedInstallationSnapshot;
}):
  | {
      draft: CoordinatedInstallationDraft;
      ok: true;
      outdated: boolean;
      proposal: CoordinatedInstallationProposal;
    }
  | CoordinatedInstallationDraftFailure {
  const currentBaseFingerprint = createCoordinatedInstallationFingerprint(
    params.snapshot,
  );
  const outdated =
    currentBaseFingerprint !== params.persisted.baseFingerprint;
  const technicalState = params.persisted.technicalState
    ? clone(params.persisted.technicalState)
    : technicalStateFromSnapshot(params.snapshot);
  const evaluation = evaluateCoordinatedInstallationCandidate({
    candidateEquipment: params.persisted.proposalDraftEquipment,
    candidateNetwork: params.persisted.proposalDraftNetwork,
    inheritedWarnings: params.persisted.inheritedWarnings,
    snapshot: params.snapshot,
    technicalState,
  });

  if (
    !outdated &&
    evaluation.fingerprint !== params.persisted.draftFingerprint
  ) {
    return {
      code: "draft_modified_outside_session",
      message:
        "Los datos guardados del borrador no coinciden con su fingerprint.",
      ok: false,
    };
  }

  const draft = createDraftState({
    baseFingerprint: params.persisted.baseFingerprint,
    evaluation,
    id: `${params.persisted.sourceProposalId}:draft`,
    inheritedWarnings: params.persisted.inheritedWarnings,
    lastEdit: null,
    revision: Math.max(0, Math.trunc(params.persisted.revision)),
    sourceProposalId: params.persisted.sourceProposalId,
    technicalState,
  });
  const proposal: CoordinatedInstallationProposal = {
    candidateEquipment: clone(evaluation.candidateEquipment),
    candidateNetwork: clone(evaluation.candidateNetwork),
    fingerprint: params.persisted.baseFingerprint,
    heightResult: null,
    id: params.persisted.sourceProposalId,
    invalidities: clone(evaluation.invalidities),
    justification: [
      "Borrador coordinado recuperado y revalidado contra el proyecto actual.",
    ],
    materialTakeoff: clone(evaluation.materialTakeoff),
    pendingDecisions: clone(evaluation.pendingDecisions),
    simulation: null,
    status: evaluation.status,
    technicalResult: clone(evaluation.technicalResult),
    warnings: clone(evaluation.warnings),
    xyProposal: null,
  };

  return { draft, ok: true, outdated, proposal };
}

export function discardCoordinatedInstallationDraft(params: {
  draft: CoordinatedInstallationDraft;
  snapshot: CoordinatedInstallationSnapshot;
}) {
  return {
    baseFingerprint: createCoordinatedInstallationFingerprint(params.snapshot),
    equipment: clone(params.snapshot.equipment),
    network: clone(params.snapshot.network),
    ok: true as const,
    status: "discarded" as const,
    technicalState: technicalStateFromSnapshot(params.snapshot),
  };
}

export function reviewCoordinatedInstallationDraftAccessories(params: {
  draft: CoordinatedInstallationDraft;
  snapshot: CoordinatedInstallationSnapshot;
}): CoordinatedInstallationDraftAccessoryReview {
  const diameterBySegmentId = draftAccessoryDiameterIndex(params.draft);
  const proposals = detectRouteAccessoryProposals({
    decisions: params.draft.technicalState.routeAccessoryProposalDecisions,
    diameterBySegmentId,
    equipment: params.draft.proposalDraftEquipment,
    network: params.draft.proposalDraftNetwork,
    scaleMetersPerSourceUnit: params.snapshot.scaleMetersPerSourceUnit,
  }).map((proposal) =>
    withAccessoryProposalSystemMatch(
      proposal,
      matchSigasAccessoryProposal(proposal),
    ),
  );
  const reviews = proposals.map((proposal) =>
    draftAccessoryTechnicalReview({
      diameterBySegmentId,
      network: params.draft.proposalDraftNetwork,
      proposal,
    }),
  );
  const groupedReviews = withEquivalentDraftAccessoryGroups({
    proposals,
    reviews,
  });
  const selectionDiameterBySegmentId =
    createSigasAccessorySelectionDiameterIndex({
      diameterBySegmentId,
      result: params.draft.evaluation.technicalResult,
    });

  return {
    diameterBySegmentId,
    exactSelectionDecisions: createSigasAccessoryExactSelectionDecisions({
      diameterBySegmentId: selectionDiameterBySegmentId,
      network: params.draft.proposalDraftNetwork,
    }),
    proposals,
    reviews: groupedReviews,
  };
}

export function confirmCoordinatedInstallationDraftAccessory(params: {
  candidateId: string;
  decidedAt: number;
  draft: CoordinatedInstallationDraft;
  proposalId: string;
  snapshot: CoordinatedInstallationSnapshot;
}): CoordinatedInstallationDraftResult {
  const contextFailure = validateDraftContext(params.draft, params.snapshot);

  if (contextFailure) {
    return contextFailure;
  }

  const reviewState = reviewCoordinatedInstallationDraftAccessories(params);
  const selectedReview = reviewState.reviews.find(
    (review) => review.proposalId === params.proposalId,
  );
  const selectedCandidate = selectedReview?.candidates.find(
    (candidate) => candidate.id === params.candidateId,
  );

  if (!selectedReview || !selectedCandidate) {
    return editFailure("Selecciona una familia tecnica compatible.");
  }
  if (selectedCandidate.status !== "compatible") {
    return editFailure(selectedCandidate.reason);
  }

  const proposalIds =
    selectedReview.equivalentProposalIds ?? [params.proposalId];
  let network = clone(params.draft.proposalDraftNetwork);
  let decisions = clone(
    params.draft.technicalState.routeAccessoryProposalDecisions,
  );
  const affectedNodeIds: string[] = [];
  const affectedSegmentIds = new Set<string>();

  for (const proposalId of proposalIds) {
    const proposal = reviewState.proposals.find(
      (item) => item.id === proposalId,
    );
    const review = reviewState.reviews.find(
      (item) => item.proposalId === proposalId,
    );
    const candidate = review?.candidates.find(
      (item) =>
        item.familyId === selectedCandidate.familyId &&
        item.pipeSystem.id === selectedCandidate.pipeSystem.id &&
        item.type === selectedCandidate.type,
    );

    if (!proposal || !review || candidate?.status !== "compatible") {
      return editFailure(
        "La decision agrupada ya no es compatible con todos sus nodos.",
      );
    }

    const result = confirmRouteAccessoryProposal({
      decidedAt: params.decidedAt,
      network,
      origin: "user_confirmed",
      ownerResolution: review.ownerResolution,
      proposal,
      selection: accessoryCatalogSelectionFromCandidate(candidate),
    });

    if (!result.ok) {
      return editFailure(result.message);
    }

    network = result.network;
    decisions = upsertAccessoryProposalDecision(decisions, result.decision);
    affectedNodeIds.push(proposal.nodeId);
    proposal.incidentSegmentIds.forEach((segmentId) =>
      affectedSegmentIds.add(segmentId),
    );
  }

  network = reconcileSigasAccessoryExactCatalogRows({
    diameterBySegmentId: reviewState.diameterBySegmentId,
    network,
  });

  return rebuildDraftAfterAccessoryChange({
    affectedNodeIds,
    affectedSegmentIds: [...affectedSegmentIds],
    draft: params.draft,
    editKind: "accessory_decision",
    network,
    snapshot: params.snapshot,
    technicalState: {
      ...params.draft.technicalState,
      routeAccessoryProposalDecisions: decisions,
    },
  });
}

export function rejectCoordinatedInstallationDraftAccessory(params: {
  decidedAt: number;
  draft: CoordinatedInstallationDraft;
  proposalId: string;
  snapshot: CoordinatedInstallationSnapshot;
}): CoordinatedInstallationDraftResult {
  const contextFailure = validateDraftContext(params.draft, params.snapshot);

  if (contextFailure) {
    return contextFailure;
  }

  const reviewState = reviewCoordinatedInstallationDraftAccessories(params);
  const selectedReview = reviewState.reviews.find(
    (review) => review.proposalId === params.proposalId,
  );

  if (!selectedReview) {
    return editFailure("La propuesta de accesorio ya no existe en el borrador.");
  }

  const proposalIds =
    selectedReview.equivalentProposalIds ?? [params.proposalId];
  let network = clone(params.draft.proposalDraftNetwork);
  let decisions = clone(
    params.draft.technicalState.routeAccessoryProposalDecisions,
  );
  const affectedNodeIds: string[] = [];
  const affectedSegmentIds = new Set<string>();

  for (const proposalId of proposalIds) {
    const proposal = reviewState.proposals.find(
      (item) => item.id === proposalId,
    );

    if (!proposal) {
      return editFailure("La propuesta agrupada ya no existe en el borrador.");
    }

    const result = rejectRouteAccessoryProposal({
      decidedAt: params.decidedAt,
      network,
      proposal,
    });
    network = result.network;
    decisions = upsertAccessoryProposalDecision(decisions, result.decision);
    affectedNodeIds.push(proposal.nodeId);
    proposal.incidentSegmentIds.forEach((segmentId) =>
      affectedSegmentIds.add(segmentId),
    );
  }

  return rebuildDraftAfterAccessoryChange({
    affectedNodeIds,
    affectedSegmentIds: [...affectedSegmentIds],
    draft: params.draft,
    editKind: "accessory_decision",
    network,
    snapshot: params.snapshot,
    technicalState: {
      ...params.draft.technicalState,
      routeAccessoryProposalDecisions: decisions,
    },
  });
}

export function selectCoordinatedInstallationDraftAccessoryCatalogRow(params: {
  catalogCode: string;
  decisionId: string;
  draft: CoordinatedInstallationDraft;
  snapshot: CoordinatedInstallationSnapshot;
}): CoordinatedInstallationDraftResult {
  const contextFailure = validateDraftContext(params.draft, params.snapshot);

  if (contextFailure) {
    return contextFailure;
  }

  const reviewState = reviewCoordinatedInstallationDraftAccessories(params);
  const decision = reviewState.exactSelectionDecisions.find(
    (item) => item.id === params.decisionId,
  );

  if (!decision) {
    return editFailure("La decision del accesorio SIGAS ya no esta pendiente.");
  }

  const result = selectSigasAccessoryExactCatalogRow({
    accessoryId: decision.accessoryId,
    catalogCode: params.catalogCode,
    diameter: decision.diameter,
    network: params.draft.proposalDraftNetwork,
    segmentId: decision.segmentId,
  });

  if (!result.ok) {
    return editFailure(result.message);
  }

  return rebuildDraftAfterAccessoryChange({
    affectedNodeIds: [],
    affectedSegmentIds: [decision.segmentId],
    draft: params.draft,
    editKind: "accessory_catalog_selection",
    network: result.network,
    snapshot: params.snapshot,
    technicalState: params.draft.technicalState,
  });
}

export function acceptCoordinatedInstallationDraft(params: {
  draft: CoordinatedInstallationDraft;
  snapshot: CoordinatedInstallationSnapshot;
  technicalApproval?: CoordinatedInstallationDraftAcceptance;
}):
  | { evaluation: CoordinatedInstallationCandidateEvaluation; ok: true; update: CoordinatedInstallationDraftAtomicUpdate }
  | CoordinatedInstallationDraftFailure {
  const contextFailure = validateDraftContext(params.draft, params.snapshot);

  if (contextFailure) {
    return contextFailure;
  }

  const evaluation = evaluateCoordinatedInstallationCandidate({
    candidateEquipment: params.draft.proposalDraftEquipment,
    candidateNetwork: params.draft.proposalDraftNetwork,
    inheritedWarnings: params.draft.inheritedWarnings,
    snapshot: params.snapshot,
    technicalState: params.draft.technicalState,
  });
  const readiness = createReadiness(evaluation);

  if (readiness.geometricAcceptance === "blocked") {
    return {
      code: "geometry_invalid",
      evaluation,
      message:
        evaluation.invalidities[0]?.message ??
        "La geometria editada no puede aceptarse.",
      ok: false,
    };
  }

  if (evaluation.status === "invalid") {
    return {
      code: "proposal_invalid",
      evaluation,
      message: "La propuesta editada es invalida y no puede aceptarse.",
      ok: false,
    };
  }

  if (evaluation.status === "incomplete") {
    return {
      code: "proposal_incomplete",
      evaluation,
      message:
        evaluation.pendingDecisions[0]?.message ??
        "La propuesta editada conserva definiciones pendientes.",
      ok: false,
    };
  }

  if (
    readiness.technicalApproval === "required" &&
    !technicalApprovalCoversWarnings(
      params.technicalApproval,
      evaluation.fingerprint,
      readiness.requiredTechnicalApprovalWarningKeys,
    )
  ) {
    return {
      code: "technical_approval_required",
      evaluation,
      message:
        "La geometria es aceptable, pero las incertidumbres constructivas 3D requieren aprobacion tecnica explicita.",
      ok: false,
    };
  }

  return {
    evaluation,
    ok: true,
    update: {
      acceptedCandidateFingerprint: evaluation.fingerprint,
      equipment: clone(evaluation.candidateEquipment),
      network: clone(evaluation.candidateNetwork),
      technicalState: clone(params.draft.technicalState),
      warnings: clone(evaluation.warnings),
    },
  };
}

function createDraftState(params: {
  baseFingerprint: string;
  evaluation: CoordinatedInstallationCandidateEvaluation;
  id: string;
  inheritedWarnings: CoordinatedInstallationWarning[];
  lastEdit: CoordinatedInstallationDraftEditImpact | null;
  revision: number;
  sourceProposalId: string;
  technicalState: CoordinatedInstallationDraftTechnicalState;
}): CoordinatedInstallationDraft {
  const draftWithoutIntegrity = {
    baseFingerprint: params.baseFingerprint,
    draftFingerprint: params.evaluation.fingerprint,
    evaluation: clone(params.evaluation),
    id: params.id,
    inheritedWarnings: clone(params.inheritedWarnings),
    lastEdit: params.lastEdit ? clone(params.lastEdit) : null,
    proposalDraftEquipment: clone(params.evaluation.candidateEquipment),
    proposalDraftNetwork: clone(params.evaluation.candidateNetwork),
    readiness: createReadiness(params.evaluation),
    revision: params.revision,
    sourceProposalId: params.sourceProposalId,
    technicalState: clone(params.technicalState),
  };

  return {
    ...draftWithoutIntegrity,
    integrityFingerprint: createDraftIntegrityFingerprint(
      draftWithoutIntegrity,
    ),
  };
}

function validateDraftContext(
  draft: CoordinatedInstallationDraft,
  snapshot: CoordinatedInstallationSnapshot,
): CoordinatedInstallationDraftFailure | null {
  if (
    createCoordinatedInstallationFingerprint(snapshot) !==
    draft.baseFingerprint
  ) {
    return outdatedFailure();
  }

  const currentIntegrity = createDraftIntegrityFingerprint({
    baseFingerprint: draft.baseFingerprint,
    draftFingerprint: draft.draftFingerprint,
    evaluation: draft.evaluation,
    id: draft.id,
    inheritedWarnings: draft.inheritedWarnings,
    lastEdit: draft.lastEdit,
    proposalDraftEquipment: draft.proposalDraftEquipment,
    proposalDraftNetwork: draft.proposalDraftNetwork,
    readiness: draft.readiness,
    revision: draft.revision,
    sourceProposalId: draft.sourceProposalId,
    technicalState: draft.technicalState,
  });

  if (currentIntegrity !== draft.integrityFingerprint) {
    return {
      code: "draft_modified_outside_session",
      message:
        "El borrador fue modificado fuera de las operaciones seguras y debe regenerarse.",
      ok: false,
    };
  }

  const candidateFingerprint =
    createCoordinatedInstallationCandidateFingerprint({
      candidateEquipment: draft.proposalDraftEquipment,
      candidateNetwork: draft.proposalDraftNetwork,
      snapshot,
      technicalState: draft.technicalState,
    });

  if (candidateFingerprint !== draft.draftFingerprint) {
    return {
      code: "draft_modified_outside_session",
      message:
        "La geometria del borrador no coincide con su fingerprint validado.",
      ok: false,
    };
  }

  return null;
}

function createReadiness(
  evaluation: CoordinatedInstallationCandidateEvaluation,
): CoordinatedInstallationDraftReadiness {
  const geometricInvalidities = evaluation.invalidities.filter(
    (invalidity) => invalidity.code !== "invalid_technical_result",
  );
  const requiredTechnicalApprovalWarningKeys = evaluation.warnings
    .filter((warning) => warning.code === "unverified_3d_clearance")
    .map(warningKey)
    .sort();
  const geometricAcceptance =
    geometricInvalidities.length > 0 ? "blocked" : "ready";
  const technicalApproval =
    evaluation.status !== "complete" || geometricAcceptance === "blocked"
      ? "blocked"
      : requiredTechnicalApprovalWarningKeys.length > 0
        ? "required"
        : "not_required";

  return {
    geometricAcceptance,
    requiredTechnicalApprovalWarningKeys,
    technicalApproval,
  };
}

function technicalApprovalCoversWarnings(
  approval: CoordinatedInstallationDraftAcceptance | undefined,
  candidateFingerprint: string,
  requiredWarningKeys: string[],
) {
  if (
    !approval?.approved ||
    approval.candidateFingerprint !== candidateFingerprint
  ) {
    return false;
  }

  const accepted = new Set(approval.warningKeys);
  return requiredWarningKeys.every((key) => accepted.has(key));
}

function createEditImpact(params: {
  afterEquipment: WorkbenchEquipment[];
  afterNetwork: ManualRouteNetwork;
  beforeEquipment: WorkbenchEquipment[];
  beforeNetwork: ManualRouteNetwork;
  editKind: CoordinatedInstallationDraftEdit["kind"];
  evaluation: CoordinatedInstallationCandidateEvaluation;
}): CoordinatedInstallationDraftEditImpact {
  const affectedEquipmentIds = changedIds(
    params.beforeEquipment,
    params.afterEquipment,
  );
  const affectedNodeIds = changedIds(
    params.beforeNetwork.nodes,
    params.afterNetwork.nodes,
  );
  const affectedSegmentIds = new Set(
    changedIds(params.beforeNetwork.segments, params.afterNetwork.segments),
  );

  for (const nodeId of affectedNodeIds) {
    for (const segment of params.afterNetwork.segments) {
      if (segment.fromNodeId === nodeId || segment.toNodeId === nodeId) {
        affectedSegmentIds.add(segment.id);
      }
    }
  }

  for (const equipmentId of affectedEquipmentIds) {
    const nodeIds = params.afterNetwork.nodes
      .filter((node) => node.equipmentId === equipmentId)
      .map((node) => node.id);
    for (const segment of params.afterNetwork.segments) {
      if (
        nodeIds.includes(segment.fromNodeId) ||
        nodeIds.includes(segment.toNodeId)
      ) {
        affectedSegmentIds.add(segment.id);
      }
    }
  }

  const invalidatedDecisionReferenceIds = params.evaluation.pendingDecisions
    .filter((decision) => decision.code.endsWith("_reference_invalid"))
    .flatMap((decision) => decision.referenceIds)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort();

  return {
    affectedEquipmentIds,
    affectedNodeIds,
    affectedSegmentIds: [...affectedSegmentIds].sort(),
    editKind: params.editKind,
    invalidatedDecisionReferenceIds,
  };
}

function draftAccessoryDiameterIndex(
  draft: CoordinatedInstallationDraft,
) {
  const finalDiameters =
    draft.evaluation.technicalResult.transitionAwareNetworkSizing?.status ===
    "resolved"
      ? draft.evaluation.technicalResult.transitionAwareNetworkSizing
          .finalDiameterBySegmentId
      : draft.evaluation.technicalResult.networkSizing?.finalDiameterBySegmentId ??
        {};

  return new Map<string, PipeDiameterReference>(
    Object.entries(finalDiameters),
  );
}

function draftAccessoryTechnicalReview(params: {
  diameterBySegmentId: Map<string, PipeDiameterReference>;
  network: ManualRouteNetwork;
  proposal: AccessoryProposal;
}): AccessoryProposalTechnicalReview {
  const ownerResolution = resolveAccessoryProposalTechnicalOwner({
    diameterBySegmentId: params.diameterBySegmentId,
    network: params.network,
    proposal: params.proposal,
  });
  const hasManualAccessory = routeAccessoryProposalHasManualAccessory({
    network: params.network,
    proposal: params.proposal,
    type: params.proposal.domainAccessory?.type,
  });
  const candidates = getSigasAccessoryCatalogCandidates({
    diameterBySegmentId: params.diameterBySegmentId,
    hasManualAccessory,
    ownerResolution,
    proposal: params.proposal,
  });
  const compatibleCandidates = candidates.filter(
    (candidate) => candidate.status === "compatible",
  );
  const selectedDiameter =
    ownerResolution.status === "unambiguous"
      ? params.diameterBySegmentId.get(ownerResolution.ownerSegmentId) ?? null
      : null;
  const reason = hasManualAccessory
    ? "Ya existe un accesorio manual compatible en un tramo incidente."
    : ownerResolution.status !== "unambiguous"
      ? ownerResolution.reason
      : candidates.length === 0
        ? "No hay candidatos tecnicos compatibles con esta propuesta."
        : compatibleCandidates.length === 0
          ? candidates[0]?.reason ?? null
          : null;

  return {
    candidates,
    incidentSegments: params.proposal.incidentSegmentIds.map((segmentId) => ({
      diameter: params.diameterBySegmentId.get(segmentId) ?? null,
      segmentId,
    })),
    ownerResolution,
    proposalId: params.proposal.id,
    reason,
    selectedDiameter,
    status:
      compatibleCandidates.length > 0 && !hasManualAccessory
        ? "compatible"
        : candidates.some((candidate) => candidate.status === "incompatible")
          ? "incompatible"
          : "requires_more_information",
  };
}

function withEquivalentDraftAccessoryGroups(params: {
  proposals: AccessoryProposal[];
  reviews: AccessoryProposalTechnicalReview[];
}) {
  const proposalById = new Map(
    params.proposals.map((proposal) => [proposal.id, proposal]),
  );
  const groups = new Map<string, AccessoryProposalTechnicalReview[]>();

  for (const review of params.reviews) {
    const proposal = proposalById.get(review.proposalId);
    if (!proposal) {
      continue;
    }

    const candidateKey = review.candidates
      .map(
        (candidate) =>
          `${candidate.familyId}:${candidate.pipeSystem.id}:${candidate.type}:${candidate.status}`,
      )
      .sort()
      .join("|");
    const diameterKey = review.incidentSegments
      .map((item) => item.diameter?.id ?? "pending")
      .sort()
      .join("|");
    const key = [
      proposal.kind,
      proposal.state,
      proposal.evidence.angleClassification,
      proposal.evidence.degree,
      diameterKey,
      candidateKey,
      review.status,
    ].join("::");
    const group = groups.get(key) ?? [];
    group.push(review);
    groups.set(key, group);
  }

  const groupByProposalId = new Map<
    string,
    { nodeIds: string[]; proposalIds: string[] }
  >();
  for (const group of groups.values()) {
    const proposalIds = group
      .map((review) => review.proposalId)
      .sort();
    const nodeIds = proposalIds
      .map((proposalId) => proposalById.get(proposalId)?.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    for (const proposalId of proposalIds) {
      groupByProposalId.set(proposalId, { nodeIds, proposalIds });
    }
  }

  return params.reviews.map((review) => {
    const group = groupByProposalId.get(review.proposalId);
    return group && group.proposalIds.length > 1
      ? {
          ...review,
          equivalentNodeIds: group.nodeIds,
          equivalentProposalIds: group.proposalIds,
        }
      : review;
  });
}

function rebuildDraftAfterAccessoryChange(params: {
  affectedNodeIds: string[];
  affectedSegmentIds: string[];
  draft: CoordinatedInstallationDraft;
  editKind: "accessory_catalog_selection" | "accessory_decision";
  network: ManualRouteNetwork;
  snapshot: CoordinatedInstallationSnapshot;
  technicalState: CoordinatedInstallationDraftTechnicalState;
}): CoordinatedInstallationDraftResult {
  const evaluation = evaluateCoordinatedInstallationCandidate({
    candidateEquipment: params.draft.proposalDraftEquipment,
    candidateNetwork: params.network,
    inheritedWarnings: params.draft.inheritedWarnings,
    snapshot: params.snapshot,
    technicalState: params.technicalState,
  });
  const draft = createDraftState({
    baseFingerprint: params.draft.baseFingerprint,
    evaluation,
    id: params.draft.id,
    inheritedWarnings: params.draft.inheritedWarnings,
    lastEdit: {
      affectedEquipmentIds: [],
      affectedNodeIds: [...new Set(params.affectedNodeIds)].sort(),
      affectedSegmentIds: [...new Set(params.affectedSegmentIds)].sort(),
      editKind: params.editKind,
      invalidatedDecisionReferenceIds: [],
    },
    revision: params.draft.revision + 1,
    sourceProposalId: params.draft.sourceProposalId,
    technicalState: params.technicalState,
  });

  return { draft, ok: true };
}

function technicalStateFromSnapshot(
  snapshot: CoordinatedInstallationSnapshot,
): CoordinatedInstallationDraftTechnicalState {
  return clone({
    adoptedDiameterDecisions: snapshot.adoptedDiameterDecisions ?? [],
    diameterTransitionDecisions: snapshot.diameterTransitionDecisions ?? [],
    pipeContextBySegmentId: snapshot.pipeContextBySegmentId ?? {},
    routeAccessoryProposalDecisions:
      snapshot.routeAccessoryProposalDecisions ?? [],
  });
}

function changedIds<T extends { id: string }>(before: T[], after: T[]) {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  return [...new Set([...beforeById.keys(), ...afterById.keys()])]
    .filter(
      (id) =>
        stableSerialize(beforeById.get(id)) !==
        stableSerialize(afterById.get(id)),
    )
    .sort();
}

function warningKey(warning: CoordinatedInstallationWarning) {
  return `${warning.code}:${warning.message}:${warning.referenceIds.join("|")}`;
}

function outdatedFailure(): CoordinatedInstallationDraftFailure {
  return {
    code: "proposal_outdated",
    message:
      "La instalacion confirmada cambio desde la generacion del borrador. Regenerala antes de continuar.",
    ok: false,
  };
}

function editFailure(message: string): CoordinatedInstallationDraftFailure {
  return { code: "edit_rejected", message, ok: false };
}

function createDraftIntegrityFingerprint(
  draft: Omit<CoordinatedInstallationDraft, "integrityFingerprint">,
) {
  const signature = stableSerialize(draft);
  return `installation-draft:${stableHash(signature)}:${signature.length}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
