import { createTechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import {
  confirmEquipmentTerminalConfig,
  createSuggestedEquipmentTerminalConfig,
} from "@/lib/equipment/terminalConfig";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  applianceNodesAreTerminal,
  getRouteNodeDegree,
  hasDuplicateSegmentIds,
  hasDuplicateSegments,
  hasZeroLengthSegments,
  resolveRouteSegments,
  routeSegmentPhysicalLengthMeters,
} from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { applyConfirmedEquipmentTerminalConnection } from "./terminalConnection";

export type TerminalConnectionVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const SCALE_METERS_PER_SOURCE_UNIT = 1;

export function runTerminalConnectionVerifications() {
  const results: TerminalConnectionVerificationResult[] = [];

  verify(
    results,
    "10.7C cocina genera subida desplazamiento llave y terminal sin duplicar piezas",
    () => {
      const fixture = terminalConnectionFixture();

      assertTerminalGeometry(fixture.network, fixture.equipment);
      assertEqual(hasDuplicateSegmentIds(fixture.network), false);
      assertEqual(hasDuplicateSegments(fixture.network), false);
      assertEqual(
        hasZeroLengthSegments(fixture.network, fixture.equipment, EPSILON),
        false,
      );
      assertEqual(applianceNodesAreTerminal(fixture.network), true);
      assertEqual(getRouteNodeDegree(fixture.network, "D"), 2);
      assertCalculationAndMaterials(fixture);
    },
  );

  return results;
}

type TerminalConnectionFixture = ReturnType<typeof terminalConnectionFixture>;

function terminalConnectionFixture() {
  const equipment = fixtureEquipment();
  const beforeNetwork = baseNetwork();
  const firstUpdate = applyConfirmedEquipmentTerminalConnection({
    equipment,
    equipmentId: "stove",
    network: beforeNetwork,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });

  assert(firstUpdate.ok, firstUpdate.ok ? "" : firstUpdate.message);

  const secondUpdate = applyConfirmedEquipmentTerminalConnection({
    equipment,
    equipmentId: "stove",
    network: firstUpdate.network,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });

  assert(secondUpdate.ok, secondUpdate.ok ? "" : secondUpdate.message);
  assertEqual(JSON.stringify(secondUpdate.network), JSON.stringify(firstUpdate.network));

  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: EPSILON,
    network: firstUpdate.network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });

  assertEqual(result.status, "valid");

  const inventory = createTechnicalPhysicalAccessoryInventory({
    result,
  });
  const equivalentVerificationBySegmentId =
    createTechnicalEquivalentAccessoryVerification({
      inventory,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      result,
    });
  const adoptedDiameterValidation = createTechnicalAdoptedDiameterValidation({
    equivalentVerificationBySegmentId,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    result,
  });
  const materialTakeoff = createTechnicalMaterialTakeoff({
    adoptedDiameterValidation,
    physicalAccessoryInventory: inventory,
    result,
  });

  return {
    adoptedDiameterValidation,
    beforeNetwork,
    equipment,
    inventory,
    materialTakeoff,
    network: firstUpdate.network,
    result,
  };
}

function fixtureEquipment(): WorkbenchEquipment[] {
  const terminalConfig = confirmEquipmentTerminalConfig({
    ...createSuggestedEquipmentTerminalConfig("stove"),
    lateralOffsetMeters: 0.5,
    outletSide: "right",
  });

  return [
    {
      connectionPoint: { x: 0, y: -1, z: 0 },
      id: "meter",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      bodyPoint: { x: 2, y: 0.35, z: 0.25 },
      connectionPoint: { x: 2, y: 0, z: 0.25 },
      demandUnit: "kcal_h",
      demandValue: 8500,
      id: "stove",
      name: "Cocina",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      terminalConfig,
      type: "stove",
      wallAnchor: {
        distanceSource: 0.35,
        normal: { x: 0, y: 1 },
        orientationRadians: 0,
        pageNumber: null,
        referenceId: "wall:fixture",
        referenceKind: "reference_wall",
        source: "dxf",
        status: "anchored",
        wallPoint: { x: 2, y: 0, z: 0.25 },
      },
    },
  ];
}

function baseNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      {
        equipmentId: "meter",
        id: "M",
        kind: "supply",
        origin: "manual",
      },
      {
        id: "D",
        kind: "route",
        origin: "manual",
        position: { x: 2.5, y: -1, z: 0 },
      },
      {
        equipmentId: "stove",
        id: "1",
        kind: "appliance",
        origin: "manual",
      },
    ],
    segments: [
      {
        fromNodeId: "M",
        id: "M-D",
        origin: "manual",
        toNodeId: "D",
      },
      {
        fromNodeId: "D",
        id: "D-1",
        origin: "manual",
        toNodeId: "1",
      },
    ],
  };
}

function assertTerminalGeometry(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  const terminalSegment =
    network.segments.find((segment) => segment.id === "D-1") ?? null;
  const terminal = resolveRouteSegments(network, equipment).find(
    (segment) => segment.id === "D-1",
  );

  assert(terminalSegment, "Falta segmento terminal.");
  assert(terminal, "No se resolvio el segmento terminal.");
  assertEqual(terminalSegment.vertices?.length, 2);
  assertPoint(terminal.path[0], { x: 2.5, y: -1, z: 0 });
  assertPoint(terminal.path[1], { x: 2.5, y: -1, z: 0.25 });
  assertPoint(terminal.path[2], { x: 2.5, y: 0, z: 0.25 });
  assertPoint(terminal.path[3], { x: 2, y: 0, z: 0.25 });
  assertClose(
    routeSegmentPhysicalLengthMeters(
      terminal,
      SCALE_METERS_PER_SOURCE_UNIT,
    ),
    1.75,
  );
  assertEqual(terminalSegment.accessories?.length, 2);
  assertEqual(
    terminalSegment.accessories
      ?.map((accessory) => `${accessory.type}:${accessory.catalogFamilyId}`)
      .sort()
      .join(","),
    "elbow:codo-90-rosca-hembra,valve:llave-esferica",
  );
  assertEqual(
    terminalSegment.accessories
      ?.map((accessory) => accessory.id)
      .sort()
      .join(","),
    "route-terminal:stove:terminal,route-terminal:stove:valve",
  );
}

function assertCalculationAndMaterials(fixture: TerminalConnectionFixture) {
  assertEqual(fixture.result.status, "valid");
  assertEqual(fixture.result.issues.length, 0);
  assertEqual(fixture.inventory.status, "resolved");
  assertEqual(fixture.inventory.pendingItems.length, 0);
  assertEqual(fixture.inventory.items.length, 2);
  assertEqual(fixture.materialTakeoff.status, "resolved");
  assertEqual(fixture.materialTakeoff.pendingSummary.total, 0);
  assertEqual(fixture.materialTakeoff.physicalMaterialQuantities.accessoryQuantity, 2);
  assertEqual(
    fixture.materialTakeoff.accessoryItems
      .map((item) => `${item.accessoryKind}:${item.quantity}`)
      .sort()
      .join(","),
    "rh_elbow:1,valve:1",
  );

  for (const item of fixture.inventory.items) {
    assertEqual(item.source, "route_accessory");
    assertEqual(item.segmentIds.join(","), "D-1");
    assertEqual(item.routeUses.length, 1);
    assertEqual(item.routeUses[0]?.segmentIds.join(","), "D-1");
    assertUnique(item.routeUses.map(routeUseKey));
    assertUnique(item.sourceIds);
  }

  assertUnique(
    fixture.materialTakeoff.accessoryItems.flatMap((item) => item.sourceIds),
  );
}

function routeUseKey(
  routeUse: TerminalConnectionFixture["inventory"]["items"][number]["routeUses"][number],
) {
  return `${routeUse.routeId}:${routeUse.segmentIds.join(">")}`;
}

function assertPoint(actual: Point2D | null | undefined, expected: Point2D) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);

  if (expected.z !== undefined) {
    assertClose(actual.z, expected.z);
  }
}

function verify(
  results: TerminalConnectionVerificationResult[],
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

function assertUnique(values: string[]) {
  assertEqual(new Set(values).size, values.length);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(JSON.stringify(runTerminalConnectionVerifications(), null, 2));
}
