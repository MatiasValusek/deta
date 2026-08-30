import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { generateAutomaticRouteProposal } from "@/lib/routing/autoProposal";
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
import { createRouteReviewState } from "@/lib/workbench/reviewStage";

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
    },
  );

  return results;
}

type RouteProposalFlowFixture = ReturnType<typeof routeProposalFlowFixture>;

function routeProposalFlowFixture() {
  const equipment = fixtureEquipment();
  const baseNetwork = terminalOnlyNetwork(equipment);
  const proposal = generateAutomaticRouteProposal({
    baseNetwork,
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
