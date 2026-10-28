import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import { createTechnicalAxonometricView } from "@/lib/calculation/technicalAxonometric";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { routeEquipmentTerminalSegmentId } from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { createTechnicalRoutePolyline } from "@/lib/sections/technicalRoutePolyline";
import { resolveTechnicalRouteSegments } from "@/lib/sections/technicalRouteElevation";
import { createRouteHeightProposals } from "@/lib/sections/routeHeightProposals";
import { generateAutomaticRouteRisers } from "@/lib/sections/routeRiserProposals";

const EPSILON = 0.000001;
const DISTRIBUTION_HEIGHT = 1.8;

export type RouteRiserProposalVerificationResult = {
  name: string;
  status: "passed";
};

export function runRouteRiserProposalVerifications() {
  const results: RouteRiserProposalVerificationResult[] = [];

  verify(results, "01C-C1 medidor unico genera una subida ortogonal", () => {
    const fixture = completeFixture();
    const original = JSON.stringify(fixture.network);
    const result = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: fixture.equipment,
      network: fixture.network,
      scaleMetersPerSourceUnit: 1,
    });
    const supplyRiser = result.risers.find((riser) => riser.kind === "supply");
    const segment = result.network.segments.find((item) => item.id === "M-R");
    const verticalVertex = segment?.vertices?.find(
      (point) =>
        close(point.x, 0) &&
        close(point.y, 0) &&
        close(point.z, DISTRIBUTION_HEIGHT),
    );

    assertEqual(result.status, "ready");
    assert(supplyRiser, "Falta el montante del medidor.");
    assert(verticalVertex, "Falta el vertice vertical en el XY del medidor.");
    assertEqual(JSON.stringify(fixture.network), original);
    assert(
      result.interferences.some(
        (item) =>
          item.riserId === supplyRiser.id &&
          item.kind === "unverified_3d_clearance" &&
          item.status === "unverified",
      ),
      "Falta explicitar la limitacion de verificacion tridimensional.",
    );
  });

  verify(results, "01C-C1 medidor con varias salidas queda incompleto", () => {
    const fixture = completeFixture();
    fixture.network.nodes.push({
      id: "R2",
      kind: "route",
      position: { x: 0, y: 2, z: DISTRIBUTION_HEIGHT },
    });
    fixture.network.segments.push({
      fromNodeId: "M",
      id: "M-R2",
      toNodeId: "R2",
    });
    const result = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: fixture.equipment,
      network: fixture.network,
      scaleMetersPerSourceUnit: 1,
    });

    assertEqual(result.status, "incomplete");
    assert(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === "supply_outlet_count",
      ),
      "Falta diagnostico de multiples salidas.",
    );
    assertEqual(
      result.network.segments.find((segment) => segment.id === "M-R")?.vertices
        ?.length ?? 0,
      0,
    );
  });

  verify(results, "01C-C1 no inventa una cota faltante del medidor", () => {
    const fixture = completeFixture();
    const meter = fixture.equipment.find((item) => item.id === "meter");
    assert(meter, "Falta medidor.");
    delete meter.elevation;
    const result = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: fixture.equipment,
      network: fixture.network,
      scaleMetersPerSourceUnit: 1,
    });

    assertEqual(result.status, "incomplete");
    assert(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === "supply_height_unconfirmed",
      ),
      "Falta solicitar la cota confirmada del medidor.",
    );
    assertEqual(
      result.network.segments.find((segment) => segment.id === "M-R")?.vertices
        ?.length ?? 0,
      0,
    );
  });

  verify(results, "01C-C1 terminal con y sin bajada conserva ortogonalidad", () => {
    const withDrop = completeFixture();
    const dropResult = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: withDrop.equipment,
      network: withDrop.network,
      scaleMetersPerSourceUnit: 1,
    });
    const withoutDrop = completeFixture({ verticalDropMeters: 0 });
    const noDropResult = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: withoutDrop.equipment,
      network: withoutDrop.network,
      scaleMetersPerSourceUnit: 1,
    });
    const terminalDrops = dropResult.risers.filter(
      (riser) => riser.kind === "terminal" && riser.direction === "drop",
    );
    const noDropTerminal = noDropResult.risers.filter(
      (riser) => riser.kind === "terminal" && riser.direction === "drop",
    );

    assertEqual(terminalDrops.length, 2);
    assertEqual(noDropTerminal.length, 1);
    for (const riser of [...terminalDrops, ...noDropTerminal]) {
      assert(Number.isFinite(riser.point.x) && Number.isFinite(riser.point.y), "XY invalido.");
      assert(!close(riser.fromHeightMeters, riser.toHeightMeters), "Montante sin altura.");
    }
  });

  verify(results, "01C-C1 no sobrescribe una cota confirmada diferente", () => {
    const fixture = completeFixture();
    const terminalStart = fixture.network.nodes.find((node) => node.id === "T");
    assert(terminalStart?.position, "Falta inicio terminal.");
    terminalStart.position.z = 2.4;
    terminalStart.elevation = {
      source: "professional_edit",
      status: "confirmed",
    };
    const beforeTerminal = JSON.stringify(
      fixture.network.segments.find((segment) =>
        segment.id === routeEquipmentTerminalSegmentId("plan", "appliance"),
      ),
    );
    const result = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: fixture.equipment,
      network: fixture.network,
      scaleMetersPerSourceUnit: 1,
    });

    assertEqual(result.status, "incomplete");
    assert(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "confirmed_height_conflict" &&
          diagnostic.equipmentId === "appliance",
      ),
      "Falta preservar y reportar la cota terminal confirmada.",
    );
    assertEqual(
      JSON.stringify(
        result.network.segments.find(
          (segment) =>
            segment.id === routeEquipmentTerminalSegmentId("plan", "appliance"),
        ),
      ),
      beforeTerminal,
    );
  });

  verify(results, "01C-C1 conserva vertices terminales confirmados", () => {
    const fixture = completeFixture();
    const terminalSegment = fixture.network.segments.find(
      (segment) =>
        segment.id === routeEquipmentTerminalSegmentId("plan", "appliance"),
    );
    assert(terminalSegment, "Falta tramo terminal.");
    terminalSegment.vertices = [{ x: 3, y: 0, z: 1.5 }];
    terminalSegment.vertexElevations = [
      { source: "professional_edit", status: "confirmed" },
    ];
    const before = JSON.stringify(terminalSegment);
    const result = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: fixture.equipment,
      network: fixture.network,
      scaleMetersPerSourceUnit: 1,
    });

    assertEqual(result.status, "incomplete");
    assert(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "confirmed_height_conflict" &&
          diagnostic.segmentId === terminalSegment.id,
      ),
      "Falta reportar el vertice terminal confirmado.",
    );
    assertEqual(
      JSON.stringify(
        result.network.segments.find(
          (segment) => segment.id === terminalSegment.id,
        ),
      ),
      before,
    );
  });

  verify(results, "01C-C1 regeneracion no duplica geometria ni accesorios SIGAS", () => {
    const fixture = completeFixture();
    const first = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: fixture.equipment,
      network: fixture.network,
      scaleMetersPerSourceUnit: 1,
    });
    const second = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: fixture.equipment,
      network: first.network,
      scaleMetersPerSourceUnit: 1,
    });
    const terminalSegment = second.network.segments.find(
      (segment) =>
        segment.id === routeEquipmentTerminalSegmentId("plan", "appliance"),
    );

    assertEqual(JSON.stringify(second.network), JSON.stringify(first.network));
    assertEqual(second.risers.length, first.risers.length);
    assertEqual(
      terminalSegment?.accessories?.filter(
        (accessory) => accessory.id === "route-terminal:appliance:terminal",
      ).length,
      1,
    );
    assertEqual(
      terminalSegment?.accessories?.filter(
        (accessory) => accessory.id === "route-terminal:appliance:valve",
      ).length,
      1,
    );
    assertEqual(
      terminalSegment?.accessories?.find(
        (accessory) => accessory.id === "route-terminal:appliance:terminal",
      )?.catalogCode,
      "SIGAS-RH-PROFESIONAL",
    );
    assert(
      terminalSegment?.accessories?.some(
        (accessory) => accessory.id === "manual-existing",
      ),
      "Se perdio una decision manual existente.",
    );
  });

  verify(results, "01C-C1 restriccion XY invalida la alternativa", () => {
    const fixture = completeFixture();
    const result = generateAutomaticRouteRisers({
      distributionHeightMeters: DISTRIBUTION_HEIGHT,
      equipment: fixture.equipment,
      network: fixture.network,
      restrictions: [
        {
          id: "obstacle",
          kind: "polygon",
          polygon: [
            { x: -0.1, y: -0.1 },
            { x: 0.1, y: -0.1 },
            { x: 0.1, y: 0.1 },
            { x: -0.1, y: 0.1 },
          ],
        },
      ],
      scaleMetersPerSourceUnit: 1,
    });

    assertEqual(result.status, "invalid");
    assert(
      result.interferences.some(
        (item) =>
          item.kind === "known_xy_restriction" &&
          item.restrictionIds.includes("obstacle"),
      ),
      "Falta interferencia conocida.",
    );
  });

  verify(results, "01C-C1 integra Planta, Corte, Axonometrica y calculo", () => {
    const fixture = completeFixture({
      networkAtZero: true,
      requiresShutoffValve: false,
    });
    const result = createRouteHeightProposals({
      equipment: fixture.equipment,
      minSegmentLengthSource: EPSILON,
      network: fixture.network,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      professionalDistributionHeight: {
        heightMeters: DISTRIBUTION_HEIGHT,
        reference: "project_datum",
        source: "professional",
      },
      scaleMetersPerSourceUnit: 1,
    });
    const riserProposal = result.automaticRisers;

    assertEqual(riserProposal?.status, "ready");
    assert(
      result.coordinatedSimulation?.simulation.calculations
        .validationsPreserved === true,
      `La simulacion conjunta fallo: ${JSON.stringify(result.diagnostics)}`,
    );
    assert(
      (result.coordinatedSimulation?.simulation.lengths.totalDeltaMeters ?? 0) > 0,
      "El calculo no incorporo la longitud vertical.",
    );
    assert(riserProposal, "Falta propuesta conjunta de montantes.");

    const resolved = resolveTechnicalRouteSegments({
      equipment: fixture.equipment,
      network: riserProposal.network,
    });
    const supplySegment = resolved.find((segment) => segment.id === "M-R");
    assert(supplySegment, "Falta tramo del medidor en la geometria resuelta.");
    const polyline = createTechnicalRoutePolyline(supplySegment);
    assert(
      polyline.points.some((point) => point.source === "vertical"),
      "Corte/Axonometrica no reciben un punto vertical explicito.",
    );
    assert(
      supplySegment.path.some(
        (point) => close(point.x, 0) && close(point.y, 0) && close(point.z, DISTRIBUTION_HEIGHT),
      ),
      "La planta no conserva el XY del montante.",
    );

    const calculation = calculateTechnicalTree({
      equipment: fixture.equipment,
      minSegmentLengthSource: EPSILON,
      network: riserProposal.network,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      scaleMetersPerSourceUnit: 1,
    });
    assert(
      calculation.status !== "invalid",
      "La red con montantes no debe invalidar el calculo.",
    );
    assert(
      (calculation.totals.physicalLengthMeters ?? 0) > 5,
      "La longitud fisica no incluye los montantes.",
    );
    const inventory = createTechnicalPhysicalAccessoryInventory({
      equipment: fixture.equipment,
      network: riserProposal.network,
      result: calculation,
      routeTransitionResolutions:
        calculation.transitionAwareNetworkSizing?.routeTransitionResolutions,
    });
    const axonometric = createTechnicalAxonometricView({
      equipment: fixture.equipment,
      inventory,
      network: riserProposal.network,
      result: calculation,
      scaleMetersPerSourceUnit: 1,
    });
    assert(
      axonometric.segments
        .find((segment) => segment.id === "M-R")
        ?.path.some((point) => point.source === "vertical"),
      "La axonometrica no conserva la pata vertical.",
    );
  });

  return results;
}

