import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import { SIGAS_DIAMETERS } from "@/lib/calculation/pipeSystems/sigas/sigasData";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3 } from "@/lib/calculation/projectGas";
import {
  createTechnicalAdoptedDiameterValidation,
  type TechnicalAdoptedDiameterValidation,
} from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  automaticAccessoryId,
  type AccessoryProposal,
} from "@/lib/routing/routeAccessoryProposals";
import {
  applianceNodesAreTerminal,
  detectRouteCycle,
  getConnectedApplianceEquipmentIds,
  getRouteNodeDegree,
  hasDuplicateNodeIds,
  hasDuplicateSegmentIds,
  hasDuplicateSegments,
  hasSegmentsWithMissingEndpoints,
  hasZeroLengthSegments,
  insertRouteSegmentVertex,
  moveRouteSegmentVertex,
  projectPointToRouteSegmentPath,
  removeRouteSegmentVertex,
  resolveRouteSegments,
  routeSegmentHorizontalLengthSource,
  routeSegmentPhysicalLengthMeters,
  routeSegmentPlanLegs,
  splitRouteSegmentAtPoint,
} from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  ResolvedRouteSegment,
  RouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";

export type TechnicalPhysicalRouteVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const SCALE_METERS_PER_SOURCE_UNIT = 1;
const TERMINAL_VALVE_PROPOSAL_ID = "terminal-valve";
const TERMINAL_RH_PROPOSAL_ID = "terminal-rh";
const D20 = diameter(20);

export function runTechnicalPhysicalRouteVerifications() {
  const results: TechnicalPhysicalRouteVerificationResult[] = [];

  verify(
    results,
    "10.6A rama terminal fisica llega al artefacto y alimenta calculo/BOM",
    () => {
      const first = terminalBranchPhysicalRouteFixture();
      const second = terminalBranchPhysicalRouteFixture();

      assertEqual(
        JSON.stringify(physicalRouteSnapshot(first)),
        JSON.stringify(physicalRouteSnapshot(second)),
      );
      assertSingleConfirmedNetwork(first.network, first.equipment);
      assertPhysicalTerminalBranch(first);
      assertTechnicalCalculation(first.result);
      assertPhysicalAccessoryInventory(first.inventory);
      assertEquivalentLengthsAndAdoptedDiameters(
        first.equivalentVerificationBySegmentId,
        first.adoptedDiameterValidation,
      );
      assertMaterialTakeoff(first);
      assertCalculationSheet(first);
      assertNoUnexpectedPendingItems(first);
    },
  );

  return results;
}

type TechnicalPhysicalRouteFixture = ReturnType<
  typeof terminalBranchPhysicalRouteFixture
>;

