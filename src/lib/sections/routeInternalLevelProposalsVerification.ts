import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { resolveRouteSegments } from "@/lib/routing/network";
import type { ManualRouteNetwork, RouteSegment } from "@/lib/routing/types";
import { generateAutomaticInternalLevelChanges } from "./routeInternalLevelProposals";

const EPSILON = 0.000001;

export type RouteInternalLevelProposalVerificationResult = {
  name: string;
  status: "passed";
};

export function runRouteInternalLevelProposalVerifications() {
  const results: RouteInternalLevelProposalVerificationResult[] = [];

  verify(results, "01C-C2 genera varios cambios internos sobre una copia", () => {
    const fixture = multiLevelFixture();
    const original = JSON.stringify(fixture.network);
    const result = generateAutomaticInternalLevelChanges(fixture);
    const alternative = result.alternatives[0];

    assertEqual(result.status, "ready");
    assertEqual(result.requiredChangeCount, 2);
    assert(alternative, "Falta alternativa interna.");
    assertEqual(alternative.changes.length, 2);
    assertEqual(JSON.stringify(fixture.network), original);
    assert(
      alternative.interferences.every(
        (item) =>
          item.kind === "unverified_3d_clearance" &&
          item.status === "unverified",
      ),
      "Las incertidumbres 3D no quedaron explicitas.",
    );
  });

  verify(results, "01C-C2 conserva ortogonalidad y cotas confirmadas", () => {
    const fixture = multiLevelFixture();
    const result = generateAutomaticInternalLevelChanges(fixture);
    const alternative = requiredAlternative(result.alternatives);
    const originalNodeHeights = fixture.network.nodes.map(
      (node) => node.position?.z ?? null,
    );
    const candidateNodeHeights = alternative.network.nodes.map(
      (node) => node.position?.z ?? null,
    );

    assertEqual(
      JSON.stringify(candidateNodeHeights),
      JSON.stringify(originalNodeHeights),
    );

    for (const segment of resolveRouteSegments(
      alternative.network,
      fixture.equipment,
    )) {
      for (let index = 0; index < segment.path.length - 1; index += 1) {
        const from = segment.path[index];
        const to = segment.path[index + 1];
        assert(from && to, "Falta punto de geometria.");
        const samePlan = close(from.x, to.x) && close(from.y, to.y);
        const sameZ = close(from.z ?? 0, to.z ?? 0);
        assert(samePlan || sameZ, `Pata diagonal en ${segment.id}.`);
      }
    }

    assert(
      alternative.changes.every((change) =>
        resolveRouteSegments(alternative.network, fixture.equipment)
          .find((segment) => segment.id === change.segmentId)
          ?.path.some(
            (point, index, path) =>
              index > 0 &&
              close(point.x, path[index - 1]?.x ?? Number.NaN) &&
              close(point.y, path[index - 1]?.y ?? Number.NaN) &&
              !close(point.z ?? 0, path[index - 1]?.z ?? 0),
          ),
      ),
      "No todos los cambios tienen XY constante.",
    );
  });

  verify(results, "01C-C2 resuelve derivaciones con cotas distintas", () => {
    const fixture = branchedFixture();
    const result = generateAutomaticInternalLevelChanges(fixture);
    const alternative = requiredAlternative(result.alternatives);

    assertEqual(result.requiredChangeCount, 2);
    assertEqual(
      alternative.changes.map((change) => change.segmentId).join(","),
      "C-B,C-D",
    );
  });

  verify(results, "01C-C2 bloquea obstaculos confirmados", () => {
    const fixture = singleLevelChangeFixture();
    const result = generateAutomaticInternalLevelChanges({
      ...fixture,
      restrictions: [
        {
          id: "obstacle",
          kind: "polygon",
          polygon: [
            { x: -1, y: -1 },
            { x: 5, y: -1 },
            { x: 5, y: 1 },
            { x: -1, y: 1 },
          ],
        },
      ],
    });

    assertEqual(result.status, "incomplete");
    assertEqual(result.alternatives.length, 0);
    assert(
      result.diagnostics.some(
        (item) => item.code === "professional_location_required",
      ),
      "Falta pedir definicion profesional.",
    );
  });

  verify(results, "01C-C2 regeneracion no duplica montantes", () => {
    const fixture = multiLevelFixture();
    const first = generateAutomaticInternalLevelChanges(fixture);
    const alternative = requiredAlternative(first.alternatives);
    const regenerated = generateAutomaticInternalLevelChanges({
      ...fixture,
      network: alternative.network,
    });

    assertEqual(regenerated.status, "not_needed");
    assertEqual(regenerated.requiredChangeCount, 0);
    assertEqual(regenerated.alternatives.length, 0);
  });

  verify(results, "01C-C2 conserva accesorios manuales y SIGAS", () => {
    const fixture = multiLevelFixture();
    const before = JSON.stringify(
      fixture.network.segments.flatMap((segment) => segment.accessories ?? []),
    );
    const result = generateAutomaticInternalLevelChanges(fixture);
    const alternative = requiredAlternative(result.alternatives);
    const after = JSON.stringify(
      alternative.network.segments.flatMap(
        (segment) => segment.accessories ?? [],
      ),
    );

    assertEqual(after, before);
  });

  verify(results, "01C-C2 acota comparacion con varias alternativas", () => {
    const fixture = performanceFixture(6);
    const startedAt = Date.now();
    const result = generateAutomaticInternalLevelChanges(fixture);
    const elapsedMs = Date.now() - startedAt;

    assertEqual(result.status, "ready");
    assert(result.truncated, "No se informo el limite de alternativas.");
    assert(result.alternatives.length <= 32, "Se excedio el limite de alternativas.");
    assert(elapsedMs < 1000, `La generacion demoro ${elapsedMs} ms.`);
  });

  verify(results, "01C-C2 proyecto anterior sin cotas verificadas sigue compatible", () => {
    const fixture = singleLevelChangeFixture();
    fixture.network.nodes.forEach((node) => {
      delete node.elevation;
    });
    const result = generateAutomaticInternalLevelChanges(fixture);

    assertEqual(result.status, "not_needed");
    assertEqual(result.alternatives.length, 0);
  });

  return results;
}

