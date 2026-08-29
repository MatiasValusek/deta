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
import type { ClassificationIndex } from "@/lib/semantic/types";
import {
  confirmEquipmentTerminalConfig,
  createSuggestedEquipmentTerminalConfig,
} from "./terminalConfig";
import type { EquipmentType, WorkbenchEquipment } from "./types";
import { APPLIANCE_WALL_OFFSET_METERS, resolveEquipmentPhysicalPlacement } from "./wallAnchoring";

export type PhysicalPresetPlacementVerificationResult = {
  name: string;
  status: "passed";
};

type PresetCase = {
  demandValue: number;
  expectedHeightMeters: number;
  id: string;
  name: string;
  type: EquipmentType;
  x: number;
};

const EPSILON = 0.000001;
const SCALE_METERS_PER_SOURCE_UNIT = 1;
const PRESET_CASES: PresetCase[] = [
  {
    demandValue: 8500,
    expectedHeightMeters: 1.1,
    id: "stove",
    name: "Cocina",
    type: "stove",
    x: 1,
  },
  {
    demandValue: 3000,
    expectedHeightMeters: 0.3,
    id: "space-heater",
    name: "Calefactor",
    type: "space_heater",
    x: 3,
  },
  {
    demandValue: 8500,
    expectedHeightMeters: 1.6,
    id: "water-heater",
    name: "Calefon",
    type: "instant_water_heater",
    x: 5,
  },
];

export function runPhysicalPresetPlacementVerifications() {
  const results: PhysicalPresetPlacementVerificationResult[] = [];

  verify(
    results,
    "10.7E presets fisicos anclan artefactos y terminal coherente",
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

  const placement = resolveEquipmentPhysicalPlacement({
    classificationIndex: fixtureClassificationIndex(),
    drawing: fixtureDrawing(),
    heightMeters: terminalConfig.connectionHeightMeters ?? 0,
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

  return {
    appliance,
    equipment,
    inventory,
    materialTakeoff,
    network: terminalUpdate.network,
    result,
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
  assertEqual(appliance.terminalConfig?.heightStatus, "suggested");
  assertPoint(appliance.connectionPoint, {
    x: preset.x,
    y: 0,
    z: preset.expectedHeightMeters,
  });
  assertPoint(appliance.bodyPoint, {
    x: preset.x,
    y: APPLIANCE_WALL_OFFSET_METERS,
    z: preset.expectedHeightMeters,
  });
  assertPoint(appliance.wallAnchor.wallPoint, appliance.connectionPoint);
  assert(
    distanceBetween(appliance.connectionPoint, appliance.bodyPoint) > EPSILON,
    "El punto fisico de gas debe estar separado del centro visual.",
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
  assertEqual(branch.vertices?.length, 1);
  assertPoint(branch.vertices?.[0], {
    x: preset.x + 0.5,
    y: -1,
    z: preset.expectedHeightMeters,
  });
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
