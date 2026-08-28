import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type {
  TechnicalRouteAccessoryContribution,
  TechnicalRouteAccessoryResolution,
} from "@/lib/calculation/technicalRouteAccessories";
import type {
  TechnicalRouteTransitionContribution,
  TechnicalRouteTransitionResolution,
} from "@/lib/calculation/technicalRouteTransitions";
import type {
  DiameterTransitionKind,
  DiameterTransitionProposal,
} from "@/lib/calculation/diameterTransitionProposals";
import type { AccessoryProposal } from "@/lib/routing/routeAccessoryProposals";
import type { RouteAccessoryType } from "@/lib/routing/types";
import {
  createTechnicalMaterialTakeoff,
  type TechnicalMaterialTakeoff,
} from "./technicalMaterialTakeoff";
import type {
  TechnicalAdoptedDiameterValidation,
} from "./technicalAdoptedDiameterValidation";
import type {
  TechnicalPhysicalAccessoryInventory,
} from "./technicalPhysicalAccessories";
import type {
  TechnicalCalculationResult,
  TechnicalSegmentResult,
} from "./technicalTree";

export type TechnicalMaterialTakeoffVerificationResult = {
  name: string;
  status: "passed";
};

const D20 = testDiameter("test-20", 20, 13);
const D25 = testDiameter("test-25", 25, 18);
const D32 = testDiameter("test-32", 32, 25);
const EPSILON = 0.000001;

