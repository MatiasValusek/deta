import type {
  PipeDiameterReference,
  PipeSystem,
  PipeSystemResolution,
  PipeSegmentSizingResult,
} from "@/lib/calculation/pipeSystem";
import { resolveTechnicalRouteAccessories } from "@/lib/calculation/technicalRouteAccessories";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteAccessoryType,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import {
  accessoryCatalogSelectionFromCandidate,
  type AccessoryCatalogCandidate,
} from "@/lib/calculation/accessoryCatalogCandidates";
import {
  automaticAccessoryId,
  confirmRouteAccessoryProposal,
  detectRouteAccessoryProposals,
  reconcileRouteAccessoryProposalState,
  rejectRouteAccessoryProposal,
  resolveAccessoryProposalTechnicalOwner,
  type AccessoryProposal,
  type AccessoryProposalDecision,
  type AccessoryProposalDiameterReference,
} from "@/lib/routing/routeAccessoryProposals";
import { SIGAS_PIPE_SYSTEM } from "./index";
import { SIGAS_DIAMETERS } from "./sigasData";
import {
  getSigasAccessoryCatalogCandidates,
  matchSigasAccessoryProposal,
} from "./sigasAccessoryProposal";

export type SigasAccessoryProfessionalSelectionVerificationResult = {
  name: string;
  status: "passed";
};

const TEST_10: PipeDiameterReference = {
  externalDiameterMillimeters: 10,
  id: "test-10",
  internalDiameterMillimeters: 8,
  label: "Test 10",
};
const TEST_20: PipeDiameterReference = {
  externalDiameterMillimeters: 20,
  id: "test-20",
  internalDiameterMillimeters: 16,
  label: "Test 20",
};

