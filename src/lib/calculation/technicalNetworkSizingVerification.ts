import type {
  PipeAccessoryEquivalentLengthContext,
  PipeDiameterReference,
  PipeSegmentSizingContext,
  PipeSegmentSizingResult,
  PipeSystem,
  PipeSystemResolution,
} from "@/lib/calculation/pipeSystem";
import {
  SIGAS_ACCESSORY_EQUIVALENT_LENGTHS,
  SIGAS_DIAMETERS,
  SIGAS_NATURAL_GAS_CAPACITY_TABLE,
} from "@/lib/calculation/pipeSystems/sigas/sigasData";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3 } from "@/lib/calculation/projectGas";
import type { DemandUnit, WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteNode,
  RouteSegment,
  RouteSegmentAccessory,
  RouteAccessoryType,
} from "@/lib/routing/types";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
  type TechnicalNetworkSizingResult,
  type TechnicalNetworkSizingSegmentResult,
} from "./technicalTree";
import { solveTechnicalNetworkSizing } from "./technicalNetworkSizing";

export type TechnicalNetworkSizingVerificationResult = {
  name: string;
  status: "passed";
};

export type SigasCapacityMonotonicityViolation = {
  capacityM3h: number;
  comparedCapacityM3h: number;
  diameterId?: string;
  lengthMeters?: number;
  nextDiameterId?: string;
  nextLengthMeters?: number;
  type: "capacity_increases_with_length" | "capacity_decreases_with_diameter";
};

export type SigasAccessoryMonotonicityException = {
  familyKey: string;
  fromExternalDiameterMeters: number;
  fromLengthMeters: number;
  toExternalDiameterMeters: number;
  toLengthMeters: number;
};

export type SigasMonotonicityAudit = {
  accessoryFamilyCount: number;
  accessoryExceptions: SigasAccessoryMonotonicityException[];
  capacityDiameterViolations: SigasCapacityMonotonicityViolation[];
  capacityLengthViolations: SigasCapacityMonotonicityViolation[];
};

export type PartialNetworkSizingContrastRow = {
  calculatedDiameterId: string | null;
  expectedDiameterId: string;
  matchesExpected: boolean;
  segmentId: string;
  sizingLengthMeters: number | null;
};

type TestPipeSystemOptions = {
  accessoryEquivalentByCode?: Record<string, Record<string, number>>;
  maxLengthMeters?: number;
  thresholds?: number[];
};

const TEST_DIAMETERS: PipeDiameterReference[] = [
  testDiameter("test-10", 10, 8),
  testDiameter("test-20", 20, 16),
  testDiameter("test-30", 30, 24),
  testDiameter("test-40", 40, 32),
];
const DEFAULT_THRESHOLDS = [20, 50, 90];
const EPSILON = 0.000001;

