import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  DrawingPrimitive,
  DrawingVisualMetadata,
  NormalizedDrawing,
  Point2D,
} from "@/lib/geometry/types";
import type { ClassificationIndex } from "@/lib/semantic/types";
import {
  resolveEquipmentPhysicalPlacement,
  resolveEquipmentPhysicalPlacementAlternatives,
} from "./wallAnchoring";

export type WallAnchoringVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;

type FixtureLayer = Pick<
  NormalizedDrawing["layers"][number],
  "name" | "visible"
>;

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

  verify(results, "10.8B1 click cerca de pared visible usa escala fisica", () => {
    const placement = resolveEquipmentPhysicalPlacement({
      classificationIndex: {},
      drawing: fixtureDrawing({
        bounds: {
          minX: 0,
          minY: 0,
          maxX: 10,
          maxY: 70,
        },
        layers: [
          fixtureLayer("hidden-walls", false),
          fixtureLayer("visible-walls", true),
        ],
        entities: [
          fixtureLine(
            "wall:hidden",
            "hidden-walls",
            { x: 0, y: 64 },
            { x: 10, y: 64 },
          ),
          fixtureLine(
            "wall:visible",
            "visible-walls",
            { x: 0, y: 30 },
            { x: 10, y: 30 },
          ),
        ],
      }),
      heightMeters: 0.85,
      point: { x: 5, y: 65 },
      role: "appliance",
      scaleMetersPerSourceUnit: 0.01,
      source: "dxf",
    });

    assert(placement.wallAnchor, "Falta wallAnchor.");
    assertEqual(placement.wallAnchor.status, "anchored");
    assertEqual(placement.wallAnchor.referenceId, "wall:visible:wall:0");
    assertClose(placement.wallAnchor.distanceSource, 35);
    assertPoint(placement.connectionPoint, { x: 5, y: 30, z: 0.85 });
  });

  verify(results, "10.8B1 dos paredes similares ofrecen dos opciones", () => {
    const alternatives = resolveEquipmentPhysicalPlacementAlternatives({
      classificationIndex: wallClassificationIndex("wall:a", "wall:b"),
      drawing: fixtureDrawing({
        entities: [
          fixtureLine("wall:a", "walls", { x: 0, y: 0 }, { x: 5, y: 0 }),
          fixtureLine("wall:b", "walls", { x: 0, y: 0.18 }, { x: 5, y: 0.18 }),
        ],
      }),
      heightMeters: 0.85,
      point: { x: 2, y: 0.08 },
      role: "appliance",
      scaleMetersPerSourceUnit: 1,
      snapToleranceSource: 0.5,
      source: "dxf",
    });

    assertEqual(alternatives.length, 2);
    assertEqual(alternatives[0].wallAnchor.referenceId, "wall:a:wall:0");
    assertEqual(alternatives[1].wallAnchor.referenceId, "wall:b:wall:0");
  });

  verify(results, "10.8B1 pared no competitiva no ofrece segunda opcion", () => {
    const alternatives = resolveEquipmentPhysicalPlacementAlternatives({
      classificationIndex: wallClassificationIndex("wall:a", "wall:b"),
      drawing: fixtureDrawing({
        entities: [
          fixtureLine("wall:a", "walls", { x: 0, y: 0 }, { x: 5, y: 0 }),
          fixtureLine("wall:b", "walls", { x: 0, y: 0.7 }, { x: 5, y: 0.7 }),
        ],
      }),
      heightMeters: 0.85,
      point: { x: 2, y: 0.08 },
      role: "appliance",
      scaleMetersPerSourceUnit: 1,
      snapToleranceSource: 0.8,
      source: "dxf",
    });

    assertEqual(alternatives.length, 1);
    assertEqual(alternatives[0].wallAnchor.referenceId, "wall:a:wall:0");
  });

  verify(results, "10.8B1 click directo sobre linea sin senal usa fallback", () => {
    const drawing = fixtureDrawing({
      layers: [fixtureLayer("0", true)],
      entities: [
        fixtureLine("raw:line", "0", { x: 0, y: 0 }, { x: 5, y: 0 }),
      ],
    });
    const near = resolveEquipmentPhysicalPlacement({
      classificationIndex: {},
      drawing,
      heightMeters: 0.85,
      point: { x: 2, y: 0.2 },
      role: "appliance",
      scaleMetersPerSourceUnit: 1,
      snapToleranceSource: 0.5,
      source: "dxf",
    });
    const direct = resolveEquipmentPhysicalPlacement({
      classificationIndex: {},
      drawing,
      heightMeters: 0.85,
      point: { x: 2, y: 0.04 },
      role: "appliance",
      scaleMetersPerSourceUnit: 1,
      snapToleranceSource: 0.5,
      source: "dxf",
    });

    assert(near.wallAnchor, "Falta wallAnchor pendiente.");
    assertEqual(near.wallAnchor.status, "pending");
    assert(direct.wallAnchor, "Falta wallAnchor directo.");
    assertEqual(direct.wallAnchor.status, "anchored");
    assertEqual(direct.wallAnchor.referenceId, "raw:line:wall:0");
    assertClose(direct.wallAnchor.distanceSource, 0.04);
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
  return wallClassificationIndex("wall:1");
}

function wallClassificationIndex(...entityIds: string[]): ClassificationIndex {
  const index: ClassificationIndex = {};

  for (const entityId of entityIds) {
    index[entityId] = {
      assignmentId: `classification:${entityId}`,
      category: "reference_wall",
      origin: "manual",
      rule: "fixture",
      status: "confirmed",
    };
  }

  return index;
}

function fixtureDrawing(
  params: {
    bounds?: NormalizedDrawing["bounds"];
    entities?: DrawingPrimitive[];
    layers?: FixtureLayer[];
  } = {},
): NormalizedDrawing {
  const entities =
    params.entities ?? [
      fixtureLine("wall:1", "walls", { x: 0, y: 0 }, { x: 5, y: 0 }),
    ];
  const layers = params.layers ?? [fixtureLayer("walls", true)];

  return {
    fileName: "wall-anchor-fixture.dxf",
    units: {
      code: null,
      label: null,
      source: "missing",
    },
    layers: layers.map((layer, index) => ({
      id: `layer:${index}`,
      name: layer.name,
      visible: layer.visible,
      color: null,
      colorIndex: null,
      trueColor: null,
      trueColorValue: null,
    })),
    entities,
    bounds: params.bounds ?? {
      minX: 0,
      minY: 0,
      maxX: 5,
      maxY: 2,
    },
    headerBounds: null,
    rawEntityCounts: {
      ENTITIES: { LINE: entities.length },
      BLOCKS: {},
    },
    normalizedCounts: { line: entities.length },
    supportedSourceTypes: ["LINE"],
    ignoredEntities: [],
    warnings: [],
  };
}

function fixtureLayer(name: string, visible: boolean): FixtureLayer {
  return { name, visible };
}

function fixtureLine(
  id: string,
  layer: string,
  start: Point2D,
  end: Point2D,
): DrawingPrimitive {
  return {
    id,
    kind: "line",
    layer,
    sourceType: "LINE",
    sourcePath: "ENTITIES",
    color: null,
    visual: visualMetadata(layer, "LINE"),
    start,
    end,
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
