import type { AccessoryCatalogCandidateStatus } from "@/lib/calculation/accessoryCatalogCandidates";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  buildEquipmentIndex,
  distanceBetween,
  findRouteNodeByEquipment,
  getRouteNeighbors,
  resolveRouteNodePosition,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  RouteNode,
  RouteSegment,
} from "@/lib/routing/types";
import type { AccessoryCatalogCandidate } from "./accessoryCatalogCandidates";

const GEOMETRY_PRECISION = 6;
const COLINEAR_TOLERANCE_DEGREES = 3;
const TURN_MINIMUM_DEGREES = 10;

export type DiameterTransitionKind =
  | "branch_transition"
  | "compound_turn_transition"
  | "not_required"
  | "simple_reduction"
  | "simple_transition"
  | "unsupported"
  | "unresolved";

export type DiameterTransitionState =
  | "confirmed"
  | "needs_review"
  | "not_required"
  | "rejected"
  | "transition_required"
  | "unsupported"
  | "unresolved";

export type DiameterTransitionDirection =
  | "expanding"
  | "mixed"
  | "reducing"
  | "unknown";

export type DiameterTransitionDecisionStatus =
  | "confirmed"
  | "pending"
  | "rejected";

export type DiameterTransitionDecisionOrigin = "user_confirmed";

export type DiameterTransitionDecision = {
  catalogFamilyId?: string;
  decidedAt: number;
  geometryKey: string;
  origin?: DiameterTransitionDecisionOrigin;
  pipeSystemId?: string;
  status: DiameterTransitionDecisionStatus;
  transitionId: string;
};

export type DiameterTransitionSegmentRole =
  | "branch"
  | "downstream"
  | "unknown"
  | "upstream";

export type DiameterTransitionIncidentSegment = {
  diameter: PipeDiameterReference | null;
  neighborNodeId: string;
  role: DiameterTransitionSegmentRole;
  segmentId: string;
};

export type DiameterTransitionGeometryClassification =
  | "ambiguous"
  | "branch"
  | "colinear"
  | "turn"
  | "unsupported";

export type DiameterTransitionEvidence = {
  angleClassification: DiameterTransitionGeometryClassification;
  angleDegrees?: number;
  degree: number;
  incidentNodeIds: string[];
  unresolvedSegmentIds: string[];
};

export type DiameterTransitionProposal = {
  decision?: DiameterTransitionDecision;
  direction: DiameterTransitionDirection;
  downstreamSegmentIds: string[];
  evidence: DiameterTransitionEvidence;
  geometryKey: string;
  id: string;
  incidentSegments: DiameterTransitionIncidentSegment[];
  kind: DiameterTransitionKind;
  nodeId: string;
  position: Point2D;
  reason: string;
  selectedCatalogFamilyId?: string;
  state: DiameterTransitionState;
  upstreamSegmentId: string | null;
};

export type DiameterTransitionTechnicalReview = {
  candidates: AccessoryCatalogCandidate[];
  downstreamDiameters: Array<{
    diameter: PipeDiameterReference | null;
    segmentId: string;
  }>;
  reason: string | null;
  selectedCandidate: AccessoryCatalogCandidate | null;
  status: AccessoryCatalogCandidateStatus;
  transitionId: string;
  upstreamDiameter: PipeDiameterReference | null;
};

export type DiameterTransitionDiameterBySegmentId =
  | Map<string, PipeDiameterReference | null | undefined>
  | Record<string, PipeDiameterReference | null | undefined>;

type IncidentSegment = {
  diameter: PipeDiameterReference | null;
  neighborNodeId: string;
  neighborPosition: Point2D;
  role: DiameterTransitionSegmentRole;
  segment: RouteSegment;
  vector: Point2D;
};

