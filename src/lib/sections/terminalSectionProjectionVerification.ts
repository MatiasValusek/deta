import { createTechnicalAxonometricView } from "@/lib/calculation/technicalAxonometric";
import { createTechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { createTechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import {
  createSigasAccessoryExactSelectionDecisions,
  createSigasAccessorySelectionDiameterIndex,
  selectSigasAccessoryExactCatalogRow,
} from "@/lib/calculation/pipeSystems/sigas/sigasAccessoryExactSelection";
import {
  confirmEquipmentTerminalConfig,
  createSuggestedEquipmentTerminalConfig,
  terminalEndHeightMeters,
} from "@/lib/equipment/terminalConfig";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  resolveRouteSegments,
  routeSegmentPhysicalLengthMeters,
} from "@/lib/routing/network";
import { applyConfirmedEquipmentTerminalConnection } from "@/lib/routing/terminalConnection";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  applySectionRouteHeightEdit,
  sectionRouteHeightTargetKey,
} from "./routeHeightEditing";
import {
  createSectionRouteProjection,
  type SectionRouteProjection,
  type SectionRouteProjectionLink,
} from "./routeProjection";

export type TerminalSectionProjectionVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const INITIAL_CONNECTION_HEIGHT_METERS = 1.1;
const INITIAL_END_HEIGHT_METERS = 0.9;
const UPDATED_END_HEIGHT_METERS = 1.65;
const UPDATED_CONNECTION_HEIGHT_METERS = 1.85;
const SUCCESSIVE_END_HEIGHT_METERS = 0.75;
const SUCCESSIVE_CONNECTION_HEIGHT_METERS = 0.95;
const PLAN_SCALE_METERS_PER_SOURCE_UNIT = 1;
const SECTION_SCALE_METERS_PER_SOURCE_UNIT = 0.1;
const TERMINAL_RH_HALF_INCH_CATALOG_CODE =
  "codo-90-con-rosca-hembra-20-x-1-2";

export function runTerminalSectionProjectionVerifications() {
  const results: TerminalSectionProjectionVerificationResult[] = [];

  verify(
    results,
    "10.7D corte representa artefacto y terminal fisica de routeNetwork",
    () => {
      const before = terminalSectionProjectionFixture(
        INITIAL_CONNECTION_HEIGHT_METERS,
      );

      assertTerminalProjection(
        before,
        INITIAL_CONNECTION_HEIGHT_METERS,
        INITIAL_END_HEIGHT_METERS,
      );
      assertMissingSectionReferenceIsPending(before);

      const target = terminalEquipmentTarget(before.projection);
      const edit = applySectionRouteHeightEdit({
        equipment: before.equipment,
        heightMeters: UPDATED_END_HEIGHT_METERS,
        network: before.network,
        scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
        target,
      });

      assert(edit.ok, edit.ok ? "" : edit.message);

      const after = terminalSectionProjectionFixture(
        UPDATED_CONNECTION_HEIGHT_METERS,
        edit.network,
        edit.equipment,
      );

      assertStableRouteIdentity(before.network, after.network);
      assertTerminalProjection(
        after,
        UPDATED_CONNECTION_HEIGHT_METERS,
        UPDATED_END_HEIGHT_METERS,
      );
      assertHeightEditUpdatedSameNetwork(
        before,
        after,
        INITIAL_CONNECTION_HEIGHT_METERS,
        INITIAL_END_HEIGHT_METERS,
        UPDATED_CONNECTION_HEIGHT_METERS,
        UPDATED_END_HEIGHT_METERS,
      );
      assertNoDuplicateTerminalAccessories(after);

      const successiveEdit = applySectionRouteHeightEdit({
        equipment: after.equipment,
        heightMeters: SUCCESSIVE_END_HEIGHT_METERS,
        network: after.network,
        scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
        target: terminalEquipmentTarget(after.projection),
      });

      assert(
        successiveEdit.ok,
        successiveEdit.ok ? "" : successiveEdit.message,
      );

      const successive = terminalSectionProjectionFixture(
        SUCCESSIVE_CONNECTION_HEIGHT_METERS,
        successiveEdit.network,
        successiveEdit.equipment,
      );

      assertStableRouteIdentity(after.network, successive.network);
      assertTerminalProjection(
        successive,
        SUCCESSIVE_CONNECTION_HEIGHT_METERS,
        SUCCESSIVE_END_HEIGHT_METERS,
      );
      assertHeightEditUpdatedSameNetwork(
        after,
        successive,
        UPDATED_CONNECTION_HEIGHT_METERS,
        UPDATED_END_HEIGHT_METERS,
        SUCCESSIVE_CONNECTION_HEIGHT_METERS,
        SUCCESSIVE_END_HEIGHT_METERS,
      );
      assertNoDuplicateTerminalAccessories(successive);
    },
  );

  return results;
}

