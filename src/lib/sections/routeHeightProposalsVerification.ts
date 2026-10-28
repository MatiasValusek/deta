import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { createTechnicalAxonometricView } from "@/lib/calculation/technicalAxonometric";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import { createSuggestedEquipmentTerminalConfig } from "@/lib/equipment/terminalConfig";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { resolveTechnicalRouteSegments } from "@/lib/sections/technicalRouteElevation";
import { createTechnicalRoutePolyline } from "@/lib/sections/technicalRoutePolyline";
import {
  createRouteHeightProposals,
  type RouteHeightProposalEngineParams,
} from "./routeHeightProposals";

export type RouteHeightProposalsVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;

export function runRouteHeightProposalsVerifications() {
  const results: RouteHeightProposalsVerificationResult[] = [];

  verify(
    results,
    "01C-B propone solo entre referencias confirmadas iguales y simula sin mutar",
    () => {
      const fixture = boundedHeightFixture(0.8, 0.8);
      const originalEquipment = JSON.stringify(fixture.equipment);
      const originalNetwork = JSON.stringify(fixture.network);
      const result = createRouteHeightProposals(fixture);

      assertEqual(result.mainRoute?.selection, "longest_xy");
      assertEqual(result.mainRoute?.terminalEquipmentId, "appliance");
      assertEqual(result.confirmedReferences.length, 2);
      assertEqual(
        result.confirmedReferences.map((reference) => reference.targetKey).join(","),
        "node:S,node:A",
      );
      assertEqual(result.diagnostics.length, 0);
      assertEqual(
        result.proposals.map((proposal) => proposal.targetKey).join(","),
        "segment-vertex:S-R:0,node:R,segment-vertex:R-A:0",
      );

      for (const proposal of result.proposals) {
        assertClose(proposal.heightMeters, 0.8);
        assertEqual(proposal.state, "suggested");
        assertEqual(proposal.suggestedElevation.status, "suggested");
        assertEqual(
          proposal.suggestedElevation.source,
          "derived_calculation",
        );
        assertEqual(
          proposal.provenance.method,
          "matching_confirmed_boundaries",
        );
        assertEqual(proposal.simulation.status, "ready");
        assertEqual(
          proposal.simulation.calculations.validationsPreserved,
          true,
        );
        assertEqual(proposal.simulation.connections.topologyChanged, false);
        assertEqual(
          proposal.simulation.accessories.physicalCountAfter,
          proposal.simulation.accessories.physicalCountBefore,
        );
        assertEqual(
          proposal.simulation.accessories.statusAfter,
          proposal.simulation.accessories.statusBefore,
        );
      }

      const routeNodeProposal = requiredProposal(result, "node:R");

      assert(
        result.proposals.some(
          (proposal) =>
            proposal.simulation.lengths.affectedSegments.length > 0,
        ),
        "Ninguna simulacion registro el impacto de longitud esperado.",
      );
      assertEqual(
        routeNodeProposal.simulation.connections.changedNodeIds.join(","),
        "R",
      );
      assertEqual(JSON.stringify(fixture.equipment), originalEquipment);
      assertEqual(JSON.stringify(fixture.network), originalNetwork);
    },
  );

  verify(
    results,
    "01C-B no usa cero predeterminado ni preset sugerido como referencias",
    () => {
      const fixture = unverifiedZeroAndPresetFixture();
      const result = createRouteHeightProposals(fixture);

      assert(result.mainRoute, "Falta recorrido principal de prueba.");
      assertEqual(result.confirmedReferences.length, 0);
      assertEqual(result.proposals.length, 0);
      assertEqual(result.diagnostics.length, 1);
      assertEqual(
        result.diagnostics[0]?.code,
        "insufficient_confirmed_references",
      );
      assert(
        result.diagnostics[0]?.neededData.includes("Confirme las alturas"),
        "El diagnostico no identifica las referencias necesarias.",
      );
    },
  );

  verify(
    results,
    "01C-B una sola referencia informa el dato faltante sin altura universal",
    () => {
      const fixture = boundedHeightFixture(0.8, 0.8);
      const appliance = fixture.equipment.find(
        (item) => item.id === "appliance",
      );

      assert(appliance, "Falta artefacto de prueba.");
      delete appliance.elevation;

      const result = createRouteHeightProposals(fixture);

      assertEqual(result.confirmedReferences.length, 1);
      assertEqual(result.proposals.length, 0);
      assertEqual(result.diagnostics.length, 1);
      assertEqual(
        result.diagnostics[0]?.code,
        "insufficient_confirmed_references",
      );
      assertEqual(
        result.diagnostics[0]?.referenceTargetKeys.join(","),
        "node:S",
      );
      assert(
        result.diagnostics[0]?.neededData.includes("segunda altura"),
        "No se solicito una segunda referencia confirmada.",
      );
    },
  );

  verify(
    results,
    "01C-B cambio de nivel exige ubicar la transicion y no interpola",
    () => {
      const fixture = boundedHeightFixture(0.2, 1.2);
      const result = createRouteHeightProposals(fixture);

      assertEqual(result.confirmedReferences.length, 2);
      assertEqual(result.proposals.length, 0);
      assertEqual(result.diagnostics.length, 1);
      assertEqual(
        result.diagnostics[0]?.code,
        "level_change_requires_definition",
      );
      assertEqual(
        result.diagnostics[0]?.referenceTargetKeys.join(","),
        "node:S,node:A",
      );
      assert(
        result.diagnostics[0]?.neededData.includes("punto o vertice"),
        "El diagnostico no pide ubicar el cambio de nivel.",
      );
    },
  );

  verify(
    results,
    "01C-B altura profesional coordina toda la red ramificada sobre una copia",
    () => {
      const fixture = branchedDistributionFixture();
      const originalEquipment = JSON.stringify(fixture.equipment);
      const originalNetwork = JSON.stringify(fixture.network);
      const result = createRouteHeightProposals(fixture);

      assertEqual(result.mode, "professional_distribution_height");
      assertEqual(result.proposals.length, 8);
      assertEqual(
        result.proposals.map((proposal) => proposal.targetKey).join(","),
        [
          "node:B1",
          "node:B2",
          "node:B3",
          "node:D",
          "segment-vertex:D-B1:0",
          "segment-vertex:D-B2:0",
          "segment-vertex:D-B3:0",
          "segment-vertex:M-D:0",
        ].join(","),
      );
      assert(
        result.proposals.every(
          (proposal) =>
            proposal.state === "suggested" &&
            proposal.provenance.method ===
              "professional_distribution_height",
        ),
        "Las propuestas coordinadas deben conservar estado sugerido y procedencia.",
      );
      assertEqual(result.coordinatedSimulation?.proposalIds.length, 8);
      assertEqual(
        result.coordinatedSimulation?.simulation.calculations
          .validationsPreserved,
        true,
      );
      assertEqual(
        result.coordinatedSimulation?.simulation.connections.topologyChanged,
        false,
      );
      assertEqual(
        result.coordinatedSimulation?.simulation.accessories.addedIds.length,
        0,
      );
      assertEqual(
        result.coordinatedSimulation?.simulation.accessories.removedIds.length,
        0,
      );
      assert(
        (result.coordinatedSimulation?.simulation.materials
          .pipeLengthDeltaMeters ?? 0) > 0,
        "La simulacion conjunta no reflejo el cambio de materiales.",
      );
      assertEqual(
        result.sectors
          .filter((sector) => sector.status === "resolved_by_proposal")
          .map((sector) => sector.segmentIds[0])
          .join(","),
        "D-B1,D-B2,D-B3",
      );
      assertEqual(JSON.stringify(fixture.equipment), originalEquipment);
      assertEqual(JSON.stringify(fixture.network), originalNetwork);
    },
  );

  verify(
    results,
    "01C-C2 cotas confirmadas diferentes generan cambio interno sugerido",
    () => {
      const fixture = branchedDistributionFixture({
        differentRouteHeight: true,
      });
      const originalNetwork = JSON.stringify(fixture.network);
      const result = createRouteHeightProposals(fixture);

      assert(
        !result.proposals.some(
          (proposal) =>
            proposal.targetKey === "node:B2" ||
            proposal.targetKey === "segment-vertex:D-B2:0",
        ),
        "La propuesta no debe sobrescribir ni completar el sector con cota diferente.",
      );
      assert(
        result.confirmedReferences.some(
          (reference) =>
            reference.targetKey === "node:B2" &&
            Math.abs(reference.heightMeters - 2) <= EPSILON,
        ),
        "No se registro la cota confirmada diferente.",
      );
      assertEqual(
        requiredSector(result, "D-B2").status,
        "resolved_by_proposal",
      );
      assertEqual(requiredSector(result, "D-B2").neededData, null);
      assertEqual(result.internalLevelChanges?.status, "ready");
      assert(result.internalLevelChanges?.recommendedAlternativeId, "Falta alternativa interna recomendada.");
      const internalAlternative = result.internalLevelChanges.alternatives.find(
        (alternative) =>
          alternative.id === result.internalLevelChanges?.recommendedAlternativeId,
      );
      assert(internalAlternative, "Falta la alternativa interna evaluada.");
      assert(
        internalAlternative.changes.some(
          (change) => change.segmentId === "D-B2",
        ),
        "Falta el cambio interno sobre D-B2.",
      );
      assert(
        internalAlternative.interferences.some(
          (interference) =>
            interference.kind === "unverified_3d_clearance" &&
            interference.status === "unverified",
        ),
        "Falta conservar la incertidumbre 3D.",
      );
      assertEqual(
        internalAlternative.simulation.calculations.validationsPreserved,
        true,
      );
      assertEqual(
        internalAlternative.simulation.connections.topologyChanged,
        false,
      );
      assert(
        (internalAlternative.simulation.lengths.totalDeltaMeters ?? 0) > 0,
        "La simulacion no incorporo la longitud vertical interna.",
      );
      const resolvedSegment = resolveTechnicalRouteSegments({
        equipment: fixture.equipment,
        network: internalAlternative.network,
      }).find((segment) => segment.id === "D-B2");
      assert(resolvedSegment, "Falta el tramo interno resuelto.");
      const polyline = createTechnicalRoutePolyline(resolvedSegment);
      assert(
        polyline.points.some((point) => point.source === "vertical"),
        "Corte no recibe el montante interno explicito.",
      );
      const calculation = calculateTechnicalTree({
        equipment: fixture.equipment,
        minSegmentLengthSource: fixture.minSegmentLengthSource,
        network: internalAlternative.network,
        pipeSystem: fixture.pipeSystem,
        scaleMetersPerSourceUnit: fixture.scaleMetersPerSourceUnit,
      });
      assert(calculation.status !== "invalid", "El calculo interno quedo invalido.");
      const inventory = createTechnicalPhysicalAccessoryInventory({
        equipment: fixture.equipment,
        network: internalAlternative.network,
        result: calculation,
        routeTransitionResolutions:
          calculation.transitionAwareNetworkSizing?.routeTransitionResolutions,
      });
      const axonometric = createTechnicalAxonometricView({
        equipment: fixture.equipment,
        inventory,
        network: internalAlternative.network,
        result: calculation,
        scaleMetersPerSourceUnit: fixture.scaleMetersPerSourceUnit,
      });
      assert(
        axonometric.segments
          .find((segment) => segment.id === "D-B2")
          ?.path.some((point) => point.source === "vertical"),
        "Axonometrica no recibe el montante interno explicito.",
      );
      assert(
        !result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "level_change_requires_definition" &&
            diagnostic.referenceTargetKeys.includes("node:B2"),
        ),
        "El sector resuelto conserva un diagnostico pendiente obsoleto.",
      );
      assertEqual(JSON.stringify(fixture.network), originalNetwork);
    },
  );

  verify(
    results,
    "01C-B medidor y conexiones terminales quedan fuera de la propagacion",
    () => {
      const fixture = branchedDistributionFixture({
        confirmedTerminal: true,
      });
      const result = createRouteHeightProposals(fixture);
      const targetKeys = result.proposals.map((proposal) => proposal.targetKey);

      assert(!targetKeys.includes("node:M"), "No debe proponer cota del medidor.");
      assert(!targetKeys.includes("node:A1"), "No debe editar el terminal A1.");
      assert(!targetKeys.includes("node:A2"), "No debe editar el terminal A2.");
      assert(!targetKeys.includes("node:A3"), "No debe editar el terminal A3.");
      assert(
        !targetKeys.some((key) => key.startsWith("segment-vertex:B1-A1")),
        "No debe editar vertices de la conexion terminal.",
      );
      assertEqual(requiredSector(result, "B1-A1").status, "requires_decision");
      assertEqual(requiredSector(result, "B2-A2").status, "requires_decision");
      assertEqual(requiredSector(result, "B3-A3").status, "requires_decision");
    },
  );

  return results;
}

