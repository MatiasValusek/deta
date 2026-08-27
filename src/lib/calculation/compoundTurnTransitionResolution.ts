import type {
  AccessoryCatalogCandidate,
} from "@/lib/calculation/accessoryCatalogCandidates";
import type {
  PipeDiameterReference,
  PipeDiameterTransitionEquivalentLengthResult,
  PipeSystem,
  PipeSystemResolution,
  PipeSystemResolutionStatus,
} from "@/lib/calculation/pipeSystem";
import type {
  DiameterTransitionProposal,
} from "@/lib/calculation/diameterTransitionProposals";
import type {
  ManualRouteNetwork,
  RouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";

export type CompoundTurnTransitionContributionRole =
  | "diameter_change"
  | "turn";

export type CompoundTurnTransitionContributionSource =
  | "confirmed_elbow"
  | "confirmed_reduction"
  | "single_piece_candidate"
  | "unconfirmed";

export type CompoundTurnTransitionPreviewStatus =
  | PipeSystemResolutionStatus
  | "needs_review";

export type CompoundTurnTransitionSolutionKind =
  | "composition"
  | "single_piece"
  | "unresolved"
  | "unsupported";

export type CompoundTurnTransitionConfirmationState =
  | "confirmed"
  | "needs_compatible_decisions"
  | "needs_elbow_confirmation"
  | "needs_reduction_confirmation"
  | "unsupported";

export type CompoundTurnTransitionContribution = {
  catalogCode?: string;
  catalogFamilyId?: string;
  equivalentLengthMeters: number | null;
  label: string;
  quantity?: number;
  reason?: string;
  role: CompoundTurnTransitionContributionRole;
  segmentId?: string;
  source: CompoundTurnTransitionContributionSource;
  status: CompoundTurnTransitionPreviewStatus;
  variantLabel?: string;
};

export type CompoundTurnTransitionPreview = {
  confirmationState: CompoundTurnTransitionConfirmationState;
  contributions: CompoundTurnTransitionContribution[];
  directCandidates: AccessoryCatalogCandidate[];
  label: string;
  reason: string | null;
  solutionKind: CompoundTurnTransitionSolutionKind;
  solutionLabel: string;
  status: CompoundTurnTransitionPreviewStatus;
  totalEquivalentLengthMeters: number | null;
  transitionId: string;
};

export type CompoundTurnTransitionDiameterBySegmentId =
  | Map<string, PipeDiameterReference | null | undefined>
  | Record<string, PipeDiameterReference | null | undefined>;

type ConfirmedElbow = {
  accessory: RouteSegmentAccessory;
  segment: RouteSegment;
};

export function resolveCompoundTurnTransitionPreview(params: {
  diameterBySegmentId?: CompoundTurnTransitionDiameterBySegmentId;
  directCandidates?: AccessoryCatalogCandidate[];
  network: ManualRouteNetwork;
  pipeSystem: PipeSystem;
  proposal: DiameterTransitionProposal;
}): CompoundTurnTransitionPreview {
  const directCandidates = [...(params.directCandidates ?? [])].sort(
    (first, second) => first.id.localeCompare(second.id),
  );
  const label = formatCompoundTurnTransitionLabel(params.proposal);
  const base = {
    directCandidates,
    label,
    transitionId: params.proposal.id,
  };

  if (params.proposal.kind !== "compound_turn_transition") {
    return {
      ...base,
      confirmationState: "unsupported",
      contributions: [],
      reason: "La propuesta no es un giro con cambio de diametro.",
      solutionKind: "unsupported",
      solutionLabel: "No aplica",
      status: "unsupported",
      totalEquivalentLengthMeters: null,
    };
  }

  if (directCandidates.length === 1) {
    const candidate = directCandidates[0] as AccessoryCatalogCandidate;

    return {
      ...base,
      confirmationState:
        candidate.status === "compatible"
          ? "needs_compatible_decisions"
          : "unsupported",
      contributions: [
        {
          catalogFamilyId: candidate.familyId,
          equivalentLengthMeters: null,
          label: "Pieza unica SIGAS",
          reason: candidate.reason,
          role: "turn",
          source: "single_piece_candidate",
          status:
            candidate.status === "compatible" ? "needs_review" : "unsupported",
          variantLabel: candidate.label,
        },
      ],
      reason:
        candidate.status === "compatible"
          ? "Tabla No 3 contiene una pieza directa; requiere confirmacion profesional antes de computarla."
          : candidate.reason,
      solutionKind: "single_piece",
      solutionLabel: "Pieza unica SIGAS",
      status:
        candidate.status === "compatible" ? "needs_review" : "unsupported",
      totalEquivalentLengthMeters: null,
    };
  }

  if (directCandidates.length > 1) {
    return {
      ...base,
      confirmationState: "needs_compatible_decisions",
      contributions: [],
      reason:
        "Tabla No 3 contiene mas de una pieza directa posible para el giro con cambio de diametro.",
      solutionKind: "single_piece",
      solutionLabel: "Varias piezas SIGAS posibles",
      status: "needs_review",
      totalEquivalentLengthMeters: null,
    };
  }

  const contributions = [
    resolveTurnContribution(params),
    resolveDiameterChangeContribution(params),
  ];
  const totalEquivalentLengthMeters = allContributionsResolved(contributions)
    ? contributions.reduce(
        (sum, contribution) =>
          sum + (contribution.equivalentLengthMeters ?? 0),
        0,
      )
    : null;
  const status =
    totalEquivalentLengthMeters !== null
      ? "resolved"
      : contributions.some((contribution) => contribution.status === "unsupported")
        ? "unsupported"
        : "needs_review";
  const confirmationState = resolveConfirmationState(contributions);

  return {
    ...base,
    confirmationState,
    contributions,
    reason:
      status === "resolved"
        ? null
        : contributions
            .map((contribution) => contribution.reason)
            .filter((reason): reason is string => Boolean(reason))[0] ?? null,
    solutionKind: "composition",
    solutionLabel: "Composicion: codo confirmado + reduccion confirmada",
    status,
    totalEquivalentLengthMeters,
  };
}

export function formatCompoundTurnTransitionLabel(
  proposal: DiameterTransitionProposal,
) {
  return `${formatTurnLabel(proposal)} + ${formatDiameterChangeLabel(proposal)}`;
}

function resolveTurnContribution(params: {
  diameterBySegmentId?: CompoundTurnTransitionDiameterBySegmentId;
  network: ManualRouteNetwork;
  pipeSystem: PipeSystem;
  proposal: DiameterTransitionProposal;
}): CompoundTurnTransitionContribution {
  const elbows = findConfirmedElbowsAtTransition(params);

  if (elbows.all.length > 0 && elbows.sigas.length === 0) {
    return {
      equivalentLengthMeters: null,
      label: "Giro",
      reason:
        "Existe un codo en el nodo, pero no esta confirmado contra Tabla No 3 SIGAS.",
      role: "turn",
      source: "unconfirmed",
      status: "unsupported",
    };
  }

  if (elbows.sigas.length === 0) {
    return {
      equivalentLengthMeters: null,
      label: "Giro",
      reason:
        "Falta confirmar el codo del giro como accesorio SIGAS antes de componer.",
      role: "turn",
      source: "unconfirmed",
      status: "needs_review",
    };
  }

  if (elbows.sigas.length > 1) {
    return {
      equivalentLengthMeters: null,
      label: "Giro",
      reason:
        "Hay mas de un codo SIGAS confirmado en los tramos incidentes del nodo.",
      role: "turn",
      source: "confirmed_elbow",
      status: "needs_review",
    };
  }

  const [confirmedElbow] = elbows.sigas;

  if (!confirmedElbow) {
    return {
      equivalentLengthMeters: null,
      label: "Giro",
      reason: "No se pudo identificar el codo confirmado.",
      role: "turn",
      source: "unconfirmed",
      status: "unresolved",
    };
  }

  const diameter =
    resolveDiameter(params.diameterBySegmentId, confirmedElbow.segment.id) ??
    segmentDiameter(params.proposal, confirmedElbow.segment.id);

  if (!diameter) {
    return {
      catalogCode: confirmedElbow.accessory.catalogCode,
      catalogFamilyId: confirmedElbow.accessory.catalogFamilyId,
      equivalentLengthMeters: null,
      label: "Giro",
      reason:
        "Falta diametro actual del tramo que contiene el codo confirmado.",
      role: "turn",
      segmentId: confirmedElbow.segment.id,
      source: "confirmed_elbow",
      status: "unresolved",
    };
  }

  const resolution = params.pipeSystem.resolveAccessoryEquivalentLength({
    accessory: {
      catalogCode: confirmedElbow.accessory.catalogCode,
      catalogFamilyId: confirmedElbow.accessory.catalogFamilyId,
      id: confirmedElbow.accessory.id,
      quantity: confirmedElbow.accessory.quantity,
      type: confirmedElbow.accessory.type,
    },
    pipe: { diameter },
    segment: {
      accumulatedFlow: null,
      accumulatedFlowUnit: null,
      drawingLength: 0,
      id: confirmedElbow.segment.id,
      physicalLengthMeters: null,
    },
  });

  if (resolution.status !== "resolved") {
    return {
      catalogCode: confirmedElbow.accessory.catalogCode,
      catalogFamilyId: confirmedElbow.accessory.catalogFamilyId,
      equivalentLengthMeters: null,
      label: "Giro",
      reason: resolution.reason,
      role: "turn",
      segmentId: confirmedElbow.segment.id,
      source: "confirmed_elbow",
      status: resolution.status,
    };
  }

  const quantity = normalizeQuantity(confirmedElbow.accessory.quantity);

  return {
    catalogCode: confirmedElbow.accessory.catalogCode,
    catalogFamilyId: confirmedElbow.accessory.catalogFamilyId,
    equivalentLengthMeters: resolution.value * quantity,
    label: "Giro",
    quantity,
    role: "turn",
    segmentId: confirmedElbow.segment.id,
    source: "confirmed_elbow",
    status: "resolved",
    variantLabel:
      recordStringValue(resolution.data, "tableLabel") ??
      confirmedElbow.accessory.catalogFamilyId ??
      confirmedElbow.accessory.catalogCode,
  };
}

function resolveDiameterChangeContribution(params: {
  diameterBySegmentId?: CompoundTurnTransitionDiameterBySegmentId;
  pipeSystem: PipeSystem;
  proposal: DiameterTransitionProposal;
}): CompoundTurnTransitionContribution {
  const upstreamSegmentId = params.proposal.upstreamSegmentId;
  const downstreamSegmentId = params.proposal.downstreamSegmentIds[0] ?? null;
  const upstreamDiameter =
    resolveDiameter(params.diameterBySegmentId, upstreamSegmentId) ??
    params.proposal.upstreamDiameter?.diameter ??
    null;
  const downstreamDiameter =
    resolveDiameter(params.diameterBySegmentId, downstreamSegmentId) ??
    segmentDiameter(params.proposal, downstreamSegmentId);
  const decision = params.proposal.decision;

  if (decision?.status === "rejected") {
    return {
      equivalentLengthMeters: null,
      label: "Cambio de diametro",
      reason:
        "La reduccion fue rechazada pero el cambio de diametro sigue requerido.",
      role: "diameter_change",
      source: "unconfirmed",
      status: "needs_review",
    };
  }

  if (decision?.status !== "confirmed" || !decision.catalogFamilyId) {
    return {
      equivalentLengthMeters: null,
      label: "Cambio de diametro",
      reason:
        "Falta confirmar una familia SIGAS de reduccion para el cambio de diametro.",
      role: "diameter_change",
      source: "unconfirmed",
      status: "needs_review",
    };
  }

  if (!upstreamDiameter || !downstreamDiameter) {
    return {
      catalogFamilyId: decision.catalogFamilyId,
      equivalentLengthMeters: null,
      label: "Cambio de diametro",
      reason:
        "Faltan diametros actuales para resolver la reduccion confirmada.",
      role: "diameter_change",
      source: "confirmed_reduction",
      status: "unresolved",
    };
  }

  const resolution = params.pipeSystem.resolveDiameterTransitionEquivalentLength({
    downstreamDiameter,
    junction: {
      downstreamSegmentId,
      geometryKey: params.proposal.geometryKey,
      upstreamSegmentId,
    },
    transition: {
      catalogFamilyId: decision.catalogFamilyId,
      id: params.proposal.id,
      kind: params.proposal.kind,
      nodeId: params.proposal.nodeId,
    },
    upstreamDiameter,
  });

  return diameterChangeContributionFromResolution({
    catalogFamilyId: decision.catalogFamilyId,
    resolution,
  });
}

function diameterChangeContributionFromResolution(params: {
  catalogFamilyId: string;
  resolution: PipeSystemResolution<PipeDiameterTransitionEquivalentLengthResult>;
}): CompoundTurnTransitionContribution {
  if (params.resolution.status !== "resolved") {
    return {
      catalogFamilyId: params.catalogFamilyId,
      equivalentLengthMeters: null,
      label: "Cambio de diametro",
      reason: params.resolution.reason,
      role: "diameter_change",
      source: "confirmed_reduction",
      status: params.resolution.status,
    };
  }

  return {
    catalogCode: params.resolution.value.catalogCode,
    catalogFamilyId: params.resolution.value.catalogFamilyId,
    equivalentLengthMeters: params.resolution.value.equivalentLengthMeters,
    label: "Cambio de diametro",
    role: "diameter_change",
    source: "confirmed_reduction",
    status: "resolved",
    variantLabel: params.resolution.value.variant.label,
  };
}

function findConfirmedElbowsAtTransition(params: {
  network: ManualRouteNetwork;
  proposal: DiameterTransitionProposal;
}) {
  const incidentSegmentIds = new Set(
    params.proposal.incidentSegments.map((segment) => segment.segmentId),
  );
  const all = params.network.segments
    .filter((segment) => incidentSegmentIds.has(segment.id))
    .flatMap((segment) =>
      (segment.accessories ?? [])
        .filter((accessory) => accessory.type === "elbow")
        .map((accessory) => ({ accessory, segment })),
    )
    .sort(compareConfirmedElbows);
  const sigas = all.filter(
    ({ accessory }) =>
      accessory.equivalentLengthSource === "pipe_system" &&
      Boolean(accessory.catalogFamilyId ?? accessory.catalogCode),
  );

  return { all, sigas };
}

function compareConfirmedElbows(first: ConfirmedElbow, second: ConfirmedElbow) {
  return (
    first.segment.id.localeCompare(second.segment.id) ||
    first.accessory.id.localeCompare(second.accessory.id)
  );
}

function allContributionsResolved(
  contributions: CompoundTurnTransitionContribution[],
) {
  return contributions.every(
    (contribution) =>
      contribution.status === "resolved" &&
      contribution.equivalentLengthMeters !== null,
  );
}

function resolveConfirmationState(
  contributions: CompoundTurnTransitionContribution[],
): CompoundTurnTransitionConfirmationState {
  if (contributions.some((contribution) => contribution.status === "unsupported")) {
    return "unsupported";
  }

  const turn = contributions.find((contribution) => contribution.role === "turn");
  const diameterChange = contributions.find(
    (contribution) => contribution.role === "diameter_change",
  );
  const turnConfirmed = turn?.status === "resolved";
  const reductionConfirmed = diameterChange?.status === "resolved";

  if (turnConfirmed && reductionConfirmed) {
    return "confirmed";
  }

  if (!turnConfirmed && !reductionConfirmed) {
    return "needs_compatible_decisions";
  }

  if (!turnConfirmed) {
    return "needs_elbow_confirmation";
  }

  return "needs_reduction_confirmation";
}

function formatTurnLabel(proposal: DiameterTransitionProposal) {
  const angle = proposal.evidence.angleDegrees;
  const turnAngle =
    angle === undefined ? null : Math.min(angle, Math.abs(180 - angle));

  return `Giro ${
    turnAngle === null ? "pendiente" : formatNumber(turnAngle)
  }\u00b0`;
}

function formatDiameterChangeLabel(proposal: DiameterTransitionProposal) {
  const upstream = proposal.upstreamDiameter?.diameter ?? null;
  const downstream = proposal.downstreamDiameters[0]?.diameter ?? null;

  return `${formatCompactDiameter(upstream)} \u2192 ${formatCompactDiameter(
    downstream,
  )}`;
}

function formatCompactDiameter(diameter: PipeDiameterReference | null) {
  const external = diameter?.externalDiameterMillimeters;

  return external !== undefined && Number.isFinite(external)
    ? `\u00d8${formatNumber(external)}`
    : "\u00d8?";
}

function formatNumber(value: number) {
  return Number(value.toFixed(3)).toLocaleString("es-AR", {
    maximumFractionDigits: 3,
  });
}

function segmentDiameter(
  proposal: DiameterTransitionProposal,
  segmentId: string | null,
) {
  if (!segmentId) {
    return null;
  }

  return (
    proposal.incidentSegments.find((segment) => segment.segmentId === segmentId)
      ?.diameter ?? null
  );
}

function resolveDiameter(
  diameterBySegmentId:
    | CompoundTurnTransitionDiameterBySegmentId
    | undefined,
  segmentId: string | null,
) {
  if (!diameterBySegmentId || !segmentId) {
    return null;
  }

  return diameterBySegmentId instanceof Map
    ? diameterBySegmentId.get(segmentId) ?? null
    : diameterBySegmentId[segmentId] ?? null;
}

function normalizeQuantity(quantity: number) {
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function recordStringValue(
  data: Record<string, unknown> | undefined,
  key: string,
) {
  const value = data?.[key];

  return typeof value === "string" ? value : null;
}
