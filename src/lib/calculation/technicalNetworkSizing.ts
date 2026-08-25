import {
  type PipeDiameterReference,
  type PipeSegmentPipeContext,
  type PipeSegmentSizingResult,
  type PipeSystem,
  type PipeSystemIdentity,
  type PipeSystemResolutionStatus,
} from "@/lib/calculation/pipeSystem";
import {
  resolveTechnicalRouteAccessories,
  type TechnicalRouteAccessoryResolution,
  type TechnicalRouteAccessorySegmentContext,
} from "@/lib/calculation/technicalRouteAccessories";
import type { DemandUnit } from "@/lib/equipment/types";
import type { RouteSegment } from "@/lib/routing/types";
import type {
  TechnicalRoute,
  TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";

export type TechnicalNetworkSizingStatus =
  | "resolved"
  | "incomplete"
  | "unsupported";

export type TechnicalNetworkSizingIssueCode =
  | "available_diameters_unresolved"
  | "available_diameter_unusable"
  | "duplicate_available_diameter"
  | "missing_current_diameter"
  | "missing_governing_route"
  | "route_accessories_unresolved"
  | "missing_flow"
  | "missing_flow_unit"
  | "sizing_unresolved"
  | "required_diameter_not_in_catalog"
  | "final_assignment_insufficient"
  | "sizing_length_mismatch"
  | "depends_on_unresolved_segment_diameter"
  | "iteration_limit_exceeded"
  | "alternate_route_has_greater_sizing_length";

export type TechnicalNetworkSizingIssue = {
  code: TechnicalNetworkSizingIssueCode;
  data?: Record<string, unknown>;
  message: string;
  routeId?: string;
  segmentId?: string;
  severity: "error" | "warning";
  status?: Exclude<PipeSystemResolutionStatus, "resolved">;
};

export type TechnicalNetworkSizingDiameterChange = {
  fromDiameter: PipeDiameterReference;
  pass: number;
  reason: string;
  requiredDiameter: PipeDiameterReference;
  segmentId: string;
  sizingLengthMeters: number | null;
  toDiameter: PipeDiameterReference;
};

export type TechnicalNetworkSizingTracePass = {
  assignment: Record<string, PipeDiameterReference>;
  diameterChanges: TechnicalNetworkSizingDiameterChange[];
  pass: number;
};

export type TechnicalNetworkSizingSegmentResult = {
  accumulatedFlow: number | null;
  accumulatedFlowUnit: DemandUnit | null;
  calculatedDiameter: PipeDiameterReference | null;
  explanation: string | null;
  governingRouteAccessoryEquivalentLengthMeters: number | null;
  governingRouteId: string | null;
  governingRoutePhysicalLengthMeters: number | null;
  governingTerminalEquipmentId: string | null;
  internalDiameterMillimeters: number | null;
  issues: TechnicalNetworkSizingIssue[];
  requiredDiameter: PipeDiameterReference | null;
  routeAccessoryResolutionId: string | null;
  segmentId: string;
  sizingLengthMeters: number | null;
  sizingResult: PipeSegmentSizingResult | null;
  status: PipeSystemResolutionStatus;
  tabulatedCapacityM3h: number | null;
  tabulatedLengthMeters: number | null;
};

export type TechnicalNetworkSizingResult = {
  finalDiameterBySegmentId: Record<string, PipeDiameterReference>;
  issueCount: number;
  issues: TechnicalNetworkSizingIssue[];
  maxPassCount: number;
  passCount: number;
  pipeSystem: PipeSystemIdentity;
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  segments: TechnicalNetworkSizingSegmentResult[];
  status: TechnicalNetworkSizingStatus;
  strategy: "monotonic_synchronous_escalation";
  trace: TechnicalNetworkSizingTracePass[];
};

type DiameterCatalog = {
  byId: Map<string, { diameter: PipeDiameterReference; index: number }>;
  diameters: PipeDiameterReference[];
};

type Assignment = Map<string, PipeDiameterReference>;

type AssignmentEvaluation = {
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  segments: TechnicalNetworkSizingSegmentResult[];
};

const SIZING_EPSILON = 0.000001;

export function solveTechnicalNetworkSizing(params: {
  pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
  pipeSystem: PipeSystem;
  routeSegments: RouteSegment[];
  routes: TechnicalRoute[];
  segments: TechnicalSegmentResult[];
}): TechnicalNetworkSizingResult {
  const sortedSegments = sortTechnicalSegments(params.segments);
  const maxPassCount = 1;
  const availableDiametersResolution = params.pipeSystem.getAvailableDiameters();

  if (availableDiametersResolution.status !== "resolved") {
    return createUnresolvedNetworkSizingResult({
      issue: {
        code: "available_diameters_unresolved",
        data: availableDiametersResolution.data,
        message: availableDiametersResolution.reason,
        severity: "error",
        status: availableDiametersResolution.status,
      },
      maxPassCount,
      pipeSystem: params.pipeSystem.identity,
      segments: sortedSegments,
    });
  }

  const catalogResolution = createDiameterCatalog(
    availableDiametersResolution.value,
  );

  if (catalogResolution.status !== "resolved") {
    return createUnresolvedNetworkSizingResult({
      issue: catalogResolution.issue,
      maxPassCount,
      pipeSystem: params.pipeSystem.identity,
      segments: sortedSegments,
    });
  }

  const catalog = catalogResolution.catalog;
  const derivedMaxPassCount =
    sortedSegments.length * (catalog.diameters.length - 1) + 1;
  let currentAssignment = createInitialAssignment(sortedSegments, catalog);
  const trace: TechnicalNetworkSizingTracePass[] = [];

  for (let pass = 0; pass < derivedMaxPassCount; pass += 1) {
    const evaluation = evaluateAssignment({
      assignment: currentAssignment,
      catalog,
      params,
      sortedSegments,
    });
    const diameterChanges = createDiameterChanges({
      assignment: currentAssignment,
      catalog,
      pass,
      segmentResults: evaluation.segments,
      sortedSegments,
    });

    trace.push({
      assignment: assignmentToRecord(currentAssignment, sortedSegments),
      diameterChanges,
      pass,
    });

    if (diameterChanges.length === 0) {
      const finalEvaluation = evaluateAssignment({
        assignment: currentAssignment,
        catalog,
        params,
        sortedSegments,
      });

      return createResolvedNetworkSizingResult({
        assignment: currentAssignment,
        catalog,
        finalEvaluation,
        maxPassCount: derivedMaxPassCount,
        params,
        sortedSegments,
        trace,
      });
    }

    currentAssignment = applyDiameterChanges(
      currentAssignment,
      diameterChanges,
    );
  }

  return createIterationLimitResult({
    assignment: currentAssignment,
    catalog,
    maxPassCount: derivedMaxPassCount,
    params,
    sortedSegments,
    trace,
  });
}

function createDiameterCatalog(
  diameters: PipeDiameterReference[],
):
  | { catalog: DiameterCatalog; status: "resolved" }
  | {
      issue: TechnicalNetworkSizingIssue;
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

function evaluateAssignment(params: {
  assignment: Assignment;
  catalog: DiameterCatalog;
  params: {
    pipeContextBySegmentId?: Record<string, PipeSegmentPipeContext | undefined>;
    pipeSystem: PipeSystem;
    routeSegments: RouteSegment[];
    routes: TechnicalRoute[];
  };
  sortedSegments: TechnicalSegmentResult[];
}): AssignmentEvaluation {
  const routeAccessoryResolutions = createRouteAccessoryResolutions({
    assignment: params.assignment,
    params: params.params,
    sortedSegments: params.sortedSegments,
  });

  return {
    routeAccessoryResolutions,
    segments: params.sortedSegments.map((segment) =>
      evaluateSegmentAssignment({
        assignment: params.assignment,
        catalog: params.catalog,
        pipeContextBySegmentId: params.params.pipeContextBySegmentId,
        pipeSystem: params.params.pipeSystem,
        routeAccessoryResolutions,
        segment,
      }),
    ),
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

function evaluateSegmentAssignment(params: {
  assignment: Assignment;
  catalog: DiameterCatalog;
  pipeContextBySegmentId:
    | Record<string, PipeSegmentPipeContext | undefined>
    | undefined;
  pipeSystem: PipeSystem;
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  segment: TechnicalSegmentResult;
}): TechnicalNetworkSizingSegmentResult {
  const currentDiameter = params.assignment.get(params.segment.segmentId) ?? null;
  const governingRoute = params.segment.governingRoute;
  const routeAccessoryResolution = governingRoute
    ? params.routeAccessoryResolutions[governingRoute.routeId] ?? null
    : null;
  const base = createBaseSegmentSizingResult({
    currentDiameter,
    governingRoute,
    routeAccessoryResolution,
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

  if (routeAccessoryResolution.sizingLengthMeters === null) {
    return failSegmentSizing({
      base,
      issue: {
        code: "sizing_unresolved",
        message: "Falta longitud de dimensionado del recorrido.",
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
    calculationLengthMeters: routeAccessoryResolution.sizingLengthMeters,
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

  return {
    ...base,
    calculatedDiameter: currentDiameter,
    explanation: sizingResolution.value.explanation,
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
  };
}

function createBaseSegmentSizingResult(params: {
  currentDiameter: PipeDiameterReference | null;
  governingRoute: TechnicalSegmentResult["governingRoute"];
  routeAccessoryResolution: TechnicalRouteAccessoryResolution | null;
  segment: TechnicalSegmentResult;
}): TechnicalNetworkSizingSegmentResult {
  return {
    accumulatedFlow: params.segment.accumulatedFlow,
    accumulatedFlowUnit: params.segment.accumulatedFlowUnit,
    calculatedDiameter: params.currentDiameter,
    explanation: null,
    governingRouteAccessoryEquivalentLengthMeters:
      params.routeAccessoryResolution
        ?.governingRouteAccessoryEquivalentLengthMeters ?? null,
    governingRouteId: params.governingRoute?.routeId ?? null,
    governingRoutePhysicalLengthMeters:
      params.governingRoute?.physicalLengthMeters ?? null,
    governingTerminalEquipmentId:
      params.governingRoute?.terminalEquipmentId ?? null,
    internalDiameterMillimeters:
      params.currentDiameter?.internalDiameterMillimeters ?? null,
    issues: [],
    requiredDiameter: null,
    routeAccessoryResolutionId: params.routeAccessoryResolution?.routeId ?? null,
    segmentId: params.segment.segmentId,
    sizingLengthMeters: params.routeAccessoryResolution?.sizingLengthMeters ?? null,
    sizingResult: null,
    status: "unresolved",
    tabulatedCapacityM3h: null,
    tabulatedLengthMeters: null,
  };
}

function failSegmentSizing(params: {
  base: TechnicalNetworkSizingSegmentResult;
  issue: TechnicalNetworkSizingIssue;
}): TechnicalNetworkSizingSegmentResult {
  return {
    ...params.base,
    explanation: params.issue.message,
    issues: [params.issue],
    status: params.issue.status ?? "unresolved",
  };
}

function createDiameterChanges(params: {
  assignment: Assignment;
  catalog: DiameterCatalog;
  pass: number;
  segmentResults: TechnicalNetworkSizingSegmentResult[];
  sortedSegments: TechnicalSegmentResult[];
}) {
  const changes: TechnicalNetworkSizingDiameterChange[] = [];
  const sourceSegmentById = new Map(
    params.sortedSegments.map((segment) => [segment.segmentId, segment]),
  );

  for (const result of params.segmentResults) {
    if (result.status !== "resolved" || !result.requiredDiameter) {
      const fallbackChange = createFallbackDiameterChange({
        assignment: params.assignment,
        catalog: params.catalog,
        pass: params.pass,
        result,
        sourceSegment: sourceSegmentById.get(result.segmentId) ?? null,
      });

      if (fallbackChange) {
        changes.push(fallbackChange);
      }

      continue;
    }

    const currentDiameter =
      params.assignment.get(result.segmentId) ?? result.calculatedDiameter;
    const currentIndex = currentDiameter
      ? params.catalog.byId.get(currentDiameter.id)?.index
      : undefined;
    const requiredIndex = params.catalog.byId.get(
      result.requiredDiameter.id,
    )?.index;

    if (
      !currentDiameter ||
      currentIndex === undefined ||
      requiredIndex === undefined ||
      requiredIndex <= currentIndex
    ) {
      continue;
    }

    changes.push({
      fromDiameter: currentDiameter,
      pass: params.pass,
      reason:
        `Requiere ${result.requiredDiameter.label} con ` +
        `${formatTraceMeters(result.sizingLengthMeters)} y ` +
        `${formatTraceFlow(result.accumulatedFlow, result.accumulatedFlowUnit)}.`,
      requiredDiameter: result.requiredDiameter,
      segmentId: result.segmentId,
      sizingLengthMeters: result.sizingLengthMeters,
      toDiameter: result.requiredDiameter,
    });
  }

  return changes.sort((first, second) =>
    first.segmentId.localeCompare(second.segmentId),
  );
}

function createFallbackDiameterChange(params: {
  assignment: Assignment;
  catalog: DiameterCatalog;
  pass: number;
  result: TechnicalNetworkSizingSegmentResult;
  sourceSegment: TechnicalSegmentResult | null;
}) {
  if (params.sourceSegment?.dimensioningResolution.status !== "resolved") {
    return null;
  }

  if (
    !params.result.issues.some(
      (issue) => issue.code === "route_accessories_unresolved",
    )
  ) {
    return null;
  }

  const fallbackDiameter =
    params.sourceSegment.dimensioningResolution.value.calculatedDiameter;
  const currentDiameter =
    params.assignment.get(params.result.segmentId) ??
    params.result.calculatedDiameter;
  const currentIndex = currentDiameter
    ? params.catalog.byId.get(currentDiameter.id)?.index
    : undefined;
  const fallbackIndex = params.catalog.byId.get(fallbackDiameter.id)?.index;

  if (
    !currentDiameter ||
    currentIndex === undefined ||
    fallbackIndex === undefined ||
    fallbackIndex <= currentIndex
  ) {
    return null;
  }

  return {
    fromDiameter: currentDiameter,
    pass: params.pass,
    reason:
      `Usa ${fallbackDiameter.label} como primer candidato resoluble ` +
      "para evaluar accesorios del recorrido.",
    requiredDiameter: fallbackDiameter,
    segmentId: params.result.segmentId,
    sizingLengthMeters: params.result.sizingLengthMeters,
    toDiameter: fallbackDiameter,
  };
}

function createResolvedNetworkSizingResult(params: {
  assignment: Assignment;
  catalog: DiameterCatalog;
  finalEvaluation: AssignmentEvaluation;
  maxPassCount: number;
  params: {
    pipeSystem: PipeSystem;
    routes: TechnicalRoute[];
  };
  sortedSegments: TechnicalSegmentResult[];
  trace: TechnicalNetworkSizingTracePass[];
}): TechnicalNetworkSizingResult {
  const dependencyAdjustedSegments = applyFinalDependencyValidation({
    routeAccessoryResolutions: params.finalEvaluation.routeAccessoryResolutions,
    segmentResults: params.finalEvaluation.segments,
  });
  const issues = [
    ...dependencyAdjustedSegments.flatMap((segment) => segment.issues),
    ...createFinalValidationIssues({
      catalog: params.catalog,
      routeAccessoryResolutions: params.finalEvaluation.routeAccessoryResolutions,
      segmentResults: dependencyAdjustedSegments,
    }),
    ...createAlternateRouteIssues({
      routeAccessoryResolutions: params.finalEvaluation.routeAccessoryResolutions,
      routes: params.params.routes,
      segmentResults: dependencyAdjustedSegments,
      sortedSegments: params.sortedSegments,
    }),
  ];

  return {
    finalDiameterBySegmentId: assignmentToRecord(
      params.assignment,
      params.sortedSegments,
    ),
    issueCount: issues.length,
    issues,
    maxPassCount: params.maxPassCount,
    passCount: params.trace.length,
    pipeSystem: params.params.pipeSystem.identity,
    routeAccessoryResolutions: params.finalEvaluation.routeAccessoryResolutions,
    segments: dependencyAdjustedSegments,
    status: resolveNetworkStatus(dependencyAdjustedSegments, issues),
    strategy: "monotonic_synchronous_escalation",
    trace: params.trace,
  };
}

function applyFinalDependencyValidation(params: {
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  segmentResults: TechnicalNetworkSizingSegmentResult[];
}) {
  const baseStatusBySegmentId = new Map(
    params.segmentResults.map((segment) => [segment.segmentId, segment.status]),
  );

  return params.segmentResults.map((segment) => {
    if (segment.status !== "resolved" || !segment.routeAccessoryResolutionId) {
      return segment;
    }

    const routeAccessoryResolution =
      params.routeAccessoryResolutions[segment.routeAccessoryResolutionId] ??
      null;
    const unresolvedDependencyIds = [
      ...new Set(
        routeAccessoryResolution?.contributions
          .filter(
            (contribution) =>
              contribution.equivalentLengthSource === "pipe_system" &&
              baseStatusBySegmentId.get(contribution.ownerSegmentId) !==
                "resolved",
          )
          .map((contribution) => contribution.ownerSegmentId) ?? [],
      ),
    ];

    if (unresolvedDependencyIds.length > 0) {
      return addSegmentIssue(segment, {
        code: "depends_on_unresolved_segment_diameter",
        data: { dependencySegmentIds: unresolvedDependencyIds },
        message:
          "El recorrido depende de un diametro de segmento que no quedo tecnicamente resuelto.",
        routeId: segment.routeAccessoryResolutionId,
        segmentId: segment.segmentId,
        severity: "error",
        status: "unresolved",
      });
    }

    return segment;
  });
}

function createFinalValidationIssues(params: {
  catalog: DiameterCatalog;
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  segmentResults: TechnicalNetworkSizingSegmentResult[];
}) {
  const issues: TechnicalNetworkSizingIssue[] = [];

  for (const segment of params.segmentResults) {
    if (
      segment.status !== "resolved" ||
      !segment.calculatedDiameter ||
      !segment.requiredDiameter
    ) {
      continue;
    }

    const assignedIndex = params.catalog.byId.get(
      segment.calculatedDiameter.id,
    )?.index;
    const requiredIndex = params.catalog.byId.get(
      segment.requiredDiameter.id,
    )?.index;

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

    const routeAccessoryResolution = segment.routeAccessoryResolutionId
      ? params.routeAccessoryResolutions[segment.routeAccessoryResolutionId]
      : null;

    if (
      routeAccessoryResolution &&
      routeAccessoryResolution.governingRouteAccessoryEquivalentLengthMeters !==
        null &&
      segment.governingRoutePhysicalLengthMeters !== null &&
      routeAccessoryResolution.sizingLengthMeters !== null
    ) {
      const expected =
        segment.governingRoutePhysicalLengthMeters +
        routeAccessoryResolution.governingRouteAccessoryEquivalentLengthMeters;

      if (
        Math.abs(expected - routeAccessoryResolution.sizingLengthMeters) >
        SIZING_EPSILON
      ) {
        issues.push({
          code: "sizing_length_mismatch",
          message:
            "La longitud de dimensionado no coincide con recorrido fisico mas accesorios.",
          routeId: routeAccessoryResolution.routeId,
          segmentId: segment.segmentId,
          severity: "error",
          status: "unresolved",
        });
      }
    }
  }

  return issues;
}

function createAlternateRouteIssues(params: {
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  routes: TechnicalRoute[];
  segmentResults: TechnicalNetworkSizingSegmentResult[];
  sortedSegments: TechnicalSegmentResult[];
}) {
  const issues: TechnicalNetworkSizingIssue[] = [];
  const routesBySegmentId = new Map<string, TechnicalRoute[]>();

  for (const route of params.routes) {
    for (const segmentId of route.segmentIds) {
      const routes = routesBySegmentId.get(segmentId) ?? [];
      routes.push(route);
      routesBySegmentId.set(segmentId, routes);
    }
  }

  for (const segment of params.sortedSegments) {
    const selectedRouteId = segment.governingRoute?.routeId ?? null;
    const selectedResolution = selectedRouteId
      ? params.routeAccessoryResolutions[selectedRouteId]
      : null;
    const selectedSizingLength = selectedResolution?.sizingLengthMeters ?? null;

    if (!selectedRouteId || selectedSizingLength === null) {
      continue;
    }

    for (const alternateRoute of routesBySegmentId.get(segment.segmentId) ?? []) {
      if (alternateRoute.id === selectedRouteId) {
        continue;
      }

      const alternateResolution =
        params.routeAccessoryResolutions[alternateRoute.id] ?? null;

      if (
        alternateResolution?.sizingLengthMeters !== null &&
        alternateResolution?.sizingLengthMeters !== undefined &&
        alternateResolution.sizingLengthMeters >
          selectedSizingLength + SIZING_EPSILON
      ) {
        issues.push({
          code: "alternate_route_has_greater_sizing_length",
          data: {
            alternateRouteId: alternateRoute.id,
            alternateSizingLengthMeters:
              alternateResolution.sizingLengthMeters,
            selectedRouteId,
            selectedSizingLengthMeters: selectedSizingLength,
          },
          message:
            "Un recorrido alternativo tiene mayor longitud de dimensionado que el gobernante fisico.",
          routeId: alternateRoute.id,
          segmentId: segment.segmentId,
          severity: "warning",
        });
      }
    }
  }

  return issues;
}

function createIterationLimitResult(params: {
  assignment: Assignment;
  catalog: DiameterCatalog;
  maxPassCount: number;
  params: {
    pipeSystem: PipeSystem;
    routeSegments: RouteSegment[];
    routes: TechnicalRoute[];
  };
  sortedSegments: TechnicalSegmentResult[];
  trace: TechnicalNetworkSizingTracePass[];
}): TechnicalNetworkSizingResult {
  const evaluation = evaluateAssignment({
    assignment: params.assignment,
    catalog: params.catalog,
    params: params.params,
    sortedSegments: params.sortedSegments,
  });
  const issue: TechnicalNetworkSizingIssue = {
    code: "iteration_limit_exceeded",
    data: { maxPassCount: params.maxPassCount },
    message: "El solver supero el limite matematico de pasadas.",
    severity: "error",
    status: "unresolved",
  };
  const issues = [issue, ...evaluation.segments.flatMap((segment) => segment.issues)];

  return {
    finalDiameterBySegmentId: assignmentToRecord(
      params.assignment,
      params.sortedSegments,
    ),
    issueCount: issues.length,
    issues,
    maxPassCount: params.maxPassCount,
    passCount: params.trace.length,
    pipeSystem: params.params.pipeSystem.identity,
    routeAccessoryResolutions: evaluation.routeAccessoryResolutions,
    segments: evaluation.segments,
    status: "incomplete",
    strategy: "monotonic_synchronous_escalation",
    trace: params.trace,
  };
}

function createUnresolvedNetworkSizingResult(params: {
  issue: TechnicalNetworkSizingIssue;
  maxPassCount: number;
  pipeSystem: PipeSystemIdentity;
  segments: TechnicalSegmentResult[];
}): TechnicalNetworkSizingResult {
  const segmentResults = params.segments.map((segment) =>
    failSegmentSizing({
      base: createBaseSegmentSizingResult({
        currentDiameter: null,
        governingRoute: segment.governingRoute,
        routeAccessoryResolution: null,
        segment,
      }),
      issue: {
        ...params.issue,
        segmentId: segment.segmentId,
      },
    }),
  );

  return {
    finalDiameterBySegmentId: {},
    issueCount: segmentResults.length,
    issues: segmentResults.flatMap((segment) => segment.issues),
    maxPassCount: params.maxPassCount,
    passCount: 0,
    pipeSystem: params.pipeSystem,
    routeAccessoryResolutions: {},
    segments: segmentResults,
    status: params.issue.status === "unsupported" ? "unsupported" : "incomplete",
    strategy: "monotonic_synchronous_escalation",
    trace: [],
  };
}

function createInitialAssignment(
  segments: TechnicalSegmentResult[],
  catalog: DiameterCatalog,
) {
  const smallestDiameter = catalog.diameters[0] as PipeDiameterReference;
  const assignment = new Map<string, PipeDiameterReference>();

  for (const segment of segments) {
    assignment.set(segment.segmentId, smallestDiameter);
  }

  return assignment;
}

function applyDiameterChanges(
  assignment: Assignment,
  changes: TechnicalNetworkSizingDiameterChange[],
) {
  const next = new Map(assignment);

  for (const change of changes) {
    next.set(change.segmentId, change.toDiameter);
  }

  return next;
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

function addSegmentIssue(
  segment: TechnicalNetworkSizingSegmentResult,
  issue: TechnicalNetworkSizingIssue,
) {
  return {
    ...segment,
    issues: [...segment.issues, issue],
    status: issue.status ?? segment.status,
  };
}

function resolveNetworkStatus(
  segments: TechnicalNetworkSizingSegmentResult[],
  issues: TechnicalNetworkSizingIssue[],
): TechnicalNetworkSizingStatus {
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
  return [...segments].sort((first, second) =>
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

function formatTraceMeters(value: number | null) {
  return value === null ? "longitud pendiente" : `${value.toFixed(3)} m`;
}

function formatTraceFlow(value: number | null, unit: DemandUnit | null) {
  return value === null || !unit ? "caudal pendiente" : `${value} ${unit}`;
}
