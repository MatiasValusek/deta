import type { Point2D } from "@/lib/geometry/types";

export type RouteNodeKind = "supply" | "appliance" | "route";
export type RouteElementOrigin = "manual" | "automatic";
export type RouteAccessoryType = "elbow" | "tee" | "valve" | "other";
export type RouteAccessoryEquivalentLengthSource =
  | "manual"
  | "pipe_system"
  | "unresolved";
export type RouteAccessoryOrigin =
  | "automatic_confirmed"
  | "manual"
  | "user_confirmed";

export type RouteNode = {
  id: string;
  kind: RouteNodeKind;
  equipmentId?: string;
  origin?: RouteElementOrigin;
  pdfPageNumber?: number;
  position?: Point2D;
};

export type RouteSegmentAccessory = {
  catalogCode?: string;
  catalogFamilyId?: string;
  equivalentLengthMetersPerUnit: number | null;
  equivalentLengthSource: RouteAccessoryEquivalentLengthSource;
  id: string;
  origin?: RouteAccessoryOrigin;
  quantity: number;
  segmentId: string;
  type: RouteAccessoryType;
};

export type RouteSegment = {
  accessories?: RouteSegmentAccessory[];
  id: string;
  fromNodeId: string;
  origin?: RouteElementOrigin;
  toNodeId: string;
};

export type ManualRouteNetwork = {
  nodes: RouteNode[];
  segments: RouteSegment[];
};

export type RouteDraftStep = "target" | "origin" | "drawing" | "review";

export type RouteDraft = {
  planBaseId: string;
  pdfPageNumber?: number;
  targetEquipmentId: string | null;
  originNodeId: string | null;
  originPoint: Point2D | null;
  originIntentEquipmentId?: string | null;
  originSplitSegmentId: string | null;
  routePoints: Point2D[];
  previewPoint: Point2D | null;
  step: RouteDraftStep;
  error: string | null;
};

export type RouteIntentEndpoint = {
  equipmentId: string;
  kind: "equipment";
};

export type RouteIntentConnection = {
  createdAt: number;
  from: RouteIntentEndpoint;
  id: string;
  origin: "manual";
  pdfPageNumber?: number;
  planBaseId: string;
  to: RouteIntentEndpoint;
};

export type RouteIntentDraftStep = "from" | "to" | "review";

export type RouteIntentDraft = {
  error: string | null;
  from: RouteIntentEndpoint | null;
  pdfPageNumber?: number;
  planBaseId: string;
  previewPoint: Point2D | null;
  step: RouteIntentDraftStep;
  to: RouteIntentEndpoint | null;
};

export type RouteToolMode = "inactive" | "origin" | "drawing";

export type ResolvedRouteSegment = RouteSegment & {
  from: Point2D;
  to: Point2D;
};

export type AutomaticRouteRestriction =
  | {
      id: string;
      kind: "polygon";
      polygon: Point2D[];
    }
  | {
      from: Point2D;
      id: string;
      kind: "segment";
      to: Point2D;
    };

export type RouteProposalDiagnostic = {
  equipmentId: string;
  message: string;
  routeLengthSource?: number;
  status: "connected" | "unreachable";
  turnCount?: number;
};

export type RouteProposalParams = {
  fingerprint: string;
  marginMeters: number;
  scaleMetersPerSourceUnit: number;
};

export type RouteProposalValidation = {
  allConnected: boolean;
  appliancesTerminal: boolean;
  canAccept: boolean;
  connectedToSupply: boolean;
  hasCrossingsWithoutNode: boolean;
  hasCycle: boolean;
  hasDuplicateSegments: boolean;
  hasZeroLengthSegments: boolean;
  restrictionCount: number;
};

export type AutomaticRouteProposal = {
  baseId: string;
  derivationCount: number;
  diagnostics: RouteProposalDiagnostic[];
  id: string;
  lengthMeters: number;
  lengthSource: number;
  nodes: RouteNode[];
  params: RouteProposalParams;
  pdfPageNumber?: number;
  reachedEquipmentIds: string[];
  segmentCount: number;
  segments: RouteSegment[];
  status: "ready" | "partial" | "invalid";
  turnCount: number;
  unreachedEquipmentIds: string[];
  validation: RouteProposalValidation;
};
