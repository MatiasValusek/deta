import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import { calculateTechnicalTree } from "./technicalTree";
import {
  resolveTechnicalRouteAccessories,
  type TechnicalRouteAccessoryResolution,
  type TechnicalRouteAccessoryRoute,
} from "./technicalRouteAccessories";

export type TechnicalRouteAccessoriesVerificationResult = {
  name: string;
  status: "passed";
};

export type PartialRouteAccessoryContrastRow = {
  absoluteAccessoryDifferenceMeters: number;
  absoluteTotalDifferenceMeters: number;
  classification: "redondeo";
  obtainedAccessoryEquivalentLengthMeters: number;
  obtainedTotalLengthMeters: number;
  partialAccessoryEquivalentLengthMeters: number;
  partialInitialLengthMeters: number;
  partialTotalLengthMeters: number;
  segmentId: string;
};

const DIAMETERS = assertResolved(
  SIGAS_PIPE_SYSTEM.getAvailableDiameters(),
);

export function runTechnicalRouteAccessoriesVerifications() {
  const results: TechnicalRouteAccessoriesVerificationResult[] = [];

  verify(results, "Caso A - recorrido sin accesorios", () => {
    const resolution = resolveFixture({
      routeLengthMeters: 12,
      segments: [segment("meter-a"), segment("a-terminal")],
      segmentIds: ["meter-a", "a-terminal"],
    });

    assertEqual(resolution.status, "resolved");
    assertClose(resolution.governingRouteAccessoryEquivalentLengthMeters, 0);
    assertClose(resolution.sizingLengthMeters, 12);
  });

  verify(results, "Caso B - varios segmentos y accesorios manuales", () => {
    const resolution = resolveFixture({
      routeLengthMeters: 10,
      segments: [
        segment("meter-a", [
          manualAccessory("manual-a", 1.25, 2),
        ]),
        segment("a-terminal", [
          manualAccessory("manual-b", 0.75, 1),
        ]),
      ],
      segmentIds: ["meter-a", "a-terminal"],
    });

    assertEqual(resolution.status, "resolved");
    assertClose(resolution.governingRouteAccessoryEquivalentLengthMeters, 3.25);
    assertClose(resolution.sizingLengthMeters, 13.25);
  });

  verify(results, "Caso C - accesorios SIGAS de distintos diametros", () => {
    const resolution = resolveFixture({
      diameterBySegmentId: {
        "segment-20": diameter("sigas-20"),
        "segment-25": diameter("sigas-25"),
      },
      routeLengthMeters: 8,
      segments: [
        segment("segment-20", [
          pipeSystemAccessory("elbow-20", "codo-normal-a-90", "elbow", 1),
        ]),
        segment("segment-25", [
          pipeSystemAccessory("valve-25", "llave-esferica", "valve", 1),
        ]),
      ],
      segmentIds: ["segment-20", "segment-25"],
    });

    assertEqual(resolution.status, "resolved");
    assertContribution(resolution, "segment-20", "elbow-20", "sigas-20", 0.953);
    assertContribution(resolution, "segment-25", "valve-25", "sigas-25", 0.227);
    assertClose(resolution.governingRouteAccessoryEquivalentLengthMeters, 1.18);
  });

  verify(results, "Caso D - mismo recorrido gobierna varios tramos", () => {
    const result = calculateSharedRouteFixture();
    const first = result.segments.find((item) => item.segmentId === "meter-a");
    const second = result.segments.find((item) => item.segmentId === "a-terminal");
    const routeId = "technical-route:appliance";
    const routeResolution = result.routeAccessoryResolutions[routeId];

    assert(first, "Missing first segment.");
    assert(second, "Missing second segment.");
    assert(routeResolution, "Missing route accessory resolution.");
    assertEqual(first.routeSizingBasis.routeAccessoryResolutionId, routeId);
    assertEqual(second.routeSizingBasis.routeAccessoryResolutionId, routeId);
    assertClose(first.routeSizingBasis.governingRouteAccessoryEquivalentLengthMeters, 3);
    assertClose(second.routeSizingBasis.governingRouteAccessoryEquivalentLengthMeters, 3);
    assertEqual(routeResolution.contributions.length, 2);
  });

  verify(results, "Caso E - accesorio ambiguo", () => {
    const resolution = resolveFixture({
      diameterBySegmentId: { segment: diameter("sigas-20") },
      routeLengthMeters: 5,
      segments: [
        segment("segment", [
          pipeSystemAccessory("ambiguous-elbow", undefined, "elbow", 1),
        ]),
      ],
      segmentIds: ["segment"],
    });

    assertEqual(resolution.status, "unsupported");
    assertEqual(resolution.governingRouteAccessoryEquivalentLengthMeters, null);
    assertEqual(resolution.sizingLengthMeters, null);
  });

  verify(results, "Caso F - diametro faltante en un segmento", () => {
    const resolution = resolveFixture({
      routeLengthMeters: 5,
      segments: [
        segment("segment", [
          pipeSystemAccessory("elbow", "codo-normal-a-90", "elbow", 1),
        ]),
      ],
      segmentIds: ["segment"],
    });

    assertEqual(resolution.status, "unresolved");
    assertEqual(resolution.governingRouteAccessoryEquivalentLengthMeters, null);
    assertEqual(resolution.sizingLengthMeters, null);
  });

  verify(results, "Caso G - manual y PipeSystem", () => {
    const resolution = resolveFixture({
      diameterBySegmentId: { "segment-25": diameter("sigas-25") },
      routeLengthMeters: 7,
      segments: [
        segment("manual", [
          manualAccessory("manual", 2, 1),
        ]),
        segment("segment-25", [
          pipeSystemAccessory("elbow-25", "codo-normal-a-90", "elbow", 1),
        ]),
      ],
      segmentIds: ["manual", "segment-25"],
    });

    assertEqual(resolution.status, "resolved");
    assertClose(resolution.governingRouteAccessoryEquivalentLengthMeters, 2.856);
    assertClose(resolution.sizingLengthMeters, 9.856);
  });

  verify(results, "Caso H - quantity", () => {
    const resolution = resolveFixture({
      diameterBySegmentId: { segment: diameter("sigas-25") },
      routeLengthMeters: 5,
      segments: [
        segment("segment", [
          pipeSystemAccessory("elbow-25", "codo-normal-a-90", "elbow", 3),
        ]),
      ],
      segmentIds: ["segment"],
    });

    assertEqual(resolution.status, "resolved");
    assertContribution(resolution, "segment", "elbow-25", "sigas-25", 0.856, 3);
    assertClose(resolution.governingRouteAccessoryEquivalentLengthMeters, 2.568);
  });

  verify(results, "Caso I - determinismo", () => {
    const first = JSON.stringify(resolveMixedDiameterFixture());
    const second = JSON.stringify(resolveMixedDiameterFixture());

    assertEqual(first, second);
  });

  verify(results, "Caso J - mezcla DE 20 / DE 25 / DE 32", () => {
    const resolution = resolveMixedDiameterFixture();

    assertEqual(resolution.status, "resolved");
    assertContribution(resolution, "segment-20", "elbow-20", "sigas-20", 0.953);
    assertContribution(resolution, "segment-25", "elbow-25", "sigas-25", 0.856);
    assertContribution(resolution, "segment-32", "elbow-32", "sigas-32", 1.191);
    assertClose(resolution.governingRouteAccessoryEquivalentLengthMeters, 3);
  });

  verify(results, "Parcial - contraste accesorios acumulados", () => {
    for (const row of createPartialRouteAccessoryContrast()) {
      assertEqual(row.classification, "redondeo");
      assert(row.absoluteAccessoryDifferenceMeters <= 0.02, "Unexpected accessory difference.");
      assert(row.absoluteTotalDifferenceMeters <= 0.02, "Unexpected total difference.");
    }
  });

  return results;
}

