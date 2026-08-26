import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import {
  resolveSigasDiameterTransitionEquivalentLength,
  SIGAS_PIPE_SYSTEM,
} from "@/lib/calculation/pipeSystems/sigas";
import {
  SIGAS_ACCESSORY_EQUIVALENT_LENGTHS,
  SIGAS_DIAMETERS,
} from "@/lib/calculation/pipeSystems/sigas/sigasData";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import {
  getSigasDiameterTransitionCatalogCandidates,
} from "@/lib/calculation/pipeSystems/sigas/sigasAccessoryProposal";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  confirmDiameterTransitionProposal,
  detectDiameterTransitionProposals,
  rejectDiameterTransitionProposal,
  type DiameterTransitionDecision,
  type DiameterTransitionProposal,
} from "./diameterTransitionProposals";
import {
  resolveTechnicalRouteTransitions,
  type TechnicalRouteTransitionRoute,
} from "./technicalRouteTransitions";

export type TechnicalRouteTransitionVerificationResult = {
  name: string;
  status: "passed";
};

export function runTechnicalRouteTransitionVerifications() {
  const results: TechnicalRouteTransitionVerificationResult[] = [];

  verify(results, "Caso A - ruta sin transicion", () => {
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(25), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [],
    });

    assertEqual(resolution.status, "resolved");
    assertEqual(resolution.equivalentLengthMeters, 0);
    assertEqual(resolution.projectedSizingLengthMeters, 20);
  });

  verify(results, "Caso B - simple reduction confirmada", () => {
    const proposal = confirmedSimpleReduction("cupla-reduccion-hh");
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });

    assertEqual(resolution.status, "resolved");
    assertClose(
      resolution.equivalentLengthMeters,
      rowByLabel("Cupla Reduccion HH 32 a 25 mm").equivalentLengthMeters,
    );
    assertEqual(
      resolution.contributions[0]?.variant?.label,
      "Cupla Reduccion HH 32 a 25 mm",
    );
  });

  verify(results, "Caso C - misma familia cambia par", () => {
    const originalDecision =
      confirmedSimpleReduction("cupla-reduccion-hh").decision;
    assert(originalDecision, "Falta decision original.");
    const proposal = simpleReductionWithDiameters({
      decisions: [originalDecision],
      s1: diameter(25),
      s2: diameter(20),
    });
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(25), s2: diameter(20) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });

    assertEqual(proposal.selectedCatalogFamilyId, "cupla-reduccion-hh");
    assertEqual(resolution.status, "resolved");
    assertClose(
      resolution.equivalentLengthMeters,
      rowByLabel("Cupla Reduccion HH 25 a 20 mm").equivalentLengthMeters,
    );
  });

  verify(results, "Caso D - diametros iguales inactive", () => {
    const originalDecision =
      confirmedSimpleReduction("cupla-reduccion-hh").decision;
    assert(originalDecision, "Falta decision original.");
    const proposal = simpleReductionWithDiameters({
      decisions: [originalDecision],
      s1: diameter(32),
      s2: diameter(32),
    });
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(32) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });

    assertEqual(proposal.state, "not_required");
    assertEqual(resolution.status, "resolved");
    assertEqual(resolution.equivalentLengthMeters, 0);
    assertEqual(resolution.contributions[0]?.status, "inactive");
  });

  verify(results, "Caso E - familia sin variante para par", () => {
    const originalDecision =
      confirmedSimpleReduction("cupla-reduccion-hh").decision;
    assert(originalDecision, "Falta decision original.");
    const proposal = simpleReductionWithDiameters({
      decisions: [originalDecision],
      s1: diameter(40),
      s2: diameter(20),
    });
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(40), s2: diameter(20) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });

    assertEqual(resolution.status, "unsupported");
    assertEqual(resolution.equivalentLengthMeters, null);
  });

  verify(results, "Caso F - activa sin confirmacion", () => {
    const proposal = simpleReductionWithDiameters({
      s1: diameter(32),
      s2: diameter(25),
    });
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });

    assertEqual(resolution.status, "unresolved");
    assertEqual(resolution.equivalentLengthMeters, null);
    assert(resolution.reasons[0]?.includes("sin familia"), "Debe quedar pendiente.");
  });

  verify(results, "Caso G - rechazada pero requerida", () => {
    const proposal = simpleReductionWithDiameters({
      s1: diameter(32),
      s2: diameter(25),
    });
    const rejected = rejectDiameterTransitionProposal({
      decidedAt: 2,
      proposal,
    });
    const rejectedProposal = simpleReductionWithDiameters({
      decisions: [rejected],
      s1: diameter(32),
      s2: diameter(25),
    });
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [rejectedProposal],
    });

    assertEqual(rejectedProposal.state, "rejected");
    assertEqual(resolution.status, "unresolved");
    assertEqual(resolution.equivalentLengthMeters, null);
  });

  verify(results, "Caso H - giro con transicion", () => {
    const proposal = transitionWithManualDecision({
      catalogFamilyId: "cupla-reduccion-hh",
      diameterBySegmentId: diameterMap({
        s1: diameter(32),
        s2: diameter(25),
      }),
      network: turnNetwork(),
    });
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });

    assertEqual(proposal.kind, "compound_turn_transition");
    assertEqual(resolution.status, "unresolved");
    assertEqual(resolution.equivalentLengthMeters, null);
  });

  verify(results, "Caso I - branch transition", () => {
    const proposal = transitionWithManualDecision({
      catalogFamilyId: "te-reduc-central-flujo-a-90",
      diameterBySegmentId: diameterMap({
        s1: diameter(32),
        s2: diameter(25),
        s3: diameter(32),
      }),
      network: teeNetwork(),
    });
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({
        s1: diameter(32),
        s2: diameter(25),
        s3: diameter(32),
      }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });

    assertEqual(proposal.kind, "branch_transition");
    assertEqual(resolution.status, "unresolved");
    assertEqual(resolution.equivalentLengthMeters, null);
  });

  verify(results, "Caso J - dos reducciones simples", () => {
    const proposals = confirmedLineReductions({
      diameters: {
        s1: diameter(32),
        s2: diameter(25),
        s3: diameter(20),
      },
      familyId: "cupla-reduccion-hh",
      network: twoReductionNetwork(),
    });
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({
        s1: diameter(32),
        s2: diameter(25),
        s3: diameter(20),
      }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n1", "n2", "a"], ["s1", "s2", "s3"]),
      transitions: proposals,
    });
    const expected =
      rowByLabel("Cupla Reduccion HH 32 a 25 mm").equivalentLengthMeters +
      rowByLabel("Cupla Reduccion HH 25 a 20 mm").equivalentLengthMeters;

    assertEqual(resolution.status, "resolved");
    assertClose(resolution.equivalentLengthMeters, expected);
    assertEqual(resolution.contributions.length, 2);
  });

  verify(results, "Caso K - defensa contra duplicada", () => {
    const proposal = confirmedSimpleReduction("cupla-reduccion-hh");
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal, proposal],
    });

    assertEqual(resolution.status, "unresolved");
    assertEqual(resolution.equivalentLengthMeters, null);
    assertEqual(resolution.duplicateTransitionIds.length, 1);
  });

  verify(results, "Caso L - transicion en otra rama", () => {
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        diameterBySegmentId: diameterMap({
          s1: diameter(32),
          s2: diameter(32),
          s3: diameter(25),
        }),
        equipment: transitionEquipment(),
        network: teeNetwork(),
      }),
    );
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({
        s1: diameter(32),
        s2: diameter(32),
        s3: diameter(25),
      }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });

    assertEqual(proposal.kind, "branch_transition");
    assertEqual(resolution.status, "resolved");
    assertEqual(resolution.equivalentLengthMeters, 0);
    assertEqual(resolution.contributions.length, 0);
  });

  verify(results, "Caso M - orden M a terminal", () => {
    const proposals = confirmedLineReductions({
      diameters: {
        s1: diameter(40),
        s2: diameter(32),
        s3: diameter(25),
      },
      familyId: "cupla-reduccion-hh",
      network: twoReductionNetwork(),
    });
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({
        s1: diameter(40),
        s2: diameter(32),
        s3: diameter(25),
      }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n1", "n2", "a"], ["s1", "s2", "s3"]),
      transitions: proposals.reverse(),
    });

    assertEqual(resolution.contributions[0]?.nodeId, "n1");
    assertEqual(resolution.contributions[1]?.nodeId, "n2");
  });

  verify(results, "Caso N - determinismo", () => {
    const proposal = confirmedSimpleReduction("cupla-reduccion-hh");
    const params = {
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    };
    const first = resolveTechnicalRouteTransitions(params);
    const second = resolveTechnicalRouteTransitions(params);

    assertEqual(JSON.stringify(first), JSON.stringify(second));
  });

  verify(results, "Caso O - independencia del solver", () => {
    const { equipment, network } = calculationFixture();
    const before = calculateTechnicalTree({
      equipment,
      minSegmentLengthSource: 0.0001,
      network,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      scaleMetersPerSourceUnit: 1,
    });
    const proposal = confirmedSimpleReduction("cupla-reduccion-hh");
    const preview = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: route(["m", "n", "a"], ["s1", "s2"]),
      transitions: [proposal],
    });
    const after = calculateTechnicalTree({
      equipment,
      minSegmentLengthSource: 0.0001,
      network,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      scaleMetersPerSourceUnit: 1,
    });

    assertEqual(preview.status, "resolved");
    assertEqual(
      JSON.stringify(before.networkSizing?.finalDiameterBySegmentId),
      JSON.stringify(after.networkSizing?.finalDiameterBySegmentId),
    );
    assertEqual(
      JSON.stringify(sizingLengths(before.networkSizing?.segments ?? [])),
      JSON.stringify(sizingLengths(after.networkSizing?.segments ?? [])),
    );
  });

  verify(results, "Tabla No 3 - Cupla Reduccion HH", () => {
    verifySigasRow("cupla-reduccion-hh", "Cupla Reduccion HH 32 a 25 mm", 32, 25);
  });

  verify(results, "Tabla No 3 - Buje Reduccion MH", () => {
    verifySigasRow("buje-reduccion-mh", "Buje Reduccion MH 40 a 25 mm", 40, 25);
  });

  verify(results, "Tabla No 3 - Reductor Anular", () => {
    verifySigasRow("reductor-anular", "Reductor Anular 40-25", 40, 25);
  });

  return results;
}

