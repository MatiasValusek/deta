import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { createTechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalAxonometricView } from "@/lib/calculation/technicalAxonometric";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import type { ManualConstraint } from "@/lib/constraints/types";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  applianceNodesAreTerminal,
  detectRouteCycle,
  getConnectedApplianceEquipmentIds,
  getRouteNodeDegree,
  hasDuplicateNodeIds,
  hasDuplicateSegmentIds,
  hasDuplicateSegments,
  hasRoutePath,
  hasSegmentsWithMissingEndpoints,
  hasZeroLengthSegments,
  resolveRouteSegments,
  routeSegmentPhysicalLengthMeters,
  routeSegmentPlanLegs,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  ResolvedRouteSegment,
} from "@/lib/routing/types";
import {
  DEFAULT_PHYSICAL_ROUTE_SNAP_OPTIONS,
  movePhysicalRouteNode,
  movePhysicalRouteVertex,
  relatedRouteSegmentIds,
  snapPhysicalRouteEditPoint,
} from "./physicalRouteEditing";
import {
  createSectionRouteProjection,
  type SectionRouteProjection,
  type SectionRouteProjectionLink,
} from "@/lib/sections/routeProjection";

export type PhysicalRouteEditingVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const SCALE_METERS_PER_SOURCE_UNIT = 1;
const SECTION_SCALE_METERS_PER_SOURCE_UNIT = 0.1;

export function runPhysicalRouteEditingVerifications() {
  const results: PhysicalRouteEditingVerificationResult[] = [];

  verify(
    results,
    "10.6D edicion y lectura fisica en planta conserva una sola routeNetwork",
    () => {
      const first = editedPhysicalRouteFixture();
      const second = editedPhysicalRouteFixture();

      assertEqual(
        JSON.stringify(physicalRouteEditingSnapshot(first)),
        JSON.stringify(physicalRouteEditingSnapshot(second)),
      );
      assertSingleValidNetwork(first.network, first.equipment);
      assertPhysicalEdits(first);
      assertSnapping(first);
      assertDownstreamAndLengths(first.result);
      assertAdoptedDiameters(first);
      assertSectionProjectionUsesEditedNetwork(first);
      assertAxonometricUsesEditedNetwork(first);
      assertRelatedRouteHighlight(first);
      assertNoUnexpectedPendingItems(first);
    },
  );

  return results;
}

type PhysicalRouteEditingFixture = ReturnType<
  typeof editedPhysicalRouteFixture
>;

function editedPhysicalRouteFixture() {
  const equipment = fixtureEquipment();
  const beforeNetwork = fixtureNetwork();
  const nodePoint = snapPhysicalRouteEditPoint({
    constraints: [],
    equipment,
    movingSelection: {
      kind: "node",
      nodeId: "B",
    },
    network: beforeNetwork,
    options: DEFAULT_PHYSICAL_ROUTE_SNAP_OPTIONS,
    point: { x: 6.5, y: 0.04 },
    tolerance: 0.1,
  });
  const movedNode = movePhysicalRouteNode({
    equipment,
    network: beforeNetwork,
    nodeId: "B",
    point: nodePoint,
    tolerance: EPSILON,
  });

  assert(movedNode.ok, movedNode.ok ? "" : movedNode.message);

  const vertexPoint = snapPhysicalRouteEditPoint({
    constraints: [],
    equipment,
    movingSelection: {
      kind: "vertex",
      segmentId: "B-A",
      vertexIndex: 0,
    },
    network: movedNode.network,
    options: {
      ...DEFAULT_PHYSICAL_ROUTE_SNAP_OPTIONS,
      structure: false,
      vertices: false,
    },
    point: { x: 6.48, y: 1.5 },
    tolerance: 0.1,
  });
  const movedVertex = movePhysicalRouteVertex({
    network: movedNode.network,
    point: vertexPoint,
    segmentId: "B-A",
    vertexIndex: 0,
  });

  assert(movedVertex.ok, movedVertex.ok ? "" : movedVertex.message);

  const network = movedVertex.network;
  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: EPSILON,
    network,
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
  const sectionProjection = createSectionRouteProjection({
    adoptedDiameterValidation,
    equipment,
    inventory,
    link: sectionProjectionLink(),
    network,
    result,
    sectionScaleMetersPerSourceUnit: SECTION_SCALE_METERS_PER_SOURCE_UNIT,
    toleranceSource: EPSILON,
  });
  const axonometricView = createTechnicalAxonometricView({
    adoptedDiameterValidation,
    equipment,
    inventory,
    network,
    result,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });

  return {
    adoptedDiameterValidation,
    axonometricView,
    beforeNetwork,
    equipment,
    inventory,
    network,
    nodePoint,
    result,
    sectionProjection,
    vertexPoint,
  };
}

