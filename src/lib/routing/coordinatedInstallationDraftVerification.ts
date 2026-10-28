import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  routeEquipmentNodeId,
} from "@/lib/routing/network";
import {
  detectRouteAccessoryProposals,
  type AccessoryProposalDecision,
} from "@/lib/routing/routeAccessoryProposals";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  acceptCoordinatedInstallationDraft,
  createCoordinatedInstallationDraft,
  discardCoordinatedInstallationDraft,
  editCoordinatedInstallationDraft,
  regenerateCoordinatedInstallationDraft,
  type CoordinatedInstallationDraft,
} from "./coordinatedInstallationDraft";
import {
  createCoordinatedInstallationProposal,
  type CoordinatedInstallationProposal,
  type CoordinatedInstallationSnapshot,
} from "./coordinatedInstallationProposal";

export type CoordinatedInstallationDraftVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;
const PLAN_BASE_ID = "plan:integration-02b";

export function runCoordinatedInstallationDraftVerifications() {
  const results: CoordinatedInstallationDraftVerificationResult[] = [];

  verify(
    results,
    "02B edita nodos, vertices, recorrido y altura solo sobre el borrador",
    () => {
      const snapshot = editableSnapshot();
      const originalSnapshot = JSON.stringify(snapshot);
      const proposal = createCoordinatedInstallationProposal(snapshot);
      const initial = requiredDraft(
        createCoordinatedInstallationDraft({ proposal, snapshot }),
      );
      const initialDraftNetwork = JSON.stringify(initial.proposalDraftNetwork);

      assertEqual(proposal.status, "complete");
      assertEqual(initial.readiness.geometricAcceptance, "ready");

      const inserted = requiredEditedDraft(
        initial,
        snapshot,
        {
          kind: "insert_vertex",
          point: { x: 6, y: 0 },
          segmentId: "B-A",
          tolerance: EPSILON,
        },
      );
      assertPoint(routeSegment(inserted, "B-A").vertices?.[0], { x: 6, y: 0 });

      const movedVertex = requiredEditedDraft(
        inserted,
        snapshot,
        {
          kind: "move_vertex",
          point: { x: 6, y: 1 },
          segmentId: "B-A",
          vertexIndex: 0,
        },
      );
      assertPoint(routeSegment(movedVertex, "B-A").vertices?.[0], {
        x: 6,
        y: 1,
      });

      const removed = requiredEditedDraft(
        movedVertex,
        snapshot,
        {
          kind: "remove_vertex",
          segmentId: "B-A",
          vertexIndex: 0,
        },
      );
      assertEqual(routeSegment(removed, "B-A").vertices, undefined);

      const movedNode = requiredEditedDraft(
        removed,
        snapshot,
        {
          kind: "move_node",
          nodeId: "B",
          point: { x: 4, y: 1 },
          tolerance: EPSILON,
        },
      );
      assertPoint(routeNode(movedNode, "B").position, { x: 4, y: 1, z: 0 });
      assertEqual(movedNode.lastEdit?.affectedSegmentIds.join(","), "B-A,S-B");

      const editedHeight = requiredEditedDraft(
        movedNode,
        snapshot,
        {
          heightMeters: 0.5,
          kind: "set_height",
          target: { kind: "node", nodeId: "B" },
        },
      );
      assertPoint(routeNode(editedHeight, "B").position, {
        x: 4,
        y: 1,
        z: 0.5,
      });
      assertEqual(editedHeight.evaluation.status, "invalid");
      assert(
        editedHeight.evaluation.invalidities.some(
          (item) => item.code === "invalid_orthogonal_geometry",
        ),
        "La edicion Z no se revalido contra la geometria 3D.",
      );

      assertEqual(JSON.stringify(snapshot), originalSnapshot);
      assertEqual(JSON.stringify(initial.proposalDraftNetwork), initialDraftNetwork);
      assert(
        JSON.stringify(editedHeight.proposalDraftNetwork) !==
          JSON.stringify(snapshot.network),
        "El borrador editado no cambio.",
      );
    },
  );

  verify(
    results,
    "02B regenera desde confirmada y descarta sin modificar el proyecto",
    () => {
      const snapshot = editableSnapshot();
      const original = JSON.stringify(snapshot);
      const proposal = createCoordinatedInstallationProposal(snapshot);
      const initial = requiredDraft(
        createCoordinatedInstallationDraft({ proposal, snapshot }),
      );
      const edited = requiredEditedDraft(initial, snapshot, {
        kind: "move_node",
        nodeId: "B",
        point: { x: 4, y: 1 },
        tolerance: EPSILON,
      });
      const regenerated = regenerateCoordinatedInstallationDraft(snapshot);

      assert(regenerated.ok, regenerated.ok ? "" : regenerated.message);
      assert(regenerated.proposal, "Falta propuesta regenerada.");
      assertEqual(regenerated.draft.revision, 0);
      assertEqual(
        JSON.stringify(regenerated.draft.proposalDraftNetwork),
        JSON.stringify(regenerated.proposal.candidateNetwork),
      );
      assert(
        JSON.stringify(regenerated.draft.proposalDraftNetwork) !==
          JSON.stringify(edited.proposalDraftNetwork),
        "La regeneracion conservo indebidamente la edicion anterior.",
      );

      const discarded = discardCoordinatedInstallationDraft({
        draft: edited,
        snapshot,
      });
      assertEqual(discarded.status, "discarded");
      assertEqual(JSON.stringify(discarded.network), JSON.stringify(snapshot.network));
      assertEqual(
        JSON.stringify(discarded.equipment),
        JSON.stringify(snapshot.equipment),
      );
      assertEqual(JSON.stringify(snapshot), original);
    },
  );

  verify(
    results,
    "02B acepta atomicamente solo una propuesta completa, integra y vigente",
    () => {
      const snapshot = editableSnapshot();
      const original = JSON.stringify(snapshot);
      const proposal = createCoordinatedInstallationProposal(snapshot);
      const draft = requiredDraft(
        createCoordinatedInstallationDraft({ proposal, snapshot }),
      );
      const accepted = acceptCoordinatedInstallationDraft({ draft, snapshot });

      assert(accepted.ok, accepted.ok ? "" : accepted.message);
      assertEqual(accepted.evaluation.status, "complete");
      assertEqual(
        accepted.update.acceptedCandidateFingerprint,
        draft.draftFingerprint,
      );
      assertEqual(
        JSON.stringify(accepted.update.network),
        JSON.stringify(draft.proposalDraftNetwork),
      );
      assert(accepted.update.network !== snapshot.network, "El payload no es una copia independiente.");
      assertEqual(JSON.stringify(snapshot), original);

      const staleSnapshot = { ...snapshot, marginMeters: 0.25 };
      const stale = acceptCoordinatedInstallationDraft({
        draft,
        snapshot: staleSnapshot,
      });
      assertEqual(stale.ok, false);
      if (!stale.ok) {
        assertEqual(stale.code, "proposal_outdated");
      }

      const tampered = clone(draft);
      const node = tampered.proposalDraftNetwork.nodes.find(
        (candidate) => candidate.id === "B",
      );
      assert(node?.position, "Falta nodo editable.");
      node.position.x += 1;
      const outsideEdit = acceptCoordinatedInstallationDraft({
        draft: tampered,
        snapshot,
      });
      assertEqual(outsideEdit.ok, false);
      if (!outsideEdit.ok) {
        assertEqual(outsideEdit.code, "draft_modified_outside_session");
      }

      const invalidDraft = requiredEditedDraft(draft, snapshot, {
        heightMeters: 0.5,
        kind: "set_height",
        target: { kind: "node", nodeId: "B" },
      });
      const invalidAcceptance = acceptCoordinatedInstallationDraft({
        draft: invalidDraft,
        snapshot,
      });
      assertEqual(invalidAcceptance.ok, false);
      if (!invalidAcceptance.ok) {
        assertEqual(invalidAcceptance.code, "geometry_invalid");
      }
    },
  );

  verify(
    results,
    "02B conserva decisiones incompatibles y las expone como pendientes",
    () => {
      const snapshot = snapshotWithAccessoryDecision();
      const original = JSON.stringify(snapshot);
      const proposal = createCoordinatedInstallationProposal(snapshot);
      const initial = requiredDraft(
        createCoordinatedInstallationDraft({ proposal, snapshot }),
      );
      const edited = requiredEditedDraft(initial, snapshot, {
        kind: "move_node",
        nodeId: "B",
        point: { x: 5, y: 0 },
        tolerance: EPSILON,
      });
      const decision = snapshot.routeAccessoryProposalDecisions?.[0];

      assert(decision, "Falta decision de accesorio de prueba.");
      assertEqual(
        edited.technicalState.routeAccessoryProposalDecisions.length,
        1,
      );
      assertEqual(
        edited.technicalState.routeAccessoryProposalDecisions[0]?.proposalId,
        decision.proposalId,
      );
      assert(
        edited.evaluation.pendingDecisions.some(
          (pending) =>
            pending.code === "accessory_decision_reference_invalid" &&
            pending.referenceIds.includes(decision.proposalId),
        ),
        "La decision incompatible desaparecio sin quedar pendiente.",
      );
      assert(
        edited.lastEdit?.invalidatedDecisionReferenceIds.includes(
          decision.proposalId,
        ),
        "El impacto de edicion no identifica la decision invalidada.",
      );

      const acceptance = acceptCoordinatedInstallationDraft({
        draft: edited,
        snapshot,
      });
      assertEqual(acceptance.ok, false);
      if (!acceptance.ok) {
        assertEqual(acceptance.code, "proposal_incomplete");
      }
      assertEqual(JSON.stringify(snapshot), original);
    },
  );

  verify(
    results,
    "02C2 mantiene editable una propuesta incompleta y actualiza sus pendientes",
    () => {
      const snapshot = snapshotWithAccessoryDecision();
      const confirmedNetwork = JSON.stringify(snapshot.network);
      const proposal = createCoordinatedInstallationProposal(snapshot);
      const initial = requiredDraft(
        createCoordinatedInstallationDraft({ proposal, snapshot }),
      );
      const incomplete = requiredEditedDraft(initial, snapshot, {
        kind: "move_node",
        nodeId: "B",
        point: { x: 5, y: 0 },
        tolerance: EPSILON,
      });

      assertEqual(incomplete.evaluation.status, "incomplete");
      assert(incomplete.evaluation.pendingDecisions.length > 0, "Falta el pendiente esperado.");

      const resolved = requiredEditedDraft(incomplete, snapshot, {
        kind: "move_node",
        nodeId: "B",
        point: { x: 4, y: 0 },
        tolerance: EPSILON,
      });

      assertEqual(resolved.evaluation.status, "complete");
      assertEqual(resolved.evaluation.pendingDecisions.length, 0);
      assertEqual(resolved.revision, 2);
      assertEqual(JSON.stringify(snapshot.network), confirmedNetwork);
    },
  );

  verify(
    results,
    "02B revalida restricciones confirmadas despues de editar XY",
    () => {
      const snapshot: CoordinatedInstallationSnapshot = {
        ...editableSnapshot(),
        restrictions: [
          {
            from: { x: 5, y: 0.5 },
            id: "confirmed-wall",
            kind: "segment",
            to: { x: 5, y: 1.5 },
          },
        ],
      };
      const proposal = createCoordinatedInstallationProposal(snapshot);
      const initial = requiredDraft(
        createCoordinatedInstallationDraft({ proposal, snapshot }),
      );
      const edited = requiredEditedDraft(initial, snapshot, {
        kind: "move_node",
        nodeId: "B",
        point: { x: 5, y: 1 },
        tolerance: EPSILON,
      });

      assert(
        edited.evaluation.invalidities.some(
          (invalidity) =>
            invalidity.code === "known_restriction_collision" &&
            invalidity.referenceIds.includes("confirmed-wall"),
        ),
        "La edicion no detecto la restriccion confirmada.",
      );
      assertEqual(edited.readiness.geometricAcceptance, "blocked");
      const acceptance = acceptCoordinatedInstallationDraft({
        draft: edited,
        snapshot,
      });
      assertEqual(acceptance.ok, false);
      if (!acceptance.ok) {
        assertEqual(acceptance.code, "geometry_invalid");
      }
    },
  );

  verify(
    results,
    "02B separa aceptacion geometrica de aprobacion tecnica 3D",
    () => {
      const snapshot = editableSnapshot();
      const baseProposal = createCoordinatedInstallationProposal(snapshot);
      const proposal: CoordinatedInstallationProposal = {
        ...baseProposal,
        warnings: [
          ...baseProposal.warnings,
          {
            code: "unverified_3d_clearance",
            message: "Falta verificar el despeje constructivo del montante.",
            referenceIds: ["riser:test"],
          },
        ],
      };
      const draft = requiredDraft(
        createCoordinatedInstallationDraft({ proposal, snapshot }),
      );

      assertEqual(draft.evaluation.status, "complete");
      assertEqual(draft.readiness.geometricAcceptance, "ready");
      assertEqual(draft.readiness.technicalApproval, "required");

      const withoutApproval = acceptCoordinatedInstallationDraft({
        draft,
        snapshot,
      });
      assertEqual(withoutApproval.ok, false);
      if (!withoutApproval.ok) {
        assertEqual(withoutApproval.code, "technical_approval_required");
      }

      const accepted = acceptCoordinatedInstallationDraft({
        draft,
        snapshot,
        technicalApproval: {
          approved: true,
          candidateFingerprint: draft.draftFingerprint,
          warningKeys: draft.readiness.requiredTechnicalApprovalWarningKeys,
        },
      });
      assert(accepted.ok, accepted.ok ? "" : accepted.message);
      assertEqual(accepted.update.warnings.length, 1);
    },
  );

  return results;
}