export function detectDiameterTransitionProposals(params: {
  decisions?: DiameterTransitionDecision[];
  diameterBySegmentId?: DiameterTransitionDiameterBySegmentId;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
}): DiameterTransitionProposal[] {
  const equipmentById = buildEquipmentIndex(params.equipment);
  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const neighbors = getRouteNeighbors(params.network);
  const distancesFromSupply = calculateNodeDistancesFromSupply({
    equipment: params.equipment,
    network: params.network,
  });

  const proposals: DiameterTransitionProposal[] = [];

  for (const node of [...params.network.nodes].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    const position = resolveRouteNodePosition(node, equipmentById);

    if (!position) {
      continue;
    }

    const degree = neighbors.get(node.id)?.size ?? 0;

    if (degree < 2) {
      continue;
    }

    const incident = resolveIncidentSegments({
      diameterBySegmentId: params.diameterBySegmentId,
      distancesFromSupply,
      equipmentById,
      network: params.network,
      node,
      nodeById,
      position,
    });
    const proposal = createDiameterTransitionProposal({
      degree,
      incident,
      node,
      position,
    });

    proposals.push(proposal);
  }

  return applyDiameterTransitionDecisions({
    decisions: params.decisions ?? [],
    proposals,
  });
}

export function applyDiameterTransitionDecisions(params: {
  decisions: DiameterTransitionDecision[];
  proposals: DiameterTransitionProposal[];
}) {
  const decisionByTransitionId = new Map(
    params.decisions.map((decision) => [decision.transitionId, decision]),
  );

  return params.proposals.map((proposal) => {
    const decision = decisionByTransitionId.get(proposal.id);

    if (!decision || decision.geometryKey !== proposal.geometryKey) {
      return proposal;
    }

    const withDecision = {
      ...proposal,
      decision,
      selectedCatalogFamilyId: decision.catalogFamilyId,
    };

    if (decision.status === "pending" || proposal.state === "not_required") {
      return withDecision;
    }

    return {
      ...withDecision,
      state: decision.status,
    };
  });
}

export function withDiameterTransitionTechnicalReview(
  proposal: DiameterTransitionProposal,
  review: DiameterTransitionTechnicalReview,
): DiameterTransitionProposal {
  if (
    proposal.state !== "confirmed" ||
    !proposal.decision?.catalogFamilyId
  ) {
    return proposal;
  }

  if (!review.selectedCandidate) {
    return {
      ...proposal,
      reason:
        "La familia confirmada ya no existe entre los candidatos actuales de la transicion.",
      state: "unsupported",
    };
  }

  if (review.selectedCandidate.status !== "compatible") {
    return {
      ...proposal,
      reason: review.selectedCandidate.reason,
      state: "needs_review",
    };
  }

  return proposal;
}

export function confirmDiameterTransitionProposal(params: {
  candidate: AccessoryCatalogCandidate;
  decidedAt: number;
  origin?: DiameterTransitionDecisionOrigin;
  proposal: DiameterTransitionProposal;
}):
  | {
      decision: DiameterTransitionDecision;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    } {
  if (params.proposal.state === "not_required") {
    return {
      message: "La transicion no esta requerida con los diametros actuales.",
      ok: false,
    };
  }

  if (params.candidate.status !== "compatible") {
    return {
      message: params.candidate.reason,
      ok: false,
    };
  }

  return {
    decision: {
      catalogFamilyId: params.candidate.familyId,
      decidedAt: params.decidedAt,
      geometryKey: params.proposal.geometryKey,
      origin: params.origin ?? "user_confirmed",
      pipeSystemId: params.candidate.pipeSystem.id,
      status: "confirmed",
      transitionId: params.proposal.id,
    },
    ok: true,
  };
}

export function rejectDiameterTransitionProposal(params: {
  decidedAt: number;
  proposal: DiameterTransitionProposal;
}): DiameterTransitionDecision {
  return {
    decidedAt: params.decidedAt,
    geometryKey: params.proposal.geometryKey,
    status: "rejected",
    transitionId: params.proposal.id,
  };
}

export function reconcileDiameterTransitionDecisions(params: {
  decisions: DiameterTransitionDecision[];
  proposals: DiameterTransitionProposal[];
}) {
  const proposalById = new Map(
    params.proposals.map((proposal) => [proposal.id, proposal]),
  );

  return params.decisions
    .filter((decision) => {
      const proposal = proposalById.get(decision.transitionId);
      return Boolean(proposal && proposal.geometryKey === decision.geometryKey);
    })
    .sort((first, second) =>
      first.transitionId.localeCompare(second.transitionId),
    );
}

