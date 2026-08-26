import type {
  DemandUnit,
} from "@/lib/equipment/types";
import type {
  PipeDiameterReference,
  PipeSegmentPipeContext,
  PipeSystem,
  PipeSystemResolution,
  PipeSystemResolutionStatus,
} from "@/lib/calculation/pipeSystem";
import type {
  RouteSegmentAccessory,
  RouteAccessoryEquivalentLengthSource,
  RouteAccessoryType,
  RouteSegment,
} from "@/lib/routing/types";

export type TechnicalRouteAccessoryRoute = {
  id: string;
  physicalLengthMeters: number | null;
  reason?: string;
  segmentIds: string[];
  status: "resolved" | "unresolved";
};

export type TechnicalRouteAccessorySegmentContext = {
  accumulatedFlow: number | null;
  accumulatedFlowUnit: DemandUnit | null;
  drawingLength: number;
  physicalLengthMeters: number | null;
};

export type TechnicalRouteAccessoryContribution = {
  accessoryId: string;
  catalogCode?: string;
  catalogFamilyId?: string;
  diameter: PipeDiameterReference | null;
  equivalentLengthMetersPerUnit: number | null;
  equivalentLengthResolution: PipeSystemResolution<number>;
  equivalentLengthSource: RouteAccessoryEquivalentLengthSource;
  ownerSegmentId: string;
  quantity: number;
  reason?: string;
  routeId: string;
  status: PipeSystemResolutionStatus;
  totalEquivalentLengthMeters: number | null;
  type: RouteAccessoryType;
};

export type TechnicalRouteAccessoryResolution = {
  contributions: TechnicalRouteAccessoryContribution[];
  duplicateAccessoryKeys: string[];
  governingRouteAccessoryEquivalentLengthMeters: number | null;
  reasons: string[];
  routeId: string;
  sizingLengthMeters: number | null;
  status: PipeSystemResolutionStatus;
};

export type DiameterBySegmentId =
  | Map<string, PipeDiameterReference | null | undefined>
  | Record<string, PipeDiameterReference | null | undefined>;

export type PipeContextBySegmentId =
  | Map<string, PipeSegmentPipeContext | undefined>
  | Record<string, PipeSegmentPipeContext | undefined>;

export type RouteAccessorySegmentContextBySegmentId =
  | Map<string, TechnicalRouteAccessorySegmentContext | undefined>
  | Record<string, TechnicalRouteAccessorySegmentContext | undefined>;

