import type {
  PipeDiameterReference,
} from "@/lib/calculation/pipeSystem";
import type {
  TechnicalAdoptedDiameterValidation,
} from "@/lib/calculation/technicalAdoptedDiameterValidation";
import type {
  TechnicalPhysicalAccessory,
  TechnicalPhysicalAccessoryInventory,
  TechnicalPhysicalAccessoryKind,
} from "@/lib/calculation/technicalPhysicalAccessories";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  buildEquipmentIndex,
  resolveRouteNodePosition,
  resolveRouteSegments,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  ResolvedRouteSegment,
  RouteSegmentAccessory,
  RouteNode,
} from "@/lib/routing/types";
import {
  MIN_SECTION_REGISTRATION_LENGTH,
  projectPlanPointToSection,
  type SectionRegistration,
} from "@/lib/sections/registration";
import type { SectionRouteHeightTarget } from "./routeHeightEditing";

export type SectionRouteProjectionStatus = "pending" | "resolved";

export type SectionRouteProjectedPointSource =
  | "connection"
  | "node"
  | "vertex"
  | "vertical";

export type SectionRouteProjectedPoint = {
  elevationMeters: number;
  heightTarget: SectionRouteHeightTarget | null;
  heightInSectionUnits: number;
  planPoint: Point2D;
  sectionPoint: Point2D;
  source: SectionRouteProjectedPointSource;
  t: number;
};

export type SectionRouteProjectedSegment = {
  adoptedDiameter: PipeDiameterReference | null;
  adoptedDiameterLabel: string;
  fromNodeId: string;
  id: string;
  pendingReason: string | null;
  physicalLengthMeters: number | null;
  points: SectionRouteProjectedPoint[];
  segmentId: string;
  status: SectionRouteProjectionStatus;
  toNodeId: string;
};

export type SectionRouteProjectedAccessory = {
  id: string;
  kind: TechnicalPhysicalAccessoryKind;
  label: string;
  pendingReason: string | null;
  planPoint: Point2D | null;
  routeUseCount: number;
  sectionPoint: Point2D | null;
  segmentIds: string[];
  sourceIds: string[];
  status: SectionRouteProjectionStatus;
};

export type SectionRouteProjectedEquipment = {
  anchorStatus: "anchored" | "pending" | null;
  bodyPlanPoint: Point2D;
  bodySectionPoint: Point2D | null;
  equipmentId: string;
  heightTarget: SectionRouteHeightTarget;
  label: string;
  nodeId: string;
  planPoint: Point2D;
  role: WorkbenchEquipment["role"];
  sectionPoint: Point2D;
  zMeters: number;
};

export type SectionRouteProjectionPendingItem = {
  id: string;
  reason: string;
  sourceId?: string;
  sourceType: "accessory" | "equipment" | "link" | "segment";
};

export type SectionRouteProjection = {
  accessories: SectionRouteProjectedAccessory[];
  equipment: SectionRouteProjectedEquipment[];
  pendingItems: SectionRouteProjectionPendingItem[];
  segments: SectionRouteProjectedSegment[];
  status: SectionRouteProjectionStatus;
};

export type SectionRouteProjectionLink = {
  id?: string;
  planEnd: Point2D;
  planStart: Point2D;
  registration?: SectionRegistration;
};

