import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import {
  resolveSigasDiameterTransitionEquivalentLength,
  SIGAS_PIPE_SYSTEM,
} from "@/lib/calculation/pipeSystems/sigas";
import {
  SIGAS_ACCESSORY_EQUIVALENT_LENGTHS,
  SIGAS_DIAMETERS,
} from "@/lib/calculation/pipeSystems/sigas/sigasData";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork, RouteNode } from "@/lib/routing/types";
import {
  detectDiameterTransitionProposals,
  type DiameterTransitionDecision,
  type DiameterTransitionProposal,
} from "./diameterTransitionProposals";
import {
  resolveTechnicalRouteTransitions,
  type TechnicalRouteTransitionContribution,
  type TechnicalRouteTransitionRoute,
} from "./technicalRouteTransitions";

export type TechnicalRouteBranchTransitionVerificationResult = {
  name: string;
  status: "passed";
};

const REDUCED_TEE_FAMILY_ID = "te-reduc-central";

export function runTechnicalRouteBranchTransitionVerifications() {
  const results: TechnicalRouteBranchTransitionVerificationResult[] = [];

  verify(results, "Caso A - SIGAS Tabla No 3 directo through", () => {
    const row = rowByLabel("Te Reduc. Central 32 x 25, flujo a traves");
    const resolution = assertResolved(
      resolveSigasDiameterTransitionEquivalentLength({
        downstreamDiameter: diameter(25),
        transition: {
          catalogFamilyId: REDUCED_TEE_FAMILY_ID,
          id: "tee:direct:through",
          kind: "branch_transition",
          nodeId: "n",
          traversalKind: "through",
        },
        upstreamDiameter: diameter(32),
      }),
    );

    assertEqual(resolution.variant.label, row.label);
    assertClose(resolution.equivalentLengthMeters, row.equivalentLengthMeters);
  });

  verify(results, "Caso B - SIGAS Tabla No 3 directo turn 90", () => {
    const row = rowByLabel("Te Reduc. Central 32 x 25, flujo a 90");
    const resolution = assertResolved(
      resolveSigasDiameterTransitionEquivalentLength({
        downstreamDiameter: diameter(25),
        transition: {
          catalogFamilyId: REDUCED_TEE_FAMILY_ID,
          id: "tee:direct:turn",
          kind: "branch_transition",
          nodeId: "n",
          traversalKind: "turn_90",
        },
        upstreamDiameter: diameter(32),
      }),
    );

    assertEqual(resolution.variant.label, row.label);
    assertClose(resolution.equivalentLengthMeters, row.equivalentLengthMeters);
  });

  verify(results, "Caso C - 32/32/25 detecta tee reductora", () => {
    const fixture = teeFixture({
      diameters: { s1: 32, s2: 32, s3: 25 },
    });
    const proposal = confirmedReducedTee(fixture);

    assertEqual(proposal.kind, "branch_transition");
    assertEqual(proposal.nodeId, "n");
    assertEqual(proposal.upstreamSegmentId, "s1");
    assertEqual(proposal.incidentSegments.length, 3);
    assertEqual(
      proposal.incidentSegments.map((item) => item.segmentId).join(","),
      "s1,s2,s3",
    );
  });

  verify(results, "Caso D - route through usa fila a traves", () => {
    const fixture = teeFixture({
      diameters: { s1: 32, s2: 32, s3: 25 },
    });
    const proposal = confirmedReducedTee(fixture);
    const resolution = resolvePreview({
      fixture,
      route: route("route:through", ["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });
    const contribution = onlyContribution(resolution.contributions);
    const row = rowByLabel("Te Reduc. Central 32 x 25, flujo a traves");

    assertEqual(resolution.status, "resolved");
    assertEqual(contribution.traversalKind, "through");
    assertEqual(contribution.upstreamSegmentId, "s1");
    assertEqual(contribution.downstreamSegmentId, "s2");
    assertEqual(contribution.variant?.label, row.label);
    assertClose(contribution.equivalentLengthMeters, row.equivalentLengthMeters);
  });

  verify(results, "Caso E - route 90 usa fila a 90", () => {
    const fixture = teeFixture({
      diameters: { s1: 32, s2: 32, s3: 25 },
    });
    const proposal = confirmedReducedTee(fixture);
    const resolution = resolvePreview({
      fixture,
      route: route("route:turn", ["m", "n", "b"], ["s1", "s3"]),
      transitions: [proposal],
    });
    const contribution = onlyContribution(resolution.contributions);
    const row = rowByLabel("Te Reduc. Central 32 x 25, flujo a 90");

    assertEqual(resolution.status, "resolved");
    assertEqual(contribution.traversalKind, "turn_90");
    assertEqual(contribution.upstreamSegmentId, "s1");
    assertEqual(contribution.downstreamSegmentId, "s3");
    assertEqual(contribution.variant?.label, row.label);
    assertClose(contribution.equivalentLengthMeters, row.equivalentLengthMeters);
  });

  verify(results, "Caso F - misma tee aporta equivalencias diferentes", () => {
    const fixture = teeFixture({
      diameters: { s1: 32, s2: 32, s3: 25 },
    });
    const proposal = confirmedReducedTee(fixture);
    const through = resolvePreview({
      fixture,
      route: route("route:through", ["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });
    const turn = resolvePreview({
      fixture,
      route: route("route:turn", ["m", "n", "b"], ["s1", "s3"]),
      transitions: [proposal],
    });

    assertEqual(
      onlyContribution(through.contributions).transitionId,
      proposal.id,
    );
    assertEqual(onlyContribution(turn.contributions).transitionId, proposal.id);
    assert(
      onlyContribution(through.contributions).equivalentLengthMeters !==
        onlyContribution(turn.contributions).equivalentLengthMeters,
      "La misma tee debe poder tener equivalencias distintas por recorrido.",
    );
  });

  verify(results, "Caso G - route ajena no contribuye", () => {
    const fixture = teeFixture({
      diameters: { s1: 32, s2: 32, s3: 25 },
    });
    const proposal = confirmedReducedTee(fixture);
    const resolution = resolvePreview({
      fixture,
      route: route("route:foreign", ["m", "x", "c"], ["sx1", "sx2"]),
      transitions: [proposal],
    });

    assertEqual(resolution.status, "resolved");
    assertEqual(resolution.contributions.length, 0);
    assertEqual(resolution.equivalentLengthMeters, 0);
  });

  verify(results, "Caso H - tee no confirmada queda unresolved sin cero", () => {
    const fixture = teeFixture({
      diameters: { s1: 32, s2: 32, s3: 25 },
    });
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        diameterBySegmentId: fixture.diameterBySegmentId,
        equipment: fixture.equipment,
        network: fixture.network,
      }),
    );
    const resolution = resolvePreview({
      fixture,
      route: route("route:turn", ["m", "n", "b"], ["s1", "s3"]),
      transitions: [proposal],
    });

    assertEqual(resolution.status, "unresolved");
    assertEqual(resolution.equivalentLengthMeters, null);
    assertEqual(resolution.contributions[0]?.equivalentLengthMeters, null);
  });

  verify(results, "Caso I - variante inexistente es unsupported", () => {
    const fixture = teeFixture({
      diameters: { s1: 40, s2: 40, s3: 20 },
    });
    const proposal = confirmedReducedTee(fixture);
    const resolution = resolvePreview({
      fixture,
      route: route("route:turn", ["m", "n", "b"], ["s1", "s3"]),
      transitions: [proposal],
    });

    assertEqual(resolution.status, "unsupported");
    assertEqual(resolution.equivalentLengthMeters, null);
    assert(
      resolution.reasons.some((reason) =>
        reason.includes("no posee variante compatible"),
      ),
      "Debe explicar que falta variante SIGAS.",
    );
  });

  verify(results, "Caso J - tres diametros incompatibles son unsupported", () => {
    const fixture = teeFixture({
      diameters: { s1: 40, s2: 32, s3: 25 },
    });
    const proposal = confirmedReducedTee(fixture);
    const resolution = resolvePreview({
      fixture,
      route: route("route:turn", ["m", "n", "b"], ["s1", "s3"]),
      transitions: [proposal],
    });

    assertEqual(resolution.status, "unsupported");
    assertEqual(resolution.equivalentLengthMeters, null);
    assert(
      resolution.reasons.some((reason) => reason.includes("tres diametros")),
      "Debe rechazar tees con tres diametros distintos.",
    );
  });

  verify(results, "Caso K - no doble conteo", () => {
    const fixture = teeFixture({
      diameters: { s1: 32, s2: 32, s3: 25 },
    });
    const proposal = confirmedReducedTee(fixture);
    const resolution = resolvePreview({
      fixture,
      route: route("route:turn", ["m", "n", "b"], ["s1", "s3"]),
      transitions: [proposal, proposal],
    });
    const resolvedContributionCount = resolution.contributions.filter(
      (contribution) => contribution.status === "resolved",
    ).length;

    assertEqual(resolvedContributionCount, 1);
    assertEqual(resolution.duplicateTransitionIds.join(","), proposal.id);
    assertEqual(resolution.equivalentLengthMeters, null);
  });

  verify(results, "Caso L - determinismo", () => {
    const fixture = teeFixture({
      diameters: { s1: 32, s2: 32, s3: 25 },
    });
    const proposal = confirmedReducedTee(fixture);
    const routeThrough = route("route:through", ["m", "n", "a"], ["s1", "s2"]);
    const first = resolvePreview({
      fixture,
      route: routeThrough,
      transitions: [proposal],
    });
    const second = resolvePreview({
      fixture,
      route: routeThrough,
      transitions: [proposal],
    });

    assertEqual(JSON.stringify(first), JSON.stringify(second));
  });

  verify(
    results,
    "Caso M - preview suma fisica accesorios simple y branch",
    () => {
      const fixture = teeFixture({
        diameters: { s0: 40, s1: 32, s2: 32, s3: 25 },
        includeSimpleReduction: true,
      });
      const transitions = confirmedTransitions(fixture, REDUCED_TEE_FAMILY_ID);
      const resolution = resolvePreview({
        accessoryEquivalentLengthMeters: 2,
        fixture,
        route: route(
          "route:through",
          ["m", "r", "n", "a"],
          ["s0", "s1", "s2"],
        ),
        transitions,
      });
      const simple = rowByLabel("Cupla Reduccion HH 40 a 32 mm");
      const branch = rowByLabel("Te Reduc. Central 32 x 25, flujo a traves");

      assertEqual(resolution.status, "resolved");
      assertClose(
        resolution.equivalentLengthMeters,
        simple.equivalentLengthMeters + branch.equivalentLengthMeters,
      );
      assertClose(
        resolution.projectedSizingLengthMeters,
        30 + 2 + simple.equivalentLengthMeters + branch.equivalentLengthMeters,
      );
    },
  );

  verify(results, "Caso N - 09C2B no cuenta branch por default", () => {
    const fixture = teeFixture({
      diameters: { s1: 32, s2: 32, s3: 25 },
    });
    const proposal = confirmedReducedTee(fixture);
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: fixture.diameterBySegmentId,
      equipment: fixture.equipment,
      governingRouteAccessoryEquivalentLengthMeters: 0,
      network: fixture.network,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route("route:turn", ["m", "n", "b"], ["s1", "s3"]),
      transitions: [proposal],
    });

    assertEqual(resolution.status, "unresolved");
    assertEqual(resolution.equivalentLengthMeters, null);
    assert(
      resolution.reasons.some((reason) => reason.includes("pendiente")),
      "El modo default debe conservar el comportamiento 09C2B.",
    );
  });

  return results;
}

type TeeFixture = {
  diameterBySegmentId: Map<string, PipeDiameterReference>;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
};

function resolvePreview(params: {
  accessoryEquivalentLengthMeters?: number;
  fixture: TeeFixture;
  route: TechnicalRouteTransitionRoute;
  transitions: DiameterTransitionProposal[];
}) {
  return resolveTechnicalRouteTransitions({
    diameterBySegmentId: params.fixture.diameterBySegmentId,
    enableBranchTransitionPreview: true,
    equipment: params.fixture.equipment,
    governingRouteAccessoryEquivalentLengthMeters:
      params.accessoryEquivalentLengthMeters ?? 0,
    network: params.fixture.network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    route: params.route,
    transitions: params.transitions,
  });
}

function confirmedReducedTee(fixture: TeeFixture) {
  return onlyTransition(confirmedTransitions(fixture, REDUCED_TEE_FAMILY_ID));
}

function confirmedTransitions(fixture: TeeFixture, branchFamilyId: string) {
  const proposals = detectDiameterTransitionProposals({
    diameterBySegmentId: fixture.diameterBySegmentId,
    equipment: fixture.equipment,
    network: fixture.network,
  });
  const decisions = proposals.map((proposal) =>
    confirmedDecision(
      proposal,
      proposal.kind === "branch_transition"
        ? branchFamilyId
        : "cupla-reduccion-hh",
    ),
  );

  return detectDiameterTransitionProposals({
    decisions,
    diameterBySegmentId: fixture.diameterBySegmentId,
    equipment: fixture.equipment,
    network: fixture.network,
  });
}

function confirmedDecision(
  proposal: DiameterTransitionProposal,
  catalogFamilyId: string,
): DiameterTransitionDecision {
  return {
    catalogFamilyId,
    decidedAt: 1,
    geometryKey: proposal.geometryKey,
    origin: "user_confirmed",
    pipeSystemId: SIGAS_PIPE_SYSTEM.identity.id,
    status: "confirmed",
    transitionId: proposal.id,
  };
}

function teeFixture(params: {
  diameters: Record<string, number>;
  includeSimpleReduction?: boolean;
}): TeeFixture {
  const nodes: RouteNode[] = [
    supplyNode(),
    applianceNode("a", "range"),
    applianceNode("b", "heater"),
    routeNode("n", 20, 0),
  ];
  const segments = [
    { fromNodeId: "n", id: "s2", toNodeId: "a" },
    { fromNodeId: "n", id: "s3", toNodeId: "b" },
  ];

  if (params.includeSimpleReduction) {
    nodes.push(routeNode("r", 10, 0));
    segments.unshift({ fromNodeId: "m", id: "s0", toNodeId: "r" });
    segments.unshift({ fromNodeId: "r", id: "s1", toNodeId: "n" });
  } else {
    segments.unshift({ fromNodeId: "m", id: "s1", toNodeId: "n" });
  }

  return {
    diameterBySegmentId: diameterMap(params.diameters),
    equipment: equipment(),
    network: {
      nodes,
      segments: segments.sort((first, second) =>
        first.id.localeCompare(second.id),
      ),
    },
  };
}

function route(
  id: string,
  nodeIds: string[],
  segmentIds: string[],
): TechnicalRouteTransitionRoute {
  return {
    id,
    nodeIds,
    physicalLengthMeters: segmentIds.length * 10,
    segmentIds,
    status: "resolved",
  };
}

function supplyNode(): RouteNode {
  return {
    equipmentId: "meter",
    id: "m",
    kind: "supply",
  };
}

function applianceNode(id: "a" | "b", equipmentId: string): RouteNode {
  return {
    equipmentId,
    id,
    kind: "appliance",
  };
}

function routeNode(id: string, x: number, y: number): RouteNode {
  return {
    id,
    kind: "route",
    position: { x, y },
  };
}

function equipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: { x: 0, y: 0 },
      id: "meter",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 30, y: 0 },
      demandUnit: "m3_h",
      demandValue: 1,
      id: "range",
      name: "COC",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "stove",
    },
    {
      connectionPoint: { x: 20, y: 10 },
      demandUnit: "m3_h",
      demandValue: 1,
      id: "heater",
      name: "CAL",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "space_heater",
    },
  ];
}

