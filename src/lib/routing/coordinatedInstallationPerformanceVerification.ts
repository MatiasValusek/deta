import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { pointZMeters } from "@/lib/geometry/height";
import {
  buildEquipmentIndex,
  detectRouteCycle,
  hasDuplicateSegments,
  resolveRouteNodePosition,
} from "@/lib/routing/network";
import {
  acceptCoordinatedInstallationDraft,
  createCoordinatedInstallationDraftSnapshot,
  discardCoordinatedInstallationDraft,
  editCoordinatedInstallationDraft,
  regenerateCoordinatedInstallationDraft,
} from "./coordinatedInstallationDraft";
import type { CoordinatedInstallationSnapshot } from "./coordinatedInstallationProposal";
import {
  createCoordinatedInstallationTechnicalViews,
  createCoordinatedInstallationVisualization,
  type CoordinatedInstallationTechnicalViews,
} from "./coordinatedInstallationVisualization";

export type CoordinatedInstallationPerformanceMeasurement = {
  applianceCount: number;
  persistedDraftBytes: number;
  editMs: number;
  generationMs: number;
  nodeCount: number;
  persistenceSerializationMs: number;
  scenario: "small" | "medium" | "complex";
  segmentCount: number;
  technicalViewsMs: number;
  viewChangeAverageMs: number;
};

export type CoordinatedInstallationPerformanceVerification = {
  measurements: CoordinatedInstallationPerformanceMeasurement[];
  results: Array<{ name: string; status: "passed" }>;
};

const SCENARIOS = [
  { applianceCount: 2, scenario: "small" as const },
  { applianceCount: 8, scenario: "medium" as const },
  { applianceCount: 20, scenario: "complex" as const },
];

export function runCoordinatedInstallationPerformanceVerifications(): CoordinatedInstallationPerformanceVerification {
  const measurements: CoordinatedInstallationPerformanceMeasurement[] = [];
  const results: CoordinatedInstallationPerformanceVerification["results"] = [];

  for (const scenario of SCENARIOS) {
    const snapshot = createPerformanceSnapshot(scenario.applianceCount);
    const confirmedBefore = JSON.stringify({
      equipment: snapshot.equipment,
      network: snapshot.network,
    });
    regenerateCoordinatedInstallationDraft(snapshot);
    const generation = measureMedian(3, () =>
      regenerateCoordinatedInstallationDraft(snapshot),
    );
    assert(generation.value.ok, generation.value.ok ? "" : generation.value.message);
    assert(generation.value.proposal, "Falta la propuesta coordinada medida.");
    const draft = generation.value.draft;
    const proposal = generation.value.proposal;
    const equipmentById = buildEquipmentIndex(draft.proposalDraftEquipment);
    const routeNode = draft.proposalDraftNetwork.nodes.find(
      (node) => node.kind === "route" && resolveRouteNodePosition(node, equipmentById),
    );
    assert(routeNode, "La red medida no contiene un nodo editable.");
    const routeNodePoint = resolveRouteNodePosition(
      routeNode,
      equipmentById,
    );
    assert(routeNodePoint, "El nodo medido no tiene posicion.");
    const edit = measureMedian(3, () =>
      editCoordinatedInstallationDraft({
        draft,
        edit: {
          heightMeters: pointZMeters(routeNodePoint) + 0.01,
          kind: "set_height",
          target: { kind: "node", nodeId: routeNode.id },
        },
        snapshot,
      }),
    );
    assert(edit.value.ok, edit.value.ok ? "" : edit.value.message);
    const visualization = createCoordinatedInstallationVisualization({
      draft: edit.value.draft,
      proposal,
    });
    const technicalViews = measureMedian(3, () =>
      createCoordinatedInstallationTechnicalViews({
        pipeSystem: SIGAS_PIPE_SYSTEM,
        scaleMetersPerSourceUnit: snapshot.scaleMetersPerSourceUnit,
        visualization,
      }),
    );
    const views = technicalViews.value;
    const viewChangeAverageMs = measureViewChanges(views, 30_000);
    const persistedDraft = createCoordinatedInstallationDraftSnapshot(
      edit.value.draft,
    );
    const persistenceSerialization = measureMedian(5, () =>
      JSON.stringify(persistedDraft),
    );
    const discarded = discardCoordinatedInstallationDraft({
      draft: edit.value.draft,
      snapshot,
    });
    const regenerated = regenerateCoordinatedInstallationDraft(snapshot);
    const acceptance = acceptCoordinatedInstallationDraft({
      draft,
      snapshot,
      technicalApproval: {
        approved: true,
        candidateFingerprint: draft.draftFingerprint,
        warningKeys: draft.readiness.requiredTechnicalApprovalWarningKeys,
      },
    });

    assert(regenerated.ok, regenerated.ok ? "" : regenerated.message);
    assert(
      acceptance.ok || acceptance.code === "proposal_incomplete",
      acceptance.ok ? "" : acceptance.message,
    );
    assertEqual(
      JSON.stringify({ equipment: snapshot.equipment, network: snapshot.network }),
      confirmedBefore,
      "La medicion modifico la instalacion confirmada.",
    );
    assertEqual(
      JSON.stringify({ equipment: discarded.equipment, network: discarded.network }),
      confirmedBefore,
      "Descartar no devolvio intacta la instalacion confirmada.",
    );
    assertUniqueIds(regenerated.draft.proposalDraftNetwork.nodes.map(({ id }) => id));
    assertUniqueIds(regenerated.draft.proposalDraftNetwork.segments.map(({ id }) => id));
    assert(
      !detectRouteCycle(regenerated.draft.proposalDraftNetwork),
      "La regeneracion introdujo un ciclo.",
    );
    assert(
      !hasDuplicateSegments(regenerated.draft.proposalDraftNetwork),
      "La regeneracion duplico tramos equivalentes.",
    );

    measurements.push({
      applianceCount: scenario.applianceCount,
      editMs: edit.elapsedMs,
      generationMs: generation.elapsedMs,
      nodeCount: draft.proposalDraftNetwork.nodes.length,
      persistenceSerializationMs: persistenceSerialization.elapsedMs,
      persistedDraftBytes: persistenceSerialization.value.length,
      scenario: scenario.scenario,
      segmentCount: draft.proposalDraftNetwork.segments.length,
      technicalViewsMs: technicalViews.elapsedMs,
      viewChangeAverageMs,
    });
  }

  results.push(
    {
      name: "02D-B mide generacion, edicion y vistas en redes pequena, mediana y compleja",
      status: "passed",
    },
    {
      name: "02D-B regenera sin ciclos ni duplicados y aceptar o descartar no muta confirmada",
      status: "passed",
    },
    {
      name: "02D-B cambia Planta, Cortes y Axo reutilizando vistas ya calculadas",
      status: "passed",
    },
  );

  return { measurements, results };
}