export function runTechnicalNetworkSizingVerifications() {
  const results: TechnicalNetworkSizingVerificationResult[] = [];

  verify(results, "Caso A - red lineal", () => {
    const result = calculateSingleSegmentFixture({
      flow: 1,
      lengthMeters: 10,
      pipeSystem: createTestPipeSystem(),
    });
    const sizing = assertResolvedNetwork(result);

    assertEqual(sizing.passCount, 1);
    assertSegmentDiameter(sizing, "segment", "test-10");
    assertSegmentSizingLength(sizing, "segment", 10);
  });

  verify(results, "Caso B - accesorios fuerzan escalamiento", () => {
    const result = calculateSingleSegmentFixture({
      accessories: [
        pipeSystemAccessory("segment", "boost", "boost", "other", 1),
      ],
      flow: 1,
      lengthMeters: 10,
      pipeSystem: createTestPipeSystem({
        accessoryEquivalentByCode: {
          boost: constantAccessoryEquivalent(15),
        },
      }),
    });
    const sizing = assertResolvedNetwork(result);

    assertSegmentDiameter(sizing, "segment", "test-20");
    assertTraceChange(sizing, 0, "segment", "test-20");
    assertSegmentSizingLength(sizing, "segment", 25);
  });

  verify(results, "Caso C - efecto entre segmentos", () => {
    const { result } = calculateCrossDependencyFixture();
    const sizing = assertResolvedNetwork(result);

    assertTraceChange(sizing, 0, "common", "test-20");
    assertTraceChange(sizing, 1, "branch-a", "test-20");
    assert(
      segmentSizing(sizing, "branch-a")
        .governingRouteAccessoryEquivalentLengthMeters === 45,
      "Expected branch-a to use the escalated common accessory length.",
    );
  });

  verify(results, "Caso D - varias pasadas", () => {
    const result = calculateSingleSegmentFixture({
      accessories: [
        pipeSystemAccessory("segment", "ladder", "ladder", "other", 1),
      ],
      flow: 1,
      lengthMeters: 10,
      pipeSystem: createTestPipeSystem({
        accessoryEquivalentByCode: {
          ladder: {
            "test-10": 15,
            "test-20": 45,
            "test-30": 45,
            "test-40": 45,
          },
        },
      }),
    });
    const sizing = assertResolvedNetwork(result);

    assertEqual(sizing.passCount, 3);
    assertTraceChange(sizing, 0, "segment", "test-20");
    assertTraceChange(sizing, 1, "segment", "test-30");
    assertSegmentDiameter(sizing, "segment", "test-30");
  });

  verify(results, "Caso E - independencia del orden", () => {
    const { network, pipeSystem, result } = calculateCrossDependencyFixture();
    const first = solveTechnicalNetworkSizing({
      pipeSystem,
      routeSegments: network.segments,
      routes: result.technicalRoutes,
      segments: result.segments,
    });
    const second = solveTechnicalNetworkSizing({
      pipeSystem,
      routeSegments: network.segments,
      routes: result.technicalRoutes,
      segments: [...result.segments].reverse(),
    });

    assertEqual(
      JSON.stringify(first.finalDiameterBySegmentId),
      JSON.stringify(second.finalDiameterBySegmentId),
    );
  });

  verify(results, "Caso F - nunca disminuir", () => {
    const result = calculateSingleSegmentFixture({
      accessories: [
        pipeSystemAccessory("segment", "ladder", "ladder", "other", 1),
      ],
      flow: 1,
      lengthMeters: 10,
      pipeSystem: createTestPipeSystem({
        accessoryEquivalentByCode: {
          ladder: {
            "test-10": 15,
            "test-20": 45,
            "test-30": 45,
            "test-40": 45,
          },
        },
      }),
    });
    const sizing = assertResolvedNetwork(result);

    assertTraceNeverDecreases(sizing);
  });

  verify(results, "Caso G - limite finito", () => {
    const result = calculateSingleSegmentFixture({
      accessories: [
        pipeSystemAccessory("segment", "ladder", "ladder", "other", 1),
      ],
      flow: 1,
      lengthMeters: 10,
      pipeSystem: createTestPipeSystem({
        accessoryEquivalentByCode: {
          ladder: {
            "test-10": 15,
            "test-20": 45,
            "test-30": 45,
            "test-40": 45,
          },
        },
      }),
    });
    const sizing = assertResolvedNetwork(result);

    assertEqual(sizing.maxPassCount, 4);
    assert(sizing.passCount <= sizing.maxPassCount, "Exceeded finite limit.");
    assert(
      !sizing.issues.some((issue) => issue.code === "iteration_limit_exceeded"),
      "Unexpected iteration-limit issue.",
    );
  });

  verify(results, "Caso H - accesorio ambiguo", () => {
    const result = calculateSingleSegmentFixture({
      accessories: [
        pipeSystemAccessory("segment", "ambiguous", undefined, "elbow", 1),
      ],
      flow: 1,
      lengthMeters: 10,
      pipeSystem: createTestPipeSystem(),
    });
    const sizing = assertNetwork(result);

    assertEqual(sizing.status, "unsupported");
    assertSegmentIssue(sizing, "segment", "route_accessories_unresolved");
  });

  verify(results, "Caso I - kcal/h normaliza y dimensiona", () => {
    const result = calculateSingleSegmentFixture({
      demandUnit: "kcal_h",
      flow: 9000,
      lengthMeters: 10,
      pipeSystem: createTestPipeSystem(),
    });
    const sizing = assertResolvedNetwork(result);

    assertEqual(sizing.status, "resolved");
    assertSegmentFlow(sizing, "segment", 9000 / DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3);
    assertSegmentFlowUnit(sizing, "segment", "m3_h");
  });

  verify(results, "Caso J - fuera de tabla", () => {
    const result = calculateSingleSegmentFixture({
      flow: 1,
      lengthMeters: 101,
      pipeSystem: createTestPipeSystem({ maxLengthMeters: 100 }),
    });
    const sizing = assertNetwork(result);

    assertEqual(sizing.status, "incomplete");
    assertSegmentIssue(sizing, "segment", "sizing_unresolved");
  });

  verify(results, "Caso K - determinismo", () => {
    const first = serializeSizing(
      assertResolvedNetwork(calculateCrossDependencyFixture().result),
    );
    const second = serializeSizing(
      assertResolvedNetwork(calculateCrossDependencyFixture().result),
    );

    assertEqual(JSON.stringify(first), JSON.stringify(second));
  });

  verify(results, "Caso L - validacion final", () => {
    const sizing = assertResolvedNetwork(calculateCrossDependencyFixture().result);

    assertFinalValidation(sizing);
  });

  verify(results, "Caso M - contraste Calculos Parcial.pdf", () => {
    const rows = createPartialNetworkSizingContrast();

    for (const row of rows) {
      assert(
        row.matchesExpected,
        `Unexpected partial diameter for ${row.segmentId}: ` +
          `${String(row.calculatedDiameterId)}.`,
      );
    }
  });

  verify(results, "Caso N - ruta alternativa con mayor sizingLength", () => {
    const result = calculateAlternateRouteFixture();
    const sizing = assertNetwork(result);

    assert(
      sizing.issues.some(
        (issue) =>
          issue.code === "alternate_route_has_greater_sizing_length" &&
          issue.segmentId === "common",
      ),
      "Expected alternate route sizing warning for common segment.",
    );
  });

  verify(results, "SIGAS - monotonicidad tablas", () => {
    const audit = auditSigasMonotonicity();

    assertEqual(audit.capacityLengthViolations.length, 0);
    assertEqual(audit.capacityDiameterViolations.length, 0);
  });

  return results;
}