function terminalBranchPhysicalRouteFixture() {
  const equipment = terminalBranchEquipment();
  let network = baseConfirmedNetwork();
  const split = splitRouteSegmentAtPoint({
    createNode: (point) => ({
      id: "D",
      kind: "route" as const,
      origin: "manual" as const,
      position: point,
    }),
    createSegment: (fromNodeId, toNodeId, origin, vertices) =>
      createFixtureSegment({
        fromNodeId,
        id: `${fromNodeId}-${toNodeId}`,
        origin,
        toNodeId,
        vertices,
      }),
    equipment,
    network,
    point: { x: 2, y: 0 },
    segmentId: "M-2",
    tolerance: EPSILON,
  });

  if (!split.ok) {
    assert(false, split.message);
  }

  network = split.network;
  network = {
    nodes: [
      ...network.nodes,
      {
        equipmentId: "appliance-terminal",
        id: "1",
        kind: "appliance",
        origin: "manual",
      },
    ],
    segments: [...network.segments, terminalBranchSegment()],
  };
  network = insertRouteSegmentVertex({
    index: 0,
    network,
    point: { x: 2, y: 1.2, z: 9 },
    segmentId: "D-1",
  });
  network = moveRouteSegmentVertex({
    network,
    point: { x: 2, y: 1.4, z: 7 },
    segmentId: "D-1",
    vertexIndex: 0,
  });
  network = insertRouteSegmentVertex({
    index: 1,
    network,
    point: { x: 4.2, y: 1.4, z: 5 },
    segmentId: "D-1",
  });
  network = insertRouteSegmentVertex({
    index: 2,
    network,
    point: { x: 4.4, y: 1.4 },
    segmentId: "D-1",
  });
  network = removeRouteSegmentVertex({
    network,
    segmentId: "D-1",
    vertexIndex: 2,
  });

  const accessoryProposals = terminalBranchAccessoryProposals();
  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: EPSILON,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: SCALE_METERS_PER_SOURCE_UNIT,
  });

  assertEqual(result.status, "valid");
  assertEqual(result.networkSizing?.status, "resolved");

  const inventory = createTechnicalPhysicalAccessoryInventory({
    accessoryProposals,
    result,
  });
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
  const materialTakeoff = createTechnicalMaterialTakeoff({
    accessoryProposals,
    adoptedDiameterValidation,
    physicalAccessoryInventory: inventory,
    result,
  });
  const calculationSheet = createTechnicalCalculationSheet({
    equipment,
    result,
  });

  return {
    accessoryProposals,
    adoptedDiameterValidation,
    calculationSheet,
    equipment,
    equivalentVerificationBySegmentId,
    inventory,
    materialTakeoff,
    network,
    result,
  };
}

function terminalBranchEquipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: { x: 0, y: 0, z: 0 },
      id: "meter",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 6, y: 0, z: 0 },
      demandUnit: "kcal_h",
      demandValue: 2500,
      id: "appliance-main",
      name: "Artefacto troncal",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "space_heater",
    },
    {
      connectionPoint: { x: 4.6, y: 1.4, z: 1.2 },
      demandUnit: "kcal_h",
      demandValue: 3000,
      id: "appliance-terminal",
      name: "Artefacto terminal",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "stove",
    },
  ];
}

function baseConfirmedNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      {
        equipmentId: "meter",
        id: "M",
        kind: "supply",
        origin: "manual",
      },
      {
        equipmentId: "appliance-main",
        id: "2",
        kind: "appliance",
        origin: "manual",
      },
    ],
    segments: [
      {
        fromNodeId: "M",
        id: "M-2",
        origin: "manual",
        toNodeId: "2",
        vertices: [
          { x: 1, y: 0 },
          { x: 3, y: 0 },
        ],
      },
    ],
  };
}

function terminalBranchSegment(): RouteSegment {
  return {
    accessories: [terminalValveAccessory(), terminalRhAccessory()],
    fromNodeId: "D",
    id: "D-1",
    origin: "manual",
    toNodeId: "1",
  };
}

function terminalValveAccessory(): RouteSegmentAccessory {
  return {
    catalogFamilyId: "llave-esferica",
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id: automaticAccessoryId(TERMINAL_VALVE_PROPOSAL_ID),
    origin: "user_confirmed",
    quantity: 1,
    segmentId: "D-1",
    type: "valve",
  };
}

function terminalRhAccessory(): RouteSegmentAccessory {
  return {
    catalogFamilyId: "codo-90-rosca-hembra",
    equivalentLengthMetersPerUnit: null,
    equivalentLengthSource: "pipe_system",
    id: automaticAccessoryId(TERMINAL_RH_PROPOSAL_ID),
    origin: "user_confirmed",
    quantity: 1,
    segmentId: "D-1",
    type: "elbow",
  };
}

