import { PDFDocument } from "pdf-lib";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type {
  TechnicalCalculationSheet,
  TechnicalCalculationSheetRow,
} from "@/lib/calculation/technicalCalculationSheet";
import type {
  TechnicalMaterialTakeoff,
} from "@/lib/calculation/technicalMaterialTakeoff";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import {
  createTechnicalPdfBytes,
  createTechnicalPdfDocumentModel,
} from "./technicalPdfDocument";

export type TechnicalPdfDocumentVerificationResult = {
  name: string;
  status: "passed";
};

const D25 = testDiameter("sigas-25", 25, 20);
const D32 = testDiameter("sigas-32", 32, 26);

export async function runTechnicalPdfDocumentVerifications() {
  const results: TechnicalPdfDocumentVerificationResult[] = [];

  await verify(results, "modelo incluye resumen y tablas", async () => {
    const model = createModel();

    assertEqual(model.title, "Deta - Calculo tecnico");
    assertEqual(model.calculationTable.rows.length, 2);
    assertEqual(model.materialTable.rows.length, 3);
    assert(
      model.installationSummary.some(
        ([label, value]) =>
          label === "Sistema de calculo" && value === "SIGAS test",
      ),
      "Falta sistema de calculo.",
    );
  });

  await verify(results, "calculo conserva pendientes", async () => {
    const model = createModel();
    const pendingRow = model.calculationTable.rows[1];

    assertEqual(pendingRow?.[2], "Pendiente");
    assertEqual(pendingRow?.[7], "Pendiente");
    assertEqual(pendingRow?.[13], "Pendiente - Falta dimensionado.");
  });

  await verify(results, "materiales usa metros fisicos", async () => {
    const model = createModel();
    const pipeRow = model.materialTable.rows[0];
    const materialPayload = JSON.stringify(model.materialTable.rows);

    assertEqual(pipeRow?.[0], "Tuberia");
    assertEqual(pipeRow?.[3], 10);
    assert(!materialPayload.includes("99"), "Uso longitud de calculo como material.");
  });

  await verify(results, "materiales incluye accesorios y pendientes", async () => {
    const model = createModel();

    assertEqual(model.materialTable.rows[1]?.[0], "Accesorio");
    assertEqual(model.materialTable.rows[1]?.[4], 2);
    assertEqual(model.materialTable.rows[2]?.[0], "Pendiente");
    assertEqual(model.materialTable.rows[2]?.[3], "Pendiente");
  });

  await verify(results, "genera PDF valido", async () => {
    const bytes = await createTechnicalPdfBytes(createParams());
    const header = Buffer.from(bytes.subarray(0, 5)).toString("utf8");
    const doc = await PDFDocument.load(bytes);

    assertEqual(header, "%PDF-");
    assert(doc.getPageCount() > 0, "PDF sin paginas.");
  });

  return results;
}

function createModel() {
  return createTechnicalPdfDocumentModel(createParams());
}

function createParams() {
  return {
    calculationSheet: technicalCalculationSheet(),
    generatedAt: new Date("2026-08-27T12:00:00Z"),
    materialTakeoff: technicalMaterialTakeoff(),
    result: technicalCalculationResult(),
  };
}

function technicalCalculationSheet(): TechnicalCalculationSheet {
  const rows: TechnicalCalculationSheetRow[] = [
    {
      accessoryEquivalentLengthMeters: 3,
      adoptedDiameter: D32,
      calculatedDiameter: D25,
      capacityM3h: 3.2,
      downstreamApplianceIds: ["appliance-a"],
      downstreamAppliances: ["Artefacto A"],
      effectiveDiameter: D32,
      finalCalculationLengthMeters: 17.5,
      flowM3h: 1.5,
      initialRouteLengthMeters: 12,
      observations: [],
      physicalLengthMeters: 4,
      segmentId: "s1",
      source: "adoption",
      status: "resolved",
      tabulatedLengthMeters: 18,
      transitionEquivalentLengthMeters: 2.5,
      tramo: "M -> A",
    },
    {
      accessoryEquivalentLengthMeters: null,
      adoptedDiameter: null,
      calculatedDiameter: null,
      capacityM3h: null,
      downstreamApplianceIds: ["appliance-b"],
      downstreamAppliances: ["Artefacto B"],
      effectiveDiameter: null,
      finalCalculationLengthMeters: null,
      flowM3h: null,
      initialRouteLengthMeters: null,
      observations: ["Falta dimensionado."],
      physicalLengthMeters: null,
      segmentId: "s2",
      source: "segment",
      status: "pending",
      tabulatedLengthMeters: null,
      transitionEquivalentLengthMeters: null,
      tramo: "A -> B",
    },
  ];

  return {
    pendingRowCount: 1,
    rows,
    status: "pending",
    unsupportedRowCount: 0,
  };
}

function technicalMaterialTakeoff(): TechnicalMaterialTakeoff {
  return {
    accessoryItems: [
      {
        accessoryKind: "elbow",
        configurationKey: "elbow:sigas-25",
        familyId: "elbow",
        kind: "accessory",
        label: "Codo 90 DE 25 mm",
        quantity: 2,
        quantityDomain: "physical_material",
        source: "route_accessory",
        sourceIds: ["elbow-1", "elbow-2"],
      },
    ],
    calculationQuantities: {
      routeAccessoryEquivalentLengthMetersByRouteId: {
        route: 89,
      },
      routeTransitionEquivalentLengthMetersByRouteId: {
        route: 88,
      },
      segmentSizingLengthMetersBySegmentId: {
        s1: 99,
      },
    },
    pendingItems: [
      {
        category: "transition",
        code: "diameter_transition_pending",
        countAsMaterial: false,
        label: "Transicion pendiente",
        reason: "Requiere confirmacion.",
        transitionId: "transition-1",
      },
    ],
    pendingSummary: {
      accessoryCount: 0,
      adoptionCount: 0,
      pipeCount: 0,
      total: 1,
      transitionCount: 1,
    },
    physicalMaterialQuantities: {
      accessoryQuantity: 2,
      pipeLengthMeters: 10,
      pipeSegmentCount: 1,
    },
    pipeItems: [
      {
        diameter: D25,
        diameterKey: "sigas-25",
        kind: "pipe",
        label: "Tuberia DE 25 mm",
        physicalLengthMeters: 10,
        quantityDomain: "physical_material",
        segmentCount: 1,
        segmentIds: ["s1"],
      },
    ],
    status: "pending",
  };
}

function technicalCalculationResult(): TechnicalCalculationResult {
  return {
    issues: [],
    networkSizing: {
      status: "resolved",
    },
    pipeSystem: {
      id: "sigas",
      name: "SIGAS test",
    },
    professionalDiameterAdoption: null,
    status: "valid",
    totals: {
      accumulatedFlow: 1.5,
      accumulatedFlowUnit: "m3_h",
      applianceCount: 1,
      calculationLengthMeters: 17.5,
      physicalLengthMeters: 10,
      segmentCount: 2,
    },
    transitionAwareNetworkSizing: null,
  } as unknown as TechnicalCalculationResult;
}

function testDiameter(
  id: string,
  externalDiameterMillimeters: number,
  internalDiameterMillimeters: number,
): PipeDiameterReference {
  return {
    externalDiameterMillimeters,
    id,
    internalDiameterMillimeters,
    label: `DE ${externalDiameterMillimeters}`,
  };
}

async function verify(
  results: TechnicalPdfDocumentVerificationResult[],
  name: string,
  check: () => Promise<void>,
) {
  await check();
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

if (process.env.NODE_ENV === "test") {
  runTechnicalPdfDocumentVerifications()
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
