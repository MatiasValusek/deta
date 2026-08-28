import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import { SIGAS_DIAMETERS } from "@/lib/calculation/pipeSystems/sigas/sigasData";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { TechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import type { TechnicalPhysicalAccessoryInventory } from "./technicalPhysicalAccessories";
import { createTechnicalAxonometricView } from "./technicalAxonometric";

export type TechnicalAxonometricVerificationResult = {
  name: string;
  status: "passed";
};

const D20 = diameter(20);
const D25 = diameter(25);
const D32 = diameter(32);

export function runTechnicalAxonometricVerifications() {
  const results: TechnicalAxonometricVerificationResult[] = [];

  verify(
    results,
    "10.5H red ramificada estable con ramas y alturas",
    () => {
      const fixture = branchedAxonometricFixture();
      const first = createTechnicalAxonometricView(fixture);
      const second = createTechnicalAxonometricView(fixture);

      assertEqual(JSON.stringify(first), JSON.stringify(second));
      assertEqual(first.status, "resolved");
      assertEqual(first.nodes.length, fixture.network.nodes.length);
      assertEqual(first.segments.length, fixture.network.segments.length);
      assertEqual(node(first, "M").label, "M");
      assertEqual(node(first, "C").kind, "derivation");
      assertEqual(node(first, "B").kind, "derivation");
      assertEqual(node(first, "A").kind, "derivation");
      assertEqual(segment(first, "s-m-c").adoptedDiameterLabel, "Ø32");
      assertEqual(segment(first, "s-c-b").adoptedDiameterLabel, "Ø25");
      assertEqual(segment(first, "s-c-cook").adoptedDiameterLabel, "Ø20");
      assertClose(segment(first, "s-m-c").zDeltaMeters, 1);
      assertClose(segment(first, "s-c-b").zDeltaMeters, 1);
      assertClose(segment(first, "s-b-a").zDeltaMeters, -1.5);
      assertClose(segment(first, "s-a-boiler").zDeltaMeters, 2);
      assertEqual(first.accessories.length, 1);
      assertEqual(first.accessories[0]?.status, "resolved");
    },
  );

  return results;
}

function branchedAxonometricFixture() {
  const equipment: WorkbenchEquipment[] = [
    makeEquipment("meter", "M", "meter_regulator", "supply", 0, 0, 0),
    makeEquipment("cook", "Cocina", "stove", "appliance", 4, 3, 1.5),
    makeEquipment(
      "heater",
      "Calefactor",
      "space_heater",
      "appliance",
      8,
      -3,
      0.5,
    ),
    makeEquipment("boiler", "Caldera", "boiler", "appliance", 12, 3, 2.5),
    makeEquipment("dryer", "Secarropas", "gas_dryer", "appliance", 12, -3, 1.5),
  ];
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: "meter", id: "M", kind: "supply" },
      { id: "C", kind: "route", position: { x: 4, y: 0, z: 1 } },
      { id: "B", kind: "route", position: { x: 8, y: 1, z: 2 } },
      { id: "A", kind: "route", position: { x: 12, y: 0, z: 0.5 } },
      { equipmentId: "cook", id: "node-cook", kind: "appliance" },
      { equipmentId: "heater", id: "node-heater", kind: "appliance" },
      { equipmentId: "boiler", id: "node-boiler", kind: "appliance" },
      { equipmentId: "dryer", id: "node-dryer", kind: "appliance" },
    ],
    segments: [
      { fromNodeId: "M", id: "s-m-c", toNodeId: "C" },
      { fromNodeId: "C", id: "s-c-b", toNodeId: "B" },
      { fromNodeId: "B", id: "s-b-a", toNodeId: "A" },
      { fromNodeId: "C", id: "s-c-cook", toNodeId: "node-cook" },
      { fromNodeId: "B", id: "s-b-heater", toNodeId: "node-heater" },
      { fromNodeId: "A", id: "s-a-boiler", toNodeId: "node-boiler" },
      { fromNodeId: "A", id: "s-a-dryer", toNodeId: "node-dryer" },
    ],
  };
  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: 1,
  });

  assertEqual(result.status, "valid");

  return {
    adoptedDiameterValidation: adoptedValidation({
      "s-a-boiler": D20,
      "s-a-dryer": D20,
      "s-b-a": D25,
      "s-b-heater": D20,
      "s-c-b": D25,
      "s-c-cook": D20,
      "s-m-c": D32,
    }),
    equipment,
    inventory: physicalAccessoryInventory(),
    network,
    result,
    scaleMetersPerSourceUnit: 1,
  };
}

