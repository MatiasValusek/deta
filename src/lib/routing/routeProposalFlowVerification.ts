import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { createTechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import type { Point2D } from "@/lib/geometry/types";
import {
  generateAutomaticRouteProposal,
  generateLegacyAutomaticRouteProposal,
  type GenerateAutomaticRouteProposalInput,
} from "@/lib/routing/autoProposal";
import {
  routeProposalAcceptanceBlockReason,
  routeProposalCanBeAccepted,
} from "@/lib/routing/proposalAcceptance";
import {
  applianceNodesAreTerminal,
  findRouteNodeByEquipment,
  findTerminalStartNodeByEquipment,
  getConnectedApplianceEquipmentIds,
  hasRoutePath,
  isEquipmentTerminalSegment,
  resolveRouteNodePosition,
  routeEquipmentNodeId,
  routeEquipmentTerminalSegmentId,
  routeEquipmentTerminalStartNodeId,
} from "@/lib/routing/network";
import { applyConfirmedEquipmentTerminalConnection } from "@/lib/routing/terminalConnection";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  createReviewCalculationReadiness,
  createRouteReviewState,
} from "@/lib/workbench/reviewStage";
import {
  countStandardTechnicalReviewGeometryPendingItems,
  createStandardTechnicalAxonometricView,
  createStandardTechnicalSectionView,
} from "@/lib/sections/standardTechnicalViews";

export type RouteProposalFlowVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const PLAN_BASE_ID = "plan:route-flow";
const SCALE_METERS_PER_SOURCE_UNIT = 1;

