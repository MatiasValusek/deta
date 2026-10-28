import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { routeEquipmentNodeId } from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  createCoordinatedInstallationDraft,
  editCoordinatedInstallationDraft,
  type CoordinatedInstallationDraft,
} from "./coordinatedInstallationDraft";
import {
  createCoordinatedInstallationProposal,
  type CoordinatedInstallationSnapshot,
} from "./coordinatedInstallationProposal";
import {
  createCoordinatedInstallationPlanProposal,
  createCoordinatedInstallationTechnicalViews,
  createCoordinatedInstallationVisualization,
} from "./coordinatedInstallationVisualization";

export type CoordinatedInstallationVisualizationVerificationResult = {
  name: string;
  status: "passed";
};

const PLAN_BASE_ID = "plan:integration-02c1";
const EPSILON = 0.000001;

export function runCoordinatedInstallationVisualizationVerifications() {
  const results: CoordinatedInstallationVisualizationVerificationResult[] = [];

  verify(results, "02C1 comparte un unico borrador sin alterar la red confirmada", () => {
    const snapshot = visualizationSnapshot();
    const confirmedBefore = JSON.stringify(snapshot.network);
    const proposal = createCoordinatedInstallationProposal(snapshot);
    const draft = requiredDraft(
      createCoordinatedInstallationDraft({ proposal, snapshot }),
    );
    const visualization = createCoordinatedInstallationVisualization({
      draft,
      proposal,
    });
    const repeated = createCoordinatedInstallationVisualization({
      draft,
      proposal,
    });

    assertEqual(visualization.status, "complete");
    assertEqual(visualization.source, "draft");
    assert(visualization.network === draft.proposalDraftNetwork, "Se copio la red visualizada.");
    assert(visualization.equipment === draft.proposalDraftEquipment, "Se copio el equipo visualizado.");
    assert(
      visualization.technicalResult === draft.evaluation.technicalResult,
      "Se recalculo el resultado tecnico para visualizar.",
    );
    assert(repeated.network === visualization.network, "La seleccion no es estable.");
    assertEqual(JSON.stringify(snapshot.network), confirmedBefore);
  });

  verify(results, "02C1 planta, cortes y axonometrica conservan XY, montantes y Z", () => {
    const snapshot = visualizationSnapshot();
    const proposal = createCoordinatedInstallationProposal(snapshot);
    const initial = requiredDraft(
      createCoordinatedInstallationDraft({ proposal, snapshot }),
    );
    const withFirstVertex = requiredEditedDraft(initial, snapshot, {
      kind: "insert_vertex",
      point: { x: 5, y: 0 },
      segmentId: "B-A",
      tolerance: EPSILON,
    });
    const withVertices = requiredEditedDraft(withFirstVertex, snapshot, {
      kind: "insert_vertex",
      point: { x: 7, y: 0 },
      segmentId: "B-A",
      tolerance: EPSILON,
    });
    const firstElevated = requiredEditedDraft(withVertices, snapshot, {
      heightMeters: 0.5,
      kind: "set_height",
      target: { kind: "segment_vertex", segmentId: "B-A", vertexIndex: 0 },
    });
    const elevated = requiredEditedDraft(firstElevated, snapshot, {
      heightMeters: 0.5,
      kind: "set_height",
      target: { kind: "segment_vertex", segmentId: "B-A", vertexIndex: 1 },
    });
    const firstRiser = requiredEditedDraft(elevated, snapshot, {
      kind: "move_vertex",
      point: { x: 4, y: 0 },
      segmentId: "B-A",
      vertexIndex: 0,
    });
    const riserDraft = requiredEditedDraft(firstRiser, snapshot, {
      kind: "move_vertex",
      point: { x: 8, y: 0 },
      segmentId: "B-A",
      vertexIndex: 1,
    });
    const visualization = createCoordinatedInstallationVisualization({
      draft: riserDraft,
      proposal,
    });
    const planProposal = createCoordinatedInstallationPlanProposal({
      planBaseId: PLAN_BASE_ID,
      proposal,
      visualization,
    });
    const views = createCoordinatedInstallationTechnicalViews({
      pipeSystem: SIGAS_PIPE_SYSTEM,
      scaleMetersPerSourceUnit: 1,
      visualization,
    });
    const networkSegmentIds = sorted(
      visualization.network.segments.map((segment) => segment.id),
    );

    assert(planProposal.nodes === visualization.network.nodes, "Planta uso otros nodos.");
    assert(planProposal.segments === visualization.network.segments, "Planta uso otros tramos.");
    assertEqual(
      planProposal.segments.find((segment) => segment.id === "B-A")?.vertices?.[0]?.x,
      4,
    );
    assertEqual(
      planProposal.segments.find((segment) => segment.id === "B-A")?.vertices?.[0]?.z,
      0.5,
    );
    assertEqual(
      sorted(views.axonometricView.segments.map((segment) => segment.id)).join(","),
      networkSegmentIds.join(","),
    );
    assertEqual(
      sorted(
        views.sectionViews["section-aa"].projection.segments.map(
          (segment) => segment.segmentId,
        ),
      ).join(","),
      networkSegmentIds.join(","),
    );
    assertEqual(
      sorted(
        views.sectionViews["section-bb"].projection.segments.map(
          (segment) => segment.segmentId,
        ),
      ).join(","),
      networkSegmentIds.join(","),
    );
    assert(
      views.axonometricView.segments.some((segment) =>
        segment.path.some((point) => Math.abs(point.elevationMeters - 0.5) <= EPSILON),
      ),
      "Axonometrica perdio el cambio interno de Z.",
    );
    assert(
      views.sectionViews["section-aa"].projection.segments.some((segment) =>
        segment.points.some(
          (point) => Math.abs(point.elevationMeters - 0.5) <= EPSILON,
        ),
      ),
      "Corte A-A perdio el cambio interno de Z.",
    );
  });

  verify(results, "02C1 expone estados y advertencias sin aprobar tecnicamente", () => {
    const snapshot = visualizationSnapshot();
    const proposal = createCoordinatedInstallationProposal(snapshot);
    const draft = requiredDraft(
      createCoordinatedInstallationDraft({ proposal, snapshot }),
    );
    const incompleteDraft: CoordinatedInstallationDraft = {
      ...draft,
      evaluation: {
        ...draft.evaluation,
        pendingDecisions: [
          {
            code: "technical_definition_required",
            message: "Definicion tecnica pendiente.",
            neededData: "Revision profesional.",
            referenceIds: ["B-A"],
          },
        ],
        status: "incomplete",
        warnings: [
          {
            code: "unverified_3d_clearance",
            message: "Interferencias constructivas 3D no verificadas.",
            referenceIds: ["B-A"],
          },
        ],
      },
    };
    const visualization = createCoordinatedInstallationVisualization({
      draft: incompleteDraft,
      proposal,
    });

    assertEqual(visualization.status, "incomplete");
    assertEqual(visualization.technicalApproval, "not_approved");
    assert(
      visualization.warnings.some(
        (warning) => warning.code === "unverified_3d_clearance",
      ),
      "Se oculto la incertidumbre constructiva 3D.",
    );
    assertEqual(visualization.pendingDecisions.length, 1);

    const invalidVisualization = createCoordinatedInstallationVisualization({
      draft: {
        ...draft,
        evaluation: {
          ...draft.evaluation,
          invalidities: [
            {
              code: "invalid_riser_geometry",
              message: "Montante invalido.",
              referenceIds: ["B-A"],
            },
          ],
          status: "invalid",
        },
      },
      proposal,
    });
    assertEqual(invalidVisualization.status, "invalid");
    assertEqual(invalidVisualization.invalidities.length, 1);
  });

  return results;
}

