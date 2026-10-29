import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { CoordinatedInstallationDraftSnapshot } from "@/lib/routing/coordinatedInstallationDraft";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  createPersistedWorkbenchProject,
  parsePersistedWorkbenchProject,
  savePersistedWorkbenchProjectIfChanged,
  type PersistableWorkbenchBase,
  type PersistedCoordinatedRouteProposal,
} from "./persistence";

export type PersistenceVerificationResult = {
  name: string;
  status: "passed";
};

export function runPersistenceVerifications() {
  const results: PersistenceVerificationResult[] = [];

  verify(results, "02D-A persiste el candidato minimo y la altura profesional", () => {
    const coordinatedRouteProposal = coordinatedFixture();
    const project = createProject(coordinatedRouteProposal);
    const parsed = parsePersistedWorkbenchProject(JSON.stringify(project));

    assertEqual(parsed.status, "loaded");
    if (parsed.status !== "loaded") {
      throw new Error("No se cargo el proyecto persistido.");
    }

    assertEqual(parsed.project.coordinatedRouteProposal?.draft.revision, 3);
    assertEqual(
      parsed.project.coordinatedRouteProposal?.professionalDistributionHeight
        ?.heightMeters,
      1.25,
    );
    assertEqual(
      JSON.stringify(
        parsed.project.coordinatedRouteProposal?.draft.proposalDraftNetwork,
      ),
      JSON.stringify(coordinatedRouteProposal.draft.proposalDraftNetwork),
    );
    assert(
      !("evaluation" in coordinatedRouteProposal.draft),
      "Se persistio una evaluacion tecnica derivada.",
    );
    assert(
      !("technicalApproval" in coordinatedRouteProposal),
      "Se persistio una aprobacion profesional temporal.",
    );
  });

  verify(results, "02D-A mantiene compatibilidad con proyectos sin propuesta", () => {
    const legacy = createProject(null) as unknown as Record<string, unknown>;
    delete legacy.coordinatedRouteProposal;
    const parsed = parsePersistedWorkbenchProject(JSON.stringify(legacy));

    assertEqual(parsed.status, "loaded");
    if (parsed.status === "loaded") {
      assertEqual(parsed.project.coordinatedRouteProposal, null);
      assertEqual(parsed.project.bases[0]?.routeNetwork.segments.length, 1);
    }
  });

  verify(results, "02D-A descarta solo la propuesta guardada invalida", () => {
    const project = createProject(coordinatedFixture()) as unknown as Record<
      string,
      unknown
    >;
    const coordinated = project.coordinatedRouteProposal as Record<
      string,
      unknown
    >;
    const draft = coordinated.draft as Record<string, unknown>;
    draft.proposalDraftNetwork = { nodes: [], segments: [{ id: 7 }] };
    const parsed = parsePersistedWorkbenchProject(JSON.stringify(project));

    assertEqual(parsed.status, "loaded");
    if (parsed.status === "loaded") {
      assertEqual(parsed.project.coordinatedRouteProposal, null);
      assertEqual(parsed.project.bases[0]?.routeNetwork.segments[0]?.id, "S-A");
    }
  });

  verify(results, "02D-A limpia el estado temporal aceptado o descartado", () => {
    const parsed = parsePersistedWorkbenchProject(
      JSON.stringify(createProject(null)),
    );

    assertEqual(parsed.status, "loaded");
    if (parsed.status === "loaded") {
      assertEqual(parsed.project.coordinatedRouteProposal, null);
    }
  });

  verify(results, "02D-B evita escrituras identicas y serializa una sola vez", () => {
    const project = createProject(coordinatedFixture());
    const storage = countingStorage();
    const first = savePersistedWorkbenchProjectIfChanged(
      project,
      null,
      storage,
    );
    assert(first.ok, first.ok ? "" : first.error);
    const repeated = savePersistedWorkbenchProjectIfChanged(
      project,
      first.signature,
      storage,
    );

    assert(repeated.ok, repeated.ok ? "" : repeated.error);
    assertEqual(first.written, true);
    assertEqual(repeated.written, false);
    assertEqual(storage.setCount, 1);
  });

  verify(results, "02D-B informa el limite de localStorage sin perder confirmada", () => {
    const project = createProject(coordinatedFixture());
    const confirmed = JSON.stringify(project.bases[0]?.routeNetwork);
    const result = savePersistedWorkbenchProjectIfChanged(
      project,
      null,
      quotaLimitedStorage(64),
    );

    assertEqual(result.ok, false);
    if (!result.ok) {
      assert(
        result.error.includes("QuotaExceededError"),
        "No se informo el agotamiento de cuota.",
      );
    }
    assertEqual(JSON.stringify(project.bases[0]?.routeNetwork), confirmed);
  });

  return results;
}