export function createSectionRouteProjection(params: {
  adoptedDiameterValidation?: TechnicalAdoptedDiameterValidation | null;
  equipment: WorkbenchEquipment[];
  inventory?: TechnicalPhysicalAccessoryInventory | null;
  link: SectionRouteProjectionLink | null;
  network: ManualRouteNetwork;
  result?: TechnicalCalculationResult | null;
  sectionScaleMetersPerSourceUnit: number | null;
  toleranceSource?: number;
}): SectionRouteProjection {
  const prerequisiteFailure = validateProjectionPrerequisites(params);

  if (prerequisiteFailure) {
    return createPendingProjection(prerequisiteFailure);
  }

  const link = params.link as SectionRouteProjectionLink & {
    registration: SectionRegistration;
  };
  const sectionScaleMetersPerSourceUnit =
    params.sectionScaleMetersPerSourceUnit as number;
  const planLength = distanceBetween(link.planStart, link.planEnd);
  const toleranceRatio = (params.toleranceSource ?? 0) / planLength;
  const pendingItems: SectionRouteProjectionPendingItem[] = [];
  const adoptedBySegmentId = new Map(
    (params.adoptedDiameterValidation?.segments ?? []).map((segment) => [
      segment.segmentId,
      segment,
    ]),
  );
  const resultSegmentById = new Map(
    (params.result?.segments ?? []).map((segment) => [segment.segmentId, segment]),
  );
  const resolvedSegments = resolveRouteSegments(params.network, params.equipment);
  const resolvedSegmentById = new Map(
    resolvedSegments.map((segment) => [segment.id, segment]),
  );
  const segments = resolvedSegments
    .map((segment) =>
      createProjectedSegment({
        adoptedDiameter:
          adoptedBySegmentId.get(segment.id)?.adoptedDiameter ?? null,
        link,
        pendingItems,
        resultPhysicalLengthMeters:
          resultSegmentById.get(segment.id)?.segmentPhysicalLengthMeters ?? null,
        sectionScaleMetersPerSourceUnit,
        segment,
        toleranceRatio,
      }),
    )
    .filter(
      (
        segment,
      ): segment is SectionRouteProjectedSegment => segment !== null,
    )
    .sort((first, second) => first.segmentId.localeCompare(second.segmentId));
  const relevantSegmentIds = new Set(
    segments.map((segment) => segment.segmentId),
  );
  const inventoryAccessories = (params.inventory?.items ?? [])
    .map((item) =>
      createProjectedAccessory({
        item,
        link,
        pendingItems,
        relevantSegmentIds,
        resolvedSegmentById,
        sectionScaleMetersPerSourceUnit,
        toleranceRatio,
      }),
    )
    .filter(
      (
        item,
      ): item is SectionRouteProjectedAccessory => item !== null,
    );
  const projectedAccessoryIds = new Set(
    inventoryAccessories.map((accessory) => accessory.id),
  );
  const routeAccessories = resolvedSegments
    .filter((segment) => relevantSegmentIds.has(segment.id))
    .flatMap((segment) =>
      (segment.accessories ?? []).map((accessory) =>
        createProjectedRouteAccessory({
          accessory,
          link,
          pendingItems,
          projectedAccessoryIds,
          sectionScaleMetersPerSourceUnit,
          segment,
          toleranceRatio,
        }),
      ),
    )
    .filter(
      (
        item,
      ): item is SectionRouteProjectedAccessory => item !== null,
    );
  const accessories = [...inventoryAccessories, ...routeAccessories].sort(
    (first, second) => first.id.localeCompare(second.id),
  );
  const equipment = createProjectedEquipment({
    equipment: params.equipment,
    link,
    network: params.network,
    pendingItems,
    sectionScaleMetersPerSourceUnit,
    toleranceRatio,
  });

  if (
    resolvedSegments.length > 0 &&
    segments.length === 0 &&
    accessories.length === 0 &&
    equipment.length === 0 &&
    pendingItems.length === 0
  ) {
    pendingItems.push({
      id: "section-route:outside-section",
      reason:
        "La red confirmada queda fuera del alcance o tolerancia del corte calibrado.",
      sourceId: link.id,
      sourceType: "link",
    });
  }

  const hasPending =
    pendingItems.length > 0 ||
    segments.some((segment) => segment.status === "pending") ||
    accessories.some((accessory) => accessory.status === "pending");

  return {
    accessories,
    equipment,
    pendingItems: dedupePendingItems(pendingItems),
    segments,
    status: hasPending ? "pending" : "resolved",
  };
}

