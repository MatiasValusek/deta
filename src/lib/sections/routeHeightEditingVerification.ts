import { createTechnicalAxonometricView } from "@/lib/calculation/technicalAxonometric";
import { createTechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { createTechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import {
  createTechnicalPhysicalAccessoryInventory,
  type TechnicalPhysicalAccessoryInventory,
} from "@/lib/calculation/technicalPhysicalAccessories";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  automaticAccessoryId,
  type AccessoryProposal,
} from "@/lib/routing/routeAccessoryProposals";
import type {
  ManualRouteNetwork,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import {
  applySectionRouteHeightEdit,
  sectionRouteHeightTargetKey,
} from "./routeHeightEditing";
import {
  createSectionRouteProjection,
  type SectionRouteProjection,
  type SectionRouteProjectionLink,
} from "./routeProjection";

export type SectionRouteHeightEditingVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const INITIAL_TERMINAL_HEIGHT_METERS = 0.25;
const UPDATED_TERMINAL_HEIGHT_METERS = 1.65;
const HEIGHT_DELTA_METERS =
  UPDATED_TERMINAL_HEIGHT_METERS - INITIAL_TERMINAL_HEIGHT_METERS;
const PLAN_SCALE_METERS_PER_SOURCE_UNIT = 1;
const SECTION_SCALE_METERS_PER_SOURCE_UNIT = 0.1;
const TERMINAL_VALVE_PROPOSAL_ID = "terminal-valve";
const TERMINAL_RH_PROPOSAL_ID = "terminal-rh";

export function runSectionRouteHeightEditingVerifications() {
  const results: SectionRouteHeightEditingVerificationResult[] = [];

  verify(
    results,
    "10.6C edicion de cota terminal desde corte actualiza la red fisica",
    () => {
      const before = sectionRouteHeightEditingFixture(
        INITIAL_TERMINAL_HEIGHT_METERS,
      );
      const target = terminalConnectionTarget(before.projection);
      const edit = applySectionRouteHeightEdit({
        equipment: before.equipment,
        heightMeters: UPDATED_TERMINAL_HEIGHT_METERS,
        network: before.network,
        target,
      });

      assert(edit.ok, edit.ok ? "" : edit.message);
      assertEqual(edit.network, before.network);

      const after = sectionRouteHeightEditingFixture(
        UPDATED_TERMINAL_HEIGHT_METERS,
        edit.network,
        edit.equipment,
      );

      assertSelectableSectionTargets(before.projection);
      assertSameNetworkGeometry(before, after);
      assertTerminalHeightEdit(before, after);
      assertCalculationUpdated(before, after);
      assertPhysicalAccessoriesAndMaterialsUpdated(before, after);
      assertSectionProjectionUpdated(after.projection);
      assertAxonometricUpdated(after);
    },
  );

  return results;
}

type SectionRouteHeightEditingFixture = ReturnType<
  typeof sectionRouteHeightEditingFixture
>;

function sectionRouteHeightEditingFixture(
  terminalHeightMeters: number,
  network = confirmedPhysicalRouteNetwork(),
  equipment = terminalBranchEquipment(terminalHeightMeters),
) {
  const accessoryProposals = terminalBranchAccessoryProposals(
    terminalHeightMeters,
  );
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
  const materialTakeoff = createTechnicalMaterialTakeoff({
    accessoryProposals,
    adoptedDiameterValidation,
    physicalAccessoryInventory: inventory,
    result,
  });
  const axonometricView = createTechnicalAxonometricView({
    adoptedDiameterValidation,
    equipment,
    inventory,
    network,
    result,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
  });
  const projection = createSectionRouteProjection({
    adoptedDiameterValidation,
    equipment,
    inventory,
    link: sectionProjectionLink(),
    network,
    result,
    sectionScaleMetersPerSourceUnit: SECTION_SCALE_METERS_PER_SOURCE_UNIT,
    toleranceSource: EPSILON,
  });

  return {
    accessoryProposals,
    adoptedDiameterValidation,
    axonometricView,
    equipment,
    equivalentVerificationBySegmentId,
    inventory,
    materialTakeoff,
    network,
    projection,
    result,
  };
}

function terminalBranchEquipment(
  terminalHeightMeters: number,
): WorkbenchEquipment[] {
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
      connectionPoint: { x: 4.6, y: 1.4, z: terminalHeightMeters },
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

function terminalBranchAccessoryProposals(
  terminalHeightMeters: number,
): AccessoryProposal[] {
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
      geometryKey: "fixture:10.6C:terminal-valve",
      id: TERMINAL_VALVE_PROPOSAL_ID,
      incidentSegmentIds: ["D-1"],
      kind: "straight",
      nodeId: "1",
      ownerResolution: {
        candidateSegmentIds: ["D-1"],
        ownerSegmentId: "D-1",
        status: "unambiguous",
      },
      position: { x: 4.25, y: 1.4, z: terminalHeightMeters },
      reason: "Llave de paso terminal confirmada en fixture 10.6C.",
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
      geometryKey: "fixture:10.6C:terminal-rh",
      id: TERMINAL_RH_PROPOSAL_ID,
      incidentSegmentIds: ["D-1"],
      kind: "terminal",
      nodeId: "1",
      ownerResolution: {
        candidateSegmentIds: ["D-1"],
        ownerSegmentId: "D-1",
        status: "unambiguous",
      },
      position: { x: 4.6, y: 1.4, z: terminalHeightMeters },
      reason: "Fitting terminal/RH confirmado en fixture 10.6C.",
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

function terminalConnectionTarget(projection: SectionRouteProjection) {
  const branch = projectedSegment(projection, "D-1");
  const connection =
    branch.points.find((point) => point.source === "connection") ?? null;

  assert(connection?.heightTarget, "Falta target editable de conexion terminal.");
  assertEqual(sectionRouteHeightTargetKey(connection.heightTarget), "node:1");

  return connection.heightTarget;
}

function assertSelectableSectionTargets(projection: SectionRouteProjection) {
  const branch = projectedSegment(projection, "D-1");

  assertEqual(
    branch.points.map((point) => point.source).join(","),
    "node,vertical,vertex,vertex,connection",
  );
  assertEqual(
    branch.points.map((point) => sectionRouteHeightTargetKey(point.heightTarget)).join(","),
    "node:D,node:1,node:1,node:1,node:1",
  );
  assertEqual(
    sectionRouteHeightTargetKey(
      projection.equipment.find((item) => item.nodeId === "1")?.heightTarget,
    ),
    "node:1",
  );
}

function assertSameNetworkGeometry(
  before: SectionRouteHeightEditingFixture,
  after: SectionRouteHeightEditingFixture,
) {
  assertEqual(
    before.network.segments.map((segment) => segment.id).sort().join(","),
    after.network.segments.map((segment) => segment.id).sort().join(","),
  );
  assertEqual(
    before.network.nodes.map((node) => node.id).sort().join(","),
    after.network.nodes.map((node) => node.id).sort().join(","),
  );
  assertEqual(
    JSON.stringify(before.network.segments),
    JSON.stringify(after.network.segments),
  );
  assertEqual(
    JSON.stringify(before.network.nodes),
    JSON.stringify(after.network.nodes),
  );
  assertEqual(before.network.segments.length, 3);
  assertEqual(before.network.nodes.length, 4);
}

function assertTerminalHeightEdit(
  before: SectionRouteHeightEditingFixture,
  after: SectionRouteHeightEditingFixture,
) {
  const afterTerminal = equipment(after.equipment, "appliance-terminal");
  const beforeOriginalTerminal = equipment(before.equipment, "appliance-terminal");

  assertPoint(beforeOriginalTerminal.connectionPoint, {
    x: 4.6,
    y: 1.4,
    z: INITIAL_TERMINAL_HEIGHT_METERS,
  });
  assertPoint(afterTerminal.connectionPoint, {
    x: 4.6,
    y: 1.4,
    z: UPDATED_TERMINAL_HEIGHT_METERS,
  });
}

function assertCalculationUpdated(
  before: SectionRouteHeightEditingFixture,
  after: SectionRouteHeightEditingFixture,
) {
  const beforeTerminalSegment = segmentResult(before.result, "D-1");
  const afterTerminalSegment = segmentResult(after.result, "D-1");
  const beforeTerminalRoute = routeResult(before.result);
  const afterTerminalRoute = routeResult(after.result);
  const beforeEquivalent = equivalent(before, "D-1");
  const afterEquivalent = equivalent(after, "D-1");
  const beforeTerminalPhysicalLength = requiredNumber(
    beforeTerminalSegment.segmentPhysicalLengthMeters,
  );
  const afterTerminalPhysicalLength = requiredNumber(
    afterTerminalSegment.segmentPhysicalLengthMeters,
  );
  const beforeTotalPhysicalLength = requiredNumber(
    before.result.totals.physicalLengthMeters,
  );
  const afterTotalPhysicalLength = requiredNumber(
    after.result.totals.physicalLengthMeters,
  );

  assertClose(beforeTerminalPhysicalLength, 4.25);
  assertClose(afterTerminalPhysicalLength, 5.65);
  assertClose(
    afterTerminalPhysicalLength - beforeTerminalPhysicalLength,
    HEIGHT_DELTA_METERS,
  );
  assertClose(beforeTerminalRoute.physicalLengthMeters, 6.25);
  assertClose(afterTerminalRoute.physicalLengthMeters, 7.65);
  assertClose(afterTotalPhysicalLength, 11.65);
  assertClose(
    afterTotalPhysicalLength - beforeTotalPhysicalLength,
    HEIGHT_DELTA_METERS,
  );
  assertClose(beforeEquivalent.equivalentAccessoryLengthMeters, 1.329);
  assertClose(afterEquivalent.equivalentAccessoryLengthMeters, 1.329);
  assertClose(afterEquivalent.calculationLengthMeters, 7.65);
  assertClose(
    (afterEquivalent.totalCalculationLengthMeters ?? 0) -
      (beforeEquivalent.totalCalculationLengthMeters ?? 0),
    HEIGHT_DELTA_METERS,
  );
}

function assertPhysicalAccessoriesAndMaterialsUpdated(
  before: SectionRouteHeightEditingFixture,
  after: SectionRouteHeightEditingFixture,
) {
  assertEqual(after.inventory.status, "resolved");
  assertEqual(after.materialTakeoff.status, "resolved");
  assertEqual(after.inventory.items.length, 2);
  assertEqual(after.materialTakeoff.physicalMaterialQuantities.accessoryQuantity, 2);
  assertClose(
    after.materialTakeoff.physicalMaterialQuantities.pipeLengthMeters,
    before.materialTakeoff.physicalMaterialQuantities.pipeLengthMeters +
      HEIGHT_DELTA_METERS,
  );
  assertEqual(
    accessorySourceIds(after.inventory),
    accessorySourceIds(before.inventory),
  );
  assert(
    after.materialTakeoff.accessoryItems
      .flatMap((item) => item.sourceIds)
      .every((sourceId) => !sourceId.startsWith("technical-route:")),
    "El BOM debe seguir usando piezas fisicas, no recorridos.",
  );
}

function assertSectionProjectionUpdated(projection: SectionRouteProjection) {
  const branch = projectedSegment(projection, "D-1");
  const vertical = branch.points.find((point) => point.source === "vertical");
  const finalVertex = branch.points
    .filter((point) => point.source === "vertex")
    .at(-1);
  const connection = branch.points.find((point) => point.source === "connection");

  assertEqual(projection.status, "resolved");
  assertProjectionPoint(vertical, {
    elevationMeters: UPDATED_TERMINAL_HEIGHT_METERS,
    planPoint: { x: 2, y: 0 },
    sectionPoint: { x: 120, y: 216.5 },
  });
  assertProjectionPoint(finalVertex, {
    elevationMeters: UPDATED_TERMINAL_HEIGHT_METERS,
    planPoint: { x: 4.2, y: 1.4 },
    sectionPoint: { x: 142, y: 216.5 },
  });
  assertProjectionPoint(connection, {
    elevationMeters: UPDATED_TERMINAL_HEIGHT_METERS,
    planPoint: { x: 4.6, y: 1.4 },
    sectionPoint: { x: 146, y: 216.5 },
  });

  for (const accessory of projection.accessories) {
    assertPoint(accessory.sectionPoint, {
      x: accessory.kind === "valve" ? 142.5 : 146,
      y: 216.5,
    });
  }
}

function assertAxonometricUpdated(fixture: SectionRouteHeightEditingFixture) {
  const view = fixture.axonometricView;
  const branch =
    view.segments.find((segment) => segment.id === "D-1") ?? null;
  const terminalNode = view.nodes.find((node) => node.id === "1") ?? null;

  assertEqual(view.status, "resolved");
  assert(branch, "Falta tramo terminal en axonometrica.");
  assert(terminalNode, "Falta nodo terminal en axonometrica.");
  assertClose(branch.zDeltaMeters, UPDATED_TERMINAL_HEIGHT_METERS);
  assertClose(branch.physicalLengthMeters, 5.65);
  assertEqual(branch.adoptedDiameterLabel, "Ø20");
  assertClose(terminalNode.point?.zMeters, UPDATED_TERMINAL_HEIGHT_METERS);
  assertEqual(
    view.segments.map((segment) => segment.id).sort().join(","),
    "D-1,D-2,M-D",
  );
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

function equipment(items: WorkbenchEquipment[], equipmentId: string) {
  const item = items.find((candidate) => candidate.id === equipmentId) ?? null;

  assert(item, `Falta equipo ${equipmentId}.`);

  return item;
}

function segmentResult(result: TechnicalCalculationResult, segmentId: string) {
  const segment =
    result.segments.find((candidate) => candidate.segmentId === segmentId) ??
    null;

  assert(segment, `Falta resultado de tramo ${segmentId}.`);

  return segment;
}

function routeResult(result: TechnicalCalculationResult) {
  const route =
    result.technicalRoutes.find(
      (candidate) => candidate.terminalEquipmentId === "appliance-terminal",
    ) ?? null;

  assert(route, "Falta recorrido del artefacto terminal.");

  return route;
}

function equivalent(
  fixture: SectionRouteHeightEditingFixture,
  segmentId: string,
) {
  const item = fixture.equivalentVerificationBySegmentId[segmentId];

  assert(item, `Falta verificacion equivalente ${segmentId}.`);

  return item;
}

function accessorySourceIds(inventory: TechnicalPhysicalAccessoryInventory) {
  return inventory.items
    .flatMap((item) => item.sourceIds)
    .sort()
    .join(",");
}

function assertProjectionPoint(
  actual: SectionRouteProjection["segments"][number]["points"][number] | undefined,
  expected: {
    elevationMeters: number;
    planPoint: Point2D;
    sectionPoint: Point2D;
  },
) {
  assert(actual, "Falta punto proyectado esperado.");
  assertClose(actual.elevationMeters, expected.elevationMeters);
  assertPoint(actual.planPoint, expected.planPoint);
  assertPoint(actual.sectionPoint, expected.sectionPoint);
}

function assertPoint(actual: Point2D | null | undefined, expected: Point2D) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);

  if (expected.z !== undefined) {
    assertClose(actual.z, expected.z);
  }
}

function requiredNumber(value: number | null | undefined) {
  assert(value !== null && value !== undefined, "Falta valor numerico esperado.");

  return value;
}

function verify(
  results: SectionRouteHeightEditingVerificationResult[],
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
  console.log(JSON.stringify(runSectionRouteHeightEditingVerifications(), null, 2));
}
