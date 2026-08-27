import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork, RouteNode } from "@/lib/routing/types";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "./technicalTree";

export type TechnicalRouteVerificationResult = {
  name: string;
  status: "passed";
};

export function runTechnicalRouteVerifications() {
  const results: TechnicalRouteVerificationResult[] = [];

  verify(results, "Caso A - recorrido lineal", () => {
    const result = calculateFixture({
      appliances: [
        { id: "appliance", name: "Artefacto", x: 5, y: 0 },
      ],
      routeNodes: [{ id: "node-a", x: 2, y: 0 }],
      segments: [
        { fromNodeId: "node-meter", id: "meter-a", toNodeId: "node-a" },
        { fromNodeId: "node-a", id: "a-appliance", toNodeId: "node-appliance" },
      ],
    });

    assertEqual(result.status, "valid");
    assertRoute(result, "appliance", ["meter-a", "a-appliance"], 5);
    assertGoverningRoute(result, "meter-a", "appliance", 5);
    assertGoverningRoute(result, "a-appliance", "appliance", 5);
  });

  verify(results, "Caso B - ramales con longitudes distintas", () => {
    const result = calculateBranchFixture();

    assertEqual(result.status, "valid");
    assertGoverningRoute(result, "common", "appliance-long", 8);
  });

  verify(results, "Caso C - tramo terminal usa recorrido completo", () => {
    const result = calculateBranchFixture();

    assertGoverningRoute(result, "long-branch", "appliance-long", 8);
    assertEqual(segmentById(result, "long-branch").segmentPhysicalLengthMeters, 6);
  });

  verify(
    results,
    "Caso C2 - tramos comparten recorrido desfavorable con Z",
    () => {
      const result = calculateFixture({
        appliances: [
          { id: "appliance-short-z", name: "Corto", x: 4, y: 0 },
          { id: "appliance-long-z", name: "Largo", x: 8, y: 0, z: 2 },
        ],
        routeNodes: [
          { id: "node-a-z", x: 2, y: 0 },
          { id: "node-b-z", x: 5, y: 0 },
        ],
        segments: [
          { fromNodeId: "node-meter", id: "common-z", toNodeId: "node-a-z" },
          { fromNodeId: "node-a-z", id: "shared-z", toNodeId: "node-b-z" },
          {
            fromNodeId: "node-b-z",
            id: "long-terminal-z",
            toNodeId: "node-appliance-long-z",
          },
          {
            fromNodeId: "node-a-z",
            id: "short-terminal-z",
            toNodeId: "node-appliance-short-z",
          },
        ],
      });

      assertEqual(result.status, "valid");
      assertRoute(
        result,
        "appliance-long-z",
        ["common-z", "shared-z", "long-terminal-z"],
        10,
      );
      assertGoverningRoute(result, "common-z", "appliance-long-z", 10);
      assertGoverningRoute(result, "shared-z", "appliance-long-z", 10);
      assertGoverningRoute(result, "long-terminal-z", "appliance-long-z", 10);
      assertClose(segmentById(result, "common-z").segmentPhysicalLengthMeters, 2);
      assertClose(segmentById(result, "shared-z").segmentPhysicalLengthMeters, 3);
      assertClose(
        segmentById(result, "long-terminal-z").segmentPhysicalLengthMeters,
        5,
      );
      assertClose(segmentById(result, "common-z").calculationLengthMeters, 10);
      assertClose(segmentById(result, "shared-z").calculationLengthMeters, 10);
      assertClose(
        segmentById(result, "long-terminal-z").calculationLengthMeters,
        10,
      );
      assertClose(
        segmentById(result, "short-terminal-z").calculationLengthMeters,
        4,
      );
    },
  );

  verify(results, "Caso D - empate deterministico", () => {
    const result = calculateTieFixture();
    const route = assertGoverningRoute(result, "common", "appliance-a", 5);

    assertEqual(route.tiedRouteIds.length, 2);
    assertEqual(route.tiedRouteIds[0], "technical-route:appliance-a");
    assertEqual(route.tiedRouteIds[1], "technical-route:appliance-b");
  });

  verify(results, "Caso E - escala pendiente", () => {
    const result = calculateFixture({
      appliances: [
        { id: "appliance", name: "Artefacto", x: 5, y: 0 },
      ],
      routeNodes: [],
      scaleMetersPerSourceUnit: null,
      segments: [
        {
          fromNodeId: "node-meter",
          id: "segment",
          toNodeId: "node-appliance",
        },
      ],
    });
    const segment = segmentById(result, "segment");

    assertEqual(result.status, "incomplete");
    assertEqual(result.technicalRoutes[0]?.status, "unresolved");
    assertEqual(segment.segmentPhysicalLengthMeters, null);
    assertEqual(segment.governingRouteResolution.status, "unresolved");
    assertEqual(segment.governingRoutePhysicalLengthMeters, null);
  });

  verify(results, "Caso F - terminal desconectado", () => {
    const result = calculateFixture({
      appliances: [
        { id: "appliance-connected", name: "Conectado", x: 5, y: 0 },
        {
          connected: false,
          id: "appliance-disconnected",
          name: "Desconectado",
          x: 9,
          y: 0,
        },
      ],
      routeNodes: [],
      segments: [
        {
          fromNodeId: "node-meter",
          id: "segment",
          toNodeId: "node-appliance-connected",
        },
      ],
    });

    assertEqual(result.status, "incomplete");
    assert(
      !result.technicalRoutes.some(
        (route) => route.terminalEquipmentId === "appliance-disconnected",
      ),
      "Disconnected equipment should not create a fictitious route.",
    );
    assert(
      result.issues.some(
        (issue) =>
          issue.code === "appliance_not_connected" &&
          issue.equipmentId === "appliance-disconnected",
      ),
      "Expected appliance_not_connected issue.",
    );
  });

  verify(results, "Caso G - determinismo", () => {
    const first = serializeRouteState(calculateTieFixture());
    const second = serializeRouteState(calculateTieFixture());

    assertEqual(JSON.stringify(first), JSON.stringify(second));
  });

  verify(results, "Parcial - Long. Inicial", () => {
    const result = calculatePartialFixture();
    const expectedLengths: Record<string, number> = {
      "1-A": 10.75,
      "A-2": 10.75,
      "A-B": 10.75,
      "B-3": 7.15,
      "B-C": 10.75,
      "C-4": 4.7,
      "C-M": 10.75,
    };
    const expectedFlows: Record<string, number> = {
      "1-A": 0.968,
      "A-2": 0.323,
      "A-B": 1.291,
      "B-3": 0.699,
      "B-C": 1.99,
      "C-4": 3.226,
      "C-M": 5.216,
    };

    assertEqual(result.status, "valid");

    for (const [segmentId, length] of Object.entries(expectedLengths)) {
      assertClose(
        segmentById(result, segmentId).governingRoutePhysicalLengthMeters,
        length,
      );
    }

    for (const [segmentId, flow] of Object.entries(expectedFlows)) {
      assertClose(segmentById(result, segmentId).accumulatedFlow, flow);
    }
  });

  return results;
}

