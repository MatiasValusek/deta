import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { pointZMeters } from "@/lib/geometry/height";
import {
  getConnectedApplianceEquipmentIds,
  resolveRouteSegments,
  routeEquipmentNodeId,
} from "@/lib/routing/network";
import type {
  AutomaticRouteRestriction,
  ManualRouteNetwork,
} from "@/lib/routing/types";
import {
  createCoordinatedInstallationFingerprint,
  createCoordinatedInstallationProposal,
  type CoordinatedInstallationSnapshot,
} from "./coordinatedInstallationProposal";

export type CoordinatedInstallationProposalVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const PLAN_BASE_ID = "plan:integration-02a";

export function runCoordinatedInstallationProposalVerifications() {
  const results: CoordinatedInstallationProposalVerificationResult[] = [];

  verify(
    results,
    "02A coordina XY y Z sobre copias deterministicas sin reidentificar XY",
    () => {
      const snapshot = automaticZSnapshot();
      const original = JSON.stringify(snapshot);
      const first = createCoordinatedInstallationProposal(snapshot);
      const repeated = createCoordinatedInstallationProposal(snapshot);
      const withDownstreamDecision = createCoordinatedInstallationProposal({
        ...snapshot,
        routeAccessoryProposalDecisions: [
          {
            decidedAt: 1,
            geometryKey: "stale-geometry",
            proposalId: "stale-proposal",
            status: "confirmed",
          },
        ],
      });

      assertEqual(first.xyProposal?.status, "ready");
      assertEqual(first.heightResult?.mode, "professional_distribution_height");
      assert(first.heightResult?.coordinatedSimulation, "Falta simulacion Z coordinada.");
      assertEqual(first.heightResult.automaticRisers?.status, "ready");
      assertEqual(first.simulation?.status, "ready");
      assertEqual(first.invalidities.length, 0);
      assert(
        networkHasVerticalLeg(first.candidateNetwork, first.candidateEquipment),
        "La candidata no incorporo los montantes Z.",
      );
      assert(
        first.warnings.some(
          (warning) => warning.code === "unverified_3d_clearance",
        ),
        "No se conservo la incertidumbre de despeje tridimensional.",
      );
      assertEqual(first.id, repeated.id);
      assertEqual(
        JSON.stringify(first.candidateNetwork),
        JSON.stringify(repeated.candidateNetwork),
      );
      assertEqual(JSON.stringify(snapshot), original);

      assert(
        first.fingerprint !== withDownstreamDecision.fingerprint,
        "La decision tecnica no actualizo el fingerprint integral.",
      );
      assertEqual(
        first.xyProposal?.params.fingerprint,
        withDownstreamDecision.xyProposal?.params.fingerprint,
      );
      assertEqual(
        first.xyProposal?.segments.map((segment) => segment.id).join(","),
        withDownstreamDecision.xyProposal?.segments
          .map((segment) => segment.id)
          .join(","),
      );
      assert(
        withDownstreamDecision.pendingDecisions.some(
          (decision) =>
            decision.code === "accessory_decision_reference_invalid" &&
            decision.referenceIds.includes("stale-proposal"),
        ),
        "No se informo la referencia tecnica obsoleta.",
      );
    },
  );

  verify(
    results,
    "02A conserva red confirmada, accesorio legado y diagonal horizontal valida",
    () => {
      const snapshot = confirmedHorizontalDiagonalSnapshot(0);
      const original = JSON.stringify(snapshot);
      const result = createCoordinatedInstallationProposal(snapshot);
      const legacyAccessory = result.candidateNetwork.segments
        .flatMap((segment) => segment.accessories ?? [])
        .find((accessory) => accessory.id === "legacy-elbow");

      assertEqual(result.status, "complete");
      assertEqual(result.xyProposal?.status, "ready");
      assertEqual(result.technicalResult.status, "valid");
      assertEqual(result.materialTakeoff.status, "resolved");
      assertEqual(result.pendingDecisions.length, 0);
      assertEqual(result.invalidities.length, 0);
      assert(legacyAccessory, "Se perdio el accesorio legado sin origin.");
      assertEqual(legacyAccessory.segmentId, "manual-diagonal");
      assertEqual(JSON.stringify(snapshot), original);
    },
  );

  verify(
    results,
    "02A rechaza una pata que cambia XY y Z simultaneamente",
    () => {
      const result = createCoordinatedInstallationProposal(
        confirmedHorizontalDiagonalSnapshot(1),
      );

      assertEqual(result.status, "invalid");
      assert(
        result.invalidities.some(
          (invalidity) =>
            invalidity.code === "invalid_orthogonal_geometry" &&
            invalidity.referenceIds.includes("manual-diagonal"),
        ),
        "No se detecto la pata diagonal tridimensional.",
      );
    },
  );

  verify(
    results,
    "02A conserva una propuesta XY parcial como incompleta y explicita lo pendiente",
    () => {
      const snapshot = partialXySnapshot();
      const result = createCoordinatedInstallationProposal(snapshot);

      assertEqual(result.xyProposal?.status, "partial");
      assertEqual(result.status, "incomplete");
      assertEqual(result.invalidities.length, 0);
      assertEqual(
        getConnectedApplianceEquipmentIds(
          result.candidateNetwork,
          result.candidateEquipment,
        ).size,
        1,
      );
      assert(
        result.pendingDecisions.some(
          (decision) =>
            decision.message === "El recorrido XY no alcanza todos los artefactos." &&
            decision.referenceIds.includes("appliance-blocked"),
        ),
        "No se explicito el artefacto pendiente del recorrido parcial.",
      );
    },
  );

  verify(
    results,
    "02A canonicaliza ordenes irrelevantes en el fingerprint integral",
    () => {
      const restrictions = distantRestrictions();
      const snapshot = {
        ...confirmedHorizontalDiagonalSnapshot(0),
        restrictions,
      };
      const permuted: CoordinatedInstallationSnapshot = {
        ...snapshot,
        equipment: [...snapshot.equipment].reverse(),
        network: {
          nodes: [...snapshot.network.nodes].reverse(),
          segments: snapshot.network.segments.map((segment) => ({
            ...segment,
            accessories: segment.accessories
              ? [...segment.accessories].reverse()
              : undefined,
          })),
        },
        restrictions: [...restrictions].reverse(),
      };

      assertEqual(
        createCoordinatedInstallationFingerprint(snapshot),
        createCoordinatedInstallationFingerprint(permuted),
      );
    },
  );

  return results;
}

