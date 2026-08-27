import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3 } from "@/lib/calculation/projectGas";
import type { PipeSegmentSizingResult } from "@/lib/calculation/pipeSystem";
import type { DemandUnit, WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
  type TechnicalSegmentResult,
} from "./technicalTree";

export type TechnicalTreeDimensioningVerificationResult = {
  name: string;
  status: "passed";
};

export function runTechnicalTreeDimensioningVerifications() {
  const results: TechnicalTreeDimensioningVerificationResult[] = [];

  verify(results, "Caso A - sin accesorios", () => {
    const { result, segment } = singleSegment({ flow: 3.5, lengthMeters: 10 });

    assertEqual(result.status, "valid");
    assertResolvedDiameter(segment, "sigas-25");
    assertEqual(segment.accessoryEquivalentLengthMeters, 0);
    assertEqual(segment.calculationLengthMeters, 10);
    assertResolvedSegmentIsSelfConsistent(segment);
  });

  verify(results, "Caso B - accesorio manual", () => {
    const { result, segment } = singleSegment({
      accessories: [
        manualAccessory({
          equivalentLengthMetersPerUnit: 2,
          id: "manual-elbow",
          quantity: 2,
          type: "elbow",
        }),
      ],
      flow: 3.5,
      lengthMeters: 10,
    });

    assertEqual(result.status, "valid");
    assertResolvedDiameter(segment, "sigas-32");
    assertEqual(segment.accessoryEquivalentLengthMeters, 4);
    assertEqual(segment.calculationLengthMeters, 14);
    assertResolvedSegmentIsSelfConsistent(segment);
  });

  verify(results, "Caso C - accesorio PipeSystem", () => {
    const { result, segment } = singleSegment({
      accessories: [
        pipeSystemAccessory({
          catalogCode: "codo-normal-a-90",
          id: "catalog-elbow",
          quantity: 1,
          type: "elbow",
        }),
      ],
      flow: 3,
      lengthMeters: 9,
    });

    assertEqual(result.status, "valid");
    assertResolvedDiameter(segment, "sigas-25");
    assertEqual(segment.accessoryEquivalentLengthMeters, 0.856);
    assertResolvedSegmentIsSelfConsistent(segment);
  });

  verify(results, "Caso D - cambio de diametro por accesorios", () => {
    const { result, segment } = singleSegment({
      accessories: [
        pipeSystemAccessory({
          catalogCode: "codo-normal-a-90",
          id: "catalog-elbow",
          quantity: 1,
          type: "elbow",
        }),
      ],
      flow: 3.8,
      lengthMeters: 10,
    });

    assertEqual(result.status, "valid");
    assertResolvedDiameter(segment, "sigas-32");
    assertEqual(segment.accessoryEquivalentLengthMeters, 1.191);
    assertEqual(segment.dimensioningResolution.status, "resolved");
    assertResolvedSegmentIsSelfConsistent(segment);
  });

  verify(results, "Caso E - accesorio no disponible en diametro menor", () => {
    const { result, segment } = singleSegment({
      accessories: [
        pipeSystemAccessory({
          catalogCode: "union-normal-25-mm",
          id: "catalog-union",
          quantity: 1,
          type: "other",
        }),
      ],
      flow: 3.5,
      lengthMeters: 10,
    });

    assertEqual(result.status, "valid");
    assertResolvedDiameter(segment, "sigas-25");
    assertEqual(segment.accessoryEquivalentLengthMeters, 0.242);
    assertResolvedSegmentIsSelfConsistent(segment);
  });

  verify(results, "Caso F - accesorio ambiguo", () => {
    const { result, segment } = singleSegment({
      accessories: [
        pipeSystemAccessory({
          id: "ambiguous-elbow",
          quantity: 1,
          type: "elbow",
        }),
      ],
      flow: 3,
      lengthMeters: 10,
    });

    assertEqual(result.status, "incomplete");
    assertEqual(segment.dimensioningResolution.status, "unsupported");
    assertEqual(segment.calculatedDiameter, null);
  });

  verify(results, "Caso G - sin escala", () => {
    const { result, segment } = singleSegment({
      flow: 3,
      lengthMeters: 10,
      scaleMetersPerSourceUnit: null,
    });

    assertEqual(result.status, "incomplete");
    assertEqual(segment.dimensioningResolution.status, "unresolved");
    assertEqual(segment.calculatedDiameter, null);
  });

  verify(results, "Caso H - kcal/h normaliza y dimensiona", () => {
    const { result, segment } = singleSegment({
      demandUnit: "kcal_h",
      flow: 9000,
      lengthMeters: 10,
    });

    assertEqual(result.status, "valid");
    assertEqual(segment.accumulatedFlowUnit, "m3_h");
    assertClose(
      segment.accumulatedFlow,
      9000 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
    );
    assertResolvedDiameter(segment, "sigas-20");
  });

  verify(results, "Caso I - fuera de tabla", () => {
    const { result, segment } = singleSegment({ flow: 1, lengthMeters: 201 });

    assertEqual(result.status, "incomplete");
    assertEqual(segment.dimensioningResolution.status, "unresolved");
    assertEqual(segment.calculatedDiameter, null);
  });

  verify(results, "Caso J - determinismo", () => {
    const first = singleSegment({ flow: 3.5, lengthMeters: 10 }).segment;
    const second = singleSegment({ flow: 3.5, lengthMeters: 10 }).segment;

    assertEqual(JSON.stringify(first), JSON.stringify(second));
  });

  return results;
}

