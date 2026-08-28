import { pointInPolygon, polygonBounds } from "@/lib/constraints/geometry";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Bounds, Point2D } from "@/lib/geometry/types";
import {
  pointAlmostEqual,
  pointOnSegment,
  projectPointToSegment,
  segmentIntersectsPolygon,
  segmentsIntersect,
} from "@/lib/routing/geometry";
import {
  applianceNodesAreTerminal,
  detectRouteCycle,
  distanceBetween,
  findRouteNodeByEquipment,
  getConnectedApplianceEquipmentIds,
  getDerivationNodeIds,
  getRouteNeighbors,
  getRouteNodeDegree,
  hasDuplicateSegments,
  hasRouteCrossingsWithoutNode,
  hasRoutePath,
  hasZeroLengthSegments,
  projectPointToRouteSegmentPath,
  resolveRouteNodePosition,
  resolveRouteSegments,
  routeSegmentPlanLegs,
  routeEquipmentNodeId,
  segmentConnects,
  splitRouteSegmentAtPoint,
  totalRouteLengthSource,
} from "@/lib/routing/network";
import type {
  AutomaticRouteProposal,
  AutomaticRouteRestriction,
  ManualRouteNetwork,
  RouteNode,
  RouteProposalDiagnostic,
  RouteSegment,
} from "@/lib/routing/types";

export type GenerateAutomaticRouteProposalInput = {
  baseNetwork?: ManualRouteNetwork;
  bounds: Bounds | null;
  equipment: WorkbenchEquipment[];
  fingerprint: string;
  marginMeters: number;
  minSegmentLengthSource: number;
  pdfPageNumber?: number;
  planBaseId: string;
  preferredApplianceOrder?: string[];
  preferredBranchEquipmentIdsByApplianceId?: Record<string, string[]>;
  restrictions: AutomaticRouteRestriction[];
  scaleMetersPerSourceUnit: number;
};

type IdContext = {
  nodeIndex: number;
  proposalId: string;
  segmentIndex: number;
};

type TreePathCandidate = {
  equipment: WorkbenchEquipment;
  path: Point2D[];
  routeLengthSource: number;
  turnCount: number;
};

type GridPoint = {
  key: string;
  point: Point2D;
};

type SearchState = {
  direction: Direction;
  key: string;
};

type StateRecord = SearchState & {
  length: number;
  previous: StateRecord | null;
  turns: number;
};

type Direction = "start" | "x" | "y";

const COORDINATE_EPSILON = 0.000001;
const MAX_COORDINATE_COUNT = 72;
const MAX_GRID_NODE_COUNT = 5200;
const MAX_SEARCH_VISITS = 16000;
const ROUTE_HASH_PREFIX = "route-proposal";

function cloneRouteNetwork(network: ManualRouteNetwork | undefined): ManualRouteNetwork {
  return {
    nodes: network?.nodes.map((node) => ({ ...node })) ?? [],
    segments:
      network?.segments.map((segment) => ({
        ...segment,
        accessories: segment.accessories?.map((accessory) => ({
          ...accessory,
        })),
      })) ?? [],
  };
}