function fixtureEquipment(): WorkbenchEquipment[] {
  return [
    equipment("meter", "M", "meter_regulator", "supply", 0, 0, 0),
    equipment("appliance-1", "1", "stove", "appliance", 11, -2, 1.2, 2500),
    equipment("appliance-2", "2", "stove", "appliance", 9, 3, 1.8, 2500),
    equipment(
      "appliance-3",
      "3",
      "space_heater",
      "appliance",
      6.5,
      2,
      0.3,
      2500,
    ),
    equipment("appliance-4", "4", "boiler", "appliance", 3, -2, 2, 2500),
  ];
}

function equipment(
  id: string,
  name: string,
  type: WorkbenchEquipment["type"],
  role: WorkbenchEquipment["role"],
  x: number,
  y: number,
  z: number,
  demandValue?: number,
): WorkbenchEquipment {
  return {
    connectionPoint: { x, y, z },
    demandUnit: role === "appliance" ? "kcal_h" : undefined,
    demandValue: role === "appliance" ? demandValue ?? 2500 : undefined,
    id,
    name,
    planBaseId: "plan",
    role,
    source: "manual",
    type,
  };
}

function fixtureNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      { equipmentId: "meter", id: "M", kind: "supply", origin: "manual" },
      {
        id: "C",
        kind: "route",
        origin: "manual",
        position: { x: 3, y: 0, z: 0.5 },
      },
      {
        id: "B",
        kind: "route",
        origin: "manual",
        position: { x: 6, y: 0, z: 1 },
      },
      {
        id: "A",
        kind: "route",
        origin: "manual",
        position: { x: 9, y: 0, z: 0.75 },
      },
      { equipmentId: "appliance-1", id: "1", kind: "appliance", origin: "manual" },
      { equipmentId: "appliance-2", id: "2", kind: "appliance", origin: "manual" },
      { equipmentId: "appliance-3", id: "3", kind: "appliance", origin: "manual" },
      { equipmentId: "appliance-4", id: "4", kind: "appliance", origin: "manual" },
    ],
    segments: [
      { fromNodeId: "M", id: "M-C", origin: "manual", toNodeId: "C" },
      { fromNodeId: "C", id: "C-B", origin: "manual", toNodeId: "B" },
      {
        fromNodeId: "B",
        id: "B-A",
        origin: "manual",
        toNodeId: "A",
        vertices: [
          { x: 6, y: 1.5, z: 1 },
          { x: 9, y: 1.5, z: 0.75 },
        ],
      },
      {
        fromNodeId: "A",
        id: "A-1",
        origin: "manual",
        toNodeId: "1",
        vertices: [
          { x: 9, y: -2, z: 1.2 },
          { x: 11, y: -2, z: 1.2 },
        ],
      },
      {
        fromNodeId: "A",
        id: "A-2",
        origin: "manual",
        toNodeId: "2",
        vertices: [{ x: 9, y: 3, z: 1.8 }],
      },
      {
        fromNodeId: "B",
        id: "B-3",
        origin: "manual",
        toNodeId: "3",
        vertices: [{ x: 6.5, y: 2, z: 0.3 }],
      },
      {
        fromNodeId: "C",
        id: "C-4",
        origin: "manual",
        toNodeId: "4",
        vertices: [{ x: 3, y: -2, z: 2 }],
      },
    ],
  };
}

function fixtureConstraints(): ManualConstraint[] {
  return [
    {
      active: true,
      id: "wall-y-1-5",
      origin: "manual",
      pageNumber: null,
      polygon: [
        { x: 5.5, y: 1.5 },
        { x: 10, y: 1.5 },
        { x: 10, y: 1.6 },
        { x: 5.5, y: 1.6 },
      ],
      source: "dxf",
      type: "hard_obstacle",
    },
  ];
}

function sectionProjectionLink(): SectionRouteProjectionLink {
  return {
    id: "section-link-10-6-d",
    planEnd: { x: 12, y: 0 },
    planStart: { x: 0, y: 0 },
    registration: {
      positiveZSide: "left",
      referenceElevationMeters: 0,
      sectionEnd: { x: 220, y: 200 },
      sectionStart: { x: 100, y: 200 },
    },
  };
}