export function runTechnicalMaterialTakeoffVerifications() {
  const results: TechnicalMaterialTakeoffVerificationResult[] = [];

  verify(results, "Caso 1 - suma longitudes fisicas por diametro", () => {
    const takeoff = createTakeoff({
      diameters: { s1: D20, s2: D25, s3: D32 },
      lengths: { s1: 12.4, s2: 8.2, s3: 10.75 },
    });

    assertPipeLength(takeoff, D20, 12.4);
    assertPipeLength(takeoff, D25, 8.2);
    assertPipeLength(takeoff, D32, 10.75);
    assertEqual(takeoff.physicalMaterialQuantities.pipeSegmentCount, 3);
  });

  verify(results, "Caso 2 - no usa longitud equivalente como caño real", () => {
    const takeoff = createTakeoff({
      diameters: { s1: D20 },
      lengths: { s1: 10 },
      routeAccessoryResolutions: {
        r1: routeAccessoryResolution("r1", [
          routeAccessoryContribution({
            accessoryId: "elbow-1",
            diameter: D20,
            equivalentLengthMeters: 5,
            ownerSegmentId: "s1",
          }),
        ]),
      },
      routeTransitionResolutions: {
        r1: routeTransitionResolution("r1", [
          transitionContribution({
            downstreamDiameter: D20,
            equivalentLengthMeters: 2,
            transitionId: "reduction-1",
            upstreamDiameter: D25,
          }),
        ]),
      },
      sizingLengths: { s1: 17 },
    });

    assertPipeLength(takeoff, D20, 10);
    assertEqual(
      takeoff.calculationQuantities.segmentSizingLengthMetersBySegmentId.s1,
      17,
    );
  });

  verify(results, "Caso 3 - diametro adoptado cambia agrupacion", () => {
    const takeoff = createTakeoff({
      adoptionDiameters: { s1: D32 },
      diameters: { s1: D20 },
      lengths: { s1: 10 },
    });

    assertPipeLength(takeoff, D32, 10);
    assertEqual(pipeItem(takeoff, D20), null);
  });

  verify(results, "Caso 4 - codos se cuentan una vez", () => {
    const contribution = routeAccessoryContribution({
      accessoryId: "elbow-1",
      diameter: D20,
      ownerSegmentId: "s1",
    });
    const takeoff = createTakeoff({
      diameters: { s1: D20 },
      lengths: { s1: 10 },
      routeAccessoryResolutions: {
        r1: routeAccessoryResolution("r1", [contribution]),
        r2: routeAccessoryResolution("r2", [{ ...contribution, routeId: "r2" }]),
      },
    });

    assertAccessoryQuantity(takeoff, "elbow", "family-elbow", 1);
  });

  verify(results, "Caso 5 - reduccion se cuenta una vez", () => {
    const contribution = transitionContribution({
      downstreamDiameter: D25,
      transitionId: "reduction-1",
      upstreamDiameter: D32,
    });
    const takeoff = createTakeoff({
      diameters: { s1: D32, s2: D25 },
      lengths: { s1: 10, s2: 4 },
      routeTransitionResolutions: {
        r1: routeTransitionResolution("r1", [contribution]),
        r2: routeTransitionResolution("r2", [{ ...contribution, routeId: "r2" }]),
      },
    });

    assertAccessoryQuantity(takeoff, "reduction", "family-reduction", 1);
  });

  verify(results, "Caso 6 - compound cuenta codo y reduccion", () => {
    const takeoff = createTakeoff({
      diameters: { s1: D32, s2: D25 },
      lengths: { s1: 10, s2: 4 },
      routeTransitionResolutions: {
        r1: routeTransitionResolution("r1", [
          transitionContribution({
            catalogFamilyId: "family-elbow",
            compoundComponent: "turn",
            downstreamDiameter: D25,
            kind: "compound_turn_transition",
            transitionId: "compound-1",
            upstreamDiameter: D32,
            variantLabel: "Codo 90 Ø32",
          }),
          transitionContribution({
            compoundComponent: "diameter_change",
            downstreamDiameter: D25,
            kind: "compound_turn_transition",
            transitionId: "compound-1",
            upstreamDiameter: D32,
            variantLabel: "Reduccion 32 a 25",
          }),
        ]),
      },
    });

    assertAccessoryQuantity(takeoff, "elbow", "family-elbow", 1);
    assertAccessoryQuantity(takeoff, "reduction", "family-reduction", 1);
  });

  verify(results, "Caso 7 - tee reductora no duplica por recorrido", () => {
    const through = transitionContribution({
      downstreamDiameter: D25,
      kind: "branch_transition",
      transitionId: "tee-1",
      traversalKind: "through",
      upstreamDiameter: D32,
    });
    const turn = transitionContribution({
      downstreamDiameter: D25,
      kind: "branch_transition",
      transitionId: "tee-1",
      traversalKind: "turn_90",
      upstreamDiameter: D32,
    });
    const takeoff = createTakeoff({
      diameters: { common: D32, branchA: D25, branchB: D25 },
      lengths: { branchA: 4, branchB: 5, common: 10 },
      routeTransitionResolutions: {
        r1: routeTransitionResolution("r1", [through]),
        r2: routeTransitionResolution("r2", [{ ...turn, routeId: "r2" }]),
      },
    });

    assertAccessoryQuantity(takeoff, "reduced_tee", "family-reduction", 1);
  });

  verify(results, "Caso 8 - accesorio rechazado no entra", () => {
    const takeoff = createTakeoff({
      accessoryProposals: [
        accessoryProposal({
          id: "proposal-1",
          kind: "elbow",
          state: "rejected",
        }),
      ],
      diameters: { s1: D20 },
      lengths: { s1: 10 },
    });

    assertEqual(takeoff.accessoryItems.length, 0);
    assertEqual(takeoff.pendingSummary.accessoryCount, 0);
  });

  verify(results, "Caso 9 - pendiente no inventa material", () => {
    const takeoff = createTakeoff({
      diameters: { s1: D32, s2: D25 },
      diameterTransitionProposals: [
        transitionProposal({
          id: "pending-reduction",
          kind: "simple_reduction",
          state: "transition_required",
        }),
      ],
      lengths: { s1: 10, s2: 4 },
    });

    assertEqual(
      takeoff.accessoryItems.some((item) => item.accessoryKind === "reduction"),
      false,
    );
    assertEqual(takeoff.pendingSummary.transitionCount, 1);
  });

  verify(results, "Caso 10 - accesorio sin confirmar queda pendiente", () => {
    const takeoff = createTakeoff({
      accessoryProposals: [
        accessoryProposal({
          id: "proposal-1",
          kind: "elbow",
          state: "needs_review",
        }),
      ],
      diameters: { s1: D20 },
      lengths: { s1: 10 },
    });

    assertEqual(takeoff.accessoryItems.length, 0);
    assertEqual(takeoff.pendingSummary.accessoryCount, 1);
  });

  verify(results, "Caso 11 - diametro efectivo no validado queda pendiente", () => {
    const takeoff = createTakeoff({
      adoptionDiameters: { s1: D32 },
      diameters: { s1: D20 },
      lengths: { s1: 10 },
      pendingAdoptionSegmentIds: ["s1"],
    });

    assertEqual(takeoff.pipeItems.length, 0);
    assertEqual(takeoff.pendingSummary.adoptionCount, 1);
  });

  verify(results, "Caso 12 - misma red mismo computo", () => {
    const first = createTakeoff({
      diameters: { s1: D20, s2: D25 },
      lengths: { s1: 10, s2: 4 },
      routeAccessoryResolutions: {
        r1: routeAccessoryResolution("r1", [
          routeAccessoryContribution({
            accessoryId: "elbow-1",
            diameter: D20,
            ownerSegmentId: "s1",
          }),
        ]),
      },
    });
    const second = createTakeoff({
      diameters: { s1: D20, s2: D25 },
      lengths: { s1: 10, s2: 4 },
      routeAccessoryResolutions: {
        r1: routeAccessoryResolution("r1", [
          routeAccessoryContribution({
            accessoryId: "elbow-1",
            diameter: D20,
            ownerSegmentId: "s1",
          }),
        ]),
      },
    });

    assertEqual(JSON.stringify(first), JSON.stringify(second));
  });

  verify(
    results,
    "Caso 13 - suma por diametro iguala longitud fisica computable",
    () => {
      const lengths = { s1: 10, s2: 4.5, s3: 3.25 };
      const takeoff = createTakeoff({
        diameters: { s1: D20, s2: D20, s3: D25 },
        lengths,
      });
      const pipeLength = takeoff.pipeItems.reduce(
        (sum, item) => sum + item.physicalLengthMeters,
        0,
      );

      assertClose(pipeLength, lengths.s1 + lengths.s2 + lengths.s3);
    },
  );

  verify(
    results,
    "Caso 14 - 10.5G tee compartida cuenta una vez y canos por adoptado",
    () => {
      const takeoff = createTakeoff({
        adoptedDiameterValidation: adoptedValidation({
          s20: D20,
          s25: D25,
          s32: D32,
        }),
        diameters: { s20: D32, s25: D32, s32: D20 },
        lengths: { s20: 2.25, s25: 3.5, s32: 4.75 },
        physicalAccessoryInventory: sharedTeeInventory(),
      });

      assertPipeLength(takeoff, D20, 2.25);
      assertPipeLength(takeoff, D25, 3.5);
      assertPipeLength(takeoff, D32, 4.75);
      assertAccessoryQuantity(takeoff, "tee", "family-tee", 1);
      assertEqual(takeoff.physicalMaterialQuantities.accessoryQuantity, 1);
      assertClose(takeoff.physicalMaterialQuantities.pipeLengthMeters, 10.5);
    },
  );

  return results;
}

