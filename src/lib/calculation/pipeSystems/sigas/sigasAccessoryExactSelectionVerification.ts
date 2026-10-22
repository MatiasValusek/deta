import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import { resolveTechnicalRouteAccessories } from "@/lib/calculation/technicalRouteAccessories";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { SIGAS_PIPE_SYSTEM } from "./index";
import {
  createSigasAccessoryExactSelectionDecisions,
  createSigasAccessorySelectionDiameterIndex,
  reconcileSigasAccessoryExactCatalogRows,
  selectSigasAccessoryExactCatalogRow,
} from "./sigasAccessoryExactSelection";

export type SigasAccessoryExactSelectionVerificationResult = {
  name: string;
  status: "passed";
};

const SIGAS_20: PipeDiameterReference = {
  externalDiameterMillimeters: 20,
  id: "sigas-20",
  label: "Sigas 20 mm",
};
const SIGAS_25: PipeDiameterReference = {
  externalDiameterMillimeters: 25,
  id: "sigas-25",
  label: "Sigas 25 mm",
};

export function runSigasAccessoryExactSelectionVerifications() {
  const results: SigasAccessoryExactSelectionVerificationResult[] = [];

  verify(results, "Ambigüedad pide únicamente la rosca", () => {
    const calculation = calculateTechnicalTree({
      equipment: calculationEquipment(),
      minSegmentLengthSource: 0.000001,
      network: terminalNetwork(),
      pipeSystem: SIGAS_PIPE_SYSTEM,
      scaleMetersPerSourceUnit: 1,
    });
    const diameterIndex = createSigasAccessorySelectionDiameterIndex({
      diameterBySegmentId:
        calculation.networkSizing?.finalDiameterBySegmentId ?? {},
      result: calculation,
    });
    const decisions = createSigasAccessoryExactSelectionDecisions({
      diameterBySegmentId: diameterIndex,
      network: terminalNetwork(),
    });
    const decision = decisions[0];

    assertEqual(decisions.length, 1);
    assertEqual(calculation.status, "incomplete");
    assertEqual(
      calculation.networkSizing?.finalDiameterBySegmentId.segment?.id,
      "sigas-20",
    );
    assertEqual(decision?.fieldLabel, "Diámetro roscado");
    assert((decision?.candidates.length ?? 0) > 1, "Debe ofrecer las roscas SIGAS cargadas.");
    assertEqual(decision?.candidates[0]?.choiceLabel, "1/2");
    assertEqual(decision?.candidates[1]?.choiceLabel, "3/4");
  });

  verify(results, "Variante única se identifica automáticamente", () => {
    const network = reconcileSigasAccessoryExactCatalogRows({
      diameterBySegmentId: { segment: SIGAS_20 },
      network: valveNetwork(),
    });

    assertEqual(
      network.segments[0]?.accessories?.[0]?.catalogCode,
      "llave-esferica-20-mm",
    );
    assertEqual(
      createSigasAccessoryExactSelectionDecisions({
        diameterBySegmentId: { segment: SIGAS_20 },
        network,
      }).length,
      0,
    );
  });

  verify(results, "Selección exacta actualiza el cálculo", () => {
    const selection = selectSigasAccessoryExactCatalogRow({
      accessoryId: "terminal",
      catalogCode: "codo-90-con-rosca-hembra-25-x-3-4",
      diameter: SIGAS_25,
      network: terminalNetwork(),
      segmentId: "segment",
    });

    assert(selection.ok, "La fila exacta debería poder seleccionarse.");

    const calculation = resolveTechnicalRouteAccessories({
      diameterBySegmentId: { segment: SIGAS_25 },
      pipeSystem: SIGAS_PIPE_SYSTEM,
      route: {
        id: "route",
        physicalLengthMeters: 2,
        segmentIds: ["segment"],
        status: "resolved",
      },
      segments: selection.network.segments,
    });

    assertEqual(calculation.status, "resolved");
    assertEqual(calculation.governingRouteAccessoryEquivalentLengthMeters, 0.768);
    assertEqual(calculation.sizingLengthMeters, 2.768);

    const fullCalculation = calculateTechnicalTree({
      equipment: calculationEquipment(),
      minSegmentLengthSource: 0.000001,
      network: selection.network,
      pipeSystem: SIGAS_PIPE_SYSTEM,
      scaleMetersPerSourceUnit: 1,
    });

    assertEqual(fullCalculation.status, "valid");
    assertEqual(
      fullCalculation.networkSizing?.finalDiameterBySegmentId.segment?.id,
      "sigas-25",
    );
  });

  return results;
}

function valveNetwork(): ManualRouteNetwork {
  const network = terminalNetwork();

  return {
    ...network,
    segments: network.segments.map((segment) => ({
      ...segment,
      accessories: segment.accessories?.map((accessory) => ({
        ...accessory,
        catalogFamilyId: "llave-esferica",
        type: "valve" as const,
      })),
    })),
  };
}

function terminalNetwork(): ManualRouteNetwork {
  return {
    nodes: [
      {
        equipmentId: "meter",
        id: "supply",
        kind: "supply",
        position: { x: 0, y: 0 },
      },
      {
        equipmentId: "appliance-equipment",
        id: "appliance",
        kind: "appliance",
        position: { x: 2, y: 0 },
      },
    ],
    segments: [
      {
        accessories: [
          {
            catalogFamilyId: "codo-90-rosca-hembra",
            equivalentLengthMetersPerUnit: null,
            equivalentLengthSource: "pipe_system",
            id: "terminal",
            quantity: 1,
            segmentId: "segment",
            type: "elbow",
          },
        ],
        fromNodeId: "supply",
        id: "segment",
        toNodeId: "appliance",
      },
    ],
  };
}

function calculationEquipment(): WorkbenchEquipment[] {
  return [
    {
      connectionPoint: { x: 0, y: 0 },
      id: "meter",
      name: "M",
      planBaseId: "plan",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    },
    {
      connectionPoint: { x: 2, y: 0 },
      demandUnit: "m3_h",
      demandValue: 3.5,
      id: "appliance-equipment",
      name: "A",
      planBaseId: "plan",
      role: "appliance",
      source: "manual",
      type: "stove",
    },
  ];
}

function verify(
  results: SigasAccessoryExactSelectionVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
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
  console.log(
    JSON.stringify(runSigasAccessoryExactSelectionVerifications(), null, 2),
  );
}
