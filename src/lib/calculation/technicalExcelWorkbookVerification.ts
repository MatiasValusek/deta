import writeXlsxFile from "write-excel-file/node";
import type { Cell } from "write-excel-file/browser";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type {
  TechnicalCalculationSheet,
  TechnicalCalculationSheetRow,
} from "@/lib/calculation/technicalCalculationSheet";
import type {
  TechnicalMaterialTakeoff,
} from "@/lib/calculation/technicalMaterialTakeoff";
import {
  TECHNICAL_CALCULATION_WORKBOOK_SHEETS,
  createTechnicalWorkbookSheets,
} from "./technicalExcelWorkbook";

export type TechnicalExcelWorkbookVerificationResult = {
  name: string;
  status: "passed";
};

const D25 = testDiameter("sigas-25", 25, 20);
const D32 = testDiameter("sigas-32", 32, 26);

export async function runTechnicalExcelWorkbookVerifications() {
  const results: TechnicalExcelWorkbookVerificationResult[] = [];

  await verify(results, "genera hojas Calculo y Materiales", async () => {
    const sheets = createWorkbookSheets();

    assertEqual(sheets.length, 2);
    assertEqual(sheets[0]?.sheet, TECHNICAL_CALCULATION_WORKBOOK_SHEETS.calculation);
    assertEqual(sheets[1]?.sheet, TECHNICAL_CALCULATION_WORKBOOK_SHEETS.materials);
  });

  await verify(results, "Calculo conserva columnas y filas de planilla", async () => {
    const calculation = createWorkbookSheets()[0];

    assertEqual(cellValue(calculation?.data[0]?.[0]), "Tramo");
    assertEqual(cellValue(calculation?.data[0]?.[2]), "Caudal (m3/h)");
    assertEqual(cellValue(calculation?.data[0]?.[13]), "Estado");
    assertEqual(calculation?.data.length, 3);
  });

  await verify(results, "Calculo exporta numeros como numeros", async () => {
    const calculation = createWorkbookSheets()[0];

    assertEqual(cellValue(calculation?.data[1]?.[2]), 1.5);
    assertEqual(typeof cellValue(calculation?.data[1]?.[2]), "number");
    assertEqual(cellValue(calculation?.data[1]?.[7]), 17.5);
    assertEqual(typeof cellValue(calculation?.data[1]?.[7]), "number");
  });

  await verify(results, "Calculo exporta pendientes como texto", async () => {
    const calculation = createWorkbookSheets()[0];

    assertEqual(cellValue(calculation?.data[2]?.[2]), "Pendiente");
    assertEqual(cellValue(calculation?.data[2]?.[7]), "Pendiente");
  });

  await verify(results, "Materiales usa metros fisicos de canio", async () => {
    const materials = createWorkbookSheets()[1];
    const pipeRow = materials?.data[1];
    const materialValues = JSON.stringify(
      materials?.data.map((row) => row.map(cellValue)),
    );

    assertEqual(cellValue(pipeRow?.[0]), "Canio");
    assertEqual(cellValue(pipeRow?.[3]), 10);
    assertEqual(typeof cellValue(pipeRow?.[3]), "number");
    assert(!materialValues.includes("99"), "Materiales exporto longitud de calculo.");
  });

  await verify(results, "Materiales exporta accesorios y pendientes", async () => {
    const materials = createWorkbookSheets()[1];

    assertEqual(cellValue(materials?.data[2]?.[0]), "Accesorio");
    assertEqual(cellValue(materials?.data[2]?.[4]), 2);
    assertEqual(cellValue(materials?.data[3]?.[0]), "Pendiente");
    assertEqual(cellValue(materials?.data[3]?.[3]), "Pendiente");
  });

  await verify(results, "genera workbook xlsx", async () => {
    const buffer = await writeXlsxFile(createWorkbookSheets()).toBuffer();

    assert(buffer.length > 0, "Workbook vacio.");
    assertEqual(buffer.subarray(0, 2).toString("utf8"), "PK");
  });

  return results;
}

function createWorkbookSheets() {
  return createTechnicalWorkbookSheets({
    calculationSheet: technicalCalculationSheet(),
    materialTakeoff: technicalMaterialTakeoff(),
  });
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
        label: "Canio DE 25 mm",
        physicalLengthMeters: 10,
        quantityDomain: "physical_material",
        segmentCount: 1,
        segmentIds: ["s1"],
      },
    ],
    status: "pending",
  };
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

function cellValue(cell: Cell | undefined) {
  if (
    cell &&
    typeof cell === "object" &&
    "value" in cell
  ) {
    return cell.value;
  }

  return cell;
}

async function verify(
  results: TechnicalExcelWorkbookVerificationResult[],
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
  runTechnicalExcelWorkbookVerifications()
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
