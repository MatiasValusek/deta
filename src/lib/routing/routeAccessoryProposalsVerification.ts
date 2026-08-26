import type { PipeSystem } from "@/lib/calculation/pipeSystem";
import { resolveTechnicalRouteAccessories } from "@/lib/calculation/technicalRouteAccessories";
import { matchSigasAccessoryProposal } from "@/lib/calculation/pipeSystems/sigas/sigasAccessoryProposal";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork, RouteSegmentAccessory } from "@/lib/routing/types";
import {
  automaticAccessoryId,
  confirmRouteAccessoryProposal,
  detectRouteAccessoryProposals,
  reconcileRouteAccessoryProposalState,
  rejectRouteAccessoryProposal,
  withAccessoryProposalSystemMatch,
  type AccessoryProposal,
  type AccessoryProposalDecision,
  type AccessoryProposalDiameterReference,
} from "./routeAccessoryProposals";

export type RouteAccessoryProposalVerificationResult = {
  name: string;
  status: "passed";
};

const TEST_DIAMETER: AccessoryProposalDiameterReference = {
  externalDiameterMillimeters: 20,
  id: "test-20",
  internalDiameterMillimeters: 16,
  label: "Test 20",
};

const OTHER_DIAMETER: AccessoryProposalDiameterReference = {
  externalDiameterMillimeters: 25,
  id: "test-25",
  internalDiameterMillimeters: 20,
  label: "Test 25",
};

