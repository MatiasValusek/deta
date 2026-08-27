import {
  formatEquipmentDemandWithNormalization,
  normalizeEquipmentDemand,
  normalizeEquipmentDemands,
  type EquipmentDemandNormalization,
} from "@/lib/calculation/demandNormalization";
import {
  DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
  DEFAULT_PROJECT_GAS_CONFIG,
  type ProjectGasConfig,
} from "@/lib/calculation/projectGas";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { DemandUnit, WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteNode,
  RouteSegment,
} from "@/lib/routing/types";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
  type TechnicalSegmentResult,
} from "./technicalTree";

export type DemandNormalizationVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;

export function runDemandNormalizationVerifications() {
  const results: DemandNormalizationVerificationResult[] = [];

  verify(results, "Caso A - kcal/h normaliza con HS GN default", () => {
    const cases = [
      { expected: 3000 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3, value: 3000 },
      { expected: 6500 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3, value: 6500 },
      { expected: 9000 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3, value: 9000 },
      { expected: 30000 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3, value: 30000 },
    ];

    for (const item of cases) {
      const normalization = normalizeEquipmentDemand(
        applianceEquipment({
          demandUnit: "kcal_h",
          demandValue: item.value,
          id: `appliance-${item.value}`,
        }),
        DEFAULT_PROJECT_GAS_CONFIG,
      );

      assertResolvedNormalization(normalization);
      assertEqual(normalization.originalValue, item.value);
      assertEqual(normalization.originalUnit, "kcal_h");
      assertEqual(normalization.method, "kcal_h_divided_by_heating_value");
      assertEqual(
        normalization.heatingValueKcalPerM3,
        DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
      );
      assertClose(normalization.normalizedFlowM3h, item.expected);
    }
  });

  verify(results, "Caso B - m3/h directo no cambia", () => {
    const normalization = normalizeEquipmentDemand(
      applianceEquipment({
        demandUnit: "m3_h",
        demandValue: 2.75,
        id: "appliance-direct",
      }),
      DEFAULT_PROJECT_GAS_CONFIG,
    );

    assertResolvedNormalization(normalization);
    assertEqual(normalization.originalValue, 2.75);
    assertEqual(normalization.originalUnit, "m3_h");
    assertEqual(normalization.method, "direct_m3_h");
    assertEqual(normalization.source, "declared_m3_h");
    assertClose(normalization.normalizedFlowM3h, 2.75);
  });

  verify(results, "Caso C - mezcla kcal/h y m3/h suma normalizada", () => {
    const result = calculateMixedFixture();
    const commonSegment = segmentById(result, "common");
    const expected =
      9000 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3 + 1.5;

    assertEqual(result.status, "valid");
    assertClose(commonSegment.accumulatedFlow, expected);
    assertEqual(commonSegment.accumulatedFlowUnit, "m3_h");
    assertClose(result.totals.accumulatedFlow, expected);
    assertEqual(result.totals.accumulatedFlowUnit, "m3_h");
  });

  verify(results, "Caso D - HS distinto recalcula", () => {
    const projectGas: ProjectGasConfig = { heatingValueKcalPerM3: 10000 };
    const normalization = normalizeEquipmentDemand(
      applianceEquipment({
        demandUnit: "kcal_h",
        demandValue: 9000,
        id: "appliance-hs-custom",
      }),
      projectGas,
    );

    assertResolvedNormalization(normalization);
    assertEqual(normalization.heatingValueKcalPerM3, 10000);
    assertClose(normalization.normalizedFlowM3h, 0.9);
  });

  verify(results, "Caso E - HS invalido queda unresolved", () => {
    const result = calculateSingleSegment({
      demandUnit: "kcal_h",
      demandValue: 9000,
      lengthMeters: 10,
      projectGas: { heatingValueKcalPerM3: null },
    });
    const segment = result.segments[0] as TechnicalSegmentResult;
    const normalization = result.demandNormalizations[0] as EquipmentDemandNormalization;

    assertEqual(result.status, "incomplete");
    assertEqual(normalization.status, "unresolved");
    assertEqual(normalization.normalizedFlowM3h, null);
    assertEqual(segment.accumulatedFlow, null);
    assertEqual(segment.accumulatedFlowUnit, null);
    assert(
      result.issues.some(
        (issue) => issue.code === "unresolved_demand_normalization",
      ),
      "Expected unresolved demand-normalization issue.",
    );
  });

  verify(results, "Caso F - mismo input mismo resultado", () => {
    const equipment = [
      applianceEquipment({
        demandUnit: "kcal_h",
        demandValue: 6500,
        id: "appliance-deterministic",
      }),
    ];
    const first = normalizeEquipmentDemands(equipment, DEFAULT_PROJECT_GAS_CONFIG);
    const second = normalizeEquipmentDemands(equipment, DEFAULT_PROJECT_GAS_CONFIG);

    assertEqual(JSON.stringify(first), JSON.stringify(second));
  });

  verify(results, "Caso G - solver con kcal/h dimensiona", () => {
    const result = calculateSingleSegment({
      demandUnit: "kcal_h",
      demandValue: 9000,
      lengthMeters: 10,
    });
    const segment = result.segments[0] as TechnicalSegmentResult;

    assertEqual(result.status, "valid");
    assertEqual(result.networkSizing?.status, "resolved");
    assertEqual(result.transitionAwareNetworkSizing?.status, "resolved");
    assertEqual(segment.accumulatedFlowUnit, "m3_h");
    assertClose(
      segment.accumulatedFlow,
      9000 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
    );
    assertEqual(segment.calculatedDiameter?.id, "sigas-20");
  });

  verify(results, "Caso H - etiqueta UI muestra conversion", () => {
    const normalization = normalizeEquipmentDemand(
      applianceEquipment({
        demandUnit: "kcal_h",
        demandValue: 9000,
        id: "appliance-label",
      }),
      DEFAULT_PROJECT_GAS_CONFIG,
    );
    const label = formatEquipmentDemandWithNormalization(normalization);

    assert(label.includes("9000 kcal/h"), `Unexpected label ${label}.`);
    assert(label.includes("0,968"), `Unexpected label ${label}.`);
    assert(label.includes("→"), `Unexpected label ${label}.`);
  });

  return results;
}

