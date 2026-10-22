import {
  confirmEquipmentTerminalConfig,
  createSuggestedEquipmentTerminalConfig,
  equipmentTerminalHeightIsConfirmed,
  normalizeEquipmentTerminalConfigHeightMetadata,
  withEquipmentTerminalValues,
} from "@/lib/equipment/terminalConfig";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { createTechnicalRouteNodeElevationIndex } from "@/lib/sections/technicalRouteElevation";
import {
  createPersistedWorkbenchProject,
  parsePersistedWorkbenchProject,
  type PersistableWorkbenchBase,
} from "@/lib/workbench/persistence";

export type ElevationMetadataVerificationResult = {
  name: string;
  status: "passed";
};

export function runElevationMetadataVerifications() {
  const results: ElevationMetadataVerificationResult[] = [];

  verify(results, "01C-A preset no se confirma al guardar", () => {
    const preset = createSuggestedEquipmentTerminalConfig("stove");
    const saved = withEquipmentTerminalValues(preset, {
      connectionHeightMeters: 1.1,
      lateralOffsetMeters: 0.5,
    });
    const confirmed = confirmEquipmentTerminalConfig(saved);

    assertEqual(saved.heightStatus, "suggested");
    assertEqual(saved.heightSource, "equipment_preset");
    assertEqual(equipmentTerminalHeightIsConfirmed(saved), false);
    assertEqual(confirmed.heightStatus, "confirmed");
    assertEqual(confirmed.heightSource, "professional_edit");
    assertEqual(equipmentTerminalHeightIsConfirmed(confirmed), true);
  });

  verify(
    results,
    "01C-A cero predeterminado y cero confirmado conservan estados distintos",
    () => {
      const equipment = elevationFixtureEquipment();
      const elevations = createTechnicalRouteNodeElevationIndex({
        equipment,
        network: elevationFixtureNetwork(),
      });
      const defaultZero = requiredElevation(elevations, "node-default-zero");
      const confirmedZero = requiredElevation(
        elevations,
        "node-confirmed-zero",
      );
      const preset = requiredElevation(elevations, "node-preset");
      const derived = requiredElevation(elevations, "node-derived");

      assertEqual(defaultZero.zMeters, 0);
      assertEqual(defaultZero.status, "resolved");
      assertEqual(defaultZero.verificationStatus, "unverified");
      assertEqual(defaultZero.source, "default_value");
      assertEqual(confirmedZero.zMeters, 0);
      assertEqual(confirmedZero.verificationStatus, "confirmed");
      assertEqual(confirmedZero.source, "professional_edit");
      assertEqual(preset.verificationStatus, "suggested");
      assertEqual(preset.source, "equipment_preset");
      assertEqual(derived.verificationStatus, "suggested");
      assertEqual(derived.source, "derived_calculation");
    },
  );

  verify(
    results,
    "01C-A proyecto anterior conserva Z y degrada confirmacion sin evidencia",
    () => {
      const legacyTerminal = {
        ...createSuggestedEquipmentTerminalConfig("stove"),
        connectionHeightMeters: 1.4,
        heightSource: undefined,
        heightStatus: "confirmed" as const,
      };
      const legacyEquipment: WorkbenchEquipment[] = [
        {
          connectionPoint: { x: 0, y: 0, z: 0 },
          id: "legacy-meter",
          name: "M",
          planBaseId: "plan",
          role: "supply",
          source: "manual",
          type: "meter_regulator",
        },
        {
          connectionPoint: { x: 2, y: 0, z: 1.2 },
          id: "legacy-stove",
          name: "Cocina",
          planBaseId: "plan",
          role: "appliance",
          source: "manual",
          terminalConfig: legacyTerminal,
          type: "stove",
        },
      ];
      const project = createPersistedWorkbenchProject({
        activeBaseId: "plan",
        bases: [persistableBase(legacyEquipment)],
        nextSectionNumber: 1,
        routeProposal: null,
        routeProposalMarginInput: "0,10",
        routeProposalMode: null,
        sectionPlanLinks: [],
      });
      const parsed = parsePersistedWorkbenchProject(JSON.stringify(project));

      assertEqual(parsed.status, "loaded");

      if (parsed.status !== "loaded") {
        throw new Error("El proyecto anterior no pudo cargarse.");
      }

      const meter = requiredEquipment(
        parsed.project.bases[0]?.equipment ?? [],
        "legacy-meter",
      );
      const stove = requiredEquipment(
        parsed.project.bases[0]?.equipment ?? [],
        "legacy-stove",
      );
      const normalized = normalizeEquipmentTerminalConfigHeightMetadata(
        legacyTerminal,
      );
      const derivedNode = parsed.project.bases[0]?.routeNetwork.nodes.find(
        (node) => node.id === "node-derived",
      );
      const derivedVertex = parsed.project.bases[0]?.routeNetwork.segments.find(
        (segment) => segment.id === "segment-metadata",
      )?.vertexElevations?.[0];

      assertEqual(meter.connectionPoint.z, 0);
      assertEqual(meter.elevation?.status, "unverified");
      assertEqual(meter.elevation?.source, "default_value");
      assertEqual(stove.connectionPoint.z, 1.2);
      assertEqual(stove.terminalConfig?.connectionHeightMeters, 1.4);
      assertEqual(stove.terminalConfig?.heightStatus, "unverified");
      assertEqual(stove.terminalConfig?.heightSource, "default_value");
      assertEqual(normalized.heightStatus, "unverified");
      assertEqual(derivedNode?.elevation?.status, "suggested");
      assertEqual(derivedNode?.elevation?.source, "derived_calculation");
      assertEqual(derivedVertex?.status, "unverified");
      assertEqual(derivedVertex?.source, "derived_calculation");
    },
  );

  return results;
}

function elevationFixtureEquipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: { x: 0, y: 0, z: 0 },
      id: "default-zero",
      name: "M predeterminado",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 1, y: 0, z: 0 },
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "confirmed-zero",
      name: "M confirmado",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 2, y: 0, z: 0.9 },
      id: "preset",
      name: "Cocina",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      terminalConfig: createSuggestedEquipmentTerminalConfig("stove"),
      type: "stove",
    },
  ];
}

function elevationFixtureNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      {
        equipmentId: "default-zero",
        id: "node-default-zero",
        kind: "supply",
      },
      {
        equipmentId: "confirmed-zero",
        id: "node-confirmed-zero",
        kind: "supply",
      },
      { equipmentId: "preset", id: "node-preset", kind: "appliance" },
      {
        elevation: { source: "derived_calculation", status: "suggested" },
        id: "node-derived",
        kind: "route",
        position: { x: 3, y: 0, z: 0.4 },
      },
    ],
    segments: [
      {
        fromNodeId: "node-default-zero",
        id: "segment-metadata",
        toNodeId: "node-confirmed-zero",
        vertexElevations: [
          { source: "derived_calculation", status: "unverified" },
        ],
        vertices: [{ x: 0.5, y: 0, z: 0 }],
      },
    ],
  };
}

function persistableBase(
  equipment: WorkbenchEquipment[],
): PersistableWorkbenchBase {
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
    equipment,
    id: "plan",
    name: "Planta",
    originalFileName: "planta.pdf",
    pdfModel: null,
    proposals: [],
    routeAccessoryProposalDecisions: [],
    routeIntentConnections: [],
    routeNetwork: elevationFixtureNetwork(),
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

function requiredElevation(
  elevations: ReturnType<typeof createTechnicalRouteNodeElevationIndex>,
  nodeId: string,
) {
  const elevation = elevations.get(nodeId) ?? null;

  assert(elevation, `Falta elevacion de ${nodeId}.`);

  return elevation;
}

function requiredEquipment(
  equipment: WorkbenchEquipment[],
  equipmentId: string,
) {
  const item = equipment.find((candidate) => candidate.id === equipmentId);

  assert(item, `Falta equipo ${equipmentId}.`);

  return item;
}

function verify(
  results: ElevationMetadataVerificationResult[],
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

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(JSON.stringify(runElevationMetadataVerifications(), null, 2));
}