export function runRouteAccessoryProposalVerifications() {
  const results: RouteAccessoryProposalVerificationResult[] = [];

  verify(results, "Caso A - recta", () => {
    const proposals = detectRouteAccessoryProposals({
      equipment: [],
      network: straightNetwork(),
    });

    assertEqual(proposals.length, 0);
  });

  verify(results, "Caso B - giro 90", () => {
    const proposals = detectRouteAccessoryProposals({
      diameterBySegmentId: sameDiameters(["s1", "s2"]),
      equipment: [],
      network: elbowNetwork(),
    });
    const elbow = onlyProposal(proposals);

    assertEqual(elbow.kind, "elbow");
    assertEqual(elbow.state, "proposed");
    assertEqual(elbow.ownerResolution.status, "unambiguous");
  });

  verify(results, "Caso C - tee", () => {
    const tee = onlyProposal(
      detectRouteAccessoryProposals({
        equipment: [],
        network: teeNetwork(),
      }),
    );

    assertEqual(tee.kind, "tee");
    assertEqual(tee.state, "needs_review");
  });

  verify(results, "Caso D - grado 4", () => {
    const proposal = onlyProposal(
      detectRouteAccessoryProposals({
        equipment: [],
        network: crossNetwork(),
      }),
    );

    assertEqual(proposal.kind, "unsupported");
    assertEqual(proposal.state, "needs_review");
    assertEqual(proposal.systemMatch?.suggestedCatalogCode, undefined);
  });

  verify(results, "Caso E - terminal", () => {
    const proposals = detectRouteAccessoryProposals({
      equipment: terminalEquipment(),
      network: terminalNetwork(),
    });

    assertEqual(proposals.length, 0);
    assert(
      proposals.every((proposal) => proposal.domainAccessory?.type !== "valve"),
      "No debe proponer valvulas terminales.",
    );
  });

  verify(results, "Caso F - ids determinisiticos", () => {
    const first = detectRouteAccessoryProposals({
      diameterBySegmentId: sameDiameters(["s1", "s2"]),
      equipment: [],
      network: elbowNetwork(),
    });
    const second = detectRouteAccessoryProposals({
      diameterBySegmentId: sameDiameters(["s1", "s2"]),
      equipment: [],
      network: elbowNetwork(),
    });

    assertEqual(first.map((proposal) => proposal.id).join("|"), second.map((proposal) => proposal.id).join("|"));
  });

  verify(results, "Caso G - aceptar codo resoluble", () => {
    const proposal = resolvableElbowProposal();
    const confirmed = confirmRouteAccessoryProposal({
      decidedAt: 1,
      network: elbowNetwork(),
      proposal,
    });

    assert(confirmed.ok, "La confirmacion deberia resolver.");
    const resolution = resolveTechnicalRouteAccessories({
      diameterBySegmentId: sameDiameters(["s1", "s2"]),
      pipeSystem: testPipeSystem(),
      route: {
        id: "r1",
        physicalLengthMeters: 2,
        segmentIds: ["s1", "s2"],
        status: "resolved",
      },
      segments: confirmed.network.segments,
    });

    assertEqual(resolution.status, "resolved");
    assertEqual(resolution.contributions.length, 1);
    assertClose(resolution.governingRouteAccessoryEquivalentLengthMeters, 1.25);
  });

  verify(results, "Caso H - rechazo", () => {
    const proposal = resolvableElbowProposal();
    const rejected = rejectRouteAccessoryProposal({
      decidedAt: 1,
      network: elbowNetwork(),
      proposal,
    });
    const proposals = detectRouteAccessoryProposals({
      decisions: [rejected.decision],
      diameterBySegmentId: sameDiameters(["s1", "s2"]),
      equipment: [],
      network: rejected.network,
    });

    assertEqual(onlyProposal(proposals).state, "rejected");
  });

  verify(results, "Caso I - cambio de geometria", () => {
    const proposal = resolvableElbowProposal();
    const confirmed = confirmRouteAccessoryProposal({
      decidedAt: 1,
      network: elbowNetworkWithManualAccessory(),
      proposal,
    });

    assert(confirmed.ok, "La confirmacion deberia resolver.");

    const next = reconcileRouteAccessoryProposalState({
      decisions: [confirmed.decision],
      network: straightNetworkWithAccessories(confirmed.decision),
      proposals: detectRouteAccessoryProposals({
        equipment: [],
        network: straightNetwork(),
      }),
    });

    assertEqual(next.decisions.length, 0);
    assertEqual(
      automaticAccessoryCount(next.network, confirmed.decision.accessoryId as string),
      0,
    );
    assertEqual(manualAccessoryCount(next.network), 1);
  });

  verify(results, "Caso J - tee ambiguo", () => {
    const tee = withAccessoryProposalSystemMatch(
      onlyProposal(
        detectRouteAccessoryProposals({
          equipment: [],
          network: teeNetwork(),
        }),
      ),
      matchSigasAccessoryProposal(
        onlyProposal(
          detectRouteAccessoryProposals({
            equipment: [],
            network: teeNetwork(),
          }),
        ),
      ),
    );

    assertEqual(tee.kind, "tee");
    assertEqual(tee.state, "needs_review");
    assertEqual(tee.suggestedCatalogCode, undefined);
  });

  verify(results, "Caso K - diametros incidentes distintos", () => {
    const proposal = onlyProposal(
      detectRouteAccessoryProposals({
        diameterBySegmentId: {
          s1: TEST_DIAMETER,
          s2: OTHER_DIAMETER,
        },
        equipment: [],
        network: elbowNetwork(),
      }),
    );

    assertEqual(proposal.kind, "elbow");
    assertEqual(proposal.ownerResolution.status, "ambiguous");
  });

  verify(results, "Caso L - determinismo", () => {
    const proposal = resolvableElbowProposal();
    const rejected = rejectRouteAccessoryProposal({
      decidedAt: 1,
      network: elbowNetwork(),
      proposal,
    });
    const first = detectRouteAccessoryProposals({
      decisions: [rejected.decision],
      diameterBySegmentId: sameDiameters(["s1", "s2"]),
      equipment: [],
      network: elbowNetwork(),
    });
    const second = detectRouteAccessoryProposals({
      decisions: [rejected.decision],
      diameterBySegmentId: sameDiameters(["s1", "s2"]),
      equipment: [],
      network: elbowNetwork(),
    });

    assertEqual(JSON.stringify(first), JSON.stringify(second));
  });

  return results;
}

function resolvableElbowProposal() {
  const proposal = onlyProposal(
    detectRouteAccessoryProposals({
      diameterBySegmentId: sameDiameters(["s1", "s2"]),
      equipment: [],
      network: elbowNetwork(),
    }),
  );

  return withAccessoryProposalSystemMatch(proposal, {
    compatibleFamilyKeys: ["test-elbow-90"],
    domainAccessory: {
      catalogCode: "test-elbow-90",
      equivalentLengthSource: "pipe_system",
      type: "elbow",
    },
    reason: "Familia de prueba unica.",
    status: "resolved",
    suggestedCatalogCode: "test-elbow-90",
  });
}

function straightNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      routeNode("a", 0, 0),
      routeNode("b", 1, 0),
      routeNode("c", 2, 0),
    ],
    segments: [
      segment("s1", "a", "b"),
      segment("s2", "b", "c"),
    ],
  };
}

function elbowNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      routeNode("a", 0, 0),
      routeNode("b", 1, 0),
      routeNode("c", 1, 1),
    ],
    segments: [
      segment("s1", "a", "b"),
      segment("s2", "b", "c"),
    ],
  };
}

function elbowNetworkWithManualAccessory(): ManualRouteNetwork {
  return {
    ...elbowNetwork(),
    segments: [
      {
        ...segment("s1", "a", "b"),
        accessories: [manualAccessory("manual-1", "s1")],
      },
      segment("s2", "b", "c"),
    ],
  };
}

function straightNetworkWithAccessories(
  decision: AccessoryProposalDecision,
): ManualRouteNetwork {
  return {
    ...straightNetwork(),
    segments: [
      {
        ...segment("s1", "a", "b"),
        accessories: [
          manualAccessory("manual-1", "s1"),
          {
            catalogCode: "test-elbow-90",
            equivalentLengthMetersPerUnit: null,
            equivalentLengthSource: "pipe_system",
            id: decision.accessoryId ?? automaticAccessoryId(decision.proposalId),
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

function teeNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      { ...routeNode("a", 0, 0), kind: "supply" },
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

function crossNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      routeNode("a", 0, 1),
      routeNode("b", 1, 1),
      routeNode("c", 2, 1),
      routeNode("d", 1, 0),
      routeNode("e", 1, 2),
    ],
    segments: [
      segment("s1", "a", "b"),
      segment("s2", "b", "c"),
      segment("s3", "b", "d"),
      segment("s4", "b", "e"),
    ],
  };
}

function terminalNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      {
        equipmentId: "supply",
        id: "supply-node",
        kind: "supply",
      },
      {
        equipmentId: "appliance",
        id: "appliance-node",
        kind: "appliance",
      },
    ],
    segments: [segment("s1", "supply-node", "appliance-node")],
  };
}

function terminalEquipment(): WorkbenchEquipment[] {
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
    {
      connectionPoint: { x: 1, y: 0 },
      demandUnit: "m3_h",
      demandValue: 1,
      id: "appliance",
      name: "COC",
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

function manualAccessory(id: string, segmentId: string): RouteSegmentAccessory {
  return {
    equivalentLengthMetersPerUnit: 0.5,
    equivalentLengthSource: "manual",
    id,
    quantity: 1,
    segmentId,
    type: "other",
  };
}

function sameDiameters(segmentIds: string[]) {
  return Object.fromEntries(
    segmentIds.map((segmentId) => [segmentId, TEST_DIAMETER]),
  );
}

function testPipeSystem(): PipeSystem {
  return {
    getAvailableDiameters: () => ({
      explanation: "Diametros de prueba.",
      status: "resolved",
      value: [TEST_DIAMETER],
    }),
    identity: {
      id: "test",
      name: "Test",
    },
    resolveAccessoryEquivalentLength: (context) =>
      context.accessory.catalogCode === "test-elbow-90"
        ? {
            explanation: "Codo de prueba.",
            status: "resolved",
            value: 1.25,
          }
        : {
            reason: "Accesorio de prueba no soportado.",
            status: "unsupported",
          },
    sizeSegment: () => ({
      explanation: "Diametro de prueba.",
      status: "resolved",
      value: {
        explanation: "Diametro de prueba.",
        selectedDiameter: TEST_DIAMETER,
      },
    }),
  };
}

function onlyProposal(proposals: AccessoryProposal[]) {
  assertEqual(proposals.length, 1);
  return proposals[0] as AccessoryProposal;
}

function automaticAccessoryCount(network: ManualRouteNetwork, accessoryId: string) {
  return network.segments.reduce(
    (count, segment) =>
      count +
      (segment.accessories ?? []).filter(
        (accessory) => accessory.id === accessoryId,
      ).length,
    0,
  );
}

function manualAccessoryCount(network: ManualRouteNetwork) {
  return network.segments.reduce(
    (count, segment) =>
      count +
      (segment.accessories ?? []).filter(
        (accessory) => accessory.equivalentLengthSource === "manual",
      ).length,
    0,
  );
}

function verify(
  results: RouteAccessoryProposalVerificationResult[],
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
  console.log(JSON.stringify(runRouteAccessoryProposalVerifications(), null, 2));
}