type TerminalSectionProjectionFixture = ReturnType<
  typeof terminalSectionProjectionFixture
>;

function terminalSectionProjectionFixture(
  terminalHeightMeters: number,
  network = confirmedTerminalNetwork(fixtureEquipment(terminalHeightMeters)),
  equipment = fixtureEquipment(terminalHeightMeters),
) {
  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: EPSILON,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
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
  const axonometricView = createTechnicalAxonometricView({
    adoptedDiameterValidation,
    equipment,
    inventory,
    network,
    result,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
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
    adoptedDiameterValidation,
    axonometricView,
    equipment,
    inventory,
    link,
    materialTakeoff,
    network,
    projection,
    result,
  };
}

function fixtureEquipment(terminalHeightMeters: number): WorkbenchEquipment[] {
  const terminalConfig = confirmEquipmentTerminalConfig({
    ...createSuggestedEquipmentTerminalConfig("stove"),
    connectionHeightMeters: terminalHeightMeters,
    lateralOffsetMeters: 0.5,
    outletSide: "right",
  });
  const terminalEndHeight = terminalEndHeightMeters(terminalConfig) ?? 0;

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
      bodyPoint: { x: 2, y: 0, z: terminalEndHeight },
      connectionPoint: { x: 2, y: 0, z: terminalEndHeight },
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
        wallPoint: { x: 2, y: 0, z: terminalEndHeight },
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

function confirmedTerminalNetwork(
  equipment: WorkbenchEquipment[],
): ManualRouteNetwork {
  const update = applyConfirmedEquipmentTerminalConnection({
    equipment,
    equipmentId: "stove",
    network: baseNetwork(),
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
  });

  assert(update.ok, update.ok ? "" : update.message);

  const initialResult = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: EPSILON,
    network: update.network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: PLAN_SCALE_METERS_PER_SOURCE_UNIT,
  });
  const decisions = createSigasAccessoryExactSelectionDecisions({
    diameterBySegmentId: createSigasAccessorySelectionDiameterIndex({
      diameterBySegmentId:
        initialResult.networkSizing?.finalDiameterBySegmentId ?? {},
      result: initialResult,
    }),
    network: update.network,
  });
  const decision = decisions[0];
  const threadedHalfInch = decision?.candidates.find(
    (candidate) =>
      candidate.catalogCode === TERMINAL_RH_HALF_INCH_CATALOG_CODE,
  );

  assertEqual(initialResult.status, "incomplete");
  assertEqual(decisions.length, 1);
  assert(decision, "Falta decision profesional para el terminal roscado.");
  assertEqual(decision.fieldLabel, "Diámetro roscado");
  assert(threadedHalfInch, "Falta la fila SIGAS exacta de rosca 1/2.");

  const selection = selectSigasAccessoryExactCatalogRow({
    accessoryId: decision.accessoryId,
    catalogCode: threadedHalfInch.catalogCode,
    diameter: decision.diameter,
    network: update.network,
    segmentId: decision.segmentId,
  });

  assert(selection.ok, selection.ok ? "" : selection.message);

  return selection.network;
}

function sectionProjectionLink(): SectionRouteProjectionLink {
  return {
    id: "section-link-terminal",
    planEnd: { x: 3, y: -1 },
    planStart: { x: 0, y: -1 },
    registration: {
      positiveZSide: "left",
      referenceElevationMeters: 0,
      sectionEnd: { x: 160, y: 200 },
      sectionStart: { x: 100, y: 200 },
    },
  };
}

