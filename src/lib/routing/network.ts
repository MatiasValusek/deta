import type { Point2D } from "@/lib/geometry/types";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { pointZMeters } from "@/lib/geometry/height";
import {
  projectPointToSegment,
  segmentsIntersect,
} from "./geometry";
import type {
  ManualRouteNetwork,
  ResolvedRouteSegment,
  RouteNode,
  RouteSegment,
} from "./types";

export const EMPTY_ROUTE_NETWORK: ManualRouteNetwork = {
  nodes: [],
  segments: [],
};

export function createEmptyRouteNetwork(): ManualRouteNetwork {
  return {
    nodes: [],
    segments: [],
  };
}

export function routeEquipmentNodeId(planBaseId: string, equipmentId: string) {
  return `route-node:${planBaseId}:equipment:${equipmentId}`;
}

export function buildEquipmentIndex(equipment: WorkbenchEquipment[]) {
  return new Map(equipment.map((item) => [item.id, item]));
}

export function resolveRouteNodePosition(
  node: RouteNode,
  equipmentById: Map<string, WorkbenchEquipment>,
): Point2D | null {
  if (node.kind === "route") {
    return node.position ?? null;
  }

  if (!node.equipmentId) {
    return null;
  }

  return equipmentById.get(node.equipmentId)?.connectionPoint ?? null;
}

export function resolveRouteSegments(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
): ResolvedRouteSegment[] {
  const equipmentById = buildEquipmentIndex(equipment);
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const resolved: ResolvedRouteSegment[] = [];

  for (const segment of network.segments) {
    const fromNode = nodeById.get(segment.fromNodeId);
    const toNode = nodeById.get(segment.toNodeId);

    if (!fromNode || !toNode) {
      continue;
    }

    const from = resolveRouteNodePosition(fromNode, equipmentById);
    const to = resolveRouteNodePosition(toNode, equipmentById);

    if (!from || !to) {
      continue;
    }

    resolved.push({
      ...segment,
      from,
      to,
    });
  }

  return resolved;
}

export function getRouteNeighbors(network: ManualRouteNetwork) {
  const neighbors = new Map<string, Set<string>>();

  for (const node of network.nodes) {
    neighbors.set(node.id, new Set());
  }

  for (const segment of network.segments) {
    if (!neighbors.has(segment.fromNodeId)) {
      neighbors.set(segment.fromNodeId, new Set());
    }

    if (!neighbors.has(segment.toNodeId)) {
      neighbors.set(segment.toNodeId, new Set());
    }

    neighbors.get(segment.fromNodeId)?.add(segment.toNodeId);
    neighbors.get(segment.toNodeId)?.add(segment.fromNodeId);
  }

  return neighbors;
}

export function getRouteNodeDegree(
  network: ManualRouteNetwork,
  nodeId: string,
) {
  return getRouteNeighbors(network).get(nodeId)?.size ?? 0;
}

