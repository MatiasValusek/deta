import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { pointZMeters, type ElevationMetadata } from "@/lib/geometry/height";
import type { Point2D } from "@/lib/geometry/types";
import { pointOnSegment, segmentIntersectsPolygon } from "@/lib/routing/geometry";
import {
  buildEquipmentIndex,
  isEquipmentTerminalSegment,
  resolveRouteNodePosition,
  resolveRouteSegments,
} from "@/lib/routing/network";
import type {
  AutomaticRouteRestriction,
  ManualRouteNetwork,
  ResolvedRouteSegment,
  RouteNode,
  RouteSegment,
} from "@/lib/routing/types";

const LEVEL_EPSILON = 0.000001;
const MAX_CANDIDATES_PER_SECTOR = 12;
const MAX_ALTERNATIVES = 32;
const GENERATED_LEVEL_ELEVATION: ElevationMetadata = {
  source: "derived_calculation",
  status: "suggested",
};

export type InternalLevelCandidate = {
  id: string;
  kind: "node" | "segment_vertex";
  nodeId?: string;
  point: Point2D;
  segmentId: string;
  vertexIndex?: number;
};

export type InternalLevelChange = {
  candidate: InternalLevelCandidate;
  direction: "drop" | "rise";
  fromHeightMeters: number;
  id: string;
  point: Point2D;
  sectorId: string;
  segmentId: string;
  toHeightMeters: number;
};

export type InternalLevelInterference = {
  changeId: string;
  kind: "known_xy_restriction" | "unverified_3d_clearance";
  message: string;
  restrictionIds: string[];
  status: "blocking" | "unverified";
};

export type InternalLevelAlternativeMetrics = {
  addedVertexCount: number;
  directionChangeCount: number;
  horizontalLengthSource: number;
  physicalLengthMeters: number | null;
  verticalLengthMeters: number;
};

export type InternalLevelAlternative = {
  changes: InternalLevelChange[];
  id: string;
  interferences: InternalLevelInterference[];
  metrics: InternalLevelAlternativeMetrics;
  network: ManualRouteNetwork;
  status: "ready";
};

export type InternalLevelProposalDiagnosticCode =
  | "candidate_limit_reached"
  | "invalid_candidate_geometry"
  | "known_restriction_collision"
  | "professional_location_required";

export type InternalLevelProposalDiagnostic = {
  candidateId?: string;
  code: InternalLevelProposalDiagnosticCode;
  message: string;
  neededData: string;
  sectorId?: string;
  severity: "blocking" | "warning";
};

export type AutomaticInternalLevelProposal = {
  alternatives: InternalLevelAlternative[];
  diagnostics: InternalLevelProposalDiagnostic[];
  evaluatedCandidateCount: number;
  requiredChangeCount: number;
  status: "incomplete" | "invalid" | "not_needed" | "ready";
  truncated: boolean;
};

export type GenerateAutomaticInternalLevelChangesParams = {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  restrictions?: AutomaticRouteRestriction[];
  scaleMetersPerSourceUnit?: number | null;
};

type SegmentLevelPoint = {
  chainIndex: number;
  heightMeters: number | null;
  kind: "node" | "segment_vertex";
  metadata: ElevationMetadata | null;
  nodeId?: string;
  point: Point2D;
  vertexIndex?: number;
};

type InternalLevelSector = {
  candidates: InternalLevelCandidate[];
  endHeightMeters: number;
  endIndex: number;
  id: string;
  segmentId: string;
  startHeightMeters: number;
  startIndex: number;
};

type CandidateChoice = {
  candidate: InternalLevelCandidate;
  sector: InternalLevelSector;
};

/**
 * Generates proposal networks only. It never mutates or accepts the supplied
 * network. Locations are limited to nodes and vertices already present in XY.
 */