export function runSigasAccessoryProfessionalSelectionVerifications() {
  const results: SigasAccessoryProfessionalSelectionVerificationResult[] = [];

  verify(results, "Caso A - codo con varias familias", () => {
    const proposal = sigasElbowProposal();
    const candidates = sigasCandidates(proposal, sameSigasDiameters(["s1", "s2"]));
    const confirmation = confirmRouteAccessoryProposal({
      decidedAt: 1,
      network: elbowNetwork(),
      proposal,
    });

    assert(candidates.length > 1, "Expected multiple elbow families.");
    assert(!confirmation.ok, "No debe autoseleccionar familia tecnica.");
  });

  verify(results, "Caso B - filtrado por geometria", () => {
    const candidates = sigasCandidates(
      sigasElbowProposal(),
      sameSigasDiameters(["s1", "s2"]),
    );

    assert(
      candidates.every((candidate) => !candidate.familyId.includes("45")),
      "Un giro de 90 no debe ofrecer familias de 45.",
    );
  });

  verify(results, "Caso C - confirmacion", () => {
    const proposal = sigasElbowProposal();
    const candidate = candidateByFamily(
      sigasCandidates(proposal, sameSigasDiameters(["s1", "s2"])),
      "codo-normal-a-90",
    );
    const result = confirmWithCandidate({
      candidate,
      diameterBySegmentId: sameSigasDiameters(["s1", "s2"]),
      network: elbowNetwork(),
      proposal,
    });

    assert(result.ok, "La seleccion explicita deberia confirmar.");
    const accessory = automaticAccessory(result.network, proposal.id);
    assertEqual(accessory?.equivalentLengthSource, "pipe_system");
    assertEqual(accessory?.catalogFamilyId, "codo-normal-a-90");
    assertEqual(accessory?.origin, "user_confirmed");
  });

  verify(results, "Caso D - idempotencia", () => {
    const proposal = sigasElbowProposal();
    const diameterBySegmentId = sameSigasDiameters(["s1", "s2"]);
    const candidate = candidateByFamily(
      sigasCandidates(proposal, diameterBySegmentId),
      "codo-normal-a-90",
    );
    const first = confirmWithCandidate({
      candidate,
      diameterBySegmentId,
      network: elbowNetwork(),
      proposal,
    });
    assert(first.ok, "Primera confirmacion deberia resolver.");
    const second = confirmWithCandidate({
      candidate,
      diameterBySegmentId,
      network: first.network,
      proposal,
    });

    assert(second.ok, "Segunda confirmacion deberia resolver.");
    assertEqual(automaticAccessoryCount(second.network, proposal.id), 1);
  });

  verify(results, "Caso E - mismo diametro incidente", () => {
    const proposal = sigasElbowProposal();
    const owner = resolveAccessoryProposalTechnicalOwner({
      diameterBySegmentId: sameSigasDiameters(["s1", "s2"]),
      network: elbowNetwork(),
      proposal,
    });

    assertEqual(owner.status, "unambiguous");
    assertEqual(
      owner.status === "unambiguous" ? owner.ownerSegmentId : null,
      "s1",
    );
  });

  verify(results, "Caso F - diametros incidentes distintos", () => {
    const proposal = sigasElbowProposal();
    const diameterBySegmentId = {
      s1: sigasDiameter("sigas-20"),
      s2: sigasDiameter("sigas-25"),
    };
    const owner = resolveAccessoryProposalTechnicalOwner({
      diameterBySegmentId,
      network: elbowNetwork(),
      proposal,
    });
    const candidate = candidateByFamily(
      sigasCandidates(proposal, diameterBySegmentId),
      "codo-normal-a-90",
    );
    const result = confirmWithCandidate({
      candidate,
      diameterBySegmentId,
      network: elbowNetwork(),
      proposal,
    });

    assertEqual(owner.status, "ambiguous");
    assert(!result.ok, "No debe confirmar con diametros distintos.");
  });

  verify(results, "Caso G - tee mismo diametro", () => {
    const proposal = sigasTeeProposal();
    const candidates = sigasCandidates(
      proposal,
      sameSigasDiameters(["s1", "s2", "s3"]),
      teeNetwork(),
    );

    assert(candidates.length >= 2, "Expected multiple tee families.");
    assert(
      candidates.every((candidate) => candidate.status === "compatible"),
      "Tee de diametro uniforme deberia permitir seleccion.",
    );
  });

  verify(results, "Caso H - tee con diametros distintos", () => {
    const proposal = sigasTeeProposal();
    const candidates = sigasCandidates(
      proposal,
      {
        s1: sigasDiameter("sigas-20"),
        s2: sigasDiameter("sigas-20"),
        s3: sigasDiameter("sigas-25"),
      },
      teeNetwork(),
    );

    assert(
      candidates.every(
        (candidate) => candidate.status === "requires_more_information",
      ),
      "Tee con transicion debe quedar pendiente.",
    );
  });

  verify(results, "Caso I - cambio posterior de 20 a 25", () => {
    const proposal = sigasElbowProposal();
    const candidate = candidateByFamily(
      sigasCandidates(proposal, sameSigasDiameters(["s1", "s2"])),
      "codo-normal-a-90",
    );
    const confirmed = confirmWithCandidate({
      candidate,
      diameterBySegmentId: sameSigasDiameters(["s1", "s2"]),
      network: elbowNetwork(),
      proposal,
    });
    assert(confirmed.ok, "La confirmacion deberia resolver.");

    const initial = routeAccessoryEquivalentLength(
      confirmed.network,
      sigasDiameter("sigas-20"),
    );
    const escalated = routeAccessoryEquivalentLength(
      confirmed.network,
      sigasDiameter("sigas-25"),
    );
    const accessory = automaticAccessory(confirmed.network, proposal.id);

    assertEqual(accessory?.catalogFamilyId, "codo-normal-a-90");
    assertClose(initial, 0.953);
    assertClose(escalated, 0.856);
  });

  verify(results, "Caso J - variante inexistente", () => {
    const network = networkWithAccessoryFamily("codo-mh-a-90");
    const resolution = resolveTechnicalRouteAccessories({
      diameterBySegmentId: {
        s1: sigasDiameter("sigas-50"),
        s2: sigasDiameter("sigas-50"),
      },
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: {
        id: "r1",
        physicalLengthMeters: 2,
        segmentIds: ["s1", "s2"],
        status: "resolved",
      },
      segments: network.segments,
    });

    assertEqual(resolution.status, "unsupported");
    assert(
      resolution.reasons.join(" ").includes("familia SIGAS confirmada"),
      "Debe explicar que no existe variante compatible.",
    );
  });

  verify(results, "Caso K - rechazo persistente", () => {
    const proposal = sigasElbowProposal();
    const rejected = rejectRouteAccessoryProposal({
      decidedAt: 1,
      network: elbowNetwork(),
      proposal,
    });
    const proposals = detectRouteAccessoryProposals({
      decisions: [rejected.decision],
      diameterBySegmentId: sameSigasDiameters(["s1", "s2"]),
      equipment: equipment(),
      network: elbowNetwork(),
    });

    assertEqual(onlyProposal(proposals).state, "rejected");
  });

  verify(results, "Caso L - cambio de geometria", () => {
    const proposal = sigasElbowProposal();
    const confirmed = confirmWithCandidate({
      candidate: candidateByFamily(
        sigasCandidates(proposal, sameSigasDiameters(["s1", "s2"])),
        "codo-normal-a-90",
      ),
      diameterBySegmentId: sameSigasDiameters(["s1", "s2"]),
      network: elbowNetwork(),
      proposal,
    });
    assert(confirmed.ok, "La confirmacion deberia resolver.");
    const reconciled = reconcileRouteAccessoryProposalState({
      decisions: [confirmed.decision],
      network: straightNetworkWithAutomatic(confirmed.decision),
      proposals: detectRouteAccessoryProposals({
        equipment: equipment(),
        network: straightNetwork(),
      }),
    });

    assertEqual(reconciled.decisions.length, 0);
    assertEqual(automaticAccessoryCount(reconciled.network, proposal.id), 0);
    assertEqual(manualAccessoryCount(reconciled.network), 1);
  });

  verify(results, "Caso M - accesorio manual existente", () => {
    const proposal = sigasElbowProposal(manualElbowNetwork());
    const candidate = candidateByFamily(
      sigasCandidates(proposal, sameSigasDiameters(["s1", "s2"]), manualElbowNetwork()),
      "codo-normal-a-90",
    );
    const result = confirmWithCandidate({
      candidate,
      diameterBySegmentId: sameSigasDiameters(["s1", "s2"]),
      network: manualElbowNetwork(),
      proposal,
    });

    assert(!result.ok, "No debe duplicar un accesorio manual existente.");
    assertEqual(automaticAccessoryCount(manualElbowNetwork(), proposal.id), 0);
  });

  verify(results, "Caso N - recalculo", () => {
    const proposal = testElbowProposal();
    const owner = resolveAccessoryProposalTechnicalOwner({
      diameterBySegmentId: {
        s1: TEST_10,
        s2: TEST_10,
      },
      network: calculationNetwork(),
      proposal,
    });
    const confirmed = confirmRouteAccessoryProposal({
      decidedAt: 1,
      network: calculationNetwork(),
      origin: "user_confirmed",
      ownerResolution: owner,
      proposal,
      selection: {
        familyId: "boost-elbow",
        label: "Boost elbow",
        pipeSystemId: "test",
        type: "elbow",
      },
    });
    assert(confirmed.ok, "La confirmacion deberia resolver.");

    const result = calculateTechnicalTree({
      equipment: calculationEquipment(),
      minSegmentLengthSource: 0.0001,
      network: confirmed.network,
      pipeSystem: recalculationPipeSystem(),
      scaleMetersPerSourceUnit: 1,
    });
    const sizing = result.networkSizing?.segments.find(
      (segment) => segment.segmentId === "s1",
    );

    assertEqual(result.status, "valid");
    assertEqual(sizing?.calculatedDiameter?.id, "test-20");
    assertClose(sizing?.sizingLengthMeters, 50);
  });

  verify(results, "Caso O - determinismo", () => {
    const proposal = sigasElbowProposal();
    const rejected = rejectRouteAccessoryProposal({
      decidedAt: 1,
      network: elbowNetwork(),
      proposal,
    });
    const first = serializeReviewSet({
      decisions: [rejected.decision],
      diameterBySegmentId: sameSigasDiameters(["s1", "s2"]),
      network: elbowNetwork(),
    });
    const second = serializeReviewSet({
      decisions: [rejected.decision],
      diameterBySegmentId: sameSigasDiameters(["s1", "s2"]),
      network: elbowNetwork(),
    });

    assertEqual(first, second);
  });

  return results;
}

