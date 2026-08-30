import type { AutomaticRouteProposal } from "@/lib/routing/types";
import {
  hasDuplicateNodeIds,
  hasDuplicateSegmentIds,
  hasSegmentsWithMissingEndpoints,
} from "@/lib/routing/network";

export function routeProposalCanBeAccepted(
  proposal: AutomaticRouteProposal,
  requiredApplianceCount: number,
  isOutdated = false,
) {
  return (
    !isOutdated &&
    proposalConnectsAllRequiredAppliances(proposal, requiredApplianceCount) &&
    proposalHasAcceptableTopology(proposal)
  );
}

export function proposalConnectsAllRequiredAppliances(
  proposal: AutomaticRouteProposal,
  requiredApplianceCount: number,
) {
  return (
    requiredApplianceCount > 0 &&
    proposal.reachedEquipmentIds.length === requiredApplianceCount &&
    proposal.unreachedEquipmentIds.length === 0
  );
}

function proposalHasAcceptableTopology(proposal: AutomaticRouteProposal) {
  const validation = proposal.validation;
  const network = {
    nodes: proposal.nodes,
    segments: proposal.segments,
  };

  return (
    !hasDuplicateNodeIds(network) &&
    !hasDuplicateSegmentIds(network) &&
    !hasSegmentsWithMissingEndpoints(network) &&
    validation.appliancesTerminal &&
    validation.connectedToSupply &&
    !validation.hasCrossingsWithoutNode &&
    !validation.hasCycle &&
    !validation.hasDuplicateSegments &&
    !validation.hasZeroLengthSegments &&
    validation.restrictionCount === 0
  );
}