export function auditSigasMonotonicity(): SigasMonotonicityAudit {
  const capacityLengthViolations: SigasCapacityMonotonicityViolation[] = [];
  const capacityDiameterViolations: SigasCapacityMonotonicityViolation[] = [];

  for (let diameterIndex = 0; diameterIndex < SIGAS_DIAMETERS.length; diameterIndex += 1) {
    const diameter = SIGAS_DIAMETERS[diameterIndex] as (typeof SIGAS_DIAMETERS)[number];

    for (let rowIndex = 1; rowIndex < SIGAS_NATURAL_GAS_CAPACITY_TABLE.length; rowIndex += 1) {
      const previousRow = SIGAS_NATURAL_GAS_CAPACITY_TABLE[rowIndex - 1];
      const currentRow = SIGAS_NATURAL_GAS_CAPACITY_TABLE[rowIndex];
      const previousCapacity = previousRow?.capacitiesM3h[diameterIndex];
      const currentCapacity = currentRow?.capacitiesM3h[diameterIndex];

      if (
        previousRow &&
        currentRow &&
        previousCapacity !== undefined &&
        currentCapacity !== undefined &&
        currentCapacity > previousCapacity + EPSILON
      ) {
        capacityLengthViolations.push({
          capacityM3h: previousCapacity,
          comparedCapacityM3h: currentCapacity,
          diameterId: diameter.id,
          lengthMeters: previousRow.lengthMeters,
          nextLengthMeters: currentRow.lengthMeters,
          type: "capacity_increases_with_length",
        });
      }
    }
  }

  for (const row of SIGAS_NATURAL_GAS_CAPACITY_TABLE) {
    for (let diameterIndex = 1; diameterIndex < SIGAS_DIAMETERS.length; diameterIndex += 1) {
      const previousDiameter = SIGAS_DIAMETERS[diameterIndex - 1];
      const currentDiameter = SIGAS_DIAMETERS[diameterIndex];
      const previousCapacity = row.capacitiesM3h[diameterIndex - 1];
      const currentCapacity = row.capacitiesM3h[diameterIndex];

      if (
        previousDiameter &&
        currentDiameter &&
        previousCapacity !== undefined &&
        currentCapacity !== undefined &&
        currentCapacity + EPSILON < previousCapacity
      ) {
        capacityDiameterViolations.push({
          capacityM3h: previousCapacity,
          comparedCapacityM3h: currentCapacity,
          diameterId: previousDiameter.id,
          lengthMeters: row.lengthMeters,
          nextDiameterId: currentDiameter.id,
          type: "capacity_decreases_with_diameter",
        });
      }
    }
  }

  const accessoryRowsByFamily = new Map<
    string,
    typeof SIGAS_ACCESSORY_EQUIVALENT_LENGTHS
  >();

  for (const row of SIGAS_ACCESSORY_EQUIVALENT_LENGTHS) {
    const familyKey = sigasAccessoryFamilyKey(row.label);
    const current = accessoryRowsByFamily.get(familyKey) ?? [];

    current.push(row);
    accessoryRowsByFamily.set(familyKey, current);
  }

  const accessoryExceptions: SigasAccessoryMonotonicityException[] = [];

  for (const [familyKey, rows] of accessoryRowsByFamily) {
    if (rows.length < 2) {
      continue;
    }

    const sortedRows = [...rows].sort(
      (first, second) =>
        first.externalDiameterMeters - second.externalDiameterMeters,
    );

    for (let index = 1; index < sortedRows.length; index += 1) {
      const previous = sortedRows[index - 1];
      const current = sortedRows[index];

      if (
        previous &&
        current &&
        current.equivalentLengthMeters + EPSILON <
          previous.equivalentLengthMeters
      ) {
        accessoryExceptions.push({
          familyKey,
          fromExternalDiameterMeters: previous.externalDiameterMeters,
          fromLengthMeters: previous.equivalentLengthMeters,
          toExternalDiameterMeters: current.externalDiameterMeters,
          toLengthMeters: current.equivalentLengthMeters,
        });
      }
    }
  }

  return {
    accessoryExceptions,
    accessoryFamilyCount: accessoryRowsByFamily.size,
    capacityDiameterViolations,
    capacityLengthViolations,
  };
}