function terminalEquipmentTarget(projection: SectionRouteProjection) {
  const equipment =
    projection.equipment.find((item) => item.equipmentId === "stove") ?? null;

  assert(equipment, "Falta cocina proyectada en corte.");
  assertEqual(sectionRouteHeightTargetKey(equipment.heightTarget), "node:1");

  return equipment.heightTarget;
}

function assertTerminalProjection(
  fixture: TerminalSectionProjectionFixture,
  connectionHeightMeters: number,
  endHeightMeters: number,
) {
  assertEqual(
    fixture.projection.pendingItems
      .map((item) => `${item.sourceType}:${item.sourceId ?? item.id}:${item.reason}`)
      .join("|"),
    "",
  );
  assertEqual(
    [
      ...fixture.projection.segments.map(
        (segment) =>
          `${segment.segmentId}:${segment.status}:${segment.pendingReason ?? ""}`,
      ),
      ...fixture.projection.accessories.map(
        (accessory) =>
          `${accessory.kind}:${accessory.status}:${accessory.pendingReason ?? ""}`,
      ),
    ]
      .filter((item) => item.includes(":pending:"))
      .join("|"),
    "",
  );
  assertEqual(fixture.projection.status, "resolved");
  assertEqual(fixture.inventory.status, "resolved");
  assertEqual(fixture.materialTakeoff.status, "resolved");
  assertEqual(fixture.axonometricView.status, "resolved");

  const branch = projectedSegment(fixture.projection, "D-1");
  const expectedConnectionSectionY =
    200 + connectionHeightMeters / SECTION_SCALE_METERS_PER_SOURCE_UNIT;
  const expectedEndSectionY =
    200 + endHeightMeters / SECTION_SCALE_METERS_PER_SOURCE_UNIT;

  assertEqual(branch.status, "resolved");
  assertEqual(
    branch.points.map((point) => point.source).join(","),
    "node,vertical,vertex,vertex,connection",
  );
  assertProjectionPoint(branch.points[0], {
    elevationMeters: 0,
    planPoint: { x: 2.5, y: -1, z: 0 },
    sectionPoint: { x: 150, y: 200 },
  });
  assertProjectionPoint(branch.points[1], {
    elevationMeters: connectionHeightMeters,
    planPoint: { x: 2.5, y: -1, z: connectionHeightMeters },
    sectionPoint: { x: 150, y: expectedConnectionSectionY },
  });
  assertProjectionPoint(branch.points[2], {
    elevationMeters: connectionHeightMeters,
    planPoint: { x: 2.5, y: 0, z: connectionHeightMeters },
    sectionPoint: { x: 150, y: expectedConnectionSectionY },
  });
  assertProjectionPoint(branch.points[3], {
    elevationMeters: connectionHeightMeters,
    planPoint: { x: 2, y: 0, z: connectionHeightMeters },
    sectionPoint: { x: 140, y: expectedConnectionSectionY },
  });
  assertProjectionPoint(branch.points[4], {
    elevationMeters: endHeightMeters,
    planPoint: { x: 2, y: 0, z: endHeightMeters },
    sectionPoint: { x: 140, y: expectedEndSectionY },
  });

  const stove =
    fixture.projection.equipment.find((item) => item.equipmentId === "stove") ??
    null;

  assert(stove, "Falta simbolo de cocina proyectado.");
  assertEqual(stove.anchorStatus, "anchored");
  assertClose(stove.zMeters, endHeightMeters);
  assertPoint(stove.planPoint, { x: 2, y: 0, z: endHeightMeters });
  assertPoint(stove.bodyPlanPoint, { x: 2, y: 0, z: endHeightMeters });
  assertPoint(stove.sectionPoint, { x: 140, y: expectedEndSectionY });
  assertPoint(stove.bodySectionPoint, { x: 140, y: expectedEndSectionY });
  assertPoint(stove.bodyPlanPoint, stove.planPoint);

  const valve = projectedAccessory(fixture.projection, "valve");
  const terminal = projectedAccessory(fixture.projection, "rh_elbow");

  assertEqual(valve.label, "Llave");
  assertEqual(terminal.label, "RH");
  assertPoint(valve.planPoint, { x: 2.5, y: 0, z: connectionHeightMeters });
  assertPoint(valve.sectionPoint, { x: 150, y: expectedConnectionSectionY });
  assertPoint(terminal.planPoint, { x: 2, y: 0, z: endHeightMeters });
  assertPoint(terminal.sectionPoint, { x: 140, y: expectedEndSectionY });
  assert(
    valve.sourceIds.some((sourceId) =>
      sourceId.endsWith("D-1:route-terminal:stove:valve"),
    ),
    "La llave proyectada debe salir del accesorio terminal de routeNetwork.",
  );
  assert(
    terminal.sourceIds.some((sourceId) =>
      sourceId.endsWith("D-1:route-terminal:stove:terminal"),
    ),
    "El RH proyectado debe salir del accesorio terminal de routeNetwork.",
  );
}

