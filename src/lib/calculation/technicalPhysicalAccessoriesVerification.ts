import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import {
  SIGAS_PIPE_SYSTEM,
} from "@/lib/calculation/pipeSystems/sigas";
import {
  SIGAS_DIAMETERS,
} from "@/lib/calculation/pipeSystems/sigas/sigasData";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteAccessoryType,
  RouteNode,
} from "@/lib/routing/types";
import {
  detectDiameterTransitionProposals,
  type DiameterTransitionDecision,
  type DiameterTransitionProposal,
} from "./diameterTransitionProposals";
import {
  createTechnicalEquivalentAccessoryVerification,
} from "./technicalEquivalentAccessoryVerification";
import {
  createTechnicalPhysicalAccessoryInventory,
} from "./technicalPhysicalAccessories";
import type {
  TechnicalRouteAccessoryContribution,
  TechnicalRouteAccessoryResolution,
} from "./technicalRouteAccessories";
import {
  resolveTechnicalRouteTransitions,
  type TechnicalRouteTransitionRoute,
} from "./technicalRouteTransitions";

export type TechnicalPhysicalAccessoryVerificationResult = {
  name: string;
  status: "passed";
};

const REDUCING_COUPLING_FAMILY_ID = "cupla-reduccion-hh";
const REDUCED_TEE_FAMILY_ID = "te-reduc-central";

export function runTechnicalPhysicalAccessoryVerifications() {
  const results: TechnicalPhysicalAccessoryVerificationResult[] = [];

  verify(
    results,
    "red 32 -> 25 -> 20 crea piezas fisicas unicas y usos through/turn_90",
    () => {
      const fixture = physicalAccessoryFixture();
      const transitions = confirmedTransitions(fixture);
      const through = resolveRouteTransitions({
        fixture,
        route: route(
          "route:through",
          ["m", "r", "n", "a"],
          ["s0", "s1", "s2"],
        ),
        transitions,
      });
      const turn = resolveRouteTransitions({
        fixture,
        route: route(
          "route:turn",
          ["m", "r", "n", "b"],
          ["s0", "s1", "s3"],
        ),
        transitions,
      });
      const inventory = createTechnicalPhysicalAccessoryInventory({
        diameterTransitionProposals: transitions,
        result: calculationResultStub(),
        routeTransitionResolutions: {
          [through.routeId]: through,
          [turn.routeId]: turn,
        },
      });
      const reduction = only(
        inventory.items.filter((item) => item.kind === "reducing_coupling"),
        "reduccion fisica",
      );
      const tee = only(
        inventory.items.filter((item) => item.kind === "reduced_tee"),
        "tee reductora fisica",
      );

      assertEqual(inventory.status, "resolved");
      assertEqual(inventory.items.length, 2);
      assertEqual(inventory.pendingItems.length, 0);

      assertEqual(reduction.nodeId, "r");
      assertEqual(reduction.segmentIds.join(","), "s0,s1");
      assertEqual(diameterLabels(reduction.diameters), "25,32");
      assertEqual(reduction.routeUses.length, 2);

      assertEqual(tee.nodeId, "n");
      assertEqual(tee.segmentIds.join(","), "s1,s2,s3");
      assertEqual(diameterLabels(tee.diameters), "20,25");
      assertEqual(tee.routeUses.length, 2);
      assertEqual(
        tee.routeUses.map((use) => use.traversalKind).sort().join(","),
        "through,turn_90",
      );
      assert(
        tee.routeUses[0]?.equivalentLengthMeters !==
          tee.routeUses[1]?.equivalentLengthMeters,
        "La misma tee fisica debe conservar la perdida segun uso del recorrido.",
      );
      assert(
        (inventory.accessoryIdsByRouteId["route:through"] ?? []).includes(
          tee.id,
        ),
        "El recorrido through debe referenciar la misma tee fisica.",
      );
      assert(
        (inventory.accessoryIdsByRouteId["route:turn"] ?? []).includes(tee.id),
        "El recorrido turn_90 debe referenciar la misma tee fisica.",
      );
      assert(
        (inventory.accessoryIdsBySegmentId.s1 ?? []).includes(reduction.id) &&
          (inventory.accessoryIdsBySegmentId.s1 ?? []).includes(tee.id),
        "El tramo comun debe indexar reduccion y tee sin duplicarlas.",
      );
    },
  );

  verify(
    results,
    "segunda verificacion SIGAS suma accesorios fisicos y sube 20 -> 25",
    () => {
      const verification = equivalentAccessoryVerificationCase({
        accessoryCount: 2,
        calculationLengthMeters: 10,
        catalogFamilyId: "codo-normal-a-90",
        diameter: diameter(20),
        expectedTabulatedLengthMeters: 12,
        flowM3h: 1.7,
        routeId: "route:second-check-20",
        segmentId: "s20",
      });

      assertEqual(
        verification.requiredDiameter?.externalDiameterMillimeters,
        25,
      );
      assertClose(verification.equivalentAccessoryLengthMeters, 1.906);
      assertClose(verification.totalCalculationLengthMeters, 11.906);
      assertEqual(verification.tabulatedLengthMeters, 12);
    },
  );

  verify(
    results,
    "segunda verificacion SIGAS suma accesorios fisicos y sube 25 -> 32",
    () => {
      const verification = equivalentAccessoryVerificationCase({
        accessoryCount: 3,
        calculationLengthMeters: 10,
        catalogFamilyId: "codo-normal-a-90",
        diameter: diameter(25),
        expectedTabulatedLengthMeters: 14,
        flowM3h: 3.8,
        routeId: "route:second-check-25",
        segmentId: "s25",
      });

      assertEqual(
        verification.requiredDiameter?.externalDiameterMillimeters,
        32,
      );
      assertClose(verification.equivalentAccessoryLengthMeters, 2.568);
      assertClose(verification.totalCalculationLengthMeters, 12.568);
      assertEqual(verification.tabulatedLengthMeters, 14);
    },
  );

  return results;
}

