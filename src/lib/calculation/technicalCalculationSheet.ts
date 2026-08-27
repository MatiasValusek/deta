import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type {
  ProfessionalDiameterAdoptionSegmentResult,
} from "@/lib/calculation/professionalDiameterAdoption";
import type {
  TechnicalNetworkSizingSegmentResult,
} from "@/lib/calculation/technicalNetworkSizing";
import type {
  TechnicalTransitionAwareNetworkSizingIssue,
  TechnicalTransitionAwareNetworkSizingSegmentResult,
} from "@/lib/calculation/technicalNetworkSizingWithTransitions";
import type {
  TechnicalRouteTransitionResolution,
} from "@/lib/calculation/technicalRouteTransitions";
import type {
  TechnicalCalculationResult,
  TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";

export type TechnicalCalculationSheetStatus =
  | "pending"
  | "resolved"
  | "unavailable";

export type TechnicalCalculationSheetRowStatus =
  | "pending"
  | "resolved"
  | "unsupported";

export type TechnicalCalculationSheetSource =
  | "adoption"
  | "baseline"
  | "segment"
  | "transition_aware";

export type TechnicalCalculationSheetRow = {
  accessoryEquivalentLengthMeters: number | null;
  adoptedDiameter: PipeDiameterReference | null;
  calculatedDiameter: PipeDiameterReference | null;
  capacityM3h: number | null;
  downstreamApplianceIds: string[];
  downstreamAppliances: string[];
  effectiveDiameter: PipeDiameterReference | null;
  finalCalculationLengthMeters: number | null;
  flowM3h: number | null;
  initialRouteLengthMeters: number | null;
  observations: string[];
  physicalLengthMeters: number | null;
  segmentId: string;
  source: TechnicalCalculationSheetSource;
  status: TechnicalCalculationSheetRowStatus;
  tabulatedLengthMeters: number | null;
  transitionEquivalentLengthMeters: number | null;
  tramo: string;
};

export type TechnicalCalculationSheet = {
  pendingRowCount: number;
  rows: TechnicalCalculationSheetRow[];
  status: TechnicalCalculationSheetStatus;
  unsupportedRowCount: number;
};

type SelectedSizing = {
  adoptionSegment: ProfessionalDiameterAdoptionSegmentResult | null;
  baselineSegment: TechnicalNetworkSizingSegmentResult | null;
  effectiveSegment:
    | TechnicalNetworkSizingSegmentResult
    | TechnicalTransitionAwareNetworkSizingSegmentResult
    | null;
  source: TechnicalCalculationSheetSource;
  transitionAwareSegment: TechnicalTransitionAwareNetworkSizingSegmentResult | null;
};

export function createTechnicalCalculationSheet(params: {
  equipment?: WorkbenchEquipment[];
  result: TechnicalCalculationResult | null;
  routeTransitionResolutions?: Record<string, TechnicalRouteTransitionResolution>;
}): TechnicalCalculationSheet {
  if (!params.result) {
    return {
      pendingRowCount: 0,
      rows: [],
      status: "unavailable",
      unsupportedRowCount: 0,
    };
  }

  const equipmentById = new Map(
    (params.equipment ?? []).map((item) => [item.id, item]),
  );
  const rows = sortSegments(params.result.segments).map((segment) =>
    createSheetRow({
      equipmentById,
      result: params.result as TechnicalCalculationResult,
      routeTransitionResolutions: params.routeTransitionResolutions,
      segment,
    }),
  );
  const pendingRowCount = rows.filter((row) => row.status === "pending").length;
  const unsupportedRowCount = rows.filter(
    (row) => row.status === "unsupported",
  ).length;

  return {
    pendingRowCount,
    rows,
    status:
      rows.length === 0
        ? "unavailable"
        : pendingRowCount > 0 || unsupportedRowCount > 0
          ? "pending"
          : "resolved",
    unsupportedRowCount,
  };
}

function createSheetRow(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  result: TechnicalCalculationResult;
  routeTransitionResolutions?: Record<string, TechnicalRouteTransitionResolution>;
  segment: TechnicalSegmentResult;
}): TechnicalCalculationSheetRow {
  const selectedSizing = selectSizing(params.result, params.segment.segmentId);
  const effectiveSegment = selectedSizing.effectiveSegment;
  const transitionSegment =
    selectedSizing.source === "transition_aware" ||
    selectedSizing.source === "adoption"
      ? (effectiveSegment as TechnicalTransitionAwareNetworkSizingSegmentResult | null)
      : null;
  const observations = createObservations({
    selectedSizing,
    segment: params.segment,
  });
  const accessoryEquivalentLengthMeters =
    effectiveSegment?.governingRouteAccessoryEquivalentLengthMeters ??
    params.segment.routeSizingBasis.governingRouteAccessoryEquivalentLengthMeters;
  const transitionEquivalentLengthMeters =
    transitionSegment?.governingRouteTransitionEquivalentLengthMeters ??
    routeTransitionEquivalentLength({
      result: params.result,
      routeTransitionResolutions: params.routeTransitionResolutions,
      selectedSizing,
    });
  const initialRouteLengthMeters =
    effectiveSegment?.governingRoutePhysicalLengthMeters ??
    params.segment.routeSizingBasis.governingRoutePhysicalLengthMeters;
  const finalCalculationLengthMeters =
    transitionSegment?.transitionAwareSizingLengthMeters ??
    selectedSizing.baselineSegment?.sizingLengthMeters ??
    params.segment.routeSizingBasis.sizingLengthMeters;
  const tabulatedLengthMeters = effectiveSegment?.tabulatedLengthMeters ?? null;
  const capacityM3h = effectiveSegment?.tabulatedCapacityM3h ?? null;
  const calculatedDiameter = resolveCalculatedDiameter({
    selectedSizing,
    segment: params.segment,
  });
  const adoptedDiameter = selectedSizing.adoptionSegment?.decision
    ? selectedSizing.adoptionSegment.adoptedDiameter
    : null;
  const effectiveDiameter = resolveEffectiveDiameter({
    selectedSizing,
    segment: params.segment,
  });
  const flowM3h =
    params.segment.consumptionM3h ??
    (params.segment.accumulatedFlowUnit === "m3_h"
      ? params.segment.accumulatedFlow
      : effectiveSegment?.accumulatedFlowUnit === "m3_h"
        ? effectiveSegment.accumulatedFlow
        : null);
  const status = resolveRowStatus({
    accessoryEquivalentLengthMeters,
    calculatedDiameter,
    capacityM3h,
    effectiveDiameter,
    finalCalculationLengthMeters,
    flowM3h,
    initialRouteLengthMeters,
    observations,
    physicalLengthMeters: params.segment.segmentPhysicalLengthMeters,
    selectedSizing,
    tabulatedLengthMeters,
    transitionEquivalentLengthMeters,
  });

  return {
    accessoryEquivalentLengthMeters,
    adoptedDiameter,
    calculatedDiameter,
    capacityM3h,
    downstreamApplianceIds: [...params.segment.downstreamApplianceIds],
    downstreamAppliances: params.segment.downstreamApplianceIds.map(
      (equipmentId) =>
        params.equipmentById.get(equipmentId)?.name ?? equipmentId,
    ),
    effectiveDiameter,
    finalCalculationLengthMeters,
    flowM3h,
    initialRouteLengthMeters,
    observations,
    physicalLengthMeters: params.segment.segmentPhysicalLengthMeters,
    segmentId: params.segment.segmentId,
    source: selectedSizing.source,
    status,
    tabulatedLengthMeters,
    transitionEquivalentLengthMeters,
    tramo: segmentLabel(params.segment, params.result.nodeLabels),
  };
}

