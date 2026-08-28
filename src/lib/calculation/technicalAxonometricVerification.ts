import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import { DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3 } from "@/lib/calculation/projectGas";
import { SIGAS_DIAMETERS } from "@/lib/calculation/pipeSystems/sigas/sigasData";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import {
  createTechnicalAdoptedDiameterValidation,
  type TechnicalAdoptedDiameterValidation,
} from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import {
  detectDiameterTransitionProposals,
  type DiameterTransitionDecision,
} from "@/lib/calculation/diameterTransitionProposals";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  automaticAccessoryId,
  type AccessoryProposal,
} from "@/lib/routing/routeAccessoryProposals";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  createTechnicalPhysicalAccessoryInventory,
  type TechnicalPhysicalAccessoryInventory,
} from "./technicalPhysicalAccessories";
import { createTechnicalAxonometricView } from "./technicalAxonometric";

export type TechnicalAxonometricVerificationResult = {
  name: string;
  status: "passed";
};

const D20 = diameter(20);
const D25 = diameter(25);
const D32 = diameter(32);

export function runTechnicalAxonometricVerifications() {
  const results: TechnicalAxonometricVerificationResult[] = [];

  verify(
    results,
    "10.5H red ramificada estable con ramas y alturas",
    () => {
      const fixture = branchedAxonometricFixture();
      const first = createTechnicalAxonometricView(fixture);
      const second = createTechnicalAxonometricView(fixture);

      assertEqual(JSON.stringify(first), JSON.stringify(second));
      assertEqual(first.status, "resolved");
      assertEqual(first.nodes.length, fixture.network.nodes.length);
      assertEqual(first.segments.length, fixture.network.segments.length);
      assertEqual(node(first, "M").label, "M");
      assertEqual(node(first, "C").kind, "derivation");
      assertEqual(node(first, "B").kind, "derivation");
      assertEqual(node(first, "A").kind, "derivation");
      assertEqual(segment(first, "s-m-c").adoptedDiameterLabel, "Ø32");
      assertEqual(segment(first, "s-c-b").adoptedDiameterLabel, "Ø25");
      assertEqual(segment(first, "s-c-cook").adoptedDiameterLabel, "Ø20");
      assertClose(segment(first, "s-m-c").zDeltaMeters, 1);
      assertClose(segment(first, "s-c-b").zDeltaMeters, 1);
      assertClose(segment(first, "s-b-a").zDeltaMeters, -1.5);
      assertClose(segment(first, "s-a-boiler").zDeltaMeters, 2);
      assertEqual(first.accessories.length, 1);
      assertEqual(first.accessories[0]?.status, "resolved");
    },
  );

  verify(
    results,
    "10.5I verificacion integral del flujo tecnico sin IA",
    () => {
      const first = integratedTechnicalFlowFixture();
      const second = integratedTechnicalFlowFixture();

      assertEqual(
        JSON.stringify(integratedTechnicalFlowSnapshot(first)),
        JSON.stringify(integratedTechnicalFlowSnapshot(second)),
      );
      assertIntegralStatuses(first);
      assertKcalDemands(first.result);
      assertDownstreamConsumptionAndLengths(first.result);
      assertPhysicalAccessories(first.inventory);
      assertMaterialTakeoffUsesPhysicalPieces(first);
      assertAdoptedDiameters(first.adoptedDiameterValidation);
      assertCalculationSheetLengths(first);
      assertIntegratedAxonometric(first);
    },
  );

  return results;
}

type IntegratedTechnicalFlowFixture = ReturnType<
  typeof integratedTechnicalFlowFixture
>;

const INTEGRATED_MAIN_VALVE_PROPOSAL_ID = "main-valve";
const INTEGRATED_SHARED_ELBOW_PROPOSAL_ID = "shared-elbow";