function assertHeightEditUpdatedSameNetwork(
  before: TerminalSectionProjectionFixture,
  after: TerminalSectionProjectionFixture,
  beforeConnectionHeightMeters: number,
  beforeEndHeightMeters: number,
  afterConnectionHeightMeters: number,
  afterEndHeightMeters: number,
) {
  const beforeBranch = resolvedSegment(before, "D-1");
  const afterBranch = resolvedSegment(after, "D-1");
  const stove = equipment(after.equipment, "stove");

  assertPoint(stove.connectionPoint, {
    x: 2,
    y: 0,
    z: afterEndHeightMeters,
  });
  assertPoint(stove.bodyPoint, {
    x: 2,
    y: 0,
    z: afterEndHeightMeters,
  });
  assertPoint(stove.wallAnchor?.wallPoint, {
    x: 2,
    y: 0,
    z: afterEndHeightMeters,
  });
  assertClose(
    stove.terminalConfig?.connectionHeightMeters,
    afterConnectionHeightMeters,
  );
  assertEqual(stove.terminalConfig?.heightStatus, "confirmed");
  assertEqual(stove.terminalConfig?.heightSource, "professional_edit");
  assertClose(stove.terminalConfig?.lateralOffsetMeters, 0.5);
  assertEqual(stove.terminalConfig?.outletSide, "right");
  assertClose(stove.terminalConfig?.verticalDropMeters, 0.2);
  const terminalSegment = after.network.segments.find(
    (segment) => segment.id === "D-1",
  );

  assert(terminalSegment, "Falta tramo terminal D-1.");
  assertEqual(
    terminalSegment.vertexElevations?.length,
    terminalSegment.vertices?.length,
  );
  assert(
    terminalSegment.vertexElevations?.every(
      (metadata) =>
        metadata?.status === "confirmed" &&
        metadata.source === "derived_calculation",
    ),
    "Las cotas terminales derivadas deben conservar su procedencia.",
  );
  assertClose(
    routeSegmentPhysicalLengthMeters(
      beforeBranch,
      PLAN_SCALE_METERS_PER_SOURCE_UNIT,
    ),
    terminalBranchPhysicalLengthMeters(beforeConnectionHeightMeters),
  );
  assertClose(
    routeSegmentPhysicalLengthMeters(
      afterBranch,
      PLAN_SCALE_METERS_PER_SOURCE_UNIT,
    ),
    terminalBranchPhysicalLengthMeters(afterConnectionHeightMeters),
  );
  assertClose(
    routeSegmentPhysicalLengthMeters(
      afterBranch,
      PLAN_SCALE_METERS_PER_SOURCE_UNIT,
    ) -
      routeSegmentPhysicalLengthMeters(
        beforeBranch,
        PLAN_SCALE_METERS_PER_SOURCE_UNIT,
      ),
    afterEndHeightMeters - beforeEndHeightMeters,
  );
  assertClose(
    segmentResult(after.result, "D-1").segmentPhysicalLengthMeters,
    terminalBranchPhysicalLengthMeters(afterConnectionHeightMeters),
  );
  assertClose(
    after.materialTakeoff.physicalMaterialQuantities.pipeLengthMeters -
      before.materialTakeoff.physicalMaterialQuantities.pipeLengthMeters,
    afterEndHeightMeters - beforeEndHeightMeters,
  );
  assertClose(
    after.axonometricView.nodes.find((node) => node.id === "1")?.point?.zMeters,
    afterEndHeightMeters,
  );
  assertClose(
    after.axonometricView.segments.find((segment) => segment.id === "D-1")
      ?.physicalLengthMeters,
    terminalBranchPhysicalLengthMeters(afterConnectionHeightMeters),
  );
}

