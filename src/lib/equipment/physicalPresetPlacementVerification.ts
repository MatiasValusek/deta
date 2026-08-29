import { createTechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { createTechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import type {
  DrawingVisualMetadata,
  NormalizedDrawing,
  Point2D,
} from "@/lib/geometry/types";
import { applyConfirmedEquipmentTerminalConnection } from "@/lib/routing/terminalConnection";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  createSectionRouteProjection,
  type SectionRouteProjection,
  type SectionRouteProjectionLink,
} from "@/lib/sections/routeProjection";
import type { ClassificationIndex } from "@/lib/semantic/types";
import {
  confirmEquipmentTerminalConfig,
  createSuggestedEquipmentTerminalConfig,
  terminalEndHeightMeters,
} from "./terminalConfig";
import type { EquipmentType, WorkbenchEquipment } from "./types";
import { resolveEquipmentPhysicalPlacement } from "./wallAnchoring";

export type PhysicalPresetPlacementVerificationResult = {
  name: string;
  status: "passed";
};

type PresetCase = {
  demandValue: number;
  expectedDropMeters: number;
  expectedEndHeightMeters: number;
  expectedHeightMeters: number;
  expectedLateralMeters: number;
  expectedOutletSide: NonNullable<WorkbenchEquipment["terminalConfig"]>["outletSide"];
  id: string;
  name: string;
  type: EquipmentType;
  x: number;
};

const EPSILON = 0.000001;
const SCALE_METERS_PER_SOURCE_UNIT = 1;
const SECTION_SCALE_METERS_PER_SOURCE_UNIT = 0.1;
const PRESET_CASES: PresetCase[] = [
  {
    demandValue: 8500,
    expectedDropMeters: 0.2,
    expectedEndHeightMeters: 0.9,
    expectedHeightMeters: 1.1,
    expectedLateralMeters: 0.5,
    expectedOutletSide: "right",
    id: "stove",
    name: "Cocina",
    type: "stove",
    x: 1,
  },
  {
    demandValue: 3000,
    expectedDropMeters: 0,
    expectedEndHeightMeters: 0.3,
    expectedHeightMeters: 0.3,
    expectedLateralMeters: 0.3,
    expectedOutletSide: "right",
    id: "space-heater",
    name: "Calefactor",
    type: "space_heater",
    x: 3,
  },
  {
    demandValue: 8500,
    expectedDropMeters: 0,
    expectedEndHeightMeters: 1.6,
    expectedHeightMeters: 1.6,
    expectedLateralMeters: 0,
    expectedOutletSide: "direct",
    id: "water-heater",
    name: "Calefon",
    type: "instant_water_heater",
    x: 5,
  },
  {
    demandValue: 8500,
    expectedDropMeters: 0,
    expectedEndHeightMeters: 1.6,
    expectedHeightMeters: 1.6,
    expectedLateralMeters: 0,
    expectedOutletSide: "direct",
    id: "storage-water-heater",
    name: "Termotanque",
    type: "storage_water_heater",
    x: 5.5,
  },
];

export function runPhysicalPresetPlacementVerifications() {
  const results: PhysicalPresetPlacementVerificationResult[] = [];

  verify(
    results,
    "10.8B click aproximado apoya artefactos y aplica preset fisico",
    () => {
      for (const preset of PRESET_CASES) {
        const placed = placedPresetEquipment(preset);

        assertPhysicalPlacement(preset, placed.appliance);
        assertTerminalConnection(preset, placed);
      }
    },
  );

  return results;
}

function placedPresetEquipment(preset: PresetCase) {
  const terminalConfig = createSuggestedEquipmentTerminalConfig(preset.type);

  assertClose(
    terminalConfig.connectionHeightMeters,
    preset.expectedHeightMeters,
  );
  assertClose(terminalConfig.lateralOffsetMeters, preset.expectedLateralMeters);
  assertClose(terminalConfig.verticalDropMeters, preset.expectedDropMeters);
  assertEqual(terminalConfig.outletSide, preset.expectedOutletSide);

  const terminalHeightMeters =
    terminalEndHeightMeters(terminalConfig) ?? preset.expectedHeightMeters;

  assertClose(terminalHeightMeters, preset.expectedEndHeightMeters);

  const placement = resolveEquipmentPhysicalPlacement({
    classificationIndex: fixtureClassificationIndex(),
    drawing: fixtureDrawing(),
    heightMeters: terminalHeightMeters,
    point: { x: preset.x, y: 0.18 },
    role: "appliance",
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
    snapToleranceSource: 0.5,
    source: "dxf",
  });
  const appliance: WorkbenchEquipment = {
    bodyPoint: placement.bodyPoint,
    connectionPoint: placement.connectionPoint,
    demandUnit: "kcal_h",
    demandValue: preset.demandValue,
    id: preset.id,
    name: preset.name,
    planBaseId: "plan:preset-fixture",
    role: "appliance",
    source: "manual",
    terminalConfig,
    type: preset.type,
    wallAnchor: placement.wallAnchor ?? undefined,
  };
  const confirmedAppliance: WorkbenchEquipment = {
    ...appliance,
    terminalConfig: confirmEquipmentTerminalConfig(terminalConfig),
  };
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: -1, z: 0 },
      id: "meter",
      name: "M",
      planBaseId: "plan:preset-fixture",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    confirmedAppliance,
  ];
  const terminalUpdate = applyConfirmedEquipmentTerminalConnection({
    equipment,
    equipmentId: preset.id,
    network: baseNetwork(preset),
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });

  assert(terminalUpdate.ok, terminalUpdate.ok ? "" : terminalUpdate.message);

  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: EPSILON,
    network: terminalUpdate.network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });

  assert(
    result.status === "valid",
    `Calculo tecnico incompleto: ${JSON.stringify(result.issues)}`,
  );

  const inventory = createTechnicalPhysicalAccessoryInventory({ result });
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
  const sectionProjection = createSectionRouteProjection({
    adoptedDiameterValidation,
    equipment,
    inventory,
    link: sectionProjectionLink(),
    network: terminalUpdate.network,
    result,
    sectionScaleMetersPerSourceUnit: SECTION_SCALE_METERS_PER_SOURCE_UNIT,
    toleranceSource: EPSILON,
  });
  const routeOnlySectionProjection = createSectionRouteProjection({
    adoptedDiameterValidation,
    equipment,
    inventory: null,
    link: sectionProjectionLink(),
    network: terminalUpdate.network,
    result,
    sectionScaleMetersPerSourceUnit: SECTION_SCALE_METERS_PER_SOURCE_UNIT,
    toleranceSource: EPSILON,
  });

  return {
    appliance,
    equipment,
    inventory,
    materialTakeoff,
    network: terminalUpdate.network,
    result,
    routeOnlySectionProjection,
    sectionProjection,
  };
}