function integratedTechnicalFlowFixture() {
  const equipment = integratedEquipment();
  const network = integratedNetwork();
  const accessoryProposals = integratedAccessoryProposals();
  const baseResult = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: 1,
  });

  assertEqual(baseResult.status, "valid");
  assertEqual(baseResult.networkSizing?.status, "resolved");

  const diameterTransitionDecisions = confirmedIntegratedTransitionDecisions({
    equipment,
    network,
    result: baseResult,
  });
  const result = calculateTechnicalTree({
    diameterTransitionDecisions,
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: 1,
  });

  assertEqual(result.status, "valid");

  const diameterTransitionProposals =
    result.transitionAwareNetworkSizing?.transitions ?? [];
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
    diameterTransitionProposals,
    physicalAccessoryInventory: inventory,
    result,
  });
  const calculationSheet = createTechnicalCalculationSheet({
    equipment,
    result,
  });
  const axonometricView = createTechnicalAxonometricView({
    adoptedDiameterValidation,
    equipment,
    inventory,
    network,
    result,
    scaleMetersPerSourceUnit: 1,
  });

  return {
    accessoryProposals,
    adoptedDiameterValidation,
    axonometricView,
    calculationSheet,
    diameterTransitionDecisions,
    diameterTransitionProposals,
    equipment,
    equivalentVerificationBySegmentId,
    inventory,
    materialTakeoff,
    network,
    result,
  };
}

function integratedTechnicalFlowSnapshot(
  fixture: IntegratedTechnicalFlowFixture,
) {
  return {
    adopted: fixture.adoptedDiameterValidation.segments.map((segment) => ({
      adopted: diameterLabel(segment.adoptedDiameter),
      provisional: diameterLabel(segment.provisionalDiameter),
      required: diameterLabel(segment.requiredDiameter),
      segmentId: segment.segmentId,
      status: segment.status,
    })),
    axonometric: {
      accessories: fixture.axonometricView.accessories.map((accessory) => ({
        id: accessory.id,
        nodeId: accessory.nodeId,
        segmentIds: accessory.segmentIds,
        status: accessory.status,
      })),
      segments: fixture.axonometricView.segments.map((segment) => ({
        adopted: diameterLabel(segment.adoptedDiameter),
        id: segment.id,
        physicalLengthMeters: segment.physicalLengthMeters,
        status: segment.status,
        zDeltaMeters: segment.zDeltaMeters,
      })),
      status: fixture.axonometricView.status,
    },
    inventory: fixture.inventory.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      nodeId: item.nodeId,
      routeUses: item.routeUses.map((use) => ({
        equivalentLengthMeters: use.equivalentLengthMeters,
        routeId: use.routeId,
        segmentIds: use.segmentIds,
        traversalKind: use.traversalKind,
      })),
      segmentIds: item.segmentIds,
      source: item.source,
    })),
    materialTakeoff: {
      accessories: fixture.materialTakeoff.accessoryItems.map((item) => ({
        familyId: item.familyId,
        kind: item.accessoryKind,
        quantity: item.quantity,
        sourceIds: item.sourceIds,
      })),
      pendingSummary: fixture.materialTakeoff.pendingSummary,
      pipes: fixture.materialTakeoff.pipeItems.map((item) => ({
        diameter: diameterLabel(item.diameter),
        physicalLengthMeters: item.physicalLengthMeters,
        segmentIds: item.segmentIds,
      })),
      status: fixture.materialTakeoff.status,
    },
    sheet: fixture.calculationSheet.rows.map((row) => ({
      accessoryEquivalentLengthMeters: row.accessoryEquivalentLengthMeters,
      effectiveDiameter: diameterLabel(row.effectiveDiameter),
      finalCalculationLengthMeters: row.finalCalculationLengthMeters,
      flowM3h: row.flowM3h,
      initialRouteLengthMeters: row.initialRouteLengthMeters,
      physicalLengthMeters: row.physicalLengthMeters,
      segmentId: row.segmentId,
      status: row.status,
      transitionEquivalentLengthMeters: row.transitionEquivalentLengthMeters,
    })),
    transitionAware: fixture.result.transitionAwareNetworkSizing?.segments.map(
      (segment) => ({
        final: diameterLabel(segment.finalDiameter),
        required: diameterLabel(segment.requiredDiameter),
        segmentId: segment.segmentId,
        status: segment.status,
        transitionAwareSizingLengthMeters:
          segment.transitionAwareSizingLengthMeters,
      }),
    ),
  };
}

function integratedEquipment(): WorkbenchEquipment[] {
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
    integratedAppliance("appliance-1", "1", 9000, 10.75, 0, 1.2),
    integratedAppliance("appliance-2", "2", 3000, 7.35, 3.4, 1.8),
    integratedAppliance("appliance-3", "3", 6500, 5.45, 1.7, 0.3),
    integratedAppliance("appliance-4", "4", 30000, 3, 1.7, 2),
  ];
}

function integratedNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      { equipmentId: "meter", id: "M", kind: "supply" },
      { id: "C", kind: "route", position: { x: 3, y: 0, z: 0.5 } },
      { id: "B", kind: "route", position: { x: 5.45, y: 0, z: 1 } },
      { id: "A", kind: "route", position: { x: 7.35, y: 0, z: 0.75 } },
      { equipmentId: "appliance-1", id: "1", kind: "appliance" },
      { equipmentId: "appliance-2", id: "2", kind: "appliance" },
      { equipmentId: "appliance-3", id: "3", kind: "appliance" },
      { equipmentId: "appliance-4", id: "4", kind: "appliance" },
    ],
    segments: [
      {
        accessories: [
          {
            catalogFamilyId: "llave-esferica",
            equivalentLengthMetersPerUnit: null,
            equivalentLengthSource: "pipe_system",
            id: automaticAccessoryId(INTEGRATED_MAIN_VALVE_PROPOSAL_ID),
            quantity: 1,
            segmentId: "M-C",
            type: "valve",
          },
        ],
        fromNodeId: "M",
        id: "M-C",
        toNodeId: "C",
      },
      {
        accessories: [
          {
            catalogFamilyId: "codo-normal-a-90",
            equivalentLengthMetersPerUnit: null,
            equivalentLengthSource: "pipe_system",
            id: automaticAccessoryId(INTEGRATED_SHARED_ELBOW_PROPOSAL_ID),
            quantity: 1,
            segmentId: "C-B",
            type: "elbow",
          },
        ],
        fromNodeId: "C",
        id: "C-B",
        toNodeId: "B",
      },
      { fromNodeId: "B", id: "B-A", toNodeId: "A" },
      { fromNodeId: "A", id: "A-1", toNodeId: "1" },
      { fromNodeId: "A", id: "A-2", toNodeId: "2" },
      { fromNodeId: "B", id: "B-3", toNodeId: "3" },
      { fromNodeId: "C", id: "C-4", toNodeId: "4" },
    ],
  };
}

function integratedAccessoryProposals(): AccessoryProposal[] {
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
        degree: 2,
        incidentNodeIds: ["M", "C"],
      },
      geometryKey: "fixture:10.5I:main-valve",
      id: INTEGRATED_MAIN_VALVE_PROPOSAL_ID,
      incidentSegmentIds: ["M-C"],
      kind: "straight",
      nodeId: "M",
      ownerResolution: {
        candidateSegmentIds: ["M-C"],
        ownerSegmentId: "M-C",
        status: "unambiguous",
      },
      position: { x: 0.2, y: 0, z: 0 },
      reason: "Fixture integral 10.5I.",
      state: "confirmed",
    },
    {
      confidence: "high",
      domainAccessory: {
        catalogFamilyId: "codo-normal-a-90",
        equivalentLengthSource: "pipe_system",
        type: "elbow",
      },
      evidence: {
        angleClassification: "turn",
        degree: 2,
        incidentNodeIds: ["C", "B"],
      },
      geometryKey: "fixture:10.5I:shared-elbow",
      id: INTEGRATED_SHARED_ELBOW_PROPOSAL_ID,
      incidentSegmentIds: ["C-B"],
      kind: "elbow",
      nodeId: "C",
      ownerResolution: {
        candidateSegmentIds: ["C-B"],
        ownerSegmentId: "C-B",
        status: "unambiguous",
      },
      position: { x: 3.15, y: 0, z: 0.5 },
      reason: "Fixture integral 10.5I.",
      state: "confirmed",
    },
  ];
}