export function resolveTechnicalRouteAccessories(params: {
  diameterBySegmentId?: DiameterBySegmentId;
  pipeContextBySegmentId?: PipeContextBySegmentId;
  pipeSystem: PipeSystem;
  route: TechnicalRouteAccessoryRoute;
  segmentContextBySegmentId?: RouteAccessorySegmentContextBySegmentId;
  segments: RouteSegment[];
}): TechnicalRouteAccessoryResolution {
  const segmentsById = new Map(
    params.segments.map((segment) => [segment.id, segment]),
  );
  const duplicateAccessoryKeys: string[] = [];
  const contributions: TechnicalRouteAccessoryContribution[] = [];
  const reasons: string[] = [];
  const seenAccessoryKeys = new Set<string>();

  for (const segmentId of params.route.segmentIds) {
    const segment = segmentsById.get(segmentId);

    if (!segment) {
      addUniqueReason(reasons, `No se encontro el segmento ${segmentId}.`);
      continue;
    }

    for (const accessory of sortRouteAccessories(segment.accessories ?? [])) {
      const accessoryKey = `${segment.id}:${accessory.id}`;

      if (seenAccessoryKeys.has(accessoryKey)) {
        duplicateAccessoryKeys.push(accessoryKey);
        const reason = `Accesorio duplicado en el recorrido: ${accessoryKey}.`;
        addUniqueReason(reasons, reason);
        contributions.push({
          accessoryId: accessory.id,
          catalogCode: accessory.catalogCode,
          catalogFamilyId: accessory.catalogFamilyId,
          diameter: resolveDiameter(params.diameterBySegmentId, segment.id),
          equivalentLengthMetersPerUnit: null,
          equivalentLengthResolution: {
            reason,
            status: "unresolved",
          },
          equivalentLengthSource: accessory.equivalentLengthSource,
          ownerSegmentId: segment.id,
          quantity: normalizeAccessoryQuantity(accessory.quantity),
          reason,
          routeId: params.route.id,
          status: "unresolved",
          totalEquivalentLengthMeters: null,
          type: accessory.type,
        });
        continue;
      }

      seenAccessoryKeys.add(accessoryKey);

      const contribution = createAccessoryContribution({
        accessory,
        diameter: resolveDiameter(params.diameterBySegmentId, segment.id),
        pipeContext: resolvePipeContext({
          diameterBySegmentId: params.diameterBySegmentId,
          pipeContextBySegmentId: params.pipeContextBySegmentId,
          segmentId: segment.id,
        }),
        pipeSystem: params.pipeSystem,
        routeId: params.route.id,
        segment,
        segmentContext: resolveSegmentContext(
          params.segmentContextBySegmentId,
          segment.id,
        ),
      });

      if (contribution.status !== "resolved" && contribution.reason) {
        addUniqueReason(reasons, contribution.reason);
      }

      contributions.push(contribution);
    }
  }

  if (params.route.status !== "resolved" || params.route.physicalLengthMeters === null) {
    addUniqueReason(
      reasons,
      params.route.reason ?? "Falta longitud fisica del recorrido.",
    );
  }

  const status = resolveOverallStatus(contributions, reasons);
  const governingRouteAccessoryEquivalentLengthMeters =
    status === "resolved"
      ? contributions.reduce(
          (sum, contribution) =>
            sum + (contribution.totalEquivalentLengthMeters ?? 0),
          0,
        )
      : null;
  const sizingLengthMeters =
    status === "resolved" &&
    params.route.physicalLengthMeters !== null &&
    governingRouteAccessoryEquivalentLengthMeters !== null
      ? params.route.physicalLengthMeters +
        governingRouteAccessoryEquivalentLengthMeters
      : null;

  return {
    contributions,
    duplicateAccessoryKeys: duplicateAccessoryKeys.sort(),
    governingRouteAccessoryEquivalentLengthMeters,
    reasons,
    routeId: params.route.id,
    sizingLengthMeters,
    status,
  };
}

function createAccessoryContribution(params: {
  accessory: RouteSegmentAccessory;
  diameter: PipeDiameterReference | null;
  pipeContext: PipeSegmentPipeContext | undefined;
  pipeSystem: PipeSystem;
  routeId: string;
  segment: RouteSegment;
  segmentContext: TechnicalRouteAccessorySegmentContext;
}): TechnicalRouteAccessoryContribution {
  const quantity = normalizeAccessoryQuantity(params.accessory.quantity);
  const equivalentLengthResolution = resolveContributionEquivalentLength({
    accessory: params.accessory,
    diameter: params.diameter,
    pipeContext: params.pipeContext,
    pipeSystem: params.pipeSystem,
    segment: params.segment,
    segmentContext: params.segmentContext,
  });
  const equivalentLengthMetersPerUnit =
    equivalentLengthResolution.status === "resolved"
      ? equivalentLengthResolution.value
      : null;
  const reason =
    equivalentLengthResolution.status === "resolved"
      ? undefined
      : equivalentLengthResolution.reason;

  return {
    accessoryId: params.accessory.id,
    catalogCode: params.accessory.catalogCode,
    catalogFamilyId: params.accessory.catalogFamilyId,
    diameter: params.diameter,
    equivalentLengthMetersPerUnit,
    equivalentLengthResolution,
    equivalentLengthSource: params.accessory.equivalentLengthSource,
    ownerSegmentId: params.segment.id,
    quantity,
    reason,
    routeId: params.routeId,
    status: equivalentLengthResolution.status,
    totalEquivalentLengthMeters:
      equivalentLengthMetersPerUnit === null
        ? null
        : equivalentLengthMetersPerUnit * quantity,
    type: params.accessory.type,
  };
}