function sigasElbowProposal(network = elbowNetwork()) {
  return withSigasMatch(
    onlyProposal(
      detectRouteAccessoryProposals({
        diameterBySegmentId: sameSigasDiameters(["s1", "s2"]),
        equipment: equipment(),
        network,
      }),
    ),
  );
}

function sigasTeeProposal() {
  return withSigasMatch(
    onlyProposal(
      detectRouteAccessoryProposals({
        diameterBySegmentId: sameSigasDiameters(["s1", "s2", "s3"]),
        equipment: equipment(),
        network: teeNetwork(),
      }),
    ),
  );
}

function testElbowProposal() {
  return onlyProposal(
    detectRouteAccessoryProposals({
      diameterBySegmentId: {
        s1: TEST_10,
        s2: TEST_10,
      },
      equipment: calculationEquipment(),
      network: calculationNetwork(),
    }),
  );
}

function withSigasMatch(proposal: AccessoryProposal) {
  return {
    ...proposal,
    systemMatch: matchSigasAccessoryProposal(proposal),
  };
}

function sigasCandidates(
  proposal: AccessoryProposal,
  diameterBySegmentId: Record<string, AccessoryProposalDiameterReference>,
  network = elbowNetwork(),
) {
  const ownerResolution = resolveAccessoryProposalTechnicalOwner({
    diameterBySegmentId,
    network,
    proposal,
  });

  return getSigasAccessoryCatalogCandidates({
    diameterBySegmentId,
    hasManualAccessory: network.segments.some((segment) =>
      (segment.accessories ?? []).some(
        (accessory) => accessory.type === proposal.domainAccessory?.type,
      ),
    ),
    ownerResolution,
    proposal,
  });
}

