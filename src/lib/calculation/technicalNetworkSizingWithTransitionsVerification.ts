import type {
  PipeAccessoryEquivalentLengthContext,
  PipeDiameterReference,
  PipeDiameterTransitionEquivalentLengthContext,
  PipeDiameterTransitionEquivalentLengthResult,
  PipeSegmentSizingContext,
  PipeSegmentSizingResult,
  PipeSystem,
  PipeSystemResolution,
} from "@/lib/calculation/pipeSystem";
import type { DemandUnit, WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteNode,
  RouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "./technicalTree";
import {
  detectDiameterTransitionProposals,
  type DiameterTransitionDecision,
} from "./diameterTransitionProposals";
import {
  enumerateTransitionAwareSizingAssignmentsForVerification,
  evaluateTransitionAwareSizingAssignment,
  solveTechnicalNetworkSizingWithTransitions,
  type TechnicalTransitionAwareNetworkSizingResult,
} from "./technicalNetworkSizingWithTransitions";

export type TechnicalTransitionAwareNetworkSizingVerificationResult = {
  name: string;
  status: "passed";
};

type RequiredDiameterRule =
  | string
  | ((context: PipeSegmentSizingContext) => string);

type TestPipeSystemOptions = {
  diameters?: PipeDiameterReference[];
  maxLengthMeters?: number;
  requiredBySegmentId?: Record<string, RequiredDiameterRule>;
  transitionEquivalentByFamily?: Record<string, Record<string, number>>;
};

type Fixture = {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pipeSystem: PipeSystem;
  result: TechnicalCalculationResult;
};

const TEST_DIAMETERS: PipeDiameterReference[] = [
  testDiameter("test-20", 20, 13),
  testDiameter("test-25", 25, 18),
  testDiameter("test-32", 32, 25),
  testDiameter("test-40", 40, 33),
];
const DEFAULT_TRANSITION_FAMILY = "test-reduction";
const EPSILON = 0.000001;

export function runTechnicalTransitionAwareNetworkSizingVerifications() {
  const results: TechnicalTransitionAwareNetworkSizingVerificationResult[] = [];

  verify(results, "Caso A - sin transiciones", () => {
    const fixture = createLineFixture({
      segmentCount: 1,
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-20" },
      }),
    });
    const sizing = assertTransitionAwareSizing(fixture.result);

    assertEqual(sizing.status, "resolved");
    assertEqual(sizing.additionalDiameterStepCost, 0);
    assertEqual(
      JSON.stringify(sizing.finalDiameterBySegmentId),
      JSON.stringify(assertBaselineSizing(fixture.result).finalDiameterBySegmentId),
    );
  });

  verify(results, "Caso B - reduccion confirmada sin cambio requerido", () => {
    const solved = solveLineWithConfirmedTransitions({
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-25",
          s2: (context) =>
            (context.calculationLengthMeters ?? 0) > 25
              ? "test-25"
              : "test-20",
        },
        transitionEquivalentByFamily: familyPairs({
          "25-20": 1,
        }),
      }),
    });
    const sizing = assertTransitionAwareSizing(solved.result);

    assertEqual(sizing.status, "resolved");
    assertEqual(sizing.additionalDiameterStepCost, 0);
    assertSegmentDiameter(sizing, "s1", "test-25");
    assertSegmentDiameter(sizing, "s2", "test-20");
    assertClose(routeTransition(sizing, "technical-route:appliance").equivalentLengthMeters, 1);
  });

  verify(results, "Caso C - reduccion obliga aumento y sigue existiendo", () => {
    const solved = solveLineWithConfirmedTransitions({
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-32",
          s2: (context) =>
            (context.calculationLengthMeters ?? 0) > 20
              ? "test-25"
              : "test-20",
        },
        transitionEquivalentByFamily: familyPairs({
          "32-20": 1,
          "32-25": 1,
        }),
      }),
    });
    const sizing = assertTransitionAwareSizing(solved.result);

    assertEqual(sizing.status, "resolved");
    assertEqual(sizing.additionalDiameterStepCost, 1);
    assertSegmentDiameter(sizing, "s1", "test-32");
    assertSegmentDiameter(sizing, "s2", "test-25");
    assertClose(routeTransition(sizing, "technical-route:appliance").equivalentLengthMeters, 1);
  });

  verify(results, "Caso D - reduccion obliga aumento y desaparece", () => {
    const solved = disappearingReductionFixture();
    const sizing = assertTransitionAwareSizing(solved.result);

    assertEqual(sizing.status, "resolved");
    assertEqual(sizing.additionalDiameterStepCost, 1);
    assertSegmentDiameter(sizing, "s1", "test-25");
    assertSegmentDiameter(sizing, "s2", "test-25");
    assertClose(routeTransition(sizing, "technical-route:appliance").equivalentLengthMeters, 0);
    assertClose(segmentSizing(sizing, "s2").transitionAwareSizingLengthMeters, 20);
  });

  verify(results, "Caso E - solucion minima", () => {
    const solved = disappearingReductionFixture();
    const sizing = assertTransitionAwareSizing(solved.result);

    assertEqual(sizing.additionalDiameterStepCost, 1);
    assert(
      !Object.values(sizing.finalDiameterBySegmentId).some(
        (diameter) => diameter.id === "test-32",
      ),
      "No debe elegir una solucion de costo mayor si hay una de costo 1.",
    );
  });

  verify(results, "Caso F - empate deterministico", () => {
    const solved = solveLineWithConfirmedTransitions({
      familyId: "tie-family",
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-32",
          s2: "test-20",
        },
        transitionEquivalentByFamily: {
          "tie-family": {
            "32-25": 0,
            "40-20": 0,
          },
        },
      }),
    });
    const sizing = assertTransitionAwareSizing(solved.result);

    assertEqual(sizing.status, "resolved");
    assertEqual(sizing.additionalDiameterStepCost, 1);
    assertSegmentDiameter(sizing, "s1", "test-32");
    assertSegmentDiameter(sizing, "s2", "test-25");
  });

  verify(results, "Caso G - variante cambia con diametro", () => {
    const fixture = createLineFixture({
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-32",
          s2: "test-25",
        },
        transitionEquivalentByFamily: familyPairs({
          "32-25": 1,
          "40-25": 7,
        }),
      }),
    });
    const decision = confirmedDecisionsForFixture(
      fixture,
      DEFAULT_TRANSITION_FAMILY,
    )[0];
    const evaluation = evaluateFixtureAssignment(
      fixture,
      { s1: "test-40", s2: "test-25" },
      [decision as DiameterTransitionDecision],
    );
    const contribution = routeTransitionFromEvaluation(evaluation)
      .contributions[0];

    assertEqual(evaluation.status, "resolved");
    assertEqual(contribution?.variant?.label, "test-reduction 40 a 25");
    assertClose(contribution?.equivalentLengthMeters, 7);
  });

  verify(results, "Caso H - familia incompatible", () => {
    const fixture = createLineFixture({
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-32",
          s2: "test-20",
        },
        transitionEquivalentByFamily: familyPairs({
          "32-25": 1,
        }),
      }),
    });
    const decision = confirmedDecisionsForFixture(fixture, DEFAULT_TRANSITION_FAMILY)[0];
    const evaluation = evaluateFixtureAssignment(
      fixture,
      { s1: "test-32", s2: "test-20" },
      [decision as DiameterTransitionDecision],
    );

    assertEqual(evaluation.status, "unsupported");
    assertIssue(evaluation, "transition_family_incompatible");
  });

  verify(results, "Caso I - transicion nueva no confirmada", () => {
    const fixture = createLineFixture({
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-25",
          s2: "test-25",
        },
      }),
    });
    const evaluation = evaluateFixtureAssignment(fixture, {
      s1: "test-32",
      s2: "test-25",
    });

    assertEqual(evaluation.status, "incomplete");
    assertIssue(evaluation, "unconfirmed_required_transition");
  });

  verify(results, "Caso J - branch transition", () => {
    const fixture = createBranchFixture({
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          common: "test-32",
          branchA: "test-25",
          branchB: "test-32",
        },
      }),
    });
    const evaluation = evaluateFixtureAssignment(fixture, {
      branchA: "test-25",
      branchB: "test-32",
      common: "test-32",
    });

    assertEqual(evaluation.status, "incomplete");
    assertIssue(evaluation, "branch_transition_required");
  });

  verify(results, "Caso K - compound transition", () => {
    const fixture = createTurnFixture({
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-32",
          s2: "test-25",
        },
      }),
    });
    const evaluation = evaluateFixtureAssignment(fixture, {
      s1: "test-32",
      s2: "test-25",
    });

    assertEqual(evaluation.status, "incomplete");
    assertIssue(evaluation, "compound_transition_required");
  });

  verify(results, "Caso L - dos reducciones en una ruta", () => {
    const solved = solveLineWithConfirmedTransitions({
      segmentCount: 3,
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-32",
          s2: "test-25",
          s3: "test-20",
        },
        transitionEquivalentByFamily: familyPairs({
          "25-20": 2,
          "32-25": 1,
        }),
      }),
    });
    const sizing = assertTransitionAwareSizing(solved.result);
    const transition = routeTransition(sizing, "technical-route:appliance");

    assertEqual(sizing.status, "resolved");
    assertEqual(transition.contributions.length, 2);
    assertClose(transition.equivalentLengthMeters, 3);
  });

  verify(results, "Caso M - transicion desaparece y reaparece entre estados", () => {
    const fixture = disappearingReductionFixture().fixture;
    const decision = confirmedDecisionsForFixture(fixture, DEFAULT_TRANSITION_FAMILY)[0];
    const active = evaluateFixtureAssignment(
      fixture,
      { s1: "test-25", s2: "test-20" },
      [decision as DiameterTransitionDecision],
    );
    const inactive = evaluateFixtureAssignment(
      fixture,
      { s1: "test-25", s2: "test-25" },
      [decision as DiameterTransitionDecision],
    );
    const activeAgain = evaluateFixtureAssignment(
      fixture,
      { s1: "test-32", s2: "test-25" },
      [decision as DiameterTransitionDecision],
    );

    assertClose(routeTransitionFromEvaluation(active).equivalentLengthMeters, 1);
    assertClose(routeTransitionFromEvaluation(inactive).equivalentLengthMeters, 0);
    assertClose(routeTransitionFromEvaluation(activeAgain).equivalentLengthMeters, 1);
  });

  verify(results, "Caso N - determinismo", () => {
    const first = serializeSizing(disappearingReductionFixture().result);
    const second = serializeSizing(disappearingReductionFixture().result);

    assertEqual(first, second);
  });

  verify(results, "Caso O - baseline floor", () => {
    const sizing = assertTransitionAwareSizing(disappearingReductionFixture().result);

    for (const segment of sizing.segments) {
      assert(
        diameterRank(segment.finalDiameter) >= diameterRank(segment.baselineDiameter),
        `El tramo ${segment.segmentId} quedo por debajo del baseline.`,
      );
    }
  });

  verify(results, "Caso P - validacion final", () => {
    const sizing = assertTransitionAwareSizing(disappearingReductionFixture().result);

    assertEqual(sizing.status, "resolved");
    assert(
      !sizing.issues.some(
        (issue) =>
          issue.code === "final_assignment_insufficient" ||
          issue.code === "transition_aware_sizing_length_mismatch",
      ),
      "No debe emitir issues de validacion final.",
    );
  });

  verify(results, "Caso Q - auditoria de descenso", () => {
    const sizing = assertTransitionAwareSizing(disappearingReductionFixture().result);

    assert(
      sizing.minimalityAudit.length > 0,
      "Debe auditar al menos un diametro elevado.",
    );
    assert(
      sizing.minimalityAudit.every((entry) => entry.status === "passed"),
      "Todos los descensos unitarios deben quedar no factibles.",
    );
  });

  verify(results, "Caso R - brute force parity", () => {
    const { fixture, result } = disappearingReductionFixture();
    const sizing = assertTransitionAwareSizing(result);
    const baseline = assertBaselineSizing(fixture.result);
    const bruteForce = enumerateTransitionAwareSizingAssignmentsForVerification({
      baselineSizing: baseline,
      decisions: confirmedDecisionsForFixture(fixture, DEFAULT_TRANSITION_FAMILY),
      equipment: fixture.equipment,
      network: fixture.network,
      pipeSystem: fixture.pipeSystem,
      routeSegments: fixture.network.segments,
      routes: fixture.result.technicalRoutes,
      segments: fixture.result.segments,
    });

    assertEqual(bruteForce.minimalCost, sizing.additionalDiameterStepCost);
    assertEqual(
      JSON.stringify(bruteForce.minimalAssignment),
      JSON.stringify(sizing.finalDiameterBySegmentId),
    );
  });

  verify(results, "Caso S - rutas alternativas", () => {
    const fixture = createAlternateRouteFixture();
    const sizing = assertTransitionAwareSizing(fixture.result);

    assert(
      sizing.issues.some(
        (issue) =>
          issue.code === "alternate_route_has_greater_sizing_length" &&
          issue.segmentId === "common",
      ),
      "Debe conservar auditoria de ruta alternativa con longitud completa.",
    );
  });

  verify(results, "Caso T - busqueda no terminada", () => {
    const { fixture } = disappearingReductionFixture();
    const baseline = assertBaselineSizing(fixture.result);
    const result = solveTechnicalNetworkSizingWithTransitions({
      baselineSizing: baseline,
      decisions: confirmedDecisionsForFixture(fixture, DEFAULT_TRANSITION_FAMILY),
      equipment: fixture.equipment,
      network: fixture.network,
      pipeSystem: fixture.pipeSystem,
      routeSegments: fixture.network.segments,
      routes: fixture.result.technicalRoutes,
      searchLimit: 1,
      segments: fixture.result.segments,
    });

    assertEqual(result.status, "incomplete");
    assertIssue(result, "transition_sizing_search_limit_reached");
    assertEqual(result.additionalDiameterStepCost, null);
  });

  return results;
}