function baseNetwork(preset: PresetCase): ManualRouteNetwork {
  return {
    nodes: [
      {
        equipmentId: "meter",
        id: "M",
        kind: "supply",
        origin: "manual",
      },
      {
        id: `D-${preset.id}`,
        kind: "route",
        origin: "manual",
        position: { x: preset.x + 0.5, y: -1, z: 0 },
      },
      {
        equipmentId: preset.id,
        id: `N-${preset.id}`,
        kind: "appliance",
        origin: "manual",
      },
    ],
    segments: [
      {
        fromNodeId: "M",
        id: `M-D-${preset.id}`,
        origin: "manual",
        toNodeId: `D-${preset.id}`,
      },
      {
        fromNodeId: `D-${preset.id}`,
        id: `D-${preset.id}-N`,
        origin: "manual",
        toNodeId: `N-${preset.id}`,
      },
    ],
  };
}

function assertPhysicalPlacement(
  preset: PresetCase,
  appliance: WorkbenchEquipment,
) {
  assert(appliance.wallAnchor, "Falta wallAnchor del artefacto.");
  assertEqual(appliance.wallAnchor.status, "anchored");
  assertEqual(appliance.wallAnchor.referenceId, "wall:preset:wall:0");
  assertClose(appliance.wallAnchor.orientationRadians, 0);
  assertClose(
    appliance.terminalConfig?.connectionHeightMeters,
    preset.expectedHeightMeters,
  );
  assertClose(
    appliance.terminalConfig?.lateralOffsetMeters,
    preset.expectedLateralMeters,
  );
  assertClose(
    appliance.terminalConfig?.verticalDropMeters,
    preset.expectedDropMeters,
  );
  assertEqual(appliance.terminalConfig?.outletSide, preset.expectedOutletSide);
  assertEqual(appliance.terminalConfig?.heightStatus, "suggested");
  assertPoint(appliance.connectionPoint, {
    x: preset.x,
    y: 0,
    z: preset.expectedEndHeightMeters,
  });
  assertPoint(appliance.bodyPoint, {
    x: preset.x,
    y: 0,
    z: preset.expectedEndHeightMeters,
  });
  assertPoint(appliance.wallAnchor.wallPoint, appliance.connectionPoint);
  assert(
    distanceBetween(appliance.bodyPoint, appliance.wallAnchor.wallPoint) <=
      EPSILON,
    "El cuerpo debe quedar apoyado sobre la pared confirmada.",
  );
}