function confirmedIntegratedTransitionDecisions(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  result: TechnicalCalculationResult;
}): DiameterTransitionDecision[] {
  const diameterBySegmentId = params.result.networkSizing?.finalDiameterBySegmentId;

  assert(diameterBySegmentId, "Falta dimensionado base para transiciones.");

  const proposals = detectDiameterTransitionProposals({
    diameterBySegmentId,
    equipment: params.equipment,
    network: params.network,
  });
  const required = proposals
    .filter((proposal) => proposal.kind !== "not_required")
    .sort((first, second) => first.nodeId.localeCompare(second.nodeId));

  assertEqual(
    proposals
      .filter((proposal) => proposal.kind === "not_required")
      .map((proposal) => proposal.nodeId)
      .join(","),
    "A",
  );
  assertEqual(required.map((proposal) => proposal.nodeId).join(","), "B,C");
  assert(
    required.every((proposal) => proposal.kind === "branch_transition"),
    "10.5I espera solo tees reductoras como transiciones requeridas.",
  );

  return required.map((proposal, index) => ({
    catalogFamilyId: "te-reduc-central",
    decidedAt: index + 1,
    geometryKey: proposal.geometryKey,
    origin: "user_confirmed",
    pipeSystemId: SIGAS_PIPE_SYSTEM.identity.id,
    status: "confirmed",
    transitionId: proposal.id,
  }));
}

function assertIntegralStatuses(fixture: IntegratedTechnicalFlowFixture) {
  assertEqual(fixture.result.status, "valid");
  assertEqual(fixture.result.issues.length, 0);
  assertEqual(fixture.result.networkSizing?.status, "resolved");
  assertEqual(fixture.result.networkSizing?.issues.length, 0);
  assertEqual(fixture.result.transitionAwareNetworkSizing?.status, "resolved");
  assertEqual(fixture.result.transitionAwareNetworkSizing?.issues.length, 0);
  assertEqual(fixture.inventory.status, "resolved");
  assertEqual(fixture.inventory.pendingItems.length, 0);
  assertEqual(fixture.adoptedDiameterValidation.status, "valid");
  assertEqual(fixture.materialTakeoff.status, "resolved");
  assertEqual(fixture.materialTakeoff.pendingSummary.total, 0);
  assertEqual(fixture.calculationSheet.status, "resolved");
  assertEqual(fixture.calculationSheet.pendingRowCount, 0);
  assertEqual(fixture.calculationSheet.unsupportedRowCount, 0);
  assertEqual(fixture.axonometricView.status, "resolved");
  assertEqual(fixture.axonometricView.pendingItems.length, 0);
}

function assertKcalDemands(result: TechnicalCalculationResult) {
  assertEqual(result.demandNormalizations.length, 4);
  assertNormalizedKcal(result, "appliance-1", 9000);
  assertNormalizedKcal(result, "appliance-2", 3000);
  assertNormalizedKcal(result, "appliance-3", 6500);
  assertNormalizedKcal(result, "appliance-4", 30000);
  assertClose(result.totals.accumulatedFlow, 48500 / gasHeatingValue());
  assertEqual(result.totals.accumulatedFlowUnit, "m3_h");
}

function assertDownstreamConsumptionAndLengths(
  result: TechnicalCalculationResult,
) {
  assertSegmentFlow(result, "M-C", [
    "appliance-1",
    "appliance-2",
    "appliance-3",
    "appliance-4",
  ], 48500);
  assertSegmentFlow(result, "C-B", [
    "appliance-1",
    "appliance-2",
    "appliance-3",
  ], 18500);
  assertSegmentFlow(result, "B-A", ["appliance-1", "appliance-2"], 12000);
  assertSegmentFlow(result, "A-1", ["appliance-1"], 9000);
  assertSegmentFlow(result, "A-2", ["appliance-2"], 3000);
  assertSegmentFlow(result, "B-3", ["appliance-3"], 6500);
  assertSegmentFlow(result, "C-4", ["appliance-4"], 30000);

  assertSegmentLengths(result, "M-C", 3.5, 14.233, 32);
  assertSegmentLengths(result, "C-B", 2.95, 14.233, 25);
  assertSegmentLengths(result, "B-A", 2.15, 14.233, 20);
  assertSegmentLengths(result, "A-1", 3.85, 13.633, 20);
  assertSegmentLengths(result, "A-2", 4.45, 14.233, 20);
  assertSegmentLengths(result, "B-3", 2.4, 10.033, 20);
  assertSegmentLengths(result, "C-4", 3.2, 7.027, 25);
  assertClose(result.totals.physicalLengthMeters, 22.5);
}