function confirmWithCandidate(params: {
  candidate: AccessoryCatalogCandidate;
  diameterBySegmentId: Record<string, AccessoryProposalDiameterReference>;
  network: ManualRouteNetwork;
  proposal: AccessoryProposal;
}) {
  return confirmRouteAccessoryProposal({
    decidedAt: 1,
    network: params.network,
    origin: "user_confirmed",
    ownerResolution: resolveAccessoryProposalTechnicalOwner({
      diameterBySegmentId: params.diameterBySegmentId,
      network: params.network,
      proposal: params.proposal,
    }),
    proposal: params.proposal,
    selection: accessoryCatalogSelectionFromCandidate(params.candidate),
  });
}

function routeAccessoryEquivalentLength(
  network: ManualRouteNetwork,
  diameter: PipeDiameterReference,
) {
  const resolution = resolveTechnicalRouteAccessories({
    diameterBySegmentId: {
      s1: diameter,
      s2: diameter,
    },
    pipeSystem: SIGAS_PIPE_SYSTEM,
    route: {
      id: "r1",
      physicalLengthMeters: 2,
      segmentIds: ["s1", "s2"],
      status: "resolved",
    },
    segments: network.segments,
  });

  assertEqual(resolution.status, "resolved");
  return resolution.governingRouteAccessoryEquivalentLengthMeters;
}