function singleSegment(params: {
  accessories?: RouteSegmentAccessory[];
  demandUnit?: DemandUnit;
  flow: number;
  lengthMeters: number;
  scaleMetersPerSourceUnit?: number | null;
}) {
  const result = calculateSingleSegment(params);

  assertEqual(result.segments.length, 1);

  return {
    result,
    segment: result.segments[0] as TechnicalSegmentResult,
  };
}

function calculateSingleSegment(params: {
  accessories?: RouteSegmentAccessory[];
  demandUnit?: DemandUnit;
  flow: number;
  lengthMeters: number;
  scaleMetersPerSourceUnit?: number | null;
}): TechnicalCalculationResult {
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
    {
      connectionPoint: { x: params.lengthMeters, y: 0 },
      demandUnit: params.demandUnit ?? "m3_h",
      demandValue: params.flow,
      id: "appliance",
      name: "Artefacto",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "stove",
    },
  ];
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: "meter", id: "node-meter", kind: "supply" },
      { equipmentId: "appliance", id: "node-appliance", kind: "appliance" },
    ],
    segments: [
      {
        accessories: params.accessories,
        fromNodeId: "node-meter",
        id: "segment",
        toNodeId: "node-appliance",
      },
    ],
  };

  return calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit:
      params.scaleMetersPerSourceUnit === undefined
        ? 1
        : params.scaleMetersPerSourceUnit,
  });
}

function manualAccessory(params: {
  equivalentLengthMetersPerUnit: number;
  id: string;
  quantity: number;
  type: RouteSegmentAccessory["type"];
}): RouteSegmentAccessory {
  return {
    equivalentLengthMetersPerUnit: params.equivalentLengthMetersPerUnit,
    equivalentLengthSource: "manual",
    id: params.id,
    quantity: params.quantity,
    segmentId: "segment",
    type: params.type,
  };
}

function pipeSystemAccessory(params: {
  catalogCode?: string;
  id: string;
  quantity: number;
  type: RouteSegmentAccessory["type"];
}): RouteSegmentAccessory {
  return {
    catalogCode: params.catalogCode,
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id: params.id,
    quantity: params.quantity,
    segmentId: "segment",
    type: params.type,
  };
}

function assertResolvedDiameter(
  segment: TechnicalSegmentResult,
  expectedDiameterId: string,
) {
  assertEqual(segment.dimensioningResolution.status, "resolved");
  assertEqual(segment.calculatedDiameter?.id, expectedDiameterId);
}

function assertResolvedSegmentIsSelfConsistent(segment: TechnicalSegmentResult) {
  assert(
    segment.dimensioningResolution.status === "resolved",
    `Expected resolved, got ${segment.dimensioningResolution.status}`,
  );

  const dimensioning = segment.dimensioningResolution.value;

  assertEqual(
    segment.calculationLengthMeters,
    (segment.physicalLengthMeters ?? 0) +
      (segment.accessoryEquivalentLengthMeters ?? 0),
  );
  assertEqual(
    dimensioning.calculationLengthMeters,
    dimensioning.physicalLengthMeters +
      dimensioning.accessoryEquivalentLengthMeters,
  );

  const sizingResolution = SIGAS_PIPE_SYSTEM.sizeSegment({
    accessoryEquivalentLengthMeters: dimensioning.accessoryEquivalentLengthMeters,
    accumulatedFlow: segment.accumulatedFlow,
    accumulatedFlowUnit: segment.accumulatedFlowUnit,
    calculationLengthMeters: dimensioning.calculationLengthMeters,
    physicalLengthMeters: dimensioning.physicalLengthMeters,
    pipe: { diameter: dimensioning.calculatedDiameter },
    segmentId: segment.segmentId,
  });
  const sizing = assertResolvedSizing(sizingResolution);

  assert(
    diameterRank(sizing.selectedDiameter.id) <=
      diameterRank(dimensioning.calculatedDiameter.id),
    "Calculated diameter is not sufficient for final calculation length.",
  );
}

function assertResolvedSizing(resolution: {
  status: string;
  value?: PipeSegmentSizingResult;
}) {
  assert(
    resolution.status === "resolved",
    `Expected sizing resolved, got ${resolution.status}`,
  );

  return resolution.value as PipeSegmentSizingResult;
}

function diameterRank(diameterId: string) {
  const order = [
    "sigas-20",
    "sigas-25",
    "sigas-32",
    "sigas-40",
    "sigas-50",
    "sigas-63",
    "sigas-75",
    "sigas-90",
    "sigas-110",
  ];
  const index = order.indexOf(diameterId);

  assert(index >= 0, `Unknown diameter ${diameterId}`);

  return index;
}

function verify(
  results: TechnicalTreeDimensioningVerificationResult[],
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
      Math.abs(actual - expected) <= 0.000001,
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
    JSON.stringify(runTechnicalTreeDimensioningVerifications(), null, 2),
  );
}