export function createPartialRouteAccessoryContrast() {
  return [
    partialContrastRow("1-A", 10.75, 10.97, 21.72, "long"),
    partialContrastRow("A-2", 10.75, 10.97, 21.72, "long"),
    partialContrastRow("A-B", 10.75, 10.97, 21.72, "long"),
    partialContrastRow("B-3", 7.15, 9.16, 16.31, "b3"),
    partialContrastRow("B-C", 10.75, 10.97, 21.72, "long"),
    partialContrastRow("C-4", 4.7, 8.4, 13.1, "c4"),
    partialContrastRow("C-M", 10.75, 10.97, 21.72, "long"),
  ];
}

function partialContrastRow(
  segmentId: string,
  partialInitialLengthMeters: number,
  partialAccessoryEquivalentLengthMeters: number,
  partialTotalLengthMeters: number,
  accessorySet: "long" | "b3" | "c4",
): PartialRouteAccessoryContrastRow {
  const resolution = resolvePartialAccessorySet(
    accessorySet,
    partialInitialLengthMeters,
  );

  assertEqual(resolution.status, "resolved");

  const obtainedAccessoryEquivalentLengthMeters = assertNumber(
    resolution.governingRouteAccessoryEquivalentLengthMeters,
  );
  const obtainedTotalLengthMeters = assertNumber(resolution.sizingLengthMeters);

  return {
    absoluteAccessoryDifferenceMeters: Math.abs(
      partialAccessoryEquivalentLengthMeters -
        obtainedAccessoryEquivalentLengthMeters,
    ),
    absoluteTotalDifferenceMeters: Math.abs(
      partialTotalLengthMeters - obtainedTotalLengthMeters,
    ),
    classification: "redondeo",
    obtainedAccessoryEquivalentLengthMeters,
    obtainedTotalLengthMeters,
    partialAccessoryEquivalentLengthMeters,
    partialInitialLengthMeters,
    partialTotalLengthMeters,
    segmentId,
  };
}