function editableSnapshot(): CoordinatedInstallationSnapshot {
  const supplyNodeId = routeEquipmentNodeId(PLAN_BASE_ID, "meter");
  const applianceNodeId = routeEquipmentNodeId(PLAN_BASE_ID, "appliance");
  const equipment = fixtureEquipment({ appliancePoint: { x: 8, y: 0, z: 0 } });
  const network: ManualRouteNetwork = {
    nodes: [
      equipmentNode(supplyNodeId, "meter", "supply"),
      {
        elevation: { source: "professional_edit", status: "confirmed" },
        id: "B",
        kind: "route",
        origin: "manual",
        position: { x: 4, y: 0, z: 0 },
      },
      equipmentNode(applianceNodeId, "appliance", "appliance"),
    ],
    segments: [
      {
        fromNodeId: supplyNodeId,
        id: "S-B",
        origin: "manual",
        toNodeId: "B",
      },
      {
        fromNodeId: "B",
        id: "B-A",
        origin: "manual",
        toNodeId: applianceNodeId,
      },
    ],
  };

  return baseSnapshot(equipment, network);
}

function snapshotWithAccessoryDecision(): CoordinatedInstallationSnapshot {
  const supplyNodeId = routeEquipmentNodeId(PLAN_BASE_ID, "meter");
  const applianceNodeId = routeEquipmentNodeId(PLAN_BASE_ID, "appliance");
  const equipment = fixtureEquipment({ appliancePoint: { x: 4, y: 4, z: 0 } });
  const network: ManualRouteNetwork = {
    nodes: [
      equipmentNode(supplyNodeId, "meter", "supply"),
      {
        elevation: { source: "professional_edit", status: "confirmed" },
        id: "B",
        kind: "route",
        origin: "manual",
        position: { x: 4, y: 0, z: 0 },
      },
      equipmentNode(applianceNodeId, "appliance", "appliance"),
    ],
    segments: [
      {
        fromNodeId: supplyNodeId,
        id: "S-B",
        origin: "manual",
        toNodeId: "B",
      },
      {
        fromNodeId: "B",
        id: "B-A",
        origin: "manual",
        toNodeId: applianceNodeId,
      },
    ],
  };
  const detected = detectRouteAccessoryProposals({
    equipment,
    network,
    scaleMetersPerSourceUnit: 1,
  }).find((proposal) => proposal.nodeId === "B");
  assert(detected, "Falta propuesta de accesorio inicial.");
  const decision: AccessoryProposalDecision = {
    decidedAt: 1,
    geometryKey: detected.geometryKey,
    proposalId: detected.id,
    status: "confirmed",
  };

  return {
    ...baseSnapshot(equipment, network),
    routeAccessoryProposalDecisions: [decision],
  };
}