export function generateAutomaticRouteProposal(
  input: GenerateAutomaticRouteProposalInput,
): AutomaticRouteProposal {
  const proposalId = `${ROUTE_HASH_PREFIX}:${input.planBaseId}:${stableHash(
    input.fingerprint,
  )}`;
  let network: ManualRouteNetwork = cloneRouteNetwork(input.baseNetwork);
  const idContext: IdContext = {
    nodeIndex: network.nodes.length,
    proposalId,
    segmentIndex: network.segments.length,
  };
  const supply = input.equipment.find((item) => item.role === "supply") ?? null;
  const appliances = input.equipment
    .filter((item) => item.role === "appliance")
    .sort(compareEquipmentById);
  const diagnostics: RouteProposalDiagnostic[] = [];
  const reachedEquipmentIds: string[] = [];
  const unreachedEquipmentIds: string[] = [];
  let turnCount = 0;

  if (!supply || appliances.length === 0 || input.scaleMetersPerSourceUnit <= 0) {
    const validation = createProposalValidation({
      allConnected: false,
      connectedToSupply: false,
      hasCrossingsWithoutNode: false,
      hasCycle: false,
      hasDuplicateSegments: false,
      hasZeroLengthSegments: false,
      appliancesTerminal: true,
      restrictionCount: 1,
    });

    return {
      baseId: input.planBaseId,
      derivationCount: 0,
      diagnostics: appliances.map((equipment) => ({
        equipmentId: equipment.id,
        message: "Falta alimentacion, artefactos o escala confirmada.",
        status: "unreachable",
      })),
      id: proposalId,
      lengthMeters: 0,
      lengthSource: 0,
      nodes: [],
      params: {
        fingerprint: input.fingerprint,
        marginMeters: input.marginMeters,
        scaleMetersPerSourceUnit: input.scaleMetersPerSourceUnit,
      },
      pdfPageNumber: input.pdfPageNumber,
      reachedEquipmentIds: [],
      segmentCount: 0,
      segments: [],
      status: "invalid",
      turnCount: 0,
      unreachedEquipmentIds: appliances.map((equipment) => equipment.id),
      validation,
    };
  }

  const supplyNodeId = routeEquipmentNodeId(input.planBaseId, supply.id);

  if (!network.nodes.some((node) => node.id === supplyNodeId)) {
    network.nodes.push({
      equipmentId: supply.id,
      id: supplyNodeId,
      kind: "supply",
      origin: "automatic",
      pdfPageNumber: supply.pdfPageNumber,
    });
  }

  const initiallyConnectedAppliances = getConnectedApplianceEquipmentIds(
    network,
    input.equipment,
  );

  let remaining = appliances.filter((equipment) => {
    if (!equipmentBelongsToProposalPage(equipment, supply, input.pdfPageNumber)) {
      diagnostics.push({
        equipmentId: equipment.id,
        message: "La alimentacion y el artefacto deben estar en la misma pagina PDF.",
        status: "unreachable",
      });
      unreachedEquipmentIds.push(equipment.id);
      return false;
    }

    if (initiallyConnectedAppliances.has(equipment.id)) {
      diagnostics.push({
        equipmentId: equipment.id,
        message: "Conservado desde la red confirmada.",
        status: "connected",
      });
      reachedEquipmentIds.push(equipment.id);
      return false;
    }

    return true;
  });

  while (remaining.length > 0) {
    const candidates = remaining
      .map((equipment) => {
        const candidate = findPathFromTreeToEquipment(
          input,
          network,
          equipment,
          input.preferredBranchEquipmentIdsByApplianceId?.[equipment.id] ?? [],
        );
        return candidate
          ? {
              equipment,
              path: candidate.path,
              routeLengthSource: candidate.routeLengthSource,
              turnCount: candidate.turnCount,
            }
          : null;
      })
      .filter((candidate): candidate is TreePathCandidate => Boolean(candidate))
      .sort(comparePathCandidates);

    const chosen = choosePathCandidate(candidates, input.preferredApplianceOrder);

    if (!chosen) {
      for (const equipment of remaining) {
        diagnostics.push({
          equipmentId: equipment.id,
          message: "No se encontro un recorrido sin atravesar restricciones.",
          status: "unreachable",
        });
        unreachedEquipmentIds.push(equipment.id);
      }
      break;
    }

    const applied = appendAutomaticPathToNetwork(
      input,
      network,
      chosen.equipment,
      chosen.path,
      idContext,
    );

    if (!applied.ok) {
      diagnostics.push({
        equipmentId: chosen.equipment.id,
        message: applied.message,
        status: "unreachable",
      });
      unreachedEquipmentIds.push(chosen.equipment.id);
      remaining = remaining.filter(
        (equipment) => equipment.id !== chosen.equipment.id,
      );
      continue;
    }

    network = applied.network;
    diagnostics.push({
      equipmentId: chosen.equipment.id,
      message: "Conectado por propuesta automatica.",
      routeLengthSource: chosen.routeLengthSource,
      status: "connected",
      turnCount: chosen.turnCount,
    });
    reachedEquipmentIds.push(chosen.equipment.id);
    turnCount += chosen.turnCount;
    remaining = remaining.filter(
      (equipment) => equipment.id !== chosen.equipment.id,
    );
  }

  const validation = validateGeneratedNetwork(input, network, appliances.length);
  const lengthSource = totalRouteLengthSource(network, input.equipment);
  const status =
    validation.canAccept && unreachedEquipmentIds.length === 0
      ? "ready"
      : reachedEquipmentIds.length > 0
        ? "partial"
        : "invalid";

  return {
    baseId: input.planBaseId,
    derivationCount: getDerivationNodeIds(network).length,
    diagnostics,
    id: proposalId,
    lengthMeters: lengthSource * input.scaleMetersPerSourceUnit,
    lengthSource,
    nodes: network.nodes,
    params: {
      fingerprint: input.fingerprint,
      marginMeters: input.marginMeters,
      scaleMetersPerSourceUnit: input.scaleMetersPerSourceUnit,
    },
    pdfPageNumber: input.pdfPageNumber,
    reachedEquipmentIds,
    segmentCount: network.segments.length,
    segments: network.segments,
    status,
    turnCount,
    unreachedEquipmentIds,
    validation,
  };
}

