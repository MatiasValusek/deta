import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  DrawingPrimitive,
  DrawingVisualMetadata,
  NormalizedDrawing,
  Point2D,
} from "@/lib/geometry/types";
import { generateAutomaticRouteProposal } from "@/lib/routing/autoProposal";
import { resolveRouteSegments, routeSegmentPlanLegs } from "@/lib/routing/network";
import type { AutomaticRouteProposal } from "@/lib/routing/types";
import type {
  ClassificationProposal,
  ConfirmedClassification,
} from "@/lib/semantic/types";
import {
  buildArchitecturalRouteContext,
  type ArchitecturalRouteContext,
} from "./routeContext";

export type ArchitecturalRouteVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const PLAN_BASE_ID = "plan:architecture-route";

export function runArchitecturalRouteVerifications() {
  const results: ArchitecturalRouteVerificationResult[] = [];

  verify(results, "01A conserva restricciones y separa roles arquitectonicos", () => {
    const drawing = fixtureDrawing([
      line("hard", "columnas", point(4, -1), point(4, 4)),
      line("wall", "muros", point(0, 0), point(10, 0)),
      line("opening", "puertas", point(2, 0), point(3, 0)),
      line("pending-hard", "vigas", point(6, -1), point(6, 4)),
      line("trusted-wall", "paredes", point(0, 3), point(10, 3)),
    ]);
    const context = buildArchitecturalRouteContext({
      assignments: [
        assignment("confirmed-hard", "hard_structure", ["hard"]),
        assignment("confirmed-wall", "reference_wall", ["wall"]),
      ],
      constraints: [
        {
          active: true,
          id: "manual-avoid",
          origin: "manual",
          pageNumber: null,
          polygon: [point(20, 20), point(21, 20), point(21, 21)],
          source: "dxf",
          type: "avoid_zone",
        },
      ],
      drawing,
      minSegmentLengthSource: 0.0001,
      pageNumber: null,
      proposals: [
        proposal("opening-proposal", "opening", ["opening"], 0.92),
        proposal("hard-proposal", "hard_structure", ["pending-hard"], 0.86),
        proposal("wall-proposal", "reference_wall", ["trusted-wall"], 0.92),
      ],
      source: "dxf",
      viewType: "plan",
    });

    assertDeepEqual(
      context.restrictions.map((restriction) => restriction.id).sort(),
      ["hard-structure:hard:line", "manual-avoid"],
    );
    assertDeepEqual(
      context.guides.map((guide) => guide.id).sort(),
      [
        "classification_proposal:trusted-wall:segment:0",
        "confirmed_assignment:wall:segment:0",
      ],
    );
    assertEqual(context.openings.length, 1);
    assertEqual(context.openings[0]?.referenceId, "opening");
    assertEqual(context.pendingStructures.length, 1);
    assertEqual(context.pendingStructures[0]?.referenceId, "pending-hard");
    assertEqual(context.pendingStructures[0]?.state, "pending");
    assertEqual(context.pendingStructures[0]?.origin, "classification_proposal");

    const sectionContext = buildArchitecturalRouteContext({
      assignments: [assignment("confirmed-wall", "reference_wall", ["wall"])],
      constraints: [],
      drawing,
      pageNumber: null,
      proposals: [],
      source: "dxf",
      viewType: "section",
    });
    assertEqual(sectionContext.guides.length, 0);
  });

  verify(results, "01A una guia confiable desempata sin alargar el recorrido", () => {
    const baseline = routeProposal();
    const guided = routeProposal({
      guides: [
        {
          from: point(0, 0),
          id: "wall:y0",
          pageNumber: null,
          source: "dxf",
          state: "confirmed",
          to: point(10, 0),
        },
      ],
    });

    assertEqual(baseline.status, "ready");
    assertEqual(guided.status, "ready");
    assertClose(guided.lengthSource, baseline.lengthSource);
    assertEqual(guided.turnCount, baseline.turnCount);
    assert(routeUsesPoint(baseline, point(0, 10)), "Falta el desempate base esperado.");
    assert(routeUsesPoint(guided, point(10, 0)), "La guia no influyo en el desempate.");
    assertEqual(guided.validation.restrictionCount, 0);
  });

  verify(results, "01A estructura pendiente advierte pero no bloquea", () => {
    const context = emptyContext({
      pendingStructures: [
        {
          category: "hard_structure",
          confidence: 0.86,
          geometry: {
            from: point(5, -2),
            kind: "segment",
            to: point(5, 12),
          },
          id: "classification_proposal:pending:segment:0",
          origin: "classification_proposal",
          pageNumber: null,
          referenceId: "pending",
          role: "unverified",
          source: "dxf",
          state: "pending",
        },
      ],
    });
    const proposalResult = routeProposal(context);

    assertEqual(proposalResult.status, "ready");
    assertEqual(proposalResult.validation.canAccept, true);
    assertEqual(proposalResult.validation.restrictionCount, 0);
    assertEqual(proposalResult.architecturalWarnings.length, 1);
    assertDeepEqual(proposalResult.architecturalWarnings[0]?.featureIds, ["pending"]);
  });

  verify(results, "01A estructura confirmada conserva el bloqueo duro", () => {
    const restriction = {
      from: point(5, -2),
      id: "hard-structure:confirmed:line",
      kind: "segment" as const,
      to: point(5, 6),
    };
    const proposalResult = routeProposal(
      emptyContext({
        guides: [
          {
            from: point(0, 0),
            id: "wall:blocked-axis",
            pageNumber: null,
            source: "dxf",
            state: "confirmed",
            to: point(10, 0),
          },
        ],
        restrictions: [restriction],
      }),
      point(10, 0),
    );

    assertEqual(proposalResult.status, "ready");
    assertEqual(proposalResult.validation.restrictionCount, 0);
    assert(
      proposalResult.lengthSource > 10,
      "La propuesta no se desvio de la estructura confirmada.",
    );
  });

  return results;
}