function serializeReviewSet(params: {
  decisions: AccessoryProposalDecision[];
  diameterBySegmentId: Record<string, AccessoryProposalDiameterReference>;
  network: ManualRouteNetwork;
}) {
  const proposals = detectRouteAccessoryProposals({
    decisions: params.decisions,
    diameterBySegmentId: params.diameterBySegmentId,
    equipment: equipment(),
    network: params.network,
  }).map(withSigasMatch);

  return JSON.stringify(
    proposals.map((proposal) => ({
      candidates: sigasCandidates(
        proposal,
        params.diameterBySegmentId,
        params.network,
      ).map((candidate) => ({
        familyId: candidate.familyId,
        status: candidate.status,
      })),
      id: proposal.id,
      state: proposal.state,
    })),
  );
}

function elbowNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      { equipmentId: "supply", id: "a", kind: "supply" },
      routeNode("b", 1, 0),
      routeNode("c", 1, 1),
    ],
    segments: [
      segment("s1", "a", "b"),
      segment("s2", "b", "c"),
    ],
  };
}

function manualElbowNetwork(): ManualRouteNetwork {
  return {
    ...elbowNetwork(),
    segments: [
      {
        ...segment("s1", "a", "b"),
        accessories: [manualAccessory("manual-elbow", "s1", "elbow")],
      },
      segment("s2", "b", "c"),
    ],
  };
}

function teeNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      { equipmentId: "supply", id: "a", kind: "supply" },
      routeNode("b", 1, 0),
      routeNode("c", 2, 0),
      routeNode("d", 1, 1),
    ],
    segments: [
      segment("s1", "a", "b"),
      segment("s2", "b", "c"),
      segment("s3", "b", "d"),
    ],
  };
}

function straightNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      { equipmentId: "supply", id: "a", kind: "supply" },
      routeNode("b", 1, 0),
      routeNode("c", 2, 0),
    ],
    segments: [
      segment("s1", "a", "b"),
      segment("s2", "b", "c"),
    ],
  };
}

function straightNetworkWithAutomatic(
  decision: AccessoryProposalDecision,
): ManualRouteNetwork {
  return {
    ...straightNetwork(),
    segments: [
      {
        ...segment("s1", "a", "b"),
        accessories: [
          manualAccessory("manual-other", "s1", "other"),
          {
            catalogCode: decision.catalogFamilyId,
            catalogFamilyId: decision.catalogFamilyId,
            equivalentLengthMetersPerUnit: null,
            equivalentLengthSource: "pipe_system",
            id: decision.accessoryId ?? automaticAccessoryId(decision.proposalId),
            origin: "user_confirmed",
            quantity: 1,
            segmentId: "s1",
            type: "elbow",
          },
        ],
      },
      segment("s2", "b", "c"),
    ],
  };
}

function networkWithAccessoryFamily(familyId: string): ManualRouteNetwork {
  return {
    ...elbowNetwork(),
    segments: [
      {
        ...segment("s1", "a", "b"),
        accessories: [
          {
            catalogCode: familyId,
            catalogFamilyId: familyId,
            equivalentLengthMetersPerUnit: null,
            equivalentLengthSource: "pipe_system",
            id: "auto",
            origin: "user_confirmed",
            quantity: 1,
            segmentId: "s1",
            type: "elbow",
          },
        ],
      },
      segment("s2", "b", "c"),
    ],
  };
}

function calculationNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      { equipmentId: "supply", id: "a", kind: "supply" },
      routeNode("b", 10, 0),
      routeNode("c", 10, 10),
      { equipmentId: "appliance", id: "d", kind: "appliance" },
    ],
    segments: [
      segment("s1", "a", "b"),
      segment("s2", "b", "c"),
      segment("s3", "c", "d"),
    ],
  };
}

function equipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: { x: 0, y: 0 },
      id: "supply",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
  ];
}

function calculationEquipment(): WorkbenchEquipment[] {
  return [
    ...equipment(),
    {
      connectionPoint: { x: 10, y: 20 },
      demandUnit: "m3_h",
      demandValue: 1,
      id: "appliance",
      name: "A",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "stove",
    },
  ];
}

function routeNode(id: string, x: number, y: number) {
  return {
    id,
    kind: "route" as const,
    position: { x, y },
  };
}

