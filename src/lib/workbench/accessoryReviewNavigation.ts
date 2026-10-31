import type { AccessoryProposalTechnicalReview } from "@/lib/calculation/accessoryCatalogCandidates";
import type { AccessoryProposal } from "@/lib/routing/routeAccessoryProposals";

export type AccessoryReviewFocus = {
  nodeId: string;
  proposalId: string;
  segmentId: string | null;
};

export function resolveAccessoryReviewFocus(params: {
  proposals: AccessoryProposal[];
  referenceIds: string[];
  reviews: AccessoryProposalTechnicalReview[];
}): AccessoryReviewFocus | null {
  const referencedProposal = params.proposals.find((proposal) =>
    proposalMatchesReferences(proposal, params.referenceIds),
  );

  if (!referencedProposal) {
    return null;
  }

  const review = params.reviews.find(
    (candidate) =>
      candidate.proposalId === referencedProposal.id ||
      candidate.equivalentProposalIds?.includes(referencedProposal.id),
  );
  const representativeProposalId =
    review?.equivalentProposalIds?.[0] ?? referencedProposal.id;
  const representativeProposal =
    params.proposals.find(
      (proposal) => proposal.id === representativeProposalId,
    ) ?? referencedProposal;

  return {
    nodeId: referencedProposal.nodeId,
    proposalId: representativeProposal.id,
    segmentId:
      referencedProposal.incidentSegmentIds[0] ??
      representativeProposal.incidentSegmentIds[0] ??
      null,
  };
}

function proposalMatchesReferences(
  proposal: AccessoryProposal,
  referenceIds: string[],
) {
  return referenceIds.some(
    (referenceId) =>
      referenceId === proposal.id ||
      referenceId === proposal.nodeId ||
      referenceId === `node:${proposal.nodeId}` ||
      proposal.incidentSegmentIds.includes(referenceId),
  );
}