function disappearingReductionFixture() {
  return solveLineWithConfirmedTransitions({
    pipeSystem: createTestPipeSystem({
      requiredBySegmentId: {
        s1: "test-25",
        s2: (context) =>
          (context.calculationLengthMeters ?? 0) > 20
            ? "test-25"
            : "test-20",
      },
      transitionEquivalentByFamily: familyPairs({
        "25-20": 1,
        "32-25": 1,
      }),
    }),
  });
}

function solveLineWithConfirmedTransitions(params: {
  familyId?: string;
  pipeSystem: PipeSystem;
  segmentCount?: number;
}) {
  const fixture = createLineFixture({
    pipeSystem: params.pipeSystem,
    segmentCount: params.segmentCount ?? 2,
  });
  const decisions = confirmedDecisionsForFixture(
    fixture,
    params.familyId ?? DEFAULT_TRANSITION_FAMILY,
  );
  const result = calculateTechnicalTree({
    diameterTransitionDecisions: decisions,
    equipment: fixture.equipment,
    minSegmentLengthSource: 0.000001,
    network: fixture.network,
    pipeSystem: params.pipeSystem,
    scaleMetersPerSourceUnit: 1,
  });

  return { decisions, fixture, result };
}

function createLineFixture(params: {
  pipeSystem: PipeSystem;
  segmentCount?: number;
}) {
  const segmentCount = params.segmentCount ?? 2;
  const equipment = fixtureEquipment([
    {
      demandValue: 1,
      id: "appliance",
      name: "Artefacto",
      x: segmentCount * 10,
      y: 0,
    },
  ]);
  const nodes: RouteNode[] = [
    supplyNode(),
    ...Array.from({ length: Math.max(0, segmentCount - 1) }, (_, index) =>
      routeNode(`n${index + 1}`, (index + 1) * 10, 0),
    ),
    {
      equipmentId: "appliance",
      id: "node-appliance",
      kind: "appliance",
    },
  ];
  const nodeIds = nodes.map((node) => node.id);
  const segments: RouteSegment[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    segments.push({
      fromNodeId: nodeIds[index] as string,
      id: `s${index + 1}`,
      toNodeId: nodeIds[index + 1] as string,
    });
  }

  return createFixture({
    equipment,
    network: { nodes, segments },
    pipeSystem: params.pipeSystem,
  });
}