function createProjectedSegment(params: {
  adoptedDiameter: PipeDiameterReference | null;
  link: SectionRouteProjectionLink & { registration: SectionRegistration };
  pendingItems: SectionRouteProjectionPendingItem[];
  resultPhysicalLengthMeters: number | null;
  sectionScaleMetersPerSourceUnit: number;
  segment: ResolvedRouteSegment;
  toleranceRatio: number;
}): SectionRouteProjectedSegment | null {
  const fromElevation = explicitZMeters(params.segment.from);
  const toElevation = explicitZMeters(params.segment.to);

  if (fromElevation === null || toElevation === null) {
    const pendingReason = "Falta cota Z confirmada en un extremo del tramo.";
    params.pendingItems.push({
      id: `section-route:segment:${params.segment.id}:z`,
      reason: pendingReason,
      sourceId: params.segment.id,
      sourceType: "segment",
    });

    return {
      adoptedDiameter: params.adoptedDiameter,
      adoptedDiameterLabel: formatDiameterSymbol(params.adoptedDiameter),
      fromNodeId: params.segment.fromNodeId,
      id: `section-route:segment:${params.segment.id}`,
      pendingReason,
      physicalLengthMeters: params.resultPhysicalLengthMeters,
      points: [],
      segmentId: params.segment.id,
      status: "pending",
      toNodeId: params.segment.toNodeId,
    };
  }

  const projectedPoints = createElevatedRoutePath({
    fromElevation,
    segment: params.segment,
    toElevation,
  }).map((point) =>
    projectPathPoint({
      elevatedPoint: point,
      link: params.link,
      sectionScaleMetersPerSourceUnit: params.sectionScaleMetersPerSourceUnit,
    }),
  );
  const tValues = projectedPoints.map((point) => point.t);
  const isRelevant =
    Math.min(...tValues) <= 1 + params.toleranceRatio &&
    Math.max(...tValues) >= -params.toleranceRatio;

  if (!isRelevant) {
    return null;
  }

  const outsideRegisteredSpan = projectedPoints.some(
    (point) => !tWithinSectionSpan(point.t, params.toleranceRatio),
  );
  const missingDiameter = !params.adoptedDiameter;
  const pendingReason = outsideRegisteredSpan
    ? "El tramo excede los extremos registrados del corte."
    : missingDiameter
      ? "Falta diametro adoptado para rotular el tramo en corte."
      : null;

  if (pendingReason) {
    params.pendingItems.push({
      id: `section-route:segment:${params.segment.id}`,
      reason: pendingReason,
      sourceId: params.segment.id,
      sourceType: "segment",
    });
  }

  return {
    adoptedDiameter: params.adoptedDiameter,
    adoptedDiameterLabel: formatDiameterSymbol(params.adoptedDiameter),
    fromNodeId: params.segment.fromNodeId,
    id: `section-route:segment:${params.segment.id}`,
    pendingReason,
    physicalLengthMeters: params.resultPhysicalLengthMeters,
    points: projectedPoints,
    segmentId: params.segment.id,
    status: pendingReason ? "pending" : "resolved",
    toNodeId: params.segment.toNodeId,
  };
}