function terminalBranchAccessoryProposals(): AccessoryProposal[] {
  return [
    {
      confidence: "high",
      domainAccessory: {
        catalogFamilyId: "llave-esferica",
        equivalentLengthSource: "pipe_system",
        type: "valve",
      },
      evidence: {
        angleClassification: "colinear",
        degree: 1,
        incidentNodeIds: ["D"],
      },
      geometryKey: "fixture:10.6A:terminal-valve",
      id: TERMINAL_VALVE_PROPOSAL_ID,
      incidentSegmentIds: ["D-1"],
      kind: "straight",
      nodeId: "1",
      ownerResolution: {
        candidateSegmentIds: ["D-1"],
        ownerSegmentId: "D-1",
        status: "unambiguous",
      },
      position: { x: 4.25, y: 1.4, z: 1.2 },
      reason: "Llave de paso terminal confirmada en fixture 10.6A.",
      state: "confirmed",
    },
    {
      confidence: "high",
      domainAccessory: {
        catalogFamilyId: "codo-90-rosca-hembra",
        equivalentLengthSource: "pipe_system",
        type: "elbow",
      },
      evidence: {
        angleClassification: "terminal",
        degree: 1,
        incidentNodeIds: ["D"],
      },
      geometryKey: "fixture:10.6A:terminal-rh",
      id: TERMINAL_RH_PROPOSAL_ID,
      incidentSegmentIds: ["D-1"],
      kind: "terminal",
      nodeId: "1",
      ownerResolution: {
        candidateSegmentIds: ["D-1"],
        ownerSegmentId: "D-1",
        status: "unambiguous",
      },
      position: { x: 4.6, y: 1.4, z: 1.2 },
      reason: "Fitting terminal/RH confirmado en fixture 10.6A.",
      state: "confirmed",
    },
  ];
}

function createFixtureSegment(params: {
  fromNodeId: string;
  id: string;
  origin: RouteSegment["origin"];
  toNodeId: string;
  vertices?: Point2D[];
}): RouteSegment {
  return {
    fromNodeId: params.fromNodeId,
    id: params.id,
    origin: params.origin,
    toNodeId: params.toNodeId,
    ...(params.vertices && params.vertices.length > 0
      ? {
          vertices: params.vertices.map((point) => ({
            x: point.x,
            y: point.y,
          })),
        }
      : {}),
  };
}

function physicalRouteSnapshot(fixture: TechnicalPhysicalRouteFixture) {
  return {
    adopted: fixture.adoptedDiameterValidation.segments.map((segment) => ({
      adopted: diameterLabel(segment.adoptedDiameter),
      required: diameterLabel(segment.requiredDiameter),
      segmentId: segment.segmentId,
      status: segment.status,
    })),
    inventory: fixture.inventory.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      routeUses: item.routeUses.map((use) => ({
        equivalentLengthMeters: use.equivalentLengthMeters,
        routeId: use.routeId,
        segmentIds: use.segmentIds,
      })),
      segmentIds: item.segmentIds,
      sourceIds: item.sourceIds,
    })),
    materialTakeoff: {
      accessories: fixture.materialTakeoff.accessoryItems.map((item) => ({
        familyId: item.familyId,
        kind: item.accessoryKind,
        quantity: item.quantity,
        sourceIds: item.sourceIds,
      })),
      pipes: fixture.materialTakeoff.pipeItems.map((item) => ({
        diameter: diameterLabel(item.diameter),
        physicalLengthMeters: item.physicalLengthMeters,
        segmentIds: item.segmentIds,
      })),
      status: fixture.materialTakeoff.status,
    },
    network: {
      nodes: fixture.network.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        position: node.position ?? null,
      })),
      segments: fixture.network.segments.map((segment) => ({
        accessories: (segment.accessories ?? []).map((accessory) => ({
          familyId: accessory.catalogFamilyId,
          id: accessory.id,
          type: accessory.type,
        })),
        fromNodeId: segment.fromNodeId,
        id: segment.id,
        toNodeId: segment.toNodeId,
        vertices: segment.vertices ?? [],
      })),
    },
    result: fixture.result.segments.map((segment) => ({
      calculationLengthMeters: segment.calculationLengthMeters,
      downstreamApplianceIds: segment.downstreamApplianceIds,
      flowM3h: segment.consumptionM3h,
      physicalLengthMeters: segment.segmentPhysicalLengthMeters,
      provisionalDiameter: diameterLabel(segment.provisionalDiameter),
      segmentId: segment.segmentId,
    })),
    routes: fixture.result.technicalRoutes.map((route) => ({
      id: route.id,
      physicalLengthMeters: route.physicalLengthMeters,
      segmentIds: route.segmentIds,
      status: route.status,
    })),
  };
}

