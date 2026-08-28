import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { createTechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  resolveRouteSegments,
  routeSegmentPhysicalLengthMeters,
} from "@/lib/routing/network";
import {
  automaticAccessoryId,
  type AccessoryProposal,
} from "@/lib/routing/routeAccessoryProposals";
import type {
  ManualRouteNetwork,
  ResolvedRouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import {
  createSectionRouteProjection,
  type SectionRouteProjectedPointSource,
  type SectionRouteProjection,
  type SectionRouteProjectionLink,
} from "./routeProjection";

export type SectionRouteProjectionVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const PLAN_SCALE_METERS_PER_SOURCE_UNIT = 1;
const SECTION_SCALE_METERS_PER_SOURCE_UNIT = 0.1;
const TERMINAL_VALVE_PROPOSAL_ID = "terminal-valve";
const TERMINAL_RH_PROPOSAL_ID = "terminal-rh";

export function runSectionRouteProjectionVerifications() {
  const results: SectionRouteProjectionVerificationResult[] = [];

  verify(
    results,
    "10.6B corte sincronizado con routeNetwork fisica confirmada",
    () => {
      const first = sectionRouteProjectionFixture();
      const second = sectionRouteProjectionFixture();

      assertEqual(
        JSON.stringify(sectionProjectionSnapshot(first)),
        JSON.stringify(sectionProjectionSnapshot(second)),
      );
      assertTechnicalInputs(first);
      assertResolvedProjection(first.projection);
      assertSameNetworkSegments(first);
      assertTerminalBranchProjection(first);
      assertProjectedPhysicalAccessories(first);
      assertProjectedTerminalEquipment(first);
      assertMissingRegistrationIsPending(first);
      assertMissingScaleIsPending(first);
      assertMissingZIsPending(first);
    },
  );

  return results;
}

type SectionRouteProjectionFixture = ReturnType<
  typeof sectionRouteProjectionFixture
>;

function sectionRouteProjectionFixture() {
  const equipment = terminalBranchEquipment();
  const network = confirmedPhysicalRouteNetwork();
  const accessoryProposals = terminalBranchAccessoryProposals();
  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: EPSILON,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
  });

  assertEqual(result.status, "valid");

  const inventory = createTechnicalPhysicalAccessoryInventory({
    accessoryProposals,
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
  const link = sectionProjectionLink();
  const projection = createSectionRouteProjection({
    adoptedDiameterValidation,
    equipment,
    inventory,
    link,
    network,
    result,
    sectionScaleMetersPerSourceUnit: SECTION_SCALE_METERS_PER_SOURCE_UNIT,
    toleranceSource: EPSILON,
  });

  return {
    accessoryProposals,
    adoptedDiameterValidation,
    equipment,
    inventory,
    link,
    network,
    projection,
    result,
  };
}

function terminalBranchEquipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: { x: 0, y: 0, z: 0 },
      id: "meter",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 6, y: 0, z: 0 },
      demandUnit: "kcal_h",
      demandValue: 2500,
      id: "appliance-main",
      name: "Artefacto troncal",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "space_heater",
    },
    {
      connectionPoint: { x: 4.6, y: 1.4, z: 1.2 },
      demandUnit: "kcal_h",
      demandValue: 3000,
      id: "appliance-terminal",
      name: "Artefacto terminal",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "stove",
    },
  ];
}

function confirmedPhysicalRouteNetwork(): ManualRouteNetwork {
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
        position: { x: 2, y: 0, z: 0 },
      },
      {
        equipmentId: "appliance-main",
        id: "2",
        kind: "appliance",
        origin: "manual",
      },
      {
        equipmentId: "appliance-terminal",
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
        vertices: [{ x: 1, y: 0 }],
      },
      {
        fromNodeId: "D",
        id: "D-2",
        origin: "manual",
        toNodeId: "2",
        vertices: [{ x: 3, y: 0 }],
      },
      {
        accessories: [terminalValveAccessory(), terminalRhAccessory()],
        fromNodeId: "D",
        id: "D-1",
        origin: "manual",
        toNodeId: "1",
        vertices: [
          { x: 2, y: 1.4 },
          { x: 4.2, y: 1.4 },
        ],
      },
    ],
  };
}

function terminalValveAccessory(): RouteSegmentAccessory {
  return {
    catalogFamilyId: "llave-esferica",
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id: automaticAccessoryId(TERMINAL_VALVE_PROPOSAL_ID),
    origin: "user_confirmed",
    quantity: 1,
    segmentId: "D-1",
    type: "valve",
  };
}

function terminalRhAccessory(): RouteSegmentAccessory {
  return {
    catalogFamilyId: "codo-90-rosca-hembra",
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id: automaticAccessoryId(TERMINAL_RH_PROPOSAL_ID),
    origin: "user_confirmed",
    quantity: 1,
    segmentId: "D-1",
    type: "elbow",
  };
}