export function createPartialNetworkSizingContrast() {
  const result = calculatePartialFixture();
  const sizing = assertNetwork(result);
  const expectedDiameterBySegmentId: Record<string, string> = {
    "1-A": "sigas-20",
    "A-2": "sigas-20",
    "A-B": "sigas-25",
    "B-3": "sigas-20",
    "B-C": "sigas-25",
    "C-4": "sigas-25",
    "C-M": "sigas-32",
  };

  return Object.entries(expectedDiameterBySegmentId).map(
    ([segmentId, expectedDiameterId]): PartialNetworkSizingContrastRow => {
      const segment = segmentSizing(sizing, segmentId);
      const calculatedDiameterId = segment.calculatedDiameter?.id ?? null;

      return {
        calculatedDiameterId,
        expectedDiameterId,
        matchesExpected: calculatedDiameterId === expectedDiameterId,
        segmentId,
        sizingLengthMeters: segment.sizingLengthMeters,
      };
    },
  );
}

function calculateSingleSegmentFixture(params: {
  accessories?: RouteSegmentAccessory[];
  demandUnit?: DemandUnit;
  flow: number;
  lengthMeters: number;
  pipeSystem: PipeSystem;
}) {
  return calculateFixture({
    appliances: [
      {
        demandUnit: params.demandUnit ?? "m3_h",
        demandValue: params.flow,
        id: "appliance",
        name: "Artefacto",
        x: params.lengthMeters,
        y: 0,
      },
    ],
    pipeSystem: params.pipeSystem,
    routeNodes: [],
    segments: [
      {
        accessories: params.accessories,
        fromNodeId: "node-meter",
        id: "segment",
        toNodeId: "node-appliance",
      },
    ],
  });
}