function createProjectedAccessory(params: {
  item: TechnicalPhysicalAccessory;
  link: SectionRouteProjectionLink & { registration: SectionRegistration };
  pendingItems: SectionRouteProjectionPendingItem[];
  relevantSegmentIds: Set<string>;
  resolvedSegmentById: Map<string, ResolvedRouteSegment>;
  sectionScaleMetersPerSourceUnit: number;
  toleranceRatio: number;
}): SectionRouteProjectedAccessory | null {
  const belongsToProjectedRoute = params.item.segmentIds.some((segmentId) =>
    params.relevantSegmentIds.has(segmentId),
  );

  if (!belongsToProjectedRoute) {
    return null;
  }

  const accessoryPlanPoint =
    params.item.position && hasExplicitZ(params.item.position)
      ? params.item.position
      : terminalRouteAccessoryPlanPoint({
          item: params.item,
          resolvedSegmentById: params.resolvedSegmentById,
        });

  if (!accessoryPlanPoint || !hasExplicitZ(accessoryPlanPoint)) {
    const reason = "Falta posicion confirmada del accesorio fisico.";
    params.pendingItems.push({
      id: `section-route:accessory:${params.item.id}`,
      reason,
      sourceId: params.item.id,
      sourceType: "accessory",
    });

    return {
      id: params.item.id,
      kind: params.item.kind,
      label: accessoryLabel(params.item),
      pendingReason: reason,
      planPoint: null,
      routeUseCount: params.item.routeUses.length,
      sectionPoint: null,
      segmentIds: params.item.segmentIds,
      sourceIds: params.item.sourceIds,
      status: "pending",
    };
  }

  const projected = projectPlanPointToSection({
    elevationMeters: explicitZMeters(accessoryPlanPoint) as number,
    planEnd: params.link.planEnd,
    planPoint: accessoryPlanPoint,
    planStart: params.link.planStart,
    registration: params.link.registration,
    sectionScaleMetersPerSourceUnit: params.sectionScaleMetersPerSourceUnit,
  });
  const outsideRegisteredSpan = !tWithinSectionSpan(
    projected.t,
    params.toleranceRatio,
  );
  const pendingReason = outsideRegisteredSpan
    ? "El accesorio queda fuera de los extremos registrados del corte."
    : null;

  if (pendingReason) {
    params.pendingItems.push({
      id: `section-route:accessory:${params.item.id}`,
      reason: pendingReason,
      sourceId: params.item.id,
      sourceType: "accessory",
    });
  }

  return {
    id: params.item.id,
    kind: params.item.kind,
    label: accessoryLabel(params.item),
    pendingReason,
    planPoint: accessoryPlanPoint,
    routeUseCount: params.item.routeUses.length,
    sectionPoint: projected.sectionPoint,
    segmentIds: params.item.segmentIds,
    sourceIds: params.item.sourceIds,
    status: pendingReason ? "pending" : "resolved",
  };
}

function createProjectedRouteAccessory(params: {
  accessory: RouteSegmentAccessory;
  link: SectionRouteProjectionLink & { registration: SectionRegistration };
  pendingItems: SectionRouteProjectionPendingItem[];
  projectedAccessoryIds: Set<string>;
  sectionScaleMetersPerSourceUnit: number;
  segment: ResolvedRouteSegment;
  toleranceRatio: number;
}): SectionRouteProjectedAccessory | null {
  const id = routeAccessoryProjectionId(
    params.segment.id,
    params.accessory.id,
  );

  if (params.projectedAccessoryIds.has(id)) {
    return null;
  }

  const terminalKind = terminalRouteSegmentAccessoryKind(params.accessory);

  if (!terminalKind) {
    return null;
  }

  const planPoint = terminalRouteSegmentAccessoryPlanPoint({
    accessoryKind: terminalKind,
    segment: params.segment,
  });

  if (!planPoint || !hasExplicitZ(planPoint)) {
    const reason = "Falta posicion confirmada del accesorio fisico.";
    params.pendingItems.push({
      id: `section-route:accessory:${id}`,
      reason,
      sourceId: id,
      sourceType: "accessory",
    });

    return {
      id,
      kind: routeSegmentAccessoryPhysicalKind(params.accessory),
      label: routeSegmentAccessoryLabel(params.accessory),
      pendingReason: reason,
      planPoint: null,
      routeUseCount: 0,
      sectionPoint: null,
      segmentIds: [params.segment.id],
      sourceIds: [`${params.segment.id}:${params.accessory.id}`],
      status: "pending",
    };
  }

  const projected = projectPlanPointToSection({
    elevationMeters: explicitZMeters(planPoint) as number,
    planEnd: params.link.planEnd,
    planPoint,
    planStart: params.link.planStart,
    registration: params.link.registration,
    sectionScaleMetersPerSourceUnit: params.sectionScaleMetersPerSourceUnit,
  });
  const outsideRegisteredSpan = !tWithinSectionSpan(
    projected.t,
    params.toleranceRatio,
  );
  const pendingReason = outsideRegisteredSpan
    ? "El accesorio queda fuera de los extremos registrados del corte."
    : null;

  if (pendingReason) {
    params.pendingItems.push({
      id: `section-route:accessory:${id}`,
      reason: pendingReason,
      sourceId: id,
      sourceType: "accessory",
    });
  }

  return {
    id,
    kind: routeSegmentAccessoryPhysicalKind(params.accessory),
    label: routeSegmentAccessoryLabel(params.accessory),
    pendingReason,
    planPoint,
    routeUseCount: 0,
    sectionPoint: projected.sectionPoint,
    segmentIds: [params.segment.id],
    sourceIds: [`${params.segment.id}:${params.accessory.id}`],
    status: pendingReason ? "pending" : "resolved",
  };
}

