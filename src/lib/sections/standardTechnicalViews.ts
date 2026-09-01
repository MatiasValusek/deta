import {
  createTechnicalAxonometricView,
  type TechnicalAxonometricView,
} from "@/lib/calculation/technicalAxonometric";
import type { TechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import type { TechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Bounds, Point2D } from "@/lib/geometry/types";
import {
  buildEquipmentIndex,
  resolveRouteNodePosition,
  resolveRouteSegments,
} from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import type { SectionRegistrationSide } from "./registration";
import {
  createSectionRouteProjection,
  type SectionRouteProjection,
  type SectionRouteProjectionLink,
} from "./routeProjection";

export type StandardTechnicalReviewViewId =
  | "plan"
  | "section-aa"
  | "section-bb"
  | "axo";

export type StandardTechnicalSectionViewId =
  | "section-aa"
  | "section-bb";

export type StandardTechnicalSectionAxis = "x" | "y";

export type StandardTechnicalSectionView = {
  axis: StandardTechnicalSectionAxis;
  baseline: {
    end: Point2D;
    start: Point2D;
  };
  id: StandardTechnicalSectionViewId;
  projection: SectionRouteProjection;
  title: string;
};

const AUTOMATIC_SECTION_MIN_SPAN_METERS = 1;
const AUTOMATIC_SECTION_PADDING_RATIO = 0.06;
const AUTOMATIC_SECTION_MIN_PADDING_METERS = 0.2;

export function createStandardTechnicalSectionView(params: {
  adoptedDiameterValidation?: TechnicalAdoptedDiameterValidation | null;
  axis: StandardTechnicalSectionAxis;
  equipment: WorkbenchEquipment[];
  id: StandardTechnicalSectionViewId;
  inventory?: TechnicalPhysicalAccessoryInventory | null;
  network: ManualRouteNetwork;
  result?: TechnicalCalculationResult | null;
  scaleMetersPerSourceUnit: number | null;
  title: string;
}): StandardTechnicalSectionView {
  const scaleMetersPerSourceUnit = normalizedScale(
    params.scaleMetersPerSourceUnit,
  );
  const link = createAutomaticSectionProjectionLink({
    axis: params.axis,
    equipment: params.equipment,
    network: params.network,
    scaleMetersPerSourceUnit,
  });
  const projection = createSectionRouteProjection({
    adoptedDiameterValidation: params.adoptedDiameterValidation,
    equipment: params.equipment,
    inventory: params.inventory,
    link,
    network: params.network,
    result: params.result,
    sectionScaleMetersPerSourceUnit: scaleMetersPerSourceUnit,
  });

  return {
    axis: params.axis,
    baseline: {
      end: link?.registration?.sectionEnd ?? { x: 1, y: 0 },
      start: link?.registration?.sectionStart ?? { x: 0, y: 0 },
    },
    id: params.id,
    projection,
    title: params.title,
  };
}

export function createStandardTechnicalAxonometricView(params: {
  adoptedDiameterValidation?: TechnicalAdoptedDiameterValidation;
  equipment: WorkbenchEquipment[];
  inventory: TechnicalPhysicalAccessoryInventory;
  network: ManualRouteNetwork;
  result: TechnicalCalculationResult | null;
  scaleMetersPerSourceUnit: number | null;
}): TechnicalAxonometricView {
  return createTechnicalAxonometricView(params);
}

export function countStandardTechnicalReviewGeometryPendingItems(params: {
  axonometricView: TechnicalAxonometricView | null;
  sectionViews: StandardTechnicalSectionView[];
}) {
  const pendingKeys = new Set<string>();

  for (const view of params.sectionViews) {
    for (const item of view.projection.pendingItems) {
      const key = technicalGeometryPendingKey({
        message: item.reason,
        sourceId: item.sourceId ?? item.id,
        type: item.sourceType,
      });

      if (key) {
        pendingKeys.add(key);
      }
    }

    for (const segment of view.projection.segments) {
      if (!segment.pendingReason) {
        continue;
      }

      const key = technicalGeometryPendingKey({
        message: segment.pendingReason,
        sourceId: segment.segmentId,
        type: "segment",
      });

      if (key) {
        pendingKeys.add(key);
      }
    }
  }

  for (const item of params.axonometricView?.pendingItems ?? []) {
    const key = technicalGeometryPendingKey({
      message: item.message,
      sourceId: item.sourceId,
      type: item.type,
    });

    if (key) {
      pendingKeys.add(key);
    }
  }

  return pendingKeys.size;
}

function createAutomaticSectionProjectionLink(params: {
  axis: StandardTechnicalSectionAxis;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  scaleMetersPerSourceUnit: number;
}): SectionRouteProjectionLink | null {
  const bounds = routeInstallationBounds(params.network, params.equipment);

  if (!bounds) {
    return null;
  }

  const minimumSpanSource =
    AUTOMATIC_SECTION_MIN_SPAN_METERS / params.scaleMetersPerSourceUnit;
  const minimumPaddingSource =
    AUTOMATIC_SECTION_MIN_PADDING_METERS / params.scaleMetersPerSourceUnit;
  const spanX = Math.max(bounds.maxX - bounds.minX, minimumSpanSource);
  const spanY = Math.max(bounds.maxY - bounds.minY, minimumSpanSource);
  const paddingSource = Math.max(
    Math.max(spanX, spanY) * AUTOMATIC_SECTION_PADDING_RATIO,
    minimumPaddingSource,
  );
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const axisStart =
    params.axis === "x"
      ? { x: center.x - spanX / 2 - paddingSource, y: center.y }
      : { x: center.x, y: center.y - spanY / 2 - paddingSource };
  const axisEnd =
    params.axis === "x"
      ? { x: center.x + spanX / 2 + paddingSource, y: center.y }
      : { x: center.x, y: center.y + spanY / 2 + paddingSource };
  const axisLength = distanceBetween(axisStart, axisEnd);
  const sectionStart = { x: 0, y: 0 };
  const sectionEnd = { x: axisLength, y: 0 };

  return {
    id: `technical-section:${params.axis}`,
    planEnd: axisEnd,
    planStart: axisStart,
    registration: {
      positiveZSide: "right" as SectionRegistrationSide,
      referenceElevationMeters: 0,
      sectionEnd,
      sectionStart,
    },
  };
}

export function routeInstallationBounds(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
): Bounds | null {
  const points: Point2D[] = [];
  const equipmentById = buildEquipmentIndex(equipment);

  for (const node of network.nodes) {
    const position = resolveRouteNodePosition(node, equipmentById);

    if (position) {
      points.push(position);
    }
  }

  for (const segment of resolveRouteSegments(network, equipment)) {
    points.push(...segment.path);
  }

  for (const item of equipment) {
    points.push(item.connectionPoint);

    if (item.bodyPoint) {
      points.push(item.bodyPoint);
    }
  }

  return boundsForPoints(points);
}

function boundsForPoints(points: Point2D[]): Bounds | null {
  const finitePoints = points.filter(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y),
  );

  if (finitePoints.length === 0) {
    return null;
  }

  return finitePoints.reduce(
    (bounds, point) => ({
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
    }),
    {
      maxX: finitePoints[0]?.x ?? 0,
      maxY: finitePoints[0]?.y ?? 0,
      minX: finitePoints[0]?.x ?? 0,
      minY: finitePoints[0]?.y ?? 0,
    },
  );
}

function normalizedScale(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : 1;
}

function distanceBetween(first: Point2D, second: Point2D) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function technicalGeometryPendingKey(params: {
  message: string;
  sourceId: string;
  type: string;
}) {
  const normalized = params.message
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const bucket = technicalGeometryPendingBucket(normalized);

  return bucket ? `${bucket}:${params.type}:${params.sourceId}` : null;
}

function technicalGeometryPendingBucket(message: string) {
  if (
    /(^|[^a-z])z([^a-z]|$)/.test(message) ||
    message.includes("cota") ||
    message.includes("altura")
  ) {
    return "z";
  }

  if (message.includes("escala")) {
    return "scale";
  }

  if (
    message.includes("posicion") ||
    message.includes("geometria") ||
    message.includes("extremo") ||
    message.includes("correspondencia")
  ) {
    return "geometry";
  }

  return null;
}
