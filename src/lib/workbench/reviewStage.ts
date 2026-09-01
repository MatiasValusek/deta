import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  getConnectedApplianceEquipmentIds,
} from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";

export type RouteReviewState = {
  canOpenReview: boolean;
  connectedApplianceCount: number;
  hasActiveProposal: boolean;
  routeRestrictionCount: number;
  totalApplianceCount: number;
};

export type ReviewCalculationReadiness = {
  canContinueToCalculate: boolean;
  observationCount: number;
  technicalGeometryPendingCount: number;
};

export function createRouteReviewState(params: {
  equipment: WorkbenchEquipment[];
  hasActiveProposal: boolean;
  hasRouteCycle: boolean;
  network: ManualRouteNetwork;
  routeRestrictionCount: number;
}): RouteReviewState {
  const supplyCount = params.equipment.filter(
    (equipment) => equipment.role === "supply",
  ).length;
  const totalApplianceCount = params.equipment.filter(
    (equipment) => equipment.role === "appliance",
  ).length;
  const connectedApplianceCount = getConnectedApplianceEquipmentIds(
    params.network,
    params.equipment,
  ).size;
  const canOpenReview =
    !params.hasActiveProposal &&
    supplyCount === 1 &&
    totalApplianceCount > 0 &&
    connectedApplianceCount === totalApplianceCount &&
    params.routeRestrictionCount === 0 &&
    !params.hasRouteCycle;

  return {
    canOpenReview,
    connectedApplianceCount,
    hasActiveProposal: params.hasActiveProposal,
    routeRestrictionCount: params.routeRestrictionCount,
    totalApplianceCount,
  };
}

export function createReviewCalculationReadiness(params: {
  routeReviewState: RouteReviewState;
  technicalGeometryPendingCount: number;
}): ReviewCalculationReadiness {
  const technicalGeometryPendingCount = Math.max(
    0,
    Math.trunc(params.technicalGeometryPendingCount),
  );

  return {
    canContinueToCalculate:
      params.routeReviewState.canOpenReview &&
      technicalGeometryPendingCount === 0,
    observationCount:
      params.routeReviewState.routeRestrictionCount +
      technicalGeometryPendingCount,
    technicalGeometryPendingCount,
  };
}