function resolveMixedDiameterFixture() {
  return resolveFixture({
    diameterBySegmentId: {
      "segment-20": diameter("sigas-20"),
      "segment-25": diameter("sigas-25"),
      "segment-32": diameter("sigas-32"),
    },
    routeLengthMeters: 11,
    segments: [
      segment("segment-20", [
        pipeSystemAccessory("elbow-20", "codo-normal-a-90", "elbow", 1),
      ]),
      segment("segment-25", [
        pipeSystemAccessory("elbow-25", "codo-normal-a-90", "elbow", 1),
      ]),
      segment("segment-32", [
        pipeSystemAccessory("elbow-32", "codo-normal-a-90", "elbow", 1),
      ]),
    ],
    segmentIds: ["segment-20", "segment-25", "segment-32"],
  });
}

function resolvePartialAccessorySet(
  accessorySet: "long" | "b3" | "c4",
  routeLengthMeters: number,
) {
  if (accessorySet === "long") {
    return resolveFixture({
      diameterBySegmentId: partialDiameterBySegmentId(),
      routeLengthMeters,
      segments: [
        segment("partial-de-40", [
          pipeSystemAccessory(
            "cupla-40-32",
            "cupla-reduccion-hh-40-a-32-mm",
            "other",
            1,
          ),
        ]),
        segment("partial-de-32", [
          pipeSystemAccessory("codo-90-32", "codo-normal-a-90", "elbow", 4),
          pipeSystemAccessory(
            "te-traves-32",
            "te-normal-32-mm-flujo-a-traves",
            "tee",
            2,
          ),
        ]),
        segment("partial-de-25", [
          pipeSystemAccessory("codo-90-25", "codo-normal-a-90", "elbow", 5),
          pipeSystemAccessory(
            "te-90-25",
            "te-normal-25-mm-flujo-a-90",
            "tee",
            1,
          ),
          pipeSystemAccessory("llave-25", "llave-esferica", "valve", 1),
        ]),
      ],
      segmentIds: ["partial-de-40", "partial-de-32", "partial-de-25"],
    });
  }

  if (accessorySet === "b3") {
    return resolveFixture({
      diameterBySegmentId: partialDiameterBySegmentId(),
      routeLengthMeters,
      segments: [
        segment("partial-de-40", [
          pipeSystemAccessory(
            "cupla-40-32",
            "cupla-reduccion-hh-40-a-32-mm",
            "other",
            1,
          ),
        ]),
        segment("partial-de-32", [
          pipeSystemAccessory("codo-90-32", "codo-normal-a-90", "elbow", 6),
          pipeSystemAccessory(
            "te-90-32",
            "te-normal-32-mm-flujo-a-90",
            "tee",
            1,
          ),
          pipeSystemAccessory(
            "te-traves-32",
            "te-normal-32-mm-flujo-a-traves",
            "tee",
            1,
          ),
          pipeSystemAccessory("llave-32", "llave-esferica", "valve", 1),
        ]),
      ],
      segmentIds: ["partial-de-40", "partial-de-32"],
    });
  }

  return resolveFixture({
    diameterBySegmentId: partialDiameterBySegmentId(),
    routeLengthMeters,
    segments: [
      segment("partial-de-32", [
        pipeSystemAccessory("codo-90-32", "codo-normal-a-90", "elbow", 6),
        pipeSystemAccessory("te-90-32", "te-normal-32-mm-flujo-a-90", "tee", 1),
        pipeSystemAccessory("llave-32", "llave-esferica", "valve", 1),
      ]),
    ],
    segmentIds: ["partial-de-32"],
  });
}