function calculateCrossDependencyFixture() {
  const pipeSystem = createTestPipeSystem({
    accessoryEquivalentByCode: {
      coupled: {
        "test-10": 20,
        "test-20": 45,
        "test-30": 45,
        "test-40": 45,
      },
    },
    thresholds: [55, 80, 120],
  });
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: "meter", id: "node-meter", kind: "supply" },
      { id: "node-j", kind: "route", position: { x: 10, y: 0 } },
      { equipmentId: "appliance-a", id: "node-appliance-a", kind: "appliance" },
      { equipmentId: "appliance-b", id: "node-appliance-b", kind: "appliance" },
    ],
    segments: [
      {
        accessories: [
          pipeSystemAccessory("common", "coupled", "coupled", "other", 1),
        ],
        fromNodeId: "node-meter",
        id: "common",
        toNodeId: "node-j",
      },
      {
        fromNodeId: "node-j",
        id: "branch-a",
        toNodeId: "node-appliance-a",
      },
      {
        fromNodeId: "node-j",
        id: "branch-b",
        toNodeId: "node-appliance-b",
      },
    ],
  };
  const equipment: WorkbenchEquipment[] = [
    supplyEquipment(),
    applianceEquipment({
      demandValue: 1,
      id: "appliance-a",
      name: "A",
      x: 15,
      y: 0,
    }),
    applianceEquipment({
      demandValue: 1,
      id: "appliance-b",
      name: "B",
      x: 11,
      y: 0,
    }),
  ];
  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem,
    scaleMetersPerSourceUnit: 1,
  });

  return { network, pipeSystem, result };
}

export function calculatePartialFixture() {
  return calculateFixture({
    appliances: [
      { demandValue: 0.968, id: "appliance-1", name: "1", x: 10.75, y: 0 },
      { demandValue: 0.323, id: "appliance-2", name: "2", x: 7.35, y: 3.4 },
      { demandValue: 0.699, id: "appliance-3", name: "3", x: 5.45, y: 1.7 },
      { demandValue: 3.226, id: "appliance-4", name: "4", x: 3, y: 1.7 },
    ],
    pipeSystem: SIGAS_PIPE_SYSTEM,
    routeNodes: [
      { id: "node-c", x: 3, y: 0 },
      { id: "node-b", x: 5.45, y: 0 },
      { id: "node-a", x: 7.35, y: 0 },
    ],
    segments: [
      { fromNodeId: "node-meter", id: "C-M", toNodeId: "node-c" },
      { fromNodeId: "node-c", id: "B-C", toNodeId: "node-b" },
      {
        accessories: [manualAccessory("A-B", "partial-long", 10.97, 1)],
        fromNodeId: "node-b",
        id: "A-B",
        toNodeId: "node-a",
      },
      { fromNodeId: "node-a", id: "1-A", toNodeId: "node-appliance-1" },
      { fromNodeId: "node-a", id: "A-2", toNodeId: "node-appliance-2" },
      {
        accessories: [manualAccessory("B-3", "partial-b3", 9.16, 1)],
        fromNodeId: "node-b",
        id: "B-3",
        toNodeId: "node-appliance-3",
      },
      {
        accessories: [manualAccessory("C-4", "partial-c4", 8.4, 1)],
        fromNodeId: "node-c",
        id: "C-4",
        toNodeId: "node-appliance-4",
      },
    ],
  });
}

function calculateAlternateRouteFixture() {
  return calculateFixture({
    appliances: [
      { demandValue: 1, id: "appliance-long", name: "Largo", x: 10, y: 0 },
      { demandValue: 1, id: "appliance-short", name: "Corto", x: 2, y: 0 },
    ],
    pipeSystem: createTestPipeSystem({
      thresholds: [30, 80, 140],
    }),
    routeNodes: [{ id: "node-j", x: 1, y: 0 }],
    segments: [
      { fromNodeId: "node-meter", id: "common", toNodeId: "node-j" },
      {
        fromNodeId: "node-j",
        id: "long-branch",
        toNodeId: "node-appliance-long",
      },
      {
        accessories: [manualAccessory("short-branch", "alternate-extra", 20, 1)],
        fromNodeId: "node-j",
        id: "short-branch",
        toNodeId: "node-appliance-short",
      },
    ],
  });
}