function automaticZSnapshot(): CoordinatedInstallationSnapshot {
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: 0, z: 0.2 },
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "meter",
      name: "Medidor",
      planBaseId: PLAN_BASE_ID,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 8, y: 0, z: 1 },
      demandUnit: "m3_h",
      demandValue: 0.2,
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "appliance",
      name: "Artefacto",
      planBaseId: PLAN_BASE_ID,
      role: "appliance",
      source: "manual",
      terminalConfig: {
        connectionHeightMeters: 1,
        heightSource: "professional_edit",
        heightStatus: "confirmed",
        lateralOffsetMeters: 0,
        outletSide: "direct",
        requiresShutoffValve: true,
        terminalProfile: "generic_terminal",
        verticalDropMeters: 0,
      },
      type: "other",
    },
  ];

  return {
    bounds: { maxX: 10, maxY: 3, minX: -1, minY: -3 },
    equipment,
    marginMeters: 0.2,
    minSegmentLengthSource: EPSILON,
    network: { nodes: [], segments: [] },
    pipeSystem: SIGAS_PIPE_SYSTEM,
    planBaseId: PLAN_BASE_ID,
    preferredApplianceOrder: ["appliance"],
    professionalDistributionHeight: {
      heightMeters: 1.1,
      reference: "project_datum",
      source: "professional",
    },
    scaleMetersPerSourceUnit: 1,
  };
}