function findPathFromTreeToEquipment(
  input: GenerateAutomaticRouteProposalInput,
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment,
  preferredBranchEquipmentIds: string[] = [],
): { path: Point2D[]; routeLengthSource: number; turnCount: number } | null {
  const target = equipment.connectionPoint;

  if (pointViolatesRestrictions(target, input.restrictions, 0)) {
    return null;
  }

  const coordinates = collectOrthogonalCoordinates(input, network, target);
  const xValues = limitCoordinates(coordinates.xValues, target.x);
  const yValues = limitCoordinates(coordinates.yValues, target.y);

  if (xValues.length * yValues.length > MAX_GRID_NODE_COUNT) {
    return null;
  }

  const gridPoints = createGridPoints(xValues, yValues);
  const targetKey = pointKey(target);
  const treeKeys = collectTreeKeys(network, input.equipment, gridPoints);
  const preferredTreeKeys = collectPreferredBranchTreeKeys(
    network,
    input.equipment,
    gridPoints,
    preferredBranchEquipmentIds,
  );
  const criticalKeys = new Set<string>([
    targetKey,
    ...treeKeys,
    ...preferredTreeKeys,
  ]);
  const validPoints = new Map<string, GridPoint>();

  for (const gridPoint of gridPoints.values()) {
    if (
      criticalKeys.has(gridPoint.key) ||
      !pointViolatesRestrictions(
        gridPoint.point,
        input.restrictions,
        marginSource(input),
      )
    ) {
      validPoints.set(gridPoint.key, gridPoint);
    }
  }

  if (!validPoints.has(targetKey) || treeKeys.size === 0) {
    return null;
  }

  const seedRecords = createSearchSeedRecords(treeKeys, validPoints);

  if (seedRecords.length === 0) {
    return null;
  }

  const preferredSeedRecords = createSearchSeedRecords(
    preferredTreeKeys,
    validPoints,
  );
  const preferredResult =
    preferredSeedRecords.length > 0
      ? runOrthogonalSearch({
          currentNetwork: network,
          input,
          targetKey,
          validPoints,
          xValues,
          yValues,
          seedRecords: preferredSeedRecords,
        })
      : null;
  const result =
    preferredResult ??
    runOrthogonalSearch({
      currentNetwork: network,
      input,
      targetKey,
      validPoints,
      xValues,
      yValues,
      seedRecords,
    });

  if (!result) {
    return null;
  }

  const path = simplifyOrthogonalPath(
    reconstructPath(result, validPoints).map((point) =>
      pointAlmostEqual(point, target, COORDINATE_EPSILON) ? target : point,
    ),
  );

  if (path.length < 2 || distanceBetween(path[0], target) <= input.minSegmentLengthSource) {
    return null;
  }

  return {
    path,
    routeLengthSource: pathLength(path),
    turnCount: countTurns(path),
  };
}

function runOrthogonalSearch(params: {
  currentNetwork: ManualRouteNetwork;
  input: GenerateAutomaticRouteProposalInput;
  seedRecords: StateRecord[];
  targetKey: string;
  validPoints: Map<string, GridPoint>;
  xValues: number[];
  yValues: number[];
}) {
  const best = new Map<string, StateRecord>();
  const queue: StateRecord[] = [];

  for (const seed of params.seedRecords) {
    best.set(stateKey(seed), seed);
    queue.push(seed);
  }

  let visits = 0;

  while (queue.length > 0 && visits < MAX_SEARCH_VISITS) {
    queue.sort(compareStateRecords);
    const current = queue.shift() as StateRecord;
    const currentBest = best.get(stateKey(current));

    if (
      !currentBest ||
      currentBest.length !== current.length ||
      currentBest.turns !== current.turns
    ) {
      continue;
    }

    visits += 1;

    if (current.key === params.targetKey) {
      return current;
    }

    for (const neighbor of findGridNeighbors(
      current.key,
      params.xValues,
      params.yValues,
      params.validPoints,
    )) {
      const from = params.validPoints.get(current.key)?.point;
      const to = params.validPoints.get(neighbor.key)?.point;

      if (!from || !to) {
        continue;
      }

      if (
        segmentViolatesRestrictions(
          from,
          to,
          params.input.restrictions,
          marginSource(params.input),
        ) ||
        segmentCrossesRouteWithoutEndpoint(
          params.currentNetwork,
          params.input.equipment,
          from,
          to,
        )
      ) {
        continue;
      }

      const direction = neighbor.direction;
      const nextLength = current.length + distanceBetween(from, to);
      const nextTurns =
        current.turns +
        (current.direction !== "start" && current.direction !== direction ? 1 : 0);
      const next: StateRecord = {
        direction,
        key: neighbor.key,
        length: nextLength,
        previous: current,
        turns: nextTurns,
      };
      const key = stateKey(next);
      const previous = best.get(key);

      if (!previous || compareStateRecords(next, previous) < 0) {
        best.set(key, next);
        queue.push(next);
      }
    }
  }

  return null;
}

