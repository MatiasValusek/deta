import type { Point2D } from "@/lib/geometry/types";

export const DEFAULT_POINT_Z_METERS = 0;

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