function createTakeoff(params: {
  accessoryProposals?: AccessoryProposal[];
  adoptionDiameters?: Record<string, PipeDiameterReference>;
  adoptedDiameterValidation?: TechnicalAdoptedDiameterValidation;
  diameters: Record<string, PipeDiameterReference>;
  diameterTransitionProposals?: DiameterTransitionProposal[];
  lengths: Record<string, number | null>;
  pendingAdoptionSegmentIds?: string[];
  physicalAccessoryInventory?: TechnicalPhysicalAccessoryInventory;
  routeAccessoryResolutions?: Record<string, TechnicalRouteAccessoryResolution>;
  routeTransitionResolutions?: Record<string, TechnicalRouteTransitionResolution>;
  sizingLengths?: Record<string, number | null>;
}) {
  const result = technicalResult(params);

  return createTechnicalMaterialTakeoff({
    accessoryProposals: params.accessoryProposals,
    adoptedDiameterValidation: params.adoptedDiameterValidation,
    diameterTransitionProposals: params.diameterTransitionProposals,
    physicalAccessoryInventory: params.physicalAccessoryInventory,
    result,
    routeTransitionResolutions: params.routeTransitionResolutions,
  });
}

function technicalResult(params: {
  adoptionDiameters?: Record<string, PipeDiameterReference>;
  diameters: Record<string, PipeDiameterReference>;
  lengths: Record<string, number | null>;
  pendingAdoptionSegmentIds?: string[];
  routeAccessoryResolutions?: Record<string, TechnicalRouteAccessoryResolution>;
  routeTransitionResolutions?: Record<string, TechnicalRouteTransitionResolution>;
  sizingLengths?: Record<string, number | null>;
}): TechnicalCalculationResult {
  const segments = Object.keys(params.lengths)
    .sort()
    .map((segmentId, index) =>
      technicalSegment({
        diameter: params.diameters[segmentId] ?? null,
        index,
        lengthMeters: params.lengths[segmentId] ?? null,
        segmentId,
      }),
    );
  const finalDiameterBySegmentId = Object.fromEntries(
    Object.entries(params.diameters),
  );
  const effectiveDiameterBySegmentId = Object.fromEntries(
    Object.entries(params.adoptionDiameters ?? params.diameters),
  );
  const transitionSegments = segments.map((segment) => ({
    finalDiameter:
      params.adoptionDiameters?.[segment.segmentId] ??
      params.diameters[segment.segmentId] ??
      null,
    issues: [],
    segmentId: segment.segmentId,
    status: "resolved",
    transitionAwareSizingLengthMeters:
      params.sizingLengths?.[segment.segmentId] ??
      segment.segmentPhysicalLengthMeters,
  }));
  const routeAccessoryResolutions = params.routeAccessoryResolutions ?? {};
  const routeTransitionResolutions = params.routeTransitionResolutions ?? {};
  const pendingAdoptionSegmentIds = new Set(
    params.pendingAdoptionSegmentIds ?? [],
  );
  const hasAdoption =
    Boolean(params.adoptionDiameters) || pendingAdoptionSegmentIds.size > 0;

  return {
    connectedApplianceIds: [],
    demandNormalizations: [],
    issues: [],
    networkSizing: {
      finalDiameterBySegmentId,
      routeAccessoryResolutions,
      segments: segments.map((segment) => ({
        calculatedDiameter: params.diameters[segment.segmentId] ?? null,
        segmentId: segment.segmentId,
        sizingLengthMeters:
          params.sizingLengths?.[segment.segmentId] ??
          segment.segmentPhysicalLengthMeters,
        status: "resolved",
      })),
      status: "resolved",
    } as TechnicalCalculationResult["networkSizing"],
    nodeLabels: {},
    pipeSystem: { id: "test", name: "Test" },
    professionalDiameterAdoption: hasAdoption
      ? ({
          decisions: Object.keys(
            params.adoptionDiameters ?? params.diameters,
          ).map((segmentId) => ({
            decidedAt: 1,
            diameterId: params.adoptionDiameters?.[segmentId]?.id ?? "",
            origin: "user_adopted",
            segmentId,
          })),
          effectiveDiameterBySegmentId,
          routeAccessoryResolutions,
          routeTransitionResolutions,
          segments: segments.map((segment) => ({
            calculatedDiameter: params.diameters[segment.segmentId] ?? null,
            decision: params.adoptionDiameters?.[segment.segmentId]
              ? {
                  decidedAt: 1,
                  diameterId:
                    params.adoptionDiameters[segment.segmentId]?.id ?? "",
                  origin: "user_adopted",
                  segmentId: segment.segmentId,
                }
              : null,
            effectiveDiameter:
              params.adoptionDiameters?.[segment.segmentId] ??
              params.diameters[segment.segmentId] ??
              null,
            reason: pendingAdoptionSegmentIds.has(segment.segmentId)
              ? "Adopcion pendiente de validacion."
              : null,
            segmentId: segment.segmentId,
            status: pendingAdoptionSegmentIds.has(segment.segmentId)
              ? "pending_validation"
              : params.adoptionDiameters?.[segment.segmentId]
                ? "validated"
                : "using_calculated",
            validationSegment: transitionSegments.find(
              (item) => item.segmentId === segment.segmentId,
            ),
          })),
          status: "validated",
        } as unknown as TechnicalCalculationResult["professionalDiameterAdoption"])
      : null,
    projectGas: null,
    rootNodeId: "root",
    routeAccessoryResolutions,
    segments,
    status: "valid",
    technicalRoutes: [],
    totals: {
      accumulatedFlow: null,
      accumulatedFlowUnit: null,
      applianceCount: 0,
      accessoryEquivalentLengthMeters: null,
      calculationLengthMeters: null,
      dimensionedSegmentCount: segments.length,
      pendingDimensioningSegmentCount: 0,
      physicalLengthMeters: segments.reduce(
        (sum, segment) => sum + (segment.segmentPhysicalLengthMeters ?? 0),
        0,
      ),
      segmentCount: segments.length,
    },
    transitionAwareNetworkSizing: {
      finalDiameterBySegmentId,
      issues: [],
      routeAccessoryResolutions,
      routeTransitionResolutions,
      segments: transitionSegments,
      status: "resolved",
    } as unknown as TechnicalCalculationResult["transitionAwareNetworkSizing"],
  };
}