export function generateAutomaticInternalLevelChanges(
  params: GenerateAutomaticInternalLevelChangesParams,
): AutomaticInternalLevelProposal {
  const baseline = cloneRouteNetwork(params.network);
  const sectors = internalLevelSectors(params);
  const diagnostics: InternalLevelProposalDiagnostic[] = [];
  let evaluatedCandidateCount = 0;
  let truncated = false;

  if (sectors.length === 0) {
    return {
      alternatives: [],
      diagnostics,
      evaluatedCandidateCount,
      requiredChangeCount: 0,
      status: "not_needed",
      truncated,
    };
  }

  const choicesBySector: CandidateChoice[][] = [];

  for (const sector of sectors) {
    const candidates = sector.candidates.slice(0, MAX_CANDIDATES_PER_SECTOR);

    if (sector.candidates.length > candidates.length) {
      truncated = true;
      diagnostics.push({
        code: "candidate_limit_reached",
        message: `El sector ${sector.id} tiene mas ubicaciones que el limite de evaluacion.`,
        neededData:
          "Revise profesionalmente las ubicaciones restantes si ninguna alternativa acotada resulta adecuada.",
        sectorId: sector.id,
        severity: "warning",
      });
    }

    const available: CandidateChoice[] = [];

    for (const candidate of candidates) {
      evaluatedCandidateCount += 1;
      const restrictionIds = restrictionsAtPoint(
        candidate.point,
        params.restrictions ?? [],
      );

      if (restrictionIds.length > 0) {
        diagnostics.push({
          candidateId: candidate.id,
          code: "known_restriction_collision",
          message: `La ubicacion ${candidate.id} intersecta una restriccion XY confirmada (${restrictionIds.join(", ")}).`,
          neededData:
            "Elija otro nodo o vertice, o documente profesionalmente la resolucion de la interferencia.",
          sectorId: sector.id,
          severity: "blocking",
        });
        continue;
      }

      available.push({ candidate, sector });
    }

    if (available.length === 0) {
      diagnostics.push({
        code: "professional_location_required",
        message: `Ninguna ubicacion conocida del sector ${sector.id} queda libre de restricciones confirmadas.`,
        neededData:
          "Defina profesionalmente la ubicacion del cambio de nivel y su resolucion constructiva.",
        sectorId: sector.id,
        severity: "blocking",
      });
    }

    choicesBySector.push(available);
  }

  if (choicesBySector.some((choices) => choices.length === 0)) {
    return {
      alternatives: [],
      diagnostics,
      evaluatedCandidateCount,
      requiredChangeCount: sectors.length,
      status: "incomplete",
      truncated,
    };
  }

  const possibleCombinationCount = choicesBySector.reduce(
    (total, choices) => total * choices.length,
    1,
  );
  if (possibleCombinationCount > MAX_ALTERNATIVES) {
    truncated = true;
  }

  let combinations: CandidateChoice[][] = [[]];

  for (const choices of choicesBySector) {
    const next: CandidateChoice[][] = [];

    for (const combination of combinations) {
      for (const choice of choices) {
        if (next.length >= MAX_ALTERNATIVES) {
          truncated = true;
          break;
        }
        next.push([...combination, choice]);
      }

      if (next.length >= MAX_ALTERNATIVES) {
        break;
      }
    }

    combinations = next;
  }

  if (truncated) {
    diagnostics.push({
      code: "candidate_limit_reached",
      message: `La comparacion se acoto a ${MAX_ALTERNATIVES} alternativas deterministicas.`,
      neededData:
        "Seleccione manualmente otra ubicacion si las alternativas evaluadas no resultan suficientes.",
      severity: "warning",
    });
  }

  const alternatives: InternalLevelAlternative[] = [];
  const fingerprints = new Set<string>();

  for (const combination of combinations) {
    let network = cloneRouteNetwork(baseline);
    const changes: InternalLevelChange[] = [];
    const orderedChoices = [...combination].sort(
      (first, second) =>
        first.sector.segmentId.localeCompare(second.sector.segmentId) ||
        second.sector.startIndex - first.sector.startIndex ||
        first.candidate.id.localeCompare(second.candidate.id),
    );

    for (const choice of orderedChoices) {
      const applied = applyInternalLevelChoice(network, choice);
      network = applied.network;
      changes.push(applied.change);
    }

    const changedSegmentIds = new Set(changes.map((change) => change.segmentId));
    const invalidSegment = resolveRouteSegments(network, params.equipment).find(
      (segment) =>
        changedSegmentIds.has(segment.id) && !routeSegmentIsOrthogonal3d(segment),
    );

    if (invalidSegment) {
      diagnostics.push({
        code: "invalid_candidate_geometry",
        message: `La alternativa sobre ${invalidSegment.id} produciria una pata diagonal.`,
        neededData:
          "Revise las cotas o elija otro nodo o vertice existente para el cambio de nivel.",
        severity: "blocking",
      });
      continue;
    }

    const fingerprint = networkFingerprint(network);
    if (fingerprints.has(fingerprint)) {
      continue;
    }
    fingerprints.add(fingerprint);

    const sortedChanges = changes.sort((first, second) =>
      first.id.localeCompare(second.id),
    );
    const interferences = sortedChanges.map<InternalLevelInterference>((change) => ({
      changeId: change.id,
      kind: "unverified_3d_clearance",
      message:
        "La informacion arquitectonica disponible no permite verificar el despeje tridimensional del montante interno.",
      restrictionIds: [],
      status: "unverified",
    }));

    alternatives.push({
      changes: sortedChanges,
      id: `internal-level-alternative:${sortedChanges
        .map((change) => change.candidate.id)
        .join("|")}`,
      interferences,
      metrics: alternativeMetrics(
        network,
        params.equipment,
        params.scaleMetersPerSourceUnit ?? null,
        sortedChanges.length,
      ),
      network,
      status: "ready",
    });
  }

  alternatives.sort(compareGeometryAlternatives);

  return {
    alternatives,
    diagnostics,
    evaluatedCandidateCount,
    requiredChangeCount: sectors.length,
    status: alternatives.length > 0 ? "ready" : "invalid",
    truncated,
  };
}

