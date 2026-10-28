import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  pointZMeters,
  type ElevationMetadata,
} from "@/lib/geometry/height";
import type { Point2D } from "@/lib/geometry/types";
import {
  buildEquipmentIndex,
  findRouteNodeByEquipment,
  findTerminalStartNodeByEquipment,
  getRouteNodeDegree,
  resolveRouteNodePosition,
  resolveRouteSegments,
  segmentConnects,
} from "@/lib/routing/network";
import {
  pointOnSegment,
  segmentIntersectsPolygon,
} from "@/lib/routing/geometry";
import { applyConfirmedEquipmentTerminalConnection } from "@/lib/routing/terminalConnection";
import type {
  AutomaticRouteRestriction,
  ManualRouteNetwork,
  ResolvedRouteSegment,
  RouteSegment,
} from "@/lib/routing/types";

const RISER_EPSILON = 0.000001;
const GENERATED_RISER_ELEVATION: ElevationMetadata = {
  source: "derived_calculation",
  status: "suggested",
};

export type AutomaticRouteRiserKind = "supply" | "terminal";

export type AutomaticRouteRiser = {
  direction: "drop" | "rise";
  equipmentId: string;
  fromHeightMeters: number;
  id: string;
  kind: AutomaticRouteRiserKind;
  point: Point2D;
  segmentId: string;
  toHeightMeters: number;
};

export type AutomaticRouteRiserDiagnosticCode =
  | "confirmed_height_conflict"
  | "distribution_height_missing"
  | "distribution_point_unresolved"
  | "invalid_vertical_geometry"
  | "known_restriction_collision"
  | "supply_height_unconfirmed"
  | "supply_missing"
  | "supply_outlet_count"
  | "terminal_geometry_unavailable"
  | "terminal_height_unconfirmed";

export type AutomaticRouteRiserDiagnostic = {
  code: AutomaticRouteRiserDiagnosticCode;
  equipmentId?: string;
  message: string;
  neededData: string;
  segmentId?: string;
  severity: "blocking" | "warning";
};

export type AutomaticRouteRiserInterference = {
  kind: "known_xy_restriction" | "unverified_3d_clearance";
  message: string;
  restrictionIds: string[];
  riserId: string;
  status: "blocking" | "unverified";
};

export type AutomaticRouteRiserProposal = {
  diagnostics: AutomaticRouteRiserDiagnostic[];
  interferences: AutomaticRouteRiserInterference[];
  network: ManualRouteNetwork;
  risers: AutomaticRouteRiser[];
  status: "incomplete" | "invalid" | "ready";
};

export type GenerateAutomaticRouteRisersParams = {
  distributionHeightMeters: number;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  restrictions?: AutomaticRouteRestriction[];
  scaleMetersPerSourceUnit?: number | null;
};

/**
 * Produces a candidate network only. The input network and equipment are never
 * mutated, and no technical decision is accepted by this operation.
 */
