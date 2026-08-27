import { DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3 } from "@/lib/calculation/projectGas";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
  type TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork, RouteNode } from "@/lib/routing/types";

export type TechnicalProvisionalDiameterVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;

export function runTechnicalProvisionalDiameterVerifications() {
  const results: TechnicalProvisionalDiameterVerificationResult[] = [];

  verify(results, "kcal/h deriva consumo tecnico acumulado", () => {
    const result = calculateFourApplianceFixture();

    assertEqual(result.status, "valid");
    assertNormalization(result, "appliance-1", 9000);
    assertNormalization(result, "appliance-2", 3000);
    assertNormalization(result, "appliance-3", 6500);
    assertNormalization(result, "appliance-4", 30000);
    assertClose(
      segmentById(result, "A-B").consumptionM3h,
      12000 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
    );
    assertClose(
      segmentById(result, "B-C").consumptionM3h,
      18500 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
    );
    assertClose(
      segmentById(result, "C-4").consumptionM3h,
      30000 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
    );
    assertClose(
      segmentById(result, "C-M").consumptionM3h,
      48500 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
    );
  });

  verify(results, "SIGAS Tabla No 4 resuelve diametro provisional", () => {
    const result = calculateFourApplianceFixture();

    assertProvisional(result, "A-B", "sigas-20", 10.75, 12);
    assertProvisional(result, "B-C", "sigas-25", 10.75, 12);
    assertProvisional(result, "C-4", "sigas-25", 4.7, 5);
    assertProvisional(result, "C-M", "sigas-32", 10.75, 12);
    assert(
      segmentById(result, "B-C").provisionalDiameterExplanation?.includes(
        "12 m tabulados",
      ),
      "Expected explanation to mention the immediately superior table length.",
    );
  });

  return results;
}

function calculateFourApplianceFixture(): TechnicalCalculationResult {
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: 0 },
      id: "meter",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    appliance("appliance-1", "Artefacto 1", 9000, 10.75, 0),
    appliance("appliance-2", "Artefacto 2", 3000, 7.35, 3.4),
    appliance("appliance-3", "Artefacto 3", 6500, 5.45, 1.7),
    appliance("appliance-4", "Artefacto 4", 30000, 3, 1.7),
  ];
  const routeNodes: RouteNode[] = [
    { equipmentId: "meter", id: "node-meter", kind: "supply" },
    { id: "node-c", kind: "route", position: { x: 3, y: 0 } },
    { id: "node-b", kind: "route", position: { x: 5.45, y: 0 } },
    { id: "node-a", kind: "route", position: { x: 7.35, y: 0 } },
    { equipmentId: "appliance-1", id: "node-appliance-1", kind: "appliance" },
    { equipmentId: "appliance-2", id: "node-appliance-2", kind: "appliance" },
    { equipmentId: "appliance-3", id: "node-appliance-3", kind: "appliance" },
    { equipmentId: "appliance-4", id: "node-appliance-4", kind: "appliance" },
  ];
  const network: ManualRouteNetwork = {
    nodes: routeNodes,
    segments: [
      { fromNodeId: "node-meter", id: "C-M", toNodeId: "node-c" },
      { fromNodeId: "node-c", id: "B-C", toNodeId: "node-b" },
      { fromNodeId: "node-b", id: "A-B", toNodeId: "node-a" },
      { fromNodeId: "node-a", id: "1-A", toNodeId: "node-appliance-1" },
      { fromNodeId: "node-a", id: "A-2", toNodeId: "node-appliance-2" },
      { fromNodeId: "node-b", id: "B-3", toNodeId: "node-appliance-3" },
      { fromNodeId: "node-c", id: "C-4", toNodeId: "node-appliance-4" },
    ],
  };

  return calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: 1,
  });
}

function appliance(
  id: string,
  name: string,
  demandValue: number,
  x: number,
  y: number,
): WorkbenchEquipment {
  return {
    connectionPoint: { x, y },
    demandUnit: "kcal_h",
    demandValue,
    id,
    name,
    planBaseId: "plan",
    role: "appliance",
    source: "manual",
    type: "stove",
  };
}

function assertNormalization(
  result: TechnicalCalculationResult,
  equipmentId: string,
  kcalH: number,
) {
  const normalization =
    result.demandNormalizations.find((item) => item.equipmentId === equipmentId) ??
    null;

  assert(normalization, `Missing normalization for ${equipmentId}.`);
  assertEqual(normalization.originalUnit, "kcal_h");
  assertEqual(normalization.originalValue, kcalH);
  assertEqual(
    normalization.heatingValueKcalPerM3,
    DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
  );
  assertClose(
    normalization.normalizedFlowM3h,
    kcalH / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
  );
}

function assertProvisional(
  result: TechnicalCalculationResult,
  segmentId: string,
  expectedDiameterId: string,
  expectedCalculationLengthMeters: number,
  expectedTabulatedLengthMeters: number,
) {
  const segment = segmentById(result, segmentId);
  const sizing =
    result.networkSizing?.segments.find((item) => item.segmentId === segmentId) ??
    null;

  assert(sizing, `Missing sizing for ${segmentId}.`);
  assertEqual(sizing.status, "resolved");
  assertEqual(segment.provisionalDiameter?.id, expectedDiameterId);
  assertEqual(segment.provisionalDiameter?.id, sizing.calculatedDiameter?.id);
  assertClose(segment.calculationLengthMeters, expectedCalculationLengthMeters);
  assertClose(sizing.sizingLengthMeters, expectedCalculationLengthMeters);
  assertClose(sizing.tabulatedLengthMeters, expectedTabulatedLengthMeters);
}

function segmentById(
  result: TechnicalCalculationResult,
  segmentId: string,
): TechnicalSegmentResult {
  const segment =
    result.segments.find((item) => item.segmentId === segmentId) ?? null;

  assert(segment, `Missing segment ${segmentId}.`);

  return segment;
}

function verify(
  results: TechnicalProvisionalDiameterVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(
    actual === expected,
    `Expected ${String(expected)}, got ${String(actual)}`,
  );
}

function assertClose(actual: number | null | undefined, expected: number) {
  assert(
    actual !== null &&
      actual !== undefined &&
      Math.abs(actual - expected) <= EPSILON,
    `Expected ${expected}, got ${String(actual)}`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(
    JSON.stringify(runTechnicalProvisionalDiameterVerifications(), null, 2),
  );
}