function assertSingleConfirmedNetwork(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  assertEqual(nodeIds(network), "1,2,D,M");
  assertEqual(segmentIds(network), "D-1,D-2,M-D");
  assertEqual(hasDuplicateNodeIds(network), false);
  assertEqual(hasDuplicateSegmentIds(network), false);
  assertEqual(hasDuplicateSegments(network), false);
  assertEqual(hasSegmentsWithMissingEndpoints(network), false);
  assertEqual(detectRouteCycle(network), false);
  assertEqual(applianceNodesAreTerminal(network), true);
  assertEqual(
    hasZeroLengthSegments(network, equipment, EPSILON),
    false,
  );
  assertEqual(getRouteNodeDegree(network, "D"), 3);
  assertEqual(
    [...getConnectedApplianceEquipmentIds(network, equipment)].sort().join(","),
    "appliance-main,appliance-terminal",
  );
}

function assertPhysicalTerminalBranch(fixture: TechnicalPhysicalRouteFixture) {
  const branch = resolvedSegment(fixture, "D-1");
  const mainBeforeBranch = resolvedSegment(fixture, "M-D");
  const mainAfterBranch = resolvedSegment(fixture, "D-2");
  const branchSegment =
    fixture.network.segments.find((segment) => segment.id === "D-1") ?? null;
  const branchVertices = branchSegment?.vertices ?? [];

  assertEqual(branchVertices.length, 2);
  assert(
    branchVertices.every((point) => point.z === undefined),
    "Los vertices fisicos en planta no deben mezclar altura Z.",
  );
  assertEqual(branch.path.length, 4);
  assertPoint(branch.path[0], { x: 2, y: 0, z: 0 });
  assertPoint(branch.path[1], { x: 2, y: 1.4 });
  assertPoint(branch.path[2], { x: 4.2, y: 1.4 });
  assertPoint(branch.path[3], { x: 4.6, y: 1.4, z: 1.2 });
  assertClose(routeSegmentHorizontalLengthSource(branch), 4);
  assertClose(
    routeSegmentPhysicalLengthMeters(
      branch,
      SCALE_METERS_PER_SOURCE_UNIT,
    ),
    5.2,
  );
  assertClose(routeSegmentHorizontalLengthSource(mainBeforeBranch), 2);
  assertClose(routeSegmentHorizontalLengthSource(mainAfterBranch), 4);
  assertClose(
    routeSegmentPhysicalLengthMeters(
      mainBeforeBranch,
      SCALE_METERS_PER_SOURCE_UNIT,
    ),
    2,
  );
  assertClose(
    routeSegmentPhysicalLengthMeters(
      mainAfterBranch,
      SCALE_METERS_PER_SOURCE_UNIT,
    ),
    4,
  );
  assertFinalHorizontalLegToAppliance(branch);
  assertTerminalAccessoriesLieOnPhysicalBranch(fixture, branch);
}

function assertFinalHorizontalLegToAppliance(segment: ResolvedRouteSegment) {
  const legs = routeSegmentPlanLegs(segment);
  const finalLeg = legs[legs.length - 1] ?? null;

  assert(finalLeg, "Falta tramo horizontal final.");
  assertClose(finalLeg.from.x, 4.2);
  assertClose(finalLeg.from.y, 1.4);
  assertClose(finalLeg.to.x, 4.6);
  assertClose(finalLeg.to.y, 1.4);
  assertClose(Math.abs(zMeters(segment.to) - zMeters(segment.from)), 1.2);
  assertClose(routeSegmentHorizontalLengthSource(segment), 4);
}