function assertPhysicalAccessories(
  inventory: TechnicalPhysicalAccessoryInventory,
) {
  assertEqual(inventory.items.length, 4);
  assertUnique(inventory.items.map((item) => item.id));

  for (const item of inventory.items) {
    assertUnique(item.sourceIds);
    assertUnique(item.routeUses.map(routeUseKey));
  }

  for (const accessoryIds of Object.values(inventory.accessoryIdsByRouteId)) {
    assertUnique(accessoryIds);
  }

  for (const accessoryIds of Object.values(inventory.accessoryIdsBySegmentId)) {
    assertUnique(accessoryIds);
  }

  const teeB = physicalAccessoryByNode(inventory, "B", "reduced_tee");
  const teeC = physicalAccessoryByNode(inventory, "C", "reduced_tee");
  const traversals = [...teeB.routeUses, ...teeC.routeUses]
    .map((use) => use.traversalKind)
    .filter((value): value is "through" | "turn_90" => Boolean(value))
    .sort();

  assert(
    traversals.includes("through") && traversals.includes("turn_90"),
    "El fixture debe resolver usos through y turn_90.",
  );
  assertEqual(teeB.routeUses.length, 3);
  assertEqual(teeC.routeUses.length, 4);
  assertClose(
    routeUse(teeB.routeUses, "technical-route:appliance-3").equivalentLengthMeters,
    0.755,
  );
  assertClose(
    routeUse(teeC.routeUses, "technical-route:appliance-4").equivalentLengthMeters,
    0.819,
  );
}

function assertMaterialTakeoffUsesPhysicalPieces(
  fixture: IntegratedTechnicalFlowFixture,
) {
  const routeUseCount = fixture.inventory.items.reduce(
    (sum, item) => sum + item.routeUses.length,
    0,
  );

  assertEqual(fixture.materialTakeoff.accessoryItems.length, 4);
  assertEqual(fixture.materialTakeoff.physicalMaterialQuantities.accessoryQuantity, 4);
  assert(
    fixture.materialTakeoff.physicalMaterialQuantities.accessoryQuantity <
      routeUseCount,
    "El BOM no debe contar recorridos como piezas fisicas.",
  );
  assertEqual(
    materialSourceIds(fixture).join(","),
    fixture.inventory.items.map((item) => item.id).sort().join(","),
  );
  assertPipeLength(fixture, D20, 12.85);
  assertPipeLength(fixture, D25, 6.15);
  assertPipeLength(fixture, D32, 3.5);
  assertClose(
    fixture.materialTakeoff.physicalMaterialQuantities.pipeLengthMeters,
    fixture.result.totals.physicalLengthMeters ?? 0,
  );
}

function assertAdoptedDiameters(
  validation: TechnicalAdoptedDiameterValidation,
) {
  assertAdoptedDiameter(validation, "M-C", 32);
  assertAdoptedDiameter(validation, "C-B", 25);
  assertAdoptedDiameter(validation, "C-4", 25);
  assertAdoptedDiameter(validation, "B-A", 20);
  assertAdoptedDiameter(validation, "A-1", 20);
  assertAdoptedDiameter(validation, "A-2", 20);
  assertAdoptedDiameter(validation, "B-3", 20);
}

function assertCalculationSheetLengths(fixture: IntegratedTechnicalFlowFixture) {
  for (const row of fixture.calculationSheet.rows) {
    assertEqual(row.status, "resolved");
    assert(
      row.initialRouteLengthMeters !== null &&
        row.accessoryEquivalentLengthMeters !== null &&
        row.transitionEquivalentLengthMeters !== null,
      `Faltan longitudes resueltas en ${row.segmentId}.`,
    );
    assertClose(
      row.finalCalculationLengthMeters,
      row.initialRouteLengthMeters +
        row.accessoryEquivalentLengthMeters +
        row.transitionEquivalentLengthMeters,
    );
    assertClose(
      fixture.equivalentVerificationBySegmentId[row.segmentId]
        ?.totalCalculationLengthMeters,
      row.finalCalculationLengthMeters ?? 0,
    );
  }
}

function assertIntegratedAxonometric(
  fixture: IntegratedTechnicalFlowFixture,
) {
  const view = fixture.axonometricView;

  assertEqual(view.nodes.length, fixture.network.nodes.length);
  assertEqual(view.segments.length, fixture.network.segments.length);
  assertEqual(view.accessories.length, fixture.inventory.items.length);
  assertEqual(node(view, "A").kind, "derivation");
  assertEqual(node(view, "B").kind, "derivation");
  assertEqual(node(view, "C").kind, "derivation");

  assertAxonometricSegment(view, "M-C", "M", "C", 0.5, 32);
  assertAxonometricSegment(view, "C-B", "C", "B", 0.5, 25);
  assertAxonometricSegment(view, "B-A", "B", "A", -0.25, 20);
  assertAxonometricSegment(view, "A-1", "A", "1", 0.45, 20);
  assertAxonometricSegment(view, "A-2", "A", "2", 1.05, 20);
  assertAxonometricSegment(view, "B-3", "B", "3", -0.7, 20);
  assertAxonometricSegment(view, "C-4", "C", "4", 1.5, 25);
}

