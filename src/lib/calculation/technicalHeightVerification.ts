import type { TechnicalSegmentResult } from "@/lib/calculation/technicalTree";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";

export type TechnicalHeightVerificationResult = {
  name: string;
  status: "passed";
};

export function runTechnicalHeightVerifications() {
  const results: TechnicalHeightVerificationResult[] = [];

  verify(results, "longitud fisica suma horizontal y vertical", () => {
    const { result, segment } = calculateSingleSegment({
      applianceZ: 2,
      from: { x: 0, y: 0, z: 0 },
      to: { x: 3, y: 4, z: 2 },
    });

    assertEqual(result.status, "valid");
    assertClose(segment.drawingLength, 5);
    assertClose(segment.segmentPhysicalLengthMeters, 7);
    assertClose(segment.physicalLengthMeters, 7);
    assertClose(result.technicalRoutes[0]?.physicalLengthMeters, 7);
    assertClose(result.totals.physicalLengthMeters, 7);
  });

  verify(results, "sin z mantiene altura cero por defecto", () => {
    const { segment } = calculateSingleSegment({
      from: { x: 0, y: 0 },
      to: { x: 3, y: 4 },
    });

    assertClose(segment.drawingLength, 5);
    assertClose(segment.segmentPhysicalLengthMeters, 5);
    assertClose(segment.physicalLengthMeters, 5);
  });

  verify(results, "tramo vertical puro es computable", () => {
    const { result, segment } = calculateSingleSegment({
      applianceZ: 2,
      from: { x: 1, y: 1, z: 0 },
      to: { x: 1, y: 1, z: 2 },
    });

    assertEqual(result.status, "valid");
    assertClose(segment.drawingLength, 0);
    assertClose(segment.segmentPhysicalLengthMeters, 2);
    assertClose(segment.physicalLengthMeters, 2);
  });

  return results;
}

function calculateSingleSegment(params: {
  applianceZ?: number;
  from: { x: number; y: number; z?: number };
  to: { x: number; y: number; z?: number };
}) {
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: params.from,
      id: "meter",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint:
        params.applianceZ === undefined
          ? params.to
          : { ...params.to, z: params.applianceZ },
      demandUnit: "m3_h",
      demandValue: 1,
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
        fromNodeId: "node-meter",
        id: "segment",
        toNodeId: "node-appliance",
      },
    ],
  };
  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: 1,
  });

  assertEqual(result.segments.length, 1);

  return {
    result,
    segment: result.segments[0] as TechnicalSegmentResult,
  };
}

function verify(
  results: TechnicalHeightVerificationResult[],
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
  console.log(JSON.stringify(runTechnicalHeightVerifications(), null, 2));
}
