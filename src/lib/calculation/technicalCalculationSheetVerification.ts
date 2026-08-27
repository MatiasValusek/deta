import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type {
  ProfessionalDiameterAdoptionSegmentResult,
} from "@/lib/calculation/professionalDiameterAdoption";
import type {
  TechnicalNetworkSizingSegmentResult,
} from "@/lib/calculation/technicalNetworkSizing";
import type {
  TechnicalTransitionAwareNetworkSizingSegmentResult,
} from "@/lib/calculation/technicalNetworkSizingWithTransitions";
import type {
  TechnicalCalculationResult,
  TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  createTechnicalCalculationSheet,
  type TechnicalCalculationSheet,
} from "./technicalCalculationSheet";
import { calculatePartialFixture } from "./technicalNetworkSizingVerification";

export type TechnicalCalculationSheetVerificationResult = {
  name: string;
  status: "passed";
};

const D20 = testDiameter("sigas-20", 20, 16);
const D25 = testDiameter("sigas-25", 25, 20);
const D32 = testDiameter("sigas-32", 32, 26);
const EPSILON = 0.000001;

export function runTechnicalCalculationSheetVerifications() {
  const results: TechnicalCalculationSheetVerificationResult[] = [];

  verify(results, "una fila por tramo", () => {
    const sheet = createSheet();

    assertEqual(sheet.rows.length, 2);
    assertEqual(sheet.rows[0]?.segmentId, "s1");
    assertEqual(sheet.rows[1]?.segmentId, "s2");
  });

  verify(results, "caudal normalizado m3/h", () => {
    const row = rowBySegmentId(createSheet(), "s1");

    assertClose(row.flowM3h, 1.5);
  });

  verify(results, "longitud fisica separada de longitud inicial", () => {
    const row = rowBySegmentId(createSheet(), "s1");

    assertClose(row.physicalLengthMeters, 4);
    assertClose(row.initialRouteLengthMeters, 12);
  });

  verify(results, "equivalencias de accesorios y transiciones", () => {
    const row = rowBySegmentId(createSheet(), "s1");

    assertClose(row.accessoryEquivalentLengthMeters, 3);
    assertClose(row.transitionEquivalentLengthMeters, 2.5);
    assertClose(row.finalCalculationLengthMeters, 17.5);
  });

  verify(results, "diametros calculado adoptado y efectivo", () => {
    const row = rowBySegmentId(
      createSheet({ adoptedDiameters: { s1: D32 } }),
      "s1",
    );

    assertEqual(row.calculatedDiameter?.id, D25.id);
    assertEqual(row.adoptedDiameter?.id, D32.id);
    assertEqual(row.effectiveDiameter?.id, D32.id);
  });

  verify(results, "pendiente no se convierte en cero", () => {
    const row = rowBySegmentId(
      createSheet({
        flowBySegmentId: { s1: null },
        initialRouteLengthBySegmentId: { s1: null },
      }),
      "s1",
    );

    assertEqual(row.flowM3h, null);
    assertEqual(row.initialRouteLengthMeters, null);
    assertEqual(row.status, "pending");
  });

  verify(results, "mismo input produce misma planilla", () => {
    const first = createSheet({ adoptedDiameters: { s1: D32 } });
    const second = createSheet({ adoptedDiameters: { s1: D32 } });

    assertEqual(JSON.stringify(first), JSON.stringify(second));
  });

  verify(results, "fixture parcial usa datos esperados", () => {
    const sheet = createTechnicalCalculationSheet({
      result: calculatePartialFixture(),
    });
    const row = rowBySegmentId(sheet, "A-B");

    assertClose(row.initialRouteLengthMeters, 10.75);
    assertClose(row.accessoryEquivalentLengthMeters, 10.97);
    assertClose(row.finalCalculationLengthMeters, 21.72);
    assertEqual(row.calculatedDiameter?.id, "sigas-32");
    assertEqual(row.effectiveDiameter?.id, "sigas-32");
  });

  return results;
}

function createSheet(params: {
  adoptedDiameters?: Record<string, PipeDiameterReference>;
  flowBySegmentId?: Record<string, number | null>;
  initialRouteLengthBySegmentId?: Record<string, number | null>;
} = {}) {
  return createTechnicalCalculationSheet({
    equipment: testEquipment(),
    result: technicalResult(params),
  });
}