function terminalBranchPhysicalLengthMeters(connectionHeightMeters: number) {
  return 1.5 + connectionHeightMeters + 0.2;
}

function assertStableRouteIdentity(
  before: ManualRouteNetwork,
  after: ManualRouteNetwork,
) {
  assertEqual(
    before.nodes.map((node) => node.id).sort().join(","),
    after.nodes.map((node) => node.id).sort().join(","),
  );
  assertEqual(
    before.segments.map((segment) => segment.id).sort().join(","),
    after.segments.map((segment) => segment.id).sort().join(","),
  );
  assertEqual(JSON.stringify(after.nodes), JSON.stringify(before.nodes));

  const beforeUntouchedSegments = before.segments.filter(
    (segment) => segment.id !== "D-1",
  );
  const afterUntouchedSegments = after.segments.filter(
    (segment) => segment.id !== "D-1",
  );

  assertEqual(
    JSON.stringify(afterUntouchedSegments),
    JSON.stringify(beforeUntouchedSegments),
  );
}

function assertNoDuplicateTerminalAccessories(
  fixture: TerminalSectionProjectionFixture,
) {
  const branch = fixture.network.segments.find((segment) => segment.id === "D-1");
  const accessoryIds = branch?.accessories?.map((accessory) => accessory.id) ?? [];
  const terminalAccessory = branch?.accessories?.find((accessory) =>
    accessory.id.endsWith(":terminal"),
  );

  assertEqual(accessoryIds.sort().join(","), "route-terminal:stove:terminal,route-terminal:stove:valve");
  assertUnique(accessoryIds);
  assertEqual(
    terminalAccessory?.catalogCode,
    TERMINAL_RH_HALF_INCH_CATALOG_CODE,
  );
  assertEqual(fixture.inventory.items.length, 2);
  assertEqual(
    fixture.materialTakeoff.physicalMaterialQuantities.accessoryQuantity,
    2,
  );
  assertUnique(fixture.inventory.items.flatMap((item) => item.sourceIds));
}

function assertMissingSectionReferenceIsPending(
  fixture: TerminalSectionProjectionFixture,
) {
  const missingRegistration = createSectionRouteProjection({
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
  const missingScale = createSectionRouteProjection({
    adoptedDiameterValidation: fixture.adoptedDiameterValidation,
    equipment: fixture.equipment,
    inventory: fixture.inventory,
    link: fixture.link,
    network: fixture.network,
    result: fixture.result,
    sectionScaleMetersPerSourceUnit: null,
    toleranceSource: EPSILON,
  });

  assertEqual(missingRegistration.status, "pending");
  assertEqual(missingRegistration.segments.length, 0);
  assertEqual(missingRegistration.equipment.length, 0);
  assertEqual(missingRegistration.accessories.length, 0);
  assertEqual(missingScale.status, "pending");
  assertEqual(missingScale.segments.length, 0);
  assertEqual(missingScale.equipment.length, 0);
  assertEqual(missingScale.accessories.length, 0);
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

function projectedAccessory(
  projection: SectionRouteProjection,
  kind: "rh_elbow" | "valve",
) {
  const accessory =
    projection.accessories.find((candidate) => candidate.kind === kind) ?? null;

  assert(accessory, `Falta accesorio proyectado ${kind}.`);
  assertEqual(accessory.status, "resolved");

  return accessory;
}

function resolvedSegment(
  fixture: TerminalSectionProjectionFixture,
  segmentId: string,
) {
  const segment =
    resolveRouteSegments(fixture.network, fixture.equipment).find(
      (candidate) => candidate.id === segmentId,
    ) ?? null;

  assert(segment, `Falta segmento resuelto ${segmentId}.`);

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

function verify(
  results: TerminalSectionProjectionVerificationResult[],
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
  console.log(JSON.stringify(runTerminalSectionProjectionVerifications(), null, 2));
}