function selectSizing(
  result: TechnicalCalculationResult,
  segmentId: string,
): SelectedSizing {
  const adoptionSegment =
    result.professionalDiameterAdoption?.segments.find(
      (segment) => segment.segmentId === segmentId,
    ) ?? null;
  const baselineSegment =
    result.networkSizing?.segments.find(
      (segment) => segment.segmentId === segmentId,
    ) ?? null;
  const transitionAwareSegment =
    result.transitionAwareNetworkSizing?.segments.find(
      (segment) => segment.segmentId === segmentId,
    ) ?? null;

  if (adoptionSegment) {
    return {
      adoptionSegment,
      baselineSegment,
      effectiveSegment: adoptionSegment.validationSegment,
      source: "adoption",
      transitionAwareSegment,
    };
  }

  if (transitionAwareSegment) {
    return {
      adoptionSegment,
      baselineSegment,
      effectiveSegment: transitionAwareSegment,
      source: "transition_aware",
      transitionAwareSegment,
    };
  }

  if (baselineSegment) {
    return {
      adoptionSegment,
      baselineSegment,
      effectiveSegment: baselineSegment,
      source: "baseline",
      transitionAwareSegment,
    };
  }

  return {
    adoptionSegment,
    baselineSegment,
    effectiveSegment: null,
    source: "segment",
    transitionAwareSegment,
  };
}

function resolveCalculatedDiameter(params: {
  selectedSizing: SelectedSizing;
  segment: TechnicalSegmentResult;
}) {
  return (
    params.segment.provisionalDiameter ??
    params.selectedSizing.adoptionSegment?.calculatedDiameter ??
    params.selectedSizing.transitionAwareSegment?.calculatedDiameter ??
    params.selectedSizing.baselineSegment?.calculatedDiameter ??
    params.segment.calculatedDiameter ??
    null
  );
}