function createProjectedEquipment(params: {
  equipment: WorkbenchEquipment[];
  link: SectionRouteProjectionLink & { registration: SectionRegistration };
  network: ManualRouteNetwork;
  pendingItems: SectionRouteProjectionPendingItem[];
  sectionScaleMetersPerSourceUnit: number;
  toleranceRatio: number;
}) {
  const equipmentById = buildEquipmentIndex(params.equipment);

  return params.network.nodes
    .map((node) =>
      createProjectedEquipmentNode({
        equipmentById,
        link: params.link,
        node,
        pendingItems: params.pendingItems,
        sectionScaleMetersPerSourceUnit:
          params.sectionScaleMetersPerSourceUnit,
        toleranceRatio: params.toleranceRatio,
      }),
    )
    .filter(
      (item): item is SectionRouteProjectedEquipment => item !== null,
    )
    .sort((first, second) => first.nodeId.localeCompare(second.nodeId));
}

function createProjectedEquipmentNode(params: {
  equipmentById: Map<string, WorkbenchEquipment>;
  link: SectionRouteProjectionLink & { registration: SectionRegistration };
  node: RouteNode;
  pendingItems: SectionRouteProjectionPendingItem[];
  sectionScaleMetersPerSourceUnit: number;
  toleranceRatio: number;
}): SectionRouteProjectedEquipment | null {
  if (!params.node.equipmentId) {
    return null;
  }

  const equipment = params.equipmentById.get(params.node.equipmentId);
  const planPoint = resolveRouteNodePosition(params.node, params.equipmentById);

  if (!equipment || !planPoint) {
    return null;
  }

  const zMeters = explicitZMeters(planPoint);

  if (zMeters === null) {
    params.pendingItems.push({
      id: `section-route:equipment:${params.node.id}:z`,
      reason: "Falta cota Z confirmada del equipo conectado.",
      sourceId: params.node.id,
      sourceType: "equipment",
    });
    return null;
  }

  const projected = projectPlanPointToSection({
    elevationMeters: zMeters,
    planEnd: params.link.planEnd,
    planPoint,
    planStart: params.link.planStart,
    registration: params.link.registration,
    sectionScaleMetersPerSourceUnit: params.sectionScaleMetersPerSourceUnit,
  });

  if (!tWithinSectionSpan(projected.t, params.toleranceRatio)) {
    return null;
  }

  const bodyPlanPoint = equipment.bodyPoint ?? planPoint;
  const bodyZ = explicitZMeters(bodyPlanPoint);
  let bodySectionPoint: Point2D | null = null;

  if (bodyZ === null) {
    params.pendingItems.push({
      id: `section-route:equipment:${params.node.id}:body-z`,
      reason: "Falta cota Z confirmada del simbolo del equipo.",
      sourceId: params.node.id,
      sourceType: "equipment",
    });
  } else {
    const projectedBody = projectPlanPointToSection({
      elevationMeters: bodyZ,
      planEnd: params.link.planEnd,
      planPoint: bodyPlanPoint,
      planStart: params.link.planStart,
      registration: params.link.registration,
      sectionScaleMetersPerSourceUnit: params.sectionScaleMetersPerSourceUnit,
    });

    if (tWithinSectionSpan(projectedBody.t, params.toleranceRatio)) {
      bodySectionPoint = projectedBody.sectionPoint;
    } else {
      params.pendingItems.push({
        id: `section-route:equipment:${params.node.id}:body-span`,
        reason: "El simbolo del equipo queda fuera de los extremos registrados del corte.",
        sourceId: params.node.id,
        sourceType: "equipment",
      });
    }
  }

  return {
    anchorStatus: equipment.wallAnchor?.status ?? null,
    bodyPlanPoint,
    bodySectionPoint,
    equipmentId: equipment.id,
    heightTarget: {
      kind: "node",
      nodeId: params.node.id,
    },
    label: equipment.name,
    nodeId: params.node.id,
    planPoint,
    role: equipment.role,
    sectionPoint: projected.sectionPoint,
    zMeters,
  };
}