export function runRouteProposalFlowVerifications() {
  const results: RouteProposalFlowVerificationResult[] = [];

  verify(
    results,
    "10.8C1 propuesta valida 3/3 habilita aceptar y confirma routeNetwork",
    () => {
      const fixture = routeProposalFlowFixture();

      assertEqual(
        getConnectedApplianceEquipmentIds(
          fixture.baseNetwork,
          fixture.equipment,
        ).size,
        0,
      );
      assertEqual(fixture.proposal.reachedEquipmentIds.length, 3);
      assertEqual(fixture.proposal.unreachedEquipmentIds.length, 0);
      assertEqual(routeProposalCanBeAccepted(fixture.proposal, 3), true);
      assertEqual(
        routeProposalCanBeAccepted(
          proposalWithStaleAcceptFlag(fixture.proposal),
          3,
        ),
        true,
      );
      assertEqual(
        getConnectedApplianceEquipmentIds(
          fixture.acceptedNetwork,
          fixture.equipment,
        ).size,
        3,
      );
      assertEqual(applianceNodesAreTerminal(fixture.acceptedNetwork), true);
      assertProposalTargetsTerminalStarts(fixture);
    },
  );

  verify(
    results,
    "10.8 propuesta 4/4 con terminales fisicos habilita aceptar y Revisar",
    () => {
      const fixture = routeProposalPhysicalTerminalFixture();
      const reviewState = createRouteReviewState({
        equipment: fixture.equipment,
        hasActiveProposal: false,
        hasRouteCycle: false,
        network: fixture.acceptedNetwork,
        routeRestrictionCount: 0,
      });

      assertEqual(
        getConnectedApplianceEquipmentIds(
          fixture.baseNetwork,
          fixture.equipment,
        ).size,
        0,
      );
      assertEqual(
        fixture.baseNetwork.segments.every((segment) =>
          isEquipmentTerminalSegment(segment),
        ),
        true,
      );
      assertEqual(fixture.proposal.reachedEquipmentIds.length, 4);
      assertEqual(fixture.proposal.unreachedEquipmentIds.length, 0);
      assertEqual(fixture.proposal.validation.restrictionCount, 0);
      assertEqual(fixture.proposal.validation.canAccept, true);
      assertEqual(routeProposalCanBeAccepted(fixture.proposal, 4), true);
      assertEqual(routeProposalAcceptanceBlockReason(fixture.proposal, 4), null);
      assertEqual(
        getConnectedApplianceEquipmentIds(
          fixture.acceptedNetwork,
          fixture.equipment,
        ).size,
        4,
      );
      assertEqual(applianceNodesAreTerminal(fixture.acceptedNetwork), true);
      assertEqual(reviewState.canOpenReview, true);
      assertEqual(reviewState.connectedApplianceCount, 4);
      assertEqual(reviewState.totalApplianceCount, 4);
      assertProposalTargetsTerminalStarts(fixture);
      assertPhysicalTerminalProposalCanContinueToCalculate(
        fixture,
        reviewState,
      );
    },
  );

  verify(
    results,
    "01B seleccion inteligente mejora el mismo caso de tres artefactos",
    () => {
      const comparison = createThreeApplianceRouteComparison();

      assertEqual(comparison.legacy.status, "ready");
      assertEqual(comparison.intelligent.status, "ready");
      assertEqual(comparison.legacy.restrictionCount, 0);
      assertEqual(comparison.intelligent.restrictionCount, 0);
      assert(
        compareComparisonMetrics(
          comparison.intelligent,
          comparison.legacy,
        ) < 0,
        "La seleccion inteligente no mejoro el caso de tres artefactos.",
      );
    },
  );

  verify(
    results,
    "01B desempata redes equivalentes por derivaciones mas simples",
    () => {
      const input = simpleRouteInput([
        [7, 5],
        [2, 7],
        [4, 9],
        [4, 3],
      ]);
      const legacy = generateLegacyAutomaticRouteProposal(input);
      const intelligent = generateAutomaticRouteProposal(input);

      assertEqual(intelligent.status, "ready");
      assertClose(intelligent.lengthSource, legacy.lengthSource);
      assertEqual(intelligent.turnCount, legacy.turnCount);
      assert(
        intelligent.derivationCount < legacy.derivationCount,
        "No se simplificaron las derivaciones equivalentes.",
      );
    },
  );

  verify(
    results,
    "01B prioriza una alternativa admisible con restricciones duras",
    () => {
      const input = simpleRouteInput([
        [8, 2],
        [1, 8],
        [7, 8],
      ]);
      input.restrictions = [
        {
          from: point(4, -1),
          id: "fixture-hard-structure",
          kind: "segment",
          to: point(4, 5),
        },
      ];
      const legacy = generateLegacyAutomaticRouteProposal(input);
      const intelligent = generateAutomaticRouteProposal(input);

      assertEqual(legacy.status, "partial");
      assertEqual(intelligent.status, "ready");
      assertEqual(intelligent.validation.restrictionCount, 0);
      assertEqual(intelligent.validation.hasCrossingsWithoutNode, false);
    },
  );

  return results;
}

export type RouteComparisonMetrics = {
  derivations: number;
  interferences: number;
  lengthSource: number;
  milliseconds: number;
  restrictionCount: number;
  status: "ready" | "partial" | "invalid";
  turns: number;
};

export function createThreeApplianceRouteComparison() {
  const input = createThreeApplianceRouteInput();

  generateLegacyAutomaticRouteProposal(input);
  generateAutomaticRouteProposal(input);

  return {
    intelligent: measureProposal(
      () => generateAutomaticRouteProposal(input),
      5,
    ),
    legacy: measureProposal(
      () => generateLegacyAutomaticRouteProposal(input),
      5,
    ),
  };
}

type RouteProposalFlowFixture = ReturnType<typeof routeProposalFlowFixture>;

function routeProposalFlowFixture() {
  const input = createThreeApplianceRouteInput();
  const equipment = input.equipment;
  const baseNetwork = input.baseNetwork as ManualRouteNetwork;
  const proposal = generateAutomaticRouteProposal(input);
  const acceptedNetwork: ManualRouteNetwork = {
    nodes: proposal.nodes,
    segments: proposal.segments,
  };

  return {
    acceptedNetwork,
    baseNetwork,
    equipment,
    proposal,
  };
}