function assertTerminalConnection(
  preset: PresetCase,
  fixture: ReturnType<typeof placedPresetEquipment>,
) {
  const branch =
    fixture.network.segments.find(
      (segment) => segment.id === `D-${preset.id}-N`,
    ) ?? null;

  assert(branch, "Falta rama terminal.");
  assertEqual(branch.vertices?.length, expectedTerminalVertices(preset).length);

  for (const [index, expected] of expectedTerminalVertices(preset).entries()) {
    assertPoint(branch.vertices?.[index], expected);
  }

  assertEqual(
    branch.accessories
      ?.map((accessory) => `${accessory.type}:${accessory.catalogFamilyId}`)
      .sort()
      .join(","),
    "elbow:codo-90-rosca-hembra,valve:llave-esferica",
  );
  assertEqual(fixture.inventory.status, "resolved");
  assertEqual(fixture.inventory.items.length, 2);
  assertEqual(fixture.materialTakeoff.status, "resolved");
  assertEqual(
    fixture.materialTakeoff.physicalMaterialQuantities.accessoryQuantity,
    2,
  );
  assertUnique(
    fixture.inventory.items.flatMap((item) => item.sourceIds),
  );
}

function expectedTerminalVertices(preset: PresetCase) {
  const vertices: Point2D[] = [
    {
      x: preset.x + 0.5,
      y: -1,
      z: preset.expectedHeightMeters,
    },
  ];

  if (preset.expectedLateralMeters > 0) {
    vertices.push({
      x: preset.x + preset.expectedLateralMeters,
      y: 0,
      z: preset.expectedHeightMeters,
    });
  }

  if (preset.expectedDropMeters > 0) {
    vertices.push({
      x: preset.x,
      y: 0,
      z: preset.expectedHeightMeters,
    });
  }

  return vertices;
}

function assertCalibratedSectionProjection(
  preset: PresetCase,
  fixture: ReturnType<typeof placedPresetEquipment>,
) {
  assertPresetSectionProjection(preset, fixture.sectionProjection);
  assertPresetSectionProjection(preset, fixture.routeOnlySectionProjection);
  assertMissingScaleBlocksSectionProjection(fixture);
}

function assertPresetSectionProjection(
  preset: PresetCase,
  projection: SectionRouteProjection,
) {
  const expectedY =
    200 + preset.expectedHeightMeters / SECTION_SCALE_METERS_PER_SOURCE_UNIT;
  const branch =
    projection.segments.find(
      (segment) => segment.segmentId === `D-${preset.id}-N`,
    ) ?? null;
  const appliance =
    projection.equipment.find((item) => item.equipmentId === preset.id) ??
    null;
  const valve =
    projection.accessories.find((item) => item.kind === "valve") ?? null;
  const terminal =
    projection.accessories.find((item) => item.kind === "rh_elbow") ?? null;

  assertEqual(projection.status, "resolved");
  assert(branch, "Falta rama terminal proyectada en corte.");
  assertEqual(
    branch.points.map((point) => point.source).join(","),
    "node,vertical,connection",
  );
  assertClose(branch.points[1]?.elevationMeters, preset.expectedHeightMeters);
  assertClose(branch.points[1]?.sectionPoint.y, expectedY);
  assertClose(branch.points[2]?.elevationMeters, preset.expectedHeightMeters);
  assertClose(branch.points[2]?.sectionPoint.y, expectedY);
  assert(appliance, "Falta artefacto proyectado en corte.");
  assertEqual(appliance.anchorStatus, "anchored");
  assertClose(appliance.zMeters, preset.expectedHeightMeters);
  assertPoint(appliance.planPoint, {
    x: preset.x,
    y: 0,
    z: preset.expectedHeightMeters,
  });
  assertPoint(appliance.bodyPlanPoint, {
    x: preset.x,
    y: 0,
    z: preset.expectedHeightMeters,
  });
  assertPoint(appliance.sectionPoint, {
    x: 100 + (preset.x / 6) * 60,
    y: expectedY,
  });
  assert(valve, "Falta llave proyectada en corte.");
  assert(terminal, "Falta terminal/RH proyectado en corte.");
  assertClose(valve.sectionPoint?.y, expectedY);
  assertClose(terminal.sectionPoint?.y, expectedY);
  assertEqual(projection.accessories.length, 2);
}