function createElevatedRoutePath(params: {
  fromElevation: number;
  segment: ResolvedRouteSegment;
  toElevation: number;
}) {
  const rawPath = [
    params.segment.from,
    ...(params.segment.vertices ?? []).map((point) => ({
      ...point,
    })),
    params.segment.to,
  ];
  const hasExplicitIntermediateElevation = rawPath
    .slice(1, -1)
    .some(hasExplicitZ);
  const points: Array<{
    elevationMeters: number;
    heightTarget: SectionRouteHeightTarget | null;
    planPoint: Point2D;
    source: SectionRouteProjectedPointSource;
  }> = [
    {
      elevationMeters: params.fromElevation,
      heightTarget: {
        kind: "node",
        nodeId: params.segment.fromNodeId,
      },
      planPoint: rawPath[0] as Point2D,
      source: "node",
    },
  ];
  const terminalHeightTarget: SectionRouteHeightTarget = {
    kind: "node",
    nodeId: params.segment.toNodeId,
  };

  if (
    !hasExplicitIntermediateElevation &&
    Math.abs(params.fromElevation - params.toElevation) > Number.EPSILON
  ) {
    points.push({
      elevationMeters: params.toElevation,
      heightTarget: terminalHeightTarget,
      planPoint: rawPath[0] as Point2D,
      source: "vertical",
    });
  }

  let carriedElevation =
    hasExplicitIntermediateElevation ? params.fromElevation : params.toElevation;

  let previousPlanPoint = rawPath[0] as Point2D;

  rawPath.slice(1, -1).forEach((planPoint, vertexIndex) => {
    const previousElevation = carriedElevation;
    let pointSource: SectionRouteProjectedPointSource = "vertex";
    let heightTarget: SectionRouteHeightTarget | null =
      hasExplicitIntermediateElevation ? null : terminalHeightTarget;

    if (hasExplicitZ(planPoint)) {
      carriedElevation = explicitZMeters(planPoint) as number;
      pointSource =
        samePlanPoint(previousPlanPoint, planPoint) &&
        Math.abs(carriedElevation - previousElevation) > Number.EPSILON
          ? "vertical"
          : "vertex";
      heightTarget = {
        kind: "segment_vertex",
        segmentId: params.segment.id,
        vertexIndex,
      };
    }

    points.push({
      elevationMeters: carriedElevation,
      heightTarget,
      planPoint,
      source: pointSource,
    });
    previousPlanPoint = planPoint;
  });
  points.push({
    elevationMeters: params.toElevation,
    heightTarget: terminalHeightTarget,
    planPoint: rawPath[rawPath.length - 1] as Point2D,
    source: "connection",
  });

  return dedupeProjectedPathSource(points);
}

function projectPathPoint(params: {
  elevatedPoint: {
    elevationMeters: number;
    heightTarget: SectionRouteHeightTarget | null;
    planPoint: Point2D;
    source: SectionRouteProjectedPointSource;
  };
  link: SectionRouteProjectionLink & { registration: SectionRegistration };
  sectionScaleMetersPerSourceUnit: number;
}): SectionRouteProjectedPoint {
  const projected = projectPlanPointToSection({
    elevationMeters: params.elevatedPoint.elevationMeters,
    planEnd: params.link.planEnd,
    planPoint: params.elevatedPoint.planPoint,
    planStart: params.link.planStart,
    registration: params.link.registration,
    sectionScaleMetersPerSourceUnit: params.sectionScaleMetersPerSourceUnit,
  });

  return {
    elevationMeters: params.elevatedPoint.elevationMeters,
    heightTarget: params.elevatedPoint.heightTarget,
    heightInSectionUnits: projected.heightInSectionUnits,
    planPoint: params.elevatedPoint.planPoint,
    sectionPoint: projected.sectionPoint,
    source: params.elevatedPoint.source,
    t: projected.t,
  };
}