function visualizationSnapshot(): CoordinatedInstallationSnapshot {
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
      connectionPoint: { x: 8, y: 0, z: 0 },
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
      equipmentNode(routeEquipmentNodeId(PLAN_BASE_ID, "meter"), "meter", "supply"),
      {
        elevation: { source: "professional_edit", status: "confirmed" },
        id: "B",
        kind: "route",
        origin: "manual",
        position: { x: 4, y: 0, z: 0 },
      },
      equipmentNode(
        routeEquipmentNodeId(PLAN_BASE_ID, "appliance"),
        "appliance",
        "appliance",
      ),
    ],
    segments: [
      {
        fromNodeId: routeEquipmentNodeId(PLAN_BASE_ID, "meter"),
        id: "S-B",
        origin: "manual",
        toNodeId: "B",
      },
      {
        fromNodeId: "B",
        id: "B-A",
        origin: "manual",
        toNodeId: routeEquipmentNodeId(PLAN_BASE_ID, "appliance"),
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

function sorted(values: string[]) {
  return [...values].sort((first, second) => first.localeCompare(second));
}

function verify(
  results: CoordinatedInstallationVisualizationVerificationResult[],
  name: string,
  operation: () => void,
) {
  operation();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Se esperaba ${String(expected)} y se obtuvo ${String(actual)}.`);
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
    JSON.stringify(runCoordinatedInstallationVisualizationVerifications(), null, 2),
  );
}