function internalLevelSectors(
  params: GenerateAutomaticInternalLevelChangesParams,
) {
  const equipmentById = buildEquipmentIndex(params.equipment);
  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const sectors: InternalLevelSector[] = [];

  for (const segment of [...params.network.segments].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    const fromNode = nodeById.get(segment.fromNodeId) ?? null;
    const toNode = nodeById.get(segment.toNodeId) ?? null;

    if (
      !fromNode ||
      !toNode ||
      fromNode.kind !== "route" ||
      toNode.kind !== "route" ||
      isEquipmentTerminalSegment(segment)
    ) {
      continue;
    }

    const fromPoint = resolveRouteNodePosition(fromNode, equipmentById);
    const toPoint = resolveRouteNodePosition(toNode, equipmentById);
    if (!fromPoint || !toPoint) {
      continue;
    }

    const points = segmentLevelPoints(segment, fromNode, toNode, fromPoint, toPoint);
    const knownIndexes = points
      .filter(isKnownLevelPoint)
      .map((point) => point.chainIndex);

    for (let index = 0; index < knownIndexes.length - 1; index += 1) {
      const startIndex = knownIndexes[index] as number;
      const endIndex = knownIndexes[index + 1] as number;
      const start = points[startIndex] as SegmentLevelPoint;
      const end = points[endIndex] as SegmentLevelPoint;
      const startHeightMeters = start.heightMeters as number;
      const endHeightMeters = end.heightMeters as number;

      if (sameHeight(startHeightMeters, endHeightMeters)) {
        continue;
      }

      if (endIndex === startIndex + 1 && sameXY(start.point, end.point)) {
        continue;
      }

      const sectorId = `internal-level-sector:${segment.id}:${startIndex}-${endIndex}`;
      const candidates = points
        .slice(startIndex, endIndex + 1)
        .map((point) => levelCandidate(segment.id, sectorId, point))
        .sort(compareCandidates);

      sectors.push({
        candidates,
        endHeightMeters,
        endIndex,
        id: sectorId,
        segmentId: segment.id,
        startHeightMeters,
        startIndex,
      });
    }
  }

  return sectors.sort(
    (first, second) =>
      first.segmentId.localeCompare(second.segmentId) ||
      first.startIndex - second.startIndex,
  );
}