function physicalRouteEditingSnapshot(fixture: PhysicalRouteEditingFixture) {
  return {
    axonometric: {
      nodes: fixture.axonometricView.nodes.map((node) => ({
        id: node.id,
        point: node.point,
      })),
      segments: fixture.axonometricView.segments.map((segment) => ({
        id: segment.id,
        physicalLengthMeters: segment.physicalLengthMeters,
        zDeltaMeters: segment.zDeltaMeters,
      })),
      status: fixture.axonometricView.status,
    },
    network: fixture.network,
    result: fixture.result.segments.map((segment) => ({
      downstreamApplianceIds: [...segment.downstreamApplianceIds].sort(),
      physicalLengthMeters: segment.segmentPhysicalLengthMeters,
      segmentId: segment.segmentId,
    })),
    section: {
      pendingItems: fixture.sectionProjection.pendingItems,
      segments: fixture.sectionProjection.segments.map((segment) => ({
        points: segment.points.map((point) => ({
          elevationMeters: point.elevationMeters,
          planPoint: point.planPoint,
          source: point.source,
        })),
        segmentId: segment.segmentId,
        status: segment.status,
      })),
      status: fixture.sectionProjection.status,
    },
  };
}

function assertSingleValidNetwork(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  assertEqual(nodeIds(network), "1,2,3,4,A,B,C,M");
  assertEqual(segmentIds(network), "A-1,A-2,B-3,B-A,C-4,C-B,M-C");
  assertEqual(hasDuplicateNodeIds(network), false);
  assertEqual(hasDuplicateSegmentIds(network), false);
  assertEqual(hasDuplicateSegments(network), false);
  assertEqual(hasSegmentsWithMissingEndpoints(network), false);
  assertEqual(hasZeroLengthSegments(network, equipment, EPSILON), false);
  assertEqual(detectRouteCycle(network), false);
  assertEqual(applianceNodesAreTerminal(network), true);
  assertEqual(getRouteNodeDegree(network, "A"), 3);
  assertEqual(getRouteNodeDegree(network, "B"), 3);
  assertEqual(getRouteNodeDegree(network, "C"), 3);

  const supplyNodeId = "M";

  for (const node of network.nodes) {
    assert(hasRoutePath(network, supplyNodeId, node.id), `${node.id} sin camino a M.`);
  }

  assertEqual(
    [...getConnectedApplianceEquipmentIds(network, equipment)].sort().join(","),
    "appliance-1,appliance-2,appliance-3,appliance-4",
  );
}

function assertPhysicalEdits(fixture: PhysicalRouteEditingFixture) {
  const beforeB = routeNode(fixture.beforeNetwork, "B");
  const afterB = routeNode(fixture.network, "B");
  const afterBranch = routeSegment(fixture.network, "B-A");

  assertPoint(beforeB.position, { x: 6, y: 0, z: 1 });
  assertPoint(afterB.position, { x: 6.5, y: 0, z: 1 });
  assertPoint(fixture.nodePoint, { x: 6.5, y: 0 });
  assertPoint(fixture.vertexPoint, { x: 6.5, y: 1.5 });
  assertPoint(afterBranch.vertices?.[0], { x: 6.5, y: 1.5, z: 1 });
  assertPoint(afterBranch.vertices?.[1], { x: 9, y: 1.5, z: 0.75 });
  assertOrthogonalPlanLegs(fixture);
  assertClose(segmentLength(fixture, "B-A"), 5.75);
}

function assertSnapping(fixture: PhysicalRouteEditingFixture) {
  const noSnap = snapPhysicalRouteEditPoint({
    constraints: fixtureConstraints(),
    equipment: fixture.equipment,
    movingSelection: {
      kind: "vertex",
      segmentId: "B-A",
      vertexIndex: 0,
    },
    network: fixture.beforeNetwork,
    options: {
      ...DEFAULT_PHYSICAL_ROUTE_SNAP_OPTIONS,
      enabled: false,
    },
    point: { x: 6.48, y: 1.52 },
    tolerance: 0.1,
  });

  assertPoint(noSnap, { x: 6.48, y: 1.52 });
  assertPoint(
    snapPhysicalRouteEditPoint({
      constraints: fixtureConstraints(),
      equipment: fixture.equipment,
      movingSelection: {
        kind: "vertex",
        segmentId: "B-A",
        vertexIndex: 0,
      },
      network: fixture.beforeNetwork,
      options: {
        ...DEFAULT_PHYSICAL_ROUTE_SNAP_OPTIONS,
        axes: false,
        orthogonal: false,
      },
      point: { x: 7.25, y: 1.52 },
      tolerance: 0.1,
    }),
    { x: 7.25, y: 1.5 },
  );
  assertPoint(fixture.nodePoint, { x: 6.5, y: 0 });
  assertPoint(fixture.vertexPoint, { x: 6.5, y: 1.5 });
}

