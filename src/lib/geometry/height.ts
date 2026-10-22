import type { Point2D } from "@/lib/geometry/types";

export const DEFAULT_POINT_Z_METERS = 0;

export type ElevationVerificationStatus =
  | "confirmed"
  | "suggested"
  | "unverified";

export type ElevationSource =
  | "derived_calculation"
  | "equipment_preset"
  | "professional_edit"
  | "default_value";

export type ElevationMetadata = {
  source: ElevationSource;
  status: ElevationVerificationStatus;
};

export const DEFAULT_UNVERIFIED_ELEVATION: ElevationMetadata = {
  source: "default_value",
  status: "unverified",
};

export const PROFESSIONAL_CONFIRMED_ELEVATION: ElevationMetadata = {
  source: "professional_edit",
  status: "confirmed",
};

export function isElevationMetadata(
  value: unknown,
): value is ElevationMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const metadata = value as Partial<ElevationMetadata>;

  return (
    (metadata.status === "confirmed" ||
      metadata.status === "suggested" ||
      metadata.status === "unverified") &&
    (metadata.source === "derived_calculation" ||
      metadata.source === "equipment_preset" ||
      metadata.source === "professional_edit" ||
      metadata.source === "default_value")
  );
}

export function pointZMeters(point: Point2D | null | undefined) {
  return typeof point?.z === "number" && Number.isFinite(point.z)
    ? point.z
    : DEFAULT_POINT_Z_METERS;
}

export function withPointZ(point: Point2D, z: number): Point2D {
  return {
    ...point,
    z,
  };
}

export function horizontalDistanceSource(first: Point2D, second: Point2D) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function physicalLengthMetersWithVertical(params: {
  first: Point2D;
  scaleMetersPerSourceUnit: number;
  second: Point2D;
}) {
  const horizontalMeters =
    horizontalDistanceSource(params.first, params.second) *
    params.scaleMetersPerSourceUnit;
  const verticalMeters = Math.abs(
    pointZMeters(params.first) - pointZMeters(params.second),
  );

  return horizontalMeters + verticalMeters;
}