function segmentLevelPoints(
  segment: RouteSegment,
  fromNode: RouteNode,
  toNode: RouteNode,
  fromPoint: Point2D,
  toPoint: Point2D,
): SegmentLevelPoint[] {
  return [
    {
      chainIndex: 0,
      heightMeters: explicitZMeters(fromPoint),
      kind: "node",
      metadata: fromNode.elevation ?? null,
      nodeId: fromNode.id,
      point: { ...fromPoint },
    },
    ...(segment.vertices ?? []).map((point, vertexIndex) => ({
      chainIndex: vertexIndex + 1,
      heightMeters: explicitZMeters(point),
      kind: "segment_vertex" as const,
      metadata: segment.vertexElevations?.[vertexIndex] ?? null,
      point: { ...point },
      vertexIndex,
    })),
    {
      chainIndex: (segment.vertices?.length ?? 0) + 1,
      heightMeters: explicitZMeters(toPoint),
      kind: "node",
      metadata: toNode.elevation ?? null,
      nodeId: toNode.id,
      point: { ...toPoint },
    },
  ];
}

function isKnownLevelPoint(point: SegmentLevelPoint) {
  return (
    point.heightMeters !== null &&
    point.metadata !== null &&
    (point.metadata.status === "confirmed" || point.metadata.status === "suggested")
  );
}

function levelCandidate(
  segmentId: string,
  sectorId: string,
  point: SegmentLevelPoint,
): InternalLevelCandidate {
  const targetId =
    point.kind === "node"
      ? `node:${point.nodeId}`
      : `vertex:${point.vertexIndex}`;

  return {
    id: `${sectorId}:${targetId}`,
    kind: point.kind,
    ...(point.nodeId ? { nodeId: point.nodeId } : {}),
    point: { x: point.point.x, y: point.point.y },
    segmentId,
    ...(point.vertexIndex !== undefined ? { vertexIndex: point.vertexIndex } : {}),
  };
}