function appendAutomaticPathToNetwork(
  input: GenerateAutomaticRouteProposalInput,
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment,
  rawPath: Point2D[],
  idContext: IdContext,
):
  | { ok: true; network: ManualRouteNetwork }
  | { ok: false; message: string } {
  const path = simplifyOrthogonalPath(rawPath);
  const first = path[0];
  const last = path[path.length - 1];

  if (!first || !last || !pointAlmostEqual(last, equipment.connectionPoint)) {
    return {
      ok: false,
      message: "La propuesta no conserva el punto exacto del artefacto.",
    };
  }

  let nodes = [...network.nodes];
  let segments = [...network.segments];
  const attachment = resolveAutomaticAttachment(
    input,
    { nodes, segments },
    first,
    idContext,
  );

  if (!attachment.ok) {
    return attachment;
  }

  nodes = attachment.nodes;
  segments = attachment.segments;

  const targetNodeId = routeEquipmentNodeId(input.planBaseId, equipment.id);

  if (!nodes.some((node) => node.id === targetNodeId)) {
    nodes.push({
      equipmentId: equipment.id,
      id: targetNodeId,
      kind: "appliance",
      origin: "automatic",
      pdfPageNumber: equipment.pdfPageNumber,
    });
  }

  const routeNodeIds = path.slice(1, -1).map((point) => {
    const nodeId = createAutomaticNodeId(input.planBaseId, idContext);
    nodes.push({
      id: nodeId,
      kind: "route",
      origin: "automatic",
      pdfPageNumber: input.pdfPageNumber,
      position: point,
    });
    return nodeId;
  });
  const nodePath = [attachment.nodeId, ...routeNodeIds, targetNodeId];

  for (let index = 0; index < nodePath.length - 1; index += 1) {
    const fromNodeId = nodePath[index];
    const toNodeId = nodePath[index + 1];

    if (
      !segments.some((segment) =>
        segmentConnects(segment, fromNodeId, toNodeId),
      )
    ) {
      segments.push(
        createAutomaticSegment(input.planBaseId, fromNodeId, toNodeId, idContext),
      );
    }
  }

  const nextNetwork = { nodes, segments };

  if (
    hasZeroLengthSegments(
      nextNetwork,
      input.equipment,
      input.minSegmentLengthSource,
    )
  ) {
    return {
      ok: false,
      message: "La propuesta contiene un tramo sin longitud.",
    };
  }

  if (detectRouteCycle(nextNetwork)) {
    return {
      ok: false,
      message: "La propuesta crearia un ciclo.",
    };
  }

  return {
    ok: true,
    network: nextNetwork,
  };
}

function resolveAutomaticAttachment(
  input: GenerateAutomaticRouteProposalInput,
  network: ManualRouteNetwork,
  point: Point2D,
  idContext: IdContext,
):
  | {
      ok: true;
      nodeId: string;
      nodes: RouteNode[];
      segments: RouteSegment[];
    }
  | { ok: false; message: string } {
  const equipmentById = new Map(input.equipment.map((item) => [item.id, item]));
  const nodeHit = network.nodes.find((node) => {
    if (node.kind === "appliance") {
      return false;
    }

    const position = resolveRouteNodePosition(node, equipmentById);
    return position
      ? pointAlmostEqual(position, point, input.minSegmentLengthSource)
      : false;
  });

  if (nodeHit) {
    return {
      ok: true,
      nodeId: nodeHit.id,
      nodes: network.nodes,
      segments: network.segments,
    };
  }

  for (const segment of resolveRouteSegments(network, input.equipment)) {
    const projection = projectPointToRouteSegmentPath(point, segment);

    if (projection.distance > input.minSegmentLengthSource) {
      continue;
    }

    if (
      pointAlmostEqual(
        projection.point,
        segment.from,
        input.minSegmentLengthSource,
      ) ||
      pointAlmostEqual(
        projection.point,
        segment.to,
        input.minSegmentLengthSource,
      )
    ) {
      continue;
    }

    const nodeId = createAutomaticNodeId(input.planBaseId, idContext);
    const split = splitRouteSegmentAtPoint({
      createNode: (splitPoint) => ({
        id: nodeId,
        kind: "route" as const,
        origin: "automatic" as const,
        pdfPageNumber: input.pdfPageNumber,
        position: splitPoint,
      }),
      createSegment: (fromNodeId, toNodeId, _origin, vertices) =>
        createAutomaticSegment(
          input.planBaseId,
          fromNodeId,
          toNodeId,
          idContext,
          vertices,
        ),
      equipment: input.equipment,
      network,
      point: projection.point,
      segmentId: segment.id,
      tolerance: input.minSegmentLengthSource,
    });

    if (!split.ok) {
      continue;
    }

    return {
      ok: true,
      nodeId,
      nodes: split.network.nodes,
      segments: split.network.segments,
    };
  }

  return {
    ok: false,
    message: "No se encontro un punto valido de incorporacion al arbol.",
  };
}

function collectOrthogonalCoordinates(
  input: GenerateAutomaticRouteProposalInput,
  network: ManualRouteNetwork,
  target: Point2D,
) {
  const xValues = new Set<number>();
  const yValues = new Set<number>();
  const points = [
    ...input.equipment.map((equipment) => equipment.connectionPoint),
    target,
  ];
  const clearance = marginSource(input);
  const baseBounds = expandedBounds(
    input.bounds ?? boundsForPoints(points),
    Math.max(clearance * 4, boundsSize(input.bounds ?? boundsForPoints(points)) * 0.08),
  );

  addPointCoordinates(target, xValues, yValues);

  for (const node of network.nodes) {
    const position = resolveRouteNodePosition(
      node,
      new Map(input.equipment.map((equipment) => [equipment.id, equipment])),
    );

    if (position) {
      addPointCoordinates(position, xValues, yValues);
    }
  }

  for (const segment of resolveRouteSegments(network, input.equipment)) {
    for (const point of segment.path) {
      addPointCoordinates(point, xValues, yValues);
    }
  }

  for (const equipment of input.equipment) {
    addPointCoordinates(equipment.connectionPoint, xValues, yValues);
  }

  if (baseBounds) {
    addCoordinate(baseBounds.minX, xValues);
    addCoordinate(baseBounds.maxX, xValues);
    addCoordinate(baseBounds.minY, yValues);
    addCoordinate(baseBounds.maxY, yValues);
  }

  for (const restriction of input.restrictions) {
    const bounds =
      restriction.kind === "polygon"
        ? polygonBounds(restriction.polygon)
        : boundsForPoints([restriction.from, restriction.to]);

    if (!bounds) {
      continue;
    }

    for (const x of [bounds.minX - clearance, bounds.minX, bounds.maxX, bounds.maxX + clearance]) {
      addCoordinate(x, xValues);
    }

    for (const y of [bounds.minY - clearance, bounds.minY, bounds.maxY, bounds.maxY + clearance]) {
      addCoordinate(y, yValues);
    }

    if (restriction.kind === "polygon") {
      for (const point of restriction.polygon) {
        addCoordinate(point.x - clearance, xValues);
        addCoordinate(point.x, xValues);
        addCoordinate(point.x + clearance, xValues);
        addCoordinate(point.y - clearance, yValues);
        addCoordinate(point.y, yValues);
        addCoordinate(point.y + clearance, yValues);
      }
    }
  }

  return {
    xValues: [...xValues].sort((a, b) => a - b),
    yValues: [...yValues].sort((a, b) => a - b),
  };
}