function createTurnFixture(params: { pipeSystem: PipeSystem }) {
  return createFixture({
    equipment: fixtureEquipment([
      {
        demandValue: 1,
        id: "appliance",
        name: "Artefacto",
        x: 10,
        y: 10,
      },
    ]),
    network: {
      nodes: [
        supplyNode(),
        routeNode("n", 10, 0),
        {
          equipmentId: "appliance",
          id: "node-appliance",
          kind: "appliance",
        },
      ],
      segments: [
        { fromNodeId: "node-meter", id: "s1", toNodeId: "n" },
        { fromNodeId: "n", id: "s2", toNodeId: "node-appliance" },
      ],
    },
    pipeSystem: params.pipeSystem,
  });
}

function createBranchFixture(params: { pipeSystem: PipeSystem }) {
  return createFixture({
    equipment: fixtureEquipment([
      {
        demandValue: 1,
        id: "a",
        name: "A",
        x: 20,
        y: 0,
      },
      {
        demandValue: 1,
        id: "b",
        name: "B",
        x: 10,
        y: 10,
      },
    ]),
    network: {
      nodes: [
        supplyNode(),
        routeNode("j", 10, 0),
        { equipmentId: "a", id: "node-a", kind: "appliance" },
        { equipmentId: "b", id: "node-b", kind: "appliance" },
      ],
      segments: [
        { fromNodeId: "node-meter", id: "common", toNodeId: "j" },
        { fromNodeId: "j", id: "branchA", toNodeId: "node-a" },
        { fromNodeId: "j", id: "branchB", toNodeId: "node-b" },
      ],
    },
    pipeSystem: params.pipeSystem,
  });
}