function technicalSegment(params: {
  diameter: PipeDiameterReference | null;
  index: number;
  lengthMeters: number | null;
  segmentId: string;
}): TechnicalSegmentResult {
  return {
    calculatedDiameter: params.diameter,
    depth: params.index,
    fromNodeId: `from-${params.segmentId}`,
    segmentId: params.segmentId,
    segmentPhysicalLengthMeters: params.lengthMeters,
    toNodeId: `to-${params.segmentId}`,
  } as TechnicalSegmentResult;
}

function routeAccessoryResolution(
  routeId: string,
  contributions: TechnicalRouteAccessoryContribution[],
): TechnicalRouteAccessoryResolution {
  return {
    contributions: contributions.map((contribution) => ({
      ...contribution,
      routeId,
    })),
    duplicateAccessoryKeys: [],
    governingRouteAccessoryEquivalentLengthMeters: contributions.reduce(
      (sum, contribution) => sum + (contribution.totalEquivalentLengthMeters ?? 0),
      0,
    ),
    reasons: [],
    routeId,
    sizingLengthMeters: null,
    status: "resolved",
  };
}

function routeAccessoryContribution(params: {
  accessoryId: string;
  diameter: PipeDiameterReference;
  equivalentLengthMeters?: number;
  ownerSegmentId: string;
  quantity?: number;
  type?: RouteAccessoryType;
}): TechnicalRouteAccessoryContribution {
  const equivalentLengthMeters = params.equivalentLengthMeters ?? 0;
  const quantity = params.quantity ?? 1;

  return {
    accessoryId: params.accessoryId,
    catalogCode: "family-elbow-code",
    catalogFamilyId: "family-elbow",
    diameter: params.diameter,
    equivalentLengthMetersPerUnit: equivalentLengthMeters,
    equivalentLengthResolution: {
      explanation: "resolved",
      status: "resolved",
      value: equivalentLengthMeters,
    },
    equivalentLengthSource: "pipe_system",
    ownerSegmentId: params.ownerSegmentId,
    quantity,
    routeId: "r1",
    status: "resolved",
    totalEquivalentLengthMeters: equivalentLengthMeters * quantity,
    type: params.type ?? "elbow",
  };
}