function assertDownstreamAndLengths(result: TechnicalCalculationResult) {
  assertSegment(result, "M-C", [
    "appliance-1",
    "appliance-2",
    "appliance-3",
    "appliance-4",
  ], 3.5);
  assertSegment(result, "C-B", [
    "appliance-1",
    "appliance-2",
    "appliance-3",
  ], 4);
  assertSegment(result, "B-A", ["appliance-1", "appliance-2"], 5.75);
  assertSegment(result, "A-1", ["appliance-1"], 4.45);
  assertSegment(result, "A-2", ["appliance-2"], 4.05);
  assertSegment(result, "B-3", ["appliance-3"], 2.7);
  assertSegment(result, "C-4", ["appliance-4"], 3.5);
  assertClose(result.totals.physicalLengthMeters, 27.95);
}

function assertAdoptedDiameters(fixture: PhysicalRouteEditingFixture) {
  assertEqual(fixture.adoptedDiameterValidation.status, "valid");

  for (const segment of fixture.adoptedDiameterValidation.segments) {
    const adopted =
      segment.adoptedDiameter?.externalDiameterMillimeters ?? null;
    const required =
      segment.requiredDiameter?.externalDiameterMillimeters ?? null;

    assertEqual(segment.status, "valid");
    assert(
      adopted !== null && required !== null && adopted >= required,
      `Diametro adoptado menor al requerido en ${segment.segmentId}.`,
    );
  }
}

function assertSectionProjectionUsesEditedNetwork(
  fixture: PhysicalRouteEditingFixture,
) {
  const projection = fixture.sectionProjection;
  const branch = projectedSegment(projection, "B-A");
  const resolved = resolvedSegment(fixture, "B-A");
  const planPoints = branch.points.filter(
    (point) => point.source !== "vertical",
  );

  assertEqual(projection.status, "resolved");
  assertEqual(projection.pendingItems.length, 0);
  assertEqual(planPoints.length, resolved.path.length);

  planPoints.forEach((point, index) => {
    assertPoint(point.planPoint, resolved.path[index]);
  });

  assert(
    branch.points.some(
      (point) =>
        point.source === "vertex" &&
        almostEqual(point.planPoint.x, 6.5) &&
        almostEqual(point.planPoint.y, 1.5) &&
        almostEqual(point.elevationMeters, 1),
    ),
    "El corte no refleja el vertice editado de B-A.",
  );
  assert(
    branch.points.some(
      (point) =>
        point.source === "node" &&
        almostEqual(point.planPoint.x, 6.5) &&
        almostEqual(point.planPoint.y, 0) &&
        almostEqual(point.elevationMeters, 1),
    ),
    "El corte no refleja la derivacion B editada.",
  );
}

function assertAxonometricUsesEditedNetwork(
  fixture: PhysicalRouteEditingFixture,
) {
  const view = fixture.axonometricView;
  const nodeB = view.nodes.find((node) => node.id === "B") ?? null;
  const segmentBA = view.segments.find((segment) => segment.id === "B-A") ?? null;

  assertEqual(view.status, "resolved");
  assertEqual(view.pendingItems.length, 0);
  assert(nodeB?.point, "Falta B en axonometrica.");
  assert(segmentBA, "Falta B-A en axonometrica.");
  assertPoint(nodeB.point.source, { x: 6.5, y: 0, z: 1 });
  assertClose(segmentBA.physicalLengthMeters, segmentLength(fixture, "B-A"));
  assertClose(segmentBA.zDeltaMeters, -0.25);
}