function createAlternateRouteFixture() {
  return createFixture({
    equipment: fixtureEquipment([
      {
        demandValue: 1,
        id: "long",
        name: "Largo",
        x: 10,
        y: 0,
      },
      {
        demandValue: 1,
        id: "short",
        name: "Corto",
        x: 3,
        y: 0,
      },
    ]),
    network: {
      nodes: [
        supplyNode(),
        routeNode("j", 1, 0),
        { equipmentId: "long", id: "node-long", kind: "appliance" },
        { equipmentId: "short", id: "node-short", kind: "appliance" },
      ],
      segments: [
        { fromNodeId: "node-meter", id: "common", toNodeId: "j" },
        { fromNodeId: "j", id: "longBranch", toNodeId: "node-long" },
        {
          accessories: [manualAccessory("short-extra", 20, 1)],
          fromNodeId: "j",
          id: "shortBranch",
          toNodeId: "node-short",
        },
      ],
    },
    pipeSystem: createTestPipeSystem({
      requiredBySegmentId: {
        common: "test-20",
        longBranch: "test-20",
        shortBranch: "test-20",
      },
    }),
  });
}

function createFixture(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pipeSystem: PipeSystem;
}): Fixture {
  return {
    ...params,
    result: calculateTechnicalTree({
      equipment: params.equipment,
      minSegmentLengthSource: 0.000001,
      network: params.network,
      pipeSystem: params.pipeSystem,
      scaleMetersPerSourceUnit: 1,
    }),
  };
}