function technicalResult(params: {
  adoptedDiameters?: Record<string, PipeDiameterReference>;
  flowBySegmentId?: Record<string, number | null>;
  initialRouteLengthBySegmentId?: Record<string, number | null>;
}): TechnicalCalculationResult {
  const s1Flow = recordValue(params.flowBySegmentId, "s1", 1.5);
  const s1InitialRouteLength = recordValue(
    params.initialRouteLengthBySegmentId,
    "s1",
    12,
  );
  const segments = [
    technicalSegment({
      downstreamApplianceIds: ["appliance-a", "appliance-b"],
      flow: s1Flow,
      fromNodeId: "meter",
      initialRouteLength: s1InitialRouteLength,
      segmentId: "s1",
      toNodeId: "node-a",
    }),
    technicalSegment({
      downstreamApplianceIds: ["appliance-b"],
      flow: 0.7,
      fromNodeId: "node-a",
      initialRouteLength: 8,
      segmentId: "s2",
      toNodeId: "appliance-b",
    }),
  ];
  const transitionAwareSegments = [
    sizingSegment({
      accessoryEquivalentLength: 3,
      calculatedDiameter: D25,
      effectiveDiameter: params.adoptedDiameters?.s1 ?? D25,
      flow: s1Flow,
      initialRouteLength: s1InitialRouteLength,
      segmentId: "s1",
      transitionEquivalentLength: 2.5,
    }),
    sizingSegment({
      accessoryEquivalentLength: 1,
      calculatedDiameter: D20,
      effectiveDiameter: params.adoptedDiameters?.s2 ?? D20,
      flow: 0.7,
      initialRouteLength: 8,
      segmentId: "s2",
      transitionEquivalentLength: 0,
    }),
  ];

  return {
    connectedApplianceIds: ["appliance-a", "appliance-b"],
    demandNormalizations: [],
    issues: [],
    networkSizing: {
      finalDiameterBySegmentId: {
        s1: D25,
        s2: D20,
      },
      issueCount: 0,
      issues: [],
      maxPassCount: 1,
      passCount: 1,
      pipeSystem: { id: "sigas", name: "SIGAS" },
      routeAccessoryResolutions: {},
      segments: transitionAwareSegments.map(
        (segment): TechnicalNetworkSizingSegmentResult => ({
          accumulatedFlow: segment.accumulatedFlow,
          accumulatedFlowUnit: segment.accumulatedFlowUnit,
          calculatedDiameter: segment.calculatedDiameter,
          explanation: null,
          governingRouteAccessoryEquivalentLengthMeters:
            segment.governingRouteAccessoryEquivalentLengthMeters,
          governingRouteId: segment.governingRouteId,
          governingRoutePhysicalLengthMeters:
            segment.governingRoutePhysicalLengthMeters,
          governingTerminalEquipmentId: null,
          internalDiameterMillimeters: segment.internalDiameterMillimeters,
          issues: [],
          requiredDiameter: segment.requiredDiameter,
          routeAccessoryResolutionId: segment.routeAccessoryResolutionId,
          segmentId: segment.segmentId,
          sizingLengthMeters: segment.transitionAwareSizingLengthMeters,
          sizingResult: segment.sizingResult,
          status: segment.status,
          tabulatedCapacityM3h: segment.tabulatedCapacityM3h,
          tabulatedLengthMeters: segment.tabulatedLengthMeters,
        }),
      ),
      status: "resolved",
      strategy: "monotonic_synchronous_escalation",
      trace: [],
    },
    nodeLabels: {
      "appliance-b": "B",
      meter: "M",
      "node-a": "A",
    },
    pipeSystem: { id: "sigas", name: "SIGAS" },
    professionalDiameterAdoption: params.adoptedDiameters
      ? ({
          decisions: Object.entries(params.adoptedDiameters).map(
            ([segmentId, diameter]) => ({
              decidedAt: 1,
              diameterId: diameter.id,
              origin: "user_adopted",
              segmentId,
            }),
          ),
          effectiveDiameterBySegmentId: {
            s1: params.adoptedDiameters.s1 ?? D25,
            s2: params.adoptedDiameters.s2 ?? D20,
          },
          evaluation: null,
          issueCount: 0,
          issues: [],
          pipeSystem: { id: "sigas", name: "SIGAS" },
          routeAccessoryResolutions: {},
          routeTransitionResolutions: {},
          segments: transitionAwareSegments.map(
            (segment): ProfessionalDiameterAdoptionSegmentResult => ({
              adoptedDiameter:
                params.adoptedDiameters?.[segment.segmentId] ?? null,
              availableDiameters: [D20, D25, D32],
              calculatedDiameter:
                segment.segmentId === "s1" ? D25 : D20,
              decision: params.adoptedDiameters?.[segment.segmentId]
                ? {
                    decidedAt: 1,
                    diameterId:
                      params.adoptedDiameters[segment.segmentId].id,
                    origin: "user_adopted",
                    segmentId: segment.segmentId,
                  }
                : null,
              effectiveDiameter: segment.finalDiameter,
              issues: [],
              reason: null,
              segmentId: segment.segmentId,
              status: params.adoptedDiameters?.[segment.segmentId]
                ? "validated"
                : "using_calculated",
              validationIssues: [],
              validationSegment: segment,
            }),
          ),
          status: "validated",
          transitions: [],
        } satisfies NonNullable<
          TechnicalCalculationResult["professionalDiameterAdoption"]
        >)
      : null,
    projectGas: null,
    rootNodeId: "meter",
    routeAccessoryResolutions: {},
    segments,
    status: "valid",
    technicalRoutes: [],
    totals: {
      accumulatedFlow: 2.2,
      accumulatedFlowUnit: "m3_h",
      applianceCount: 2,
      accessoryEquivalentLengthMeters: 4,
      calculationLengthMeters: 17.5,
      dimensionedSegmentCount: 2,
      pendingDimensioningSegmentCount: 0,
      physicalLengthMeters: 10,
      segmentCount: 2,
    },
    transitionAwareNetworkSizing: {
      additionalDiameterStepCost: params.adoptedDiameters ? 1 : 0,
      baselineDiameterBySegmentId: {
        s1: D25,
        s2: D20,
      },
      discardedStateCount: 0,
      evaluatedStateCount: 1,
      finalDiameterBySegmentId: {
        s1: params.adoptedDiameters?.s1 ?? D25,
        s2: params.adoptedDiameters?.s2 ?? D20,
      },
      issueCount: 0,
      issues: [],
      maxFrontierSize: 1,
      minimalityAudit: [],
      pipeSystem: { id: "sigas", name: "SIGAS" },
      routeAccessoryResolutions: {},
      routeTransitionResolutions: {},
      searchLimit: 1,
      segments: transitionAwareSegments,
      status: "resolved",
      strategy: "uniform_cost_minimum_above_baseline_with_transition_rebuild",
      theoreticalStateCount: 1,
      trace: [],
      transitions: [],
      variableSegmentIds: [],
    },
  };
}

