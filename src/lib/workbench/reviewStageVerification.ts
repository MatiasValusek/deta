import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { generateAutomaticRouteProposal } from "@/lib/routing/autoProposal";
import {
  findRouteNodeByEquipment,
  findTerminalStartNodeByEquipment,
  getConnectedApplianceEquipmentIds,
  getRouteNodeDegree,
  hasRoutePath,
  resolveRouteNodePosition,
  routeEquipmentNodeId,
  routeEquipmentTerminalSegmentId,
  routeEquipmentTerminalStartNodeId,
} from "@/lib/routing/network";
import {
  movePhysicalRouteNode,
  type PhysicalRouteEditResult,
} from "@/lib/routing/physicalRouteEditing";
import { routeProposalCanBeAccepted } from "@/lib/routing/proposalAcceptance";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  applySectionRouteHeightEdit,
  sectionRouteHeightTargetKey,
} from "@/lib/sections/routeHeightEditing";
import { createSectionRouteProjection } from "@/lib/sections/routeProjection";
import type { SectionRouteProjectionLink } from "@/lib/sections/routeProjection";
import { createRouteReviewState } from "@/lib/workbench/reviewStage";

export type ReviewStageVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const PLAN_BASE_ID = "plan:review";
const REVIEW_TRANSITION_PLAN_BASE_ID = "plan:review-transition";
const REVIEW_TRANSITION_SCALE_METERS_PER_SOURCE_UNIT = 1;
const SECTION_SCALE_METERS_PER_SOURCE_UNIT = 0.1;
const UPDATED_XY: Point2D = { x: 2.5, y: 0.4 };
const UPDATED_Z_METERS = 1.35;

export function runReviewStageVerifications() {
  const results: ReviewStageVerificationResult[] = [];

  verify(
    results,
    "10.8D Planta XY y Corte Z editan la misma routeNetwork sin duplicados",
    () => {
      const before = reviewStageFixture();
      const xyEdit = movePhysicalRouteNode({
        equipment: before.equipment,
        network: before.network,
        nodeId: "J",
        point: UPDATED_XY,
        tolerance: EPSILON,
      });

      assertEditOk(xyEdit);

      const afterXy = {
        equipment: before.equipment,
        network: xyEdit.network,
      };
      const projection = createReviewProjection(afterXy);
      const zTarget = projection.segments
        .flatMap((segment) => segment.points)
        .find(
          (point) => sectionRouteHeightTargetKey(point.heightTarget) === "node:J",
        )?.heightTarget;

      assert(zTarget, "Falta target de altura de Corte para el nodo J.");

      const zEdit = applySectionRouteHeightEdit({
        equipment: afterXy.equipment,
        heightMeters: UPDATED_Z_METERS,
        network: afterXy.network,
        target: zTarget,
      });

      assert(zEdit.ok, zEdit.ok ? "" : zEdit.message);

      const editedNode =
        zEdit.network.nodes.find((node) => node.id === "J") ?? null;
      const editedPoint = editedNode
        ? resolveRouteNodePosition(editedNode, equipmentIndex(zEdit.equipment))
        : null;

      assertPoint(editedPoint, {
        x: UPDATED_XY.x,
        y: UPDATED_XY.y,
        z: UPDATED_Z_METERS,
      });
      assertEqual(zEdit.network.nodes.length, before.network.nodes.length);
      assertEqual(zEdit.network.segments.length, before.network.segments.length);
      assertEqual(zEdit.equipment, before.equipment);
      assertSingleVisibleInstallation(zEdit.network, zEdit.equipment);
      assertProjectedEquipmentWithoutDuplicates(
        createReviewProjection({
          equipment: zEdit.equipment,
          network: zEdit.network,
        }),
      );
    },
  );

  verify(
    results,
    "10.8D propuesta 3/3 aceptada habilita Revisar con routeNetwork confirmada",
    () => {
      const fixture = reviewTransitionFixture();
      const acceptedNetwork = acceptReviewTransitionProposal(fixture.proposal);
      const reviewState = createRouteReviewState({
        equipment: fixture.equipment,
        hasActiveProposal: false,
        hasRouteCycle: false,
        network: acceptedNetwork,
        routeRestrictionCount: 0,
      });

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
      assertEqual(acceptedNetwork.nodes, fixture.proposal.nodes);
      assertEqual(acceptedNetwork.segments, fixture.proposal.segments);
      assertEqual(reviewState.canOpenReview, true);
      assertEqual(reviewState.connectedApplianceCount, 3);
      assertEqual(reviewState.totalApplianceCount, 3);
      assertEqual(
        getConnectedApplianceEquipmentIds(acceptedNetwork, fixture.equipment).size,
        3,
      );
      assertTransitionProposalTargetsTerminalStarts(fixture, acceptedNetwork);
    },
  );

  verify(
    results,
    "10.8D propuesta 3/3 sin aceptar mantiene Revisar bloqueado",
    () => {
      const fixture = reviewTransitionFixture();
      const pendingReviewState = createRouteReviewState({
        equipment: fixture.equipment,
        hasActiveProposal: true,
        hasRouteCycle: false,
        network: fixture.baseNetwork,
        routeRestrictionCount: 0,
      });
      const proposalStillActiveState = createRouteReviewState({
        equipment: fixture.equipment,
        hasActiveProposal: true,
        hasRouteCycle: false,
        network: acceptReviewTransitionProposal(fixture.proposal),
        routeRestrictionCount: 0,
      });

      assertEqual(routeProposalCanBeAccepted(fixture.proposal, 3), true);
      assertEqual(pendingReviewState.canOpenReview, false);
      assertEqual(pendingReviewState.connectedApplianceCount, 0);
      assertEqual(proposalStillActiveState.canOpenReview, false);
      assertEqual(proposalStillActiveState.connectedApplianceCount, 3);
    },
  );

  return results;
}

