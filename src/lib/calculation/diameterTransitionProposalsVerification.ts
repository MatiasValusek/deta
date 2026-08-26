import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { SIGAS_DIAMETERS } from "@/lib/calculation/pipeSystems/sigas/sigasData";
import {
  getSigasDiameterTransitionCatalogCandidates,
} from "@/lib/calculation/pipeSystems/sigas/sigasAccessoryProposal";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import {
  detectRouteAccessoryProposals,
} from "@/lib/routing/routeAccessoryProposals";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  confirmDiameterTransitionProposal,
  detectDiameterTransitionProposals,
  diameterTransitionIsActive,
  rejectDiameterTransitionProposal,
  upsertDiameterTransitionDecision,
  withDiameterTransitionTechnicalReview,
  type DiameterTransitionDecision,
  type DiameterTransitionProposal,
  type DiameterTransitionTechnicalReview,
} from "./diameterTransitionProposals";

export type DiameterTransitionProposalVerificationResult = {
  name: string;
  status: "passed";
};

export function runDiameterTransitionProposalVerifications() {
  const results: DiameterTransitionProposalVerificationResult[] = [];

  verify(results, "Caso A - DE25 a DE25 sin transicion activa", () => {
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        diameterBySegmentId: diameterMap({
          s1: diameter(25),
          s2: diameter(25),
        }),
        equipment: transitionEquipment(),
        network: straightNetwork(),
      }),
    );

    assertEqual(proposal.kind, "not_required");
    assertEqual(proposal.state, "not_required");
    assert(!diameterTransitionIsActive(proposal), "No debe quedar activa.");
  });

  verify(results, "Caso B - DE32 a DE25 recto", () => {
    const proposal = simpleReductionProposal();

    assertEqual(proposal.kind, "simple_reduction");
    assertEqual(proposal.state, "transition_required");
    assertEqual(proposal.direction, "reducing");
    assertEqual(proposal.upstreamSegmentId, "s1");
    assertEqual(proposal.downstreamSegmentIds.join(","), "s2");
    assertEqual(
      proposal.upstreamDiameter?.diameter?.externalDiameterMillimeters,
      32,
    );
    assertEqual(
      proposal.downstreamDiameters[0]?.diameter?.externalDiameterMillimeters,
      25,
    );
  });

  verify(results, "Caso C - orientacion upstream/downstream desde M", () => {
    const proposal = simpleReductionProposal();

    assertEqual(proposal.upstreamSegmentId, "s1");
    assertEqual(proposal.downstreamSegmentIds[0], "s2");
    assertEqual(proposal.incidentSegments.find((item) => item.segmentId === "s1")?.role, "upstream");
    assertEqual(proposal.incidentSegments.find((item) => item.segmentId === "s2")?.role, "downstream");
  });

  verify(results, "Caso D - giro y cambio compuesto", () => {
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        diameterBySegmentId: diameterMap({
          s1: diameter(32),
          s2: diameter(25),
        }),
        equipment: transitionEquipment(),
        network: turnNetwork(),
      }),
    );
    const elbow = onlyAccessory(
      detectRouteAccessoryProposals({
        diameterBySegmentId: diameterMap({
          s1: diameter(32),
          s2: diameter(25),
        }),
        equipment: transitionEquipment(),
        network: turnNetwork(),
      }),
    );

    assertEqual(proposal.kind, "compound_turn_transition");
    assertEqual(proposal.state, "needs_review");
    assertEqual(elbow.kind, "elbow");
  });

  verify(results, "Caso E - tee con una rama distinta", () => {
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

    assertEqual(proposal.kind, "branch_transition");
    assertEqual(proposal.state, "needs_review");
    assertEqual(proposal.upstreamSegmentId, "s1");
    assertEqual(proposal.downstreamDiameters.length, 2);
  });

  verify(results, "Caso F - tres diametros distintos", () => {
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        diameterBySegmentId: diameterMap({
          s1: diameter(40),
          s2: diameter(32),
          s3: diameter(25),
        }),
        equipment: transitionEquipment(),
        network: teeNetwork(),
      }),
    );
    const candidates = getSigasDiameterTransitionCatalogCandidates(proposal);

    assertEqual(proposal.kind, "branch_transition");
    assertEqual(uniqueDiameterCount(proposal), 3);
    assertEqual(candidates.length, 0);
  });

  verify(results, "Caso G - diametro pendiente", () => {
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        diameterBySegmentId: diameterMap({
          s1: diameter(32),
        }),
        equipment: transitionEquipment(),
        network: straightNetwork(),
      }),
    );

    assertEqual(proposal.kind, "unresolved");
    assertEqual(proposal.state, "unresolved");
    assert(proposal.reason.includes("s2"), "Debe explicar el tramo pendiente.");
  });

  verify(results, "Caso H - ID estable al cambiar diametros", () => {
    const reducing = simpleReductionProposal();
    const equal = onlyTransition(
      detectDiameterTransitionProposals({
        diameterBySegmentId: diameterMap({
          s1: diameter(32),
          s2: diameter(32),
        }),
        equipment: transitionEquipment(),
        network: straightNetwork(),
      }),
    );
    const reducingAgain = simpleReductionProposal();

    assertEqual(reducing.id, equal.id);
    assertEqual(reducing.id, reducingAgain.id);
    assertEqual(reducing.geometryKey, equal.geometryKey);
    assertEqual(equal.state, "not_required");
  });

  verify(results, "Caso I - familia confirmada persistida", () => {
    const proposal = simpleReductionProposal();
    const candidate = candidateByFamily(
      getSigasDiameterTransitionCatalogCandidates(proposal),
      "cupla-reduccion-hh",
    );
    const result = confirmDiameterTransitionProposal({
      candidate,
      decidedAt: 10,
      proposal,
    });

    assert(result.ok, "La familia compatible deberia confirmar.");
    assertEqual(result.decision.catalogFamilyId, "cupla-reduccion-hh");
    assertEqual(result.decision.pipeSystemId, "sigas-thermofusion");
    assertEqual(result.decision.origin, "user_confirmed");
    assert(!("equivalentLengthMeters" in result.decision), "No debe persistir longitud equivalente.");
    assert(!("equivalentDiameterCount" in result.decision), "No debe persistir equivalencia numerica.");
  });

  verify(results, "Caso J - diametros iguales inactivan decision", () => {
    const decision = confirmedCuplaDecision();
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        decisions: [decision],
        diameterBySegmentId: diameterMap({
          s1: diameter(32),
          s2: diameter(32),
        }),
        equipment: transitionEquipment(),
        network: straightNetwork(),
      }),
    );

    assertEqual(proposal.state, "not_required");
    assertEqual(proposal.selectedCatalogFamilyId, "cupla-reduccion-hh");
  });

  verify(results, "Caso K - familia confirmada deja de ser compatible", () => {
    const decision = confirmedCuplaDecision();
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        decisions: [decision],
        diameterBySegmentId: diameterMap({
          s1: diameter(40),
          s2: diameter(20),
        }),
        equipment: transitionEquipment(),
        network: straightNetwork(),
      }),
    );
    const review = transitionReview(proposal);
    const revalidated = withDiameterTransitionTechnicalReview(proposal, review);

    assertEqual(proposal.selectedCatalogFamilyId, "cupla-reduccion-hh");
    assertEqual(review.selectedCandidate?.familyId, "cupla-reduccion-hh");
    assertEqual(review.selectedCandidate?.status, "incompatible");
    assert(
      review.candidates.some(
        (candidate) =>
          candidate.familyId === "reductor-anular" &&
          candidate.status === "compatible",
      ),
      "Debe existir otra familia compatible sin autoseleccionarla.",
    );
    assertEqual(revalidated.state, "needs_review");
    assertEqual(revalidated.selectedCatalogFamilyId, "cupla-reduccion-hh");
  });

  verify(results, "Caso L - familia SIGAS real compatible", () => {
    const candidates =
      getSigasDiameterTransitionCatalogCandidates(simpleReductionProposal());
    const cupla = candidateByFamily(candidates, "cupla-reduccion-hh");

    assertEqual(cupla.label, "Cupla Reduccion HH");
    assertEqual(cupla.status, "compatible");
    assert(
      cupla.originalLabels.some((label) =>
        label.includes("Cupla Reduccion HH 32 a 25 mm"),
      ),
      "Debe agrupar variantes reales de Tabla No 3.",
    );
  });

  verify(results, "Caso M - configuracion no soportada", () => {
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        diameterBySegmentId: diameterMap({
          s1: diameter(32),
          s2: diameter(25),
          s3: diameter(25),
          s4: diameter(25),
        }),
        equipment: transitionEquipment(),
        network: crossNetwork(),
      }),
    );
    const candidates = getSigasDiameterTransitionCatalogCandidates(proposal);

    assertEqual(proposal.kind, "unsupported");
    assertEqual(proposal.state, "unsupported");
    assertEqual(candidates.length, 0);
  });

  verify(results, "Caso N - confirmar no modifica solver", () => {
    const { equipment, network } = calculationFixture();
    const before = calculateTechnicalTree({
      equipment,
      minSegmentLengthSource: 0.0001,
      network,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      scaleMetersPerSourceUnit: 1,
    });
    const proposal = simpleReductionProposal();
    const candidate = candidateByFamily(
      getSigasDiameterTransitionCatalogCandidates(proposal),
      "cupla-reduccion-hh",
    );
    const confirmation = confirmDiameterTransitionProposal({
      candidate,
      decidedAt: 20,
      proposal,
    });
    const after = calculateTechnicalTree({
      equipment,
      minSegmentLengthSource: 0.0001,
      network,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      scaleMetersPerSourceUnit: 1,
    });

    assert(confirmation.ok, "La confirmacion debe crear decision.");
    assert(!("network" in confirmation), "No debe devolver una red modificada.");
    assertEqual(
      JSON.stringify(before.networkSizing?.finalDiameterBySegmentId),
      JSON.stringify(after.networkSizing?.finalDiameterBySegmentId),
    );
    assertEqual(
      JSON.stringify(sizingLengths(before.networkSizing?.segments ?? [])),
      JSON.stringify(sizingLengths(after.networkSizing?.segments ?? [])),
    );
    assertEqual(accessoryCount(network), 0);
  });

  verify(results, "Caso O - determinismo completo", () => {
    const first = detectDiameterTransitionProposals({
      diameterBySegmentId: diameterMap({
        s1: diameter(32),
        s2: diameter(25),
        s3: diameter(32),
      }),
      equipment: transitionEquipment(),
      network: teeNetwork(),
    });
    const second = detectDiameterTransitionProposals({
      diameterBySegmentId: diameterMap({
        s1: diameter(32),
        s2: diameter(25),
        s3: diameter(32),
      }),
      equipment: transitionEquipment(),
      network: teeNetwork(),
    });
    const rejected = rejectDiameterTransitionProposal({
      decidedAt: 30,
      proposal: first[0] as DiameterTransitionProposal,
    });
    const decisions = upsertDiameterTransitionDecision([], rejected);

    assertEqual(JSON.stringify(first), JSON.stringify(second));
    assertEqual(JSON.stringify(decisions), JSON.stringify([rejected]));
  });

  return results;
}