function createThreeApplianceRouteInput(): GenerateAutomaticRouteProposalInput {
  const equipment = fixtureEquipment();

  return {
    baseNetwork: terminalOnlyNetwork(equipment),
    bounds: {
      maxX: 7,
      maxY: 5,
      minX: -1,
      minY: -1,
    },
    equipment,
    fingerprint: "10.8C-route-flow",
    marginMeters: 0,
    minSegmentLengthSource: EPSILON,
    planBaseId: PLAN_BASE_ID,
    restrictions: [],
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  };
}

function simpleRouteInput(
  applianceCoordinates: Array<[number, number]>,
): GenerateAutomaticRouteProposalInput {
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: point(0, 0),
      id: "meter",
      name: "Medidor",
      planBaseId: PLAN_BASE_ID,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    ...applianceCoordinates.map(([x, y], index) => ({
      connectionPoint: point(x, y),
      demandUnit: "kcal_h" as const,
      demandValue: 2500,
      id: `fixture-appliance-${index}`,
      name: `Artefacto ${index + 1}`,
      planBaseId: PLAN_BASE_ID,
      role: "appliance" as const,
      source: "manual" as const,
      type: "stove" as const,
    })),
  ];

  return {
    bounds: { maxX: 12, maxY: 11, minX: -1, minY: -1 },
    equipment,
    fingerprint: `01B-simple-${applianceCoordinates.join("-")}`,
    marginMeters: 0,
    minSegmentLengthSource: EPSILON,
    planBaseId: PLAN_BASE_ID,
    restrictions: [],
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  };
}

function routeProposalPhysicalTerminalFixture() {
  const equipment = fixtureEquipmentWithFourAppliances();
  const baseNetwork = physicalTerminalNetwork(equipment);
  const proposal = generateAutomaticRouteProposal({
    baseNetwork,
    bounds: {
      maxX: 7,
      maxY: 5,
      minX: -1,
      minY: -1,
    },
    equipment,
    fingerprint: "10.8-route-flow-physical-4",
    marginMeters: 0,
    minSegmentLengthSource: EPSILON,
    planBaseId: PLAN_BASE_ID,
    restrictions: [],
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });
  const acceptedNetwork: ManualRouteNetwork = {
    nodes: proposal.nodes,
    segments: proposal.segments,
  };

  return {
    acceptedNetwork,
    baseNetwork,
    equipment,
    proposal,
  };
}

function proposalWithStaleAcceptFlag(
  proposal: ReturnType<typeof generateAutomaticRouteProposal>,
) {
  return {
    ...proposal,
    validation: {
      ...proposal.validation,
      allConnected: false,
      canAccept: false,
    },
  };
}

function measureProposal(
  createProposal: () => ReturnType<typeof generateAutomaticRouteProposal>,
  repetitions = 1,
): RouteComparisonMetrics {
  const startedAt = performance.now();
  let proposal = createProposal();

  for (let index = 1; index < repetitions; index += 1) {
    proposal = createProposal();
  }

  return {
    derivations: proposal.derivationCount,
    interferences: proposal.architecturalWarnings.reduce(
      (total, warning) => total + warning.featureIds.length,
      0,
    ),
    lengthSource: proposal.lengthSource,
    milliseconds: (performance.now() - startedAt) / repetitions,
    restrictionCount: proposal.validation.restrictionCount,
    status: proposal.status,
    turns: proposal.turnCount,
  };
}

function compareComparisonMetrics(
  first: RouteComparisonMetrics,
  second: RouteComparisonMetrics,
) {
  return (
    Number(first.status !== "ready") - Number(second.status !== "ready") ||
    first.restrictionCount - second.restrictionCount ||
    first.lengthSource - second.lengthSource ||
    first.turns - second.turns ||
    first.derivations - second.derivations ||
    first.interferences - second.interferences
  );
}

function fixtureEquipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: point(0, 0),
      id: "meter",
      name: "M",
      planBaseId: PLAN_BASE_ID,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    appliance("stove-1", "Cocina", 6, 1),
    appliance("heater-1", "Calefactor", 6, 3),
    appliance("boiler-1", "Caldera", 3, 4),
  ];
}