function diameterMap(values: Record<string, number>) {
  return new Map(
    Object.entries(values).map(([segmentId, externalDiameterMillimeters]) => [
      segmentId,
      diameter(externalDiameterMillimeters),
    ]),
  );
}

function diameter(externalDiameterMillimeters: number): PipeDiameterReference {
  const value = SIGAS_DIAMETERS.find(
    (item) => item.externalDiameterMillimeters === externalDiameterMillimeters,
  );

  assert(value, `No existe diametro SIGAS ${externalDiameterMillimeters}.`);
  return value;
}

function rowByLabel(label: string) {
  const row = SIGAS_ACCESSORY_EQUIVALENT_LENGTHS.find(
    (item) => item.label === label,
  );

  assert(row, `No existe fila SIGAS ${label}.`);
  return row;
}

function onlyTransition(proposals: DiameterTransitionProposal[]) {
  assertEqual(proposals.length, 1);
  return proposals[0] as DiameterTransitionProposal;
}

function onlyContribution(
  contributions: TechnicalRouteTransitionContribution[],
) {
  assertEqual(contributions.length, 1);
  return contributions[0] as TechnicalRouteTransitionContribution;
}

function verify(
  results: TechnicalRouteBranchTransitionVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertResolved<T>(resolution: { status: string; value?: T }) {
  assert(
    resolution.status === "resolved",
    `Expected resolved, got ${resolution.status}`,
  );

  return resolution.value as T;
}

function assertClose(
  actual: number | null | undefined,
  expected: number | null | undefined,
) {
  assert(
    actual !== null &&
      actual !== undefined &&
      expected !== null &&
      expected !== undefined &&
      Math.abs(actual - expected) < 0.000001,
    `Expected ${String(expected)}, got ${String(actual)}`,
  );
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
  const results = runTechnicalRouteBranchTransitionVerifications();
  console.log(JSON.stringify(results, null, 2));
}