function assertTerminalAccessoriesLieOnPhysicalBranch(
  fixture: TechnicalPhysicalRouteFixture,
  branch: ResolvedRouteSegment,
) {
  for (const proposal of fixture.accessoryProposals) {
    const projection = projectPointToRouteSegmentPath(proposal.position, branch);

    assertClose(projection.distance, 0);
    assertEqual(proposal.ownerResolution.status, "unambiguous");
    assertEqual(
      proposal.ownerResolution.status === "unambiguous"
        ? proposal.ownerResolution.ownerSegmentId
        : null,
      "D-1",
    );
  }
}

function assertTechnicalCalculation(result: TechnicalCalculationResult) {
  assertEqual(result.status, "valid");
  assertEqual(result.issues.length, 0);
  assertEqual(result.networkSizing?.status, "resolved");
  assertEqual(result.transitionAwareNetworkSizing?.status, "resolved");
  assertEqual(result.rootNodeId, "M");
  assertEqual(result.technicalRoutes.length, 2);
  assertRoute(result, "appliance-main", ["M-D", "D-2"], 6);
  assertRoute(result, "appliance-terminal", ["M-D", "D-1"], 7.2);
  assertSegment(result, "M-D", {
    downstreamKcalH: 5500,
    downstreamIds: ["appliance-main", "appliance-terminal"],
    physicalLengthMeters: 2,
  });
  assertSegment(result, "D-1", {
    downstreamKcalH: 3000,
    downstreamIds: ["appliance-terminal"],
    physicalLengthMeters: 5.2,
  });
  assertSegment(result, "D-2", {
    downstreamKcalH: 2500,
    downstreamIds: ["appliance-main"],
    physicalLengthMeters: 4,
  });
  assertClose(result.totals.physicalLengthMeters, 11.2);
  assertClose(result.totals.accumulatedFlow, 5500 / gasHeatingValue());
}

function assertPhysicalAccessoryInventory(
  inventory: TechnicalPhysicalRouteFixture["inventory"],
) {
  assertEqual(inventory.status, "resolved");
  assertEqual(inventory.pendingItems.length, 0);
  assertEqual(inventory.items.length, 2);
  assertUnique(inventory.items.map((item) => item.id));

  for (const item of inventory.items) {
    assertEqual(item.source, "route_accessory");
    assertEqual(item.segmentIds.join(","), "D-1");
    assertEqual(item.routeUses.length, 1);
    assertEqual(item.routeUses[0]?.routeId, "technical-route:appliance-terminal");
    assertEqual(item.routeUses[0]?.segmentIds.join(","), "D-1");
    assertUnique(item.sourceIds);
    assertUnique(item.routeUses.map(routeUseKey));
  }

  assertEqual(
    inventory.items.map((item) => item.kind).sort().join(","),
    "rh_elbow,valve",
  );
  assertClose(
    physicalAccessory(inventory, "valve").routeUses[0]?.equivalentLengthMeters,
    0.678,
  );
  assertClose(
    physicalAccessory(inventory, "rh_elbow").routeUses[0]
      ?.equivalentLengthMeters,
    0.651,
  );
  assertEqual(
    (inventory.accessoryIdsBySegmentId["D-1"] ?? []).length,
    2,
  );

  for (const ids of Object.values(inventory.accessoryIdsByRouteId)) {
    assertUnique(ids);
  }

  for (const ids of Object.values(inventory.accessoryIdsBySegmentId)) {
    assertUnique(ids);
  }
}

function assertEquivalentLengthsAndAdoptedDiameters(
  equivalentBySegmentId: TechnicalPhysicalRouteFixture["equivalentVerificationBySegmentId"],
  validation: TechnicalAdoptedDiameterValidation,
) {
  const terminalVerification = equivalentBySegmentId["D-1"];

  assert(terminalVerification, "Falta segunda verificacion del tramo terminal.");
  assertEqual(terminalVerification.status, "resolved");
  assertClose(terminalVerification.calculationLengthMeters, 7.2);
  assertClose(terminalVerification.equivalentAccessoryLengthMeters, 1.329);
  assertClose(terminalVerification.totalCalculationLengthMeters, 8.529);
  assertEqual(
    terminalVerification.requiredDiameter?.externalDiameterMillimeters,
    20,
  );
  assertEqual(validation.status, "valid");

  for (const segment of validation.segments) {
    const adopted = segment.adoptedDiameter?.externalDiameterMillimeters ?? null;
    const required = segment.requiredDiameter?.externalDiameterMillimeters ?? null;

    assertEqual(segment.status, "valid");
    assertEqual(segment.provisionalDiameter?.externalDiameterMillimeters, 20);
    assertEqual(adopted, 20);
    assertEqual(required, 20);
    assert(
      adopted !== null && required !== null && adopted >= required,
      `Diametro adoptado menor al requerido en ${segment.segmentId}.`,
    );
  }
}