function makeEquipment(
  id: string,
  name: string,
  type: WorkbenchEquipment["type"],
  role: WorkbenchEquipment["role"],
  x: number,
  y: number,
  z: number,
): WorkbenchEquipment {
  return {
    connectionPoint: { x, y, z },
    demandUnit: role === "appliance" ? "m3_h" : undefined,
    demandValue: role === "appliance" ? 0.6 : undefined,
    id,
    name,
    planBaseId: "plan",
    role,
    source: "manual",
    type,
  };
}

function adoptedValidation(
  diametersBySegmentId: Record<string, PipeDiameterReference>,
): TechnicalAdoptedDiameterValidation {
  const segments = Object.entries(diametersBySegmentId)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([segmentId, diameter]) => ({
      adoptedDiameter: diameter,
      availableDiameters: [D20, D25, D32],
      decision: null,
      explanation: "fixture",
      provisionalDiameter: diameter,
      reason: null,
      requiredDiameter: diameter,
      selectableDiameters: [diameter],
      segmentId,
      source: "required_default" as const,
      status: "valid" as const,
    }));

  return {
    invalidSegmentCount: 0,
    segments,
    status: "valid",
    unresolvedSegmentCount: 0,
  };
}

function physicalAccessoryInventory(): TechnicalPhysicalAccessoryInventory {
  return {
    accessoryIdsByRouteId: {
      "technical-route:boiler": ["physical-tee-b"],
      "technical-route:dryer": ["physical-tee-b"],
    },
    accessoryIdsBySegmentId: {
      "s-b-a": ["physical-tee-b"],
      "s-c-b": ["physical-tee-b"],
    },
    items: [
      {
        catalogCode: "tee-25",
        catalogFamilyId: "family-tee",
        diameters: [
          {
            diameter: D25,
            role: "single",
            segmentId: "s-b-a",
          },
        ],
        id: "physical-tee-b",
        kind: "tee",
        label: "Tee",
        nodeId: "B",
        position: null,
        routeUses: [
          {
            equivalentLengthMeters: 0.7,
            routeId: "technical-route:boiler",
            segmentIds: ["s-c-b", "s-b-a"],
            status: "resolved",
            traversalKind: null,
          },
          {
            equivalentLengthMeters: 0.7,
            routeId: "technical-route:dryer",
            segmentIds: ["s-c-b", "s-b-a"],
            status: "resolved",
            traversalKind: null,
          },
        ],
        segmentIds: ["s-b-a", "s-c-b"],
        source: "route_accessory",
        sourceIds: ["s-b-a:tee"],
        status: "resolved",
      },
    ],
    pendingItems: [],
    status: "resolved",
  };
}

function diameter(externalDiameterMillimeters: number): PipeDiameterReference {
  const value = SIGAS_DIAMETERS.find(
    (item) => item.externalDiameterMillimeters === externalDiameterMillimeters,
  );

  assert(value, `Falta diametro SIGAS ${externalDiameterMillimeters}.`);
  return value;
}

function node(
  view: ReturnType<typeof createTechnicalAxonometricView>,
  id: string,
) {
  const item = view.nodes.find((candidate) => candidate.id === id) ?? null;

  assert(item, `Falta nodo ${id}.`);
  return item;
}

function segment(
  view: ReturnType<typeof createTechnicalAxonometricView>,
  id: string,
) {
  const item = view.segments.find((candidate) => candidate.id === id) ?? null;

  assert(item, `Falta tramo ${id}.`);
  return item;
}

function verify(
  results: TechnicalAxonometricVerificationResult[],
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
      Math.abs(actual - expected) <= 0.000001,
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
  console.log(JSON.stringify(runTechnicalAxonometricVerifications(), null, 2));
}