function calculateBranchFixture() {
  return calculateFixture({
    appliances: [
      { id: "appliance-short", name: "Corto", x: 5, y: 0 },
      { id: "appliance-long", name: "Largo", x: 8, y: 0 },
    ],
    routeNodes: [{ id: "node-j", x: 2, y: 0 }],
    segments: [
      { fromNodeId: "node-meter", id: "common", toNodeId: "node-j" },
      {
        fromNodeId: "node-j",
        id: "short-branch",
        toNodeId: "node-appliance-short",
      },
      {
        fromNodeId: "node-j",
        id: "long-branch",
        toNodeId: "node-appliance-long",
      },
    ],
  });
}

function calculateTieFixture() {
  return calculateFixture({
    appliances: [
      { id: "appliance-a", name: "A", x: 5, y: 0 },
      { id: "appliance-b", name: "B", x: 2, y: 3 },
    ],
    routeNodes: [{ id: "node-j", x: 2, y: 0 }],
    segments: [
      { fromNodeId: "node-meter", id: "common", toNodeId: "node-j" },
      { fromNodeId: "node-j", id: "branch-a", toNodeId: "node-appliance-a" },
      { fromNodeId: "node-j", id: "branch-b", toNodeId: "node-appliance-b" },
    ],
  });
}

function calculatePartialFixture() {
  return calculateFixture({
    appliances: [
      { demandValue: 0.968, id: "appliance-1", name: "1", x: 10.75, y: 0 },
      { demandValue: 0.323, id: "appliance-2", name: "2", x: 7.35, y: 3.4 },
      { demandValue: 0.699, id: "appliance-3", name: "3", x: 5.45, y: 1.7 },
      { demandValue: 3.226, id: "appliance-4", name: "4", x: 3, y: 1.7 },
    ],
    routeNodes: [
      { id: "node-c", x: 3, y: 0 },
      { id: "node-b", x: 5.45, y: 0 },
      { id: "node-a", x: 7.35, y: 0 },
    ],
    segments: [
      { fromNodeId: "node-meter", id: "C-M", toNodeId: "node-c" },
      { fromNodeId: "node-c", id: "B-C", toNodeId: "node-b" },
      { fromNodeId: "node-b", id: "A-B", toNodeId: "node-a" },
      { fromNodeId: "node-a", id: "1-A", toNodeId: "node-appliance-1" },
      { fromNodeId: "node-a", id: "A-2", toNodeId: "node-appliance-2" },
      { fromNodeId: "node-b", id: "B-3", toNodeId: "node-appliance-3" },
      { fromNodeId: "node-c", id: "C-4", toNodeId: "node-appliance-4" },
    ],
  });
}