function confirmedSimpleReduction(familyId: string) {
  const proposal = simpleReductionWithDiameters({
    s1: diameter(32),
    s2: diameter(25),
  });
  const candidate = candidateByFamily(
    getSigasDiameterTransitionCatalogCandidates(proposal),
    familyId,
  );
  const result = confirmDiameterTransitionProposal({
    candidate,
    decidedAt: 1,
    proposal,
  });

  assert(result.ok, `No se pudo confirmar ${familyId}.`);
  return simpleReductionWithDiameters({
    decisions: [result.decision],
    s1: diameter(32),
    s2: diameter(25),
  });
}

function confirmedLineReductions(params: {
  diameters: Record<string, PipeDiameterReference>;
  familyId: string;
  network: ManualRouteNetwork;
}) {
  const proposals = detectDiameterTransitionProposals({
    diameterBySegmentId: diameterMap(params.diameters),
    equipment: transitionEquipment(),
    network: params.network,
  });
  const decisions = proposals.map((proposal) => {
    const candidate = candidateByFamily(
      getSigasDiameterTransitionCatalogCandidates(proposal),
      params.familyId,
    );
    const result = confirmDiameterTransitionProposal({
      candidate,
      decidedAt: 1,
      proposal,
    });

    assert(result.ok, `No se pudo confirmar ${proposal.nodeId}.`);
    return result.decision;
  });

  return detectDiameterTransitionProposals({
    decisions,
    diameterBySegmentId: diameterMap(params.diameters),
    equipment: transitionEquipment(),
    network: params.network,
  });
}