function collectTreeKeys(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
  gridPoints: Map<string, GridPoint>,
) {
  const keys = new Set<string>();
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const resolvedSegments = resolveRouteSegments(network, equipment);
  const appliancePointKeys = collectApplianceNodePointKeys(network, equipmentById);

  for (const node of network.nodes) {
    if (node.kind === "appliance") {
      continue;
    }

    const position = resolveRouteNodePosition(node, equipmentById);

    if (position) {
      keys.add(pointKey(position));
    }
  }

  for (const gridPoint of gridPoints.values()) {
    if (appliancePointKeys.has(gridPoint.key)) {
      continue;
    }

    if (
      resolvedSegments.some((segment) =>
        routeSegmentPlanLegs(segment).some((leg) =>
          pointOnSegment(gridPoint.point, leg.from, leg.to),
        ),
      )
    ) {
      keys.add(gridPoint.key);
    }
  }

  return keys;
}

function collectPreferredBranchTreeKeys(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
  gridPoints: Map<string, GridPoint>,
  preferredBranchEquipmentIds: string[],
) {
  const keys = new Set<string>();
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const neighbors = getRouteNeighbors(network);
  const sortedEquipmentIds = [...new Set(preferredBranchEquipmentIds)].sort();

  for (const equipmentId of sortedEquipmentIds) {
    const applianceNode = findRouteNodeByEquipment(network, equipmentId);

    if (!applianceNode || applianceNode.kind !== "appliance") {
      continue;
    }

    const appliancePoint = resolveRouteNodePosition(applianceNode, equipmentById);

    if (!appliancePoint) {
      continue;
    }

    const neighborIds = [...(neighbors.get(applianceNode.id) ?? [])].sort();

    for (const neighborId of neighborIds) {
      const neighborNode = nodeById.get(neighborId);

      if (!neighborNode || neighborNode.kind === "appliance") {
        continue;
      }

      const neighborPoint = resolveRouteNodePosition(neighborNode, equipmentById);

      if (!neighborPoint) {
        continue;
      }

      keys.add(pointKey(neighborPoint));

      for (const gridPoint of gridPoints.values()) {
        if (pointAlmostEqual(gridPoint.point, appliancePoint, COORDINATE_EPSILON)) {
          continue;
        }

        if (pointOnSegment(gridPoint.point, appliancePoint, neighborPoint)) {
          keys.add(gridPoint.key);
        }
      }
    }
  }

  return keys;
}

function collectApplianceNodePointKeys(
  network: ManualRouteNetwork,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  const keys = new Set<string>();

  for (const node of network.nodes) {
    if (node.kind !== "appliance") {
      continue;
    }

    const position = resolveRouteNodePosition(node, equipmentById);

    if (position) {
      keys.add(pointKey(position));
    }
  }

  return keys;
}

function createSearchSeedRecords(
  treeKeys: Set<string>,
  validPoints: Map<string, GridPoint>,
): StateRecord[] {
  return [...treeKeys]
    .sort()
    .filter((key) => validPoints.has(key))
    .map((key) => ({
      direction: "start" as const,
      key,
      length: 0,
      previous: null,
      turns: 0,
    }));
}

function createGridPoints(xValues: number[], yValues: number[]) {
  const points = new Map<string, GridPoint>();

  for (const x of xValues) {
    for (const y of yValues) {
      const point = { x, y };
      points.set(pointKey(point), {
        key: pointKey(point),
        point,
      });
    }
  }

  return points;
}