function calculateFixture(params: {
  appliances: Array<{
    connected?: boolean;
    demandValue?: number;
    id: string;
    name: string;
    x: number;
    y: number;
    z?: number;
  }>;
  routeNodes: Array<{ id: string; x: number; y: number; z?: number }>;
  scaleMetersPerSourceUnit?: number | null;
  segments: Array<{ fromNodeId: string; id: string; toNodeId: string }>;
}) {
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
    ...params.appliances.map((appliance) => ({
      connectionPoint: pointFromFixture(appliance),
      demandUnit: "m3_h" as const,
      demandValue: appliance.demandValue ?? 1,
      id: appliance.id,
      name: appliance.name,
      planBaseId: "plan",
      role: "appliance" as const,
      source: "manual" as const,
      type: "stove" as const,
    })),
  ];
  const applianceNodes: RouteNode[] = params.appliances
    .filter((appliance) => appliance.connected !== false)
    .map((appliance) => ({
      equipmentId: appliance.id,
      id: `node-${appliance.id}`,
      kind: "appliance" as const,
    }));
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: "meter", id: "node-meter", kind: "supply" },
      ...params.routeNodes.map((node) => ({
        id: node.id,
        kind: "route" as const,
        position: pointFromFixture(node),
      })),
      ...applianceNodes,
    ],
    segments: params.segments,
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

function pointFromFixture(point: { x: number; y: number; z?: number }) {
  return point.z === undefined
    ? { x: point.x, y: point.y }
    : { x: point.x, y: point.y, z: point.z };
}

function assertRoute(
  result: TechnicalCalculationResult,
  terminalEquipmentId: string,
  expectedSegmentIds: string[],
  expectedLengthMeters: number,
) {
  const route =
    result.technicalRoutes.find(
      (item) => item.terminalEquipmentId === terminalEquipmentId,
    ) ?? null;

  assert(route, `Missing route for ${terminalEquipmentId}.`);
  assertEqual(route.status, "resolved");
  assertEqual(route.segmentIds.join(">"), expectedSegmentIds.join(">"));
  assertClose(route.physicalLengthMeters, expectedLengthMeters);
}

function assertGoverningRoute(
  result: TechnicalCalculationResult,
  segmentId: string,
  expectedTerminalEquipmentId: string,
  expectedLengthMeters: number,
) {
  const segment = segmentById(result, segmentId);
  const route = assertResolved(segment.governingRouteResolution);

  assertEqual(route.terminalEquipmentId, expectedTerminalEquipmentId);
  assertClose(route.physicalLengthMeters, expectedLengthMeters);
  assertClose(segment.governingRoutePhysicalLengthMeters, expectedLengthMeters);

  return route;
}

function segmentById(result: TechnicalCalculationResult, segmentId: string) {
  const segment =
    result.segments.find((item) => item.segmentId === segmentId) ?? null;

  assert(segment, `Missing segment ${segmentId}.`);

  return segment;
}

function serializeRouteState(result: TechnicalCalculationResult) {
  return {
    routes: result.technicalRoutes,
    segments: result.segments.map((segment) => ({
      governingRoute: segment.governingRoute,
      segmentId: segment.segmentId,
      terminalRouteIds: segment.terminalRouteIds,
    })),
  };
}

function verify(
  results: TechnicalRouteVerificationResult[],
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
  console.log(JSON.stringify(runTechnicalRouteVerifications(), null, 2));
}
