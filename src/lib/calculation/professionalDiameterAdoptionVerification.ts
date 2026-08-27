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
import {
  detectDiameterTransitionProposals,
  type DiameterTransitionDecision,
} from "@/lib/calculation/diameterTransitionProposals";
import type { DemandUnit, WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteNode,
  RouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import {
  createPersistedWorkbenchProject,
  parsePersistedWorkbenchProject,
  type PersistableWorkbenchBase,
} from "@/lib/workbench/persistence";
import {
  removeAdoptedDiameterDecision,
  type AdoptedDiameterDecision,
  type ProfessionalDiameterAdoptionResult,
} from "./professionalDiameterAdoption";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "./technicalTree";

export type ProfessionalDiameterAdoptionVerificationResult = {
  name: string;
  status: "passed";
};

type RequiredDiameterRule =
  | string
  | ((context: PipeSegmentSizingContext) => string);

type TestPipeSystemOptions = {
  accessoryEquivalentByFamily?: Record<string, Record<string, number>>;
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
const ACCESSORY_FAMILY = "test-elbow";
const EPSILON = 0.000001;

export function runProfessionalDiameterAdoptionVerifications() {
  const results: ProfessionalDiameterAdoptionVerificationResult[] = [];

  verify(results, "Caso 1 - sin override usa calculado", () => {
    const fixture = createLineFixture({
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    });
    const adoption = assertAdoption(fixture.result);

    assertEqual(adoption.status, "validated");
    assertSegmentStatus(adoption, "s1", "using_calculated");
    assertEffectiveDiameter(adoption, "s1", "test-25");
    assertEqual(adoption.segments[0]?.adoptedDiameter, null);
  });

  verify(results, "Caso 2 - adoptar mismo diametro", () => {
    const result = createLineFixture({
      adoptedDiameterDecisions: [adopted("s1", "test-25")],
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    }).result;
    const adoption = assertAdoption(result);

    assertEqual(adoption.status, "validated");
    assertSegmentStatus(adoption, "s1", "validated");
    assertAdoptedDiameter(adoption, "s1", "test-25");
    assertEffectiveDiameter(adoption, "s1", "test-25");
  });

  verify(results, "Caso 3 - adoptar diametro mayor", () => {
    const result = createLineFixture({
      adoptedDiameterDecisions: [adopted("s1", "test-32")],
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    }).result;
    const adoption = assertAdoption(result);

    assertEqual(adoption.status, "validated");
    assertEffectiveDiameter(adoption, "s1", "test-32");
  });

  verify(results, "Caso 4 - menor al minimo queda bloqueado", () => {
    const result = createLineFixture({
      adoptedDiameterDecisions: [adopted("s1", "test-20")],
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    }).result;
    const adoption = assertAdoption(result);

    assertEqual(adoption.status, "incompatible");
    assertSegmentStatus(adoption, "s1", "incompatible");
    assertIssue(result, "incompatible_adopted_diameter");
    assertAdoptionIssue(adoption, "adopted_diameter_below_calculated");
  });

  verify(results, "Caso 5 - quitar override vuelve al calculado", () => {
    const decisions = removeAdoptedDiameterDecision(
      [adopted("s1", "test-32")],
      "s1",
    );
    const result = createLineFixture({
      adoptedDiameterDecisions: decisions,
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    }).result;
    const adoption = assertAdoption(result);

    assertEqual(decisions.length, 0);
    assertSegmentStatus(adoption, "s1", "using_calculated");
    assertEffectiveDiameter(adoption, "s1", "test-25");
  });

  verify(results, "Caso 6 - override persiste", () => {
    const decision = adopted("s1", "test-32");
    const project = createPersistedWorkbenchProject({
      activeBaseId: "base",
      bases: [persistableBase([decision])],
      nextSectionNumber: 1,
      routeProposal: null,
      routeProposalMarginInput: "0,10",
      routeProposalMode: null,
      sectionPlanLinks: [],
    });
    const parsed = parsePersistedWorkbenchProject(JSON.stringify(project));

    assertEqual(parsed.status, "loaded");

    if (parsed.status !== "loaded") {
      throw new Error("El proyecto persistido no cargo.");
    }

    assertEqual(
      parsed.project.bases[0]?.adoptedDiameterDecisions[0]?.diameterId,
      "test-32",
    );
  });

  verify(results, "Caso 7 - aumento elimina una reduccion", () => {
    const solved = solveLineWithConfirmedTransitions({
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-32",
          s2: "test-25",
        },
        transitionEquivalentByFamily: familyPairs({
          "32-25": 1,
        }),
      }),
    });
    const result = calculateFixture({
      adoptedDiameterDecisions: [adopted("s2", "test-32")],
      diameterTransitionDecisions: solved.decisions,
      equipment: solved.equipment,
      network: solved.network,
      pipeSystem: solved.pipeSystem,
    });
    const adoption = assertAdoption(result);
    const routeTransition =
      adoption.routeTransitionResolutions["technical-route:appliance"];

    assertEqual(adoption.status, "validated");
    assertEffectiveDiameter(adoption, "s1", "test-32");
    assertEffectiveDiameter(adoption, "s2", "test-32");
    assertClose(routeTransition?.equivalentLengthMeters, 0);
  });

  verify(results, "Caso 8 - aumento crea transicion pendiente", () => {
    const result = createLineFixture({
      adoptedDiameterDecisions: [adopted("s1", "test-32")],
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-25",
          s2: "test-25",
        },
        transitionEquivalentByFamily: familyPairs({
          "32-25": 1,
        }),
      }),
      segmentCount: 2,
    }).result;
    const adoption = assertAdoption(result);

    assertEqual(adoption.status, "pending_validation");
    assertSegmentStatus(adoption, "s1", "pending_validation");
    assertIssue(result, "pending_adopted_diameter_validation");
    assertAdoptionTechnicalIssue(adoption, "unconfirmed_required_transition");
  });

  verify(results, "Caso 9 - cambia variante de accesorio", () => {
    const result = createLineFixture({
      adoptedDiameterDecisions: [adopted("s1", "test-32")],
      accessories: [pipeSystemAccessory("s1", "elbow", ACCESSORY_FAMILY)],
      pipeSystem: createTestPipeSystem({
        accessoryEquivalentByFamily: {
          [ACCESSORY_FAMILY]: {
            "test-25": 1,
            "test-32": 3,
          },
        },
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    }).result;
    const adoption = assertAdoption(result);
    const routeAccessory =
      adoption.routeAccessoryResolutions["technical-route:appliance"];

    assertEqual(adoption.status, "validated");
    assertClose(routeAccessory?.governingRouteAccessoryEquivalentLengthMeters, 3);
    assertEqual(routeAccessory?.contributions[0]?.diameter?.id, "test-32");
  });

  verify(results, "Caso 10 - varios overrides simultaneos", () => {
    const result = createLineFixture({
      adoptedDiameterDecisions: [
        adopted("s1", "test-32"),
        adopted("s2", "test-32"),
        adopted("s3", "test-32"),
      ],
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: {
          s1: "test-25",
          s2: "test-25",
          s3: "test-25",
        },
      }),
      segmentCount: 3,
    }).result;
    const adoption = assertAdoption(result);

    assertEqual(adoption.status, "validated");
    assertEffectiveDiameter(adoption, "s1", "test-32");
    assertEffectiveDiameter(adoption, "s2", "test-32");
    assertEffectiveDiameter(adoption, "s3", "test-32");
  });

  verify(results, "Caso 11 - mismo input y decisiones mismo resultado", () => {
    const first = createLineFixture({
      adoptedDiameterDecisions: [adopted("s1", "test-32", 99)],
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    }).result;
    const second = createLineFixture({
      adoptedDiameterDecisions: [adopted("s1", "test-32", 99)],
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    }).result;

    assertEqual(
      JSON.stringify(assertAdoption(first)),
      JSON.stringify(assertAdoption(second)),
    );
  });

  verify(results, "Caso 12 - no modifica el minimo calculado", () => {
    const result = createLineFixture({
      adoptedDiameterDecisions: [adopted("s1", "test-32")],
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    }).result;
    const minimum = assertTransitionAwareSizing(result)
      .finalDiameterBySegmentId.s1;
    const adoptionSegment = adoptionSegmentById(
      assertAdoption(result),
      "s1",
    );

    assertEqual(minimum?.id, "test-25");
    assertEqual(adoptionSegment.calculatedDiameter?.id, "test-25");
    assertEqual(adoptionSegment.effectiveDiameter?.id, "test-32");
  });

  verify(results, "Caso 13 - efectivo final cumple capacidad", () => {
    const result = createLineFixture({
      adoptedDiameterDecisions: [adopted("s1", "test-32")],
      pipeSystem: createTestPipeSystem({
        requiredBySegmentId: { s1: "test-25" },
      }),
      segmentCount: 1,
    }).result;
    const validationSegment = adoptionSegmentById(
      assertAdoption(result),
      "s1",
    ).validationSegment;

    assertEqual(validationSegment?.status, "resolved");
    assert(
      diameterRank(validationSegment?.finalDiameter ?? null) >=
        diameterRank(validationSegment?.requiredDiameter ?? null),
      "El diametro efectivo debe cubrir el requerido final.",
    );
  });

  return results;
}