export function generateAutomaticRouteRisers(
  params: GenerateAutomaticRouteRisersParams,
): AutomaticRouteRiserProposal {
  let network = cloneRouteNetwork(params.network);
  const diagnostics: AutomaticRouteRiserDiagnostic[] = [];
  const interferences: AutomaticRouteRiserInterference[] = [];
  const risers: AutomaticRouteRiser[] = [];

  if (!Number.isFinite(params.distributionHeightMeters)) {
    diagnostics.push({
      code: "distribution_height_missing",
      message: "La altura de distribucion no es un numero finito.",
      neededData:
        "Indique una altura de distribucion valida referida a la cota del proyecto.",
      severity: "blocking",
    });
    return proposalResult(network, risers, diagnostics, interferences);
  }

  const supplyEquipment = params.equipment.filter(
    (item) => item.role === "supply",
  );
  const supply = supplyEquipment[0] ?? null;

  if (supplyEquipment.length !== 1 || !supply) {
    diagnostics.push({
      code: "supply_missing",
      message:
        supplyEquipment.length === 0
          ? "No se encontro el medidor de la red."
          : "La red tiene mas de un punto de alimentacion.",
      neededData:
        "Defina un unico medidor con su conexion y cota confirmadas.",
      severity: "blocking",
    });
  } else {
    const supplyResult = applySupplyRiser({
      distributionHeightMeters: params.distributionHeightMeters,
      equipment: params.equipment,
      network,
      supply,
    });
    network = supplyResult.network;
    diagnostics.push(...supplyResult.diagnostics);
    risers.push(...supplyResult.risers);
  }

  for (const appliance of params.equipment
    .filter((item) => item.role === "appliance")
    .sort((first, second) => first.id.localeCompare(second.id))) {
    const terminalResult = applyTerminalRisers({
      appliance,
      distributionHeightMeters: params.distributionHeightMeters,
      equipment: params.equipment,
      network,
      scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit ?? null,
    });
    network = terminalResult.network;
    diagnostics.push(...terminalResult.diagnostics);
    risers.push(...terminalResult.risers);
  }

  const uniqueRisers = dedupeRisers(risers);

  for (const riser of uniqueRisers) {
    const restrictionIds = restrictionsAtPoint(
      riser.point,
      params.restrictions ?? [],
    );

    if (restrictionIds.length > 0) {
      diagnostics.push({
        code: "known_restriction_collision",
        equipmentId: riser.equipmentId,
        message: `El montante ${riser.id} coincide en planta con una restriccion activa.`,
        neededData:
          "Reubique el montante o confirme una resolucion profesional de la interferencia.",
        segmentId: riser.segmentId,
        severity: "blocking",
      });
      interferences.push({
        kind: "known_xy_restriction",
        message:
          "La proyeccion XY del montante intersecta una restriccion conocida.",
        restrictionIds,
        riserId: riser.id,
        status: "blocking",
      });
    }

    interferences.push({
      kind: "unverified_3d_clearance",
      message:
        "La arquitectura disponible no aporta extensiones verticales suficientes para verificar el despeje tridimensional.",
      restrictionIds: [],
      riserId: riser.id,
      status: "unverified",
    });
  }

  return proposalResult(network, uniqueRisers, diagnostics, interferences);
}