function recordValue<T>(
  values: Record<string, T> | undefined,
  key: string,
  fallback: T,
) {
  return values && Object.prototype.hasOwnProperty.call(values, key)
    ? values[key]
    : fallback;
}

function technicalSegment(params: {
  downstreamApplianceIds: string[];
  flow: number | null;
  fromNodeId: string;
  initialRouteLength: number | null;
  segmentId: string;
  toNodeId: string;
}): TechnicalSegmentResult {
  return {
    accessories: [],
    accessoryEquivalentLengthMeters: null,
    accumulatedFlow: params.flow,
    accumulatedFlowUnit: params.flow === null ? null : "m3_h",
    calculatedDiameter: null,
    calculationLengthMeters: null,
    depth: params.segmentId === "s1" ? 0 : 1,
    dimensioningResolution: {
      explanation: "Dimensionado global disponible.",
      status: "resolved",
      value: {} as never,
    },
    downstreamApplianceIds: params.downstreamApplianceIds,
    drawingLength: 0,
    fromNodeId: params.fromNodeId,
    governingRoute: null,
    governingRoutePhysicalLengthMeters: params.initialRouteLength,
    governingRouteResolution: {
      explanation: "Recorrido global disponible.",
      status: "resolved",
      value: {} as never,
    },
    missingDemandEquipmentIds: [],
    parentSegmentId: null,
    physicalLengthMeters: params.segmentId === "s1" ? 4 : 6,
    routeSizingBasis: {
      governingRouteAccessoryEquivalentLengthMeters: null,
      governingRoutePhysicalLengthMeters: params.initialRouteLength,
      reasons: [],
      routeAccessoryResolutionId: `route-${params.segmentId}`,
      sizingLengthMeters: null,
      status: "resolved",
    },
    segmentId: params.segmentId,
    segmentPhysicalLengthMeters: params.segmentId === "s1" ? 4 : 6,
    terminalRouteIds: [],
    toNodeId: params.toNodeId,
    unresolvedDemandEquipmentIds: [],
  };
}

