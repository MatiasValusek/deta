import {
  accessoryCatalogSelectionFromCandidate,
} from "@/lib/calculation/accessoryCatalogCandidates";
import {
  resolveCompoundTurnTransitionPreview,
} from "@/lib/calculation/compoundTurnTransitionResolution";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import {
  SIGAS_PIPE_SYSTEM,
} from "@/lib/calculation/pipeSystems/sigas";
import {
  getSigasAccessoryCatalogCandidates,
  getSigasCompoundTurnTransitionDirectCatalogCandidates,
  getSigasDiameterTransitionCatalogCandidates,
  matchSigasAccessoryProposal,
} from "@/lib/calculation/pipeSystems/sigas/sigasAccessoryProposal";
import {
  SIGAS_ACCESSORY_EQUIVALENT_LENGTHS,
  SIGAS_DIAMETERS,
} from "@/lib/calculation/pipeSystems/sigas/sigasData";
import {
  confirmDiameterTransitionProposal,
  detectDiameterTransitionProposals,
  diameterTransitionIsActive,
  type DiameterTransitionDecision,
  type DiameterTransitionProposal,
} from "@/lib/calculation/diameterTransitionProposals";
import {
  resolveTechnicalRouteTransitions,
} from "@/lib/calculation/technicalRouteTransitions";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  confirmRouteAccessoryProposal,
  detectRouteAccessoryProposals,
  resolveAccessoryProposalTechnicalOwner,
  withAccessoryProposalSystemMatch,
} from "@/lib/routing/routeAccessoryProposals";
import type {
  ManualRouteNetwork,
  RouteNode,
} from "@/lib/routing/types";

export type CompoundTurnTransitionResolutionVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;