type PhysicalAccessoryFixture = {
  diameterBySegmentId: Map<string, PipeDiameterReference>;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
};

function physicalAccessoryFixture(): PhysicalAccessoryFixture {
  return {
    diameterBySegmentId: new Map([
      ["s0", diameter(32)],
      ["s1", diameter(25)],
      ["s2", diameter(25)],
      ["s3", diameter(20)],
    ]),
    equipment: [
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
    ],
    network: {
      nodes: [
        supplyNode(),
        routeNode("r", 10, 0),
        routeNode("n", 20, 0),
        applianceNode("a", "range"),
        applianceNode("b", "heater"),
      ],
      segments: [
        { fromNodeId: "m", id: "s0", toNodeId: "r" },
        { fromNodeId: "r", id: "s1", toNodeId: "n" },
        { fromNodeId: "n", id: "s2", toNodeId: "a" },
        { fromNodeId: "n", id: "s3", toNodeId: "b" },
      ],
    },
  };
}

function confirmedTransitions(fixture: PhysicalAccessoryFixture) {
  const proposals = detectDiameterTransitionProposals({
    diameterBySegmentId: fixture.diameterBySegmentId,
    equipment: fixture.equipment,
    network: fixture.network,
  });
  const decisions = proposals.map((proposal) =>
    confirmedDecision(
      proposal,
      proposal.kind === "branch_transition"
        ? REDUCED_TEE_FAMILY_ID
        : REDUCING_COUPLING_FAMILY_ID,
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

function resolveRouteTransitions(params: {
  fixture: PhysicalAccessoryFixture;
  route: TechnicalRouteTransitionRoute;
  transitions: DiameterTransitionProposal[];
}) {
  return resolveTechnicalRouteTransitions({
    diameterBySegmentId: params.fixture.diameterBySegmentId,
    equipment: params.fixture.equipment,
    governingRouteAccessoryEquivalentLengthMeters: 0,
    includeBranchTransitions: true,
    network: params.fixture.network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    route: params.route,
    transitions: params.transitions,
  });
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

function calculationResultStub(
  overrides: Partial<TechnicalCalculationResult> = {},
): TechnicalCalculationResult {
  return {
    professionalDiameterAdoption: null,
    routeAccessoryResolutions: {},
    segments: [],
    transitionAwareNetworkSizing: null,
    ...overrides,
  } as unknown as TechnicalCalculationResult;
}

function equivalentAccessoryVerificationCase(params: {
  accessoryCount: number;
  calculationLengthMeters: number;
  catalogFamilyId: string;
  diameter: PipeDiameterReference;
  expectedTabulatedLengthMeters: number;
  flowM3h: number;
  routeId: string;
  segmentId: string;
}) {
  const result = calculationResultStub({
    routeAccessoryResolutions: {
      [params.routeId]: routeAccessoryResolution({
        contributions: Array.from({ length: params.accessoryCount }, (_, index) =>
          routeAccessoryContribution({
            accessoryId: `elbow-${index + 1}`,
            catalogFamilyId: params.catalogFamilyId,
            diameter: params.diameter,
            quantity: 12,
            routeId: params.routeId,
            segmentId: `${params.segmentId}:accessory-${index + 1}`,
            type: "elbow",
          }),
        ),
        routeId: params.routeId,
      }),
    },
    segments: [
      segmentForEquivalentVerification({
        calculationLengthMeters: params.calculationLengthMeters,
        diameter: params.diameter,
        flowM3h: params.flowM3h,
        routeId: params.routeId,
        segmentId: params.segmentId,
        segmentIds: Array.from(
          { length: params.accessoryCount },
          (_, index) => `${params.segmentId}:accessory-${index + 1}`,
        ),
      }),
    ],
  });
  const inventory = createTechnicalPhysicalAccessoryInventory({ result });
  const verification = createTechnicalEquivalentAccessoryVerification({
    inventory,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    result,
  })[params.segmentId];

  assert(verification, "No se creo la segunda verificacion del tramo.");
  assertEqual(verification.status, "resolved");
  assertEqual(
    verification.tabulatedLengthMeters,
    params.expectedTabulatedLengthMeters,
  );
  assertEqual(verification.uses.length, params.accessoryCount);
  return verification;
}

function routeAccessoryResolution(params: {
  contributions: TechnicalRouteAccessoryContribution[];
  routeId: string;
}): TechnicalRouteAccessoryResolution {
  const total = params.contributions.reduce(
    (sum, contribution) =>
      sum + (contribution.equivalentLengthMetersPerUnit ?? 0),
    0,
  );

  return {
    contributions: params.contributions,
    duplicateAccessoryKeys: [],
    governingRouteAccessoryEquivalentLengthMeters: total,
    reasons: [],
    routeId: params.routeId,
    sizingLengthMeters: 10 + total,
    status: "resolved",
  };
}

function routeAccessoryContribution(params: {
  accessoryId: string;
  catalogFamilyId: string;
  diameter: PipeDiameterReference;
  quantity: number;
  routeId: string;
  segmentId: string;
  type: RouteAccessoryType;
}): TechnicalRouteAccessoryContribution {
  const equivalentLengthResolution =
    SIGAS_PIPE_SYSTEM.resolveAccessoryEquivalentLength({
      accessory: {
        catalogFamilyId: params.catalogFamilyId,
        id: params.accessoryId,
        quantity: params.quantity,
        type: params.type,
      },
      pipe: {
        diameter: params.diameter,
      },
      segment: {
        accumulatedFlow: 1,
        accumulatedFlowUnit: "m3_h",
        drawingLength: 1,
        id: params.segmentId,
        physicalLengthMeters: 1,
      },
    });

  assert(
    equivalentLengthResolution.status === "resolved",
    "No se pudo resolver el accesorio SIGAS de la fixture.",
  );

  return {
    accessoryId: params.accessoryId,
    catalogCode: recordStringValue(
      equivalentLengthResolution.data,
      "catalogCode",
    ),
    catalogFamilyId: params.catalogFamilyId,
    diameter: params.diameter,
    equivalentLengthMetersPerUnit: equivalentLengthResolution.value,
    equivalentLengthResolution,
    equivalentLengthSource: "pipe_system",
    ownerSegmentId: params.segmentId,
    quantity: params.quantity,
    routeId: params.routeId,
    status: "resolved",
    totalEquivalentLengthMeters:
      equivalentLengthResolution.value * params.quantity,
    type: params.type,
  };
}

function segmentForEquivalentVerification(params: {
  calculationLengthMeters: number;
  diameter: PipeDiameterReference;
  flowM3h: number;
  routeId: string;
  segmentId: string;
  segmentIds: string[];
}) {
  return {
    accumulatedFlow: params.flowM3h,
    accumulatedFlowUnit: "m3_h",
    calculatedDiameter: params.diameter,
    calculationLengthMeters: params.calculationLengthMeters,
    governingRoutePhysicalLengthMeters: params.calculationLengthMeters,
    governingRouteResolution: {
      explanation: "fixture",
      status: "resolved",
      value: {
        nodeIds: [],
        physicalLengthMeters: params.calculationLengthMeters,
        routeId: params.routeId,
        segmentIds: params.segmentIds,
        terminalEquipmentId: "terminal",
        terminalNodeId: "terminal",
        tiedRouteIds: [params.routeId],
      },
    },
    provisionalDiameter: params.diameter,
    routeSizingBasis: {
      governingRouteAccessoryEquivalentLengthMeters: 0,
      governingRoutePhysicalLengthMeters: params.calculationLengthMeters,
      reasons: [],
      routeAccessoryResolutionId: params.routeId,
      sizingLengthMeters: params.calculationLengthMeters,
      status: "resolved",
    },
    segmentId: params.segmentId,
  } as unknown as TechnicalCalculationResult["segments"][number];
}

function diameter(externalDiameterMillimeters: number): PipeDiameterReference {
  const value = SIGAS_DIAMETERS.find(
    (item) => item.externalDiameterMillimeters === externalDiameterMillimeters,
  );

  assert(value, `No existe diametro SIGAS ${externalDiameterMillimeters}.`);
  return value;
}

function diameterLabels(
  diameters: Array<{ diameter: PipeDiameterReference | null }>,
) {
  return [
    ...new Set(
      diameters
        .map((entry) => entry.diameter?.externalDiameterMillimeters ?? null)
        .filter((value): value is number => value !== null),
    ),
  ]
    .sort((first, second) => first - second)
    .join(",");
}

function only<T>(items: T[], label: string): T {
  assertEqual(items.length, 1, `Se esperaba una unica pieza: ${label}.`);
  return items[0] as T;
}

function verify(
  results: TechnicalPhysicalAccessoryVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown, message?: string) {
  assert(
    actual === expected,
    message ?? `Expected ${String(expected)}, got ${String(actual)}`,
  );
}

function assertClose(
  actual: number | null | undefined,
  expected: number,
  epsilon = 1e-9,
) {
  assert(
    typeof actual === "number" && Math.abs(actual - expected) <= epsilon,
    `Expected ${expected}, got ${String(actual)}`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function recordStringValue(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  const value = record?.[key];

  return typeof value === "string" ? value : undefined;
}

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  const results = runTechnicalPhysicalAccessoryVerifications();
  console.log(JSON.stringify(results, null, 2));
}
