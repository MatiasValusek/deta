import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { SIGAS_DIAMETERS } from "@/lib/calculation/pipeSystems/sigas/sigasData";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type { TechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import type { TechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { movePhysicalRouteNode } from "@/lib/routing/physicalRouteEditing";
import {
  getConnectedApplianceEquipmentIds,
  resolveRouteSegments,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  ResolvedRouteSegment,
} from "@/lib/routing/types";
import { applySectionRouteHeightEdit } from "./routeHeightEditing";
import {
  countStandardTechnicalReviewGeometryPendingItems,
  createStandardTechnicalAxonometricView,
  createStandardTechnicalSectionView,
  type StandardTechnicalSectionView,
} from "./standardTechnicalViews";
import {
  createReviewCalculationReadiness,
  createRouteReviewState,
} from "@/lib/workbench/reviewStage";

export type StandardTechnicalViewsVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const PLAN_SCALE_METERS_PER_SOURCE_UNIT = 1;
const D20 = diameter(20);

export function runStandardTechnicalViewsVerifications() {
  const results: StandardTechnicalViewsVerificationResult[] = [];

  verify(
    results,
    "10.8E Revisar proyecta Planta/Cortes/Axo desde la misma routeNetwork",
    () => {
      const fixture = simpleReviewFixture();
      const views = createViews(fixture);

      assertSamePhysicalPolylineInPlan(fixture);
      assertSamePhysicalPolylineInSections(fixture, views.sectionAA);
      assertSamePhysicalPolylineInSections(fixture, views.sectionBB);
      assertSamePhysicalPolylineInAxonometric(fixture, views.axonometric);
      assertMeterRootRemainsConnected(fixture, views);
      assertRootSegmentIsNotChord(fixture, views);
      assertReadyForCalculation(fixture, views);
      assertXyAndZEditsReachEveryReviewView(fixture);
      assertMissingZBlocksCalculationButKeepsGeometryVisible(fixture);
    },
  );

  return results;
}

type SimpleReviewFixture = {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
};

type SimpleReviewViews = ReturnType<typeof createViews>;

function simpleReviewFixture(): SimpleReviewFixture {
  return {
    equipment: [
      equipment("meter", "M", "meter_regulator", "supply", 0, 0, 0),
      equipment("stove", "Cocina", "stove", "appliance", 5, 2, 1.1),
      equipment(
        "heater",
        "Calefactor",
        "space_heater",
        "appliance",
        -1,
        -2,
        0.7,
      ),
    ],
    network: {
      nodes: [
        { equipmentId: "meter", id: "M", kind: "supply" },
        { id: "J", kind: "route", position: { x: 2, y: 0, z: 0 } },
        { equipmentId: "stove", id: "A1", kind: "appliance" },
        { equipmentId: "heater", id: "A2", kind: "appliance" },
      ],
      segments: [
        {
          fromNodeId: "M",
          id: "M-J",
          toNodeId: "J",
          vertices: [
            { x: 0, y: 1, z: 0 },
            { x: 2, y: 1, z: 0 },
          ],
        },
        {
          fromNodeId: "J",
          id: "J-A1",
          toNodeId: "A1",
          vertices: [
            { x: 4, y: 0, z: 0 },
            { x: 4, y: 2, z: 1.1 },
          ],
        },
        {
          fromNodeId: "J",
          id: "J-A2",
          toNodeId: "A2",
          vertices: [
            { x: 2, y: -1, z: 0 },
            { x: -1, y: -1, z: 0.7 },
          ],
        },
      ],
    },
  };
}

function createViews(fixture: SimpleReviewFixture) {
  const result = calculateResult(fixture);
  const adoptedDiameterValidation = adoptedValidation(result);
  const inventory = emptyInventory();
  const sectionAA = createStandardTechnicalSectionView({
    adoptedDiameterValidation,
    axis: "x",
    equipment: fixture.equipment,
    id: "section-aa",
    inventory,
    network: fixture.network,
    result,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
    title: "Corte A-A",
  });
  const sectionBB = createStandardTechnicalSectionView({
    adoptedDiameterValidation,
    axis: "y",
    equipment: fixture.equipment,
    id: "section-bb",
    inventory,
    network: fixture.network,
    result,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
    title: "Corte B-B",
  });
  const axonometric = createStandardTechnicalAxonometricView({
    adoptedDiameterValidation,
    equipment: fixture.equipment,
    inventory,
    network: fixture.network,
    result,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
  });

  return {
    axonometric,
    sectionAA,
    sectionBB,
  };
}

function assertSamePhysicalPolylineInSections(
  fixture: SimpleReviewFixture,
  view: StandardTechnicalSectionView,
) {
  for (const resolved of resolveRouteSegments(fixture.network, fixture.equipment)) {
    const projected = sectionSegment(view, resolved.id);
    const projectedPlanPoints = projected.points
      .filter((point) => point.source !== "vertical")
      .map((point) => point.planPoint);

    assertPointPath(projectedPlanPoints, resolved.path);
  }
}

function assertSamePhysicalPolylineInPlan(fixture: SimpleReviewFixture) {
  for (const resolved of resolveRouteSegments(fixture.network, fixture.equipment)) {
    const storedSegment =
      fixture.network.segments.find((segment) => segment.id === resolved.id) ??
      null;

    assert(storedSegment, `Falta tramo ${resolved.id} en Planta.`);
    assertPointPath(
      [
        resolved.from,
        ...(storedSegment.vertices ?? []),
        resolved.to,
      ],
      resolved.path,
    );
  }
}

function assertSamePhysicalPolylineInAxonometric(
  fixture: SimpleReviewFixture,
  view: SimpleReviewViews["axonometric"],
) {
  for (const resolved of resolveRouteSegments(fixture.network, fixture.equipment)) {
    const projected = axonometricSegment(view, resolved.id);
    const projectedPlanPoints = projected.path
      .filter((point) => point.source !== "vertical")
      .map((point) => point.planPoint);

    assertPointPath(projectedPlanPoints, resolved.path);
    assert(projected.path.every((point) => point.projected), "Axo sin punto proyectado.");
  }
}

function assertMeterRootRemainsConnected(
  fixture: SimpleReviewFixture,
  views: SimpleReviewViews,
) {
  const meter = fixture.equipment.find((item) => item.id === "meter");

  assert(meter, "Falta medidor.");
  assertPoint(sectionSegment(views.sectionAA, "M-J").points[0]?.planPoint, meter.connectionPoint);
  assertPoint(sectionSegment(views.sectionBB, "M-J").points[0]?.planPoint, meter.connectionPoint);
  assertPoint(axonometricSegment(views.axonometric, "M-J").path[0]?.planPoint, meter.connectionPoint);
  assertEqual(
    getConnectedApplianceEquipmentIds(fixture.network, fixture.equipment).size,
    2,
  );
}

function assertRootSegmentIsNotChord(
  fixture: SimpleReviewFixture,
  views: SimpleReviewViews,
) {
  const resolvedRoot = resolvedSegment(fixture, "M-J");
  const axoRoot = axonometricSegment(views.axonometric, "M-J");

  assertEqual(resolvedRoot.path.length, 4);
  assertEqual(
    axoRoot.path.filter((point) => point.source !== "vertical").length,
    resolvedRoot.path.length,
  );
  assert(
    axoRoot.path.length > 2,
    "Axo no debe reemplazar el tramo raiz por una cuerda entre extremos.",
  );
}

function assertReadyForCalculation(
  fixture: SimpleReviewFixture,
  views: SimpleReviewViews,
) {
  const pendingCount = countStandardTechnicalReviewGeometryPendingItems({
    axonometricView: views.axonometric,
    sectionViews: [views.sectionAA, views.sectionBB],
  });
  const routeReviewState = createRouteReviewState({
    equipment: fixture.equipment,
    hasActiveProposal: false,
    hasRouteCycle: false,
    network: fixture.network,
    routeRestrictionCount: 0,
  });
  const readiness = createReviewCalculationReadiness({
    routeReviewState,
    technicalGeometryPendingCount: pendingCount,
  });

  assertEqual(pendingCount, 0);
  assertEqual(routeReviewState.canOpenReview, true);
  assertEqual(readiness.canContinueToCalculate, true);
  assertEqual(readiness.observationCount, 0);
}

function assertXyAndZEditsReachEveryReviewView(fixture: SimpleReviewFixture) {
  const xyEdit = movePhysicalRouteNode({
    equipment: fixture.equipment,
    network: fixture.network,
    nodeId: "J",
    point: { x: 2.5, y: 0.5 },
    tolerance: EPSILON,
  });

  assert(xyEdit.ok, xyEdit.ok ? "" : xyEdit.message);

  const zEdit = applySectionRouteHeightEdit({
    equipment: fixture.equipment,
    heightMeters: 0.85,
    network: xyEdit.network,
    target: {
      kind: "node",
      nodeId: "J",
    },
  });

  assert(zEdit.ok, zEdit.ok ? "" : zEdit.message);

  const editedFixture = {
    equipment: zEdit.equipment,
    network: zEdit.network,
  };
  const editedViews = createViews(editedFixture);
  const expectedJ = { x: 2.5, y: 0.5, z: 0.85 };

  assertPoint(resolvedSegment(editedFixture, "M-J").path.at(-1), expectedJ);
  assertPoint(sectionSegment(editedViews.sectionAA, "M-J").points.at(-1)?.planPoint, expectedJ);
  assertPoint(sectionSegment(editedViews.sectionBB, "M-J").points.at(-1)?.planPoint, expectedJ);
  assertPoint(axonometricNode(editedViews.axonometric, "J").point?.source, expectedJ);
  assertPoint(axonometricSegment(editedViews.axonometric, "M-J").path.at(-1)?.planPoint, expectedJ);
}

function assertMissingZBlocksCalculationButKeepsGeometryVisible(
  fixture: SimpleReviewFixture,
) {
  const pendingFixture = {
    equipment: fixture.equipment,
    network: {
      ...fixture.network,
      nodes: fixture.network.nodes.map((node) =>
        node.id === "J"
          ? {
              ...node,
              position: { x: 2, y: 0 },
            }
          : node,
      ),
    },
  };
  const pendingViews = createViews(pendingFixture);
  const pendingCount = countStandardTechnicalReviewGeometryPendingItems({
    axonometricView: pendingViews.axonometric,
    sectionViews: [pendingViews.sectionAA, pendingViews.sectionBB],
  });
  const routeReviewState = createRouteReviewState({
    equipment: pendingFixture.equipment,
    hasActiveProposal: false,
    hasRouteCycle: false,
    network: pendingFixture.network,
    routeRestrictionCount: 0,
  });
  const readiness = createReviewCalculationReadiness({
    routeReviewState,
    technicalGeometryPendingCount: pendingCount,
  });

  assert(pendingCount > 0, "La Z pendiente debe crear observacion.");
  assertEqual(routeReviewState.canOpenReview, true);
  assertEqual(readiness.canContinueToCalculate, false);
  assert(readiness.observationCount > 0, "La observacion debe mostrarse en Revisar.");
  assertPoint(
    sectionSegment(pendingViews.sectionAA, "M-J").points.at(-1)?.planPoint,
    { x: 2, y: 0 },
  );
  assertPoint(
    sectionSegment(pendingViews.sectionBB, "M-J").points.at(-1)?.planPoint,
    { x: 2, y: 0 },
  );
  assertPoint(
    axonometricSegment(pendingViews.axonometric, "M-J").path.at(-1)?.planPoint,
    { x: 2, y: 0 },
  );
}

function calculateResult(fixture: SimpleReviewFixture) {
  const result = calculateTechnicalTree({
    equipment: fixture.equipment,
    minSegmentLengthSource: EPSILON,
    network: fixture.network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
  });

  assertEqual(result.status, "valid");
  return result;
}

function adoptedValidation(
  result: TechnicalCalculationResult,
): TechnicalAdoptedDiameterValidation {
  return {
    invalidSegmentCount: 0,
    segments: result.segments.map((segment) => ({
      adoptedDiameter: D20,
      availableDiameters: [D20],
      decision: null,
      explanation: "fixture",
      provisionalDiameter: D20,
      reason: null,
      requiredDiameter: D20,
      selectableDiameters: [D20],
      segmentId: segment.segmentId,
      source: "required_default",
      status: "valid",
    })),
    status: "valid",
    unresolvedSegmentCount: 0,
  };
}

function emptyInventory(): TechnicalPhysicalAccessoryInventory {
  return {
    accessoryIdsByRouteId: {},
    accessoryIdsBySegmentId: {},
    items: [],
    pendingItems: [],
    status: "resolved",
  };
}

function sectionSegment(
  view: StandardTechnicalSectionView,
  segmentId: string,
) {
  const segment =
    view.projection.segments.find((item) => item.segmentId === segmentId) ??
    null;

  assert(segment, `Falta tramo ${segmentId} en ${view.id}.`);
  return segment;
}

function axonometricSegment(
  view: SimpleReviewViews["axonometric"],
  segmentId: string,
) {
  const segment = view.segments.find((item) => item.id === segmentId) ?? null;

  assert(segment, `Falta tramo ${segmentId} en Axo.`);
  return segment;
}

function axonometricNode(view: SimpleReviewViews["axonometric"], nodeId: string) {
  const node = view.nodes.find((item) => item.id === nodeId) ?? null;

  assert(node, `Falta nodo ${nodeId} en Axo.`);
  return node;
}

function resolvedSegment(
  fixture: SimpleReviewFixture,
  segmentId: string,
): ResolvedRouteSegment {
  const segment =
    resolveRouteSegments(fixture.network, fixture.equipment).find(
      (item) => item.id === segmentId,
    ) ?? null;

  assert(segment, `Falta tramo resuelto ${segmentId}.`);
  return segment;
}

function assertPointPath(actual: Point2D[], expected: Point2D[]) {
  assertEqual(actual.length, expected.length);

  actual.forEach((point, index) => {
    assertPoint(point, expected[index] as Point2D);
  });
}

function equipment(
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
    demandUnit: role === "appliance" ? "kcal_h" : undefined,
    demandValue: role === "appliance" ? 2500 : undefined,
    id,
    name,
    planBaseId: "plan",
    role,
    source: "manual",
    type,
  };
}

function diameter(externalDiameterMillimeters: number): PipeDiameterReference {
  const value = SIGAS_DIAMETERS.find(
    (item) => item.externalDiameterMillimeters === externalDiameterMillimeters,
  );

  assert(value, `Falta diametro SIGAS ${externalDiameterMillimeters}.`);
  return value;
}

function verify(
  results: StandardTechnicalViewsVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertPoint(actual: Point2D | null | undefined, expected: Point2D) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);

  if (expected.z !== undefined) {
    assertClose(actual.z, expected.z);
  }
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
  console.log(JSON.stringify(runStandardTechnicalViewsVerifications(), null, 2));
}