function assertMaterialTakeoff(fixture: TechnicalPhysicalRouteFixture) {
  const takeoff = fixture.materialTakeoff;

  assertEqual(takeoff.status, "resolved");
  assertEqual(takeoff.pendingSummary.total, 0);
  assertEqual(takeoff.physicalMaterialQuantities.accessoryQuantity, 2);
  assertEqual(takeoff.physicalMaterialQuantities.pipeSegmentCount, 3);
  assertClose(takeoff.physicalMaterialQuantities.pipeLengthMeters, 11.2);
  assertEqual(takeoff.pipeItems.length, 1);
  assertEqual(takeoff.pipeItems[0]?.diameter.id, D20.id);
  assertClose(takeoff.pipeItems[0]?.physicalLengthMeters, 11.2);
  assertEqual(
    takeoff.pipeItems[0]?.segmentIds.join(","),
    "D-1,D-2,M-D",
  );
  assertEqual(
    takeoff.accessoryItems
      .map((item) => `${item.accessoryKind}:${item.quantity}`)
      .sort()
      .join(","),
    "rh_elbow:1,valve:1",
  );
  assertEqual(
    takeoff.accessoryItems
      .flatMap((item) => item.sourceIds)
      .sort()
      .join(","),
    fixture.inventory.items.map((item) => item.id).sort().join(","),
  );
  assert(
    takeoff.accessoryItems
      .flatMap((item) => item.sourceIds)
      .every((sourceId) => !sourceId.startsWith("technical-route:")),
    "El BOM debe referenciar piezas fisicas, no recorridos.",
  );
}

function assertCalculationSheet(fixture: TechnicalPhysicalRouteFixture) {
  const sheet = fixture.calculationSheet;
  const terminalRow =
    sheet.rows.find((row) => row.segmentId === "D-1") ?? null;

  assertEqual(sheet.status, "resolved");
  assertEqual(sheet.pendingRowCount, 0);
  assertEqual(sheet.unsupportedRowCount, 0);
  assert(terminalRow, "Falta fila tecnica del tramo terminal.");
  assertEqual(terminalRow.status, "resolved");
  assertClose(terminalRow.physicalLengthMeters, 5.2);
  assertClose(terminalRow.initialRouteLengthMeters, 7.2);
  assertClose(terminalRow.accessoryEquivalentLengthMeters, 1.329);
  assertClose(terminalRow.transitionEquivalentLengthMeters, 0);
  assertClose(terminalRow.finalCalculationLengthMeters, 8.529);
  assertEqual(
    terminalRow.effectiveDiameter?.externalDiameterMillimeters,
    20,
  );
}

function assertNoUnexpectedPendingItems(fixture: TechnicalPhysicalRouteFixture) {
  assertEqual(fixture.inventory.pendingItems.length, 0);
  assertEqual(fixture.materialTakeoff.pendingItems.length, 0);
  assertEqual(fixture.result.issues.length, 0);
  assertEqual(
    fixture.result.transitionAwareNetworkSizing?.issues.length,
    0,
  );
  assertEqual(
    fixture.result.transitionAwareNetworkSizing?.transitions.filter(
      (proposal) => proposal.state !== "not_required",
    ).length,
    0,
  );
}