export function upsertDiameterTransitionDecision(
  decisions: DiameterTransitionDecision[],
  decision: DiameterTransitionDecision,
) {
  return [
    ...decisions.filter((item) => item.transitionId !== decision.transitionId),
    decision,
  ].sort((first, second) =>
    first.transitionId.localeCompare(second.transitionId),
  );
}

export function diameterTransitionIsActive(
  proposal: DiameterTransitionProposal,
) {
  return proposal.state !== "not_required";
}

function createDiameterTransitionProposal(params: {
  degree: number;
  incident: IncidentSegment[];
  node: RouteNode;
  position: Point2D;
}): DiameterTransitionProposal {
  const incidentNodeIds = params.incident
    .map((item) => item.neighborNodeId)
    .sort();
  const unresolvedSegmentIds = params.incident
    .filter((item) => !item.diameter)
    .map((item) => item.segment.id)
    .sort();
  const angle = params.degree === 2 ? twoSegmentAngle(params.incident) : null;
  const angleClassification =
    params.degree === 2 && angle !== null
      ? classifyTwoSegmentAngle(angle)
      : params.degree === 3
        ? "branch"
        : "unsupported";
  const base = createBaseTransition({
    angleClassification,
    angleDegrees: angle === null ? undefined : roundGeometry(angle),
    degree: params.degree,
    incident: params.incident,
    incidentNodeIds,
    nodeId: params.node.id,
    position: params.position,
    unresolvedSegmentIds,
  });

  if (params.incident.length !== params.degree) {
    return {
      ...base,
      evidence: {
        ...base.evidence,
        unresolvedSegmentIds: base.incidentSegments
          .map((item) => item.segmentId)
          .sort(),
      },
      kind: "unresolved",
      reason: "No se pudo resolver la geometria de todos los tramos incidentes.",
      state: "unresolved",
    };
  }

  if (unresolvedSegmentIds.length > 0) {
    return {
      ...base,
      kind: "unresolved",
      reason: "incident_segment_diameter_unresolved",
      state: "unresolved",
    };
  }

  if (allIncidentDiametersAreEqual(params.incident)) {
    return {
      ...base,
      kind: "not_required",
      reason: "Los diametros calculados incidentes son iguales.",
      state: "not_required",
    };
  }

  if (params.degree === 2) {
    if (angleClassification === "colinear") {
      return {
        ...base,
        kind:
          base.direction === "expanding"
            ? "simple_transition"
            : "simple_reduction",
        reason: "Cambio de diametro en paso recto colineal.",
        state: "transition_required",
      };
    }

    if (angleClassification === "turn") {
      return {
        ...base,
        kind: "compound_turn_transition",
        reason:
          "Cambio de direccion y de diametro en el mismo nodo; requiere revision profesional.",
        state: "needs_review",
      };
    }

    return {
      ...base,
      kind: "unsupported",
      reason:
        "La geometria grado 2 no es suficientemente recta ni un giro definido.",
      state: "unsupported",
    };
  }

  if (params.degree === 3) {
    return {
      ...base,
      kind: "branch_transition",
      reason: "Tee con diametros calculados incidentes distintos.",
      state: "needs_review",
    };
  }

  return {
    ...base,
    kind: "unsupported",
    reason: "Nodo con cuatro o mas tramos y diametros distintos.",
    state: "unsupported",
  };
}