function findGridNeighbors(
  key: string,
  xValues: number[],
  yValues: number[],
  validPoints: Map<string, GridPoint>,
) {
  const point = validPoints.get(key)?.point;

  if (!point) {
    return [];
  }

  const xIndex = xValues.findIndex((value) => sameCoordinate(value, point.x));
  const yIndex = yValues.findIndex((value) => sameCoordinate(value, point.y));
  const neighbors: Array<{ direction: Exclude<Direction, "start">; key: string }> = [];

  for (const nextXIndex of [xIndex - 1, xIndex + 1]) {
    if (nextXIndex >= 0 && nextXIndex < xValues.length) {
      const nextKey = pointKey({ x: xValues[nextXIndex], y: point.y });

      if (validPoints.has(nextKey)) {
        neighbors.push({ direction: "x", key: nextKey });
      }
    }
  }

  for (const nextYIndex of [yIndex - 1, yIndex + 1]) {
    if (nextYIndex >= 0 && nextYIndex < yValues.length) {
      const nextKey = pointKey({ x: point.x, y: yValues[nextYIndex] });

      if (validPoints.has(nextKey)) {
        neighbors.push({ direction: "y", key: nextKey });
      }
    }
  }

  return neighbors.sort((first, second) => first.key.localeCompare(second.key));
}

function reconstructPath(record: StateRecord, validPoints: Map<string, GridPoint>) {
  const points: Point2D[] = [];
  let current: StateRecord | null = record;

  while (current) {
    const point = validPoints.get(current.key)?.point;

    if (point) {
      points.unshift(point);
    }

    current = current.previous;
  }

  return points;
}

function validateGeneratedNetwork(
  input: GenerateAutomaticRouteProposalInput,
  network: ManualRouteNetwork,
  applianceCount: number,
) {
  const invalidSegments = resolveRouteSegments(network, input.equipment).filter(
    (segment) =>
      routeSegmentPlanLegs(segment).some((leg) =>
        segmentViolatesRestrictions(leg.from, leg.to, input.restrictions, 0),
      ),
  );
  const hasCycle = detectRouteCycle(network);
  const hasDuplicate = hasDuplicateSegments(network);
  const hasZeroLength = hasZeroLengthSegments(
    network,
    input.equipment,
    input.minSegmentLengthSource,
  );
  const hasCrossings = hasRouteCrossingsWithoutNode(network, input.equipment);
  const appliancesTerminal = applianceNodesAreTerminal(network);
  const connectedToSupply = routeNetworkConnectedToSupply(network, input.equipment);
  const connectedAppliances = connectedApplianceCount(network, input.equipment);
  const allConnected = connectedAppliances === applianceCount;
  const restrictionCount =
    invalidSegments.length +
    (hasCycle ? 1 : 0) +
    (hasDuplicate ? 1 : 0) +
    (hasZeroLength ? 1 : 0) +
    (hasCrossings ? 1 : 0) +
    (appliancesTerminal ? 0 : 1) +
    (connectedToSupply ? 0 : 1);

  return createProposalValidation({
    allConnected,
    appliancesTerminal,
    connectedToSupply,
    hasCrossingsWithoutNode: hasCrossings,
    hasCycle,
    hasDuplicateSegments: hasDuplicate,
    hasZeroLengthSegments: hasZeroLength,
    restrictionCount,
  });
}

function createProposalValidation(params: Omit<AutomaticRouteProposal["validation"], "canAccept">) {
  return {
    ...params,
    canAccept:
      params.allConnected &&
      params.appliancesTerminal &&
      params.connectedToSupply &&
      !params.hasCrossingsWithoutNode &&
      !params.hasCycle &&
      !params.hasDuplicateSegments &&
      !params.hasZeroLengthSegments &&
      params.restrictionCount === 0,
  };
}

function routeNetworkConnectedToSupply(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  const supply = equipment.find((item) => item.role === "supply") ?? null;
  const supplyNode = supply ? findRouteNodeByEquipment(network, supply.id) : null;

  if (!supplyNode) {
    return network.segments.length === 0;
  }

  return network.nodes.every(
    (node) =>
      getRouteNodeDegree(network, node.id) === 0 ||
      hasRoutePath(network, supplyNode.id, node.id),
  );
}

function connectedApplianceCount(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  const supply = equipment.find((item) => item.role === "supply") ?? null;
  const supplyNode = supply ? findRouteNodeByEquipment(network, supply.id) : null;

  if (!supplyNode) {
    return 0;
  }

  return equipment.filter((item) => {
    if (item.role !== "appliance") {
      return false;
    }

    const node = findRouteNodeByEquipment(network, item.id);
    return node ? hasRoutePath(network, supplyNode.id, node.id) : false;
  }).length;
}

function segmentCrossesRouteWithoutEndpoint(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
  from: Point2D,
  to: Point2D,
) {
  for (const segment of resolveRouteSegments(network, equipment)) {
    const crossingLeg = routeSegmentPlanLegs(segment).find((leg) =>
      segmentsIntersect(from, to, leg.from, leg.to),
    );

    if (!crossingLeg) {
      continue;
    }

    const touchesAtFrom =
      pointAlmostEqual(from, segment.from, COORDINATE_EPSILON) ||
      pointAlmostEqual(from, segment.to, COORDINATE_EPSILON) ||
      pointOnSegment(from, crossingLeg.from, crossingLeg.to);
    const touchesAtTo =
      pointAlmostEqual(to, segment.from, COORDINATE_EPSILON) ||
      pointAlmostEqual(to, segment.to, COORDINATE_EPSILON) ||
      pointOnSegment(to, crossingLeg.from, crossingLeg.to);
    const allowedTouch =
      (touchesAtFrom &&
        segmentsOnlyTouchAtAllowedPoint(
          from,
          to,
          crossingLeg.from,
          crossingLeg.to,
          from,
        )) ||
      (touchesAtTo &&
        segmentsOnlyTouchAtAllowedPoint(
          from,
          to,
          crossingLeg.from,
          crossingLeg.to,
          to,
        ));

    if (!allowedTouch) {
      return true;
    }
  }

  return false;
}