function simpleReductionWithDiameters(params: {
  decisions?: DiameterTransitionDecision[];
  s1: PipeDiameterReference;
  s2: PipeDiameterReference;
}) {
  return onlyTransition(
    detectDiameterTransitionProposals({
      decisions: params.decisions,
      diameterBySegmentId: diameterMap({
        s1: params.s1,
        s2: params.s2,
      }),
      equipment: transitionEquipment(),
      network: straightNetwork(),
    }),
  );
}

function transitionWithManualDecision(params: {
  catalogFamilyId: string;
  diameterBySegmentId: Map<string, PipeDiameterReference>;
  network: ManualRouteNetwork;
}) {
  const proposal = onlyTransition(
    detectDiameterTransitionProposals({
      diameterBySegmentId: params.diameterBySegmentId,
      equipment: transitionEquipment(),
      network: params.network,
    }),
  );
  const decision: DiameterTransitionDecision = {
    catalogFamilyId: params.catalogFamilyId,
    decidedAt: 1,
    geometryKey: proposal.geometryKey,
    origin: "user_confirmed",
    pipeSystemId: "sigas-thermofusion",
    status: "confirmed",
    transitionId: proposal.id,
  };

  return onlyTransition(
    detectDiameterTransitionProposals({
      decisions: [decision],
      diameterBySegmentId: params.diameterBySegmentId,
      equipment: transitionEquipment(),
      network: params.network,
    }),
  );
}