function confirmedHorizontalDiagonalSnapshot(
  applianceHeightMeters: number,
): CoordinatedInstallationSnapshot {
  const supplyNodeId = routeEquipmentNodeId(PLAN_BASE_ID, "meter");
  const applianceNodeId = routeEquipmentNodeId(PLAN_BASE_ID, "appliance");
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: 0, z: 0 },
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "meter",
      name: "Medidor",
      planBaseId: PLAN_BASE_ID,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 4, y: 4, z: applianceHeightMeters },
      demandUnit: "m3_h",
      demandValue: 0.2,
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "appliance",
      name: "Artefacto",
      planBaseId: PLAN_BASE_ID,
      role: "appliance",
      source: "manual",
      type: "other",
    },
  ];
  const network: ManualRouteNetwork = {
    nodes: [
      {
        elevation: { source: "professional_edit", status: "confirmed" },
        equipmentId: "meter",
        id: supplyNodeId,
        kind: "supply",
        origin: "manual",
      },
      {
        elevation: { source: "professional_edit", status: "confirmed" },
        equipmentId: "appliance",
        id: applianceNodeId,
        kind: "appliance",
        origin: "manual",
      },
    ],
    segments: [
      {
        accessories: [
          {
            equivalentLengthMetersPerUnit: 0.1,
            equivalentLengthSource: "manual",
            id: "legacy-elbow",
            quantity: 1,
            segmentId: "manual-diagonal",
            type: "elbow",
          },
          {
            equivalentLengthMetersPerUnit: 0.05,
            equivalentLengthSource: "manual",
            id: "legacy-valve",
            origin: "manual",
            quantity: 1,
            segmentId: "manual-diagonal",
            type: "valve",
          },
        ],
        fromNodeId: supplyNodeId,
        id: "manual-diagonal",
        origin: "manual",
        toNodeId: applianceNodeId,
      },
    ],
  };

  return {
    bounds: null,
    equipment,
    marginMeters: 0,
    minSegmentLengthSource: EPSILON,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    planBaseId: PLAN_BASE_ID,
    scaleMetersPerSourceUnit: 1,
  };
}

function partialXySnapshot(): CoordinatedInstallationSnapshot {
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: 0, z: 0 },
      id: "meter",
      name: "Medidor",
      planBaseId: PLAN_BASE_ID,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    appliance("appliance-ready", 3),
    appliance("appliance-blocked", 8),
  ];

  return {
    bounds: { maxX: 10, maxY: 2, minX: -1, minY: -2 },
    equipment,
    marginMeters: 0,
    minSegmentLengthSource: EPSILON,
    network: { nodes: [], segments: [] },
    pipeSystem: SIGAS_PIPE_SYSTEM,
    planBaseId: PLAN_BASE_ID,
    preferredApplianceOrder: ["appliance-ready", "appliance-blocked"],
    restrictions: [
      {
        id: "blocked-appliance-envelope",
        kind: "polygon",
        polygon: [
          { x: 7.5, y: -0.5 },
          { x: 8.5, y: -0.5 },
          { x: 8.5, y: 0.5 },
          { x: 7.5, y: 0.5 },
        ],
      },
    ],
    scaleMetersPerSourceUnit: 1,
  };
}

function appliance(id: string, x: number): WorkbenchEquipment {
  return {
    connectionPoint: { x, y: 0, z: 0 },
    demandUnit: "m3_h",
    demandValue: 0.2,
    id,
    name: id,
    planBaseId: PLAN_BASE_ID,
    role: "appliance",
    source: "manual",
    type: "other",
  };
}

function distantRestrictions(): AutomaticRouteRestriction[] {
  return [
    {
      from: { x: 20, y: 20 },
      id: "far-segment",
      kind: "segment",
      to: { x: 21, y: 20 },
    },
    {
      id: "far-polygon",
      kind: "polygon",
      polygon: [
        { x: 30, y: 30 },
        { x: 31, y: 30 },
        { x: 31, y: 31 },
      ],
    },
  ];
}

function networkHasVerticalLeg(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  return resolveRouteSegments(network, equipment).some((segment) =>
    segment.path.some((point, index) => {
      const next = segment.path[index + 1];
      return Boolean(
        next &&
          sameNumber(point.x, next.x) &&
          sameNumber(point.y, next.y) &&
          !sameNumber(pointZMeters(point), pointZMeters(next)),
      );
    }),
  );
}

function sameNumber(first: number, second: number) {
  return Math.abs(first - second) <= EPSILON;
}

function verify(
  results: CoordinatedInstallationProposalVerificationResult[],
  name: string,
  operation: () => void,
) {
  operation();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(
      `Se esperaba ${String(expected)} y se obtuvo ${String(actual)}.`,
    );
  }
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
    JSON.stringify(runCoordinatedInstallationProposalVerifications(), null, 2),
  );
}