function routeProposal(
  architecture: Partial<ArchitecturalRouteContext> = {},
  appliancePoint = point(10, 10),
) {
  const equipment = fixtureEquipment(appliancePoint);

  return generateAutomaticRouteProposal({
    architecture: emptyContext(architecture),
    bounds: { maxX: 10, maxY: 10, minX: 0, minY: 0 },
    equipment,
    fingerprint: "architecture-route-verification",
    marginMeters: 0,
    minSegmentLengthSource: EPSILON,
    planBaseId: PLAN_BASE_ID,
    restrictions: architecture.restrictions ?? [],
    scaleMetersPerSourceUnit: 1,
  });
}

function emptyContext(
  overrides: Partial<ArchitecturalRouteContext> = {},
): ArchitecturalRouteContext {
  return {
    features: [],
    guides: [],
    openings: [],
    pendingStructures: [],
    restrictions: [],
    ...overrides,
  };
}

function fixtureEquipment(appliancePoint: Point2D): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: point(0, 0),
      id: "meter",
      name: "Medidor",
      planBaseId: PLAN_BASE_ID,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: appliancePoint,
      demandUnit: "kcal_h",
      demandValue: 2500,
      id: "stove",
      name: "Cocina",
      planBaseId: PLAN_BASE_ID,
      role: "appliance",
      source: "manual",
      type: "stove",
    },
  ];
}

function routeUsesPoint(proposalResult: AutomaticRouteProposal, expected: Point2D) {
  return resolveRouteSegments(
    { nodes: proposalResult.nodes, segments: proposalResult.segments },
    fixtureEquipment(point(10, 10)),
  ).some((segment) =>
    routeSegmentPlanLegs(segment).some(
      (leg) => samePoint(leg.from, expected) || samePoint(leg.to, expected),
    ),
  );
}

function fixtureDrawing(entities: DrawingPrimitive[]): NormalizedDrawing {
  return {
    bounds: { maxX: 21, maxY: 21, minX: 0, minY: -1 },
    entities,
    fileName: "architecture-route-fixture.dxf",
    headerBounds: null,
    ignoredEntities: [],
    layers: [],
    normalizedCounts: { line: entities.length },
    rawEntityCounts: { BLOCKS: {}, ENTITIES: { LINE: entities.length } },
    supportedSourceTypes: ["LINE"],
    units: { code: null, label: null, source: "missing" },
    warnings: [],
  };
}

function line(
  id: string,
  layer: string,
  start: Point2D,
  end: Point2D,
): DrawingPrimitive {
  return {
    color: null,
    end,
    id,
    kind: "line",
    layer,
    sourcePath: "ENTITIES",
    sourceType: "LINE",
    start,
    visual: visualMetadata(layer),
  };
}

function visualMetadata(layer: string): DrawingVisualMetadata {
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
    sourceEntityType: "LINE",
  };
}

function assignment(
  id: string,
  category: ConfirmedClassification["category"],
  entityIds: string[],
): ConfirmedClassification {
  return {
    category,
    entityIds,
    id,
    origin: "manual",
    rule: "verification",
    status: "confirmed",
  };
}

function proposal(
  id: string,
  category: ClassificationProposal["category"],
  entityIds: string[],
  confidence: number,
): ClassificationProposal {
  return {
    category,
    confidence,
    entityIds,
    explanation: "verification",
    id,
    signals: [{ reason: "verification", source: "layer", value: id }],
    status: "pending",
  };
}

function point(x: number, y: number): Point2D {
  return { x, y };
}

function samePoint(first: Point2D, second: Point2D) {
  return (
    Math.abs(first.x - second.x) <= EPSILON &&
    Math.abs(first.y - second.y) <= EPSILON
  );
}

function verify(
  results: ArchitecturalRouteVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertDeepEqual(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
  );
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(actual === expected, `Expected ${String(expected)}, got ${String(actual)}.`);
}

function assertClose(actual: number, expected: number) {
  assert(
    Math.abs(actual - expected) <= EPSILON,
    `Expected ${expected}, got ${actual}.`,
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
  console.log(JSON.stringify(runArchitecturalRouteVerifications(), null, 2));
}