function createPerformanceSnapshot(
  applianceCount: number,
): CoordinatedInstallationSnapshot {
  const planBaseId = `plan:performance:${applianceCount}`;
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: 0, z: 0.2 },
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "meter",
      name: "Medidor",
      planBaseId,
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    ...Array.from({ length: applianceCount }, (_, index) => {
      const column = index % 5;
      const row = Math.floor(index / 5);
      return {
        connectionPoint: {
          x: 4 + column * 3,
          y: (row % 2 === 0 ? 1 : -1) * (2 + row * 2),
          z: 1 + (index % 3) * 0.1,
        },
        demandUnit: "m3_h" as const,
        demandValue: 0.2 + (index % 4) * 0.05,
        elevation: {
          source: "professional_edit" as const,
          status: "confirmed" as const,
        },
        id: `appliance:${index + 1}`,
        name: `Artefacto ${index + 1}`,
        planBaseId,
        role: "appliance" as const,
        source: "manual" as const,
        terminalConfig: {
          connectionHeightMeters: 1 + (index % 3) * 0.1,
          heightSource: "professional_edit" as const,
          heightStatus: "confirmed" as const,
          lateralOffsetMeters: 0,
          outletSide: "direct" as const,
          requiresShutoffValve: true,
          terminalProfile: "generic_terminal" as const,
          verticalDropMeters: 0,
        },
        type: "other" as const,
      };
    }),
  ];

  return {
    bounds: { maxX: 20, maxY: 14, minX: -2, minY: -14 },
    equipment,
    marginMeters: 0.1,
    minSegmentLengthSource: 0.000001,
    network: { nodes: [], segments: [] },
    pipeSystem: SIGAS_PIPE_SYSTEM,
    planBaseId,
    preferredApplianceOrder: equipment
      .filter(({ role }) => role === "appliance")
      .map(({ id }) => id),
    professionalDistributionHeight: {
      heightMeters: 1.5,
      reference: "project_datum",
      source: "professional",
    },
    scaleMetersPerSourceUnit: 1,
  };
}

function measure<T>(operation: () => T) {
  const startedAt = performance.now();
  const value = operation();
  return { elapsedMs: performance.now() - startedAt, value };
}

function measureMedian<T>(iterations: number, operation: () => T) {
  const samples = Array.from({ length: iterations }, () => measure(operation));
  return samples.sort((first, second) => first.elapsedMs - second.elapsedMs)[
    Math.floor(samples.length / 2)
  ];
}

function measureViewChanges(
  views: CoordinatedInstallationTechnicalViews,
  iterations: number,
) {
  const order = ["plan", "section-aa", "section-bb", "axonometric"] as const;
  let selected: unknown = null;
  const startedAt = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    const viewId = order[index % order.length];
    selected =
      viewId === "plan"
        ? null
        : viewId === "axonometric"
          ? views.axonometricView
          : views.sectionViews[viewId];
  }

  assert(selected !== undefined, "La seleccion de vistas no es estable.");
  return (performance.now() - startedAt) / iterations;
}

function assertUniqueIds(ids: string[]) {
  assertEqual(new Set(ids).size, ids.length, "La regeneracion duplico identificadores.");
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(message);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

declare const require: { main?: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(
    JSON.stringify(runCoordinatedInstallationPerformanceVerifications(), null, 2),
  );
}
