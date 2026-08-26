import type { PipeDiameterReference, PipeSystemIdentity } from "./pipeSystem";
import type { RouteAccessoryType } from "@/lib/routing/types";
import type {
  AccessoryProposalOwnerResolution,
} from "@/lib/routing/routeAccessoryProposals";

export type AccessoryCatalogCandidateStatus =
  | "compatible"
  | "incompatible"
  | "requires_more_information";

export type AccessoryCatalogGeometryCompatibility =
  | "compatible"
  | "filtered_by_geometry"
  | "not_applicable";

export type AccessoryCatalogCandidate = {
  compatibleDiameterIds: string[];
  diameterCompatibility: AccessoryCatalogCandidateStatus;
  familyId: string;
  geometryCompatibility: AccessoryCatalogGeometryCompatibility;
  id: string;
  label: string;
  originalLabels: string[];
  pipeSystem: PipeSystemIdentity;
  reason: string;
  requiredInformation: string[];
  status: AccessoryCatalogCandidateStatus;
  type: RouteAccessoryType;
};

export type AccessoryProposalIncidentSegmentContext = {
  diameter: PipeDiameterReference | null;
  segmentId: string;
};

export type AccessoryProposalTechnicalReview = {
  candidates: AccessoryCatalogCandidate[];
  incidentSegments: AccessoryProposalIncidentSegmentContext[];
  ownerResolution: AccessoryProposalOwnerResolution;
  proposalId: string;
  reason: string | null;
  selectedDiameter: PipeDiameterReference | null;
  status: AccessoryCatalogCandidateStatus;
};

export type AccessoryCatalogSelection = {
  familyId: string;
  label: string;
  pipeSystemId: string;
  type: RouteAccessoryType;
};

export function accessoryCatalogSelectionFromCandidate(
  candidate: AccessoryCatalogCandidate,
): AccessoryCatalogSelection {
  return {
    familyId: candidate.familyId,
    label: candidate.label,
    pipeSystemId: candidate.pipeSystem.id,
    type: candidate.type,
  };
}