function validateProjectionPrerequisites(params: {
  link: SectionRouteProjectionLink | null;
  sectionScaleMetersPerSourceUnit: number | null;
}): SectionRouteProjectionPendingItem | null {
  if (!params.link) {
    return {
      id: "section-route:link",
      reason: "Falta vincular el corte con la planta.",
      sourceType: "link",
    };
  }

  if (!params.link.registration) {
    return {
      id: "section-route:registration",
      reason: "Falta correspondencia confirmada del corte.",
      sourceId: params.link.id,
      sourceType: "link",
    };
  }

  if (
    params.sectionScaleMetersPerSourceUnit === null ||
    params.sectionScaleMetersPerSourceUnit <= 0
  ) {
    return {
      id: "section-route:section-scale",
      reason: "Falta escala confirmada del corte para ubicar alturas.",
      sourceId: params.link.id,
      sourceType: "link",
    };
  }

  if (
    distanceBetween(params.link.planStart, params.link.planEnd) <=
    MIN_SECTION_REGISTRATION_LENGTH
  ) {
    return {
      id: "section-route:plan-link",
      reason: "La linea de corte en planta no tiene longitud suficiente.",
      sourceId: params.link.id,
      sourceType: "link",
    };
  }

  if (
    distanceBetween(
      params.link.registration.sectionStart,
      params.link.registration.sectionEnd,
    ) <= MIN_SECTION_REGISTRATION_LENGTH
  ) {
    return {
      id: "section-route:section-registration",
      reason: "La correspondencia del corte no tiene longitud suficiente.",
      sourceId: params.link.id,
      sourceType: "link",
    };
  }

  return null;
}

function createPendingProjection(
  pendingItem: SectionRouteProjectionPendingItem,
): SectionRouteProjection {
  return {
    accessories: [],
    equipment: [],
    pendingItems: [pendingItem],
    segments: [],
    status: "pending",
  };
}

function tWithinSectionSpan(t: number, toleranceRatio: number) {
  return t >= -toleranceRatio && t <= 1 + toleranceRatio;
}

function dedupeProjectedPathSource<T extends { elevationMeters: number; planPoint: Point2D; source: SectionRouteProjectedPointSource }>(
  points: T[],
) {
  const deduped: T[] = [];

  for (const point of points) {
    const previous = deduped[deduped.length - 1];

    if (
      previous &&
      samePlanPoint(previous.planPoint, point.planPoint) &&
      Math.abs(previous.elevationMeters - point.elevationMeters) <=
        Number.EPSILON &&
      previous.source === point.source
    ) {
      continue;
    }

    deduped.push(point);
  }

  return deduped;
}

function dedupePendingItems(items: SectionRouteProjectionPendingItem[]) {
  const byKey = new Map<string, SectionRouteProjectionPendingItem>();

  for (const item of items) {
    byKey.set(
      [item.sourceType, item.sourceId ?? "", item.id, item.reason].join("|"),
      item,
    );
  }

  return [...byKey.values()].sort(
    (first, second) =>
      first.sourceType.localeCompare(second.sourceType) ||
      (first.sourceId ?? "").localeCompare(second.sourceId ?? "") ||
      first.id.localeCompare(second.id),
  );
}

function terminalRouteAccessoryPlanPoint(params: {
  item: TechnicalPhysicalAccessory;
  resolvedSegmentById: Map<string, ResolvedRouteSegment>;
}): Point2D | null {
  const terminalKind = terminalRouteAccessoryKind(params.item);

  if (!terminalKind) {
    return null;
  }

  const segment =
    params.item.segmentIds
      .map((segmentId) => params.resolvedSegmentById.get(segmentId) ?? null)
      .find((item): item is ResolvedRouteSegment => item !== null) ?? null;

  if (!segment || segment.path.length < 2) {
    return null;
  }

  const point =
    terminalKind === "terminal"
      ? segment.path[segment.path.length - 1]
      : segment.path[Math.max(0, segment.path.length - 2)];

  return point ? { ...point } : null;
}