function calculateSingleSegment(params: {
  demandUnit: DemandUnit;
  demandValue: number;
  lengthMeters: number;
  projectGas?: ProjectGasConfig | null;
}) {
  return calculateTechnicalTree({
    equipment: [
      supplyEquipment(),
      applianceEquipment({
        demandUnit: params.demandUnit,
        demandValue: params.demandValue,
        id: "appliance",
        x: params.lengthMeters,
        y: 0,
      }),
    ],
    minSegmentLengthSource: 0.000001,
    network: {
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
    },
    pipeSystem: SIGAS_PIPE_SYSTEM,
    projectGas: params.projectGas,
    scaleMetersPerSourceUnit: 1,
  });
}

function calculateMixedFixture() {
  const equipment = [
    supplyEquipment(),
    applianceEquipment({
      demandUnit: "kcal_h",
      demandValue: 9000,
      id: "appliance-kcal",
      x: 2,
      y: 1,
    }),
    applianceEquipment({
      demandUnit: "m3_h",
      demandValue: 1.5,
      id: "appliance-m3",
      x: 2,
      y: -1,
    }),
  ];
  const routeNodes: RouteNode[] = [
    {
      id: "node-junction",
      kind: "route",
      position: { x: 1, y: 0 },
    },
  ];
  const segments: RouteSegment[] = [
    {
      fromNodeId: "node-meter",
      id: "common",
      toNodeId: "node-junction",
    },
    {
      fromNodeId: "node-junction",
      id: "kcal-branch",
      toNodeId: "node-appliance-kcal",
    },
    {
      fromNodeId: "node-junction",
      id: "m3-branch",
      toNodeId: "node-appliance-m3",
    },
  ];
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: "meter", id: "node-meter", kind: "supply" },
      ...routeNodes,
      {
        equipmentId: "appliance-kcal",
        id: "node-appliance-kcal",
        kind: "appliance",
      },
      {
        equipmentId: "appliance-m3",
        id: "node-appliance-m3",
        kind: "appliance",
      },
    ],
    segments,
  };

  return calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: 1,
  });
}

function supplyEquipment(): WorkbenchEquipment {
  return {
    connectionPoint: { x: 0, y: 0 },
    id: "meter",
    name: "M",
    planBaseId: "plan",
    role: "supply",
    source: "manual",
    type: "meter_regulator",
  };
}

function applianceEquipment(params: {
  demandUnit: DemandUnit;
  demandValue: number;
  id: string;
  x?: number;
  y?: number;
}): WorkbenchEquipment {
  return {
    connectionPoint: { x: params.x ?? 1, y: params.y ?? 0 },
    demandUnit: params.demandUnit,
    demandValue: params.demandValue,
    id: params.id,
    name: params.id,
    planBaseId: "plan",
    role: "appliance",
    source: "manual",
    type: "stove",
  };
}

function segmentById(
  result: TechnicalCalculationResult,
  segmentId: string,
): TechnicalSegmentResult {
  const segment = result.segments.find((item) => item.segmentId === segmentId);

  assert(segment, `Missing segment ${segmentId}.`);
  return segment;
}

function assertResolvedNormalization(
  normalization: EquipmentDemandNormalization,
) {
  assertEqual(normalization.status, "resolved");
  assert(
    normalization.normalizedFlowM3h !== null,
    "Expected normalized flow in m3/h.",
  );
  assertEqual(normalization.reason, null);
}

function verify(
  results: DemandNormalizationVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(
    actual === expected,
    `Expected ${String(expected)}, got ${String(actual)}.`,
  );
}

function assertClose(actual: number | null | undefined, expected: number) {
  assert(
    actual !== null &&
      actual !== undefined &&
      Math.abs(actual - expected) <= EPSILON,
    `Expected ${expected}, got ${String(actual)}.`,
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
  console.log(JSON.stringify(runDemandNormalizationVerifications(), null, 2));
}
