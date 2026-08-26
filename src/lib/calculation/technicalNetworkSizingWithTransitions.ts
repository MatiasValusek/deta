import {
  type PipeDiameterReference,
  type PipeSegmentPipeContext,
  type PipeSegmentSizingResult,
  type PipeSystem,
  type PipeSystemIdentity,
  type PipeSystemResolutionStatus,
} from "@/lib/calculation/pipeSystem";
import {
  detectDiameterTransitionProposals,
  type DiameterTransitionDecision,
  type DiameterTransitionProposal,
} from "@/lib/calculation/diameterTransitionProposals";
import {
  resolveTechnicalRouteAccessories,
  type TechnicalRouteAccessoryResolution,
  type TechnicalRouteAccessorySegmentContext,
} from "@/lib/calculation/technicalRouteAccessories";
import {
  resolveTechnicalRouteTransitions,
  type TechnicalRouteTransitionContribution,
  type TechnicalRouteTransitionResolution,
} from "@/lib/calculation/technicalRouteTransitions";
import type { DemandUnit, WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork, RouteSegment } from "@/lib/routing/types";
import type {
  TechnicalNetworkSizingResult,
  TechnicalRoute,
  TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";

export type TechnicalTransitionAwareNetworkSizingStatus =
  | "resolved"
  | "incomplete"
  | "unsupported";

export type TechnicalTransitionAwareNetworkSizingIssueCode =
  | "alternate_route_has_greater_sizing_length"
  | "available_diameter_unusable"
  | "available_diameters_unresolved"
  | "baseline_diameter_below_catalog"
  | "baseline_diameter_missing"
  | "baseline_diameter_not_in_catalog"
  | "baseline_sizing_unresolved"
  | "branch_transition_required"
  | "candidate_diameter_below_required"
  | "compound_transition_required"
  | "depends_on_unresolved_segment_diameter"
  | "duplicate_available_diameter"
  | "final_assignment_insufficient"
  | "missing_current_diameter"
  | "missing_flow"
  | "missing_flow_unit"
  | "missing_governing_route"
  | "minimality_audit_failed"
  | "required_diameter_not_in_catalog"
  | "route_accessories_unresolved"
  | "route_transitions_unresolved"
  | "sizing_unresolved"
  | "transition_aware_sizing_length_mismatch"
  | "transition_family_incompatible"
  | "transition_sizing_search_limit_reached"
  | "unconfirmed_required_transition";

export type TechnicalTransitionAwareNetworkSizingIssue = {
  code: TechnicalTransitionAwareNetworkSizingIssueCode;
  data?: Record<string, unknown>;
  message: string;
  routeId?: string;
  segmentId?: string;
  severity: "error" | "warning";
  status?: Exclude<PipeSystemResolutionStatus, "resolved">;
  transitionId?: string;
};

export type TechnicalTransitionAwareNetworkSizingSegmentResult = {
  accumulatedFlow: number | null;
  accumulatedFlowUnit: DemandUnit | null;
  baselineDiameter: PipeDiameterReference | null;
  calculatedDiameter: PipeDiameterReference | null;
  explanation: string | null;
  finalDiameter: PipeDiameterReference | null;
  governingRouteAccessoryEquivalentLengthMeters: number | null;
  governingRouteBranchTransitionEquivalentLengthMeters: number | null;
  governingRouteId: string | null;
  governingRoutePhysicalLengthMeters: number | null;
  governingRouteSimpleTransitionEquivalentLengthMeters: number | null;
  governingRouteTransitionEquivalentLengthMeters: number | null;
  governingTerminalEquipmentId: string | null;
  internalDiameterMillimeters: number | null;
  issues: TechnicalTransitionAwareNetworkSizingIssue[];
  physicalRouteLengthMeters: number | null;
  requiredDiameter: PipeDiameterReference | null;
  routeAccessoryResolutionId: string | null;
  routeTransitionResolutionId: string | null;
  segmentId: string;
  sizingResult: PipeSegmentSizingResult | null;
  status: PipeSystemResolutionStatus;
  tabulatedCapacityM3h: number | null;
  tabulatedLengthMeters: number | null;
  transitionAwareSizingLengthMeters: number | null;
};

export type TechnicalTransitionAwareSearchTraceEntry = {
  assignment: Record<string, PipeDiameterReference>;
  cost: number;
  feasible: boolean;
  issueCodes: TechnicalTransitionAwareNetworkSizingIssueCode[];
  stateKey: string;
  status: TechnicalTransitionAwareNetworkSizingStatus;
};

export type TechnicalTransitionAwareMinimalityAuditEntry = {
  finalDiameter: PipeDiameterReference;
  loweredDiameter: PipeDiameterReference | null;
  reason: string;
  segmentId: string;
  status: "failed" | "passed";
};

export type TechnicalTransitionAwareNetworkSizingResult = {
  additionalDiameterStepCost: number | null;
  baselineDiameterBySegmentId: Record<string, PipeDiameterReference>;
  discardedStateCount: number;
  evaluatedStateCount: number;
  finalDiameterBySegmentId: Record<string, PipeDiameterReference>;
  issueCount: number;
  issues: TechnicalTransitionAwareNetworkSizingIssue[];
  maxFrontierSize: number;
  minimalityAudit: TechnicalTransitionAwareMinimalityAuditEntry[];
  pipeSystem: PipeSystemIdentity;
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  searchLimit: number;
  segments: TechnicalTransitionAwareNetworkSizingSegmentResult[];
  status: TechnicalTransitionAwareNetworkSizingStatus;
  strategy: "uniform_cost_minimum_above_baseline_with_transition_rebuild";
  theoreticalStateCount: number;
  trace: TechnicalTransitionAwareSearchTraceEntry[];
  transitions: DiameterTransitionProposal[];
  variableSegmentIds: string[];
};

export type TechnicalTransitionAwareAssignmentEvaluation = {
  additionalDiameterStepCost: number | null;
  assignment: Record<string, PipeDiameterReference>;
  feasible: boolean;
  issues: TechnicalTransitionAwareNetworkSizingIssue[];
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  segments: TechnicalTransitionAwareNetworkSizingSegmentResult[];
  status: TechnicalTransitionAwareNetworkSizingStatus;
  transitions: DiameterTransitionProposal[];
};

type DiameterCatalog = {
  byId: Map<string, { diameter: PipeDiameterReference; index: number }>;
  diameters: PipeDiameterReference[];
};

type SearchDomain = {
  baselineIndex: number;
  maxIndex: number;
  segmentId: string;
};

type SearchState = {
  cost: number;
  key: string;
  vector: number[];
};

type Assignment = Map<string, PipeDiameterReference>;

type InternalAssignmentEvaluation = TechnicalTransitionAwareAssignmentEvaluation & {
  feasible: boolean;
};

const SIZING_EPSILON = 0.000001;
export const TRANSITION_AWARE_SIZING_SEARCH_LIMIT = 50000;

export function solveTechnicalNetworkSizingWithTransitions(params: {
  baselineSizing: TechnicalNetworkSizingResult | null;
  decisions?: DiameterTransitionDecision[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
  pipeSystem: PipeSystem;
  routeSegments: RouteSegment[];
  routes: TechnicalRoute[];
  searchLimit?: number;
  segments: TechnicalSegmentResult[];
}): TechnicalTransitionAwareNetworkSizingResult {
  const sortedSegments = sortTechnicalSegments(params.segments);
  const searchLimit =
    params.searchLimit ?? TRANSITION_AWARE_SIZING_SEARCH_LIMIT;
  const availableDiametersResolution = params.pipeSystem.getAvailableDiameters();

  if (availableDiametersResolution.status !== "resolved") {
    return createUnresolvedTransitionAwareResult({
      assignment: {},
      baselineDiameterBySegmentId: {},
      issue: {
        code: "available_diameters_unresolved",
        data: availableDiametersResolution.data,
        message: availableDiametersResolution.reason,
        severity: "error",
        status: availableDiametersResolution.status,
      },
      params,
      searchLimit,
      sortedSegments,
      status:
        availableDiametersResolution.status === "unsupported"
          ? "unsupported"
          : "incomplete",
    });
  }

  const catalogResolution = createDiameterCatalog(
    availableDiametersResolution.value,
  );

  if (catalogResolution.status !== "resolved") {
    return createUnresolvedTransitionAwareResult({
      assignment: {},
      baselineDiameterBySegmentId: {},
      issue: catalogResolution.issue,
      params,
      searchLimit,
      sortedSegments,
      status:
        catalogResolution.issue.status === "unsupported"
          ? "unsupported"
          : "incomplete",
    });
  }

  if (!params.baselineSizing || params.baselineSizing.status !== "resolved") {
    return createUnresolvedTransitionAwareResult({
      assignment: params.baselineSizing?.finalDiameterBySegmentId ?? {},
      baselineDiameterBySegmentId:
        params.baselineSizing?.finalDiameterBySegmentId ?? {},
      issue: {
        code: "baseline_sizing_unresolved",
        data: { baselineStatus: params.baselineSizing?.status ?? null },
        message:
          "El dimensionado base 08C2C no esta resuelto; 09C2B no puede buscar sobre un piso validado.",
        severity: "error",
        status: "unresolved",
      },
      params,
      searchLimit,
      sortedSegments,
      status: "incomplete",
    });
  }

  const catalog = catalogResolution.catalog;
  const baselineResolution = createBaselineAssignment({
    baselineDiameterBySegmentId: params.baselineSizing.finalDiameterBySegmentId,
    catalog,
    sortedSegments,
  });

  if (baselineResolution.status !== "resolved") {
    return createUnresolvedTransitionAwareResult({
      assignment: params.baselineSizing.finalDiameterBySegmentId,
      baselineDiameterBySegmentId: params.baselineSizing.finalDiameterBySegmentId,
      issue: baselineResolution.issue,
      params,
      searchLimit,
      sortedSegments,
      status:
        baselineResolution.issue.status === "unsupported"
          ? "unsupported"
          : "incomplete",
    });
  }

  const baselineAssignment = baselineResolution.assignment;
  const variableSegmentIds = selectVariableSegmentIds(sortedSegments);
  const domains = createSearchDomains({
    baselineAssignment,
    catalog,
    variableSegmentIds,
  });
  const theoreticalStateCount = calculateTheoreticalStateCount(domains);
  const queue: SearchState[] = [
    createSearchState(
      domains.map((domain) => domain.baselineIndex),
      domains,
    ),
  ];
  const seenStateKeys = new Set(queue.map((state) => state.key));
  const trace: TechnicalTransitionAwareSearchTraceEntry[] = [];
  let evaluatedStateCount = 0;
  let discardedStateCount = 0;
  let maxFrontierSize = queue.length;
  let lastEvaluation: InternalAssignmentEvaluation | null = null;

  while (queue.length > 0) {
    if (evaluatedStateCount >= searchLimit) {
      return createSearchLimitResult({
        baselineAssignment,
        discardedStateCount,
        evaluatedStateCount,
        lastEvaluation,
        maxFrontierSize,
        params,
        searchLimit,
        sortedSegments,
        theoreticalStateCount,
        trace,
        variableSegmentIds,
      });
    }

    const state = queue.shift() as SearchState;
    const assignment = createAssignmentFromState({
      baselineAssignment,
      catalog,
      domains,
      state,
    });
    const evaluation = evaluateAssignmentWithCatalog({
      assignment,
      baselineAssignment,
      catalog,
      cost: state.cost,
      decisions: params.decisions,
      equipment: params.equipment,
      network: params.network,
      params,
      sortedSegments,
    });

    evaluatedStateCount += 1;
    lastEvaluation = evaluation;
    trace.push(createTraceEntry(state, evaluation));

    if (evaluation.feasible) {
      const finalEvaluation = evaluateAssignmentWithCatalog({
        assignment,
        baselineAssignment,
        catalog,
        cost: state.cost,
        decisions: params.decisions,
        equipment: params.equipment,
        network: params.network,
        params,
        sortedSegments,
      });
      const finalValidationIssues = createFinalValidationIssues({
        catalog,
        evaluation: finalEvaluation,
        routes: params.routes,
      });
      const minimalityAudit = createMinimalityAudit({
        assignment,
        baselineAssignment,
        catalog,
        decisions: params.decisions,
        domains,
        equipment: params.equipment,
        network: params.network,
        params,
        sortedSegments,
      });
      const minimalityIssues = createMinimalityAuditIssues(minimalityAudit);
      const issues = dedupeIssues([
        ...finalEvaluation.issues,
        ...finalValidationIssues,
        ...minimalityIssues,
      ]);

      return {
        additionalDiameterStepCost: state.cost,
        baselineDiameterBySegmentId: assignmentToRecord(
          baselineAssignment,
          sortedSegments,
        ),
        discardedStateCount,
        evaluatedStateCount,
        finalDiameterBySegmentId: finalEvaluation.assignment,
        issueCount: issues.length,
        issues,
        maxFrontierSize,
        minimalityAudit,
        pipeSystem: params.pipeSystem.identity,
        routeAccessoryResolutions: finalEvaluation.routeAccessoryResolutions,
        routeTransitionResolutions: finalEvaluation.routeTransitionResolutions,
        searchLimit,
        segments: finalEvaluation.segments,
        status: resolveTransitionAwareStatus(finalEvaluation.segments, issues),
        strategy: "uniform_cost_minimum_above_baseline_with_transition_rebuild",
        theoreticalStateCount,
        trace,
        transitions: finalEvaluation.transitions,
        variableSegmentIds,
      };
    }

    discardedStateCount += 1;

    for (const neighbor of createNeighborStates(state, domains)) {
      if (seenStateKeys.has(neighbor.key)) {
        continue;
      }

      seenStateKeys.add(neighbor.key);
      insertSearchState(queue, neighbor);
    }

    maxFrontierSize = Math.max(maxFrontierSize, queue.length);
  }

  return createNoFeasibleAssignmentResult({
    baselineAssignment,
    discardedStateCount,
    evaluatedStateCount,
    lastEvaluation,
    maxFrontierSize,
    params,
    searchLimit,
    sortedSegments,
    theoreticalStateCount,
    trace,
    variableSegmentIds,
  });
}

export function evaluateTransitionAwareSizingAssignment(params: {
  baselineDiameterBySegmentId?: Record<string, PipeDiameterReference>;
  decisions?: DiameterTransitionDecision[];
  diameterBySegmentId: Record<string, PipeDiameterReference>;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
  pipeSystem: PipeSystem;
  routeSegments: RouteSegment[];
  routes: TechnicalRoute[];
  segments: TechnicalSegmentResult[];
}): TechnicalTransitionAwareAssignmentEvaluation {
  const availableDiametersResolution = params.pipeSystem.getAvailableDiameters();
  const sortedSegments = sortTechnicalSegments(params.segments);

  if (availableDiametersResolution.status !== "resolved") {
    const issue: TechnicalTransitionAwareNetworkSizingIssue = {
      code: "available_diameters_unresolved",
      data: availableDiametersResolution.data,
      message: availableDiametersResolution.reason,
      severity: "error",
      status: availableDiametersResolution.status,
    };

    return {
      additionalDiameterStepCost: null,
      assignment: params.diameterBySegmentId,
      feasible: false,
      issues: [issue],
      routeAccessoryResolutions: {},
      routeTransitionResolutions: {},
      segments: [],
      status:
        availableDiametersResolution.status === "unsupported"
          ? "unsupported"
          : "incomplete",
      transitions: [],
    };
  }

  const catalogResolution = createDiameterCatalog(
    availableDiametersResolution.value,
  );

  if (catalogResolution.status !== "resolved") {
    return {
      additionalDiameterStepCost: null,
      assignment: params.diameterBySegmentId,
      feasible: false,
      issues: [catalogResolution.issue],
      routeAccessoryResolutions: {},
      routeTransitionResolutions: {},
      segments: [],
      status:
        catalogResolution.issue.status === "unsupported"
          ? "unsupported"
          : "incomplete",
      transitions: [],
    };
  }

  const assignment = recordToAssignment(params.diameterBySegmentId);
  const baselineAssignment = recordToAssignment(
    params.baselineDiameterBySegmentId ?? params.diameterBySegmentId,
  );
  const cost = calculateAssignmentCost({
    assignment,
    baselineAssignment,
    catalog: catalogResolution.catalog,
  });

  return evaluateAssignmentWithCatalog({
    assignment,
    baselineAssignment,
    catalog: catalogResolution.catalog,
    cost,
    decisions: params.decisions,
    equipment: params.equipment,
    network: params.network,
    params,
    sortedSegments,
  });
}

export function enumerateTransitionAwareSizingAssignmentsForVerification(params: {
  baselineSizing: TechnicalNetworkSizingResult;
  decisions?: DiameterTransitionDecision[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
  pipeSystem: PipeSystem;
  routeSegments: RouteSegment[];
  routes: TechnicalRoute[];
  segments: TechnicalSegmentResult[];
}): {
  evaluatedStateCount: number;
  minimalAssignment: Record<string, PipeDiameterReference> | null;
  minimalCost: number | null;
} {
  const sortedSegments = sortTechnicalSegments(params.segments);
  const availableDiametersResolution = params.pipeSystem.getAvailableDiameters();

  if (availableDiametersResolution.status !== "resolved") {
    return {
      evaluatedStateCount: 0,
      minimalAssignment: null,
      minimalCost: null,
    };
  }

  const catalogResolution = createDiameterCatalog(
    availableDiametersResolution.value,
  );

  if (catalogResolution.status !== "resolved") {
    return {
      evaluatedStateCount: 0,
      minimalAssignment: null,
      minimalCost: null,
    };
  }

  const baselineResolution = createBaselineAssignment({
    baselineDiameterBySegmentId: params.baselineSizing.finalDiameterBySegmentId,
    catalog: catalogResolution.catalog,
    sortedSegments,
  });

  if (baselineResolution.status !== "resolved") {
    return {
      evaluatedStateCount: 0,
      minimalAssignment: null,
      minimalCost: null,
    };
  }

  const variableSegmentIds = selectVariableSegmentIds(sortedSegments);
  const domains = createSearchDomains({
    baselineAssignment: baselineResolution.assignment,
    catalog: catalogResolution.catalog,
    variableSegmentIds,
  });
  let evaluatedStateCount = 0;
  let minimalEvaluation: InternalAssignmentEvaluation | null = null;

  for (const vector of enumerateDomainVectors(domains)) {
    const state = createSearchState(vector, domains);
    const assignment = createAssignmentFromState({
      baselineAssignment: baselineResolution.assignment,
      catalog: catalogResolution.catalog,
      domains,
      state,
    });
    const evaluation = evaluateAssignmentWithCatalog({
      assignment,
      baselineAssignment: baselineResolution.assignment,
      catalog: catalogResolution.catalog,
      cost: state.cost,
      decisions: params.decisions,
      equipment: params.equipment,
      network: params.network,
      params,
      sortedSegments,
    });

    evaluatedStateCount += 1;

    if (!evaluation.feasible) {
      continue;
    }

    if (
      !minimalEvaluation ||
      compareEvaluations(evaluation, minimalEvaluation, sortedSegments) < 0
    ) {
      minimalEvaluation = evaluation;
    }
  }

  return {
    evaluatedStateCount,
    minimalAssignment: minimalEvaluation?.assignment ?? null,
    minimalCost: minimalEvaluation?.additionalDiameterStepCost ?? null,
  };
}

function evaluateAssignmentWithCatalog(params: {
  assignment: Assignment;
  baselineAssignment: Assignment;
  catalog: DiameterCatalog;
  cost: number | null;
  decisions?: DiameterTransitionDecision[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  params: {
    pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
    pipeSystem: PipeSystem;
    routeSegments: RouteSegment[];
    routes: TechnicalRoute[];
  };
  sortedSegments: TechnicalSegmentResult[];
}): InternalAssignmentEvaluation {
  const assignmentRecord = assignmentToRecord(
    params.assignment,
    params.sortedSegments,
  );
  const routeAccessoryResolutions = createRouteAccessoryResolutions({
    assignment: params.assignment,
    params: params.params,
    sortedSegments: params.sortedSegments,
  });
  const transitions = detectDiameterTransitionProposals({
    decisions: params.decisions ?? [],
    diameterBySegmentId: params.assignment,
    equipment: params.equipment,
    network: params.network,
  });
  const routeTransitionResolutions = createRouteTransitionResolutions({
    assignment: params.assignment,
    equipment: params.equipment,
    network: params.network,
    params: params.params,
    routeAccessoryResolutions,
    transitions,
  });
  const segments = params.sortedSegments.map((segment) =>
    evaluateSegmentAssignment({
      assignment: params.assignment,
      baselineAssignment: params.baselineAssignment,
      catalog: params.catalog,
      pipeContextBySegmentId: params.params.pipeContextBySegmentId,
      pipeSystem: params.params.pipeSystem,
      routeAccessoryResolutions,
      routeTransitionResolutions,
      segment,
    }),
  );
  const issues = dedupeIssues(segments.flatMap((segment) => segment.issues));

  return {
    additionalDiameterStepCost: params.cost,
    assignment: assignmentRecord,
    feasible:
      issues.every((issue) => issue.severity !== "error") &&
      segments.every((segment) => segment.status === "resolved"),
    issues,
    routeAccessoryResolutions,
    routeTransitionResolutions,
    segments,
    status: resolveTransitionAwareStatus(segments, issues),
    transitions,
  };
}

function createRouteAccessoryResolutions(params: {
  assignment: Assignment;
  params: {
    pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
    pipeSystem: PipeSystem;
    routeSegments: RouteSegment[];
    routes: TechnicalRoute[];
  };
  sortedSegments: TechnicalSegmentResult[];
}) {
  const segmentContextBySegmentId =
    createRouteAccessorySegmentContextBySegmentId(params.sortedSegments);

  return Object.fromEntries(
    sortTechnicalRoutes(params.params.routes).map((route) => [
      route.id,
      resolveTechnicalRouteAccessories({
        diameterBySegmentId: params.assignment,
        pipeContextBySegmentId: params.params.pipeContextBySegmentId,
        pipeSystem: params.params.pipeSystem,
        route,
        segmentContextBySegmentId,
        segments: params.params.routeSegments,
      }),
    ]),
  );
}

function createRouteTransitionResolutions(params: {
  assignment: Assignment;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  params: {
    pipeSystem: PipeSystem;
    routes: TechnicalRoute[];
  };
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  transitions: DiameterTransitionProposal[];
}) {
  return Object.fromEntries(
    sortTechnicalRoutes(params.params.routes).map((route) => [
      route.id,
      resolveTechnicalRouteTransitions({
        diameterBySegmentId: params.assignment,
        equipment: params.equipment,
        governingRouteAccessoryEquivalentLengthMeters:
          params.routeAccessoryResolutions[route.id]
            ?.governingRouteAccessoryEquivalentLengthMeters ?? null,
        includeBranchTransitions: true,
        network: params.network,
        pipeSystem: params.params.pipeSystem,
        route,
        transitions: params.transitions,
      }),
    ]),
  );
}

function evaluateSegmentAssignment(params: {
  assignment: Assignment;
  baselineAssignment: Assignment;
  catalog: DiameterCatalog;
  pipeContextBySegmentId:
    | Record<string, PipeSegmentPipeContext | undefined>
    | undefined;
  pipeSystem: PipeSystem;
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  segment: TechnicalSegmentResult;
}): TechnicalTransitionAwareNetworkSizingSegmentResult {
  const currentDiameter = params.assignment.get(params.segment.segmentId) ?? null;
  const baselineDiameter =
    params.baselineAssignment.get(params.segment.segmentId) ?? null;
  const governingRoute = params.segment.governingRoute;
  const routeAccessoryResolution = governingRoute
    ? params.routeAccessoryResolutions[governingRoute.routeId] ?? null
    : null;
  const routeTransitionResolution = governingRoute
    ? params.routeTransitionResolutions[governingRoute.routeId] ?? null
    : null;
  const base = createBaseSegmentSizingResult({
    baselineDiameter,
    currentDiameter,
    governingRoute,
    routeAccessoryResolution,
    routeTransitionResolution,
    segment: params.segment,
  });

  if (!currentDiameter) {
    return failSegmentSizing({
      base,
      issue: {
        code: "missing_current_diameter",
        message: "Falta diametro candidato interno del solver.",
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unresolved",
      },
    });
  }

  const currentIndex = params.catalog.byId.get(currentDiameter.id)?.index;
  const baselineIndex = baselineDiameter
    ? params.catalog.byId.get(baselineDiameter.id)?.index
    : undefined;

  if (!baselineDiameter || baselineIndex === undefined) {
    return failSegmentSizing({
      base,
      issue: {
        code: "baseline_diameter_missing",
        message: "Falta diametro baseline validado para el tramo.",
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unresolved",
      },
    });
  }

  if (currentIndex === undefined) {
    return failSegmentSizing({
      base,
      issue: {
        code: "baseline_diameter_not_in_catalog",
        data: { diameterId: currentDiameter.id },
        message: "El diametro candidato no pertenece al catalogo disponible.",
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unsupported",
      },
    });
  }

  if (currentIndex < baselineIndex) {
    return failSegmentSizing({
      base,
      issue: {
        code: "baseline_diameter_below_catalog",
        data: {
          baselineDiameterId: baselineDiameter.id,
          candidateDiameterId: currentDiameter.id,
        },
        message:
          "El candidato queda por debajo del piso baseline validado por 08C2C.",
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unsupported",
      },
    });
  }

  if (!governingRoute) {
    const resolution = params.segment.governingRouteResolution;

    return failSegmentSizing({
      base,
      issue: {
        code: "missing_governing_route",
        data:
          resolution.status === "resolved" ? undefined : resolution.data,
        message:
          resolution.status === "resolved"
            ? "Falta recorrido gobernante para el tramo."
            : resolution.reason,
        segmentId: params.segment.segmentId,
        severity: "error",
        status:
          resolution.status === "resolved" ? "unresolved" : resolution.status,
      },
    });
  }

  if (!routeAccessoryResolution) {
    return failSegmentSizing({
      base,
      issue: {
        code: "route_accessories_unresolved",
        message:
          "No se encontro la resolucion de accesorios del recorrido gobernante.",
        routeId: governingRoute.routeId,
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unresolved",
      },
    });
  }

  if (routeAccessoryResolution.status !== "resolved") {
    return failSegmentSizing({
      base,
      issue: {
        code: "route_accessories_unresolved",
        data: {
          reasons: routeAccessoryResolution.reasons,
        },
        message:
          routeAccessoryResolution.reasons[0] ??
          "Accesorios del recorrido pendientes.",
        routeId: governingRoute.routeId,
        segmentId: params.segment.segmentId,
        severity: "error",
        status: routeAccessoryResolution.status,
      },
    });
  }

  if (!routeTransitionResolution) {
    return failSegmentSizing({
      base,
      issue: {
        code: "route_transitions_unresolved",
        message:
          "No se encontro la resolucion de transiciones del recorrido gobernante.",
        routeId: governingRoute.routeId,
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unresolved",
      },
    });
  }

  if (routeTransitionResolution.status !== "resolved") {
    return failSegmentSizing({
      base,
      issue: createRouteTransitionIssue({
        resolution: routeTransitionResolution,
        routeId: governingRoute.routeId,
        segmentId: params.segment.segmentId,
      }),
    });
  }

  if (params.segment.accumulatedFlow === null) {
    return failSegmentSizing({
      base,
      issue: {
        code: "missing_flow",
        message: "Falta caudal acumulado aguas abajo.",
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unresolved",
      },
    });
  }

  if (params.segment.accumulatedFlowUnit === null) {
    return failSegmentSizing({
      base,
      issue: {
        code: "missing_flow_unit",
        message: "Falta unidad de caudal acumulado aguas abajo.",
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unresolved",
      },
    });
  }

  const transitionAwareSizingLengthMeters =
    routeTransitionResolution.projectedSizingLengthMeters;

  if (transitionAwareSizingLengthMeters === null) {
    return failSegmentSizing({
      base,
      issue: {
        code: "sizing_unresolved",
        message:
          "Falta longitud de dimensionado completa con transiciones del recorrido.",
        routeId: governingRoute.routeId,
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unresolved",
      },
    });
  }

  const sizingResolution = params.pipeSystem.sizeSegment({
    accessoryEquivalentLengthMeters:
      routeAccessoryResolution.governingRouteAccessoryEquivalentLengthMeters,
    accumulatedFlow: params.segment.accumulatedFlow,
    accumulatedFlowUnit: params.segment.accumulatedFlowUnit,
    calculationLengthMeters: transitionAwareSizingLengthMeters,
    physicalLengthMeters: governingRoute.physicalLengthMeters,
    pipe: {
      ...(params.pipeContextBySegmentId?.[params.segment.segmentId] ?? {}),
      diameter: currentDiameter,
    },
    segmentId: params.segment.segmentId,
  });

  if (sizingResolution.status !== "resolved") {
    return failSegmentSizing({
      base,
      issue: {
        code: "sizing_unresolved",
        data: sizingResolution.data,
        message: sizingResolution.reason,
        routeId: governingRoute.routeId,
        segmentId: params.segment.segmentId,
        severity: "error",
        status: sizingResolution.status,
      },
    });
  }

  const requiredDiameter = sizingResolution.value.selectedDiameter;
  const requiredDiameterIndex = params.catalog.byId.get(requiredDiameter.id);

  if (!requiredDiameterIndex) {
    return failSegmentSizing({
      base,
      issue: {
        code: "required_diameter_not_in_catalog",
        data: { requiredDiameterId: requiredDiameter.id },
        message:
          "El sistema devolvio un diametro requerido fuera del catalogo disponible.",
        routeId: governingRoute.routeId,
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unsupported",
      },
    });
  }

  if (currentIndex < requiredDiameterIndex.index) {
    return failSegmentSizing({
      base: {
        ...base,
        calculatedDiameter: currentDiameter,
        explanation: sizingResolution.value.explanation,
        finalDiameter: currentDiameter,
        internalDiameterMillimeters:
          currentDiameter.internalDiameterMillimeters ?? null,
        requiredDiameter,
        sizingResult: sizingResolution.value,
        tabulatedCapacityM3h: finiteRecordNumber(
          sizingResolution.value.usedData,
          "capacityM3h",
        ),
        tabulatedLengthMeters: finiteRecordNumber(
          sizingResolution.value.usedData,
          "tabulatedLengthMeters",
        ),
        transitionAwareSizingLengthMeters,
      },
      issue: {
        code: "candidate_diameter_below_required",
        data: {
          candidateDiameterId: currentDiameter.id,
          requiredDiameterId: requiredDiameter.id,
        },
        message:
          `El candidato ${currentDiameter.label} no cubre el diametro requerido ` +
          `${requiredDiameter.label} con transiciones.`,
        routeId: governingRoute.routeId,
        segmentId: params.segment.segmentId,
        severity: "error",
        status: "unresolved",
      },
    });
  }

  return {
    ...base,
    calculatedDiameter: currentDiameter,
    explanation: sizingResolution.value.explanation,
    finalDiameter: currentDiameter,
    internalDiameterMillimeters:
      currentDiameter.internalDiameterMillimeters ?? null,
    requiredDiameter,
    sizingResult: sizingResolution.value,
    status: "resolved",
    tabulatedCapacityM3h: finiteRecordNumber(
      sizingResolution.value.usedData,
      "capacityM3h",
    ),
    tabulatedLengthMeters: finiteRecordNumber(
      sizingResolution.value.usedData,
      "tabulatedLengthMeters",
    ),
    transitionAwareSizingLengthMeters,
  };
}

function createBaseSegmentSizingResult(params: {
  baselineDiameter: PipeDiameterReference | null;
  currentDiameter: PipeDiameterReference | null;
  governingRoute: TechnicalSegmentResult["governingRoute"];
  routeAccessoryResolution: TechnicalRouteAccessoryResolution | null;
  routeTransitionResolution: TechnicalRouteTransitionResolution | null;
  segment: TechnicalSegmentResult;
}): TechnicalTransitionAwareNetworkSizingSegmentResult {
  return {
    accumulatedFlow: params.segment.accumulatedFlow,
    accumulatedFlowUnit: params.segment.accumulatedFlowUnit,
    baselineDiameter: params.baselineDiameter,
    calculatedDiameter: params.currentDiameter,
    explanation: null,
    finalDiameter: params.currentDiameter,
    governingRouteAccessoryEquivalentLengthMeters:
      params.routeAccessoryResolution
        ?.governingRouteAccessoryEquivalentLengthMeters ?? null,
    governingRouteBranchTransitionEquivalentLengthMeters:
      params.routeTransitionResolution?.branchTransitionEquivalentLengthMeters ??
      null,
    governingRouteId: params.governingRoute?.routeId ?? null,
    governingRoutePhysicalLengthMeters:
      params.governingRoute?.physicalLengthMeters ?? null,
    governingRouteSimpleTransitionEquivalentLengthMeters:
      params.routeTransitionResolution?.simpleTransitionEquivalentLengthMeters ??
      null,
    governingRouteTransitionEquivalentLengthMeters:
      params.routeTransitionResolution?.equivalentLengthMeters ?? null,
    governingTerminalEquipmentId:
      params.governingRoute?.terminalEquipmentId ?? null,
    internalDiameterMillimeters:
      params.currentDiameter?.internalDiameterMillimeters ?? null,
    issues: [],
    physicalRouteLengthMeters:
      params.governingRoute?.physicalLengthMeters ?? null,
    requiredDiameter: null,
    routeAccessoryResolutionId: params.routeAccessoryResolution?.routeId ?? null,
    routeTransitionResolutionId:
      params.routeTransitionResolution?.routeId ?? null,
    segmentId: params.segment.segmentId,
    sizingResult: null,
    status: "unresolved",
    tabulatedCapacityM3h: null,
    tabulatedLengthMeters: null,
    transitionAwareSizingLengthMeters:
      params.routeTransitionResolution?.projectedSizingLengthMeters ?? null,
  };
}

function failSegmentSizing(params: {
  base: TechnicalTransitionAwareNetworkSizingSegmentResult;
  issue: TechnicalTransitionAwareNetworkSizingIssue;
}): TechnicalTransitionAwareNetworkSizingSegmentResult {
  return {
    ...params.base,
    explanation: params.issue.message,
    issues: [params.issue],
    status: params.issue.status ?? "unresolved",
  };
}

function createRouteTransitionIssue(params: {
  resolution: TechnicalRouteTransitionResolution;
  routeId: string;
  segmentId: string;
}): TechnicalTransitionAwareNetworkSizingIssue {
  const blockingContribution =
    params.resolution.contributions.find(
      (contribution) =>
        contribution.status === "unsupported" ||
        contribution.status === "unresolved",
    ) ?? null;
  const code = transitionContributionIssueCode(blockingContribution);
  const message =
    blockingContribution?.reason ??
    params.resolution.reasons[0] ??
    "Transiciones del recorrido pendientes.";

  return {
    code,
    data: {
      contributionCount: params.resolution.contributions.length,
      reasons: params.resolution.reasons,
      transitionKind: blockingContribution?.transitionKind,
      transitionSource: blockingContribution?.source,
    },
    message,
    routeId: params.routeId,
    segmentId: params.segmentId,
    severity: "error",
    status:
      params.resolution.status === "resolved"
        ? "unresolved"
        : params.resolution.status,
    transitionId: blockingContribution?.transitionId,
  };
}

function transitionContributionIssueCode(
  contribution: TechnicalRouteTransitionContribution | null,
): TechnicalTransitionAwareNetworkSizingIssueCode {
  if (!contribution) {
    return "route_transitions_unresolved";
  }

  if (contribution.status === "unsupported") {
    return "transition_family_incompatible";
  }

  if (contribution.transitionKind === "branch_transition") {
    return "branch_transition_required";
  }

  if (contribution.transitionKind === "compound_turn_transition") {
    return "compound_transition_required";
  }

  if (contribution.source === "unconfirmed" || contribution.source === "rejected") {
    return "unconfirmed_required_transition";
  }

  return "route_transitions_unresolved";
}

function createDiameterCatalog(
  diameters: PipeDiameterReference[],
):
  | { catalog: DiameterCatalog; status: "resolved" }
  | {
      issue: TechnicalTransitionAwareNetworkSizingIssue;
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

  const ids = new Set<string>();
  const sortValues = new Set<string>();
  const byId = new Map<string, { diameter: PipeDiameterReference; index: number }>();
  const usableDiameters: PipeDiameterReference[] = [];

  for (const item of sortedDiameters) {
    if (item.sortValue === null || item.sortValue <= 0) {
      return {
        issue: {
          code: "available_diameter_unusable",
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
          code: "duplicate_available_diameter",
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
          code: "duplicate_available_diameter",
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

function createBaselineAssignment(params: {
  baselineDiameterBySegmentId: Record<string, PipeDiameterReference>;
  catalog: DiameterCatalog;
  sortedSegments: TechnicalSegmentResult[];
}):
  | { assignment: Assignment; status: "resolved" }
  | { issue: TechnicalTransitionAwareNetworkSizingIssue; status: "unresolved" | "unsupported" } {
  const assignment = new Map<string, PipeDiameterReference>();

  for (const segment of params.sortedSegments) {
    const diameter = params.baselineDiameterBySegmentId[segment.segmentId] ?? null;

    if (!diameter) {
      return {
        issue: {
          code: "baseline_diameter_missing",
          message:
            "El baseline 08C2C no contiene diametro final para todos los tramos.",
          segmentId: segment.segmentId,
          severity: "error",
          status: "unresolved",
        },
        status: "unresolved",
      };
    }

    if (!params.catalog.byId.has(diameter.id)) {
      return {
        issue: {
          code: "baseline_diameter_not_in_catalog",
          data: { diameterId: diameter.id },
          message:
            "Un diametro del baseline 08C2C no pertenece al catalogo actual.",
          segmentId: segment.segmentId,
          severity: "error",
          status: "unsupported",
        },
        status: "unsupported",
      };
    }

    assignment.set(segment.segmentId, diameter);
  }

  return { assignment, status: "resolved" };
}

function selectVariableSegmentIds(sortedSegments: TechnicalSegmentResult[]) {
  // Conservador: todos los tramos pueden variar sobre el piso baseline.
  return sortedSegments.map((segment) => segment.segmentId);
}

function createSearchDomains(params: {
  baselineAssignment: Assignment;
  catalog: DiameterCatalog;
  variableSegmentIds: string[];
}) {
  return params.variableSegmentIds.map((segmentId): SearchDomain => {
    const baselineDiameter = params.baselineAssignment.get(segmentId);
    const baselineIndex = baselineDiameter
      ? params.catalog.byId.get(baselineDiameter.id)?.index
      : undefined;

    return {
      baselineIndex: baselineIndex ?? 0,
      maxIndex: params.catalog.diameters.length - 1,
      segmentId,
    };
  });
}

function calculateTheoreticalStateCount(domains: SearchDomain[]) {
  let count = 1;

  for (const domain of domains) {
    count *= domain.maxIndex - domain.baselineIndex + 1;

    if (count > Number.MAX_SAFE_INTEGER) {
      return Number.POSITIVE_INFINITY;
    }
  }

  return count;
}

function createSearchState(vector: number[], domains: SearchDomain[]): SearchState {
  return {
    cost: vector.reduce(
      (sum, index, itemIndex) =>
        sum + index - ((domains[itemIndex] as SearchDomain).baselineIndex),
      0,
    ),
    key: vector.join("|"),
    vector,
  };
}

function createAssignmentFromState(params: {
  baselineAssignment: Assignment;
  catalog: DiameterCatalog;
  domains: SearchDomain[];
  state: SearchState;
}) {
  const assignment = new Map(params.baselineAssignment);

  params.domains.forEach((domain, index) => {
    const catalogIndex = params.state.vector[index] as number;
    const diameter = params.catalog.diameters[catalogIndex];

    if (diameter) {
      assignment.set(domain.segmentId, diameter);
    }
  });

  return assignment;
}

function createNeighborStates(state: SearchState, domains: SearchDomain[]) {
  const neighbors: SearchState[] = [];

  for (let index = 0; index < domains.length; index += 1) {
    const domain = domains[index] as SearchDomain;
    const currentIndex = state.vector[index] as number;

    if (currentIndex >= domain.maxIndex) {
      continue;
    }

    const vector = [...state.vector];
    vector[index] = currentIndex + 1;
    neighbors.push(createSearchState(vector, domains));
  }

  return neighbors.sort(compareSearchStates);
}

function insertSearchState(queue: SearchState[], state: SearchState) {
  let low = 0;
  let high = queue.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (compareSearchStates(state, queue[middle] as SearchState) < 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  queue.splice(low, 0, state);
}

function compareSearchStates(first: SearchState, second: SearchState) {
  if (first.cost !== second.cost) {
    return first.cost - second.cost;
  }

  return compareVectors(first.vector, second.vector);
}

function compareVectors(first: number[], second: number[]) {
  const length = Math.min(first.length, second.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (first[index] as number) - (second[index] as number);

    if (difference !== 0) {
      return difference;
    }
  }

  return first.length - second.length;
}

function createTraceEntry(
  state: SearchState,
  evaluation: InternalAssignmentEvaluation,
): TechnicalTransitionAwareSearchTraceEntry {
  return {
    assignment: evaluation.assignment,
    cost: state.cost,
    feasible: evaluation.feasible,
    issueCodes: [
      ...new Set(evaluation.issues.map((issue) => issue.code)),
    ].sort(),
    stateKey: state.key,
    status: evaluation.status,
  };
}

function createFinalValidationIssues(params: {
  catalog: DiameterCatalog;
  evaluation: InternalAssignmentEvaluation;
  routes: TechnicalRoute[];
}) {
  const issues: TechnicalTransitionAwareNetworkSizingIssue[] = [];

  for (const segment of params.evaluation.segments) {
    if (
      segment.status !== "resolved" ||
      !segment.finalDiameter ||
      !segment.requiredDiameter
    ) {
      continue;
    }

    const assignedIndex = params.catalog.byId.get(segment.finalDiameter.id)?.index;
    const requiredIndex = params.catalog.byId.get(segment.requiredDiameter.id)?.index;

    if (
      assignedIndex === undefined ||
      requiredIndex === undefined ||
      assignedIndex < requiredIndex
    ) {
      issues.push({
        code: "final_assignment_insufficient",
        message: "El diametro final asignado no cubre el diametro requerido.",
        segmentId: segment.segmentId,
        severity: "error",
        status: "unresolved",
      });
    }

    if (
      segment.governingRoutePhysicalLengthMeters !== null &&
      segment.governingRouteAccessoryEquivalentLengthMeters !== null &&
      segment.governingRouteTransitionEquivalentLengthMeters !== null &&
      segment.transitionAwareSizingLengthMeters !== null
    ) {
      const expected =
        segment.governingRoutePhysicalLengthMeters +
        segment.governingRouteAccessoryEquivalentLengthMeters +
        segment.governingRouteTransitionEquivalentLengthMeters;

      if (
        Math.abs(expected - segment.transitionAwareSizingLengthMeters) >
        SIZING_EPSILON
      ) {
        issues.push({
          code: "transition_aware_sizing_length_mismatch",
          message:
            "La longitud final no coincide con recorrido fisico mas accesorios mas transiciones.",
          routeId: segment.governingRouteId ?? undefined,
          segmentId: segment.segmentId,
          severity: "error",
          status: "unresolved",
        });
      }
    }
  }

  issues.push(
    ...createAlternateRouteIssues({
      evaluation: params.evaluation,
      routes: params.routes,
    }),
  );

  return issues;
}

function createAlternateRouteIssues(params: {
  evaluation: InternalAssignmentEvaluation;
  routes: TechnicalRoute[];
}) {
  const issues: TechnicalTransitionAwareNetworkSizingIssue[] = [];
  const routesBySegmentId = new Map<string, TechnicalRoute[]>();

  for (const route of params.routes) {
    for (const segmentId of route.segmentIds) {
      const current = routesBySegmentId.get(segmentId) ?? [];
      current.push(route);
      routesBySegmentId.set(segmentId, current);
    }
  }

  for (const segment of params.evaluation.segments) {
    const selectedRouteId = segment.governingRouteId;
    const selectedSizingLength = segment.transitionAwareSizingLengthMeters;

    if (!selectedRouteId || selectedSizingLength === null) {
      continue;
    }

    for (const alternateRoute of routesBySegmentId.get(segment.segmentId) ?? []) {
      if (alternateRoute.id === selectedRouteId) {
        continue;
      }

      const alternateResolution =
        params.evaluation.routeTransitionResolutions[alternateRoute.id] ?? null;
      const alternateSizingLength =
        alternateResolution?.projectedSizingLengthMeters ?? null;

      if (
        alternateSizingLength !== null &&
        alternateSizingLength > selectedSizingLength + SIZING_EPSILON
      ) {
        issues.push({
          code: "alternate_route_has_greater_sizing_length",
          data: {
            alternateRouteId: alternateRoute.id,
            alternateSizingLengthMeters: alternateSizingLength,
            selectedRouteId,
            selectedSizingLengthMeters: selectedSizingLength,
          },
          message:
            "Un recorrido alternativo tiene mayor longitud de dimensionado con transiciones que el gobernante fisico.",
          routeId: alternateRoute.id,
          segmentId: segment.segmentId,
          severity: "warning",
        });
      }
    }
  }

  return issues;
}

function createMinimalityAudit(params: {
  assignment: Assignment;
  baselineAssignment: Assignment;
  catalog: DiameterCatalog;
  decisions?: DiameterTransitionDecision[];
  domains: SearchDomain[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  params: {
    pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
    pipeSystem: PipeSystem;
    routeSegments: RouteSegment[];
    routes: TechnicalRoute[];
  };
  sortedSegments: TechnicalSegmentResult[];
}) {
  const audit: TechnicalTransitionAwareMinimalityAuditEntry[] = [];

  for (const domain of params.domains) {
    const finalDiameter = params.assignment.get(domain.segmentId);
    const baselineDiameter = params.baselineAssignment.get(domain.segmentId);

    if (!finalDiameter || !baselineDiameter) {
      continue;
    }

    const finalIndex = params.catalog.byId.get(finalDiameter.id)?.index;
    const baselineIndex = params.catalog.byId.get(baselineDiameter.id)?.index;

    if (
      finalIndex === undefined ||
      baselineIndex === undefined ||
      finalIndex <= baselineIndex
    ) {
      continue;
    }

    const loweredDiameter = params.catalog.diameters[finalIndex - 1] ?? null;

    if (!loweredDiameter || finalIndex - 1 < baselineIndex) {
      audit.push({
        finalDiameter,
        loweredDiameter: null,
        reason: "Bajar un escalon queda por debajo del baseline.",
        segmentId: domain.segmentId,
        status: "passed",
      });
      continue;
    }

    const loweredAssignment = new Map(params.assignment);
    loweredAssignment.set(domain.segmentId, loweredDiameter);
    const loweredEvaluation = evaluateAssignmentWithCatalog({
      assignment: loweredAssignment,
      baselineAssignment: params.baselineAssignment,
      catalog: params.catalog,
      cost: calculateAssignmentCost({
        assignment: loweredAssignment,
        baselineAssignment: params.baselineAssignment,
        catalog: params.catalog,
      }),
      decisions: params.decisions,
      equipment: params.equipment,
      network: params.network,
      params: params.params,
      sortedSegments: params.sortedSegments,
    });

    audit.push({
      finalDiameter,
      loweredDiameter,
      reason: loweredEvaluation.feasible
        ? "Bajar un escalon conserva factibilidad; revisar busqueda."
        : auditReasonForInfeasibleEvaluation(loweredEvaluation),
      segmentId: domain.segmentId,
      status: loweredEvaluation.feasible ? "failed" : "passed",
    });
  }

  return audit.sort((first, second) =>
    first.segmentId.localeCompare(second.segmentId),
  );
}

function auditReasonForInfeasibleEvaluation(
  evaluation: InternalAssignmentEvaluation,
) {
  const issue = evaluation.issues[0];

  return issue
    ? `${issue.code}: ${issue.message}`
    : "La asignacion descendida deja de ser factible.";
}

function createMinimalityAuditIssues(
  audit: TechnicalTransitionAwareMinimalityAuditEntry[],
) {
  return audit
    .filter((entry) => entry.status === "failed")
    .map(
      (entry): TechnicalTransitionAwareNetworkSizingIssue => ({
        code: "minimality_audit_failed",
        data: {
          finalDiameterId: entry.finalDiameter.id,
          loweredDiameterId: entry.loweredDiameter?.id ?? null,
        },
        message: entry.reason,
        segmentId: entry.segmentId,
        severity: "error",
        status: "unresolved",
      }),
    );
}

function createNoFeasibleAssignmentResult(params: {
  baselineAssignment: Assignment;
  discardedStateCount: number;
  evaluatedStateCount: number;
  lastEvaluation: InternalAssignmentEvaluation | null;
  maxFrontierSize: number;
  params: {
    pipeSystem: PipeSystem;
  };
  searchLimit: number;
  sortedSegments: TechnicalSegmentResult[];
  theoreticalStateCount: number;
  trace: TechnicalTransitionAwareSearchTraceEntry[];
  variableSegmentIds: string[];
}): TechnicalTransitionAwareNetworkSizingResult {
  const fallbackEvaluation = params.lastEvaluation;
  const issue: TechnicalTransitionAwareNetworkSizingIssue = {
    code: "sizing_unresolved",
    message:
      "No se encontro una asignacion factible con transiciones sobre el baseline.",
    severity: "error",
    status: "unresolved",
  };
  const issues = dedupeIssues([issue, ...(fallbackEvaluation?.issues ?? [])]);

  return {
    additionalDiameterStepCost: null,
    baselineDiameterBySegmentId: assignmentToRecord(
      params.baselineAssignment,
      params.sortedSegments,
    ),
    discardedStateCount: params.discardedStateCount,
    evaluatedStateCount: params.evaluatedStateCount,
    finalDiameterBySegmentId: assignmentToRecord(
      params.baselineAssignment,
      params.sortedSegments,
    ),
    issueCount: issues.length,
    issues,
    maxFrontierSize: params.maxFrontierSize,
    minimalityAudit: [],
    pipeSystem: params.params.pipeSystem.identity,
    routeAccessoryResolutions:
      fallbackEvaluation?.routeAccessoryResolutions ?? {},
    routeTransitionResolutions:
      fallbackEvaluation?.routeTransitionResolutions ?? {},
    searchLimit: params.searchLimit,
    segments: fallbackEvaluation?.segments ?? [],
    status: issues.some((item) => item.status === "unsupported")
      ? "unsupported"
      : "incomplete",
    strategy: "uniform_cost_minimum_above_baseline_with_transition_rebuild",
    theoreticalStateCount: params.theoreticalStateCount,
    trace: params.trace,
    transitions: fallbackEvaluation?.transitions ?? [],
    variableSegmentIds: params.variableSegmentIds,
  };
}

function createSearchLimitResult(params: {
  baselineAssignment: Assignment;
  discardedStateCount: number;
  evaluatedStateCount: number;
  lastEvaluation: InternalAssignmentEvaluation | null;
  maxFrontierSize: number;
  params: {
    pipeSystem: PipeSystem;
  };
  searchLimit: number;
  sortedSegments: TechnicalSegmentResult[];
  theoreticalStateCount: number;
  trace: TechnicalTransitionAwareSearchTraceEntry[];
  variableSegmentIds: string[];
}): TechnicalTransitionAwareNetworkSizingResult {
  const issue: TechnicalTransitionAwareNetworkSizingIssue = {
    code: "transition_sizing_search_limit_reached",
    data: {
      evaluatedStateCount: params.evaluatedStateCount,
      searchLimit: params.searchLimit,
      theoreticalStateCount: params.theoreticalStateCount,
    },
    message:
      "La busqueda de dimensionado con transiciones alcanzo el limite de estados.",
    severity: "error",
    status: "unresolved",
  };
  const fallbackEvaluation = params.lastEvaluation;
  const issues = dedupeIssues([issue, ...(fallbackEvaluation?.issues ?? [])]);

  return {
    additionalDiameterStepCost: null,
    baselineDiameterBySegmentId: assignmentToRecord(
      params.baselineAssignment,
      params.sortedSegments,
    ),
    discardedStateCount: params.discardedStateCount,
    evaluatedStateCount: params.evaluatedStateCount,
    finalDiameterBySegmentId: assignmentToRecord(
      params.baselineAssignment,
      params.sortedSegments,
    ),
    issueCount: issues.length,
    issues,
    maxFrontierSize: params.maxFrontierSize,
    minimalityAudit: [],
    pipeSystem: params.params.pipeSystem.identity,
    routeAccessoryResolutions:
      fallbackEvaluation?.routeAccessoryResolutions ?? {},
    routeTransitionResolutions:
      fallbackEvaluation?.routeTransitionResolutions ?? {},
    searchLimit: params.searchLimit,
    segments: fallbackEvaluation?.segments ?? [],
    status: "incomplete",
    strategy: "uniform_cost_minimum_above_baseline_with_transition_rebuild",
    theoreticalStateCount: params.theoreticalStateCount,
    trace: params.trace,
    transitions: fallbackEvaluation?.transitions ?? [],
    variableSegmentIds: params.variableSegmentIds,
  };
}

function createUnresolvedTransitionAwareResult(params: {
  assignment: Record<string, PipeDiameterReference>;
  baselineDiameterBySegmentId: Record<string, PipeDiameterReference>;
  issue: TechnicalTransitionAwareNetworkSizingIssue;
  params: {
    pipeSystem: PipeSystem;
  };
  searchLimit: number;
  sortedSegments: TechnicalSegmentResult[];
  status: TechnicalTransitionAwareNetworkSizingStatus;
}): TechnicalTransitionAwareNetworkSizingResult {
  return {
    additionalDiameterStepCost: null,
    baselineDiameterBySegmentId: params.baselineDiameterBySegmentId,
    discardedStateCount: 0,
    evaluatedStateCount: 0,
    finalDiameterBySegmentId: params.assignment,
    issueCount: 1,
    issues: [params.issue],
    maxFrontierSize: 0,
    minimalityAudit: [],
    pipeSystem: params.params.pipeSystem.identity,
    routeAccessoryResolutions: {},
    routeTransitionResolutions: {},
    searchLimit: params.searchLimit,
    segments: params.sortedSegments.map((segment) =>
      failSegmentSizing({
        base: createBaseSegmentSizingResult({
          baselineDiameter:
            params.baselineDiameterBySegmentId[segment.segmentId] ?? null,
          currentDiameter: params.assignment[segment.segmentId] ?? null,
          governingRoute: segment.governingRoute,
          routeAccessoryResolution: null,
          routeTransitionResolution: null,
          segment,
        }),
        issue: {
          ...params.issue,
          segmentId: segment.segmentId,
        },
      }),
    ),
    status: params.status,
    strategy: "uniform_cost_minimum_above_baseline_with_transition_rebuild",
    theoreticalStateCount: 0,
    trace: [],
    transitions: [],
    variableSegmentIds: [],
  };
}

function createRouteAccessorySegmentContextBySegmentId(
  segments: TechnicalSegmentResult[],
) {
  const map = new Map<string, TechnicalRouteAccessorySegmentContext>();

  for (const segment of segments) {
    map.set(segment.segmentId, {
      accumulatedFlow: segment.accumulatedFlow,
      accumulatedFlowUnit: segment.accumulatedFlowUnit,
      drawingLength: segment.drawingLength,
      physicalLengthMeters: segment.segmentPhysicalLengthMeters,
    });
  }

  return map;
}

function calculateAssignmentCost(params: {
  assignment: Assignment;
  baselineAssignment: Assignment;
  catalog: DiameterCatalog;
}) {
  let cost = 0;

  for (const [segmentId, baselineDiameter] of params.baselineAssignment) {
    const diameter = params.assignment.get(segmentId);
    const index = diameter ? params.catalog.byId.get(diameter.id)?.index : null;
    const baselineIndex = params.catalog.byId.get(baselineDiameter.id)?.index;

    if (index === null || index === undefined || baselineIndex === undefined) {
      return null;
    }

    cost += index - baselineIndex;
  }

  return cost;
}

function compareEvaluations(
  first: InternalAssignmentEvaluation,
  second: InternalAssignmentEvaluation,
  sortedSegments: TechnicalSegmentResult[],
) {
  const firstCost = first.additionalDiameterStepCost ?? Number.POSITIVE_INFINITY;
  const secondCost = second.additionalDiameterStepCost ?? Number.POSITIVE_INFINITY;

  if (firstCost !== secondCost) {
    return firstCost - secondCost;
  }

  const firstVector = sortedSegments.map((segment) =>
    diameterSortValue(first.assignment[segment.segmentId] as PipeDiameterReference),
  );
  const secondVector = sortedSegments.map((segment) =>
    diameterSortValue(second.assignment[segment.segmentId] as PipeDiameterReference),
  );

  for (let index = 0; index < firstVector.length; index += 1) {
    const firstValue = firstVector[index] ?? 0;
    const secondValue = secondVector[index] ?? 0;

    if (firstValue !== secondValue) {
      return firstValue - secondValue;
    }
  }

  return 0;
}

function* enumerateDomainVectors(domains: SearchDomain[]) {
  function* visit(index: number, current: number[]): Generator<number[]> {
    if (index >= domains.length) {
      yield [...current];
      return;
    }

    const domain = domains[index] as SearchDomain;

    for (
      let catalogIndex = domain.baselineIndex;
      catalogIndex <= domain.maxIndex;
      catalogIndex += 1
    ) {
      current[index] = catalogIndex;
      yield* visit(index + 1, current);
    }
  }

  yield* visit(0, []);
}

function assignmentToRecord(
  assignment: Assignment,
  sortedSegments: TechnicalSegmentResult[],
) {
  return Object.fromEntries(
    sortedSegments.map((segment) => [
      segment.segmentId,
      assignment.get(segment.segmentId) as PipeDiameterReference,
    ]),
  );
}

function recordToAssignment(record: Record<string, PipeDiameterReference>) {
  return new Map(Object.entries(record));
}

function resolveTransitionAwareStatus(
  segments: TechnicalTransitionAwareNetworkSizingSegmentResult[],
  issues: TechnicalTransitionAwareNetworkSizingIssue[],
): TechnicalTransitionAwareNetworkSizingStatus {
  if (
    segments.some((segment) => segment.status === "unsupported") ||
    issues.some((issue) => issue.status === "unsupported")
  ) {
    return "unsupported";
  }

  if (
    segments.some((segment) => segment.status !== "resolved") ||
    issues.some((issue) => issue.severity === "error")
  ) {
    return "incomplete";
  }

  return "resolved";
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

function sortTechnicalRoutes(routes: TechnicalRoute[]) {
  return [...routes].sort((first, second) =>
    first.id.localeCompare(second.id),
  );
}

function finiteRecordNumber(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dedupeIssues(issues: TechnicalTransitionAwareNetworkSizingIssue[]) {
  const seen = new Set<string>();
  const next: TechnicalTransitionAwareNetworkSizingIssue[] = [];

  for (const issue of issues) {
    const key = [
      issue.code,
      issue.routeId ?? "",
      issue.segmentId ?? "",
      issue.transitionId ?? "",
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