function assertRelatedRouteHighlight(fixture: PhysicalRouteEditingFixture) {
  const segmentSelection = relatedRouteSegmentIds({
    equipment: fixture.equipment,
    network: fixture.network,
    result: fixture.result,
    selection: {
      kind: "segment",
      segmentId: "B-A",
    },
  });
  const terminalSelection = relatedRouteSegmentIds({
    equipment: fixture.equipment,
    network: fixture.network,
    result: fixture.result,
    selection: {
      equipmentId: "appliance-1",
      kind: "terminal",
      nodeId: "1",
    },
  });

  assert(segmentSelection.has("M-C"), "El resaltado del tramo no llega a M-C.");
  assert(segmentSelection.has("C-B"), "El resaltado del tramo no llega a C-B.");
  assert(segmentSelection.has("B-A"), "El resaltado del tramo no incluye B-A.");
  assert(
    segmentSelection.has("A-1") || segmentSelection.has("A-2"),
    "El resaltado del tramo no toma el recorrido gobernante aguas abajo.",
  );
  assertEqual(
    [...terminalSelection].sort().join(","),
    "A-1,B-A,C-B,M-C",
  );
}

function assertNoUnexpectedPendingItems(fixture: PhysicalRouteEditingFixture) {
  assertEqual(fixture.result.status, "valid");
  assertEqual(fixture.result.issues.length, 0);
  assertEqual(fixture.inventory.pendingItems.length, 0);
  assertEqual(fixture.sectionProjection.pendingItems.length, 0);
  assertEqual(fixture.axonometricView.pendingItems.length, 0);
}

function assertSegment(
  result: TechnicalCalculationResult,
  segmentId: string,
  downstreamApplianceIds: string[],
  physicalLengthMeters: number,
) {
  const segment =
    result.segments.find((candidate) => candidate.segmentId === segmentId) ??
    null;

  assert(segment, `Falta tramo tecnico ${segmentId}.`);
  assertEqual(
    [...segment.downstreamApplianceIds].sort().join(","),
    [...downstreamApplianceIds].sort().join(","),
  );
  assertClose(segment.segmentPhysicalLengthMeters, physicalLengthMeters);
  assertClose(segment.physicalLengthMeters, physicalLengthMeters);
}

function assertOrthogonalPlanLegs(fixture: PhysicalRouteEditingFixture) {
  for (const segment of resolveRouteSegments(fixture.network, fixture.equipment)) {
    for (const leg of routeSegmentPlanLegs(segment)) {
      assert(
        almostEqual(leg.from.x, leg.to.x) || almostEqual(leg.from.y, leg.to.y),
        `Tramo diagonal inesperado en ${segment.id}.`,
      );
    }
  }
}

function projectedSegment(
  projection: SectionRouteProjection,
  segmentId: string,
) {
  const segment =
    projection.segments.find((candidate) => candidate.segmentId === segmentId) ??
    null;

  assert(segment, `Falta segmento proyectado ${segmentId}.`);
  return segment;
}

function resolvedSegment(
  fixture: PhysicalRouteEditingFixture,
  segmentId: string,
) {
  const segment =
    resolveRouteSegments(fixture.network, fixture.equipment).find(
      (candidate) => candidate.id === segmentId,
    ) ?? null;

  assert(segment, `Falta segmento resuelto ${segmentId}.`);
  return segment;
}

function segmentLength(
  fixture: PhysicalRouteEditingFixture,
  segmentId: string,
) {
  return routeSegmentPhysicalLengthMeters(
    resolvedSegment(fixture, segmentId),
    SCALE_METERS_PER_SOURCE_UNIT,
  );
}

function routeNode(network: ManualRouteNetwork, nodeId: string) {
  const node = network.nodes.find((candidate) => candidate.id === nodeId);

  assert(node, `Falta nodo ${nodeId}.`);
  return node;
}

function routeSegment(network: ManualRouteNetwork, segmentId: string) {
  const segment = network.segments.find(
    (candidate) => candidate.id === segmentId,
  );

  assert(segment, `Falta segmento ${segmentId}.`);
  return segment;
}

function nodeIds(network: ManualRouteNetwork) {
  return network.nodes.map((node) => node.id).sort().join(",");
}

function segmentIds(network: ManualRouteNetwork) {
  return network.segments.map((segment) => segment.id).sort().join(",");
}

function assertPoint(
  actual: Point2D | ResolvedRouteSegment["from"] | undefined | null,
  expected: Point2D,
) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);

  if (expected.z !== undefined) {
    assertClose(actual.z, expected.z);
  }
}

function verify(
  results: PhysicalRouteEditingVerificationResult[],
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

function almostEqual(actual: number, expected: number) {
  return Math.abs(actual - expected) <= EPSILON;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(JSON.stringify(runPhysicalRouteEditingVerifications(), null, 2));
}