function boundedHeightFixture(
  supplyHeightMeters: number,
  applianceHeightMeters: number,
): RouteHeightProposalEngineParams {
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: 0, z: supplyHeightMeters },
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "supply",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 8, y: 0, z: applianceHeightMeters },
      demandUnit: "m3_h",
      demandValue: 0.6,
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "appliance",
      name: "Artefacto",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "other",
    },
  ];
  const network: ManualRouteNetwork = {
    nodes: [
      {
        equipmentId: "supply",
        id: "S",
        kind: "supply",
        origin: "manual",
      },
      {
        elevation: { source: "derived_calculation", status: "suggested" },
        id: "R",
        kind: "route",
        origin: "manual",
        position: { x: 4, y: 0, z: 0.2 },
      },
      {
        equipmentId: "appliance",
        id: "A",
        kind: "appliance",
        origin: "manual",
      },
    ],
    segments: [
      {
        accessories: [
          {
            equivalentLengthMetersPerUnit: 0.15,
            equivalentLengthSource: "manual",
            id: "manual-elbow",
            origin: "manual",
            quantity: 1,
            segmentId: "S-R",
            type: "elbow",
          },
        ],
        fromNodeId: "S",
        id: "S-R",
        origin: "manual",
        toNodeId: "R",
        vertexElevations: [
          { source: "default_value", status: "unverified" },
        ],
        vertices: [{ x: 2, y: 0, z: 0 }],
      },
      {
        fromNodeId: "R",
        id: "R-A",
        origin: "manual",
        toNodeId: "A",
        vertexElevations: [
          { source: "derived_calculation", status: "suggested" },
        ],
        vertices: [{ x: 6, y: 0, z: 0.4 }],
      },
    ],
  };

  return {
    equipment,
    minSegmentLengthSource: EPSILON,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: 1,
  };
}