function confirmedDecisionsForFixture(
  fixture: Fixture,
  familyId: string,
): DiameterTransitionDecision[] {
  const baseline = assertBaselineSizing(fixture.result);
  const proposals = detectDiameterTransitionProposals({
    diameterBySegmentId: baseline.finalDiameterBySegmentId,
    equipment: fixture.equipment,
    network: fixture.network,
  });

  return proposals
    .filter((proposal) => proposal.state !== "not_required")
    .map((proposal) => ({
      catalogFamilyId: familyId,
      decidedAt: 1,
      geometryKey: proposal.geometryKey,
      origin: "user_confirmed" as const,
      pipeSystemId: fixture.pipeSystem.identity.id,
      status: "confirmed" as const,
      transitionId: proposal.id,
    }))
    .sort((first, second) =>
      first.transitionId.localeCompare(second.transitionId),
    );
}

function evaluateFixtureAssignment(
  fixture: Fixture,
  diameterIdsBySegmentId: Record<string, string>,
  decisions: DiameterTransitionDecision[] = [],
) {
  const baseline = assertBaselineSizing(fixture.result);

  return evaluateTransitionAwareSizingAssignment({
    baselineDiameterBySegmentId: baseline.finalDiameterBySegmentId,
    decisions,
    diameterBySegmentId: Object.fromEntries(
      Object.entries(diameterIdsBySegmentId).map(([segmentId, diameterId]) => [
        segmentId,
        diameter(diameterId),
      ]),
    ),
    equipment: fixture.equipment,
    network: fixture.network,
    pipeSystem: fixture.pipeSystem,
    routeSegments: fixture.network.segments,
    routes: fixture.result.technicalRoutes,
    segments: fixture.result.segments,
  });
}