function createBaseTransition(params: {
  angleClassification: DiameterTransitionGeometryClassification;
  angleDegrees?: number;
  degree: number;
  incident: IncidentSegment[];
  incidentNodeIds: string[];
  nodeId: string;
  position: Point2D;
  unresolvedSegmentIds: string[];
}): DiameterTransitionProposal {
  const incidentSegments = params.incident.map((item) => ({
    diameter: item.diameter,
    neighborNodeId: item.neighborNodeId,
    role: item.role,
    segmentId: item.segment.id,
  }));
  const incidentSegmentIds = incidentSegments
    .map((item) => item.segmentId)
    .sort();
  const upstreamSegmentId =
    incidentSegments.find((item) => item.role === "upstream")?.segmentId ??
    null;
  const downstreamSegmentIds = incidentSegments
    .filter((item) => item.role === "downstream" || item.role === "branch")
    .map((item) => item.segmentId)
    .sort();
  const geometryKey = [
    params.nodeId,
    pointKey(params.position),
    incidentSegmentIds.join(","),
    params.incidentNodeIds.join(","),
    params.degree,
    params.angleClassification,
    params.angleDegrees ?? "",
  ].join("|");
  const id = `diameter-transition:${params.nodeId}:${hashString(geometryKey)}`;

  return {
    direction: classifyTransitionDirection({
      downstreamSegmentIds,
      incidentSegments,
      upstreamSegmentId,
    }),
    downstreamSegmentIds,
    evidence: {
      angleClassification: params.angleClassification,
      angleDegrees: params.angleDegrees,
      degree: params.degree,
      incidentNodeIds: params.incidentNodeIds,
      unresolvedSegmentIds: params.unresolvedSegmentIds,
    },
    geometryKey,
    id,
    incidentSegments,
    kind: "unresolved",
    nodeId: params.nodeId,
    position: params.position,
    reason: "Transicion pendiente de clasificar.",
    state: "unresolved",
    upstreamSegmentId,
  };
}

function resolveIncidentSegments(params: {
  diameterBySegmentId?: DiameterTransitionDiameterBySegmentId;
  distancesFromSupply: Map<string, number>;
  equipmentById: Map<string, WorkbenchEquipment>;
  network: ManualRouteNetwork;
  node: RouteNode;
  nodeById: Map<string, RouteNode>;
  position: Point2D;
}): IncidentSegment[] {
  const nodeDistance = params.distancesFromSupply.get(params.node.id);

  return params.network.segments
    .filter(
      (segment) =>
        segment.fromNodeId === params.node.id ||
        segment.toNodeId === params.node.id,
    )
    .map((segment) => {
      const neighborNodeId =
        segment.fromNodeId === params.node.id
          ? segment.toNodeId
          : segment.fromNodeId;
      const neighborNode = params.nodeById.get(neighborNodeId);
      const neighborPosition = neighborNode
        ? resolveRouteNodePosition(neighborNode, params.equipmentById)
        : null;

      if (!neighborNode || !neighborPosition) {
        return null;
      }

      return {
        diameter: getDiameter(params.diameterBySegmentId, segment.id),
        neighborNodeId,
        neighborPosition,
        role: incidentSegmentRole({
          degree: params.network.segments.filter(
            (item) =>
              item.fromNodeId === params.node.id ||
              item.toNodeId === params.node.id,
          ).length,
          neighborDistance: params.distancesFromSupply.get(neighborNodeId),
          nodeDistance,
        }),
        segment,
        vector: {
          x: neighborPosition.x - params.position.x,
          y: neighborPosition.y - params.position.y,
        },
      };
    })
    .filter((item): item is IncidentSegment => Boolean(item))
    .filter((item) => distanceBetween(params.position, item.neighborPosition) > 0)
    .sort((first, second) => first.segment.id.localeCompare(second.segment.id));
}

function incidentSegmentRole(params: {
  degree: number;
  neighborDistance: number | undefined;
  nodeDistance: number | undefined;
}): DiameterTransitionSegmentRole {
  if (
    params.nodeDistance === undefined ||
    params.neighborDistance === undefined
  ) {
    return "unknown";
  }

  if (params.neighborDistance < params.nodeDistance) {
    return "upstream";
  }

  if (params.neighborDistance > params.nodeDistance) {
    return params.degree === 3 ? "branch" : "downstream";
  }

  return "unknown";
}

function calculateNodeDistancesFromSupply(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
}) {
  const supplyEquipment =
    params.equipment.find((item) => item.role === "supply") ?? null;
  const supplyNode =
    (supplyEquipment
      ? findRouteNodeByEquipment(params.network, supplyEquipment.id)
      : null) ??
    params.network.nodes.find((node) => node.kind === "supply") ??
    null;
  const distances = new Map<string, number>();

  if (!supplyNode) {
    return distances;
  }

  const neighbors = getRouteNeighbors(params.network);
  const queue = [supplyNode.id];
  distances.set(supplyNode.id, 0);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentDistance = distances.get(current) ?? 0;

    for (const next of [...(neighbors.get(current) ?? [])].sort()) {
      if (!distances.has(next)) {
        distances.set(next, currentDistance + 1);
        queue.push(next);
      }
    }
  }

  return distances;
}