function routeTransitionResolution(
  routeId: string,
  contributions: TechnicalRouteTransitionContribution[],
): TechnicalRouteTransitionResolution {
  return {
    branchTransitionEquivalentLengthMeters: null,
    compoundTransitionEquivalentLengthMeters: null,
    contributions: contributions.map((contribution) => ({
      ...contribution,
      routeId,
    })),
    duplicateTransitionIds: [],
    equivalentLengthMeters: contributions.reduce(
      (sum, contribution) => sum + (contribution.equivalentLengthMeters ?? 0),
      0,
    ),
    projectedSizingLengthMeters: null,
    reasons: [],
    routeId,
    simpleTransitionEquivalentLengthMeters: null,
    status: "resolved",
  };
}

function transitionContribution(params: {
  catalogFamilyId?: string;
  compoundComponent?: "diameter_change" | "turn";
  downstreamDiameter: PipeDiameterReference;
  equivalentLengthMeters?: number;
  kind?: DiameterTransitionKind;
  transitionId: string;
  traversalKind?: "through" | "turn_90";
  upstreamDiameter: PipeDiameterReference;
  variantLabel?: string;
}): TechnicalRouteTransitionContribution {
  const kind = params.kind ?? "simple_reduction";
  const equivalentLengthMeters = params.equivalentLengthMeters ?? 1;
  const catalogFamilyId = params.catalogFamilyId ?? "family-reduction";

  return {
    catalogCode: `${catalogFamilyId}-code`,
    catalogFamilyId,
    compoundComponent: params.compoundComponent,
    downstreamDiameter: params.downstreamDiameter,
    downstreamSegmentId: "s2",
    equivalentLengthMeters,
    equivalentLengthResolution: null,
    nodeId: "node",
    order: 1,
    routeId: "r1",
    source: "pipe_system",
    status: "resolved",
    transitionId: params.transitionId,
    transitionKind: kind,
    traversalKind: params.traversalKind ?? null,
    upstreamDiameter: params.upstreamDiameter,
    upstreamSegmentId: "s1",
    variant: {
      largerExternalDiameterMillimeters:
        params.upstreamDiameter.externalDiameterMillimeters ?? 0,
      label:
        params.variantLabel ??
        `Reduccion ${params.upstreamDiameter.externalDiameterMillimeters} a ${params.downstreamDiameter.externalDiameterMillimeters}`,
      smallerExternalDiameterMillimeters:
        params.downstreamDiameter.externalDiameterMillimeters ?? 0,
    },
    variantLabel: params.variantLabel,
  };
}