function simpleReductionProposal() {
  return onlyTransition(
    detectDiameterTransitionProposals({
      diameterBySegmentId: diameterMap({
        s1: diameter(32),
        s2: diameter(25),
      }),
      equipment: transitionEquipment(),
      network: straightNetwork(),
    }),
  );
}

function confirmedCuplaDecision(): DiameterTransitionDecision {
  const proposal = simpleReductionProposal();
  const candidate = candidateByFamily(
    getSigasDiameterTransitionCatalogCandidates(proposal),
    "cupla-reduccion-hh",
  );
  const result = confirmDiameterTransitionProposal({
    candidate,
    decidedAt: 10,
    proposal,
  });

  assert(result.ok, "No se pudo confirmar Cupla Reduccion HH.");
  return result.decision;
}

function transitionReview(
  proposal: DiameterTransitionProposal,
): DiameterTransitionTechnicalReview {
  const candidates = getSigasDiameterTransitionCatalogCandidates(proposal);
  const selectedCandidate = proposal.selectedCatalogFamilyId
    ? candidates.find(
        (candidate) =>
          candidate.familyId === proposal.selectedCatalogFamilyId &&
          (!proposal.decision?.pipeSystemId ||
            candidate.pipeSystem.id === proposal.decision.pipeSystemId),
      ) ?? null
    : null;
  const compatibleCandidates = candidates.filter(
    (candidate) => candidate.status === "compatible",
  );

  return {
    candidates,
    downstreamDiameters: proposal.downstreamDiameters.map((item) => ({
      diameter: item.diameter,
      segmentId: item.segmentId,
    })),
    reason:
      selectedCandidate?.status === "incompatible"
        ? selectedCandidate.reason
        : null,
    selectedCandidate,
    status:
      selectedCandidate?.status ??
      (compatibleCandidates.length > 0
        ? "compatible"
        : candidates.some((candidate) => candidate.status === "incompatible")
          ? "incompatible"
          : "requires_more_information"),
    transitionId: proposal.id,
    upstreamDiameter: proposal.upstreamDiameter?.diameter ?? null,
  };
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

function crossNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      supplyNode(),
      routeNode("n", "route", 10, 0),
      routeNode("a", "route", 20, 0),
      routeNode("b", "route", 10, 10),
      routeNode("c", "route", 10, -10),
    ],
    segments: [
      { fromNodeId: "m", id: "s1", toNodeId: "n" },
      { fromNodeId: "n", id: "s2", toNodeId: "a" },
      { fromNodeId: "n", id: "s3", toNodeId: "b" },
      { fromNodeId: "n", id: "s4", toNodeId: "c" },
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
      {
        equipmentId: "meter",
        id: "m",
        kind: "supply",
      },
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

function diameterMap(
  values: Record<string, PipeDiameterReference | null | undefined>,
) {
  return new Map(Object.entries(values));
}

function diameter(externalDiameterMillimeters: number): PipeDiameterReference {
  const value = SIGAS_DIAMETERS.find(
    (item) => item.externalDiameterMillimeters === externalDiameterMillimeters,
  );

  assert(value, `No existe diametro SIGAS ${externalDiameterMillimeters}.`);
  return value;
}

function onlyTransition(proposals: DiameterTransitionProposal[]) {
  assertEqual(proposals.length, 1);
  return proposals[0] as DiameterTransitionProposal;
}

function onlyAccessory<T>(items: T[]) {
  assertEqual(items.length, 1);
  return items[0] as T;
}

function candidateByFamily(
  candidates: ReturnType<typeof getSigasDiameterTransitionCatalogCandidates>,
  familyId: string,
) {
  const candidate = candidates.find((item) => item.familyId === familyId);

  assert(candidate, `No se encontro familia ${familyId}.`);
  return candidate;
}

function uniqueDiameterCount(proposal: DiameterTransitionProposal) {
  return new Set(
    proposal.incidentSegments.map(
      (item) => item.diameter?.externalDiameterMillimeters ?? null,
    ),
  ).size;
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

function accessoryCount(network: ManualRouteNetwork) {
  return network.segments.reduce(
    (count, segment) => count + (segment.accessories ?? []).length,
    0,
  );
}

function verify(
  results: DiameterTransitionProposalVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
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
    JSON.stringify(runDiameterTransitionProposalVerifications(), null, 2),
  );
}