function calculateFixture(params: {
  appliances: Array<{
    demandUnit?: DemandUnit;
    demandValue: number;
    id: string;
    name: string;
    x: number;
    y: number;
  }>;
  pipeSystem: PipeSystem;
  routeNodes: Array<{ id: string; x: number; y: number }>;
  segments: RouteSegment[];
}) {
  const equipment: WorkbenchEquipment[] = [
    supplyEquipment(),
    ...params.appliances.map((appliance) =>
      applianceEquipment({
        demandUnit: appliance.demandUnit,
        demandValue: appliance.demandValue,
        id: appliance.id,
        name: appliance.name,
        x: appliance.x,
        y: appliance.y,
      }),
    ),
  ];
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: "meter", id: "node-meter", kind: "supply" },
      ...params.routeNodes.map((node): RouteNode => ({
        id: node.id,
        kind: "route",
        position: { x: node.x, y: node.y },
      })),
      ...params.appliances.map((appliance): RouteNode => ({
        equipmentId: appliance.id,
        id: `node-${appliance.id}`,
        kind: "appliance",
      })),
    ],
    segments: params.segments,
  };

  return calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem: params.pipeSystem,
    scaleMetersPerSourceUnit: 1,
  });
}

function createTestPipeSystem(options: TestPipeSystemOptions = {}): PipeSystem {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;

  return {
    getAvailableDiameters: () => ({
      explanation: "Diametros sinteticos para verificaciones del solver.",
      status: "resolved",
      value: TEST_DIAMETERS,
    }),
    identity: {
      id: "test-pipe-system",
      name: "Test PipeSystem",
    },
    resolveAccessoryEquivalentLength: (
      context: PipeAccessoryEquivalentLengthContext,
    ) => resolveTestAccessoryEquivalentLength(context, options),
    resolveDiameterTransitionEquivalentLength: () => ({
      reason: "Transiciones fuera del solver 08C2C.",
      status: "unresolved",
    }),
    sizeSegment: (context: PipeSegmentSizingContext) =>
      sizeTestSegment(context, thresholds, options.maxLengthMeters),
  };
}

function resolveTestAccessoryEquivalentLength(
  context: PipeAccessoryEquivalentLengthContext,
  options: TestPipeSystemOptions,
): PipeSystemResolution<number> {
  const diameter = context.pipe?.diameter ?? null;

  if (!diameter) {
    return {
      reason: "Falta diametro para resolver accesorio de prueba.",
      status: "unresolved",
    };
  }

  if (!context.accessory.catalogCode) {
    return {
      reason: "Accesorio de prueba ambiguo sin catalogCode.",
      status: "unsupported",
    };
  }

  const equivalentByDiameter =
    options.accessoryEquivalentByCode?.[context.accessory.catalogCode] ?? null;

  if (!equivalentByDiameter) {
    return {
      reason: "Accesorio de prueba no existe en catalogo.",
      status: "unsupported",
    };
  }

  const value = equivalentByDiameter[diameter.id];

  if (value === undefined) {
    return {
      reason: "Accesorio de prueba no corresponde al diametro.",
      status: "unsupported",
    };
  }

  return {
    explanation: "Longitud equivalente sintetica por diametro.",
    status: "resolved",
    value,
  };
}

function sizeTestSegment(
  context: PipeSegmentSizingContext,
  thresholds: number[],
  maxLengthMeters: number | undefined,
): PipeSystemResolution<PipeSegmentSizingResult> {
  if (context.calculationLengthMeters === null) {
    return {
      reason: "Falta longitud de calculo.",
      status: "unresolved",
    };
  }

  if (context.accumulatedFlow === null) {
    return {
      reason: "Falta caudal.",
      status: "unresolved",
    };
  }

  if (context.accumulatedFlowUnit !== "m3_h") {
    return {
      reason: "Sistema de prueba solo acepta m3/h.",
      status: "unsupported",
    };
  }

  if (
    maxLengthMeters !== undefined &&
    context.calculationLengthMeters > maxLengthMeters + EPSILON
  ) {
    return {
      reason: "Longitud fuera de tabla de prueba.",
      status: "unresolved",
    };
  }

  const load = context.calculationLengthMeters * context.accumulatedFlow;
  const selectedDiameter = selectTestDiameter(load, thresholds);

  if (!selectedDiameter) {
    return {
      reason: "Carga fuera de catalogo de prueba.",
      status: "unresolved",
    };
  }

  return {
    explanation: `Carga ${load.toFixed(3)} resuelta con ${selectedDiameter.label}.`,
    status: "resolved",
    value: {
      explanation: `Carga ${load.toFixed(3)} resuelta con ${selectedDiameter.label}.`,
      selectedDiameter,
      usedData: {
        capacityM3h: testCapacityForDiameter(selectedDiameter, thresholds),
        load,
        tabulatedLengthMeters: Math.ceil(context.calculationLengthMeters),
      },
    },
  };
}

