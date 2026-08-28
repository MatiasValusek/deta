import type {
  PipeDiameterReference,
  PipeSystem,
  PipeSystemResolutionStatus,
  PipeSegmentSizingResult,
} from "@/lib/calculation/pipeSystem";
import type {
  TechnicalCalculationResult,
  TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";
import type {
  TechnicalPhysicalAccessory,
  TechnicalPhysicalAccessoryInventory,
  TechnicalPhysicalAccessoryRouteUse,
} from "@/lib/calculation/technicalPhysicalAccessories";

export type TechnicalEquivalentAccessoryRouteUseItem = {
  accessoryId: string;
  equivalentLengthMeters: number | null;
  item: TechnicalPhysicalAccessory;
  routeUse: TechnicalPhysicalAccessoryRouteUse;
};

export type TechnicalEquivalentAccessorySegmentVerification = {
  calculationLengthMeters: number | null;
  equivalentAccessoryLengthMeters: number | null;
  explanation: string | null;
  governingRouteId: string | null;
  reason: string | null;
  requiredDiameter: PipeDiameterReference | null;
  segmentId: string;
  sizingResult: PipeSegmentSizingResult | null;
  status: PipeSystemResolutionStatus;
  tabulatedCapacityM3h: number | null;
  tabulatedLengthMeters: number | null;
  totalCalculationLengthMeters: number | null;
  uses: TechnicalEquivalentAccessoryRouteUseItem[];
};

export function createTechnicalEquivalentAccessoryVerification(params: {
  inventory: TechnicalPhysicalAccessoryInventory;
  pipeSystem: PipeSystem;
  result: TechnicalCalculationResult | null;
}): Record<string, TechnicalEquivalentAccessorySegmentVerification> {
  if (!params.result) {
    return {};
  }

  return Object.fromEntries(
    params.result.segments.map((segment) => [
      segment.segmentId,
      verifySegmentEquivalentAccessories({
        inventory: params.inventory,
        pipeSystem: params.pipeSystem,
        segment,
      }),
    ]),
  );
}

function verifySegmentEquivalentAccessories(params: {
  inventory: TechnicalPhysicalAccessoryInventory;
  pipeSystem: PipeSystem;
  segment: TechnicalSegmentResult;
}): TechnicalEquivalentAccessorySegmentVerification {
  const routeResolution = params.segment.governingRouteResolution;
  const governingRoute =
    routeResolution.status === "resolved" ? routeResolution.value : null;
  const governingRouteId = governingRoute?.routeId ?? null;
  const calculationLengthMeters =
    governingRoute?.physicalLengthMeters ??
    params.segment.routeSizingBasis.governingRoutePhysicalLengthMeters ??
    params.segment.governingRoutePhysicalLengthMeters ??
    params.segment.calculationLengthMeters ??
    params.segment.routeSizingBasis.sizingLengthMeters;
  const uses = governingRouteId
    ? equivalentAccessoryUsesForRoute(params.inventory, governingRouteId)
    : [];
  const pendingItems = governingRouteId
    ? params.inventory.pendingItems.filter(
        (item) =>
          item.routeId === governingRouteId ||
          item.segmentIds.some((segmentId) =>
            governingRoute?.segmentIds.includes(segmentId),
          ),
      )
    : [];
  const equivalentAccessoryLengthMeters =
    uses.length === 0
      ? 0
      : uses.every((item) => item.equivalentLengthMeters !== null)
        ? uses.reduce(
            (sum, item) => sum + (item.equivalentLengthMeters ?? 0),
            0,
          )
        : null;
  const totalCalculationLengthMeters =
    calculationLengthMeters !== null && equivalentAccessoryLengthMeters !== null
      ? calculationLengthMeters + equivalentAccessoryLengthMeters
      : null;

  if (routeResolution.status !== "resolved") {
    return createVerificationResult({
      calculationLengthMeters,
      equivalentAccessoryLengthMeters,
      governingRouteId,
      reason: routeResolution.reason,
      segmentId: params.segment.segmentId,
      status: routeResolution.status,
      totalCalculationLengthMeters,
      uses,
    });
  }

  if (pendingItems.length > 0) {
    return createVerificationResult({
      calculationLengthMeters,
      equivalentAccessoryLengthMeters: null,
      governingRouteId,
      reason:
        pendingItems[0]?.reason ??
        "Hay accesorios fisicos pendientes en el recorrido gobernante.",
      segmentId: params.segment.segmentId,
      status: "unresolved",
      totalCalculationLengthMeters: null,
      uses,
    });
  }

  if (equivalentAccessoryLengthMeters === null) {
    return createVerificationResult({
      calculationLengthMeters,
      equivalentAccessoryLengthMeters,
      governingRouteId,
      reason:
        "Falta longitud equivalente resuelta para un accesorio fisico del recorrido.",
      segmentId: params.segment.segmentId,
      status: "unresolved",
      totalCalculationLengthMeters,
      uses,
    });
  }

  if (totalCalculationLengthMeters === null) {
    return createVerificationResult({
      calculationLengthMeters,
      equivalentAccessoryLengthMeters,
      governingRouteId,
      reason: "Falta longitud inicial resuelta para la segunda verificacion.",
      segmentId: params.segment.segmentId,
      status: "unresolved",
      totalCalculationLengthMeters,
      uses,
    });
  }

  const sizingResolution = params.pipeSystem.sizeSegment({
    accessoryEquivalentLengthMeters: equivalentAccessoryLengthMeters,
    accumulatedFlow: params.segment.accumulatedFlow,
    accumulatedFlowUnit: params.segment.accumulatedFlowUnit,
    calculationLengthMeters: totalCalculationLengthMeters,
    physicalLengthMeters: routeResolution.value.physicalLengthMeters,
    pipe: {
      diameter:
        params.segment.provisionalDiameter ??
        params.segment.calculatedDiameter ??
        undefined,
    },
    segmentId: params.segment.segmentId,
  });

  if (sizingResolution.status !== "resolved") {
    return createVerificationResult({
      calculationLengthMeters,
      equivalentAccessoryLengthMeters,
      governingRouteId,
      reason: sizingResolution.reason,
      segmentId: params.segment.segmentId,
      status: sizingResolution.status,
      totalCalculationLengthMeters,
      uses,
    });
  }

  return createVerificationResult({
    calculationLengthMeters,
    equivalentAccessoryLengthMeters,
    explanation: sizingResolution.value.explanation,
    governingRouteId,
    requiredDiameter: sizingResolution.value.selectedDiameter,
    segmentId: params.segment.segmentId,
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
    totalCalculationLengthMeters,
    uses,
  });
}

function equivalentAccessoryUsesForRoute(
  inventory: TechnicalPhysicalAccessoryInventory,
  routeId: string,
) {
  const itemById = new Map(inventory.items.map((item) => [item.id, item]));
  const items: TechnicalEquivalentAccessoryRouteUseItem[] = [];

  for (const accessoryId of inventory.accessoryIdsByRouteId[routeId] ?? []) {
    const item = itemById.get(accessoryId);

    if (!item) {
      continue;
    }

    for (const routeUse of item.routeUses) {
      if (routeUse.routeId !== routeId) {
        continue;
      }

      items.push({
        accessoryId: item.id,
        equivalentLengthMeters:
          routeUse.equivalentLengthMeters !== null &&
          Number.isFinite(routeUse.equivalentLengthMeters)
            ? routeUse.equivalentLengthMeters
            : null,
        item,
        routeUse,
      });
    }
  }

  return items.sort(
    (first, second) =>
      first.accessoryId.localeCompare(second.accessoryId) ||
      routeUseKey(first.routeUse).localeCompare(routeUseKey(second.routeUse)),
  );
}

function createVerificationResult(params: {
  calculationLengthMeters: number | null;
  equivalentAccessoryLengthMeters: number | null;
  explanation?: string | null;
  governingRouteId: string | null;
  reason?: string | null;
  requiredDiameter?: PipeDiameterReference | null;
  segmentId: string;
  sizingResult?: PipeSegmentSizingResult | null;
  status: PipeSystemResolutionStatus;
  tabulatedCapacityM3h?: number | null;
  tabulatedLengthMeters?: number | null;
  totalCalculationLengthMeters: number | null;
  uses: TechnicalEquivalentAccessoryRouteUseItem[];
}): TechnicalEquivalentAccessorySegmentVerification {
  return {
    calculationLengthMeters: params.calculationLengthMeters,
    equivalentAccessoryLengthMeters: params.equivalentAccessoryLengthMeters,
    explanation: params.explanation ?? null,
    governingRouteId: params.governingRouteId,
    reason: params.reason ?? null,
    requiredDiameter: params.requiredDiameter ?? null,
    segmentId: params.segmentId,
    sizingResult: params.sizingResult ?? null,
    status: params.status,
    tabulatedCapacityM3h: params.tabulatedCapacityM3h ?? null,
    tabulatedLengthMeters: params.tabulatedLengthMeters ?? null,
    totalCalculationLengthMeters: params.totalCalculationLengthMeters,
    uses: params.uses,
  };
}

function routeUseKey(routeUse: TechnicalPhysicalAccessoryRouteUse) {
  return [
    routeUse.routeId,
    routeUse.segmentIds.join(","),
    routeUse.traversalKind ?? "",
    routeUse.variantLabel ?? "",
  ].join("|");
}

function finiteRecordNumber(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  const value = record?.[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
