import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  findTerminalStartNodeByEquipment,
  getConnectedApplianceEquipmentIds,
  getRouteNodeDegree,
  resolveRouteNodePosition,
  routeEquipmentTerminalSegmentId,
  routeEquipmentTerminalStartNodeId,
} from "@/lib/routing/network";
import {
  movePhysicalRouteNode,
  type PhysicalRouteEditResult,
} from "@/lib/routing/physicalRouteEditing";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  applySectionRouteHeightEdit,
  sectionRouteHeightTargetKey,
} from "@/lib/sections/routeHeightEditing";
import { createSectionRouteProjection } from "@/lib/sections/routeProjection";
import type { SectionRouteProjectionLink } from "@/lib/sections/routeProjection";

export type ReviewStageVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const PLAN_BASE_ID = "plan:review";
const SECTION_SCALE_METERS_PER_SOURCE_UNIT = 0.1;
const UPDATED_XY: Point2D = { x: 2.5, y: 0.4 };
const UPDATED_Z_METERS = 1.35;

export function runReviewStageVerifications() {
  const results: ReviewStageVerificationResult[] = [];

  verify(
    results,
    "10.8D Planta XY y Corte Z editan la misma routeNetwork sin duplicados",
    () => {
      const before = reviewStageFixture();
      const xyEdit = movePhysicalRouteNode({
        equipment: before.equipment,
        network: before.network,
        nodeId: "J",
        point: UPDATED_XY,
        tolerance: EPSILON,
      });

      assertEditOk(xyEdit);

      const afterXy = {
        equipment: before.equipment,
        network: xyEdit.network,
      };
      const projection = createReviewProjection(afterXy);
      const zTarget = projection.segments
        .flatMap((segment) => segment.points)
        .find(
          (point) => sectionRouteHeightTargetKey(point.heightTarget) === "node:J",
        )?.heightTarget;

      assert(zTarget, "Falta target de altura de Corte para el nodo J.");

      const zEdit = applySectionRouteHeightEdit({
        equipment: afterXy.equipment,
        heightMeters: UPDATED_Z_METERS,
        network: afterXy.network,
        target: zTarget,
      });

      assert(zEdit.ok, zEdit.ok ? "" : zEdit.message);

      const editedNode =
        zEdit.network.nodes.find((node) => node.id === "J") ?? null;
      const editedPoint = editedNode
        ? resolveRouteNodePosition(editedNode, equipmentIndex(zEdit.equipment))
        : null;

      assertPoint(editedPoint, {
        x: UPDATED_XY.x,
        y: UPDATED_XY.y,
        z: UPDATED_Z_METERS,
      });
      assertEqual(zEdit.network.nodes.length, before.network.nodes.length);
      assertEqual(zEdit.network.segments.length, before.network.segments.length);
      assertEqual(zEdit.equipment, before.equipment);
      assertSingleVisibleInstallation(zEdit.network, zEdit.equipment);
      assertProjectedEquipmentWithoutDuplicates(
        createReviewProjection({
          equipment: zEdit.equipment,
          network: zEdit.network,
        }),
      );
    },
  );

  return results;
}

type ReviewStageFixture = {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
};

function reviewStageFixture(): ReviewStageFixture {
  return {
    equipment: fixtureEquipment(),
    network: fixtureNetwork(),
  };
}

function createReviewProjection(fixture: ReviewStageFixture) {
  return createSectionRouteProjection({
    equipment: fixture.equipment,
    link: sectionProjectionLink(),
    network: fixture.network,
    sectionScaleMetersPerSourceUnit: SECTION_SCALE_METERS_PER_SOURCE_UNIT,
    toleranceSource: EPSILON,
  });
}

function fixtureEquipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: point(0, 0, 0),
      id: "meter",
      name: "M",
      planBaseId: PLAN_BASE_ID,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      bodyPoint: point(6, 1.35, 1),
      connectionPoint: point(6, 1, 1),
      demandUnit: "kcal_h",
      demandValue: 2500,
      id: "stove",
      name: "Cocina",
      planBaseId: PLAN_BASE_ID,
      role: "appliance",
      source: "manual",
      terminalConfig: {
        connectionHeightMeters: 1,
        heightStatus: "confirmed",
        lateralOffsetMeters: 1,
        outletSide: "left",
        requiresShutoffValve: true,
        terminalProfile: "generic_terminal",
        verticalDropMeters: 0,
      },
      type: "stove",
      wallAnchor: {
        distanceSource: 0.35,
        normal: { x: 0, y: 1 },
        orientationRadians: 0,
        pageNumber: null,
        referenceId: "wall:review",
        referenceKind: "reference_wall",
        source: "dxf",
        status: "anchored",
        wallPoint: point(6, 1, 1),
      },
    },
  ];
}

function fixtureNetwork(): ManualRouteNetwork {
  const terminalStartId = routeEquipmentTerminalStartNodeId(
    PLAN_BASE_ID,
    "stove",
  );

  return {
    nodes: [
      {
        equipmentId: "meter",
        id: "M",
        kind: "supply",
        origin: "manual",
      },
      {
        id: "J",
        kind: "route",
        origin: "manual",
        position: point(2, 0, 0),
      },
      {
        id: terminalStartId,
        kind: "route",
        origin: "manual",
        position: point(5, 1, 0),
      },
      {
        equipmentId: "stove",
        id: "A",
        kind: "appliance",
        origin: "manual",
      },
    ],
    segments: [
      {
        fromNodeId: "M",
        id: "M-J",
        origin: "manual",
        toNodeId: "J",
      },
      {
        fromNodeId: "J",
        id: "J-T",
        origin: "manual",
        toNodeId: terminalStartId,
        vertices: [point(5, 0, 0)],
      },
      {
        fromNodeId: terminalStartId,
        id: routeEquipmentTerminalSegmentId(PLAN_BASE_ID, "stove"),
        origin: "manual",
        toNodeId: "A",
      },
    ],
  };
}

function assertSingleVisibleInstallation(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  assertEqual(
    [...getConnectedApplianceEquipmentIds(network, equipment)].join(","),
    "stove",
  );
  assertEqual(getRouteNodeDegree(network, "A"), 1);
  assertEqual(Boolean(findTerminalStartNodeByEquipment(network, "stove")), true);
  assertEqual(
    network.nodes.filter((node) => node.equipmentId === "stove").length,
    1,
  );
  assertEqual(
    network.segments.filter(
      (segment) =>
        segment.id === routeEquipmentTerminalSegmentId(PLAN_BASE_ID, "stove"),
    ).length,
    1,
  );
}

function assertProjectedEquipmentWithoutDuplicates(
  projection: ReturnType<typeof createReviewProjection>,
) {
  const equipmentIds = projection.equipment.map((item) => item.equipmentId);
  const nodeIds = projection.equipment.map((item) => item.nodeId);

  assertEqual(projection.segments.length >= 2, true);
  assertEqual(equipmentIds.includes("meter"), true);
  assertEqual(equipmentIds.includes("stove"), true);
  assertEqual(new Set(equipmentIds).size, equipmentIds.length);
  assertEqual(new Set(nodeIds).size, nodeIds.length);
}

function sectionProjectionLink(): SectionRouteProjectionLink {
  return {
    id: "section-link-review",
    planEnd: { x: 7, y: 0 },
    planStart: { x: 0, y: 0 },
    registration: {
      positiveZSide: "left",
      referenceElevationMeters: 0,
      sectionEnd: { x: 170, y: 200 },
      sectionStart: { x: 100, y: 200 },
    },
  };
}

function equipmentIndex(equipment: WorkbenchEquipment[]) {
  return new Map(equipment.map((item) => [item.id, item]));
}

function point(x: number, y: number, z?: number): Point2D {
  return z === undefined ? { x, y } : { x, y, z };
}

function assertEditOk(
  result: PhysicalRouteEditResult,
): asserts result is Extract<PhysicalRouteEditResult, { ok: true }> {
  assert(result.ok, result.ok ? "" : result.message);
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
  results: ReviewStageVerificationResult[],
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
  console.log(JSON.stringify(runReviewStageVerifications(), null, 2));
}