function terminalBranchAccessoryProposals(): AccessoryProposal[] {
  return [
    {
      confidence: "high",
      domainAccessory: {
        catalogFamilyId: "llave-esferica",
        equivalentLengthSource: "pipe_system",
        type: "valve",
      },
      evidence: {
        angleClassification: "colinear",
        degree: 1,
        incidentNodeIds: ["D"],
      },
      geometryKey: "fixture:10.6B:terminal-valve",
      id: TERMINAL_VALVE_PROPOSAL_ID,
      incidentSegmentIds: ["D-1"],
      kind: "straight",
      nodeId: "1",
      ownerResolution: {
        candidateSegmentIds: ["D-1"],
        ownerSegmentId: "D-1",
        status: "unambiguous",
      },
      position: { x: 4.25, y: 1.4, z: 1.2 },
      reason: "Llave de paso terminal confirmada en fixture 10.6B.",
      state: "confirmed",
    },
    {
      confidence: "high",
      domainAccessory: {
        catalogFamilyId: "codo-90-rosca-hembra",
        equivalentLengthSource: "pipe_system",
        type: "elbow",
      },
      evidence: {
        angleClassification: "terminal",
        degree: 1,
        incidentNodeIds: ["D"],
      },
      geometryKey: "fixture:10.6B:terminal-rh",
      id: TERMINAL_RH_PROPOSAL_ID,
      incidentSegmentIds: ["D-1"],
      kind: "terminal",
      nodeId: "1",
      ownerResolution: {
        candidateSegmentIds: ["D-1"],
        ownerSegmentId: "D-1",
        status: "unambiguous",
      },
      position: { x: 4.6, y: 1.4, z: 1.2 },
      reason: "Fitting terminal/RH confirmado en fixture 10.6B.",
      state: "confirmed",
    },
  ];
}

function sectionProjectionLink(): SectionRouteProjectionLink {
  return {
    id: "section-link-plan-to-section",
    planEnd: { x: 6, y: 0 },
    planStart: { x: 0, y: 0 },
    registration: {
      positiveZSide: "left",
      referenceElevationMeters: 0,
      sectionEnd: { x: 160, y: 200 },
      sectionStart: { x: 100, y: 200 },
    },
  };
}

function assertTechnicalInputs(fixture: SectionRouteProjectionFixture) {
  assertEqual(fixture.result.status, "valid");
  assertEqual(fixture.inventory.status, "resolved");
  assertEqual(fixture.adoptedDiameterValidation.status, "valid");
  assertEqual(fixture.projection.pendingItems.length, 0);
  assertEqual(
    routeSegmentIds(fixture.network).join(","),
    "D-1,D-2,M-D",
  );
  assertEqual(
    resolveRouteSegments(fixture.network, fixture.equipment)
      .map((segment) => segment.id)
      .sort()
      .join(","),
    "D-1,D-2,M-D",
  );
}

function assertResolvedProjection(projection: SectionRouteProjection) {
  assertEqual(projection.status, "resolved");
  assertEqual(projection.pendingItems.length, 0);
  assertEqual(
    projection.segments.map((segment) => segment.segmentId).join(","),
    "D-1,D-2,M-D",
  );
  assertEqual(projection.accessories.length, 2);
  assertEqual(projection.equipment.length, 3);
}

function assertSameNetworkSegments(fixture: SectionRouteProjectionFixture) {
  assertEqual(
    fixture.projection.segments
      .map((segment) => segment.segmentId)
      .sort()
      .join(","),
    routeSegmentIds(fixture.network).join(","),
  );

  const projectedBranch = projectedSegment(fixture.projection, "D-1");
  const physicalBranch = resolvedSegment(fixture, "D-1");
  const projectedPlanPoints = projectedBranch.points.filter(
    (point) => point.source !== "vertical",
  );

  assertEqual(projectedPlanPoints.length, physicalBranch.path.length);

  projectedPlanPoints.forEach((point, index) => {
    assertPoint(point.planPoint, physicalBranch.path[index] as Point2D);
  });
}