function segmentsOnlyTouchAtAllowedPoint(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D,
  allowedPoint: Point2D,
) {
  if (
    !pointOnSegment(allowedPoint, firstStart, firstEnd) ||
    !pointOnSegment(allowedPoint, secondStart, secondEnd)
  ) {
    return false;
  }

  const firstOtherEnd =
    pointAlmostEqual(firstStart, allowedPoint, COORDINATE_EPSILON)
      ? firstEnd
      : firstStart;
  const secondEndpointTouchesFirst =
    (pointOnSegment(secondStart, firstStart, firstEnd) &&
      !pointAlmostEqual(secondStart, allowedPoint, COORDINATE_EPSILON)) ||
    (pointOnSegment(secondEnd, firstStart, firstEnd) &&
      !pointAlmostEqual(secondEnd, allowedPoint, COORDINATE_EPSILON));

  return (
    !pointOnSegment(firstOtherEnd, secondStart, secondEnd) &&
    !secondEndpointTouchesFirst
  );
}

function segmentViolatesRestrictions(
  from: Point2D,
  to: Point2D,
  restrictions: AutomaticRouteRestriction[],
  clearance: number,
) {
  if (distanceBetween(from, to) <= COORDINATE_EPSILON) {
    return true;
  }

  return restrictions.some((restriction) => {
    if (restriction.kind === "polygon") {
      if (segmentIntersectsPolygon(from, to, restriction.polygon)) {
        return true;
      }

      return (
        clearance > 0 &&
        distanceFromSegmentToPolygon(from, to, restriction.polygon) <
          clearance - COORDINATE_EPSILON
      );
    }

    if (segmentsIntersect(from, to, restriction.from, restriction.to)) {
      return true;
    }

    return (
      clearance > 0 &&
      segmentToSegmentDistance(from, to, restriction.from, restriction.to) <
        clearance - COORDINATE_EPSILON
    );
  });
}

function pointViolatesRestrictions(
  point: Point2D,
  restrictions: AutomaticRouteRestriction[],
  clearance: number,
) {
  return restrictions.some((restriction) => {
    if (restriction.kind === "polygon") {
      if (pointInPolygon(point, restriction.polygon)) {
        return true;
      }

      return (
        clearance > 0 &&
        distanceFromPointToPolygon(point, restriction.polygon) <
          clearance - COORDINATE_EPSILON
      );
    }

    return (
      projectPointToSegment(point, restriction.from, restriction.to).distance <=
      Math.max(COORDINATE_EPSILON, clearance - COORDINATE_EPSILON)
    );
  });
}

function distanceFromSegmentToPolygon(
  from: Point2D,
  to: Point2D,
  polygon: Point2D[],
) {
  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    minDistance = Math.min(
      minDistance,
      segmentToSegmentDistance(from, to, current, next),
    );
  }

  return minDistance;
}

function distanceFromPointToPolygon(point: Point2D, polygon: Point2D[]) {
  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    minDistance = Math.min(
      minDistance,
      projectPointToSegment(point, current, next).distance,
    );
  }

  return minDistance;
}

function segmentToSegmentDistance(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D,
) {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
    return 0;
  }

  return Math.min(
    projectPointToSegment(firstStart, secondStart, secondEnd).distance,
    projectPointToSegment(firstEnd, secondStart, secondEnd).distance,
    projectPointToSegment(secondStart, firstStart, firstEnd).distance,
    projectPointToSegment(secondEnd, firstStart, firstEnd).distance,
  );
}

function simplifyOrthogonalPath(points: Point2D[]) {
  const withoutDuplicates: Point2D[] = [];

  for (const point of points) {
    const previous = withoutDuplicates[withoutDuplicates.length - 1];

    if (!previous || !pointAlmostEqual(previous, point, COORDINATE_EPSILON)) {
      withoutDuplicates.push(point);
    }
  }

  const simplified: Point2D[] = [];

  for (const point of withoutDuplicates) {
    simplified.push(point);

    while (simplified.length >= 3) {
      const [a, b, c] = simplified.slice(-3);
      const sameX =
        sameCoordinate(a.x, b.x) && sameCoordinate(b.x, c.x);
      const sameY =
        sameCoordinate(a.y, b.y) && sameCoordinate(b.y, c.y);

      if (!sameX && !sameY) {
        break;
      }

      simplified.splice(simplified.length - 2, 1);
    }
  }

  return simplified;
}

function pathLength(points: Point2D[]) {
  return points.slice(0, -1).reduce((sum, point, index) => {
    return sum + distanceBetween(point, points[index + 1]);
  }, 0);
}

function countTurns(points: Point2D[]) {
  let turns = 0;
  let previousDirection: Direction = "start";

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const direction: Direction = sameCoordinate(current.x, next.x) ? "y" : "x";

    if (previousDirection !== "start" && previousDirection !== direction) {
      turns += 1;
    }

    previousDirection = direction;
  }

  return turns;
}