type ReviewStageFixture = {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
};

type ReviewTransitionFixture = ReturnType<typeof reviewTransitionFixture>;

function reviewStageFixture(): ReviewStageFixture {
  return {
    equipment: fixtureEquipment(),
    network: fixtureNetwork(),
  };
}

function reviewTransitionFixture() {
  const equipment = reviewTransitionEquipment();
  const baseNetwork = reviewTransitionTerminalOnlyNetwork(equipment);
  const proposal = generateAutomaticRouteProposal({
    baseNetwork,
    bounds: {
      maxX: 7,
      maxY: 5,
      minX: -1,
      minY: -1,
    },
    equipment,
    fingerprint: "10.8D-review-transition",
    marginMeters: 0,
    minSegmentLengthSource: EPSILON,
    planBaseId: REVIEW_TRANSITION_PLAN_BASE_ID,
    restrictions: [],
    scaleMetersPerSourceUnit: REVIEW_TRANSITION_SCALE_METERS_PER_SOURCE_UNIT,
  });

  return {
    baseNetwork,
    equipment,
    proposal,
  };
}

function acceptReviewTransitionProposal(
  proposal: ReturnType<typeof generateAutomaticRouteProposal>,
): ManualRouteNetwork {
  return {
    nodes: proposal.nodes,
    segments: proposal.segments,
  };
}

function createReviewProjection(fixture: ReviewStageFixture) {
  return createSectionRouteProjection({
    equipment: fixture.equipment,
    link: sectionProjectionLink(),
    network: fixture.network,
    sectionScaleMetersPerSourceUnit: SECTION_SCALE_METERS_PER_SOURCE_UNIT,
    toleranceSource: EPSILON,
  });
}

function fixtureEquipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: point(0, 0, 0),
      id: "meter",
      name: "M",
      planBaseId: PLAN_BASE_ID,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      bodyPoint: point(6, 1.35, 1),
      connectionPoint: point(6, 1, 1),
      demandUnit: "kcal_h",
      demandValue: 2500,
      id: "stove",
      name: "Cocina",
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
        distanceSource: 0.35,
        normal: { x: 0, y: 1 },
        orientationRadians: 0,
        pageNumber: null,
        referenceId: "wall:review",
        referenceKind: "reference_wall",
        source: "dxf",
        status: "anchored",
        wallPoint: point(6, 1, 1),
      },
    },
  ];
}

function reviewTransitionEquipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: point(0, 0),
      id: "meter",
      name: "M",
      planBaseId: REVIEW_TRANSITION_PLAN_BASE_ID,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    reviewTransitionAppliance("stove-1", "Cocina", 6, 1),
    reviewTransitionAppliance("heater-1", "Calefactor", 6, 3),
    reviewTransitionAppliance("boiler-1", "Caldera", 3, 4),
  ];
}

function reviewTransitionAppliance(
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
    planBaseId: REVIEW_TRANSITION_PLAN_BASE_ID,
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

function reviewTransitionTerminalOnlyNetwork(
  equipment: WorkbenchEquipment[],
): ManualRouteNetwork {
  const nodes: ManualRouteNetwork["nodes"] = [
    {
      equipmentId: "meter",
      id: routeEquipmentNodeId(REVIEW_TRANSITION_PLAN_BASE_ID, "meter"),
      kind: "supply",
      origin: "manual",
    },
  ];
  const segments: ManualRouteNetwork["segments"] = [];

  for (const item of equipment.filter((candidate) => candidate.role === "appliance")) {
    const terminalStartNodeId = routeEquipmentTerminalStartNodeId(
      REVIEW_TRANSITION_PLAN_BASE_ID,
      item.id,
    );
    const applianceNodeId = routeEquipmentNodeId(
      REVIEW_TRANSITION_PLAN_BASE_ID,
      item.id,
    );

    nodes.push(
      {
        id: terminalStartNodeId,
        kind: "route",
        origin: "manual",
        position: reviewTransitionTerminalStartPoint(item),
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
      id: routeEquipmentTerminalSegmentId(
        REVIEW_TRANSITION_PLAN_BASE_ID,
        item.id,
      ),
      origin: "manual",
      toNodeId: applianceNodeId,
    });
  }

  return { nodes, segments };
}

function reviewTransitionTerminalStartPoint(
  equipment: WorkbenchEquipment,
): Point2D {
  const wallPoint = equipment.wallAnchor?.wallPoint ?? equipment.connectionPoint;
  const orientation = equipment.wallAnchor?.orientationRadians ?? 0;
  const config = equipment.terminalConfig;
  const sideSign =
    config?.outletSide === "left" ? -1 : config?.outletSide === "right" ? 1 : 0;
  const offsetSource =
    config && REVIEW_TRANSITION_SCALE_METERS_PER_SOURCE_UNIT > 0
      ? config.lateralOffsetMeters /
        REVIEW_TRANSITION_SCALE_METERS_PER_SOURCE_UNIT
      : 0;

  return point(
    wallPoint.x + Math.cos(orientation) * sideSign * offsetSource,
    wallPoint.y + Math.sin(orientation) * sideSign * offsetSource,
    0,
  );
}

function fixtureNetwork(): ManualRouteNetwork {
  const terminalStartId = routeEquipmentTerminalStartNodeId(
    PLAN_BASE_ID,
    "stove",
  );

  return {
    nodes: [
      {
        equipmentId: "meter",
        id: "M",
        kind: "supply",
        origin: "manual",
      },
      {
        id: "J",
        kind: "route",
        origin: "manual",
        position: point(2, 0, 0),
      },
      {
        id: terminalStartId,
        kind: "route",
        origin: "manual",
        position: point(5, 1, 0),
      },
      {
        equipmentId: "stove",
        id: "A",
        kind: "appliance",
        origin: "manual",
      },
    ],
    segments: [
      {
        fromNodeId: "M",
        id: "M-J",
        origin: "manual",
        toNodeId: "J",
      },
      {
        fromNodeId: "J",
        id: "J-T",
        origin: "manual",
        toNodeId: terminalStartId,
        vertices: [point(5, 0, 0)],
      },
      {
        fromNodeId: terminalStartId,
        id: routeEquipmentTerminalSegmentId(PLAN_BASE_ID, "stove"),
        origin: "manual",
        toNodeId: "A",
      },
    ],
  };
}

function assertSingleVisibleInstallation(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  assertEqual(
    [...getConnectedApplianceEquipmentIds(network, equipment)].join(","),
    "stove",
  );
  assertEqual(getRouteNodeDegree(network, "A"), 1);
  assertEqual(Boolean(findTerminalStartNodeByEquipment(network, "stove")), true);
  assertEqual(
    network.nodes.filter((node) => node.equipmentId === "stove").length,
    1,
  );
  assertEqual(
    network.segments.filter(
      (segment) =>
        segment.id === routeEquipmentTerminalSegmentId(PLAN_BASE_ID, "stove"),
    ).length,
    1,
  );
}

function assertTransitionProposalTargetsTerminalStarts(
  fixture: ReviewTransitionFixture,
  network: ManualRouteNetwork,
) {
  const supplyNode = findRouteNodeByEquipment(network, "meter");

  assert(supplyNode, "Falta nodo de alimentacion.");

  for (const equipmentId of ["stove-1", "heater-1", "boiler-1"]) {
    const terminalStart = findTerminalStartNodeByEquipment(
      network,
      equipmentId,
    );
    const applianceNode = findRouteNodeByEquipment(network, equipmentId);

    assert(terminalStart, `Falta inicio terminal para ${equipmentId}.`);
    assert(applianceNode, `Falta nodo artefacto para ${equipmentId}.`);
    assertEqual(hasRoutePath(network, supplyNode.id, terminalStart.id), true);
    assertPoint(
      resolveRouteNodePosition(terminalStart, equipmentIndex(fixture.equipment)),
      reviewTransitionTerminalStartPoint(
        reviewTransitionEquipmentById(fixture, equipmentId),
      ),
    );
    assertEqual(
      network.segments.some(
        (segment) =>
          segment.id !==
            routeEquipmentTerminalSegmentId(
              REVIEW_TRANSITION_PLAN_BASE_ID,
              equipmentId,
            ) &&
          (segment.fromNodeId === applianceNode.id ||
            segment.toNodeId === applianceNode.id),
      ),
      false,
    );
    assertEqual(
      network.nodes.filter((node) => node.equipmentId === equipmentId).length,
      1,
    );
    assertEqual(
      network.segments.filter(
        (segment) =>
          segment.id ===
          routeEquipmentTerminalSegmentId(
            REVIEW_TRANSITION_PLAN_BASE_ID,
            equipmentId,
          ),
      ).length,
      1,
    );
  }
}

function assertProjectedEquipmentWithoutDuplicates(
  projection: ReturnType<typeof createReviewProjection>,
) {
  const equipmentIds = projection.equipment.map((item) => item.equipmentId);
  const nodeIds = projection.equipment.map((item) => item.nodeId);

  assertEqual(projection.segments.length >= 2, true);
  assertEqual(equipmentIds.includes("meter"), true);
  assertEqual(equipmentIds.includes("stove"), true);
  assertEqual(new Set(equipmentIds).size, equipmentIds.length);
  assertEqual(new Set(nodeIds).size, nodeIds.length);
}

function sectionProjectionLink(): SectionRouteProjectionLink {
  return {
    id: "section-link-review",
    planEnd: { x: 7, y: 0 },
    planStart: { x: 0, y: 0 },
    registration: {
      positiveZSide: "left",
      referenceElevationMeters: 0,
      sectionEnd: { x: 170, y: 200 },
      sectionStart: { x: 100, y: 200 },
    },
  };
}

function equipmentIndex(equipment: WorkbenchEquipment[]) {
  return new Map(equipment.map((item) => [item.id, item]));
}

function reviewTransitionEquipmentById(
  fixture: ReviewTransitionFixture,
  equipmentId: string,
) {
  const equipment = fixture.equipment.find((item) => item.id === equipmentId);
  assert(equipment, `Falta equipo ${equipmentId}.`);
  return equipment;
}

function point(x: number, y: number, z?: number): Point2D {
  return z === undefined ? { x, y } : { x, y, z };
}

function assertEditOk(
  result: PhysicalRouteEditResult,
): asserts result is Extract<PhysicalRouteEditResult, { ok: true }> {
  assert(result.ok, result.ok ? "" : result.message);
}

function assertPoint(actual: Point2D | null | undefined, expected: Point2D) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);

  if (expected.z !== undefined) {
    assertClose(actual.z, expected.z);
  }
}

function verify(
  results: ReviewStageVerificationResult[],
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
  console.log(JSON.stringify(runReviewStageVerifications(), null, 2));
}