function unverifiedZeroAndPresetFixture(): RouteHeightProposalEngineParams {
  const suggestedTerminal = createSuggestedEquipmentTerminalConfig("stove");
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: 0, z: 0 },
      elevation: { source: "default_value", status: "confirmed" },
      id: "supply",
      name: "M sin confirmar",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 4, y: 0, z: 0.9 },
      demandUnit: "m3_h",
      demandValue: 0.6,
      id: "appliance",
      name: "Cocina con preset",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      terminalConfig: suggestedTerminal,
      type: "stove",
    },
  ];

  return {
    equipment,
    minSegmentLengthSource: EPSILON,
    network: {
      nodes: [
        { equipmentId: "supply", id: "S", kind: "supply" },
        {
          id: "R",
          kind: "route",
          position: { x: 2, y: 0, z: 0 },
        },
        { equipmentId: "appliance", id: "A", kind: "appliance" },
      ],
      segments: [
        { fromNodeId: "S", id: "S-R", toNodeId: "R" },
        { fromNodeId: "R", id: "R-A", toNodeId: "A" },
      ],
    },
    pipeSystem: SIGAS_PIPE_SYSTEM,
    scaleMetersPerSourceUnit: 1,
  };
}

function branchedDistributionFixture(
  options: {
    confirmedTerminal?: boolean;
    differentRouteHeight?: boolean;
  } = {},
): RouteHeightProposalEngineParams {
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: 0, z: 0 },
      id: "meter",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    ...[
      { id: "a1", name: "A1", point: { x: 7, y: 2, z: 0.6 } },
      { id: "a2", name: "A2", point: { x: 8, y: 0, z: 0 } },
      { id: "a3", name: "A3", point: { x: 9, y: -2, z: 0 } },
    ].map(
      (item): WorkbenchEquipment => ({
        connectionPoint: item.point,
        demandUnit: "m3_h",
        demandValue: 0.2,
        ...(options.confirmedTerminal && item.id === "a1"
          ? {
              elevation: {
                source: "professional_edit" as const,
                status: "confirmed" as const,
              },
            }
          : {}),
        id: item.id,
        name: item.name,
        planBaseId: "plan",
        role: "appliance",
        source: "manual",
        type: "other",
      }),
    ),
  ];
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: "meter", id: "M", kind: "supply" },
      { id: "D", kind: "route", position: { x: 4, y: 0, z: 0 } },
      { id: "B1", kind: "route", position: { x: 6, y: 2, z: 0 } },
      {
        ...(options.differentRouteHeight
          ? {
              elevation: {
                source: "professional_edit" as const,
                status: "confirmed" as const,
              },
            }
          : {}),
        id: "B2",
        kind: "route",
        position: {
          x: 7,
          y: 0,
          z: options.differentRouteHeight ? 2 : 0,
        },
      },
      { id: "B3", kind: "route", position: { x: 8, y: -2, z: 0 } },
      { equipmentId: "a1", id: "A1", kind: "appliance" },
      { equipmentId: "a2", id: "A2", kind: "appliance" },
      { equipmentId: "a3", id: "A3", kind: "appliance" },
    ],
    segments: [
      branchSegment("M-D", "M", "D", { x: 2, y: 0, z: 0 }),
      branchSegment("D-B1", "D", "B1", { x: 5, y: 1, z: 0 }),
      branchSegment("D-B2", "D", "B2", { x: 5.5, y: 0, z: 0 }),
      branchSegment("D-B3", "D", "B3", { x: 6, y: -1, z: 0 }),
      branchSegment("B1-A1", "B1", "A1", { x: 6.5, y: 2, z: 0.3 }),
      branchSegment("B2-A2", "B2", "A2", { x: 7.5, y: 0, z: 0 }),
      branchSegment("B3-A3", "B3", "A3", { x: 8.5, y: -2, z: 0 }),
    ],
  };

  return {
    equipment,
    minSegmentLengthSource: EPSILON,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    professionalDistributionHeight: {
      heightMeters: 1.1,
      reference: "project_datum",
      source: "professional",
    },
    scaleMetersPerSourceUnit: 1,
  };
}

function branchSegment(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  vertex: { x: number; y: number; z: number },
): ManualRouteNetwork["segments"][number] {
  return {
    fromNodeId,
    id,
    toNodeId,
    vertexElevations: [
      { source: "derived_calculation", status: "suggested" },
    ],
    vertices: [vertex],
  };
}

function requiredSector(
  result: ReturnType<typeof createRouteHeightProposals>,
  segmentId: string,
) {
  const sector = result.sectors.find(
    (candidate) => candidate.segmentIds.includes(segmentId),
  );

  assert(sector, `Falta sector ${segmentId}.`);

  return sector;
}

function requiredProposal(
  result: ReturnType<typeof createRouteHeightProposals>,
  targetKey: string,
) {
  const proposal = result.proposals.find(
    (candidate) => candidate.targetKey === targetKey,
  );

  assert(proposal, `Falta propuesta ${targetKey}.`);

  return proposal;
}

function verify(
  results: RouteHeightProposalsVerificationResult[],
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
  console.log(JSON.stringify(runRouteHeightProposalsVerifications(), null, 2));
}