export function hasRoutePath(
  network: ManualRouteNetwork,
  fromNodeId: string,
  toNodeId: string,
) {
  if (fromNodeId === toNodeId) {
    return true;
  }

  const neighbors = getRouteNeighbors(network);
  const visited = new Set<string>();
  const queue = [fromNodeId];

  while (queue.length > 0) {
    const current = queue.shift() as string;

    if (current === toNodeId) {
      return true;
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const next of neighbors.get(current) ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  return false;
}

export function detectRouteCycle(network: ManualRouteNetwork) {
  const neighbors = getRouteNeighbors(network);
  const visited = new Set<string>();

  function visit(nodeId: string, parentId: string | null): boolean {
    visited.add(nodeId);

    for (const nextId of neighbors.get(nodeId) ?? []) {
      if (nextId === parentId) {
        continue;
      }

      if (visited.has(nextId) || visit(nextId, nodeId)) {
        return true;
      }
    }

    return false;
  }

  for (const node of network.nodes) {
    if (!visited.has(node.id) && visit(node.id, null)) {
      return true;
    }
  }

  return false;
}

export function getDerivationNodeIds(network: ManualRouteNetwork) {
  const neighbors = getRouteNeighbors(network);

  return network.nodes
    .filter((node) => (neighbors.get(node.id)?.size ?? 0) >= 3)
    .map((node) => node.id);
}

export function findRouteNodeByEquipment(
  network: ManualRouteNetwork,
  equipmentId: string,
) {
  return network.nodes.find((node) => node.equipmentId === equipmentId) ?? null;
}

export function getConnectedApplianceEquipmentIds(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  const supply = equipment.find((item) => item.role === "supply") ?? null;

  if (!supply) {
    return new Set<string>();
  }

  const supplyNode = findRouteNodeByEquipment(network, supply.id);

  if (!supplyNode) {
    return new Set<string>();
  }

  return new Set(
    equipment
      .filter((item) => item.role === "appliance")
      .filter((item) => {
        const node = findRouteNodeByEquipment(network, item.id);
        return node ? hasRoutePath(network, supplyNode.id, node.id) : false;
      })
      .map((item) => item.id),
  );
}

export function getRoutePath(
  network: ManualRouteNetwork,
  fromNodeId: string,
  toNodeId: string,
) {
  const neighbors = getRouteNeighbors(network);
  const previous = new Map<string, string | null>();
  const queue = [fromNodeId];
  previous.set(fromNodeId, null);

  while (queue.length > 0) {
    const current = queue.shift() as string;

    if (current === toNodeId) {
      break;
    }

    for (const next of neighbors.get(current) ?? []) {
      if (!previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
    }
  }

  if (!previous.has(toNodeId)) {
    return [];
  }

  const path: string[] = [];
  let current: string | null = toNodeId;

  while (current) {
    path.unshift(current);
    current = previous.get(current) ?? null;
  }

  return path;
}

export function segmentIdsForNodePath(
  network: ManualRouteNetwork,
  nodePath: string[],
) {
  const ids: string[] = [];

  for (let index = 0; index < nodePath.length - 1; index += 1) {
    const from = nodePath[index];
    const to = nodePath[index + 1];
    const segment = network.segments.find((item) =>
      segmentConnects(item, from, to),
    );

    if (segment) {
      ids.push(segment.id);
    }
  }

  return ids;
}

export function getExclusiveBranchForAppliance(
  network: ManualRouteNetwork,
  applianceEquipmentId: string,
) {
  const applianceNode = findRouteNodeByEquipment(network, applianceEquipmentId);

  if (!applianceNode) {
    return {
      nodeIds: [],
      segmentIds: [],
    };
  }

  const neighbors = getRouteNeighbors(network);
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const nodeIds = [applianceNode.id];
  const segmentIds: string[] = [];
  let previousId: string | null = null;
  let currentId = applianceNode.id;

  while (true) {
    const nextCandidates = [...(neighbors.get(currentId) ?? [])].filter(
      (nodeId) => nodeId !== previousId,
    );

    if (nextCandidates.length !== 1) {
      break;
    }

    const nextId = nextCandidates[0];
    const segment = network.segments.find((item) =>
      segmentConnects(item, currentId, nextId),
    );

    if (segment) {
      segmentIds.push(segment.id);
    }

    previousId = currentId;
    currentId = nextId;
    const currentNode = nodeById.get(currentId);
    const degree = neighbors.get(currentId)?.size ?? 0;

    if (!currentNode || currentNode.kind === "supply" || degree !== 2) {
      break;
    }

    nodeIds.push(currentId);
  }

  return {
    nodeIds,
    segmentIds,
  };
}

export function removeApplianceBranch(
  network: ManualRouteNetwork,
  applianceEquipmentId: string,
) {
  const branch = getExclusiveBranchForAppliance(network, applianceEquipmentId);
  const segmentIds = new Set(branch.segmentIds);
  const nodeIds = new Set(branch.nodeIds);
  const nextNetwork = {
    nodes: network.nodes.filter((node) => !nodeIds.has(node.id)),
    segments: network.segments.filter((segment) => !segmentIds.has(segment.id)),
  };

  return pruneOrphanRouteNodes(nextNetwork);
}

export function pruneOrphanRouteNodes(network: ManualRouteNetwork) {
  let next = {
    nodes: [...network.nodes],
    segments: [...network.segments],
  };
  let didChange = true;

  while (didChange) {
    didChange = false;
    const neighbors = getRouteNeighbors(next);
    const removable = new Set(
      next.nodes
        .filter((node) => node.kind !== "supply")
        .filter((node) => (neighbors.get(node.id)?.size ?? 0) === 0)
        .map((node) => node.id),
    );

    if (removable.size > 0) {
      next = {
        nodes: next.nodes.filter((node) => !removable.has(node.id)),
        segments: next.segments.filter(
          (segment) =>
            !removable.has(segment.fromNodeId) &&
            !removable.has(segment.toNodeId),
        ),
      };
      didChange = true;
    }
  }

  return next;
}

export function totalRouteLengthSource(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  return resolveRouteSegments(network, equipment).reduce(
    (sum, segment) => sum + distanceBetween(segment.from, segment.to),
    0,
  );
}

export function hasDuplicateSegments(network: ManualRouteNetwork) {
  const seen = new Set<string>();

  for (const segment of network.segments) {
    const key = segmentKey(segment.fromNodeId, segment.toNodeId);

    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

export function hasZeroLengthSegments(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
  tolerance: number,
) {
  return resolveRouteSegments(network, equipment).some(
    (segment) =>
      distanceBetween(segment.from, segment.to) <= tolerance &&
      Math.abs(pointZMeters(segment.from) - pointZMeters(segment.to)) <=
        Number.EPSILON,
  );
}

export function hasRouteCrossingsWithoutNode(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  const segments = resolveRouteSegments(network, equipment);

  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < segments.length;
      secondIndex += 1
    ) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];

      if (
        first.fromNodeId === second.fromNodeId ||
        first.fromNodeId === second.toNodeId ||
        first.toNodeId === second.fromNodeId ||
        first.toNodeId === second.toNodeId
      ) {
        continue;
      }

      if (segmentsIntersect(first.from, first.to, second.from, second.to)) {
        return true;
      }
    }
  }

  return false;
}

export function splitRouteSegmentAtPoint(params: {
  createNode: (point: Point2D) => RouteNode;
  createSegment: (
    fromNodeId: string,
    toNodeId: string,
    origin: RouteSegment["origin"],
  ) => RouteSegment;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  point: Point2D;
  segmentId: string;
  tolerance: number;
}):
  | {
      ok: true;
      network: ManualRouteNetwork;
      nodeId: string;
      point: Point2D;
    }
  | {
      ok: false;
      message: string;
    } {
  const original = params.network.segments.find(
    (segment) => segment.id === params.segmentId,
  );

  if (!original) {
    return {
      ok: false,
      message: "No se encontro el tramo elegido como derivacion.",
    };
  }

  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const equipmentById = buildEquipmentIndex(params.equipment);
  const fromNode = nodeById.get(original.fromNodeId) ?? null;
  const toNode = nodeById.get(original.toNodeId) ?? null;
  const fromPoint = fromNode
    ? resolveRouteNodePosition(fromNode, equipmentById)
    : null;
  const toPoint = toNode ? resolveRouteNodePosition(toNode, equipmentById) : null;

  if (!fromNode || !toNode || !fromPoint || !toPoint) {
    return {
      ok: false,
      message: "No se encontro el tramo elegido como derivacion.",
    };
  }

  const projection = projectPointToSegment(params.point, fromPoint, toPoint);
  const endpointHit = nearestReusableEndpoint({
    clickedPoint: params.point,
    fromNode,
    fromPoint,
    projectionPoint: projection.point,
    toNode,
    toPoint,
    tolerance: params.tolerance,
  });

  if (endpointHit?.node.kind === "appliance") {
    return {
      ok: false,
      message:
        "El extremo elegido pertenece a un artefacto conectado. Elegi un nodo de derivacion o un punto interior del tramo.",
    };
  }

  if (endpointHit) {
    return {
      ok: true,
      network: params.network,
      nodeId: endpointHit.node.id,
      point: endpointHit.point,
    };
  }

  if (
    projection.distance > params.tolerance ||
    projection.t <= 0 ||
    projection.t >= 1
  ) {
    return {
      ok: false,
      message: "Elegi un punto interior valido del tramo.",
    };
  }

  if (
    distanceBetween(projection.point, fromPoint) <= params.tolerance ||
    distanceBetween(projection.point, toPoint) <= params.tolerance
  ) {
    return {
      ok: false,
      message: "Elegi un punto mas alejado de los extremos del tramo.",
    };
  }

  const existingNode = findExistingRouteNodeAtPoint(
    params.network,
    params.equipment,
    projection.point,
    params.tolerance,
  );

  if (existingNode) {
    if (existingNode.kind === "appliance") {
      return {
        ok: false,
        message:
          "El punto elegido coincide con un artefacto conectado. Elegi un nodo de derivacion o un punto interior del tramo.",
      };
    }

    return {
      ok: true,
      network: params.network,
      nodeId: existingNode.id,
      point:
        resolveRouteNodePosition(existingNode, equipmentById) ??
        projection.point,
    };
  }

  const node = params.createNode(projection.point);

  if (node.kind !== "route" || !node.position) {
    return {
      ok: false,
      message: "La derivacion necesita un nodo tecnico valido.",
    };
  }

  if (params.network.nodes.some((current) => current.id === node.id)) {
    return {
      ok: false,
      message: "La derivacion genera un ID de nodo duplicado.",
    };
  }

  const replacementOrigin = original.origin ?? "manual";
  const replacementSegments = [
    params.createSegment(original.fromNodeId, node.id, replacementOrigin),
    params.createSegment(node.id, original.toNodeId, replacementOrigin),
  ];
  const nextNetwork = {
    nodes: [...params.network.nodes, node],
    segments: [
      ...params.network.segments.filter((segment) => segment.id !== original.id),
      ...replacementSegments,
    ],
  };

  if (hasDuplicateNodeIds(nextNetwork)) {
    return {
      ok: false,
      message: "La derivacion genera IDs de nodos duplicados.",
    };
  }

  if (hasDuplicateSegmentIds(nextNetwork)) {
    return {
      ok: false,
      message: "La derivacion genera IDs de tramos duplicados.",
    };
  }

  if (hasZeroLengthSegments(nextNetwork, params.equipment, params.tolerance)) {
    return {
      ok: false,
      message: "La derivacion contiene un tramo sin longitud.",
    };
  }

  return {
    ok: true,
    network: nextNetwork,
    nodeId: node.id,
    point: projection.point,
  };
}

export function findTerminalApplianceBranchAnchor(
  network: ManualRouteNetwork,
  applianceEquipmentId: string,
):
  | {
      ok: true;
      nodeId: string;
    }
  | {
      ok: false;
      message: string;
    } {
  const applianceNode = findRouteNodeByEquipment(network, applianceEquipmentId);

  if (!applianceNode || applianceNode.kind !== "appliance") {
    return {
      ok: false,
      message: "El artefacto elegido todavia no esta conectado a la red.",
    };
  }

  const neighbors = getRouteNeighbors(network).get(applianceNode.id) ?? new Set();

  if (neighbors.size !== 1) {
    return {
      ok: false,
      message: "El artefacto elegido no es una hoja terminal valida.",
    };
  }

  const [neighborId] = [...neighbors];
  const neighbor = network.nodes.find((node) => node.id === neighborId) ?? null;

  if (!neighbor || neighbor.kind === "appliance") {
    return {
      ok: false,
      message: "El artefacto elegido no tiene un nodo de red para ramificar.",
    };
  }

  return {
    ok: true,
    nodeId: neighbor.id,
  };
}

export function resolveTerminalApplianceBranchOrigin(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  applianceEquipmentId: string;
  createSplitNodeId: () => string;
  tolerance: number;
}):
  | {
      ok: true;
      nodeId: string;
      point: Point2D;
      splitSegmentId: string;
    }
  | {
      ok: false;
      message: string;
    } {
  const applianceNode = findRouteNodeByEquipment(
    params.network,
    params.applianceEquipmentId,
  );

  if (!applianceNode || applianceNode.kind !== "appliance") {
    return {
      ok: false,
      message: "El artefacto elegido todavia no esta conectado a la red.",
    };
  }

  const neighbors = getRouteNeighbors(params.network).get(applianceNode.id) ?? new Set();

  if (neighbors.size !== 1) {
    return {
      ok: false,
      message: "El artefacto elegido no es una hoja terminal valida.",
    };
  }

  const [networkNodeId] = [...neighbors];
  const networkNode =
    params.network.nodes.find((node) => node.id === networkNodeId) ?? null;

  if (!networkNode || networkNode.kind === "appliance") {
    return {
      ok: false,
      message: "El artefacto elegido no tiene un nodo tecnico asociado.",
    };
  }

  const terminalSegment =
    params.network.segments.find((segment) =>
      segmentConnects(segment, applianceNode.id, networkNode.id),
    ) ?? null;

  if (!terminalSegment) {
    return {
      ok: false,
      message: "No se encontro el tramo terminal del artefacto elegido.",
    };
  }

  const equipmentById = buildEquipmentIndex(params.equipment);
  const appliancePoint = resolveRouteNodePosition(applianceNode, equipmentById);
  const networkPoint = resolveRouteNodePosition(networkNode, equipmentById);

  if (!appliancePoint || !networkPoint) {
    return {
      ok: false,
      message: "No se pudo resolver la geometria del tramo terminal.",
    };
  }

  const length = distanceBetween(appliancePoint, networkPoint);

  if (length <= params.tolerance * 2) {
    return {
      ok: false,
      message:
        "El tramo terminal del artefacto es demasiado corto para ramificar sin crear un tramo microscopico.",
    };
  }

  return {
    ok: true,
    nodeId: params.createSplitNodeId(),
    point: {
      x: (appliancePoint.x + networkPoint.x) / 2,
      y: (appliancePoint.y + networkPoint.y) / 2,
    },
    splitSegmentId: terminalSegment.id,
  };
}

