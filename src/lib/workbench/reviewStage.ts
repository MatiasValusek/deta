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