function fixtureEquipmentWithFourAppliances(): WorkbenchEquipment[] {
  return [
    ...fixtureEquipment(),
    appliance("oven-1", "Horno", 2, 2),
  ];
}

function appliance(
  id: string,
  name: string,
  x: number,
  y: number,
): WorkbenchEquipment {
  return {
    bodyPoint: point(x, y + 0.3, 1),
    connectionPoint: point(x, y, 1),
    demandUnit: "kcal_h",
    demandValue: 2500,
    id,
    name,
    planBaseId: PLAN_BASE_ID,
    role: "appliance",
    source: "manual",
    terminalConfig: {
      connectionHeightMeters: 1,
      heightStatus: "confirmed",
      lateralOffsetMeters: 1,
      outletSide: "left",
      requiresShutoffValve: true,
      terminalProfile: "generic_terminal",
      verticalDropMeters: 0,
    },
    type: "stove",
    wallAnchor: {
      distanceSource: 0.3,
      normal: { x: 0, y: 1 },
      orientationRadians: 0,
      pageNumber: null,
      referenceId: `wall:${id}`,
      referenceKind: "reference_wall",
      source: "dxf",
      status: "anchored",
      wallPoint: point(x, y, 1),
    },
  };
}

function terminalOnlyNetwork(equipment: WorkbenchEquipment[]): ManualRouteNetwork {
  const nodes: ManualRouteNetwork["nodes"] = [
    {
      equipmentId: "meter",
      id: routeEquipmentNodeId(PLAN_BASE_ID, "meter"),
      kind: "supply",
      origin: "manual",
    },
  ];
  const segments: ManualRouteNetwork["segments"] = [];

  for (const item of equipment.filter((candidate) => candidate.role === "appliance")) {
    const terminalStartNodeId = routeEquipmentTerminalStartNodeId(
      PLAN_BASE_ID,
      item.id,
    );
    const applianceNodeId = routeEquipmentNodeId(PLAN_BASE_ID, item.id);

    nodes.push(
      {
        id: terminalStartNodeId,
        kind: "route",
        origin: "manual",
        position: terminalStartPoint(item),
      },
      {
        equipmentId: item.id,
        id: applianceNodeId,
        kind: "appliance",
        origin: "manual",
      },
    );
    segments.push({
      fromNodeId: terminalStartNodeId,
      id: routeEquipmentTerminalSegmentId(PLAN_BASE_ID, item.id),
      origin: "manual",
      toNodeId: applianceNodeId,
    });
  }

  return { nodes, segments };
}

function physicalTerminalNetwork(equipment: WorkbenchEquipment[]): ManualRouteNetwork {
  let network = terminalOnlyNetwork(equipment);

  for (const item of equipment.filter((candidate) => candidate.role === "appliance")) {
    const result = applyConfirmedEquipmentTerminalConnection({
      equipment,
      equipmentId: item.id,
      network,
      scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
    });

    assert(result.ok, result.ok ? "" : result.message);
    network = result.network;
  }

  return network;
}

function terminalStartPoint(equipment: WorkbenchEquipment): Point2D {
  const wallPoint = equipment.wallAnchor?.wallPoint ?? equipment.connectionPoint;
  const orientation = equipment.wallAnchor?.orientationRadians ?? 0;
  const config = equipment.terminalConfig;
  const sideSign =
    config?.outletSide === "left" ? -1 : config?.outletSide === "right" ? 1 : 0;
  const offsetSource =
    config && SCALE_METERS_PER_SOURCE_UNIT > 0
      ? config.lateralOffsetMeters / SCALE_METERS_PER_SOURCE_UNIT
      : 0;

  return point(
    wallPoint.x + Math.cos(orientation) * sideSign * offsetSource,
    wallPoint.y + Math.sin(orientation) * sideSign * offsetSource,
    0,
  );
}