export function applianceNodesAreTerminal(network: ManualRouteNetwork) {
  return network.nodes
    .filter((node) => node.kind === "appliance")
    .every((node) => getRouteNodeDegree(network, node.id) === 1);
}

export function hasDuplicateNodeIds(network: ManualRouteNetwork) {
  const seen = new Set<string>();

  for (const node of network.nodes) {
    if (seen.has(node.id)) {
      return true;
    }

    seen.add(node.id);
  }

  return false;
}

export function hasDuplicateSegmentIds(network: ManualRouteNetwork) {
  const seen = new Set<string>();

  for (const segment of network.segments) {
    if (seen.has(segment.id)) {
      return true;
    }

    seen.add(segment.id);
  }

  return false;
}

export function hasSegmentsWithMissingEndpoints(network: ManualRouteNetwork) {
  const nodeIds = new Set(network.nodes.map((node) => node.id));

  return network.segments.some(
    (segment) =>
      !nodeIds.has(segment.fromNodeId) || !nodeIds.has(segment.toNodeId),
  );
}

export function segmentConnects(
  segment: RouteSegment,
  firstNodeId: string,
  secondNodeId: string,
) {
  return (
    (segment.fromNodeId === firstNodeId && segment.toNodeId === secondNodeId) ||
    (segment.fromNodeId === secondNodeId && segment.toNodeId === firstNodeId)
  );
}