function assertRoute(
  result: TechnicalCalculationResult,
  terminalEquipmentId: string,
  segmentIds: string[],
  physicalLengthMeters: number,
) {
  const route =
    result.technicalRoutes.find(
      (candidate) => candidate.terminalEquipmentId === terminalEquipmentId,
    ) ?? null;

  assert(route, `Falta recorrido terminal ${terminalEquipmentId}.`);
  assertEqual(route.status, "resolved");
  assertEqual(route.segmentIds.join(","), segmentIds.join(","));
  assertClose(route.physicalLengthMeters, physicalLengthMeters);
}

function assertSegment(
  result: TechnicalCalculationResult,
  segmentId: string,
  params: {
    downstreamIds: string[];
    downstreamKcalH: number;
    physicalLengthMeters: number;
  },
) {
  const segment =
    result.segments.find((candidate) => candidate.segmentId === segmentId) ??
    null;

  assert(segment, `Falta tramo ${segmentId}.`);
  assertEqual(
    [...segment.downstreamApplianceIds].sort().join(","),
    [...params.downstreamIds].sort().join(","),
  );
  assertEqual(segment.accumulatedFlowUnit, "m3_h");
  assertClose(segment.accumulatedFlow, params.downstreamKcalH / gasHeatingValue());
  assertClose(segment.consumptionM3h, params.downstreamKcalH / gasHeatingValue());
  assertClose(segment.segmentPhysicalLengthMeters, params.physicalLengthMeters);
  assertClose(segment.physicalLengthMeters, params.physicalLengthMeters);
  assertEqual(segment.provisionalDiameter?.externalDiameterMillimeters, 20);
}

function resolvedSegment(
  fixture: TechnicalPhysicalRouteFixture,
  segmentId: string,
) {
  const segment =
    resolveRouteSegments(fixture.network, fixture.equipment).find(
      (candidate) => candidate.id === segmentId,
    ) ?? null;

  assert(segment, `Falta segmento resuelto ${segmentId}.`);
  return segment;
}

function physicalAccessory(
  inventory: TechnicalPhysicalRouteFixture["inventory"],
  kind: TechnicalPhysicalRouteFixture["inventory"]["items"][number]["kind"],
) {
  const item =
    inventory.items.find((candidate) => candidate.kind === kind) ?? null;

  assert(item, `Falta accesorio fisico ${kind}.`);
  return item;
}

function nodeIds(network: ManualRouteNetwork) {
  return network.nodes.map((node) => node.id).sort().join(",");
}

function segmentIds(network: ManualRouteNetwork) {
  return network.segments.map((segment) => segment.id).sort().join(",");
}

function routeUseKey(
  routeUse: TechnicalPhysicalRouteFixture["inventory"]["items"][number]["routeUses"][number],
) {
  return [
    routeUse.routeId,
    routeUse.segmentIds.join(","),
    routeUse.traversalKind ?? "",
    routeUse.variantLabel ?? "",
  ].join("|");
}

function assertPoint(actual: Point2D | undefined, expected: Point2D) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);

  if (expected.z !== undefined) {
    assertClose(zMeters(actual), expected.z);
  } else {
    assertEqual(actual.z, undefined);
  }
}

function assertUnique(values: string[]) {
  assertEqual(values.length, new Set(values).size);
}

function diameterLabel(diameter: PipeDiameterReference | null | undefined) {
  return diameter?.id ?? null;
}

function diameter(externalDiameterMillimeters: number): PipeDiameterReference {
  const value = SIGAS_DIAMETERS.find(
    (item) => item.externalDiameterMillimeters === externalDiameterMillimeters,
  );

  assert(value, `Falta diametro SIGAS ${externalDiameterMillimeters}.`);
  return value;
}

function gasHeatingValue() {
  return DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3;
}

function zMeters(point: Point2D) {
  return typeof point.z === "number" && Number.isFinite(point.z) ? point.z : 0;
}

function verify(
  results: TechnicalPhysicalRouteVerificationResult[],
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
  console.log(JSON.stringify(runTechnicalPhysicalRouteVerifications(), null, 2));
}