function integratedAppliance(
  id: string,
  name: string,
  demandValue: number,
  x: number,
  y: number,
  z: number,
): WorkbenchEquipment {
  return {
    connectionPoint: { x, y, z },
    demandUnit: "kcal_h",
    demandValue,
    id,
    name,
    planBaseId: "plan",
    role: "appliance",
    source: "manual",
    type: "stove",
  };
}

function assertNormalizedKcal(
  result: TechnicalCalculationResult,
  equipmentId: string,
  kcalH: number,
) {
  const normalization =
    result.demandNormalizations.find((item) => item.equipmentId === equipmentId) ??
    null;

  assert(normalization, `Falta normalizacion de ${equipmentId}.`);
  assertEqual(normalization.status, "resolved");
  assertEqual(normalization.originalUnit, "kcal_h");
  assertEqual(normalization.originalValue, kcalH);
  assertClose(normalization.normalizedFlowM3h, kcalH / gasHeatingValue());
}

function assertSegmentFlow(
  result: TechnicalCalculationResult,
  segmentId: string,
  downstreamApplianceIds: string[],
  downstreamKcalH: number,
) {
  const item = resultSegment(result, segmentId);

  assertEqual(
    [...item.downstreamApplianceIds].sort().join(","),
    [...downstreamApplianceIds].sort().join(","),
  );
  assertEqual(item.accumulatedFlowUnit, "m3_h");
  assertClose(item.accumulatedFlow, downstreamKcalH / gasHeatingValue());
  assertClose(item.consumptionM3h, downstreamKcalH / gasHeatingValue());
}

function assertSegmentLengths(
  result: TechnicalCalculationResult,
  segmentId: string,
  physicalLengthMeters: number,
  calculationLengthMeters: number,
  provisionalDiameterMillimeters: number,
) {
  const item = resultSegment(result, segmentId);

  assertClose(item.segmentPhysicalLengthMeters, physicalLengthMeters);
  assertClose(item.physicalLengthMeters, physicalLengthMeters);
  assertClose(item.calculationLengthMeters, calculationLengthMeters);
  assertEqual(
    item.provisionalDiameter?.externalDiameterMillimeters,
    provisionalDiameterMillimeters,
  );
}

function assertAdoptedDiameter(
  validation: TechnicalAdoptedDiameterValidation,
  segmentId: string,
  expectedMillimeters: number,
) {
  const item = adoptedSegment(validation, segmentId);
  const adopted = item.adoptedDiameter?.externalDiameterMillimeters ?? null;
  const required = item.requiredDiameter?.externalDiameterMillimeters ?? null;

  assertEqual(item.status, "valid");
  assertEqual(item.provisionalDiameter?.externalDiameterMillimeters, expectedMillimeters);
  assertEqual(required, expectedMillimeters);
  assertEqual(adopted, expectedMillimeters);
  assert(
    adopted !== null && required !== null && adopted >= required,
    `Diametro adoptado menor al requerido en ${segmentId}.`,
  );
}

function assertAxonometricSegment(
  view: ReturnType<typeof createTechnicalAxonometricView>,
  segmentId: string,
  fromNodeId: string,
  toNodeId: string,
  zDeltaMeters: number,
  adoptedDiameterMillimeters: number,
) {
  const item = segment(view, segmentId);

  assertEqual(item.status, "resolved");
  assertEqual(item.fromNodeId, fromNodeId);
  assertEqual(item.toNodeId, toNodeId);
  assertClose(item.zDeltaMeters, zDeltaMeters);
  assertEqual(
    item.adoptedDiameter?.externalDiameterMillimeters,
    adoptedDiameterMillimeters,
  );
}