function selectTestDiameter(load: number, thresholds: number[]) {
  let selectedIndex = 0;

  while (
    selectedIndex < thresholds.length &&
    load > (thresholds[selectedIndex] as number) + EPSILON
  ) {
    selectedIndex += 1;
  }

  return TEST_DIAMETERS[selectedIndex] ?? null;
}

function testCapacityForDiameter(
  diameter: PipeDiameterReference,
  thresholds: number[],
) {
  const index = TEST_DIAMETERS.findIndex((item) => item.id === diameter.id);
  const threshold = thresholds[index] ?? thresholds[thresholds.length - 1] ?? 0;

  return threshold <= 0 ? 999999 : threshold;
}

function constantAccessoryEquivalent(value: number) {
  return Object.fromEntries(
    TEST_DIAMETERS.map((diameter) => [diameter.id, value]),
  );
}

function testDiameter(
  id: string,
  externalDiameterMillimeters: number,
  internalDiameterMillimeters: number,
): PipeDiameterReference {
  return {
    externalDiameterMillimeters,
    id,
    internalDiameterMillimeters,
    label: `Test ${externalDiameterMillimeters} mm`,
    nominalDiameter: `${externalDiameterMillimeters} mm`,
  };
}

function manualAccessory(
  segmentId: string,
  id: string,
  equivalentLengthMetersPerUnit: number,
  quantity: number,
  type: RouteAccessoryType = "other",
): RouteSegmentAccessory {
  return {
    equivalentLengthMetersPerUnit,
    equivalentLengthSource: "manual",
    id,
    quantity,
    segmentId,
    type,
  };
}

function pipeSystemAccessory(
  segmentId: string,
  id: string,
  catalogCode: string | undefined,
  type: RouteAccessoryType,
  quantity: number,
): RouteSegmentAccessory {
  return {
    catalogCode,
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id,
    quantity,
    segmentId,
    type,
  };
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
  demandUnit?: DemandUnit;
  demandValue: number;
  id: string;
  name: string;
  x: number;
  y: number;
}): WorkbenchEquipment {
  return {
    connectionPoint: { x: params.x, y: params.y },
    demandUnit: params.demandUnit ?? "m3_h",
    demandValue: params.demandValue,
    id: params.id,
    name: params.name,
    planBaseId: "plan",
    role: "appliance",
    source: "manual",
    type: "stove",
  };
}

function assertResolvedNetwork(
  result: TechnicalCalculationResult,
): TechnicalNetworkSizingResult {
  const sizing = assertNetwork(result);

  assertEqual(sizing.status, "resolved");

  return sizing;
}

function assertNetwork(result: TechnicalCalculationResult) {
  const sizing = result.networkSizing;

  assert(sizing, "Missing network sizing result.");

  return sizing;
}

function segmentSizing(
  sizing: TechnicalNetworkSizingResult,
  segmentId: string,
): TechnicalNetworkSizingSegmentResult {
  const segment =
    sizing.segments.find((item) => item.segmentId === segmentId) ?? null;

  assert(segment, `Missing sizing segment ${segmentId}.`);

  return segment;
}

function assertSegmentDiameter(
  sizing: TechnicalNetworkSizingResult,
  segmentId: string,
  expectedDiameterId: string,
) {
  assertEqual(
    segmentSizing(sizing, segmentId).calculatedDiameter?.id,
    expectedDiameterId,
  );
}

function assertSegmentSizingLength(
  sizing: TechnicalNetworkSizingResult,
  segmentId: string,
  expectedMeters: number,
) {
  assertClose(segmentSizing(sizing, segmentId).sizingLengthMeters, expectedMeters);
}

function assertSegmentFlow(
  sizing: TechnicalNetworkSizingResult,
  segmentId: string,
  expectedFlow: number,
) {
  assertClose(segmentSizing(sizing, segmentId).accumulatedFlow, expectedFlow);
}