function assertTerminalBranchProjection(
  fixture: SectionRouteProjectionFixture,
) {
  const branch = projectedSegment(fixture.projection, "D-1");

  assertEqual(branch.status, "resolved");
  assertEqual(branch.fromNodeId, "D");
  assertEqual(branch.toNodeId, "1");
  assertEqual(branch.pendingReason, null);
  assertEqual(branch.adoptedDiameter?.externalDiameterMillimeters, 20);
  assertEqual(branch.adoptedDiameterLabel, diameterLabel(20));
  assertClose(branch.physicalLengthMeters, 5.2);
  assertEqual(
    branch.points.map((point) => point.source).join(","),
    "node,vertical,vertex,vertex,connection",
  );

  assertProjectionPoint(branch.points[0], "node", {
    elevationMeters: 0,
    planPoint: { x: 2, y: 0 },
    sectionPoint: { x: 120, y: 200 },
    t: 1 / 3,
  });
  assertProjectionPoint(branch.points[1], "vertical", {
    elevationMeters: 1.2,
    planPoint: { x: 2, y: 0 },
    sectionPoint: { x: 120, y: 212 },
    t: 1 / 3,
  });
  assertProjectionPoint(branch.points[3], "vertex", {
    elevationMeters: 1.2,
    planPoint: { x: 4.2, y: 1.4 },
    sectionPoint: { x: 142, y: 212 },
    t: 0.7,
  });
  assertProjectionPoint(branch.points[4], "connection", {
    elevationMeters: 1.2,
    planPoint: { x: 4.6, y: 1.4 },
    sectionPoint: { x: 146, y: 212 },
    t: 4.6 / 6,
  });

  assert(
    (branch.points[4]?.sectionPoint.x ?? 0) >
      (branch.points[1]?.sectionPoint.x ?? Number.POSITIVE_INFINITY),
    "La rama terminal debe continuar horizontalmente hasta el artefacto.",
  );
  assertClose(branch.points[4]?.sectionPoint.y, branch.points[3]?.sectionPoint.y ?? 0);
  assertClose(
    routeSegmentPhysicalLengthMeters(
      resolvedSegment(fixture, "D-1"),
      PLAN_SCALE_METERS_PER_SOURCE_UNIT,
    ),
    branch.physicalLengthMeters ?? 0,
  );
}

function assertProjectedPhysicalAccessories(
  fixture: SectionRouteProjectionFixture,
) {
  const accessories = fixture.projection.accessories;

  assertEqual(
    accessories.map((accessory) => accessory.kind).sort().join(","),
    "rh_elbow,valve",
  );

  for (const accessory of accessories) {
    assertEqual(accessory.status, "resolved");
    assertEqual(accessory.pendingReason, null);
    assertEqual(accessory.segmentIds.join(","), "D-1");
    assertEqual(accessory.routeUseCount, 1);
    assert(
      fixture.inventory.items.some((item) => item.id === accessory.id),
      `El accesorio proyectado ${accessory.id} no proviene del inventario fisico.`,
    );
  }

  const valve = accessories.find((accessory) => accessory.kind === "valve");
  const rh = accessories.find((accessory) => accessory.kind === "rh_elbow");

  assert(valve, "Falta llave proyectada.");
  assert(rh, "Falta RH proyectado.");
  assertEqual(valve.label, "Llave");
  assertEqual(rh.label, "RH");
  assertPoint(valve.planPoint, { x: 4.25, y: 1.4, z: 1.2 });
  assertPoint(valve.sectionPoint, { x: 142.5, y: 212 });
  assertPoint(rh.planPoint, { x: 4.6, y: 1.4, z: 1.2 });
  assertPoint(rh.sectionPoint, { x: 146, y: 212 });
  assertUnique(accessories.map((accessory) => accessory.id));
}

function assertProjectedTerminalEquipment(
  fixture: SectionRouteProjectionFixture,
) {
  const equipment =
    fixture.projection.equipment.find(
      (item) => item.equipmentId === "appliance-terminal",
    ) ?? null;

  assert(equipment, "Falta punto de conexion del artefacto terminal.");
  assertEqual(equipment.nodeId, "1");
  assertEqual(equipment.role, "appliance");
  assertClose(equipment.zMeters, 1.2);
  assertPoint(equipment.planPoint, { x: 4.6, y: 1.4, z: 1.2 });
  assertPoint(equipment.sectionPoint, { x: 146, y: 212 });
}

function assertMissingRegistrationIsPending(
  fixture: SectionRouteProjectionFixture,
) {
  const projection = createSectionRouteProjection({
    adoptedDiameterValidation: fixture.adoptedDiameterValidation,
    equipment: fixture.equipment,
    inventory: fixture.inventory,
    link: {
      ...fixture.link,
      registration: undefined,
    },
    network: fixture.network,
    result: fixture.result,
    sectionScaleMetersPerSourceUnit: SECTION_SCALE_METERS_PER_SOURCE_UNIT,
    toleranceSource: EPSILON,
  });

  assertEqual(projection.status, "pending");
  assertEqual(projection.pendingItems[0]?.id, "section-route:registration");
  assertEqual(projection.segments.length, 0);
}