function createTestPipeSystem(options: TestPipeSystemOptions = {}): PipeSystem {
  const diameters = options.diameters ?? TEST_DIAMETERS;

  return {
    getAvailableDiameters: () => ({
      explanation: "Diametros sinteticos para 09C2B.",
      status: "resolved",
      value: diameters,
    }),
    identity: {
      id: "test-transition-aware-pipe-system",
      name: "Test transition-aware PipeSystem",
    },
    resolveAccessoryEquivalentLength: (
      context: PipeAccessoryEquivalentLengthContext,
    ) => resolveTestAccessoryEquivalentLength(context),
    resolveDiameterTransitionEquivalentLength: (
      context: PipeDiameterTransitionEquivalentLengthContext,
    ) => resolveTestTransitionEquivalentLength(context, options),
    sizeSegment: (context: PipeSegmentSizingContext) =>
      sizeTestSegment(context, options, diameters),
  };
}

function resolveTestAccessoryEquivalentLength(
  context: PipeAccessoryEquivalentLengthContext,
): PipeSystemResolution<number> {
  if (!context.accessory.catalogCode) {
    return {
      reason: "Accesorio sintetico sin catalogCode.",
      status: "unsupported",
    };
  }

  return {
    explanation: "Accesorio sintetico sin perdida adicional.",
    status: "resolved",
    value: 0,
  };
}

function resolveTestTransitionEquivalentLength(
  context: PipeDiameterTransitionEquivalentLengthContext,
  options: TestPipeSystemOptions,
): PipeSystemResolution<PipeDiameterTransitionEquivalentLengthResult> {
  if (context.transition.kind !== "simple_reduction") {
    return {
      reason: "El PipeSystem sintetico solo resuelve reducciones simples.",
      status: "unsupported",
    };
  }

  const familyId = context.transition.catalogFamilyId;

  if (!familyId) {
    return {
      reason: "Falta familia sintetica confirmada.",
      status: "unresolved",
    };
  }

  const pair = transitionPairKey(
    context.upstreamDiameter,
    context.downstreamDiameter,
  );
  const equivalentLength =
    options.transitionEquivalentByFamily?.[familyId]?.[pair] ?? null;

  if (equivalentLength === null) {
    return {
      data: { familyId, pair },
      reason: "La familia sintetica no posee variante para el par actual.",
      status: "unsupported",
    };
  }

  const [larger, smaller] = pair.split("-").map(Number) as [number, number];

  return {
    data: {
      catalogCode: `${familyId}-${pair}`,
      catalogFamilyId: familyId,
      tableLabel: `${familyId} ${larger} a ${smaller}`,
    },
    explanation: `Reduccion sintetica ${familyId} ${pair}.`,
    status: "resolved",
    value: {
      catalogCode: `${familyId}-${pair}`,
      catalogFamilyId: familyId,
      downstreamDiameter: context.downstreamDiameter,
      equivalentLengthMeters: equivalentLength,
      source: { table: "Tabla sintetica 09C2B" },
      upstreamDiameter: context.upstreamDiameter,
      variant: {
        largerExternalDiameterMillimeters: larger,
        label: `${familyId} ${larger} a ${smaller}`,
        smallerExternalDiameterMillimeters: smaller,
      },
    },
  };
}

