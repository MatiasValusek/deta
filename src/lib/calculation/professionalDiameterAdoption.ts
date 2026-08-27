import {
  type PipeDiameterReference,
  type PipeSegmentPipeContext,
  type PipeSystem,
  type PipeSystemIdentity,
  type PipeSystemResolutionStatus,
} from "@/lib/calculation/pipeSystem";
import {
  evaluateTransitionAwareSizingAssignment,
  type TechnicalTransitionAwareAssignmentEvaluation,
  type TechnicalTransitionAwareNetworkSizingIssue,
  type TechnicalTransitionAwareNetworkSizingIssueCode,
  type TechnicalTransitionAwareNetworkSizingResult,
  type TechnicalTransitionAwareNetworkSizingSegmentResult,
} from "@/lib/calculation/technicalNetworkSizingWithTransitions";
import type { DiameterTransitionDecision } from "@/lib/calculation/diameterTransitionProposals";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteSegment,
} from "@/lib/routing/types";
import type {
  TechnicalRoute,
  TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";

export type AdoptedDiameterDecisionOrigin = "user_adopted";

export type AdoptedDiameterDecision = {
  decidedAt: number;
  diameterId: string;
  origin?: AdoptedDiameterDecisionOrigin;
  segmentId: string;
};

export type ProfessionalDiameterAdoptionStatus =
  | "incompatible"
  | "pending_validation"
  | "unresolved"
  | "validated";

export type ProfessionalDiameterAdoptionSegmentStatus =
  | "incompatible"
  | "pending_validation"
  | "unresolved"
  | "using_calculated"
  | "validated";

export type ProfessionalDiameterAdoptionIssueCode =
  | "adopted_diameter_below_calculated"
  | "adopted_diameter_not_in_catalog"
  | "available_diameters_unresolved"
  | "calculated_sizing_unresolved"
  | "effective_sizing_unresolved"
  | "missing_calculated_diameter";

export type ProfessionalDiameterAdoptionIssue = {
  code: ProfessionalDiameterAdoptionIssueCode;
  data?: Record<string, unknown>;
  message: string;
  segmentId?: string;
  severity: "error" | "warning";
  status?: Exclude<PipeSystemResolutionStatus, "resolved">;
};

export type ProfessionalDiameterAdoptionSegmentResult = {
  adoptedDiameter: PipeDiameterReference | null;
  availableDiameters: PipeDiameterReference[];
  calculatedDiameter: PipeDiameterReference | null;
  decision: AdoptedDiameterDecision | null;
  effectiveDiameter: PipeDiameterReference | null;
  issues: ProfessionalDiameterAdoptionIssue[];
  reason: string | null;
  segmentId: string;
  status: ProfessionalDiameterAdoptionSegmentStatus;
  validationIssues: TechnicalTransitionAwareNetworkSizingIssue[];
  validationSegment: TechnicalTransitionAwareNetworkSizingSegmentResult | null;
};

export type ProfessionalDiameterAdoptionResult = {
  decisions: AdoptedDiameterDecision[];
  effectiveDiameterBySegmentId: Record<string, PipeDiameterReference>;
  evaluation: TechnicalTransitionAwareAssignmentEvaluation | null;
  issueCount: number;
  issues: ProfessionalDiameterAdoptionIssue[];
  pipeSystem: PipeSystemIdentity;
  routeAccessoryResolutions: TechnicalTransitionAwareAssignmentEvaluation["routeAccessoryResolutions"];
  routeTransitionResolutions: TechnicalTransitionAwareAssignmentEvaluation["routeTransitionResolutions"];
  segments: ProfessionalDiameterAdoptionSegmentResult[];
  status: ProfessionalDiameterAdoptionStatus;
  transitions: TechnicalTransitionAwareAssignmentEvaluation["transitions"];
};

type DiameterCatalog = {
  byId: Map<string, { diameter: PipeDiameterReference; index: number }>;
  diameters: PipeDiameterReference[];
};

export function validateProfessionalDiameterAdoption(params: {
  calculatedSizing: TechnicalTransitionAwareNetworkSizingResult | null;
  decisions?: AdoptedDiameterDecision[];
  diameterTransitionDecisions?: DiameterTransitionDecision[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
  pipeSystem: PipeSystem;
  routeSegments: RouteSegment[];
  routes: TechnicalRoute[];
  segments: TechnicalSegmentResult[];
}): ProfessionalDiameterAdoptionResult {
  const decisions = normalizeAdoptedDiameterDecisions(params.decisions ?? []);
  const sortedSegments = sortTechnicalSegments(params.segments);
  const availableDiametersResolution = params.pipeSystem.getAvailableDiameters();

  if (availableDiametersResolution.status !== "resolved") {
    const issue: ProfessionalDiameterAdoptionIssue = {
      code: "available_diameters_unresolved",
      data: availableDiametersResolution.data,
      message: availableDiametersResolution.reason,
      severity: "error",
      status: availableDiametersResolution.status,
    };

    return createUnevaluatedResult({
      decisions,
      issue,
      pipeSystem: params.pipeSystem.identity,
      sortedSegments,
      status:
        availableDiametersResolution.status === "unsupported"
          ? "incompatible"
          : "unresolved",
    });
  }

  const catalogResolution = createDiameterCatalog(
    availableDiametersResolution.value,
  );

  if (catalogResolution.status !== "resolved") {
    return createUnevaluatedResult({
      decisions,
      issue: catalogResolution.issue,
      pipeSystem: params.pipeSystem.identity,
      sortedSegments,
      status:
        catalogResolution.issue.status === "unsupported"
          ? "incompatible"
          : "unresolved",
    });
  }

  if (!params.calculatedSizing || params.calculatedSizing.status !== "resolved") {
    const issue: ProfessionalDiameterAdoptionIssue = {
      code: "calculated_sizing_unresolved",
      data: { calculatedStatus: params.calculatedSizing?.status ?? null },
      message:
        "Falta dimensionado minimo resuelto para validar diametros adoptados.",
      severity: "error",
      status: "unresolved",
    };

    return createUnevaluatedResult({
      catalog: catalogResolution.catalog,
      decisions,
      issue,
      pipeSystem: params.pipeSystem.identity,
      sortedSegments,
      status: "unresolved",
    });
  }

  const catalog = catalogResolution.catalog;
  const calculatedDiameterBySegmentId =
    params.calculatedSizing.finalDiameterBySegmentId;
  const decisionBySegmentId = new Map(
    decisions.map((decision) => [decision.segmentId, decision]),
  );
  const effectiveDiameterBySegmentId: Record<string, PipeDiameterReference> = {};
  const preEvaluationSegments = sortedSegments.map((segment) =>
    createPreEvaluationSegment({
      calculatedDiameter:
        calculatedDiameterBySegmentId[segment.segmentId] ?? null,
      catalog,
      decision: decisionBySegmentId.get(segment.segmentId) ?? null,
      segmentId: segment.segmentId,
    }),
  );
  const preEvaluationIssues = preEvaluationSegments.flatMap(
    (segment) => segment.issues,
  );

  for (const segment of preEvaluationSegments) {
    if (segment.effectiveDiameter) {
      effectiveDiameterBySegmentId[segment.segmentId] = segment.effectiveDiameter;
    }
  }

  if (preEvaluationIssues.length > 0) {
    return {
      decisions,
      effectiveDiameterBySegmentId,
      evaluation: null,
      issueCount: preEvaluationIssues.length,
      issues: preEvaluationIssues,
      pipeSystem: params.pipeSystem.identity,
      routeAccessoryResolutions: {},
      routeTransitionResolutions: {},
      segments: preEvaluationSegments,
      status: resolveAdoptionStatus(preEvaluationSegments),
      transitions: [],
    };
  }

  const evaluation = evaluateTransitionAwareSizingAssignment({
    baselineDiameterBySegmentId: calculatedDiameterBySegmentId,
    decisions: params.diameterTransitionDecisions ?? [],
    diameterBySegmentId: effectiveDiameterBySegmentId,
    equipment: params.equipment,
    network: params.network,
    pipeContextBySegmentId: params.pipeContextBySegmentId,
    pipeSystem: params.pipeSystem,
    routeSegments: params.routeSegments,
    routes: params.routes,
    segments: params.segments,
  });
  const evaluationSegmentById = new Map(
    evaluation.segments.map((segment) => [segment.segmentId, segment]),
  );
  const evaluatedSegments = preEvaluationSegments.map((segment) =>
    applyEvaluationToSegment({
      evaluationSegment:
        evaluationSegmentById.get(segment.segmentId) ?? null,
      segment,
    }),
  );
  const evaluationIssues = evaluation.issues.map((issue) =>
    technicalIssueToAdoptionIssue(issue),
  );
  const issues = dedupeIssues([
    ...preEvaluationIssues,
    ...evaluationIssues,
  ]);

  return {
    decisions,
    effectiveDiameterBySegmentId,
    evaluation,
    issueCount: issues.length,
    issues,
    pipeSystem: params.pipeSystem.identity,
    routeAccessoryResolutions: evaluation.routeAccessoryResolutions,
    routeTransitionResolutions: evaluation.routeTransitionResolutions,
    segments: evaluatedSegments,
    status: resolveAdoptionStatus(evaluatedSegments),
    transitions: evaluation.transitions,
  };
}

export function upsertAdoptedDiameterDecision(
  decisions: AdoptedDiameterDecision[],
  decision: AdoptedDiameterDecision,
) {
  return normalizeAdoptedDiameterDecisions([
    ...decisions.filter((item) => item.segmentId !== decision.segmentId),
    decision,
  ]);
}

export function removeAdoptedDiameterDecision(
  decisions: AdoptedDiameterDecision[],
  segmentId: string,
) {
  return normalizeAdoptedDiameterDecisions(
    decisions.filter((decision) => decision.segmentId !== segmentId),
  );
}

export function normalizeAdoptedDiameterDecisions(
  decisions: AdoptedDiameterDecision[],
) {
  const bySegmentId = new Map<string, AdoptedDiameterDecision>();

  for (const decision of decisions) {
    bySegmentId.set(decision.segmentId, {
      decidedAt: decision.decidedAt,
      diameterId: decision.diameterId,
      origin: decision.origin ?? "user_adopted",
      segmentId: decision.segmentId,
    });
  }

  return [...bySegmentId.values()].sort((first, second) =>
    first.segmentId.localeCompare(second.segmentId),
  );
}

export function segmentAdoptionIsValidated(
  segment: ProfessionalDiameterAdoptionSegmentResult | null | undefined,
) {
  return (
    segment?.status === "using_calculated" || segment?.status === "validated"
  );
}

function createPreEvaluationSegment(params: {
  calculatedDiameter: PipeDiameterReference | null;
  catalog: DiameterCatalog;
  decision: AdoptedDiameterDecision | null;
  segmentId: string;
}): ProfessionalDiameterAdoptionSegmentResult {
  const calculatedIndex = params.calculatedDiameter
    ? params.catalog.byId.get(params.calculatedDiameter.id)?.index
    : undefined;
  const adoptedDiameter = params.decision
    ? params.catalog.byId.get(params.decision.diameterId)?.diameter ?? null
    : null;
  const adoptedIndex = adoptedDiameter
    ? params.catalog.byId.get(adoptedDiameter.id)?.index
    : undefined;
  const availableDiameters =
    calculatedIndex === undefined
      ? []
      : params.catalog.diameters.slice(calculatedIndex);
  const issues: ProfessionalDiameterAdoptionIssue[] = [];

  if (!params.calculatedDiameter || calculatedIndex === undefined) {
    issues.push({
      code: "missing_calculated_diameter",
      data: { segmentId: params.segmentId },
      message: "Falta diametro minimo calculado para el tramo.",
      segmentId: params.segmentId,
      severity: "error",
      status: "unresolved",
    });
  }

  if (params.decision && !adoptedDiameter) {
    issues.push({
      code: "adopted_diameter_not_in_catalog",
      data: {
        adoptedDiameterId: params.decision.diameterId,
        segmentId: params.segmentId,
      },
      message: "El diametro adoptado no pertenece al catalogo disponible.",
      segmentId: params.segmentId,
      severity: "error",
      status: "unsupported",
    });
  }

  if (
    params.decision &&
    adoptedDiameter &&
    adoptedIndex !== undefined &&
    calculatedIndex !== undefined &&
    adoptedIndex < calculatedIndex
  ) {
    issues.push({
      code: "adopted_diameter_below_calculated",
      data: {
        adoptedDiameterId: adoptedDiameter.id,
        calculatedDiameterId: params.calculatedDiameter?.id ?? null,
      },
      message:
        "El diametro adoptado es menor al minimo calculado por Deta.",
      segmentId: params.segmentId,
      severity: "error",
      status: "unsupported",
    });
  }

  const status =
    issues.length === 0
      ? params.decision
        ? "validated"
        : "using_calculated"
      : issues.some((issue) => issue.status === "unsupported")
        ? "incompatible"
        : "unresolved";
  const effectiveDiameter =
    status === "validated" || status === "using_calculated"
      ? adoptedDiameter ?? params.calculatedDiameter
      : params.calculatedDiameter;

  return {
    adoptedDiameter,
    availableDiameters,
    calculatedDiameter: params.calculatedDiameter,
    decision: params.decision,
    effectiveDiameter,
    issues,
    reason: issues[0]?.message ?? null,
    segmentId: params.segmentId,
    status,
    validationIssues: [],
    validationSegment: null,
  };
}

function applyEvaluationToSegment(params: {
  evaluationSegment: TechnicalTransitionAwareNetworkSizingSegmentResult | null;
  segment: ProfessionalDiameterAdoptionSegmentResult;
}): ProfessionalDiameterAdoptionSegmentResult {
  const evaluationIssue = params.evaluationSegment?.issues[0] ?? null;
  const validationIssues = params.evaluationSegment?.issues ?? [];

  if (
    params.segment.issues.length > 0 ||
    !params.evaluationSegment ||
    evaluationIssue
  ) {
    const status = resolveSegmentEvaluationStatus({
      baseStatus: params.segment.status,
      hasDecision: Boolean(params.segment.decision),
      issue: evaluationIssue,
      validationSegment: params.evaluationSegment,
    });
    const reason =
      params.segment.reason ??
      evaluationIssue?.message ??
      (params.evaluationSegment
        ? null
        : "No se encontro evaluacion tecnica del tramo.");

    return {
      ...params.segment,
      reason,
      status,
      validationIssues,
      validationSegment: params.evaluationSegment,
    };
  }

  return {
    ...params.segment,
    reason: null,
    status: params.segment.decision ? "validated" : "using_calculated",
    validationIssues,
    validationSegment: params.evaluationSegment,
  };
}

function resolveSegmentEvaluationStatus(params: {
  baseStatus: ProfessionalDiameterAdoptionSegmentStatus;
  hasDecision: boolean;
  issue: TechnicalTransitionAwareNetworkSizingIssue | null;
  validationSegment: TechnicalTransitionAwareNetworkSizingSegmentResult | null;
}): ProfessionalDiameterAdoptionSegmentStatus {
  if (
    params.baseStatus === "incompatible" ||
    params.issue?.status === "unsupported" ||
    (params.validationSegment &&
      params.validationSegment.status === "unsupported") ||
    params.issue?.code === "candidate_diameter_below_required"
  ) {
    return "incompatible";
  }

  if (params.issue && technicalIssueIsPendingValidation(params.issue)) {
    return "pending_validation";
  }

  if (!params.validationSegment || params.validationSegment.status !== "resolved") {
    return "unresolved";
  }

  return params.hasDecision ? "validated" : "using_calculated";
}

function technicalIssueToAdoptionIssue(
  issue: TechnicalTransitionAwareNetworkSizingIssue,
): ProfessionalDiameterAdoptionIssue {
  return {
    code: "effective_sizing_unresolved",
    data: {
      technicalCode: issue.code,
      transitionId: issue.transitionId,
    },
    message: issue.message,
    segmentId: issue.segmentId,
    severity: issue.severity,
    status: issue.status,
  };
}

function technicalIssueIsPendingValidation(
  issue: TechnicalTransitionAwareNetworkSizingIssue,
) {
  const pendingCodes: TechnicalTransitionAwareNetworkSizingIssueCode[] = [
    "branch_transition_required",
    "compound_transition_required",
    "route_transitions_unresolved",
    "unconfirmed_required_transition",
  ];

  return (
    issue.status !== "unsupported" &&
    pendingCodes.includes(issue.code)
  );
}

function resolveAdoptionStatus(
  segments: ProfessionalDiameterAdoptionSegmentResult[],
): ProfessionalDiameterAdoptionStatus {
  if (segments.some((segment) => segment.status === "incompatible")) {
    return "incompatible";
  }

  if (segments.some((segment) => segment.status === "pending_validation")) {
    return "pending_validation";
  }

  if (segments.some((segment) => segment.status === "unresolved")) {
    return "unresolved";
  }

  return "validated";
}

function createUnevaluatedResult(params: {
  catalog?: DiameterCatalog;
  decisions: AdoptedDiameterDecision[];
  issue: ProfessionalDiameterAdoptionIssue;
  pipeSystem: PipeSystemIdentity;
  sortedSegments: TechnicalSegmentResult[];
  status: ProfessionalDiameterAdoptionStatus;
}): ProfessionalDiameterAdoptionResult {
  return {
    decisions: params.decisions,
    effectiveDiameterBySegmentId: {},
    evaluation: null,
    issueCount: 1,
    issues: [params.issue],
    pipeSystem: params.pipeSystem,
    routeAccessoryResolutions: {},
    routeTransitionResolutions: {},
    segments: params.sortedSegments.map((segment) => ({
      adoptedDiameter: null,
      availableDiameters: params.catalog?.diameters ?? [],
      calculatedDiameter: null,
      decision:
        params.decisions.find(
          (decision) => decision.segmentId === segment.segmentId,
        ) ?? null,
      effectiveDiameter: null,
      issues: [{ ...params.issue, segmentId: segment.segmentId }],
      reason: params.issue.message,
      segmentId: segment.segmentId,
      status: params.status === "incompatible" ? "incompatible" : "unresolved",
      validationIssues: [],
      validationSegment: null,
    })),
    status: params.status,
    transitions: [],
  };
}

function createDiameterCatalog(
  diameters: PipeDiameterReference[],
):
  | { catalog: DiameterCatalog; status: "resolved" }
  | {
      issue: ProfessionalDiameterAdoptionIssue;
      status: Exclude<PipeSystemResolutionStatus, "resolved">;
    } {
  const sortedDiameters = diameters
    .map((diameter, index) => ({
      diameter,
      index,
      sortValue: diameterSortValue(diameter),
    }))
    .sort((first, second) => {
      if (first.sortValue !== null && second.sortValue !== null) {
        return first.sortValue - second.sortValue;
      }

      if (first.sortValue !== null) {
        return -1;
      }

      if (second.sortValue !== null) {
        return 1;
      }

      return first.index - second.index;
    });

  if (sortedDiameters.length === 0) {
    return {
      issue: {
        code: "available_diameters_unresolved",
        message: "El sistema de canerias no informo diametros disponibles.",
        severity: "error",
        status: "unresolved",
      },
      status: "unresolved",
    };
  }

  const byId = new Map<string, { diameter: PipeDiameterReference; index: number }>();
  const ids = new Set<string>();
  const sortValues = new Set<string>();
  const usableDiameters: PipeDiameterReference[] = [];

  for (const item of sortedDiameters) {
    if (item.sortValue === null || item.sortValue <= 0) {
      return {
        issue: {
          code: "available_diameters_unresolved",
          data: { diameterId: item.diameter.id },
          message: "El catalogo contiene un diametro sin valor tecnico usable.",
          severity: "error",
          status: "unsupported",
        },
        status: "unsupported",
      };
    }

    if (ids.has(item.diameter.id)) {
      return {
        issue: {
          code: "available_diameters_unresolved",
          data: { diameterId: item.diameter.id },
          message: "El catalogo contiene diametros con IDs duplicados.",
          severity: "error",
          status: "unsupported",
        },
        status: "unsupported",
      };
    }

    const sortKey = item.sortValue.toFixed(6);

    if (sortValues.has(sortKey)) {
      return {
        issue: {
          code: "available_diameters_unresolved",
          data: { diameterMillimeters: item.sortValue },
          message: "El catalogo contiene diametros tecnicamente duplicados.",
          severity: "error",
          status: "unsupported",
        },
        status: "unsupported",
      };
    }

    ids.add(item.diameter.id);
    sortValues.add(sortKey);
    usableDiameters.push(item.diameter);
  }

  usableDiameters.forEach((diameter, index) => {
    byId.set(diameter.id, { diameter, index });
  });

  return {
    catalog: {
      byId,
      diameters: usableDiameters,
    },
    status: "resolved",
  };
}

function dedupeIssues(issues: ProfessionalDiameterAdoptionIssue[]) {
  const seen = new Set<string>();
  const next: ProfessionalDiameterAdoptionIssue[] = [];

  for (const issue of issues) {
    const key = [
      issue.code,
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

function sortTechnicalSegments(segments: TechnicalSegmentResult[]) {
  return [...segments].sort(
    (first, second) =>
      first.depth - second.depth ||
      first.fromNodeId.localeCompare(second.fromNodeId) ||
      first.toNodeId.localeCompare(second.toNodeId) ||
      first.segmentId.localeCompare(second.segmentId),
  );
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