function applySupplyRiser(params: {
  distributionHeightMeters: number;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  supply: WorkbenchEquipment;
}) {
  const diagnostics: AutomaticRouteRiserDiagnostic[] = [];
  const risers: AutomaticRouteRiser[] = [];
  const supplyNode = findRouteNodeByEquipment(
    params.network,
    params.supply.id,
  );
  const supplyHeight = explicitZMeters(params.supply.connectionPoint);

  if (!supplyNode) {
    diagnostics.push({
      code: "supply_missing",
      equipmentId: params.supply.id,
      message: "El medidor no tiene un nodo conectado en la red.",
      neededData: "Conecte el medidor a la red XY antes de generar el montante.",
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  if (
    params.supply.elevation?.status !== "confirmed" ||
    supplyHeight === null
  ) {
    diagnostics.push({
      code: "supply_height_unconfirmed",
      equipmentId: params.supply.id,
      message: "La cota del medidor no esta confirmada.",
      neededData:
        "Confirme la cota de conexion del medidor respecto de la cota del proyecto.",
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  const incidentSegments = params.network.segments.filter(
    (segment) =>
      segment.fromNodeId === supplyNode.id || segment.toNodeId === supplyNode.id,
  );

  if (incidentSegments.length !== 1) {
    diagnostics.push({
      code: "supply_outlet_count",
      equipmentId: params.supply.id,
      message: `El medidor tiene ${incidentSegments.length} salidas en la red.`,
      neededData:
        "Indique cual salida contiene el montante o reduzca la conexion del medidor a una unica salida.",
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  const segment = incidentSegments[0] as RouteSegment;
  const otherNodeId =
    segment.fromNodeId === supplyNode.id
      ? segment.toNodeId
      : segment.fromNodeId;
  const otherNode =
    params.network.nodes.find((node) => node.id === otherNodeId) ?? null;
  const equipmentById = buildEquipmentIndex(params.equipment);
  const distributionPoint = otherNode
    ? resolveRouteNodePosition(otherNode, equipmentById)
    : null;
  const distributionPointHeight = explicitZMeters(distributionPoint);

  if (
    !distributionPoint ||
    distributionPointHeight === null ||
    !sameHeight(
      distributionPointHeight,
      params.distributionHeightMeters,
    )
  ) {
    diagnostics.push({
      code:
        otherNode?.elevation?.status === "confirmed"
          ? "confirmed_height_conflict"
          : "distribution_point_unresolved",
      equipmentId: params.supply.id,
      message:
        otherNode?.elevation?.status === "confirmed"
          ? "La salida del medidor llega a una cota confirmada diferente de la distribucion."
          : "No se pudo identificar la cota de distribucion en la salida del medidor.",
      neededData:
        otherNode?.elevation?.status === "confirmed"
          ? "Defina profesionalmente donde ocurre el cambio entre ambas cotas confirmadas."
          : "Complete la propuesta de altura del primer nodo de distribucion.",
      segmentId: segment.id,
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  if (sameHeight(supplyHeight, params.distributionHeightMeters)) {
    return { diagnostics, network: params.network, risers };
  }

  const updatedSegment = withSupplyRiserVertex({
    distributionHeightMeters: params.distributionHeightMeters,
    segment,
    supplyNodeId: supplyNode.id,
    supplyPoint: params.supply.connectionPoint,
  });
  const network = {
    ...params.network,
    segments: params.network.segments.map((candidate) =>
      candidate.id === segment.id ? updatedSegment : candidate,
    ),
  };
  const resolved = resolveRouteSegments(network, params.equipment).find(
    (candidate) => candidate.id === segment.id,
  );

  if (!resolved || !routeSegmentIsOrthogonal3d(resolved)) {
    diagnostics.push({
      code: "invalid_vertical_geometry",
      equipmentId: params.supply.id,
      message: "La subida del medidor produciria una geometria diagonal.",
      neededData:
        "Revise los vertices y cotas confirmadas del primer tramo de distribucion.",
      segmentId: segment.id,
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  risers.push(
    ...verticalLegsForSegment(resolved, "supply", params.supply.id),
  );
  return { diagnostics, network, risers };
}

function applyTerminalRisers(params: {
  appliance: WorkbenchEquipment;
  distributionHeightMeters: number;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  scaleMetersPerSourceUnit: number | null;
}) {
  const diagnostics: AutomaticRouteRiserDiagnostic[] = [];
  const risers: AutomaticRouteRiser[] = [];
  const applianceNode = findRouteNodeByEquipment(
    params.network,
    params.appliance.id,
  );

  if (!applianceNode || getRouteNodeDegree(params.network, applianceNode.id) === 0) {
    return { diagnostics, network: params.network, risers };
  }

  const terminalConfig = params.appliance.terminalConfig;

  if (
    !terminalConfig ||
    terminalConfig.heightStatus !== "confirmed" ||
    terminalConfig.connectionHeightMeters === null ||
    !Number.isFinite(terminalConfig.connectionHeightMeters)
  ) {
    diagnostics.push({
      code: "terminal_height_unconfirmed",
      equipmentId: params.appliance.id,
      message: `La terminal ${params.appliance.name} no tiene una configuracion de altura confirmada.`,
      neededData:
        "Confirme la cota y la configuracion fisica de esta conexion terminal.",
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  const terminalStart = findTerminalStartNodeByEquipment(
    params.network,
    params.appliance.id,
  );
  const equipmentById = buildEquipmentIndex(params.equipment);
  const terminalStartPoint = terminalStart
    ? resolveRouteNodePosition(terminalStart, equipmentById)
    : null;
  const terminalStartHeight = explicitZMeters(terminalStartPoint);

  if (
    !terminalStart ||
    !terminalStartPoint ||
    terminalStartHeight === null ||
    !sameHeight(terminalStartHeight, params.distributionHeightMeters)
  ) {
    diagnostics.push({
      code:
        terminalStart?.elevation?.status === "confirmed"
          ? "confirmed_height_conflict"
          : "terminal_geometry_unavailable",
      equipmentId: params.appliance.id,
      message:
        terminalStart?.elevation?.status === "confirmed"
          ? `La terminal ${params.appliance.name} parte de una cota confirmada diferente de la distribucion.`
          : `No se pudo resolver el inicio de distribucion de la terminal ${params.appliance.name}.`,
      neededData:
        terminalStart?.elevation?.status === "confirmed"
          ? "Defina profesionalmente el punto del cambio entre ambas cotas confirmadas."
          : "Complete el nodo de inicio terminal y su cota de distribucion.",
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  const terminalSegment = params.network.segments.find((segment) =>
    segmentConnects(segment, applianceNode.id, terminalStart.id),
  );

  if (!terminalSegment || getRouteNodeDegree(params.network, applianceNode.id) !== 1) {
    diagnostics.push({
      code: "terminal_geometry_unavailable",
      equipmentId: params.appliance.id,
      message: `La terminal ${params.appliance.name} no es una hoja unica valida.`,
      neededData:
        "Corrija la conexion terminal antes de generar subidas o bajadas automaticas.",
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  const terminalUpdate = applyConfirmedEquipmentTerminalConnection({
    equipment: params.equipment,
    equipmentId: params.appliance.id,
    network: params.network,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
  });

  if (!terminalUpdate.ok) {
    diagnostics.push({
      code: "terminal_geometry_unavailable",
      equipmentId: params.appliance.id,
      message: terminalUpdate.message,
      neededData:
        "Revise la geometria, escala y configuracion confirmada de la terminal.",
      segmentId: terminalSegment.id,
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  const updatedTerminalSegment = terminalUpdate.network.segments.find(
    (segment) => segment.id === terminalSegment.id,
  );

  if (
    !updatedTerminalSegment ||
    !confirmedTerminalVerticesArePreserved(
      terminalSegment,
      updatedTerminalSegment,
    )
  ) {
    diagnostics.push({
      code: "confirmed_height_conflict",
      equipmentId: params.appliance.id,
      message: `La regeneracion de ${params.appliance.name} alteraria un vertice terminal confirmado.`,
      neededData:
        "Revise o confirme expresamente la geometria terminal antes de regenerarla.",
      segmentId: terminalSegment.id,
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  const resolved = resolveRouteSegments(
    terminalUpdate.network,
    params.equipment,
  ).find((segment) => segment.id === terminalSegment.id);

  if (!resolved || !routeSegmentIsOrthogonal3d(resolved)) {
    diagnostics.push({
      code: "invalid_vertical_geometry",
      equipmentId: params.appliance.id,
      message: `La conexion de ${params.appliance.name} contiene una pata diagonal.`,
      neededData:
        "Revise la orientacion, el desplazamiento y las cotas de la terminal.",
      segmentId: terminalSegment.id,
      severity: "blocking",
    });
    return { diagnostics, network: params.network, risers };
  }

  risers.push(
    ...verticalLegsForSegment(
      resolved,
      "terminal",
      params.appliance.id,
    ),
  );
  return { diagnostics, network: terminalUpdate.network, risers };
}

function withSupplyRiserVertex(params: {
  distributionHeightMeters: number;
  segment: RouteSegment;
  supplyNodeId: string;
  supplyPoint: Point2D;
}): RouteSegment {
  const forward = params.segment.fromNodeId === params.supplyNodeId;
  const orientedVertices = forward
    ? [...(params.segment.vertices ?? [])]
    : [...(params.segment.vertices ?? [])].reverse();
  const orientedElevations = forward
    ? vertexElevations(params.segment)
    : vertexElevations(params.segment).reverse();
  let leadingVertexCount = 0;

  while (
    leadingVertexCount < orientedVertices.length &&
    sameXY(
      orientedVertices[leadingVertexCount] as Point2D,
      params.supplyPoint,
    )
  ) {
    leadingVertexCount += 1;
  }

  const matchingIndex = orientedVertices
    .slice(0, leadingVertexCount)
    .findIndex((point) => {
      const height = explicitZMeters(point);
      return (
        height !== null &&
        sameHeight(height, params.distributionHeightMeters)
      );
    });

  if (matchingIndex < 0) {
    orientedVertices.splice(leadingVertexCount, 0, {
      x: params.supplyPoint.x,
      y: params.supplyPoint.y,
      z: params.distributionHeightMeters,
    });
    orientedElevations.splice(
      leadingVertexCount,
      0,
      GENERATED_RISER_ELEVATION,
    );
  }

  const vertices = forward ? orientedVertices : orientedVertices.reverse();
  const elevations = forward
    ? orientedElevations
    : orientedElevations.reverse();

  return {
    ...params.segment,
    vertexElevations: elevations,
    vertices,
  };
}

function verticalLegsForSegment(
  segment: ResolvedRouteSegment,
  kind: AutomaticRouteRiserKind,
  equipmentId: string,
) {
  const path = normalizedPhysicalPath(segment);
  const risers: AutomaticRouteRiser[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index] as Point2D;
    const to = path[index + 1] as Point2D;
    const fromHeightMeters = pointZMeters(from);
    const toHeightMeters = pointZMeters(to);

    if (!sameXY(from, to) || sameHeight(fromHeightMeters, toHeightMeters)) {
      continue;
    }

    risers.push({
      direction: toHeightMeters > fromHeightMeters ? "rise" : "drop",
      equipmentId,
      fromHeightMeters,
      id: `route-riser:${kind}:${equipmentId}:${segment.id}:${index}`,
      kind,
      point: { x: from.x, y: from.y },
      segmentId: segment.id,
      toHeightMeters,
    });
  }

  return risers;
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
  const rawPath = segment.path.length >= 2
    ? segment.path
    : [segment.from, ...(segment.vertices ?? []), segment.to];
  const normalized: Point2D[] = [];
  let carriedHeight = pointZMeters(rawPath[0]);

  rawPath.forEach((point, index) => {
    const endpoint = index === 0 || index === rawPath.length - 1;
    const explicit = explicitZMeters(point);

    if (explicit !== null || endpoint) {
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

function proposalResult(
  network: ManualRouteNetwork,
  risers: AutomaticRouteRiser[],
  diagnostics: AutomaticRouteRiserDiagnostic[],
  interferences: AutomaticRouteRiserInterference[],
): AutomaticRouteRiserProposal {
  const hasInvalid = diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "invalid_vertical_geometry" ||
      diagnostic.code === "known_restriction_collision",
  );
  const hasBlocking = diagnostics.some(
    (diagnostic) => diagnostic.severity === "blocking",
  );

  return {
    diagnostics,
    interferences,
    network,
    risers,
    status: hasInvalid ? "invalid" : hasBlocking ? "incomplete" : "ready",
  };
}

function dedupeRisers(risers: AutomaticRouteRiser[]) {
  const unique = new Map<string, AutomaticRouteRiser>();

  for (const riser of risers) {
    const key = [
      riser.kind,
      riser.equipmentId,
      riser.segmentId,
      formatNumber(riser.point.x),
      formatNumber(riser.point.y),
      formatNumber(riser.fromHeightMeters),
      formatNumber(riser.toHeightMeters),
    ].join(":");
    unique.set(key, riser);
  }

  return [...unique.values()].sort((first, second) =>
    first.id.localeCompare(second.id),
  );
}

function vertexElevations(segment: RouteSegment) {
  return (segment.vertices ?? []).map(
    (_, index) => segment.vertexElevations?.[index] ?? null,
  );
}

function confirmedTerminalVerticesArePreserved(
  before: RouteSegment,
  after: RouteSegment,
) {
  const confirmed = (before.vertices ?? []).filter(
    (_, index) => before.vertexElevations?.[index]?.status === "confirmed",
  );

  return confirmed.every((point) =>
    (after.vertices ?? []).some((candidate) => samePoint3d(candidate, point)),
  );
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
        ? {
            accessories: segment.accessories.map((accessory) => ({
              ...accessory,
            })),
          }
        : {}),
      ...(segment.vertexElevations
        ? {
            vertexElevations: segment.vertexElevations.map((elevation) =>
              elevation ? { ...elevation } : null,
            ),
          }
        : {}),
      ...(segment.vertices
        ? { vertices: segment.vertices.map((point) => ({ ...point })) }
        : {}),
    })),
  };
}

function explicitZMeters(point: Point2D | null | undefined) {
  return typeof point?.z === "number" && Number.isFinite(point.z)
    ? point.z
    : null;
}

function sameXY(first: Point2D, second: Point2D) {
  return Math.hypot(first.x - second.x, first.y - second.y) <= RISER_EPSILON;
}

function sameHeight(first: number, second: number) {
  return Math.abs(first - second) <= RISER_EPSILON;
}

function samePoint3d(first: Point2D, second: Point2D) {
  const firstHeight = explicitZMeters(first);
  const secondHeight = explicitZMeters(second);

  return (
    sameXY(first, second) &&
    firstHeight !== null &&
    secondHeight !== null &&
    sameHeight(firstHeight, secondHeight)
  );
}

function formatNumber(value: number) {
  return value.toFixed(6);
}