function assertPipeLength(
  fixture: IntegratedTechnicalFlowFixture,
  diameter: PipeDiameterReference,
  expectedMeters: number,
) {
  const item =
    fixture.materialTakeoff.pipeItems.find(
      (candidate) => candidate.diameter.id === diameter.id,
    ) ?? null;

  assert(item, `Falta material de cano ${diameter.label}.`);
  assertClose(item.physicalLengthMeters, expectedMeters);
}

function physicalAccessoryByNode(
  inventory: TechnicalPhysicalAccessoryInventory,
  nodeId: string,
  kind: TechnicalPhysicalAccessoryInventory["items"][number]["kind"],
) {
  const item =
    inventory.items.find(
      (candidate) => candidate.nodeId === nodeId && candidate.kind === kind,
    ) ?? null;

  assert(item, `Falta accesorio ${kind} en ${nodeId}.`);
  return item;
}

function routeUse(
  routeUses: TechnicalPhysicalAccessoryInventory["items"][number]["routeUses"],
  routeId: string,
) {
  const use = routeUses.find((candidate) => candidate.routeId === routeId) ?? null;

  assert(use, `Falta uso de accesorio para ${routeId}.`);
  return use;
}

function materialSourceIds(fixture: IntegratedTechnicalFlowFixture) {
  return fixture.materialTakeoff.accessoryItems
    .flatMap((item) => item.sourceIds)
    .sort();
}

function adoptedSegment(
  validation: TechnicalAdoptedDiameterValidation,
  segmentId: string,
) {
  const item =
    validation.segments.find((candidate) => candidate.segmentId === segmentId) ??
    null;

  assert(item, `Falta adopcion de diametro en ${segmentId}.`);
  return item;
}

function resultSegment(
  result: TechnicalCalculationResult,
  segmentId: string,
) {
  const item =
    result.segments.find((candidate) => candidate.segmentId === segmentId) ??
    null;

  assert(item, `Falta tramo tecnico ${segmentId}.`);
  return item;
}

function assertUnique(values: string[]) {
  assertEqual(values.length, new Set(values).size);
}

function routeUseKey(
  routeUse: TechnicalPhysicalAccessoryInventory["items"][number]["routeUses"][number],
) {
  return [
    routeUse.routeId,
    routeUse.segmentIds.join(","),
    routeUse.traversalKind ?? "",
    routeUse.variantLabel ?? "",
  ].join("|");
}

function diameterLabel(diameter: PipeDiameterReference | null | undefined) {
  return diameter?.id ?? null;
}

function gasHeatingValue() {
  return DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3;
}

function branchedAxonometricFixture() {
  const equipment: WorkbenchEquipment[] = [
    makeEquipment("meter", "M", "meter_regulator", "supply", 0, 0, 0),
    makeEquipment("cook", "Cocina", "stove", "appliance", 4, 3, 1.5),
    makeEquipment(
      "heater",
      "Calefactor",
      "space_heater",
      "appliance",
      8,
      -3,
      0.5,
    ),
    makeEquipment("boiler", "Caldera", "boiler", "appliance", 12, 3, 2.5),
    makeEquipment("dryer", "Secarropas", "gas_dryer", "appliance", 12, -3, 1.5),
  ];
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: "meter", id: "M", kind: "supply" },
      { id: "C", kind: "route", position: { x: 4, y: 0, z: 1 } },
      { id: "B", kind: "route", position: { x: 8, y: 1, z: 2 } },
      { id: "A", kind: "route", position: { x: 12, y: 0, z: 0.5 } },
      { equipmentId: "cook", id: "node-cook", kind: "appliance" },
      { equipmentId: "heater", id: "node-heater", kind: "appliance" },
      { equipmentId: "boiler", id: "node-boiler", kind: "appliance" },
      { equipmentId: "dryer", id: "node-dryer", kind: "appliance" },
    ],
    segments: [
      { fromNodeId: "M", id: "s-m-c", toNodeId: "C" },
      { fromNodeId: "C", id: "s-c-b", toNodeId: "B" },
      { fromNodeId: "B", id: "s-b-a", toNodeId: "A" },
      { fromNodeId: "C", id: "s-c-cook", toNodeId: "node-cook" },
      { fromNodeId: "B", id: "s-b-heater", toNodeId: "node-heater" },
      { fromNodeId: "A", id: "s-a-boiler", toNodeId: "node-boiler" },
      { fromNodeId: "A", id: "s-a-dryer", toNodeId: "node-dryer" },
    ],
  };
  const result = calculateTechnicalTree({
    equipment,
    minSegmentLengthSource: 0.000001,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: 1,
  });

  assertEqual(result.status, "valid");

  return {
    adoptedDiameterValidation: adoptedValidation({
      "s-a-boiler": D20,
      "s-a-dryer": D20,
      "s-b-a": D25,
      "s-b-heater": D20,
      "s-c-b": D25,
      "s-c-cook": D20,
      "s-m-c": D32,
    }),
    equipment,
    inventory: physicalAccessoryInventory(),
    network,
    result,
    scaleMetersPerSourceUnit: 1,
  };
}