function sizeTestSegment(
  context: PipeSegmentSizingContext,
  options: TestPipeSystemOptions,
  diameters: PipeDiameterReference[],
): PipeSystemResolution<PipeSegmentSizingResult> {
  if (context.calculationLengthMeters === null) {
    return {
      reason: "Falta longitud de calculo.",
      status: "unresolved",
    };
  }

  if (context.accumulatedFlow === null) {
    return {
      reason: "Falta caudal.",
      status: "unresolved",
    };
  }

  if (context.accumulatedFlowUnit !== "m3_h") {
    return {
      reason: "El PipeSystem sintetico solo acepta m3/h.",
      status: "unsupported",
    };
  }

  if (
    options.maxLengthMeters !== undefined &&
    context.calculationLengthMeters > options.maxLengthMeters + EPSILON
  ) {
    return {
      reason: "Longitud fuera del rango sintetico.",
      status: "unresolved",
    };
  }

  const rule = options.requiredBySegmentId?.[context.segmentId] ?? "test-20";
  const requiredDiameterId =
    typeof rule === "function" ? rule(context) : rule;
  const selectedDiameter =
    diameters.find((item) => item.id === requiredDiameterId) ?? null;

  if (!selectedDiameter) {
    return {
      data: { requiredDiameterId },
      reason: "La regla sintetica devolvio un diametro inexistente.",
      status: "unsupported",
    };
  }

  return {
    explanation:
      `Regla sintetica selecciona ${selectedDiameter.label} para ` +
      `${context.calculationLengthMeters.toFixed(3)} m.`,
    status: "resolved",
    value: {
      explanation:
        `Regla sintetica selecciona ${selectedDiameter.label} para ` +
        `${context.calculationLengthMeters.toFixed(3)} m.`,
      selectedDiameter,
      usedData: {
        capacityM3h: 999,
        tabulatedLengthMeters: Math.ceil(context.calculationLengthMeters),
      },
    },
  };
}

function familyPairs(pairs: Record<string, number>) {
  return {
    [DEFAULT_TRANSITION_FAMILY]: pairs,
  };
}

function routeTransition(
  sizing: TechnicalTransitionAwareNetworkSizingResult,
  routeId: string,
) {
  const resolution = sizing.routeTransitionResolutions[routeId];

  assert(resolution, `Falta resolucion de transiciones para ${routeId}.`);
  return resolution;
}

function routeTransitionFromEvaluation(
  evaluation: ReturnType<typeof evaluateFixtureAssignment>,
) {
  return routeTransition(
    {
      additionalDiameterStepCost: evaluation.additionalDiameterStepCost,
      baselineDiameterBySegmentId: {},
      discardedStateCount: 0,
      evaluatedStateCount: 1,
      finalDiameterBySegmentId: evaluation.assignment,
      issueCount: evaluation.issues.length,
      issues: evaluation.issues,
      maxFrontierSize: 0,
      minimalityAudit: [],
      pipeSystem: { id: "evaluation", name: "Evaluation" },
      routeAccessoryResolutions: evaluation.routeAccessoryResolutions,
      routeTransitionResolutions: evaluation.routeTransitionResolutions,
      searchLimit: 1,
      segments: evaluation.segments,
      status: evaluation.status,
      strategy: "uniform_cost_minimum_above_baseline_with_transition_rebuild",
      theoreticalStateCount: 1,
      trace: [],
      transitions: evaluation.transitions,
      variableSegmentIds: [],
    },
    "technical-route:appliance",
  );
}

function segmentSizing(
  sizing: TechnicalTransitionAwareNetworkSizingResult,
  segmentId: string,
) {
  const segment =
    sizing.segments.find((item) => item.segmentId === segmentId) ?? null;

  assert(segment, `Falta segmento ${segmentId}.`);
  return segment;
}

function assertSegmentDiameter(
  sizing: TechnicalTransitionAwareNetworkSizingResult,
  segmentId: string,
  expectedDiameterId: string,
) {
  assertEqual(segmentSizing(sizing, segmentId).finalDiameter?.id, expectedDiameterId);
}

