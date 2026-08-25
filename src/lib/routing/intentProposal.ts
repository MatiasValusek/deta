import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  generateAutomaticRouteProposal,
  type GenerateAutomaticRouteProposalInput,
} from "@/lib/routing/autoProposal";
import type {
  AutomaticRouteProposal,
  RouteIntentConnection,
  RouteIntentEndpoint,
} from "@/lib/routing/types";

export type BuildProposalFromIntentInput = GenerateAutomaticRouteProposalInput & {
  intentConnections: RouteIntentConnection[];
};

export function buildProposalFromIntent(
  input: BuildProposalFromIntentInput,
): AutomaticRouteProposal {
  const preferredApplianceOrder = createPreferredApplianceOrder(
    input.intentConnections,
    input.equipment,
  );

  return generateAutomaticRouteProposal({
    ...input,
    preferredApplianceOrder,
    preferredBranchEquipmentIdsByApplianceId: createPreferredBranchEquipmentIds(
      input.intentConnections,
      input.equipment,
      preferredApplianceOrder,
    ),
  });
}

export function routeIntentEndpointKey(endpoint: RouteIntentEndpoint) {
  return `${endpoint.kind}:${endpoint.equipmentId}`;
}

export function routeIntentConnectionKey(
  first: RouteIntentEndpoint,
  second: RouteIntentEndpoint,
) {
  return [routeIntentEndpointKey(first), routeIntentEndpointKey(second)]
    .sort()
    .join("<->");
}

export function routeIntentConnectionReferencesEquipment(
  connection: RouteIntentConnection,
  equipmentId: string,
) {
  return (
    connection.from.equipmentId === equipmentId ||
    connection.to.equipmentId === equipmentId
  );
}

export function routeIntentConnectionsEqual(
  connection: RouteIntentConnection,
  first: RouteIntentEndpoint,
  second: RouteIntentEndpoint,
) {
  return (
    routeIntentConnectionKey(connection.from, connection.to) ===
    routeIntentConnectionKey(first, second)
  );
}

function createPreferredApplianceOrder(
  intentConnections: RouteIntentConnection[],
  equipment: WorkbenchEquipment[],
) {
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const supplyIds = equipment
    .filter((item) => item.role === "supply")
    .map((item) => item.id)
    .sort();
  const adjacency = new Map<string, Array<{ id: string; order: number }>>();

  intentConnections.forEach((connection, order) => {
    const from = equipmentById.get(connection.from.equipmentId);
    const to = equipmentById.get(connection.to.equipmentId);

    if (!from || !to) {
      return;
    }

    addNeighbor(adjacency, from.id, to.id, order);
    addNeighbor(adjacency, to.id, from.id, order);
  });

  const visited = new Set<string>();
  const queue: string[] = [];
  const order: string[] = [];

  for (const supplyId of supplyIds) {
    visited.add(supplyId);
    queue.push(supplyId);
  }

  while (queue.length > 0) {
    const currentId = queue.shift() as string;
    const neighbors = [...(adjacency.get(currentId) ?? [])].sort(
      (first, second) => first.order - second.order || first.id.localeCompare(second.id),
    );

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.id)) {
        continue;
      }

      visited.add(neighbor.id);
      queue.push(neighbor.id);

      if (equipmentById.get(neighbor.id)?.role === "appliance") {
        order.push(neighbor.id);
      }
    }
  }

  for (const connection of intentConnections) {
    for (const endpoint of [connection.from, connection.to]) {
      const equipmentItem = equipmentById.get(endpoint.equipmentId);

      if (
        equipmentItem?.role === "appliance" &&
        !visited.has(equipmentItem.id)
      ) {
        visited.add(equipmentItem.id);
        order.push(equipmentItem.id);
      }
    }
  }

  return order;
}

function createPreferredBranchEquipmentIds(
  intentConnections: RouteIntentConnection[],
  equipment: WorkbenchEquipment[],
  preferredApplianceOrder: string[],
) {
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const rank = new Map(
    preferredApplianceOrder.map((equipmentId, index) => [equipmentId, index]),
  );
  const anchorsByApplianceId = new Map<string, string[]>();

  for (const connection of intentConnections) {
    const from = equipmentById.get(connection.from.equipmentId);
    const to = equipmentById.get(connection.to.equipmentId);

    if (!from || !to || from.role !== "appliance" || to.role !== "appliance") {
      continue;
    }

    const fromRank = rank.get(from.id) ?? Number.POSITIVE_INFINITY;
    const toRank = rank.get(to.id) ?? Number.POSITIVE_INFINITY;

    if (fromRank === toRank) {
      continue;
    }

    const earlier = fromRank < toRank ? from : to;
    const later = fromRank < toRank ? to : from;
    const current = anchorsByApplianceId.get(later.id) ?? [];

    if (!current.includes(earlier.id)) {
      current.push(earlier.id);
    }

    anchorsByApplianceId.set(later.id, current);
  }

  return Object.fromEntries(
    [...anchorsByApplianceId.entries()].map(([equipmentId, anchors]) => [
      equipmentId,
      anchors.sort(),
    ]),
  );
}

function addNeighbor(
  adjacency: Map<string, Array<{ id: string; order: number }>>,
  fromId: string,
  toId: string,
  order: number,
) {
  const current = adjacency.get(fromId) ?? [];

  if (!current.some((item) => item.id === toId)) {
    current.push({ id: toId, order });
  }

  adjacency.set(fromId, current);
}