function assertSegmentFlowUnit(
  sizing: TechnicalNetworkSizingResult,
  segmentId: string,
  expectedUnit: DemandUnit,
) {
  assertEqual(segmentSizing(sizing, segmentId).accumulatedFlowUnit, expectedUnit);
}

function assertSegmentIssue(
  sizing: TechnicalNetworkSizingResult,
  segmentId: string,
  expectedCode: string,
) {
  const segment = segmentSizing(sizing, segmentId);

  assert(
    segment.issues.some((issue) => issue.code === expectedCode),
    `Missing issue ${expectedCode} for ${segmentId}.`,
  );
}

function assertTraceChange(
  sizing: TechnicalNetworkSizingResult,
  pass: number,
  segmentId: string,
  expectedDiameterId: string,
) {
  const tracePass = sizing.trace.find((item) => item.pass === pass);

  assert(tracePass, `Missing pass ${pass}.`);
  assert(
    tracePass.diameterChanges.some(
      (change) =>
        change.segmentId === segmentId &&
        change.toDiameter.id === expectedDiameterId,
    ),
    `Missing ${segmentId} -> ${expectedDiameterId} in pass ${pass}.`,
  );
}

function assertTraceNeverDecreases(sizing: TechnicalNetworkSizingResult) {
  const previousRankBySegmentId = new Map<string, number>();

  for (const tracePass of sizing.trace) {
    for (const [segmentId, diameter] of Object.entries(tracePass.assignment)) {
      const currentRank = testDiameterRank(diameter.id);
      const previousRank = previousRankBySegmentId.get(segmentId);

      if (previousRank !== undefined) {
        assert(
          currentRank >= previousRank,
          `Diameter decreased for ${segmentId}.`,
        );
      }

      previousRankBySegmentId.set(segmentId, currentRank);
    }
  }
}

function assertFinalValidation(sizing: TechnicalNetworkSizingResult) {
  assert(
    !sizing.issues.some(
      (issue) =>
        issue.code === "final_assignment_insufficient" ||
        issue.code === "sizing_length_mismatch",
    ),
    "Final validation issues were emitted.",
  );

  for (const segment of sizing.segments) {
    if (
      segment.status !== "resolved" ||
      !segment.calculatedDiameter ||
      !segment.requiredDiameter
    ) {
      continue;
    }

    assert(
      testDiameterRank(segment.calculatedDiameter.id) >=
        testDiameterRank(segment.requiredDiameter.id),
      `Final diameter is insufficient for ${segment.segmentId}.`,
    );

    assertClose(
      segment.sizingLengthMeters,
      (segment.governingRoutePhysicalLengthMeters ?? 0) +
        (segment.governingRouteAccessoryEquivalentLengthMeters ?? 0),
    );
  }
}

function testDiameterRank(diameterId: string) {
  const index = TEST_DIAMETERS.findIndex((diameter) => diameter.id === diameterId);

  assert(index >= 0, `Unknown test diameter ${diameterId}.`);

  return index;
}

function serializeSizing(sizing: TechnicalNetworkSizingResult) {
  return {
    finalDiameterBySegmentId: sizing.finalDiameterBySegmentId,
    issues: sizing.issues,
    passCount: sizing.passCount,
    segments: sizing.segments.map((segment) => ({
      calculatedDiameterId: segment.calculatedDiameter?.id ?? null,
      requiredDiameterId: segment.requiredDiameter?.id ?? null,
      segmentId: segment.segmentId,
      sizingLengthMeters: segment.sizingLengthMeters,
      status: segment.status,
    })),
    status: sizing.status,
    trace: sizing.trace,
  };
}

function sigasAccessoryFamilyKey(label: string) {
  return label
    .toLowerCase()
    .replace(/\b(20|25|32|40|50|63|75|90|110)\s*mm\b/g, "{de} mm")
    .replace(/\b(20|25|32|40|50|63|75|90|110)\s*x\b/g, "{de} x")
    .replace(/\b(20|25|32|40|50|63|75|90|110)(?=\s*a\s|\s*x|\s*$)/g, "{de}")
    .replace(/\s+/g, " ")
    .trim();
}

function verify(
  results: TechnicalNetworkSizingVerificationResult[],
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
    JSON.stringify(runTechnicalNetworkSizingVerifications(), null, 2),
  );
}
