import type { CalibrationUnit } from "./types";

export const CALIBRATION_UNITS: Array<{
  value: CalibrationUnit;
  label: string;
}> = [
  { value: "mm", label: "milimetros" },
  { value: "cm", label: "centimetros" },
  { value: "m", label: "metros" },
];

export function convertToMillimeters(
  value: number,
  unit: CalibrationUnit,
): number {
  if (unit === "mm") {
    return value;
  }

  if (unit === "cm") {
    return value * 10;
  }

  return value * 1000;
}