function classifyTransitionDirection(params: {
  downstreamSegmentIds: string[];
  incidentSegments: DiameterTransitionIncidentSegment[];
  upstreamSegmentId: string | null;
}): DiameterTransitionDirection {
  if (!params.upstreamSegmentId || params.downstreamSegmentIds.length === 0) {
    return "unknown";
  }

  const upstreamDiameter = params.incidentSegments.find(
    (segment) => segment.segmentId === params.upstreamSegmentId,
  )?.diameter;
  const upstreamValue = upstreamDiameter
    ? diameterSortValue(upstreamDiameter)
    : null;

  if (upstreamValue === null) {
    return "unknown";
  }

  let hasSmaller = false;
  let hasLarger = false;

  for (const segmentId of params.downstreamSegmentIds) {
    const diameter = params.incidentSegments.find(
      (segment) => segment.segmentId === segmentId,
    )?.diameter;
    const value = diameter ? diameterSortValue(diameter) : null;

    if (value === null) {
      return "unknown";
    }

    if (value < upstreamValue) {
      hasSmaller = true;
    }

    if (value > upstreamValue) {
      hasLarger = true;
    }
  }

  if (hasSmaller && hasLarger) {
    return "mixed";
  }

  if (hasSmaller) {
    return "reducing";
  }

  if (hasLarger) {
    return "expanding";
  }

  return "unknown";
}

function allIncidentDiametersAreEqual(incident: IncidentSegment[]) {
  const [first] = incident;

  if (!first?.diameter) {
    return false;
  }

  const firstDiameter = first.diameter;

  return incident.every(
    (item) =>
      item.diameter !== null &&
      diameterKey(item.diameter) === diameterKey(firstDiameter),
  );
}

function twoSegmentAngle(incident: IncidentSegment[]) {
  const [first, second] = incident;

  if (!first || !second) {
    return null;
  }

  return angleBetweenVectors(first.vector, second.vector);
}

function angleBetweenVectors(first: Point2D, second: Point2D) {
  const firstLength = Math.hypot(first.x, first.y);
  const secondLength = Math.hypot(second.x, second.y);

  if (firstLength === 0 || secondLength === 0) {
    return 0;
  }

  const cosine = clamp(
    (first.x * second.x + first.y * second.y) / (firstLength * secondLength),
    -1,
    1,
  );

  return (Math.acos(cosine) * 180) / Math.PI;
}

function classifyTwoSegmentAngle(
  angleDegrees: number,
): "ambiguous" | "colinear" | "turn" {
  const distanceToStraight = Math.abs(180 - angleDegrees);

  if (
    angleDegrees <= COLINEAR_TOLERANCE_DEGREES ||
    distanceToStraight <= COLINEAR_TOLERANCE_DEGREES
  ) {
    return "colinear";
  }

  if (
    angleDegrees < TURN_MINIMUM_DEGREES ||
    distanceToStraight < TURN_MINIMUM_DEGREES
  ) {
    return "ambiguous";
  }

  return "turn";
}

function getDiameter(
  diameterBySegmentId: DiameterTransitionDiameterBySegmentId | undefined,
  segmentId: string,
) {
  if (!diameterBySegmentId) {
    return null;
  }

  return diameterBySegmentId instanceof Map
    ? diameterBySegmentId.get(segmentId) ?? null
    : diameterBySegmentId[segmentId] ?? null;
}

function diameterKey(diameter: PipeDiameterReference) {
  return [
    diameter.id,
    diameter.externalDiameterMillimeters ?? "",
    diameter.internalDiameterMillimeters ?? "",
    diameter.nominalDiameter ?? "",
  ].join(":");
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

function pointKey(point: Point2D) {
  return `${roundGeometry(point.x)},${roundGeometry(point.y)}`;
}

function roundGeometry(value: number) {
  return Number(value.toFixed(GEOMETRY_PRECISION));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