export function runCompoundTurnTransitionResolutionVerifications() {
  const results: CompoundTurnTransitionResolutionVerificationResult[] = [];

  verify(results, "Caso 1 - giro mismo diametro conserva solo codo", () => {
    const transitions = detectDiameterTransitionProposals({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(32) }),
      equipment: transitionEquipment(),
      network: turnNetwork(),
    });
    const accessories = detectRouteAccessoryProposals({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(32) }),
      equipment: transitionEquipment(),
      network: turnNetwork(),
    });
    const transition = onlyTransition(transitions);

    assertEqual(transition.kind, "not_required");
    assert(!diameterTransitionIsActive(transition), "No debe quedar transicion activa.");
    assertEqual(onlyAccessory(accessories).kind, "elbow");
  });

  verify(results, "Caso 2 - recto cambio diametro conserva solo reduccion", () => {
    const transitions = detectDiameterTransitionProposals({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      equipment: transitionEquipment(),
      network: straightNetwork(),
    });
    const accessories = detectRouteAccessoryProposals({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      equipment: transitionEquipment(),
      network: straightNetwork(),
    });

    assertEqual(onlyTransition(transitions).kind, "simple_reduction");
    assertEqual(accessories.length, 0);
  });

  verify(results, "Caso 3 - giro y cambio diametro detecta compound", () => {
    const proposal = compoundProposal();
    const accessory = onlyAccessory(
      detectRouteAccessoryProposals({
        diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
        equipment: transitionEquipment(),
        network: turnNetwork(),
      }),
    );

    assertEqual(proposal.kind, "compound_turn_transition");
    assertEqual(proposal.state, "needs_review");
    assertEqual(accessory.kind, "elbow");
  });

  verify(results, "Caso 4 - Tabla No 3 no trae codo con reduccion directo", () => {
    const directRows = SIGAS_ACCESSORY_EQUIVALENT_LENGTHS.filter((row) => {
      const label = row.label.toLowerCase();

      return (
        row.genericType === "elbow" &&
        label.includes("reduc") &&
        /(\d{2,3})\s*(?:a|x|-)\s*(\d{2,3})/.test(label)
      );
    });

    assertEqual(directRows.length, 0);
    assertEqual(
      getSigasCompoundTurnTransitionDirectCatalogCandidates(compoundProposal())
        .length,
      0,
    );
  });

  verify(results, "Caso 5 - si no existe pieza unica no se inventa", () => {
    const preview = compoundPreview();

    assertEqual(preview.directCandidates.length, 0);
    assertEqual(preview.solutionKind, "composition");
    assert(
      preview.contributions.every(
        (contribution) => contribution.source !== "single_piece_candidate",
      ),
      "No debe crear candidato de pieza unica sin fila SIGAS.",
    );
  });

  verify(results, "Caso 6 - composicion requiere decisiones compatibles", () => {
    const onlyElbow = compoundPreview({
      network: networkWithConfirmedElbow(),
    });
    const onlyReduction = compoundPreview({
      proposal: confirmedCompoundProposal(),
    });
    const noDecisions = compoundPreview();

    assertEqual(onlyElbow.confirmationState, "needs_reduction_confirmation");
    assertEqual(onlyElbow.totalEquivalentLengthMeters, null);
    assertEqual(onlyReduction.confirmationState, "needs_elbow_confirmation");
    assertEqual(onlyReduction.totalEquivalentLengthMeters, null);
    assertEqual(noDecisions.confirmationState, "needs_compatible_decisions");
  });

  verify(results, "Caso 7 - no duplica codo confirmado", () => {
    const preview = resolvedCompoundPreview();
    const turnContributions = preview.contributions.filter(
      (contribution) => contribution.role === "turn",
    );

    assertEqual(turnContributions.length, 1);
    assertClose(turnContributions[0]?.equivalentLengthMeters, 1.191);
  });

  verify(results, "Caso 8 - no duplica reduccion confirmada", () => {
    const preview = resolvedCompoundPreview();
    const reductionContributions = preview.contributions.filter(
      (contribution) => contribution.role === "diameter_change",
    );

    assertEqual(reductionContributions.length, 1);
    assertClose(reductionContributions[0]?.equivalentLengthMeters, 0.525);
  });

  verify(results, "Caso 9 - cambio de diametro recalcula variante", () => {
    const initial = resolvedCompoundPreview();
    const decision = confirmedCompoundDecision();
    const changedProposal = compoundProposal({
      decisions: [decision],
      diameters: { s1: diameter(40), s2: diameter(25) },
    });
    const changed = compoundPreview({
      diameters: { s1: diameter(40), s2: diameter(25) },
      network: networkWithConfirmedElbow(),
      proposal: changedProposal,
    });
    const initialReduction = contribution(initial, "diameter_change");
    const changedReduction = contribution(changed, "diameter_change");

    assertEqual(
      initialReduction.variantLabel,
      "Cupla Reduccion HH 32 a 25 mm",
    );
    assertEqual(
      changedReduction.variantLabel,
      "Cupla Reduccion HH 40 a 25 mm",
    );
    assertClose(changedReduction.equivalentLengthMeters, 0.49);
  });

  verify(results, "Caso 10 - igualar diametros elimina reduccion y conserva codo", () => {
    const decision = confirmedCompoundDecision();
    const network = networkWithConfirmedElbow();
    const proposal = onlyTransition(
      detectDiameterTransitionProposals({
        decisions: [decision],
        diameterBySegmentId: diameterMap({
          s1: diameter(32),
          s2: diameter(32),
        }),
        equipment: transitionEquipment(),
        network,
      }),
    );

    assertEqual(proposal.kind, "not_required");
    assertEqual(proposal.state, "not_required");
    assertEqual(confirmedElbowCount(network), 1);
  });

  verify(results, "Caso 11 - eliminar giro conserva reduccion requerida", () => {
    const proposal = confirmedSimpleReductionProposal();
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: {
        id: "technical-route:appliance",
        nodeIds: ["m", "n", "a"],
        physicalLengthMeters: 10,
        segmentIds: ["s1", "s2"],
        status: "resolved",
      },
      transitions: [proposal],
    });

    assertEqual(proposal.kind, "simple_reduction");
    assertEqual(resolution.status, "resolved");
    assertClose(resolution.equivalentLengthMeters, 0.525);
  });

  verify(results, "Caso 12 - determinismo", () => {
    const first = JSON.stringify(resolvedCompoundPreview());
    const second = JSON.stringify(resolvedCompoundPreview());

    assertEqual(first, second);
  });

  verify(results, "Caso 13 - preview suma exactamente contribuciones", () => {
    const preview = resolvedCompoundPreview();
    const expected = preview.contributions.reduce(
      (sum, item) => sum + (item.equivalentLengthMeters ?? 0),
      0,
    );

    assertEqual(preview.status, "resolved");
    assertClose(preview.totalEquivalentLengthMeters, expected);
    assertClose(preview.totalEquivalentLengthMeters, 1.716);
  });

  verify(results, "Caso 14 - solver 09C3B sigue sin computar compound", () => {
    const proposal = confirmedCompoundProposal();
    const resolution = resolveTechnicalRouteTransitions({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      governingRouteAccessoryEquivalentLengthMeters: 0,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: {
        id: "technical-route:appliance",
        nodeIds: ["m", "n", "a"],
        physicalLengthMeters: 10,
        segmentIds: ["s1", "s2"],
        status: "resolved",
      },
      transitions: [proposal],
    });

    assertEqual(proposal.kind, "compound_turn_transition");
    assertEqual(resolution.status, "unresolved");
    assertEqual(resolution.equivalentLengthMeters, null);
  });

  return results;
}

function resolvedCompoundPreview() {
  return compoundPreview({
    network: networkWithConfirmedElbow(),
    proposal: confirmedCompoundProposal(),
  });
}

function compoundPreview(params: {
  diameters?: Record<string, PipeDiameterReference>;
  network?: ManualRouteNetwork;
  proposal?: DiameterTransitionProposal;
} = {}) {
  const proposal = params.proposal ?? compoundProposal();
  const diameters =
    params.diameters ??
    Object.fromEntries(
      proposal.incidentSegments.map((segment) => [
        segment.segmentId,
        segment.diameter,
      ]),
    );

  return resolveCompoundTurnTransitionPreview({
    diameterBySegmentId: diameterMap(diameters),
    directCandidates:
      getSigasCompoundTurnTransitionDirectCatalogCandidates(proposal),
    network: params.network ?? turnNetwork(),
    pipeSystem: SIGAS_PIPE_SYSTEM,
    proposal,
  });
}