function createLineFixture(params: {
  accessories?: RouteSegmentAccessory[];
  adoptedDiameterDecisions?: AdoptedDiameterDecision[];
  diameterTransitionDecisions?: DiameterTransitionDecision[];
  pipeSystem: PipeSystem;
  segmentCount: number;
}): Fixture {
  const nodes: RouteNode[] = [
    supplyNode(),
    ...Array.from({ length: Math.max(0, params.segmentCount - 1) }, (_, index) =>
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

  for (let index = 0; index < params.segmentCount; index += 1) {
    const id = `s${index + 1}`;

    segments.push({
      accessories:
        id === "s1" && params.accessories ? params.accessories : undefined,
      fromNodeId: nodeIds[index] as string,
      id,
      toNodeId: nodeIds[index + 1] as string,
    });
  }
  const equipment = fixtureEquipment([
    {
      demandValue: 1,
      id: "appliance",
      name: "Artefacto",
      x: params.segmentCount * 10,
      y: 0,
    },
  ]);
  const network = { nodes, segments };

  return {
    equipment,
    network,
    pipeSystem: params.pipeSystem,
    result: calculateFixture({
      adoptedDiameterDecisions: params.adoptedDiameterDecisions,
      diameterTransitionDecisions: params.diameterTransitionDecisions,
      equipment,
      network,
      pipeSystem: params.pipeSystem,
    }),
  };
}

function solveLineWithConfirmedTransitions(params: { pipeSystem: PipeSystem }) {
  const fixture = createLineFixture({
    pipeSystem: params.pipeSystem,
    segmentCount: 2,
  });
  const decisions = confirmedDecisionsForFixture(
    fixture,
    DEFAULT_TRANSITION_FAMILY,
  );

  return {
    ...fixture,
    decisions,
    result: calculateFixture({
      diameterTransitionDecisions: decisions,
      equipment: fixture.equipment,
      network: fixture.network,
      pipeSystem: fixture.pipeSystem,
    }),
  };
}

function calculateFixture(params: {
  adoptedDiameterDecisions?: AdoptedDiameterDecision[];
  diameterTransitionDecisions?: DiameterTransitionDecision[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pipeSystem: PipeSystem;
}) {
  return calculateTechnicalTree({
    adoptedDiameterDecisions: params.adoptedDiameterDecisions,
    diameterTransitionDecisions: params.diameterTransitionDecisions,
    equipment: params.equipment,
    minSegmentLengthSource: 0.000001,
    network: params.network,
    pipeSystem: params.pipeSystem,
    scaleMetersPerSourceUnit: 1,
  });
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

function createTestPipeSystem(options: TestPipeSystemOptions = {}): PipeSystem {
  const diameters = options.diameters ?? TEST_DIAMETERS;

  return {
    getAvailableDiameters: () => ({
      explanation: "Diametros sinteticos para 10B.",
      status: "resolved",
      value: diameters,
    }),
    identity: {
      id: "test-professional-adoption-pipe-system",
      name: "Test professional adoption PipeSystem",
    },
    resolveAccessoryEquivalentLength: (
      context: PipeAccessoryEquivalentLengthContext,
    ) => resolveTestAccessoryEquivalentLength(context, options),
    resolveDiameterTransitionEquivalentLength: (
      context: PipeDiameterTransitionEquivalentLengthContext,
    ) => resolveTestTransitionEquivalentLength(context, options),
    sizeSegment: (context: PipeSegmentSizingContext) =>
      sizeTestSegment(context, options, diameters),
  };
}

function resolveTestAccessoryEquivalentLength(
  context: PipeAccessoryEquivalentLengthContext,
  options: TestPipeSystemOptions,
): PipeSystemResolution<number> {
  const familyId =
    context.accessory.catalogFamilyId ?? context.accessory.catalogCode;

  if (!familyId) {
    return {
      reason: "Accesorio sintetico sin catalogCode.",
      status: "unsupported",
    };
  }

  const configuredFamily = options.accessoryEquivalentByFamily?.[familyId];

  if (!configuredFamily) {
    return {
      explanation: "Accesorio sintetico sin perdida adicional.",
      status: "resolved",
      value: 0,
    };
  }

  const diameter = context.pipe?.diameter ?? null;

  if (!diameter) {
    return {
      explanation: "Precalculo sintetico sin diametro efectivo.",
      status: "resolved",
      value: 0,
    };
  }

  const equivalentLength = configuredFamily[diameter.id];

  if (equivalentLength === undefined) {
    return {
      data: {
        diameterId: diameter.id,
        familyId,
      },
      reason:
        "La familia sintetica de accesorio no posee variante para el diametro actual.",
      status: "unsupported",
    };
  }

  return {
    explanation: `Accesorio sintetico ${familyId}.`,
    status: "resolved",
    value: equivalentLength,
  };
}

function resolveTestTransitionEquivalentLength(
  context: PipeDiameterTransitionEquivalentLengthContext,
  options: TestPipeSystemOptions,
): PipeSystemResolution<PipeDiameterTransitionEquivalentLengthResult> {
  if (
    context.transition.kind !== "simple_reduction" &&
    context.transition.kind !== "branch_transition" &&
    context.transition.kind !== "compound_turn_transition"
  ) {
    return {
      reason:
        "El PipeSystem sintetico solo resuelve reducciones simples y tees reductoras.",
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
  const equivalentsByPair =
    options.transitionEquivalentByFamily?.[familyId] ?? {};
  const equivalentLength = equivalentsByPair[pair] ?? null;

  if (equivalentLength === null) {
    return {
      data: { familyId, pair },
      reason: "La familia sintetica no posee variante para el par actual.",
      status: "unsupported",
    };
  }

  const [larger, smaller] = pair.split("-").map(Number) as [number, number];
  const label = `${familyId} ${larger} a ${smaller}`;

  return {
    data: {
      catalogCode: `${familyId}-${pair}`,
      catalogFamilyId: familyId,
      tableLabel: label,
    },
    explanation: `Transicion sintetica ${familyId} ${pair}.`,
    status: "resolved",
    value: {
      catalogCode: `${familyId}-${pair}`,
      catalogFamilyId: familyId,
      downstreamDiameter: context.downstreamDiameter,
      equivalentLengthMeters: equivalentLength,
      source: { table: "Tabla sintetica 10B" },
      upstreamDiameter: context.upstreamDiameter,
      variant: {
        largerExternalDiameterMillimeters: larger,
        label,
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

function assertAdoption(
  result: TechnicalCalculationResult,
): ProfessionalDiameterAdoptionResult {
  const adoption = result.professionalDiameterAdoption;

  assert(adoption, "Falta resultado de adopcion profesional.");
  return adoption;
}

function assertBaselineSizing(result: TechnicalCalculationResult) {
  const sizing = result.networkSizing;

  assert(sizing, "Falta resultado baseline.");
  assertEqual(sizing.status, "resolved");
  return sizing;
}

function assertTransitionAwareSizing(result: TechnicalCalculationResult) {
  const sizing = result.transitionAwareNetworkSizing;

  assert(sizing, "Falta resultado con transiciones.");
  assertEqual(sizing.status, "resolved");
  return sizing;
}

function assertSegmentStatus(
  adoption: ProfessionalDiameterAdoptionResult,
  segmentId: string,
  status: string,
) {
  assertEqual(adoptionSegmentById(adoption, segmentId).status, status);
}

function assertEffectiveDiameter(
  adoption: ProfessionalDiameterAdoptionResult,
  segmentId: string,
  diameterId: string,
) {
  assertEqual(
    adoption.effectiveDiameterBySegmentId[segmentId]?.id,
    diameterId,
  );
}

function assertAdoptedDiameter(
  adoption: ProfessionalDiameterAdoptionResult,
  segmentId: string,
  diameterId: string,
) {
  assertEqual(adoptionSegmentById(adoption, segmentId).adoptedDiameter?.id, diameterId);
}

function adoptionSegmentById(
  adoption: ProfessionalDiameterAdoptionResult,
  segmentId: string,
) {
  const segment =
    adoption.segments.find((item) => item.segmentId === segmentId) ?? null;

  assert(segment, `Falta adopcion del segmento ${segmentId}.`);
  return segment;
}

function assertAdoptionIssue(
  adoption: ProfessionalDiameterAdoptionResult,
  code: string,
) {
  assert(
    adoption.issues.some((issue) => issue.code === code),
    `Falta issue de adopcion ${code}.`,
  );
}

function assertAdoptionTechnicalIssue(
  adoption: ProfessionalDiameterAdoptionResult,
  technicalCode: string,
) {
  assert(
    adoption.issues.some(
      (issue) => issue.data?.technicalCode === technicalCode,
    ),
    `Falta issue tecnico de adopcion ${technicalCode}.`,
  );
}

function assertIssue(result: TechnicalCalculationResult, code: string) {
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

function pipeSystemAccessory(
  segmentId: string,
  id: string,
  catalogFamilyId: string,
): RouteSegmentAccessory {
  return {
    catalogCode: catalogFamilyId,
    catalogFamilyId,
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id,
    origin: "user_confirmed",
    quantity: 1,
    segmentId,
    type: "elbow",
  };
}

function persistableBase(
  adoptedDiameterDecisions: AdoptedDiameterDecision[],
): PersistableWorkbenchBase {
  return {
    adoptedDiameterDecisions,
    calibration: {
      calibration: null,
      draft: {
        distanceOriginal: "",
        points: [],
        status: "pending",
        unit: "mm",
      },
    },
    constraints: [],
    createdAt: 1,
    diameterTransitionDecisions: [],
    drawing: null,
    equipment: [],
    id: "base",
    name: "Planta",
    originalFileName: "planta.pdf",
    pdfModel: null,
    proposals: [],
    routeAccessoryProposalDecisions: [],
    routeIntentConnections: [],
    routeNetwork: { nodes: [], segments: [] },
    semanticAssignments: [],
    semanticInspection: null,
    semanticViewMode: "original",
    showConstraints: true,
    showEquipment: true,
    showRoute: true,
    sourceType: "pdf",
    type: "plan",
    visibleLayers: {},
    visual: { activePdfPageNumber: 1 },
  };
}

function adopted(
  segmentId: string,
  diameterId: string,
  decidedAt = 1,
): AdoptedDiameterDecision {
  return {
    decidedAt,
    diameterId,
    origin: "user_adopted",
    segmentId,
  };
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

function diameterRank(diameter: PipeDiameterReference | null) {
  if (!diameter) {
    return -1;
  }

  return TEST_DIAMETERS.findIndex((item) => item.id === diameter.id);
}

function verify(
  results: ProfessionalDiameterAdoptionVerificationResult[],
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
    JSON.stringify(runProfessionalDiameterAdoptionVerifications(), null, 2),
  );
}