function applyInternalLevelChoice(
  network: ManualRouteNetwork,
  choice: CandidateChoice,
) {
  const segment = network.segments.find(
    (candidate) => candidate.id === choice.sector.segmentId,
  ) as RouteSegment;
  const vertices = (segment.vertices ?? []).map((point) => ({ ...point }));
  const elevations = vertices.map(
    (_, index) =>
      segment.vertexElevations?.[index]
        ? { ...(segment.vertexElevations[index] as ElevationMetadata) }
        : null,
  );
  const candidateChainIndex =
    choice.candidate.kind === "segment_vertex"
      ? (choice.candidate.vertexIndex as number) + 1
      : choice.candidate.nodeId === segment.fromNodeId
        ? 0
        : vertices.length + 1;

  for (
    let chainIndex = choice.sector.startIndex + 1;
    chainIndex < choice.sector.endIndex;
    chainIndex += 1
  ) {
    const vertexIndex = chainIndex - 1;
    const heightMeters =
      chainIndex <= candidateChainIndex
        ? choice.sector.startHeightMeters
        : choice.sector.endHeightMeters;
    const point = vertices[vertexIndex];

    if (point) {
      vertices[vertexIndex] = { ...point, z: heightMeters };
      elevations[vertexIndex] = { ...GENERATED_LEVEL_ELEVATION };
    }
  }

  if (candidateChainIndex === 0) {
    vertices.splice(0, 0, {
      x: choice.candidate.point.x,
      y: choice.candidate.point.y,
      z: choice.sector.endHeightMeters,
    });
    elevations.splice(0, 0, { ...GENERATED_LEVEL_ELEVATION });
  } else if (candidateChainIndex === vertices.length + 1) {
    vertices.push({
      x: choice.candidate.point.x,
      y: choice.candidate.point.y,
      z: choice.sector.startHeightMeters,
    });
    elevations.push({ ...GENERATED_LEVEL_ELEVATION });
  } else {
    const vertexIndex = candidateChainIndex - 1;
    const candidatePoint = vertices[vertexIndex] as Point2D;
    vertices[vertexIndex] = {
      ...candidatePoint,
      z: choice.sector.startHeightMeters,
    };
    elevations[vertexIndex] = { ...GENERATED_LEVEL_ELEVATION };
    vertices.splice(vertexIndex + 1, 0, {
      x: candidatePoint.x,
      y: candidatePoint.y,
      z: choice.sector.endHeightMeters,
    });
    elevations.splice(vertexIndex + 1, 0, {
      ...GENERATED_LEVEL_ELEVATION,
    });
  }

  const nextSegment: RouteSegment = {
    ...segment,
    vertexElevations: elevations,
    vertices,
  };
  const nextNetwork = {
    ...network,
    segments: network.segments.map((candidate) =>
      candidate.id === segment.id ? nextSegment : candidate,
    ),
  };
  const fromHeightMeters = choice.sector.startHeightMeters;
  const toHeightMeters = choice.sector.endHeightMeters;
  const change: InternalLevelChange = {
    candidate: cloneCandidate(choice.candidate),
    direction: toHeightMeters > fromHeightMeters ? "rise" : "drop",
    fromHeightMeters,
    id: `internal-level-change:${choice.sector.id}:${choice.candidate.id}`,
    point: { ...choice.candidate.point },
    sectorId: choice.sector.id,
    segmentId: choice.sector.segmentId,
    toHeightMeters,
  };

  return { change, network: nextNetwork };
}

function alternativeMetrics(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
  scaleMetersPerSourceUnit: number | null,
  addedVertexCount: number,
): InternalLevelAlternativeMetrics {
  let horizontalLengthSource = 0;
  let verticalLengthMeters = 0;
  let directionChangeCount = 0;

  for (const segment of resolveRouteSegments(network, equipment)) {
    const path = normalizedPhysicalPath(segment);
    const directions: Array<{ x: number; y: number; z: number }> = [];

    for (let index = 0; index < path.length - 1; index += 1) {
      const from = path[index] as Point2D;
      const to = path[index + 1] as Point2D;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = pointZMeters(to) - pointZMeters(from);
      const horizontal = Math.hypot(dx, dy);
      horizontalLengthSource += horizontal;
      verticalLengthMeters += Math.abs(dz);
      const length = Math.hypot(dx, dy, dz);

      if (length > LEVEL_EPSILON) {
        directions.push({ x: dx / length, y: dy / length, z: dz / length });
      }
    }

    directionChangeCount += directions.slice(1).filter((direction, index) => {
      const before = directions[index] as { x: number; y: number; z: number };
      return (
        Math.abs(
          before.x * direction.x +
            before.y * direction.y +
            before.z * direction.z,
        ) <
        1 - LEVEL_EPSILON
      );
    }).length;
  }

  return {
    addedVertexCount,
    directionChangeCount,
    horizontalLengthSource,
    physicalLengthMeters:
      scaleMetersPerSourceUnit === null
        ? null
        : horizontalLengthSource * scaleMetersPerSourceUnit +
          verticalLengthMeters,
    verticalLengthMeters,
  };
}

