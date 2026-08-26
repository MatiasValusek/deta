import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import type { AccessoryCatalogSelection } from "@/lib/calculation/accessoryCatalogCandidates";
import {
  buildEquipmentIndex,
  distanceBetween,
  getRouteNeighbors,
  resolveRouteNodePosition,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  RouteAccessoryEquivalentLengthSource,
  RouteAccessoryType,
  RouteNode,
  RouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";

const GEOMETRY_PRECISION = 6;
const COLINEAR_TOLERANCE_DEGREES = 3;
const TURN_MINIMUM_DEGREES = 10;
const AUTOMATIC_ACCESSORY_ID_PREFIX = "route-accessory:accessory-proposal:";

export type AccessoryProposalKind =
  | "elbow"
  | "straight"
  | "tee"
  | "terminal"
  | "unsupported";

export type AccessoryProposalState =
  | "proposed"
  | "confirmed"
  | "rejected"
  | "needs_review";

export type AccessoryProposalGeometryClassification =
  | "ambiguous"
  | "branch"
  | "colinear"
  | "terminal"
  | "turn"
  | "unsupported";

export type AccessoryProposalConfidence = "high" | "medium" | "low";

export type AccessoryProposalDecisionOrigin =
  | "automatic_confirmed"
  | "user_confirmed";
export type AccessoryProposalDecisionStatus =
  | "confirmed"
  | "pending"
  | "rejected";

export type AccessoryProposalDecision = {
  accessoryId?: string;
  catalogFamilyId?: string;
  decidedAt: number;
  geometryKey: string;
  origin?: AccessoryProposalDecisionOrigin;
  ownerSegmentId?: string;
  pipeSystemId?: string;
  proposalId: string;
  status: AccessoryProposalDecisionStatus;
};

export type AccessoryProposalDiameterReference = {
  externalDiameterMillimeters?: number;
  id: string;
  internalDiameterMillimeters?: number;
  label: string;
  nominalDiameter?: string;
};

export type AccessoryProposalBranchRole = {
  neighborNodeId: string;
  role: "branch" | "unknown" | "upstream";
  segmentId: string;
};

export type AccessoryProposalDomainAccessory = {
  catalogCode?: string;
  catalogFamilyId?: string;
  equivalentLengthSource: RouteAccessoryEquivalentLengthSource;
  reason?: string;
  type: RouteAccessoryType;
};

export type AccessoryProposalEvidence = {
  angleClassification: AccessoryProposalGeometryClassification;
  angleDegrees?: number;
  branchRoles?: AccessoryProposalBranchRole[];
  degree: number;
  incidentNodeIds: string[];
  note?: string;
};

export type AccessoryProposalOwnerResolution =
  | {
      candidateSegmentIds: string[];
      ownerSegmentId: string;
      status: "unambiguous";
    }
  | {
      candidateSegmentIds: string[];
      reason: string;
      status: "ambiguous" | "not_applicable";
    };

export type AccessoryProposalSystemMatch = {
  compatibleFamilyKeys: string[];
  domainAccessory?: AccessoryProposalDomainAccessory;
  reason: string;
  status: "resolved" | "needs_review" | "unsupported";
  suggestedCatalogCode?: string;
};

export type AccessoryProposal = {
  confidence: AccessoryProposalConfidence;
  domainAccessory?: AccessoryProposalDomainAccessory;
  evidence: AccessoryProposalEvidence;
  geometryKey: string;
  id: string;
  incidentSegmentIds: string[];
  kind: AccessoryProposalKind;
  nodeId: string;
  ownerResolution: AccessoryProposalOwnerResolution;
  position: Point2D;
  reason: string;
  state: AccessoryProposalState;
  suggestedCatalogCode?: string;
  systemMatch?: AccessoryProposalSystemMatch;
};

export type DetectRouteAccessoryProposalParams = {
  decisions?: AccessoryProposalDecision[];
  diameterBySegmentId?: AccessoryProposalDiameterBySegmentId;
  equipment: WorkbenchEquipment[];
  includeNonAccessoryObservations?: boolean;
  network: ManualRouteNetwork;
};

export type AccessoryProposalDiameterBySegmentId =
  | Map<string, AccessoryProposalDiameterReference | null | undefined>
  | Record<string, AccessoryProposalDiameterReference | null | undefined>;

type IncidentSegment = {
  neighborNodeId: string;
  neighborPosition: Point2D;
  segment: RouteSegment;
  vector: Point2D;
};

export function detectRouteAccessoryProposals(
  params: DetectRouteAccessoryProposalParams,
): AccessoryProposal[] {
  const equipmentById = buildEquipmentIndex(params.equipment);
  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const neighbors = getRouteNeighbors(params.network);
  const distancesFromSupply = calculateNodeDistancesFromSupply(params.network);
  const proposals: AccessoryProposal[] = [];

  for (const node of [...params.network.nodes].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    const position = resolveRouteNodePosition(node, equipmentById);

    if (!position) {
      continue;
    }

    const degree = neighbors.get(node.id)?.size ?? 0;
    const incident = resolveIncidentSegments({
      equipmentById,
      network: params.network,
      node,
      nodeById,
      position,
    });

    if (degree <= 1 || node.kind === "supply" || node.kind === "appliance") {
      if (params.includeNonAccessoryObservations) {
        proposals.push(
          createProposal({
            confidence: "high",
            evidence: {
              angleClassification: "terminal",
              degree,
              incidentNodeIds: incident.map((item) => item.neighborNodeId).sort(),
              note: "Nodo terminal; no se infiere valvula automaticamente.",
            },
            incident,
            kind: "terminal",
            nodeId: node.id,
            ownerResolution: {
              candidateSegmentIds: incident.map((item) => item.segment.id).sort(),
              reason: "Los terminales no crean accesorios automaticos en 09A.",
              status: "not_applicable",
            },
            position,
            reason: "Nodo terminal detectado sin accesorio tecnico automatico.",
            state: "needs_review",
          }),
        );
      }

      continue;
    }

    if (degree === 2) {
      const [first, second] = incident;

      if (!first || !second) {
        proposals.push(
          createProposal({
            confidence: "low",
            evidence: {
              angleClassification: "ambiguous",
              degree,
              incidentNodeIds: incident.map((item) => item.neighborNodeId).sort(),
              note: "No se pudieron resolver los dos tramos incidentes.",
            },
            incident,
            kind: "unsupported",
            nodeId: node.id,
            ownerResolution: {
              candidateSegmentIds: incident.map((item) => item.segment.id).sort(),
              reason: "Falta geometria suficiente para asignar propietario.",
              status: "ambiguous",
            },
            position,
            reason: "Nodo grado 2 con geometria insuficiente.",
            state: "needs_review",
          }),
        );
        continue;
      }

      const angle = angleBetweenVectors(first.vector, second.vector);
      const classification = classifyTwoSegmentAngle(angle);
      const incidentNodeIds = incident.map((item) => item.neighborNodeId).sort();

      if (classification === "colinear") {
        if (params.includeNonAccessoryObservations) {
          proposals.push(
            createProposal({
              confidence: "high",
              evidence: {
                angleClassification: "colinear",
                angleDegrees: roundGeometry(angle),
                degree,
                incidentNodeIds,
              },
              incident,
              kind: "straight",
              nodeId: node.id,
              ownerResolution: {
                candidateSegmentIds: incident.map((item) => item.segment.id).sort(),
                reason: "Un paso recto no requiere accesorio por defecto.",
                status: "not_applicable",
              },
              position,
              reason: "Paso recto colineal; no se propone accesorio.",
              state: "needs_review",
            }),
          );
        }

        continue;
      }

      const ownerResolution = resolveOwnerSegment({
        diameterBySegmentId: params.diameterBySegmentId,
        incidentSegmentIds: incident.map((item) => item.segment.id),
      });

      proposals.push(
        createProposal({
          confidence: classification === "turn" ? "high" : "low",
          domainAccessory: {
            equivalentLengthSource: "unresolved",
            reason: "Falta resolver una familia de accesorio compatible.",
            type: "elbow",
          },
          evidence: {
            angleClassification: classification,
            angleDegrees: roundGeometry(angle),
            degree,
            incidentNodeIds,
          },
          incident,
          kind: classification === "turn" ? "elbow" : "unsupported",
          nodeId: node.id,
          ownerResolution,
          position,
          reason:
            classification === "turn"
              ? "Cambio de direccion en nodo grado 2."
              : "Cambio de direccion demasiado cercano a la colinealidad.",
          state: classification === "turn" ? "proposed" : "needs_review",
        }),
      );
      continue;
    }

    if (degree === 3) {
      const branchRoles = incident.map((item) => ({
        neighborNodeId: item.neighborNodeId,
        role: branchRoleForNeighbor({
          distancesFromSupply,
          neighborNodeId: item.neighborNodeId,
          nodeId: node.id,
        }),
        segmentId: item.segment.id,
      }));

      proposals.push(
        createProposal({
          confidence: "high",
          domainAccessory: {
            equivalentLengthSource: "unresolved",
            reason: "La geometria no determina una fila SIGAS unica para la tee.",
            type: "tee",
          },
          evidence: {
            angleClassification: "branch",
            branchRoles,
            degree,
            incidentNodeIds: incident.map((item) => item.neighborNodeId).sort(),
          },
          incident,
          kind: "tee",
          nodeId: node.id,
          ownerResolution: {
            candidateSegmentIds: incident.map((item) => item.segment.id).sort(),
            reason:
              "Una tee requiere confirmar orientacion hidraulica y posible reduccion.",
            status: "ambiguous",
          },
          position,
          reason: "Nodo grado 3: derivacion tipo tee detectada.",
          state: "needs_review",
        }),
      );
      continue;
    }

    proposals.push(
      createProposal({
        confidence: "high",
        evidence: {
          angleClassification: "unsupported",
          degree,
          incidentNodeIds: incident.map((item) => item.neighborNodeId).sort(),
        },
        incident,
        kind: "unsupported",
        nodeId: node.id,
        ownerResolution: {
          candidateSegmentIds: incident.map((item) => item.segment.id).sort(),
          reason: "Nodo con cuatro o mas tramos; requiere revision profesional.",
          status: "ambiguous",
        },
        position,
        reason: "Cruce o nodo de grado 4+ no se convierte en accesorio SIGAS.",
        state: "needs_review",
      }),
    );
  }

  return applyAccessoryProposalDecisions({
    decisions: params.decisions ?? [],
    proposals,
  });
}

export function withAccessoryProposalSystemMatch(
  proposal: AccessoryProposal,
  systemMatch: AccessoryProposalSystemMatch,
): AccessoryProposal {
  const domainAccessory =
    systemMatch.domainAccessory ?? proposal.domainAccessory;

  return {
    ...proposal,
    domainAccessory,
    state:
      proposal.state === "confirmed" || proposal.state === "rejected"
        ? proposal.state
        : systemMatch.status === "resolved" &&
            proposal.ownerResolution.status === "unambiguous"
          ? "proposed"
          : "needs_review",
    suggestedCatalogCode: systemMatch.suggestedCatalogCode,
    systemMatch,
  };
}

export function applyAccessoryProposalDecisions(params: {
  decisions: AccessoryProposalDecision[];
  proposals: AccessoryProposal[];
}) {
  const decisionByProposalId = new Map(
    params.decisions.map((decision) => [decision.proposalId, decision]),
  );

  return params.proposals.map((proposal) => {
    const decision = decisionByProposalId.get(proposal.id);

    if (!decision || decision.geometryKey !== proposal.geometryKey) {
      return proposal;
    }

    if (decision.status === "pending") {
      return proposal;
    }

    return {
      ...proposal,
      state: decision.status,
    };
  });
}

export function confirmRouteAccessoryProposal(params: {
  origin?: AccessoryProposalDecisionOrigin;
  decidedAt: number;
  network: ManualRouteNetwork;
  ownerResolution?: AccessoryProposalOwnerResolution;
  proposal: AccessoryProposal;
  selection?: AccessoryCatalogSelection;
}):
  | {
      decision: AccessoryProposalDecision;
      network: ManualRouteNetwork;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    } {
  const ownerResolution =
    params.ownerResolution ?? params.proposal.ownerResolution;
  const selectedDomainAccessory = params.selection
    ? {
        catalogCode: params.selection.familyId,
        catalogFamilyId: params.selection.familyId,
        equivalentLengthSource: "pipe_system" as const,
        type: params.selection.type,
      }
    : params.proposal.domainAccessory;

  if (ownerResolution.status !== "unambiguous") {
    return {
      message: ownerResolution.reason,
      ok: false,
    };
  }

  if (
    !selectedDomainAccessory ||
    selectedDomainAccessory.equivalentLengthSource !== "pipe_system"
  ) {
    return {
      message:
        selectedDomainAccessory?.reason ??
        "La propuesta no tiene un accesorio tecnico resoluble.",
      ok: false,
    };
  }

  const catalogFamilyId =
    selectedDomainAccessory.catalogFamilyId ?? selectedDomainAccessory.catalogCode;

  if (!catalogFamilyId) {
    return {
      message:
        "Falta una familia tecnica inequivoca para confirmar la propuesta.",
      ok: false,
    };
  }

  if (
    routeAccessoryProposalHasManualAccessory({
      network: params.network,
      proposal: params.proposal,
      type: selectedDomainAccessory.type,
    })
  ) {
    return {
      message:
        "Ya existe un accesorio manual compatible en un tramo incidente; no se crea duplicado automatico.",
      ok: false,
    };
  }

  const ownerSegmentId = ownerResolution.ownerSegmentId;
  const accessoryId = automaticAccessoryId(params.proposal.id);
  const accessory: RouteSegmentAccessory = {
    catalogCode: catalogFamilyId,
    catalogFamilyId,
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id: accessoryId,
    origin: params.origin ?? "automatic_confirmed",
    quantity: 1,
    segmentId: ownerSegmentId,
    type: selectedDomainAccessory.type,
  };
  const network = upsertRouteSegmentAccessory({
    accessory,
    network: removeAutomaticAccessoryById(params.network, accessoryId),
    ownerSegmentId,
  });

  return {
    decision: {
      accessoryId,
      catalogFamilyId,
      decidedAt: params.decidedAt,
      geometryKey: params.proposal.geometryKey,
      origin: params.origin ?? "automatic_confirmed",
      ownerSegmentId,
      pipeSystemId: params.selection?.pipeSystemId,
      proposalId: params.proposal.id,
      status: "confirmed",
    },
    network,
    ok: true,
  };
}

export function rejectRouteAccessoryProposal(params: {
  decidedAt: number;
  network: ManualRouteNetwork;
  proposal: AccessoryProposal;
}) {
  const accessoryId = automaticAccessoryId(params.proposal.id);

  return {
    decision: {
      accessoryId,
      decidedAt: params.decidedAt,
      geometryKey: params.proposal.geometryKey,
      proposalId: params.proposal.id,
      status: "rejected" as const,
    },
    network: removeAutomaticAccessoryById(params.network, accessoryId),
  };
}

export function reconcileRouteAccessoryProposalState(params: {
  decisions: AccessoryProposalDecision[];
  network: ManualRouteNetwork;
  proposals: AccessoryProposal[];
}) {
  const proposalById = new Map(
    params.proposals.map((proposal) => [proposal.id, proposal]),
  );
  const decisions = params.decisions.filter((decision) => {
    const proposal = proposalById.get(decision.proposalId);
    return Boolean(proposal && proposal.geometryKey === decision.geometryKey);
  });
  const confirmedAccessoryIds = new Set(
    decisions
      .filter((decision) => decision.status === "confirmed")
      .map((decision) => decision.accessoryId)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    decisions,
    network: removeStaleAutomaticAccessories({
      confirmedAccessoryIds,
      network: params.network,
    }),
  };
}

export function upsertAccessoryProposalDecision(
  decisions: AccessoryProposalDecision[],
  decision: AccessoryProposalDecision,
) {
  return [
    ...decisions.filter((item) => item.proposalId !== decision.proposalId),
    decision,
  ].sort((first, second) => first.proposalId.localeCompare(second.proposalId));
}

export function accessoryProposalStateAllowsConfirmation(
  proposal: AccessoryProposal,
) {
  return (
    proposal.state === "proposed" &&
    proposal.ownerResolution.status === "unambiguous" &&
    proposal.domainAccessory?.equivalentLengthSource === "pipe_system" &&
    Boolean(proposal.domainAccessory.catalogCode)
  );
}

export function accessoryProposalStateAllowsRejection(
  proposal: AccessoryProposal,
) {
  return proposal.state === "proposed";
}

export function automaticAccessoryId(proposalId: string) {
  return `route-accessory:${proposalId}`;
}

export function resolveAccessoryProposalTechnicalOwner(params: {
  diameterBySegmentId?: AccessoryProposalDiameterBySegmentId;
  network: ManualRouteNetwork;
  proposal: AccessoryProposal;
}): AccessoryProposalOwnerResolution {
  const candidateSegmentIds = [...params.proposal.incidentSegmentIds].sort();

  if (candidateSegmentIds.length === 0) {
    return {
      candidateSegmentIds,
      reason: "No hay tramos candidatos para alojar el accesorio.",
      status: "ambiguous",
    };
  }

  const diameters = candidateSegmentIds.map((segmentId) =>
    getDiameter(params.diameterBySegmentId, segmentId),
  );

  if (diameters.some((diameter) => !diameter)) {
    return {
      candidateSegmentIds,
      reason: "Falta diametro calculado en algun tramo incidente.",
      status: "ambiguous",
    };
  }

  const [firstDiameter] = diameters;
  const sameDiameter = diameters.every(
    (diameter) =>
      diameter && firstDiameter && diameterKey(diameter) === diameterKey(firstDiameter),
  );

  if (!sameDiameter) {
    return {
      candidateSegmentIds,
      reason: "Cambio de diametro detectado; requiere resolver transicion.",
      status: "ambiguous",
    };
  }

  return {
    candidateSegmentIds,
    ownerSegmentId:
      upstreamIncidentSegmentId(params.network, params.proposal) ??
      candidateSegmentIds[0],
    status: "unambiguous",
  };
}

export function routeAccessoryProposalHasManualAccessory(params: {
  network: ManualRouteNetwork;
  proposal: AccessoryProposal;
  type?: RouteAccessoryType;
}) {
  const incidentSegmentIds = new Set(params.proposal.incidentSegmentIds);

  return params.network.segments
    .filter((segment) => incidentSegmentIds.has(segment.id))
    .some((segment) =>
      (segment.accessories ?? []).some(
        (accessory) =>
          !accessory.id.startsWith(AUTOMATIC_ACCESSORY_ID_PREFIX) &&
          accessory.origin !== "automatic_confirmed" &&
          accessory.origin !== "user_confirmed" &&
          (!params.type || accessory.type === params.type),
      ),
    );
}

function createProposal(params: {
  confidence: AccessoryProposalConfidence;
  domainAccessory?: AccessoryProposalDomainAccessory;
  evidence: AccessoryProposalEvidence;
  incident: IncidentSegment[];
  kind: AccessoryProposalKind;
  nodeId: string;
  ownerResolution: AccessoryProposalOwnerResolution;
  position: Point2D;
  reason: string;
  state: AccessoryProposalState;
}): AccessoryProposal {
  const incidentSegmentIds = params.incident
    .map((item) => item.segment.id)
    .sort();
  const geometryKey = [
    params.nodeId,
    params.kind,
    pointKey(params.position),
    incidentSegmentIds.join(","),
    params.evidence.incidentNodeIds.join(","),
    params.evidence.angleDegrees ?? "",
    params.evidence.angleClassification,
  ].join("|");
  const id = `accessory-proposal:${params.nodeId}:${params.kind}:${hashString(
    geometryKey,
  )}`;

  return {
    confidence: params.confidence,
    domainAccessory: params.domainAccessory,
    evidence: params.evidence,
    geometryKey,
    id,
    incidentSegmentIds,
    kind: params.kind,
    nodeId: params.nodeId,
    ownerResolution: params.ownerResolution,
    position: params.position,
    reason: params.reason,
    state: params.state,
  };
}

function resolveIncidentSegments(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  network: ManualRouteNetwork;
  node: RouteNode;
  nodeById: Map<string, RouteNode>;
  position: Point2D;
}): IncidentSegment[] {
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
        neighborNodeId,
        neighborPosition,
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

function resolveOwnerSegment(params: {
  diameterBySegmentId?: AccessoryProposalDiameterBySegmentId;
  incidentSegmentIds: string[];
}): AccessoryProposalOwnerResolution {
  const candidateSegmentIds = [...params.incidentSegmentIds].sort();

  if (candidateSegmentIds.length === 0) {
    return {
      candidateSegmentIds,
      reason: "No hay tramos candidatos para alojar el accesorio.",
      status: "ambiguous",
    };
  }

  if (candidateSegmentIds.length === 1) {
    return {
      candidateSegmentIds,
      ownerSegmentId: candidateSegmentIds[0],
      status: "unambiguous",
    };
  }

  const diameters = candidateSegmentIds.map((segmentId) =>
    getDiameter(params.diameterBySegmentId, segmentId),
  );

  if (diameters.some((diameter) => !diameter)) {
    return {
      candidateSegmentIds,
      reason:
        "Faltan diametros incidentes para elegir propietario sin afectar Tabla No 3.",
      status: "ambiguous",
    };
  }

  const [firstDiameter] = diameters;
  const allSameDiameter = diameters.every(
    (diameter) =>
      diameter && firstDiameter && diameterKey(diameter) === diameterKey(firstDiameter),
  );

  if (!allSameDiameter) {
    return {
      candidateSegmentIds,
      reason:
        "Los tramos incidentes tienen diametros distintos; requiere regla tecnica adicional.",
      status: "ambiguous",
    };
  }

  return {
    candidateSegmentIds,
    ownerSegmentId: candidateSegmentIds[0],
    status: "unambiguous",
  };
}

function getDiameter(
  diameterBySegmentId: AccessoryProposalDiameterBySegmentId | undefined,
  segmentId: string,
) {
  if (!diameterBySegmentId) {
    return null;
  }

  return diameterBySegmentId instanceof Map
    ? diameterBySegmentId.get(segmentId) ?? null
    : diameterBySegmentId[segmentId] ?? null;
}

function diameterKey(diameter: AccessoryProposalDiameterReference) {
  return [
    diameter.id,
    diameter.externalDiameterMillimeters ?? "",
    diameter.internalDiameterMillimeters ?? "",
  ].join(":");
}

function calculateNodeDistancesFromSupply(network: ManualRouteNetwork) {
  const supplyNode = network.nodes.find((node) => node.kind === "supply") ?? null;
  const distances = new Map<string, number>();

  if (!supplyNode) {
    return distances;
  }

  const neighbors = getRouteNeighbors(network);
  const queue = [supplyNode.id];
  distances.set(supplyNode.id, 0);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentDistance = distances.get(current) ?? 0;

    for (const next of neighbors.get(current) ?? []) {
      if (!distances.has(next)) {
        distances.set(next, currentDistance + 1);
        queue.push(next);
      }
    }
  }

  return distances;
}

