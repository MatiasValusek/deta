import type { Point2D } from "@/lib/geometry/types";

export type CalibrationUnit = "mm" | "cm" | "m";

export type CalibrationPointPair = {
  start: Point2D;
  end: Point2D;
};

export type ConfirmedCalibration = {
  status: "confirmed";
  points: CalibrationPointPair;
  distanceOriginal: number;
  unit: CalibrationUnit;
  distanceMillimeters: number;
  sourceDistance: number;
  millimetersPerSourceUnit: number;
};

export type PendingCalibration = {
  status: "pending";
  points: Point2D[];
  distanceOriginal: string;
  unit: CalibrationUnit;
};

export type MeasurementResult = {
  points: CalibrationPointPair;
  sourceDistance: number;
  distanceMillimeters: number;
};