function verifySigasRow(
  catalogFamilyId: string,
  label: string,
  upstreamMillimeters: number,
  downstreamMillimeters: number,
) {
  const row = rowByLabel(label);
  const resolution = resolveSigasDiameterTransitionEquivalentLength({
    downstreamDiameter: diameter(downstreamMillimeters),
    transition: {
      catalogFamilyId,
      id: `test:${catalogFamilyId}`,
      kind: "simple_reduction",
      nodeId: "n",
    },
    upstreamDiameter: diameter(upstreamMillimeters),
  });

  assertEqual(resolution.status, "resolved");
  assertClose(
    resolution.status === "resolved"
      ? resolution.value.equivalentLengthMeters
      : null,
    row.equivalentLengthMeters,
  );
  assertEqual(
    resolution.status === "resolved" ? resolution.value.variant.label : null,
    row.label,
  );
}

function straightNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      supplyNode(),
      routeNode("n", "route", 10, 0),
      routeNode("a", "route", 20, 0),
    ],
    segments: [
      { fromNodeId: "m", id: "s1", toNodeId: "n" },
      { fromNodeId: "n", id: "s2", toNodeId: "a" },
    ],
  };
}

function turnNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      supplyNode(),
      routeNode("n", "route", 10, 0),
      routeNode("a", "route", 10, 10),
    ],
    segments: [
      { fromNodeId: "m", id: "s1", toNodeId: "n" },
      { fromNodeId: "n", id: "s2", toNodeId: "a" },
    ],
  };
}

function teeNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      supplyNode(),
      routeNode("n", "route", 10, 0),
      routeNode("a", "route", 20, 0),
      routeNode("b", "route", 10, 10),
    ],
    segments: [
      { fromNodeId: "m", id: "s1", toNodeId: "n" },
      { fromNodeId: "n", id: "s2", toNodeId: "a" },
      { fromNodeId: "n", id: "s3", toNodeId: "b" },
    ],
  };
}

function twoReductionNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      supplyNode(),
      routeNode("n1", "route", 10, 0),
      routeNode("n2", "route", 20, 0),
      routeNode("a", "route", 30, 0),
    ],
    segments: [
      { fromNodeId: "m", id: "s1", toNodeId: "n1" },
      { fromNodeId: "n1", id: "s2", toNodeId: "n2" },
      { fromNodeId: "n2", id: "s3", toNodeId: "a" },
    ],
  };
}

function calculationFixture(): {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
} {
  const equipment: WorkbenchEquipment[] = [
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
      connectionPoint: { x: 20, y: 0 },
      demandUnit: "m3_h",
      demandValue: 1,
      id: "stove",
      name: "COC",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "stove",
    },
  ];
  const network: ManualRouteNetwork = {
    nodes: [
      supplyNode(),
      routeNode("n", "route", 10, 0),
      {
        equipmentId: "stove",
        id: "a",
        kind: "appliance",
      },
    ],
    segments: [
      { fromNodeId: "m", id: "s1", toNodeId: "n" },
      { fromNodeId: "n", id: "s2", toNodeId: "a" },
    ],
  };

  return { equipment, network };
}

function route(
  nodeIds: string[],
  segmentIds: string[],
): TechnicalRouteTransitionRoute {
  return {
    id: "route:test",
    nodeIds,
    physicalLengthMeters: segmentIds.length * 10,
    segmentIds,
    status: "resolved",
  };
}

function routeNode(
  id: string,
  kind: "appliance" | "route" | "supply",
  x: number,
  y: number,
) {
  return {
    id,
    kind,
    position: { x, y },
  };
}

function supplyNode() {
  return {
    equipmentId: "meter",
    id: "m",
    kind: "supply" as const,
  };
}

function transitionEquipment(): WorkbenchEquipment[] {
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
  ];
}

function diameterMap(values: Record<string, PipeDiameterReference>) {
  return new Map(Object.entries(values));
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

function candidateByFamily(
  candidates: ReturnType<typeof getSigasDiameterTransitionCatalogCandidates>,
  familyId: string,
) {
  const candidate = candidates.find((item) => item.familyId === familyId);

  assert(candidate, `No se encontro familia ${familyId}.`);
  return candidate;
}

function sizingLengths(
  segments: Array<{ segmentId: string; sizingLengthMeters: number | null }>,
) {
  return [...segments]
    .map((segment) => ({
      segmentId: segment.segmentId,
      sizingLengthMeters: segment.sizingLengthMeters,
    }))
    .sort((first, second) => first.segmentId.localeCompare(second.segmentId));
}

function verify(
  results: TechnicalRouteTransitionVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertClose(actual: number | null | undefined, expected: number) {
  assert(
    actual !== null &&
      actual !== undefined &&
      Math.abs(actual - expected) <= 0.000001,
    `Expected ${expected}, got ${String(actual)}`,
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
  console.log(
    JSON.stringify(runTechnicalRouteTransitionVerifications(), null, 2),
  );
}