function fixtureEquipment(params: {
  appliancePoint: { x: number; y: number; z: number };
}): WorkbenchEquipment[] {
  return [
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
      connectionPoint: params.appliancePoint,
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
}

function equipmentNode(
  id: string,
  equipmentId: string,
  kind: "appliance" | "supply",
): ManualRouteNetwork["nodes"][number] {
  return {
    elevation: { source: "professional_edit", status: "confirmed" },
    equipmentId,
    id,
    kind,
    origin: "manual",
  };
}

function baseSnapshot(
  equipment: WorkbenchEquipment[],
  network: ManualRouteNetwork,
): CoordinatedInstallationSnapshot {
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

function requiredDraft(
  result: ReturnType<typeof createCoordinatedInstallationDraft>,
) {
  assert(result.ok, result.ok ? "" : result.message);
  return result.draft;
}

function requiredEditedDraft(
  draft: CoordinatedInstallationDraft,
  snapshot: CoordinatedInstallationSnapshot,
  edit: Parameters<typeof editCoordinatedInstallationDraft>[0]["edit"],
) {
  const result = editCoordinatedInstallationDraft({ draft, edit, snapshot });
  assert(result.ok, result.ok ? "" : result.message);
  return result.draft;
}

function routeNode(draft: CoordinatedInstallationDraft, nodeId: string) {
  const node = draft.proposalDraftNetwork.nodes.find(
    (candidate) => candidate.id === nodeId,
  );
  assert(node, `Falta nodo ${nodeId}.`);
  return node;
}

function routeSegment(
  draft: CoordinatedInstallationDraft,
  segmentId: string,
) {
  const segment = draft.proposalDraftNetwork.segments.find(
    (candidate) => candidate.id === segmentId,
  );
  assert(segment, `Falta tramo ${segmentId}.`);
  return segment;
}

function assertPoint(
  actual: { x: number; y: number; z?: number } | null | undefined,
  expected: { x: number; y: number; z?: number },
) {
  assert(actual, "Falta punto esperado.");
  assertClose(actual.x, expected.x);
  assertClose(actual.y, expected.y);
  if (expected.z !== undefined) {
    assertClose(actual.z ?? 0, expected.z);
  }
}

function assertClose(actual: number, expected: number) {
  assert(
    Math.abs(actual - expected) <= EPSILON,
    `Se esperaba ${expected} y se obtuvo ${actual}.`,
  );
}

function verify(
  results: CoordinatedInstallationDraftVerificationResult[],
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(
    JSON.stringify(runCoordinatedInstallationDraftVerifications(), null, 2),
  );
}