export function segmentKey(firstNodeId: string, secondNodeId: string) {
  return [firstNodeId, secondNodeId].sort().join("::");
}

export function distanceBetween(first: Point2D, second: Point2D) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function nearestReusableEndpoint(params: {
  clickedPoint: Point2D;
  fromNode: RouteNode;
  fromPoint: Point2D;
  projectionPoint: Point2D;
  toNode: RouteNode;
  toPoint: Point2D;
  tolerance: number;
}) {
  const candidates = [
    {
      node: params.fromNode,
      point: params.fromPoint,
      distance: Math.min(
        distanceBetween(params.projectionPoint, params.fromPoint),
        distanceBetween(params.clickedPoint, params.fromPoint),
      ),
    },
    {
      node: params.toNode,
      point: params.toPoint,
      distance: Math.min(
        distanceBetween(params.projectionPoint, params.toPoint),
        distanceBetween(params.clickedPoint, params.toPoint),
      ),
    },
  ]
    .filter((candidate) => candidate.distance <= params.tolerance)
    .sort(
      (first, second) =>
        first.distance - second.distance || first.node.id.localeCompare(second.node.id),
    );

  return candidates[0] ?? null;
}

function findExistingRouteNodeAtPoint(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
  point: Point2D,
  tolerance: number,
) {
  const equipmentById = buildEquipmentIndex(equipment);

  return (
    network.nodes
      .map((node) => {
        const position = resolveRouteNodePosition(node, equipmentById);
        return position
          ? {
              distance: distanceBetween(position, point),
              node,
            }
          : null;
      })
      .filter((candidate): candidate is { distance: number; node: RouteNode } =>
        Boolean(candidate),
      )
      .filter((candidate) => candidate.distance <= tolerance)
      .sort(
        (first, second) =>
          first.distance - second.distance ||
          first.node.id.localeCompare(second.node.id),
      )[0]?.node ?? null
  );
}