function assertMissingScaleIsPending(fixture: SectionRouteProjectionFixture) {
  const projection = createSectionRouteProjection({
    adoptedDiameterValidation: fixture.adoptedDiameterValidation,
    equipment: fixture.equipment,
    inventory: fixture.inventory,
    link: fixture.link,
    network: fixture.network,
    result: fixture.result,
    sectionScaleMetersPerSourceUnit: null,
    toleranceSource: EPSILON,
  });

  assertEqual(projection.status, "pending");
  assertEqual(projection.pendingItems[0]?.id, "section-route:section-scale");
  assertEqual(projection.segments.length, 0);
}

function assertMissingZIsPending(fixture: SectionRouteProjectionFixture) {
  const network: ManualRouteNetwork = {
    ...fixture.network,
    nodes: fixture.network.nodes.map((node) =>
      node.id === "D"
        ? {
            ...node,
            position: { x: 2, y: 0 },
          }
        : node,
    ),
  };
  const result = calculateTechnicalTree({
    equipment: fixture.equipment,
    minSegmentLengthSource: EPSILON,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
  });
  const projection = createSectionRouteProjection({
    adoptedDiameterValidation: fixture.adoptedDiameterValidation,
    equipment: fixture.equipment,
    inventory: fixture.inventory,
    link: fixture.link,
    network,
    result,
    sectionScaleMetersPerSourceUnit: SECTION_SCALE_METERS_PER_SOURCE_UNIT,
    toleranceSource: EPSILON,
  });
  const branch = projectedSegment(projection, "D-1");

  assertEqual(projection.status, "pending");
  assertEqual(branch.status, "pending");
  assertEqual(branch.points.length, 0);
  assert(
    projection.pendingItems.some(
      (item) =>
        item.sourceType === "segment" &&
        item.sourceId === "D-1" &&
        item.reason.includes("Falta cota Z"),
    ),
    "La falta de Z debe quedar pendiente sin inferir geometria en corte.",
  );
}

function sectionProjectionSnapshot(fixture: SectionRouteProjectionFixture) {
  return {
    accessories: fixture.projection.accessories.map((accessory) => ({
      id: accessory.id,
      kind: accessory.kind,
      sectionPoint: accessory.sectionPoint,
      segmentIds: accessory.segmentIds,
      sourceIds: accessory.sourceIds,
      status: accessory.status,
    })),
    equipment: fixture.projection.equipment.map((equipment) => ({
      equipmentId: equipment.equipmentId,
      nodeId: equipment.nodeId,
      sectionPoint: equipment.sectionPoint,
      zMeters: equipment.zMeters,
    })),
    pendingItems: fixture.projection.pendingItems,
    segments: fixture.projection.segments.map((segment) => ({
      adoptedDiameter: segment.adoptedDiameter?.id ?? null,
      adoptedDiameterLabel: segment.adoptedDiameterLabel,
      fromNodeId: segment.fromNodeId,
      physicalLengthMeters: segment.physicalLengthMeters,
      points: segment.points.map((point) => ({
        elevationMeters: point.elevationMeters,
        planPoint: point.planPoint,
        sectionPoint: point.sectionPoint,
        source: point.source,
        t: point.t,
      })),
      segmentId: segment.segmentId,
      status: segment.status,
      toNodeId: segment.toNodeId,
    })),
    status: fixture.projection.status,
  };
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
  fixture: SectionRouteProjectionFixture,
  segmentId: string,
) {
  const segment =
    resolveRouteSegments(fixture.network, fixture.equipment).find(
      (candidate) => candidate.id === segmentId,
    ) ?? null;

  assert(segment, `Falta segmento resuelto ${segmentId}.`);

  return segment;
}

function routeSegmentIds(network: ManualRouteNetwork) {
  return network.segments.map((segment) => segment.id).sort();
}

function assertProjectionPoint(
  actual: SectionRouteProjection["segments"][number]["points"][number] | undefined,
  source: SectionRouteProjectedPointSource,
  expected: {
    elevationMeters: number;
    planPoint: Point2D;
    sectionPoint: Point2D;
    t: number;
  },
) {
  assert(actual, `Falta punto proyectado ${source}.`);
  assertEqual(actual.source, source);
  assertClose(actual.elevationMeters, expected.elevationMeters);
  assertPoint(actual.planPoint, expected.planPoint);
  assertPoint(actual.sectionPoint, expected.sectionPoint);
  assertClose(actual.t, expected.t);
}

function assertPoint(actual: Point2D | null | undefined, expected: Point2D) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);

  if (expected.z !== undefined) {
    assertClose(actual.z, expected.z);
  }
}

function assertUnique(values: string[]) {
  assertEqual(values.length, new Set(values).size);
}

function diameterLabel(externalDiameterMillimeters: number) {
  return `Ø${externalDiameterMillimeters}`;
}

function verify(
  results: SectionRouteProjectionVerificationResult[],
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
  console.log(JSON.stringify(runSectionRouteProjectionVerifications(), null, 2));
}