function compoundProposal(params: {
  decisions?: DiameterTransitionDecision[];
  diameters?: Record<string, PipeDiameterReference>;
} = {}) {
  return onlyTransition(
    detectDiameterTransitionProposals({
      decisions: params.decisions,
      diameterBySegmentId: diameterMap(
        params.diameters ?? { s1: diameter(32), s2: diameter(25) },
      ),
      equipment: transitionEquipment(),
      network: turnNetwork(),
    }),
  );
}

function confirmedCompoundProposal() {
  const decision = confirmedCompoundDecision();

  return compoundProposal({ decisions: [decision] });
}

function confirmedCompoundDecision() {
  const proposal = compoundProposal();
  const candidate = transitionCandidateByFamily(
    getSigasDiameterTransitionCatalogCandidates(proposal),
    "cupla-reduccion-hh",
  );
  const result = confirmDiameterTransitionProposal({
    candidate,
    decidedAt: 10,
    proposal,
  });

  assert(result.ok, "La reduccion del compound deberia confirmarse.");
  return result.decision;
}

function confirmedSimpleReductionProposal() {
  const proposal = onlyTransition(
    detectDiameterTransitionProposals({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      equipment: transitionEquipment(),
      network: straightNetwork(),
    }),
  );
  const candidate = transitionCandidateByFamily(
    getSigasDiameterTransitionCatalogCandidates(proposal),
    "cupla-reduccion-hh",
  );
  const result = confirmDiameterTransitionProposal({
    candidate,
    decidedAt: 20,
    proposal,
  });

  assert(result.ok, "La reduccion simple deberia confirmarse.");

  return onlyTransition(
    detectDiameterTransitionProposals({
      decisions: [result.decision],
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(25) }),
      equipment: transitionEquipment(),
      network: straightNetwork(),
    }),
  );
}

function networkWithConfirmedElbow() {
  const baseNetwork = turnNetwork();
  const rawProposal = onlyAccessory(
    detectRouteAccessoryProposals({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(32) }),
      equipment: transitionEquipment(),
      network: baseNetwork,
    }),
  );
  const proposal = withAccessoryProposalSystemMatch(
    rawProposal,
    matchSigasAccessoryProposal(rawProposal),
  );
  const ownerResolution = resolveAccessoryProposalTechnicalOwner({
    diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(32) }),
    network: baseNetwork,
    proposal,
  });
  const candidate = accessoryCandidateByFamily(
    getSigasAccessoryCatalogCandidates({
      diameterBySegmentId: diameterMap({ s1: diameter(32), s2: diameter(32) }),
      hasManualAccessory: false,
      ownerResolution,
      proposal,
    }),
    "codo-normal-a-90",
  );
  const result = confirmRouteAccessoryProposal({
    decidedAt: 1,
    network: baseNetwork,
    ownerResolution,
    proposal,
    selection: accessoryCatalogSelectionFromCandidate(candidate),
  });

  assert(result.ok, "El codo SIGAS deberia confirmarse.");
  return result.network;
}

function contribution(
  preview: ReturnType<typeof resolveCompoundTurnTransitionPreview>,
  role: "diameter_change" | "turn",
) {
  const item = preview.contributions.find(
    (current) => current.role === role,
  );

  assert(item, `Falta contribucion ${role}.`);
  return item;
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

function routeNode(
  id: string,
  kind: "appliance" | "route" | "supply",
  x: number,
  y: number,
): RouteNode {
  return {
    id,
    kind,
    position: { x, y },
  };
}

function supplyNode(): RouteNode {
  return {
    equipmentId: "meter",
    id: "m",
    kind: "supply",
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

function accessoryCandidateByFamily<
  T extends { familyId: string },
>(candidates: T[], familyId: string) {
  const candidate = candidates.find((item) => item.familyId === familyId);

  assert(candidate, `No se encontro familia ${familyId}.`);
  return candidate;
}

function transitionCandidateByFamily(
  candidates: ReturnType<typeof getSigasDiameterTransitionCatalogCandidates>,
  familyId: string,
) {
  return accessoryCandidateByFamily(candidates, familyId);
}

function confirmedElbowCount(network: ManualRouteNetwork) {
  return network.segments.reduce(
    (count, segment) =>
      count +
      (segment.accessories ?? []).filter(
        (accessory) => accessory.type === "elbow",
      ).length,
    0,
  );
}

function verify(
  results: CompoundTurnTransitionResolutionVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
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
      Math.abs(actual - expected) <= EPSILON,
    `Expected ${String(expected)}, got ${String(actual)}.`,
  );
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(
    actual === expected,
    `Expected ${String(expected)}, got ${String(actual)}.`,
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
    JSON.stringify(runCompoundTurnTransitionResolutionVerifications(), null, 2),
  );
}