function accessoryProposal(params: {
  id: string;
  kind: AccessoryProposal["kind"];
  state: AccessoryProposal["state"];
}): AccessoryProposal {
  return {
    confidence: "high",
    evidence: {
      angleClassification: "turn",
      degree: 2,
      incidentNodeIds: ["a", "b"],
    },
    geometryKey: params.id,
    id: params.id,
    incidentSegmentIds: ["s1"],
    kind: params.kind,
    nodeId: "node",
    ownerResolution: {
      candidateSegmentIds: ["s1"],
      ownerSegmentId: "s1",
      status: "unambiguous",
    },
    position: { x: 0, y: 0 },
    reason: "Requiere confirmacion.",
    state: params.state,
  };
}

function transitionProposal(params: {
  id: string;
  kind: DiameterTransitionKind;
  state: DiameterTransitionProposal["state"];
}): DiameterTransitionProposal {
  return {
    direction: "reducing",
    downstreamDiameters: [{ diameter: D25, role: "downstream", segmentId: "s2" }],
    downstreamSegmentIds: ["s2"],
    evidence: {
      angleClassification: "colinear",
      degree: 2,
      incidentNodeIds: ["a", "b"],
      unresolvedSegmentIds: [],
    },
    geometryKey: params.id,
    id: params.id,
    incidentSegments: [
      { diameter: D32, neighborNodeId: "a", role: "upstream", segmentId: "s1" },
      { diameter: D25, neighborNodeId: "b", role: "downstream", segmentId: "s2" },
    ],
    kind: params.kind,
    nodeId: "node",
    position: { x: 0, y: 0 },
    reason: "Requiere confirmacion.",
    state: params.state,
    upstreamDiameter: { diameter: D32, role: "upstream", segmentId: "s1" },
    upstreamSegmentId: "s1",
  };
}