function assertMissingScaleBlocksSectionProjection(
  fixture: ReturnType<typeof placedPresetEquipment>,
) {
  const blocked = createSectionRouteProjection({
    equipment: fixture.equipment,
    inventory: fixture.inventory,
    link: sectionProjectionLink(),
    network: fixture.network,
    result: fixture.result,
    sectionScaleMetersPerSourceUnit: null,
    toleranceSource: EPSILON,
  });

  assertEqual(blocked.status, "pending");
  assertEqual(blocked.pendingItems[0]?.id, "section-route:section-scale");
  assertEqual(blocked.equipment.length, 0);
  assertEqual(blocked.accessories.length, 0);
  assertEqual(blocked.segments.length, 0);
}

function sectionProjectionLink(): SectionRouteProjectionLink {
  return {
    id: "section:preset-fixture",
    planEnd: { x: 6, y: -1 },
    planStart: { x: 0, y: -1 },
    registration: {
      positiveZSide: "left",
      referenceElevationMeters: 0,
      sectionEnd: { x: 160, y: 200 },
      sectionStart: { x: 100, y: 200 },
    },
  };
}

function fixtureClassificationIndex(): ClassificationIndex {
  return {
    "wall:preset": {
      assignmentId: "classification:wall:preset",
      category: "reference_wall",
      origin: "manual",
      rule: "fixture",
      status: "confirmed",
    },
  };
}

function fixtureDrawing(): NormalizedDrawing {
  return {
    bounds: {
      maxX: 6,
      maxY: 2,
      minX: 0,
      minY: 0,
    },
    fileName: "physical-preset-fixture.dxf",
    headerBounds: null,
    ignoredEntities: [],
    layers: [
      {
        color: null,
        colorIndex: null,
        id: "layer:walls",
        name: "walls",
        trueColor: null,
        trueColorValue: null,
        visible: true,
      },
    ],
    normalizedCounts: { line: 1 },
    rawEntityCounts: {
      BLOCKS: {},
      ENTITIES: { LINE: 1 },
    },
    supportedSourceTypes: ["LINE"],
    units: {
      code: null,
      label: null,
      source: "missing",
    },
    warnings: [],
    entities: [
      {
        color: null,
        end: { x: 6, y: 0 },
        id: "wall:preset",
        kind: "line",
        layer: "walls",
        sourcePath: "ENTITIES",
        sourceType: "LINE",
        start: { x: 0, y: 0 },
        visual: visualMetadata("walls", "LINE"),
      },
    ],
  };
}

function visualMetadata(
  layer: string,
  sourceEntityType: string,
): DrawingVisualMetadata {
  return {
    blockColor: null,
    blockColorIndex: null,
    blockName: null,
    blockTrueColor: null,
    blockTrueColorValue: null,
    colorSource: "default",
    explicitColor: null,
    explicitColorIndex: null,
    explicitTrueColor: null,
    explicitTrueColorValue: null,
    layerColor: null,
    layerColorIndex: null,
    layerTrueColor: null,
    layerTrueColorValue: null,
    lineType: null,
    lineweight: null,
    originalLayer: layer,
    resolvedColor: null,
    resolvedLayer: layer,
    sourceEntityType,
  };
}

function assertPoint(actual: Point2D | null | undefined, expected: Point2D) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);

  if (expected.z !== undefined) {
    assertClose(actual.z, expected.z);
  }
}

function distanceBetween(
  first: Point2D | null | undefined,
  second: Point2D | null | undefined,
) {
  if (!first || !second) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.hypot(first.x - second.x, first.y - second.y);
}

function verify(
  results: PhysicalPresetPlacementVerificationResult[],
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
  console.log(JSON.stringify(runPhysicalPresetPlacementVerifications(), null, 2));
}