function multiLevelFixture(): {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  scaleMetersPerSourceUnit: number;
} {
  const first = segment("A-B", "A", "B", [
    { x: 1, y: 0 },
    { x: 3, y: 0 },
  ]);
  first.accessories = [
    {
      catalogCode: "SIGAS-CONFIRMED",
      catalogFamilyId: "codo-90",
      equivalentLengthMetersPerUnit: 0.3,
      equivalentLengthSource: "pipe_system",
      id: "sigas-existing",
      origin: "user_confirmed",
      quantity: 1,
      segmentId: first.id,
      type: "elbow",
    },
    {
      equivalentLengthMetersPerUnit: 0.2,
      equivalentLengthSource: "manual",
      id: "manual-existing",
      origin: "manual",
      quantity: 1,
      segmentId: first.id,
      type: "other",
    },
  ];

  return {
    equipment: [],
    network: {
      nodes: [
        confirmedNode("A", 0, 0, 0),
        confirmedNode("B", 4, 0, 1),
        confirmedNode("C", 4, 4, 2),
      ],
      segments: [first, segment("B-C", "B", "C", [{ x: 4, y: 2 }])],
    },
    scaleMetersPerSourceUnit: 1,
  };
}

function singleLevelChangeFixture() {
  const fixture = multiLevelFixture();
  return {
    ...fixture,
    network: {
      nodes: fixture.network.nodes.slice(0, 2),
      segments: fixture.network.segments.slice(0, 1),
    },
  };
}

function branchedFixture() {
  return {
    equipment: [] as WorkbenchEquipment[],
    network: {
      nodes: [
        confirmedNode("C", 0, 0, 0),
        confirmedNode("B", 3, 0, 1),
        confirmedNode("D", 0, 3, 2),
      ],
      segments: [
        segment("C-B", "C", "B", [{ x: 1.5, y: 0 }]),
        segment("C-D", "C", "D", [{ x: 0, y: 1.5 }]),
      ],
    },
    scaleMetersPerSourceUnit: 1,
  };
}

function performanceFixture(changeCount: number) {
  const nodes = [];
  const segments: RouteSegment[] = [];

  for (let index = 0; index < changeCount; index += 1) {
    const fromId = `F${index}`;
    const toId = `T${index}`;
    nodes.push(confirmedNode(fromId, index * 3, 0, 0));
    nodes.push(confirmedNode(toId, index * 3 + 2, 0, 1));
    segments.push(segment(`S${index}`, fromId, toId, []));
  }

  return {
    equipment: [] as WorkbenchEquipment[],
    network: { nodes, segments },
    scaleMetersPerSourceUnit: 1,
  };
}

function confirmedNode(id: string, x: number, y: number, z: number) {
  return {
    elevation: { source: "professional_edit" as const, status: "confirmed" as const },
    id,
    kind: "route" as const,
    position: { x, y, z },
  };
}

function segment(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  vertices: Array<{ x: number; y: number }>,
): RouteSegment {
  return {
    fromNodeId,
    id,
    toNodeId,
    vertexElevations: vertices.map(() => null),
    vertices,
  };
}

function requiredAlternative<T>(alternatives: T[]) {
  const alternative = alternatives[0];
  assert(alternative, "Falta alternativa recomendada.");
  return alternative;
}

function verify(
  results: RouteInternalLevelProposalVerificationResult[],
  name: string,
  run: () => void,
) {
  run();
  results.push({ name, status: "passed" });
}

function close(actual: number, expected: number) {
  return Math.abs(actual - expected) <= EPSILON;
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(
    actual === expected,
    `Expected ${String(expected)}, got ${String(actual)}`,
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
  console.log(
    JSON.stringify(runRouteInternalLevelProposalVerifications(), null, 2),
  );
}