function resolveContributionEquivalentLength(params: {
  accessory: RouteSegmentAccessory;
  diameter: PipeDiameterReference | null;
  pipeContext: PipeSegmentPipeContext | undefined;
  pipeSystem: PipeSystem;
  segment: RouteSegment;
  segmentContext: TechnicalRouteAccessorySegmentContext;
}): PipeSystemResolution<number> {
  if (params.accessory.equivalentLengthSource === "manual") {
    const value = normalizeEquivalentLengthMetersPerUnit(
      params.accessory.equivalentLengthMetersPerUnit,
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

  if (params.accessory.equivalentLengthSource === "pipe_system") {
    if (!params.diameter) {
      return {
        data: {
          accessoryId: params.accessory.id,
          segmentId: params.segment.id,
        },
        reason:
          "Falta diametro del segmento para resolver el accesorio por PipeSystem.",
        status: "unresolved",
      };
    }

    return sanitizeEquivalentLengthResolution(
      params.pipeSystem.resolveAccessoryEquivalentLength({
        accessory: {
          catalogCode: params.accessory.catalogCode,
          catalogFamilyId: params.accessory.catalogFamilyId,
          id: params.accessory.id,
          quantity: normalizeAccessoryQuantity(params.accessory.quantity),
          type: params.accessory.type,
        },
        pipe: params.pipeContext,
        segment: {
          accumulatedFlow: params.segmentContext.accumulatedFlow,
          accumulatedFlowUnit: params.segmentContext.accumulatedFlowUnit,
          drawingLength: params.segmentContext.drawingLength,
          id: params.segment.id,
          physicalLengthMeters: params.segmentContext.physicalLengthMeters,
        },
      }),
    );
  }

  return {
    reason: "Longitud equivalente pendiente de resolver.",
    status: "unresolved",
  };
}

function resolvePipeContext(params: {
  diameterBySegmentId: DiameterBySegmentId | undefined;
  pipeContextBySegmentId: PipeContextBySegmentId | undefined;
  segmentId: string;
}) {
  const pipeContext = getFromIndex(params.pipeContextBySegmentId, params.segmentId);
  const diameter =
    getFromIndex(params.diameterBySegmentId, params.segmentId) ??
    pipeContext?.diameter ??
    null;

  if (!pipeContext && !diameter) {
    return undefined;
  }

  return {
    ...(pipeContext ?? {}),
    ...(diameter ? { diameter } : {}),
  };
}

function resolveDiameter(
  diameterBySegmentId: DiameterBySegmentId | undefined,
  segmentId: string,
) {
  return getFromIndex(diameterBySegmentId, segmentId) ?? null;
}

function resolveSegmentContext(
  segmentContextBySegmentId:
    | RouteAccessorySegmentContextBySegmentId
    | undefined,
  segmentId: string,
): TechnicalRouteAccessorySegmentContext {
  return (
    getFromIndex(segmentContextBySegmentId, segmentId) ?? {
      accumulatedFlow: null,
      accumulatedFlowUnit: null,
      drawingLength: 0,
      physicalLengthMeters: null,
    }
  );
}

function getFromIndex<T>(
  index: Map<string, T> | Record<string, T> | undefined,
  key: string,
) {
  if (!index) {
    return undefined;
  }

  return index instanceof Map ? index.get(key) : index[key];
}

function resolveOverallStatus(
  contributions: TechnicalRouteAccessoryContribution[],
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

function sortRouteAccessories(accessories: NonNullable<RouteSegment["accessories"]>) {
  return [...accessories].sort(
    (first, second) =>
      first.id.localeCompare(second.id) ||
      first.type.localeCompare(second.type) ||
      (first.catalogCode ?? "").localeCompare(second.catalogCode ?? ""),
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

function addUniqueReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}