function comparePathCandidates(first: TreePathCandidate, second: TreePathCandidate) {
  return (
    compareNumbers(first.routeLengthSource, second.routeLengthSource) ||
    compareNumbers(first.turnCount, second.turnCount) ||
    first.equipment.id.localeCompare(second.equipment.id)
  );
}

function choosePathCandidate(
  candidates: TreePathCandidate[],
  preferredApplianceOrder: string[] | undefined,
) {
  if (candidates.length === 0) {
    return null;
  }

  if (!preferredApplianceOrder || preferredApplianceOrder.length === 0) {
    return candidates[0];
  }

  const rank = new Map(
    preferredApplianceOrder.map((equipmentId, index) => [equipmentId, index]),
  );

  return [...candidates].sort((first, second) => {
    const firstRank = rank.get(first.equipment.id) ?? Number.POSITIVE_INFINITY;
    const secondRank = rank.get(second.equipment.id) ?? Number.POSITIVE_INFINITY;

    if (firstRank !== secondRank) {
      return firstRank - secondRank;
    }

    return comparePathCandidates(first, second);
  })[0];
}

function compareStateRecords(first: StateRecord, second: StateRecord) {
  return (
    compareNumbers(first.length, second.length) ||
    compareNumbers(first.turns, second.turns) ||
    first.key.localeCompare(second.key) ||
    first.direction.localeCompare(second.direction)
  );
}

function compareNumbers(first: number, second: number) {
  const delta = first - second;
  return Math.abs(delta) <= COORDINATE_EPSILON ? 0 : delta < 0 ? -1 : 1;
}

function stateKey(state: SearchState) {
  return `${state.key}|${state.direction}`;
}

function pointKey(point: Point2D) {
  return `${formatCoordinate(point.x)},${formatCoordinate(point.y)}`;
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(6)).toString();
}

function sameCoordinate(first: number, second: number) {
  return Math.abs(first - second) <= COORDINATE_EPSILON;
}

function limitCoordinates(values: number[], focus: number) {
  const sorted = uniqueCoordinates(values);

  if (sorted.length <= MAX_COORDINATE_COUNT) {
    return sorted;
  }

  return sorted
    .map((value) => ({ distance: Math.abs(value - focus), value }))
    .sort(
      (first, second) =>
        compareNumbers(first.distance, second.distance) ||
        compareNumbers(first.value, second.value),
    )
    .slice(0, MAX_COORDINATE_COUNT)
    .map((item) => item.value)
    .sort((a, b) => a - b);
}

function uniqueCoordinates(values: number[]) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const unique: number[] = [];

  for (const value of sorted) {
    if (!unique.some((current) => sameCoordinate(current, value))) {
      unique.push(value);
    }
  }

  return unique;
}

function addPointCoordinates(
  point: Point2D,
  xValues: Set<number>,
  yValues: Set<number>,
) {
  addCoordinate(point.x, xValues);
  addCoordinate(point.y, yValues);
}

function addCoordinate(value: number, values: Set<number>) {
  if (Number.isFinite(value)) {
    values.add(Number(value.toFixed(6)));
  }
}

function marginSource(input: GenerateAutomaticRouteProposalInput) {
  return Math.max(0, input.marginMeters / input.scaleMetersPerSourceUnit);
}

function equipmentBelongsToProposalPage(
  equipment: WorkbenchEquipment,
  supply: WorkbenchEquipment,
  pdfPageNumber: number | undefined,
) {
  if (!pdfPageNumber) {
    return true;
  }

  return (
    equipment.pdfPageNumber === pdfPageNumber &&
    supply.pdfPageNumber === pdfPageNumber
  );
}

function boundsForPoints(points: Point2D[]): Bounds | null {
  if (points.length === 0) {
    return null;
  }

  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function boundsSize(bounds: Bounds | null) {
  if (!bounds) {
    return 1;
  }

  return Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
}

function expandedBounds(bounds: Bounds | null, padding: number): Bounds | null {
  if (!bounds) {
    return null;
  }

  return {
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
  };
}

function createAutomaticNodeId(
  planBaseId: string,
  context: IdContext,
) {
  context.nodeIndex += 1;
  return `route-node:${planBaseId}:automatic:${stableHash(
    context.proposalId,
  )}:n${context.nodeIndex}`;
}

function createAutomaticSegment(
  planBaseId: string,
  fromNodeId: string,
  toNodeId: string,
  context: IdContext,
  vertices: Point2D[] = [],
): RouteSegment {
  context.segmentIndex += 1;
  return {
    fromNodeId,
    id: `route-segment:${planBaseId}:automatic:${stableHash(
      context.proposalId,
    )}:s${context.segmentIndex}`,
    origin: "automatic",
    toNodeId,
    ...(vertices.length > 0
      ? {
          vertices: vertices.map((point) => ({
            x: point.x,
            y: point.y,
          })),
        }
      : {}),
  };
}

function compareEquipmentById(
  first: WorkbenchEquipment,
  second: WorkbenchEquipment,
) {
  return first.id.localeCompare(second.id);
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