function completeFixture(
  options: {
    networkAtZero?: boolean;
    requiresShutoffValve?: boolean;
    verticalDropMeters?: number;
  } = {},
): {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
} {
  const terminalSegmentId = routeEquipmentTerminalSegmentId(
    "plan",
    "appliance",
  );
  const equipment: WorkbenchEquipment[] = [
    {
      connectionPoint: { x: 0, y: 0, z: 0.4 },
      elevation: { source: "professional_edit", status: "confirmed" },
      id: "meter",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: {
        x: 4,
        y: 0,
        z: 1.2 - (options.verticalDropMeters ?? 0.4),
      },
      demandUnit: "m3_h",
      demandValue: 0.4,
      id: "appliance",
      name: "Artefacto",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      terminalConfig: {
        connectionHeightMeters: 1.2,
        heightSource: "professional_edit",
        heightStatus: "confirmed",
        lateralOffsetMeters: 0,
        outletSide: "direct",
        requiresShutoffValve: options.requiresShutoffValve ?? true,
        terminalProfile: "generic_terminal",
        verticalDropMeters: options.verticalDropMeters ?? 0.4,
      },
      type: "other",
    },
  ];
  const routeHeight = options.networkAtZero ? 0 : DISTRIBUTION_HEIGHT;
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: "meter", id: "M", kind: "supply" },
      { id: "R", kind: "route", position: { x: 2, y: 0, z: routeHeight } },
      { id: "T", kind: "route", position: { x: 3, y: 0, z: routeHeight } },
      { equipmentId: "appliance", id: "A", kind: "appliance" },
    ],
    segments: [
      { fromNodeId: "M", id: "M-R", toNodeId: "R" },
      { fromNodeId: "R", id: "R-T", toNodeId: "T" },
      {
        accessories: [
          {
            catalogCode: "SIGAS-RH-PROFESIONAL",
            catalogFamilyId: "codo-90-rosca-hembra",
            equivalentLengthMetersPerUnit: null,
            equivalentLengthSource: "pipe_system",
            id: "route-terminal:appliance:terminal",
            origin: "user_confirmed",
            quantity: 1,
            segmentId: terminalSegmentId,
            type: "elbow",
          },
          {
            equivalentLengthMetersPerUnit: 0.1,
            equivalentLengthSource: "manual",
            id: "manual-existing",
            origin: "manual",
            quantity: 1,
            segmentId: terminalSegmentId,
            type: "other",
          },
        ],
        fromNodeId: "T",
        id: terminalSegmentId,
        toNodeId: "A",
      },
    ],
  };

  return { equipment, network };
}

function verify(
  results: RouteRiserProposalVerificationResult[],
  name: string,
  run: () => void,
) {
  run();
  results.push({ name, status: "passed" });
}

function close(actual: number | null | undefined, expected: number) {
  return (
    actual !== null &&
    actual !== undefined &&
    Math.abs(actual - expected) <= EPSILON
  );
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(
    actual === expected,
    `Expected ${String(expected)}, got ${String(actual)}`,
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
  console.log(JSON.stringify(runRouteRiserProposalVerifications(), null, 2));
}
