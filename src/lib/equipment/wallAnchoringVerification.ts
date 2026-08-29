import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  DrawingVisualMetadata,
  NormalizedDrawing,
  Point2D,
} from "@/lib/geometry/types";
import type { ClassificationIndex } from "@/lib/semantic/types";
import { resolveEquipmentPhysicalPlacement } from "./wallAnchoring";

export type WallAnchoringVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;

export function runWallAnchoringVerifications() {
  const results: WallAnchoringVerificationResult[] = [];

  verify(
    results,
    "10.7A cocina junto a pared queda anclada y apoyada",
    () => {
      const drawing = fixtureDrawing();
      const classificationIndex = fixtureClassificationIndex();
      const placement = resolveEquipmentPhysicalPlacement({
        classificationIndex,
        drawing,
        heightMeters: 0.85,
        point: { x: 2, y: 0.18 },
        role: "appliance",
        scaleMetersPerSourceUnit: 1,
        snapToleranceSource: 0.5,
        source: "dxf",
      });
      const equipment = fixtureStove(placement);

      assert(equipment.wallAnchor, "Falta wallAnchor.");
      assertEqual(equipment.wallAnchor.status, "anchored");
      assertEqual(equipment.wallAnchor.referenceId, "wall:1:wall:0");
      assertEqual(equipment.wallAnchor.referenceKind, "reference_wall");
      assertClose(equipment.wallAnchor.orientationRadians, 0);
      assertClose(equipment.wallAnchor.distanceSource, 0.18);
      assertPoint(equipment.connectionPoint, { x: 2, y: 0, z: 0.85 });
      assertPoint(equipment.bodyPoint, { x: 2, y: 0, z: 0.85 });
      assert(
        samePoint(equipment.wallAnchor.wallPoint, equipment.bodyPoint),
        "El cuerpo debe quedar apoyado sobre la pared confirmada.",
      );
      assert(
        equipment.connectionPoint === placement.connectionPoint,
        "routeNetwork/calculo debe seguir usando el connectionPoint fisico.",
      );
    },
  );

  verify(results, "10.7A sin pared cercana conserva posicion libre pendiente", () => {
    const placement = resolveEquipmentPhysicalPlacement({
      classificationIndex: fixtureClassificationIndex(),
      drawing: fixtureDrawing(),
      heightMeters: 0.85,
      point: { x: 2, y: 2 },
      role: "appliance",
      scaleMetersPerSourceUnit: 1,
      snapToleranceSource: 0.1,
      source: "dxf",
    });

    assert(placement.wallAnchor, "Falta wallAnchor pendiente.");
    assertEqual(placement.wallAnchor.status, "pending");
    assertPoint(placement.connectionPoint, { x: 2, y: 2, z: 0.85 });
    assertPoint(placement.bodyPoint, { x: 2, y: 2, z: 0.85 });
  });

  return results;
}

function fixtureStove(
  placement: ReturnType<typeof resolveEquipmentPhysicalPlacement>,
): WorkbenchEquipment {
  return {
    id: "equipment:stove",
    planBaseId: "plan:fixture",
    role: "appliance",
    type: "stove",
    name: "Cocina",
    bodyPoint: placement.bodyPoint,
    connectionPoint: placement.connectionPoint,
    wallAnchor: placement.wallAnchor ?? undefined,
    demandValue: 8500,
    demandUnit: "kcal_h",
    source: "manual",
  };
}

function fixtureClassificationIndex(): ClassificationIndex {
  return {
    "wall:1": {
      assignmentId: "classification:wall",
      category: "reference_wall",
      origin: "manual",
      rule: "fixture",
      status: "confirmed",
    },
  };
}

function fixtureDrawing(): NormalizedDrawing {
  return {
    fileName: "wall-anchor-fixture.dxf",
    units: {
      code: null,
      label: null,
      source: "missing",
    },
    layers: [
      {
        id: "layer:walls",
        name: "walls",
        visible: true,
        color: null,
        colorIndex: null,
        trueColor: null,
        trueColorValue: null,
      },
    ],
    entities: [
      {
        id: "wall:1",
        kind: "line",
        layer: "walls",
        sourceType: "LINE",
        sourcePath: "ENTITIES",
        color: null,
        visual: visualMetadata("walls", "LINE"),
        start: { x: 0, y: 0 },
        end: { x: 5, y: 0 },
      },
    ],
    bounds: {
      minX: 0,
      minY: 0,
      maxX: 5,
      maxY: 2,
    },
    headerBounds: null,
    rawEntityCounts: {
      ENTITIES: { LINE: 1 },
      BLOCKS: {},
    },
    normalizedCounts: { line: 1 },
    supportedSourceTypes: ["LINE"],
    ignoredEntities: [],
    warnings: [],
  };
}

function visualMetadata(
  layer: string,
  sourceEntityType: string,
): DrawingVisualMetadata {
  return {
    originalLayer: layer,
    resolvedLayer: layer,
    explicitColor: null,
    explicitColorIndex: null,
    explicitTrueColor: null,
    explicitTrueColorValue: null,
    layerColor: null,
    layerColorIndex: null,
    layerTrueColor: null,
    layerTrueColorValue: null,
    blockColor: null,
    blockColorIndex: null,
    blockTrueColor: null,
    blockTrueColorValue: null,
    resolvedColor: null,
    colorSource: "default",
    lineType: null,
    lineweight: null,
    blockName: null,
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

function samePoint(
  first: Point2D | null | undefined,
  second: Point2D | null | undefined,
) {
  return (
    Boolean(first && second) &&
    Math.hypot((first?.x ?? 0) - (second?.x ?? 0), (first?.y ?? 0) - (second?.y ?? 0)) <=
      EPSILON &&
    Math.abs((first?.z ?? 0) - (second?.z ?? 0)) <= EPSILON
  );
}

function verify(
  results: WallAnchoringVerificationResult[],
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
  console.log(JSON.stringify(runWallAnchoringVerifications(), null, 2));
}
