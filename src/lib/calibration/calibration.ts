import type { Point2D } from "@/lib/geometry/types";
import { convertToMillimeters } from "./units";
import type {
  CalibrationPointPair,
  CalibrationUnit,
  ConfirmedCalibration,
  MeasurementResult,
} from "./types";

export function distanceBetweenPoints(start: Point2D, end: Point2D): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function createPointPair(points: Point2D[]): CalibrationPointPair | null {
  const [start, end] = points;

  if (!start || !end) {
    return null;
  }

  return { start, end };
}

export function createConfirmedCalibration(params: {
  points: CalibrationPointPair;
  distanceOriginal: number;
  unit: CalibrationUnit;
}): ConfirmedCalibration {
  const sourceDistance = distanceBetweenPoints(
    params.points.start,
    params.points.end,
  );
  const distanceMillimeters = convertToMillimeters(
    params.distanceOriginal,
    params.unit,
  );

  if (!Number.isFinite(params.distanceOriginal) || params.distanceOriginal <= 0) {
    throw new Error("La distancia real debe ser positiva.");
  }

  if (!Number.isFinite(sourceDistance) || sourceDistance <= 0) {
    throw new Error("Los puntos de calibracion deben ser distintos.");
  }

  return {
    status: "confirmed",
    points: params.points,
    distanceOriginal: params.distanceOriginal,
    unit: params.unit,
    distanceMillimeters,
    sourceDistance,
    millimetersPerSourceUnit: distanceMillimeters / sourceDistance,
  };
}

export function measureCalibratedDistance(
  points: CalibrationPointPair,
  calibration: ConfirmedCalibration,
): MeasurementResult {
  const sourceDistance = distanceBetweenPoints(points.start, points.end);

  return {
    points,
    sourceDistance,
    distanceMillimeters: sourceDistance * calibration.millimetersPerSourceUnit,
  };
}
