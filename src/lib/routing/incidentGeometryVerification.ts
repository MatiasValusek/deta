import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  angleBetweenRouteDirections,
  resolveIncidentRouteGeometry,
} from "./incidentGeometry";

export type IncidentGeometryVerificationResult = {
  name: string;
  status: "passed";
};

export function runIncidentGeometryVerifications() {
  const results: IncidentGeometryVerificationResult[] = [];

  verify(results, "horizontal y vertical comparten XY", () => {
    const geometry = resolveAtCenter(verticalTurnNetwork());

    assertEqual(geometry.incident.length, 2);
    assertEqual(geometry.unresolvedSegmentIds.length, 0);
    assertClose(
      angleBetweenRouteDirections(
        geometry.incident[0]?.vector as NonNullable<
          (typeof geometry.incident)[number]
        >["vector"],
        geometry.incident[1]?.vector as NonNullable<
          (typeof geometry.incident)[number]
        >["vector"],
      ),
      90,
    );
  });

  verify(results, "horizontal colineal", () => {
    const geometry = resolveAtCenter(horizontalNetwork());

    assertEqual(geometry.incident.length, 2);
    assertClose(
      angleBetweenRouteDirections(
        geometry.incident[0]?.vector as NonNullable<
          (typeof geometry.incident)[number]
        >["vector"],
        geometry.incident[1]?.vector as NonNullable<
          (typeof geometry.incident)[number]
        >["vector"],
      ),
      180,
    );
  });

  verify(results, "usa el vertice adyacente y no la cuerda al extremo", () => {
    const geometry = resolveAtCenter(vertexTurnNetwork());

    assertEqual(geometry.incident.length, 2);
    assertClose(
      angleBetweenRouteDirections(
        geometry.incident[0]?.vector as NonNullable<
          (typeof geometry.incident)[number]
        >["vector"],
        geometry.incident[1]?.vector as NonNullable<
          (typeof geometry.incident)[number]
        >["vector"],
      ),
      90,
    );
  });

  verify(results, "marca geometria realmente nula", () => {
    const geometry = resolveAtCenter(invalidNetwork());

    assertEqual(geometry.topologicalSegmentCount, 2);
    assertEqual(geometry.incident.length, 1);
    assertEqual(geometry.unresolvedSegmentIds.join(","), "s2");
  });

  return results;
}

function resolveAtCenter(network: ManualRouteNetwork) {
  const node = network.nodes.find((item) => item.id === "b");

  assert(node?.position, "Falta nodo central de prueba.");
  return resolveIncidentRouteGeometry({
    equipmentById: new Map(),
    network,
    node,
    nodeById: new Map(network.nodes.map((item) => [item.id, item])),
    position: node.position,
    scaleMetersPerSourceUnit: 1,
  });
}

function verticalTurnNetwork(): ManualRouteNetwork {
  return network(
    { x: 0, y: 0, z: 1 },
  );
}

function horizontalNetwork(): ManualRouteNetwork {
  return network({ x: 1, y: 0, z: 0 });
}

function vertexTurnNetwork(): ManualRouteNetwork {
  const value = network({ x: 0, y: 2, z: 0 });
  value.nodes[0] = {
    id: "a",
    kind: "route",
    position: { x: -2, y: -2, z: 0 },
  };
  value.segments[0] = {
    fromNodeId: "a",
    id: "s1",
    toNodeId: "b",
    vertices: [{ x: -1, y: 0, z: 0 }],
  };
  return value;
}

function invalidNetwork(): ManualRouteNetwork {
  return network({ x: 0, y: 0, z: 0 });
}

function network(thirdPosition: { x: number; y: number; z: number }): ManualRouteNetwork {
  return {
    nodes: [
      { id: "a", kind: "route", position: { x: -1, y: 0, z: 0 } },
      { id: "b", kind: "route", position: { x: 0, y: 0, z: 0 } },
      { id: "c", kind: "route", position: thirdPosition },
    ],
    segments: [
      { fromNodeId: "a", id: "s1", toNodeId: "b" },
      { fromNodeId: "b", id: "s2", toNodeId: "c" },
    ],
  };
}

function verify(
  results: IncidentGeometryVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertClose(actual: number | null, expected: number) {
  assert(
    actual !== null && Math.abs(actual - expected) <= 0.000001,
    `Expected ${expected}, got ${String(actual)}`,
  );
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(actual === expected, `Expected ${String(expected)}, got ${String(actual)}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(JSON.stringify(runIncidentGeometryVerifications(), null, 2));
}