function branchRoleForNeighbor(params: {
  distancesFromSupply: Map<string, number>;
  neighborNodeId: string;
  nodeId: string;
}): AccessoryProposalBranchRole["role"] {
  const nodeDistance = params.distancesFromSupply.get(params.nodeId);
  const neighborDistance = params.distancesFromSupply.get(params.neighborNodeId);

  if (nodeDistance === undefined || neighborDistance === undefined) {
    return "unknown";
  }

  return neighborDistance < nodeDistance ? "upstream" : "branch";
}

function upstreamIncidentSegmentId(
  network: ManualRouteNetwork,
  proposal: AccessoryProposal,
) {
  const distances = calculateNodeDistancesFromSupply(network);
  const proposalDistance = distances.get(proposal.nodeId);

  if (proposalDistance === undefined) {
    return null;
  }

  return (
    [...network.segments]
      .filter((segment) => proposal.incidentSegmentIds.includes(segment.id))
      .map((segment) => {
        const neighborNodeId =
          segment.fromNodeId === proposal.nodeId
            ? segment.toNodeId
            : segment.toNodeId === proposal.nodeId
              ? segment.fromNodeId
              : null;
        const neighborDistance = neighborNodeId
          ? distances.get(neighborNodeId)
          : undefined;

        return neighborDistance !== undefined &&
          neighborDistance < proposalDistance
          ? segment.id
          : null;
      })
      .filter((segmentId): segmentId is string => Boolean(segmentId))
      .sort()[0] ?? null
  );
}