function adoptedValidation(
  adoptedDiameters: Record<string, PipeDiameterReference>,
): TechnicalAdoptedDiameterValidation {
  const segments = Object.keys(adoptedDiameters)
    .sort()
    .map((segmentId) => {
      const diameter = adoptedDiameters[segmentId] ?? null;

      assert(diameter, `Falta diametro adoptado ${segmentId}.`);

      return {
        adoptedDiameter: diameter,
        availableDiameters: [D20, D25, D32],
        decision: null,
        explanation: "fixture 10.5G",
        provisionalDiameter: D20,
        reason: null,
        requiredDiameter: diameter,
        selectableDiameters: [diameter],
        segmentId,
        source: "required_default" as const,
        status: "valid" as const,
      };
    });

  return {
    invalidSegmentCount: 0,
    segments,
    status: "valid",
    unresolvedSegmentCount: 0,
  };
}

function sharedTeeInventory(): TechnicalPhysicalAccessoryInventory {
  return {
    accessoryIdsByRouteId: {
      "route:a": ["physical-tee-shared"],
      "route:b": ["physical-tee-shared"],
      "route:c": ["physical-tee-shared"],
    },
    accessoryIdsBySegmentId: {
      s20: ["physical-tee-shared"],
      s25: ["physical-tee-shared"],
      s32: ["physical-tee-shared"],
    },
    items: [
      {
        catalogCode: "tee-25-code",
        catalogFamilyId: "family-tee",
        diameters: [
          {
            diameter: D25,
            role: "single",
            segmentId: "s25",
          },
        ],
        id: "physical-tee-shared",
        kind: "tee",
        label: "Tee",
        nodeId: "shared-node",
        position: { x: 0, y: 0 },
        routeUses: [
          physicalRouteUse("route:a", ["s32", "s25"]),
          physicalRouteUse("route:b", ["s25", "s20"]),
          physicalRouteUse("route:c", ["s32", "s20"]),
        ],
        segmentIds: ["s20", "s25", "s32"],
        source: "route_accessory",
        sourceIds: ["s25:tee-shared"],
        status: "resolved",
      },
    ],
    pendingItems: [],
    status: "resolved",
  };
}

function physicalRouteUse(routeId: string, segmentIds: string[]) {
  return {
    equivalentLengthMeters: 0.5,
    routeId,
    segmentIds,
    status: "resolved" as const,
    traversalKind: null,
  };
}

function pipeItem(
  takeoff: TechnicalMaterialTakeoff,
  diameter: PipeDiameterReference,
) {
  return (
    takeoff.pipeItems.find((item) => item.diameter.id === diameter.id) ?? null
  );
}

function assertPipeLength(
  takeoff: TechnicalMaterialTakeoff,
  diameter: PipeDiameterReference,
  expectedMeters: number,
) {
  const item = pipeItem(takeoff, diameter);

  assert(item, `Falta caño ${diameter.id}.`);
  assertClose(item.physicalLengthMeters, expectedMeters);
}

function assertAccessoryQuantity(
  takeoff: TechnicalMaterialTakeoff,
  kind: string,
  familyId: string,
  expectedQuantity: number,
) {
  const item =
    takeoff.accessoryItems.find(
      (candidate) =>
        candidate.accessoryKind === kind &&
        candidate.familyId === familyId,
    ) ?? null;

  assert(item, `Falta accesorio ${kind} ${familyId}.`);
  assertEqual(item.quantity, expectedQuantity);
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

function verify(
  results: TechnicalMaterialTakeoffVerificationResult[],
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
  console.log(JSON.stringify(runTechnicalMaterialTakeoffVerifications(), null, 2));
}