function resolveEffectiveDiameter(params: {
  selectedSizing: SelectedSizing;
  segment: TechnicalSegmentResult;
}) {
  const adoptionSegment = params.selectedSizing.adoptionSegment;

  if (adoptionSegment) {
    if (
      (adoptionSegment.status === "validated" ||
        adoptionSegment.status === "using_calculated") &&
      adoptionSegment.effectiveDiameter
    ) {
      return adoptionSegment.effectiveDiameter;
    }

    return null;
  }

  const transitionAwareSegment = params.selectedSizing.transitionAwareSegment;

  if (
    transitionAwareSegment?.status === "resolved" &&
    transitionAwareSegment.finalDiameter
  ) {
    return transitionAwareSegment.finalDiameter;
  }

  const baselineSegment = params.selectedSizing.baselineSegment;

  if (baselineSegment?.status === "resolved" && baselineSegment.calculatedDiameter) {
    return baselineSegment.calculatedDiameter;
  }

  return params.segment.calculatedDiameter ?? null;
}

function routeTransitionEquivalentLength(params: {
  result: TechnicalCalculationResult;
  routeTransitionResolutions?: Record<string, TechnicalRouteTransitionResolution>;
  selectedSizing: SelectedSizing;
}) {
  const routeId =
    params.selectedSizing.transitionAwareSegment?.routeTransitionResolutionId ??
    params.selectedSizing.transitionAwareSegment?.governingRouteId ??
    params.selectedSizing.baselineSegment?.governingRouteId ??
    null;

  if (!routeId) {
    return null;
  }

  const resolutions =
    params.routeTransitionResolutions ??
    params.result.professionalDiameterAdoption?.routeTransitionResolutions ??
    params.result.transitionAwareNetworkSizing?.routeTransitionResolutions ??
    {};

  return resolutions[routeId]?.equivalentLengthMeters ?? null;
}

function createObservations(params: {
  selectedSizing: SelectedSizing;
  segment: TechnicalSegmentResult;
}) {
  const observations: string[] = [];
  const adoptionSegment = params.selectedSizing.adoptionSegment;
  const effectiveSegment = params.selectedSizing.effectiveSegment;

  if (adoptionSegment?.reason) {
    observations.push(adoptionSegment.reason);
  }

  for (const issue of adoptionSegment?.issues ?? []) {
    observations.push(issue.message);
  }

  for (const issue of adoptionSegment?.validationIssues ?? []) {
    observations.push(issue.message);
  }

  for (const issue of segmentIssues(effectiveSegment)) {
    observations.push(issue.message);
  }

  for (const reason of params.segment.routeSizingBasis.reasons) {
    observations.push(reason);
  }

  return dedupeStrings(observations);
}

function segmentIssues(
  segment:
    | TechnicalNetworkSizingSegmentResult
    | TechnicalTransitionAwareNetworkSizingSegmentResult
    | null,
): TechnicalTransitionAwareNetworkSizingIssue[] {
  return (segment?.issues ?? []) as TechnicalTransitionAwareNetworkSizingIssue[];
}

function resolveRowStatus(params: {
  accessoryEquivalentLengthMeters: number | null;
  calculatedDiameter: PipeDiameterReference | null;
  capacityM3h: number | null;
  effectiveDiameter: PipeDiameterReference | null;
  finalCalculationLengthMeters: number | null;
  flowM3h: number | null;
  initialRouteLengthMeters: number | null;
  observations: string[];
  physicalLengthMeters: number | null;
  selectedSizing: SelectedSizing;
  tabulatedLengthMeters: number | null;
  transitionEquivalentLengthMeters: number | null;
}) {
  const adoptionStatus = params.selectedSizing.adoptionSegment?.status ?? null;
  const effectiveStatus = params.selectedSizing.effectiveSegment?.status ?? null;

  if (adoptionStatus === "incompatible" || effectiveStatus === "unsupported") {
    return "unsupported";
  }

  if (
    adoptionStatus === "pending_validation" ||
    adoptionStatus === "unresolved" ||
    effectiveStatus === "unresolved" ||
    params.accessoryEquivalentLengthMeters === null ||
    params.calculatedDiameter === null ||
    params.capacityM3h === null ||
    params.effectiveDiameter === null ||
    params.finalCalculationLengthMeters === null ||
    params.flowM3h === null ||
    params.initialRouteLengthMeters === null ||
    params.physicalLengthMeters === null ||
    params.tabulatedLengthMeters === null ||
    params.transitionEquivalentLengthMeters === null
  ) {
    return "pending";
  }

  return "resolved";
}

function segmentLabel(
  segment: TechnicalSegmentResult,
  nodeLabels: Record<string, string>,
) {
  const from = nodeLabels[segment.fromNodeId] ?? segment.fromNodeId;
  const to = nodeLabels[segment.toNodeId] ?? segment.toNodeId;

  return `${from} -> ${to}`;
}

function sortSegments(segments: TechnicalSegmentResult[]) {
  return [...segments].sort((first, second) => {
    const depth = first.depth - second.depth;

    if (depth !== 0) {
      return depth;
    }

    const from = first.fromNodeId.localeCompare(second.fromNodeId);

    if (from !== 0) {
      return from;
    }

    const to = first.toNodeId.localeCompare(second.toNodeId);

    if (to !== 0) {
      return to;
    }

    return first.segmentId.localeCompare(second.segmentId);
  });
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    next.push(value);
  }

  return next;
}