function compareGeometryAlternatives(
  first: InternalLevelAlternative,
  second: InternalLevelAlternative,
) {
  return (
    first.metrics.directionChangeCount - second.metrics.directionChangeCount ||
    nullableNumber(first.metrics.physicalLengthMeters) -
      nullableNumber(second.metrics.physicalLengthMeters) ||
    first.metrics.addedVertexCount - second.metrics.addedVertexCount ||
    first.id.localeCompare(second.id)
  );
}

function compareCandidates(first: InternalLevelCandidate, second: InternalLevelCandidate) {
  const firstKind = first.kind === "node" ? 0 : 1;
  const secondKind = second.kind === "node" ? 0 : 1;
  return firstKind - secondKind || first.id.localeCompare(second.id);
}

function routeSegmentIsOrthogonal3d(segment: ResolvedRouteSegment) {
  const path = normalizedPhysicalPath(segment);
  return path.slice(0, -1).every((from, index) => {
    const to = path[index + 1] as Point2D;
    const movesInPlan = !sameXY(from, to);
    const changesHeight = !sameHeight(pointZMeters(from), pointZMeters(to));
    return !(movesInPlan && changesHeight);
  });
}

function normalizedPhysicalPath(segment: ResolvedRouteSegment) {
  const path = segment.path.length >= 2
    ? segment.path
    : [segment.from, ...(segment.vertices ?? []), segment.to];
  const normalized: Point2D[] = [];
  let carriedHeight = pointZMeters(path[0]);

  path.forEach((point, index) => {
    const explicit = explicitZMeters(point);
    if (explicit !== null || index === 0 || index === path.length - 1) {
      carriedHeight = explicit ?? pointZMeters(point);
    }
    normalized.push({ x: point.x, y: point.y, z: carriedHeight });
  });

  return normalized;
}

function restrictionsAtPoint(
  point: Point2D,
  restrictions: AutomaticRouteRestriction[],
) {
  return restrictions
    .filter((restriction) =>
      restriction.kind === "polygon"
        ? segmentIntersectsPolygon(point, point, restriction.polygon)
        : pointOnSegment(point, restriction.from, restriction.to),
    )
    .map((restriction) => restriction.id)
    .sort();
}

function cloneRouteNetwork(network: ManualRouteNetwork): ManualRouteNetwork {
  return {
    nodes: network.nodes.map((node) => ({
      ...node,
      ...(node.elevation ? { elevation: { ...node.elevation } } : {}),
      ...(node.position ? { position: { ...node.position } } : {}),
    })),
    segments: network.segments.map((segment) => ({
      ...segment,
      ...(segment.accessories
        ? { accessories: segment.accessories.map((item) => ({ ...item })) }
        : {}),
      ...(segment.vertexElevations
        ? {
            vertexElevations: segment.vertexElevations.map((item) =>
              item ? { ...item } : null,
            ),
          }
        : {}),
      ...(segment.vertices
        ? { vertices: segment.vertices.map((point) => ({ ...point })) }
        : {}),
    })),
  };
}

function cloneCandidate(candidate: InternalLevelCandidate): InternalLevelCandidate {
  return { ...candidate, point: { ...candidate.point } };
}

function networkFingerprint(network: ManualRouteNetwork) {
  return JSON.stringify(
    network.segments.map((segment) => ({
      id: segment.id,
      vertices: segment.vertices ?? [],
    })),
  );
}

function explicitZMeters(point: Point2D | null | undefined) {
  return typeof point?.z === "number" && Number.isFinite(point.z)
    ? point.z
    : null;
}

function sameXY(first: Point2D, second: Point2D) {
  return Math.hypot(first.x - second.x, first.y - second.y) <= LEVEL_EPSILON;
}

function sameHeight(first: number, second: number) {
  return Math.abs(first - second) <= LEVEL_EPSILON;
}

function nullableNumber(value: number | null) {
  return value ?? Number.POSITIVE_INFINITY;
}