function segment(id: string, fromNodeId: string, toNodeId: string) {
  return {
    fromNodeId,
    id,
    toNodeId,
  };
}

function manualAccessory(
  id: string,
  segmentId: string,
  type: RouteAccessoryType,
): RouteSegmentAccessory {
  return {
    equivalentLengthMetersPerUnit: 0.4,
    equivalentLengthSource: "manual",
    id,
    origin: "manual",
    quantity: 1,
    segmentId,
    type,
  };
}

function sameSigasDiameters(segmentIds: string[]) {
  return Object.fromEntries(
    segmentIds.map((segmentId) => [segmentId, sigasDiameter("sigas-20")]),
  );
}

function sigasDiameter(id: string): PipeDiameterReference {
  const diameter = SIGAS_DIAMETERS.find((item) => item.id === id);
  assert(diameter, `Missing diameter ${id}.`);

  return {
    externalDiameterMillimeters: diameter.externalDiameterMillimeters,
    id: diameter.id,
    internalDiameterMillimeters: diameter.internalDiameterMillimeters,
    label: diameter.label,
    nominalDiameter: diameter.nominalDiameter,
  };
}

function recalculationPipeSystem(): PipeSystem {
  return {
    getAvailableDiameters: () => ({
      explanation: "Diametros de prueba.",
      status: "resolved",
      value: [TEST_10, TEST_20],
    }),
    identity: {
      id: "test",
      name: "Test",
    },
    resolveAccessoryEquivalentLength: (context) => {
      if (context.accessory.catalogFamilyId !== "boost-elbow") {
        return {
          reason: "Familia no soportada.",
          status: "unsupported",
        };
      }

      return {
        explanation: "Equivalencia de prueba.",
        status: "resolved",
        value: context.pipe?.diameter?.id === "test-20" ? 20 : 20,
      };
    },
    resolveDiameterTransitionEquivalentLength: () => ({
      reason: "Transiciones fuera de la verificacion 09B.",
      status: "unresolved",
    }),
    sizeSegment: (context): PipeSystemResolution<PipeSegmentSizingResult> => {
      if (context.calculationLengthMeters === null) {
        return {
          reason: "Falta longitud.",
          status: "unresolved",
        };
      }

      const selectedDiameter =
        context.calculationLengthMeters > 40 ? TEST_20 : TEST_10;

      return {
        explanation: "Dimensionado de prueba.",
        status: "resolved",
        value: {
          explanation: "Dimensionado de prueba.",
          selectedDiameter,
        },
      };
    },
  };
}

function candidateByFamily(
  candidates: AccessoryCatalogCandidate[],
  familyId: string,
) {
  const candidate = candidates.find((item) => item.familyId === familyId);
  assert(candidate, `Expected candidate ${familyId}.`);

  return candidate;
}

function onlyProposal(proposals: AccessoryProposal[]) {
  assertEqual(proposals.length, 1);
  return proposals[0] as AccessoryProposal;
}

function automaticAccessory(network: ManualRouteNetwork, proposalId: string) {
  const id = automaticAccessoryId(proposalId);

  return (
    network.segments
      .flatMap((segment) => segment.accessories ?? [])
      .find((accessory) => accessory.id === id) ?? null
  );
}

function automaticAccessoryCount(network: ManualRouteNetwork, proposalId: string) {
  return network.segments.reduce(
    (count, current) =>
      count +
      (current.accessories ?? []).filter(
        (accessory) => accessory.id === automaticAccessoryId(proposalId),
      ).length,
    0,
  );
}

function manualAccessoryCount(network: ManualRouteNetwork) {
  return network.segments.reduce(
    (count, current) =>
      count +
      (current.accessories ?? []).filter(
        (accessory) => accessory.equivalentLengthSource === "manual",
      ).length,
    0,
  );
}

function verify(
  results: SigasAccessoryProfessionalSelectionVerificationResult[],
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
    JSON.stringify(runSigasAccessoryProfessionalSelectionVerifications(), null, 2),
  );
}