function assertTransitionAwareSizing(result: TechnicalCalculationResult) {
  const sizing = result.transitionAwareNetworkSizing;

  assert(sizing, "Falta resultado 09C2B.");
  return sizing;
}

function assertBaselineSizing(result: TechnicalCalculationResult) {
  const sizing = result.networkSizing;

  assert(sizing, "Falta resultado baseline.");
  assertEqual(sizing.status, "resolved");
  return sizing;
}

function assertIssue(
  result:
    | ReturnType<typeof evaluateFixtureAssignment>
    | TechnicalTransitionAwareNetworkSizingResult,
  code: string,
) {
  assert(
    result.issues.some((issue) => issue.code === code),
    `Falta issue ${code}.`,
  );
}

function fixtureEquipment(
  appliances: Array<{
    demandUnit?: DemandUnit;
    demandValue: number;
    id: string;
    name: string;
    x: number;
    y: number;
  }>,
): WorkbenchEquipment[] {
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
    ...appliances.map((appliance): WorkbenchEquipment => ({
      connectionPoint: { x: appliance.x, y: appliance.y },
      demandUnit: appliance.demandUnit ?? "m3_h",
      demandValue: appliance.demandValue,
      id: appliance.id,
      name: appliance.name,
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "stove",
    })),
  ];
}

function supplyNode(): RouteNode {
  return {
    equipmentId: "meter",
    id: "node-meter",
    kind: "supply",
  };
}

function routeNode(id: string, x: number, y: number): RouteNode {
  return {
    id,
    kind: "route",
    position: { x, y },
  };
}

function manualAccessory(
  id: string,
  equivalentLengthMetersPerUnit: number,
  quantity: number,
): RouteSegmentAccessory {
  return {
    equivalentLengthMetersPerUnit,
    equivalentLengthSource: "manual",
    id,
    quantity,
    segmentId: "",
    type: "other",
  };
}

function diameter(id: string) {
  const value = TEST_DIAMETERS.find((item) => item.id === id) ?? null;

  assert(value, `Falta diametro ${id}.`);
  return value;
}

function diameterRank(diameter: PipeDiameterReference | null) {
  if (!diameter) {
    return -1;
  }

  return TEST_DIAMETERS.findIndex((item) => item.id === diameter.id);
}

function testDiameter(
  id: string,
  externalDiameterMillimeters: number,
  internalDiameterMillimeters: number,
): PipeDiameterReference {
  return {
    externalDiameterMillimeters,
    id,
    internalDiameterMillimeters,
    label: `Test ${externalDiameterMillimeters} mm`,
    nominalDiameter: `${externalDiameterMillimeters} mm`,
  };
}

function transitionPairKey(
  upstreamDiameter: PipeDiameterReference,
  downstreamDiameter: PipeDiameterReference,
) {
  const upstream = upstreamDiameter.externalDiameterMillimeters ?? 0;
  const downstream = downstreamDiameter.externalDiameterMillimeters ?? 0;
  const larger = Math.max(upstream, downstream);
  const smaller = Math.min(upstream, downstream);

  return `${larger}-${smaller}`;
}

function serializeSizing(result: TechnicalCalculationResult) {
  const sizing = assertTransitionAwareSizing(result);

  return JSON.stringify({
    cost: sizing.additionalDiameterStepCost,
    finalDiameterBySegmentId: sizing.finalDiameterBySegmentId,
    issues: sizing.issues,
    status: sizing.status,
    trace: sizing.trace,
  });
}

function verify(
  results: TechnicalTransitionAwareNetworkSizingVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(
    actual === expected,
    `Expected ${String(expected)}, got ${String(actual)}.`,
  );
}

function assertClose(actual: number | null | undefined, expected: number) {
  assert(
    actual !== null &&
      actual !== undefined &&
      Math.abs(actual - expected) <= EPSILON,
    `Expected ${expected}, got ${String(actual)}.`,
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
    JSON.stringify(
      runTechnicalTransitionAwareNetworkSizingVerifications(),
      null,
      2,
    ),
  );
}