function terminalRouteSegmentAccessoryPlanPoint(params: {
  accessoryKind: "terminal" | "valve";
  segment: ResolvedRouteSegment;
}): Point2D | null {
  if (params.segment.path.length < 2) {
    return null;
  }

  const point =
    params.accessoryKind === "terminal"
      ? params.segment.path[params.segment.path.length - 1]
      : params.segment.path[Math.max(0, params.segment.path.length - 2)];

  return point ? { ...point } : null;
}

function terminalRouteAccessoryKind(
  item: TechnicalPhysicalAccessory,
): "terminal" | "valve" | null {
  const sourceKeys = [item.id, ...item.sourceIds];

  if (
    sourceKeys.some(
      (sourceId) =>
        sourceId.includes(":route-terminal:") &&
        sourceId.endsWith(":terminal"),
    )
  ) {
    return "terminal";
  }

  if (
    sourceKeys.some(
      (sourceId) =>
        sourceId.includes(":route-terminal:") && sourceId.endsWith(":valve"),
    )
  ) {
    return "valve";
  }

  return null;
}

function terminalRouteSegmentAccessoryKind(
  accessory: RouteSegmentAccessory,
): "terminal" | "valve" | null {
  if (!accessory.id.startsWith("route-terminal:")) {
    return null;
  }

  if (accessory.id.endsWith(":terminal")) {
    return "terminal";
  }

  if (accessory.id.endsWith(":valve")) {
    return "valve";
  }

  return null;
}

function routeAccessoryProjectionId(segmentId: string, accessoryId: string) {
  return `physical-accessory:route:${segmentId}:${accessoryId}`;
}

function routeSegmentAccessoryPhysicalKind(
  accessory: RouteSegmentAccessory,
): TechnicalPhysicalAccessoryKind {
  if (accessory.type === "valve") {
    return "valve";
  }

  if (
    accessory.type === "elbow" &&
    isRhElbowLabel(accessory.catalogFamilyId ?? accessory.catalogCode ?? "")
  ) {
    return "rh_elbow";
  }

  if (accessory.type === "elbow") {
    return "elbow_90";
  }

  if (accessory.type === "tee") {
    return "tee";
  }

  return "other";
}

function routeSegmentAccessoryLabel(accessory: RouteSegmentAccessory) {
  const kind = routeSegmentAccessoryPhysicalKind(accessory);

  if (kind === "valve") {
    return "Llave";
  }

  if (kind === "rh_elbow") {
    return "RH";
  }

  return accessory.catalogCode ?? accessory.catalogFamilyId ?? "Accesorio";
}

function accessoryLabel(item: TechnicalPhysicalAccessory) {
  if (item.kind === "valve") {
    return "Llave";
  }

  if (item.kind === "rh_elbow") {
    return "RH";
  }

  return item.label;
}

function isRhElbowLabel(label: string) {
  const normalized = label.toLocaleLowerCase("es-AR");

  return (
    normalized.includes("rosca hembra") ||
    normalized.includes("rh") ||
    normalized.includes("hembra")
  );
}

function formatDiameterSymbol(diameter: PipeDiameterReference | null) {
  return diameter
    ? `Ø${diameter.externalDiameterMillimeters}`
    : "Ø pendiente";
}

function samePlanPoint(first: Point2D, second: Point2D) {
  return (
    Math.abs(first.x - second.x) <= Number.EPSILON &&
    Math.abs(first.y - second.y) <= Number.EPSILON
  );
}

function hasExplicitZ(point: Point2D) {
  return typeof point.z === "number" && Number.isFinite(point.z);
}

function explicitZMeters(point: Point2D) {
  return hasExplicitZ(point) ? (point.z as number) : null;
}

function distanceBetween(first: Point2D, second: Point2D) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