function createProject(
  coordinatedRouteProposal: PersistedCoordinatedRouteProposal | null,
) {
  return createPersistedWorkbenchProject({
    activeBaseId: "plan:persistence",
    bases: [persistableBase()],
    coordinatedRouteProposal,
    nextSectionNumber: 1,
    routeProposal: null,
    routeProposalMarginInput: "0,10",
    routeProposalMode: coordinatedRouteProposal ? "automatic" : null,
    sectionPlanLinks: [],
  });
}

function coordinatedFixture(): PersistedCoordinatedRouteProposal {
  const draft: CoordinatedInstallationDraftSnapshot = {
    baseFingerprint: "confirmed:fingerprint",
    draftFingerprint: "draft:fingerprint",
    inheritedWarnings: [
      {
        code: "unverified_3d_clearance",
        message: "Despeje constructivo sin verificar.",
        referenceIds: ["riser:1"],
      },
    ],
    proposalDraftEquipment: equipmentFixture(),
    proposalDraftNetwork: networkFixture(),
    revision: 3,
    sourceProposalId: "proposal:persistence",
  };

  return {
    draft,
    planBaseId: "plan:persistence",
    professionalDistributionHeight: {
      heightMeters: 1.25,
      reference: "project_datum",
      source: "professional",
    },
  };
}

function persistableBase(): PersistableWorkbenchBase {
  return {
    adoptedDiameterDecisions: [],
    calibration: {
      calibration: null,
      draft: {
        distanceOriginal: "",
        points: [],
        status: "pending",
        unit: "mm",
      },
    },
    constraints: [],
    createdAt: 1,
    diameterTransitionDecisions: [],
    drawing: null,
    equipment: equipmentFixture(),
    id: "plan:persistence",
    name: "Planta",
    originalFileName: "planta.pdf",
    pdfModel: null,
    proposals: [],
    routeAccessoryProposalDecisions: [],
    routeIntentConnections: [],
    routeNetwork: networkFixture(),
    semanticAssignments: [],
    semanticInspection: null,
    semanticViewMode: "original",
    showConstraints: true,
    showEquipment: true,
    showRoute: true,
    sourceType: "pdf",
    type: "plan",
    visibleLayers: {},
    visual: { activePdfPageNumber: 1 },
  };
}

function equipmentFixture(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: { x: 0, y: 0, z: 0 },
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "meter",
      name: "Medidor",
      planBaseId: "plan:persistence",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 4, y: 0, z: 1 },
      demandUnit: "m3_h",
      demandValue: 0.2,
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "appliance",
      name: "Artefacto",
      planBaseId: "plan:persistence",
      role: "appliance",
      source: "manual",
      type: "other",
    },
  ];
}

function networkFixture(): ManualRouteNetwork {
  return {
    nodes: [
      { equipmentId: "meter", id: "S", kind: "supply", origin: "manual" },
      {
        equipmentId: "appliance",
        id: "A",
        kind: "appliance",
        origin: "manual",
      },
    ],
    segments: [
      { fromNodeId: "S", id: "S-A", origin: "manual", toNodeId: "A" },
    ],
  };
}

function countingStorage() {
  let value: string | null = null;

  return {
    get setCount() {
      return this.count;
    },
    count: 0,
    getItem() {
      return value;
    },
    removeItem() {
      value = null;
    },
    setItem(_key: string, nextValue: string) {
      this.count += 1;
      value = nextValue;
    },
  };
}

function quotaLimitedStorage(maxBytes: number) {
  return {
    getItem() {
      return null;
    },
    removeItem() {},
    setItem(_key: string, value: string) {
      if (value.length > maxBytes) {
        throw new Error("QuotaExceededError: localStorage quota exceeded");
      }
    },
  };
}

function verify(
  results: PersistenceVerificationResult[],
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

declare const require: { main?: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(JSON.stringify(runPersistenceVerifications(), null, 2));
}