function sizingSegment(params: {
  accessoryEquivalentLength: number | null;
  calculatedDiameter: PipeDiameterReference;
  effectiveDiameter: PipeDiameterReference;
  flow: number | null;
  initialRouteLength: number | null;
  segmentId: string;
  transitionEquivalentLength: number | null;
}): TechnicalTransitionAwareNetworkSizingSegmentResult {
  const finalLength =
    params.initialRouteLength === null ||
    params.accessoryEquivalentLength === null ||
    params.transitionEquivalentLength === null
      ? null
      : params.initialRouteLength +
        params.accessoryEquivalentLength +
        params.transitionEquivalentLength;

  return {
    accumulatedFlow: params.flow,
    accumulatedFlowUnit: params.flow === null ? null : "m3_h",
    baselineDiameter: params.calculatedDiameter,
    calculatedDiameter: params.calculatedDiameter,
    explanation: null,
    finalDiameter: params.effectiveDiameter,
    governingRouteAccessoryEquivalentLengthMeters:
      params.accessoryEquivalentLength,
    governingRouteBranchTransitionEquivalentLengthMeters: 0,
    governingRouteCompoundTransitionEquivalentLengthMeters: 0,
    governingRouteId: `route-${params.segmentId}`,
    governingRoutePhysicalLengthMeters: params.initialRouteLength,
    governingRouteSimpleTransitionEquivalentLengthMeters:
      params.transitionEquivalentLength,
    governingRouteTransitionEquivalentLengthMeters:
      params.transitionEquivalentLength,
    governingTerminalEquipmentId: null,
    internalDiameterMillimeters:
      params.effectiveDiameter.internalDiameterMillimeters ?? null,
    issues: [],
    physicalRouteLengthMeters: params.initialRouteLength,
    requiredDiameter: params.calculatedDiameter,
    routeAccessoryResolutionId: `route-${params.segmentId}`,
    routeTransitionResolutionId: `route-${params.segmentId}`,
    segmentId: params.segmentId,
    sizingResult:
      finalLength === null || params.flow === null
        ? null
        : ({
            capacityM3h: 3,
            selectedDiameter: params.effectiveDiameter,
            tabulatedLengthMeters: Math.ceil(finalLength),
          } as never),
    status: finalLength === null || params.flow === null ? "unresolved" : "resolved",
    tabulatedCapacityM3h: finalLength === null ? null : 3,
    tabulatedLengthMeters: finalLength === null ? null : Math.ceil(finalLength),
    transitionAwareSizingLengthMeters: finalLength,
  };
}

function testEquipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: { x: 0, y: 0 },
      id: "appliance-a",
      name: "Artefacto A",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "other",
    },
    {
      connectionPoint: { x: 0, y: 0 },
      id: "appliance-b",
      name: "Artefacto B",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "other",
    },
  ];
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
    label: `DE ${externalDiameterMillimeters}`,
  };
}

function rowBySegmentId(
  sheet: TechnicalCalculationSheet,
  segmentId: string,
) {
  const row = sheet.rows.find((item) => item.segmentId === segmentId);

  if (!row) {
    throw new Error(`No se encontro la fila ${segmentId}.`);
  }

  return row;
}

function verify(
  results: TechnicalCalculationSheetVerificationResult[],
  name: string,
  run: () => void,
) {
  run();
  results.push({ name, status: "passed" });
}

function assertEqual<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Esperado ${String(expected)}, recibido ${String(actual)}.`);
  }
}

function assertClose(actual: number | null, expected: number) {
  if (actual === null || Math.abs(actual - expected) > EPSILON) {
    throw new Error(`Esperado ${expected}, recibido ${String(actual)}.`);
  }
}

if (process.env.NODE_ENV === "test") {
  console.log(JSON.stringify(runTechnicalCalculationSheetVerifications(), null, 2));
}