function assertProposalTargetsTerminalStarts(
  fixture: RouteProposalFlowFixture,
) {
  const supplyNode = findRouteNodeByEquipment(
    fixture.acceptedNetwork,
    "meter",
  );

  assert(supplyNode, "Falta nodo de alimentacion.");

  for (const appliance of fixture.equipment.filter(
    (item) => item.role === "appliance",
  )) {
    const equipmentId = appliance.id;
    const terminalStart = findTerminalStartNodeByEquipment(
      fixture.acceptedNetwork,
      equipmentId,
    );
    const applianceNode = findRouteNodeByEquipment(
      fixture.acceptedNetwork,
      equipmentId,
    );

    assert(terminalStart, `Falta inicio terminal para ${equipmentId}.`);
    assert(applianceNode, `Falta nodo artefacto para ${equipmentId}.`);
    assertEqual(
      hasRoutePath(fixture.acceptedNetwork, supplyNode.id, terminalStart.id),
      true,
    );

    const terminalPoint = resolveRouteNodePosition(
      terminalStart,
      equipmentIndex(fixture.equipment),
    );
    assertPoint(
      terminalPoint,
      terminalStartPoint(appliance),
    );
    assertEqual(
      fixture.acceptedNetwork.segments.some(
        (segment) =>
          segment.id !== routeEquipmentTerminalSegmentId(PLAN_BASE_ID, equipmentId) &&
          (segment.fromNodeId === applianceNode.id ||
            segment.toNodeId === applianceNode.id),
      ),
      false,
    );
  }
}

function assertPhysicalTerminalProposalCanContinueToCalculate(
  fixture: RouteProposalFlowFixture,
  routeReviewState: ReturnType<typeof createRouteReviewState>,
) {
  const result = calculateTechnicalTree({
    equipment: fixture.equipment,
    minSegmentLengthSource: EPSILON,
    network: fixture.acceptedNetwork,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });

  assertEqual(result.status, "valid");

  const inventory = createTechnicalPhysicalAccessoryInventory({ result });
  const equivalentVerificationBySegmentId =
    createTechnicalEquivalentAccessoryVerification({
      inventory,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      result,
    });
  const adoptedDiameterValidation = createTechnicalAdoptedDiameterValidation({
    equivalentVerificationBySegmentId,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    result,
  });
  const sectionAA = createStandardTechnicalSectionView({
    adoptedDiameterValidation,
    axis: "x",
    equipment: fixture.equipment,
    id: "section-aa",
    inventory,
    network: fixture.acceptedNetwork,
    result,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
    title: "Corte A-A",
  });
  const sectionBB = createStandardTechnicalSectionView({
    adoptedDiameterValidation,
    axis: "y",
    equipment: fixture.equipment,
    id: "section-bb",
    inventory,
    network: fixture.acceptedNetwork,
    result,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
    title: "Corte B-B",
  });
  const axonometricView = createStandardTechnicalAxonometricView({
    adoptedDiameterValidation,
    equipment: fixture.equipment,
    inventory,
    network: fixture.acceptedNetwork,
    result,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });
  const pendingCount = countStandardTechnicalReviewGeometryPendingItems({
    axonometricView,
    sectionViews: [sectionAA, sectionBB],
  });
  const readiness = createReviewCalculationReadiness({
    routeReviewState,
    technicalGeometryPendingCount: pendingCount,
  });

  assertEqual(pendingCount, 0);
  assertEqual(readiness.canContinueToCalculate, true);
  assertEqual(readiness.observationCount, 0);
}

function equipmentIndex(equipment: WorkbenchEquipment[]) {
  return new Map(equipment.map((item) => [item.id, item]));
}

function point(x: number, y: number, z?: number): Point2D {
  return z === undefined ? { x, y } : { x, y, z };
}

function verify(
  results: RouteProposalFlowVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertPoint(actual: Point2D | null | undefined, expected: Point2D) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);
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
  console.log(JSON.stringify(runRouteProposalFlowVerifications(), null, 2));
}