function makeEquipment(
  id: string,
  name: string,
  type: WorkbenchEquipment["type"],
  role: WorkbenchEquipment["role"],
  x: number,
  y: number,
  z: number,
): WorkbenchEquipment {
  return {
    connectionPoint: { x, y, z },
    demandUnit: role === "appliance" ? "m3_h" : undefined,
    demandValue: role === "appliance" ? 0.6 : undefined,
    id,
    name,
    planBaseId: "plan",
    role,
    source: "manual",
    type,
  };
}

function adoptedValidation(
  diametersBySegmentId: Record<string, PipeDiameterReference>,
): TechnicalAdoptedDiameterValidation {
  const segments = Object.entries(diametersBySegmentId)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([segmentId, diameter]) => ({
      adoptedDiameter: diameter,
      availableDiameters: [D20, D25, D32],
      decision: null,
      explanation: "fixture",
      provisionalDiameter: diameter,
      reason: null,
      requiredDiameter: diameter,
      selectableDiameters: [diameter],
      segmentId,
      source: "required_default" as const,
      status: "valid" as const,
    }));

  return {
    invalidSegmentCount: 0,
    segments,
    status: "valid",
    unresolvedSegmentCount: 0,
  };
}

function physicalAccessoryInventory(): TechnicalPhysicalAccessoryInventory {
  return {
    accessoryIdsByRouteId: {
      "technical-route:boiler": ["physical-tee-b"],
      "technical-route:dryer": ["physical-tee-b"],
    },
    accessoryIdsBySegmentId: {
      "s-b-a": ["physical-tee-b"],
      "s-c-b": ["physical-tee-b"],
    },
    items: [
      {
        catalogCode: "tee-25",
        catalogFamilyId: "family-tee",
        diameters: [
          {
            diameter: D25,
            role: "single",
            segmentId: "s-b-a",
          },
        ],
        id: "physical-tee-b",
        kind: "tee",
        label: "Tee",
        nodeId: "B",
        position: null,
        routeUses: [
          {
            equivalentLengthMeters: 0.7,
            routeId: "technical-route:boiler",
            segmentIds: ["s-c-b", "s-b-a"],
            status: "resolved",
            traversalKind: null,
          },
          {
            equivalentLengthMeters: 0.7,
            routeId: "technical-route:dryer",
            segmentIds: ["s-c-b", "s-b-a"],
            status: "resolved",
            traversalKind: null,
          },
        ],
        segmentIds: ["s-b-a", "s-c-b"],
        source: "route_accessory",
        sourceIds: ["s-b-a:tee"],
        status: "resolved",
      },
    ],
    pendingItems: [],
    status: "resolved",
  };
}

function diameter(externalDiameterMillimeters: number): PipeDiameterReference {
  const value = SIGAS_DIAMETERS.find(
    (item) => item.externalDiameterMillimeters === externalDiameterMillimeters,
  );

  assert(value, `Falta diametro SIGAS ${externalDiameterMillimeters}.`);
  return value;
}

function node(
  view: ReturnType<typeof createTechnicalAxonometricView>,
  id: string,
) {
  const item = view.nodes.find((candidate) => candidate.id === id) ?? null;

  assert(item, `Falta nodo ${id}.`);
  return item;
}

function segment(
  view: ReturnType<typeof createTechnicalAxonometricView>,
  id: string,
) {
  const item = view.segments.find((candidate) => candidate.id === id) ?? null;

  assert(item, `Falta tramo ${id}.`);
  return item;
}

function verify(
  results: TechnicalAxonometricVerificationResult[],
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
      Math.abs(actual - expected) <= 0.000001,
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
  console.log(JSON.stringify(runTechnicalAxonometricVerifications(), null, 2));
}
