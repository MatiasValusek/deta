import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";

export type CalculationLengthState =
  | { kind: "resolved"; meters: number }
  | {
      kind:
        | "missing_route"
        | "missing_scale"
        | "pending_accessory_equivalent"
        | "pending_physical_length"
        | "pending";
    };

export function technicalCalculationNeedsRoute(
  result: TechnicalCalculationResult,
) {
  return (
    result.segments.length === 0 &&
    result.issues.some((issue) => issue.code === "disconnected_component")
  );
}

export function calculationLengthState(
  result: TechnicalCalculationResult,
): CalculationLengthState {
  if (result.totals.calculationLengthMeters !== null) {
    return {
      kind: "resolved",
      meters: result.totals.calculationLengthMeters,
    };
  }

  if (technicalCalculationNeedsRoute(result)) {
    return { kind: "missing_route" };
  }

  if (result.issues.some((issue) => issue.code === "missing_scale")) {
    return { kind: "missing_scale" };
  }

  if (result.totals.physicalLengthMeters === null) {
    return { kind: "pending_physical_length" };
  }

  if (result.totals.accessoryEquivalentLengthMeters === null) {
    return { kind: "pending_accessory_equivalent" };
  }

  return { kind: "pending" };
}