function partialDiameterBySegmentId() {
  return {
    "partial-de-25": diameter("sigas-25"),
    "partial-de-32": diameter("sigas-32"),
    "partial-de-40": diameter("sigas-40"),
  };
}

function calculateSharedRouteFixture() {
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
      connectionPoint: { x: 7, y: 0 },
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
      { id: "node-a", kind: "route", position: { x: 3, y: 0 } },
      { equipmentId: "appliance", id: "node-appliance", kind: "appliance" },
    ],
    segments: [
      {
        accessories: [manualAccessory("manual-a", 1, 1)],
        fromNodeId: "node-meter",
        id: "meter-a",
        toNodeId: "node-a",
      },
      {
        accessories: [manualAccessory("manual-b", 2, 1)],
        fromNodeId: "node-a",
        id: "a-terminal",
        toNodeId: "node-appliance",
      },
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

function resolveFixture(params: {
  diameterBySegmentId?: Record<string, PipeDiameterReference>;
  routeLengthMeters: number | null;
  segments: RouteSegment[];
  segmentIds: string[];
}) {
  const route: TechnicalRouteAccessoryRoute = {
    id: "route",
    physicalLengthMeters: params.routeLengthMeters,
    segmentIds: params.segmentIds,
    status: params.routeLengthMeters === null ? "unresolved" : "resolved",
  };

  return resolveTechnicalRouteAccessories({
    diameterBySegmentId: params.diameterBySegmentId,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    route,
    segments: params.segments,
  });
}

function segment(
  id: string,
  accessories: RouteSegmentAccessory[] = [],
): RouteSegment {
  return {
    accessories,
    fromNodeId: `${id}:from`,
    id,
    toNodeId: `${id}:to`,
  };
}

function manualAccessory(
  id: string,
  equivalentLengthMetersPerUnit: number,
  quantity: number,
): RouteSegmentAccessory {
  return {
    equivalentLengthMetersPerUnit,
    equivalentLengthSource: "manual",
    id,
    quantity,
    segmentId: "",
    type: "other",
  };
}

function pipeSystemAccessory(
  id: string,
  catalogCode: string | undefined,
  type: RouteSegmentAccessory["type"],
  quantity: number,
): RouteSegmentAccessory {
  return {
    catalogCode,
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id,
    quantity,
    segmentId: "",
    type,
  };
}

function diameter(id: string) {
  const value = DIAMETERS.find((item) => item.id === id) ?? null;

  assert(value, `Missing diameter ${id}.`);

  return value;
}

function assertContribution(
  resolution: TechnicalRouteAccessoryResolution,
  ownerSegmentId: string,
  accessoryId: string,
  diameterId: string,
  equivalentLengthMetersPerUnit: number,
  quantity = 1,
) {
  const contribution =
    resolution.contributions.find(
      (item) =>
        item.ownerSegmentId === ownerSegmentId &&
        item.accessoryId === accessoryId,
    ) ?? null;

  assert(contribution, `Missing contribution ${ownerSegmentId}:${accessoryId}.`);
  assertEqual(contribution.status, "resolved");
  assertEqual(contribution.diameter?.id, diameterId);
  assertClose(
    contribution.equivalentLengthMetersPerUnit,
    equivalentLengthMetersPerUnit,
  );
  assertClose(
    contribution.totalEquivalentLengthMeters,
    equivalentLengthMetersPerUnit * quantity,
  );
}

function verify(
  results: TechnicalRouteAccessoriesVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertResolved<T>(resolution: { status: string; value?: T }) {
  assert(
    resolution.status === "resolved",
    `Expected resolved, got ${resolution.status}`,
  );

  return resolution.value as T;
}

function assertNumber(value: number | null) {
  assert(value !== null, "Expected number, got null.");

  return value;
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
    JSON.stringify(
      {
        contrast: createPartialRouteAccessoryContrast(),
        results: runTechnicalRouteAccessoriesVerifications(),
      },
      null,
      2,
    ),
  );
}