function removeAutomaticAccessoryById(
  network: ManualRouteNetwork,
  accessoryId: string,
): ManualRouteNetwork {
  let didChange = false;
  const segments = network.segments.map((segment) => {
    const accessories = segment.accessories ?? [];
    const nextAccessories = accessories.filter(
      (accessory) => accessory.id !== accessoryId,
    );

    if (nextAccessories.length === accessories.length) {
      return segment;
    }

    didChange = true;
    return {
      ...segment,
      accessories: nextAccessories.length > 0 ? nextAccessories : undefined,
    };
  });

  return didChange ? { ...network, segments } : network;
}

function removeStaleAutomaticAccessories(params: {
  confirmedAccessoryIds: Set<string>;
  network: ManualRouteNetwork;
}): ManualRouteNetwork {
  let didChange = false;
  const segments = params.network.segments.map((segment) => {
    const accessories = segment.accessories ?? [];
    const nextAccessories = accessories.filter(
      (accessory) =>
        !accessory.id.startsWith(AUTOMATIC_ACCESSORY_ID_PREFIX) ||
        params.confirmedAccessoryIds.has(accessory.id),
    );

    if (nextAccessories.length === accessories.length) {
      return segment;
    }

    didChange = true;
    return {
      ...segment,
      accessories: nextAccessories.length > 0 ? nextAccessories : undefined,
    };
  });

  return didChange ? { ...params.network, segments } : params.network;
}

function upsertRouteSegmentAccessory(params: {
  accessory: RouteSegmentAccessory;
  network: ManualRouteNetwork;
  ownerSegmentId: string;
}): ManualRouteNetwork {
  let didChange = false;
  const segments = params.network.segments.map((segment) => {
    if (segment.id !== params.ownerSegmentId) {
      return segment;
    }

    didChange = true;
    const accessories = [
      ...(segment.accessories ?? []).filter(
        (accessory) => accessory.id !== params.accessory.id,
      ),
      params.accessory,
    ].sort((first, second) => first.id.localeCompare(second.id));

    return {
      ...segment,
      accessories,
    };
  });

  return didChange ? { ...params.network, segments } : params.network;
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
