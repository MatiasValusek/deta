import { PDFDocument, StandardFonts } from "pdf-lib";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { numerarPlano } from "./numeracionPlano";
import { ERROR_TABLAS_NO_ENTRAN, dibujarTablasPdf } from "./tablasPdf";
import { crearTablasPlano, type TablaLamina } from "./tablasPlano";

export type TablasPlanoVerificationResult = {
  name: string;
  status: "passed";
};

const RED: ManualRouteNetwork = {
  nodes: [
    { equipmentId: "medidor", id: "n-m", kind: "supply", origin: "manual" },
    { id: "n-d", kind: "route", origin: "manual", position: { x: 2, y: 0 } },
    { equipmentId: "cerca", id: "n-c", kind: "appliance", origin: "manual" },
    { equipmentId: "lejos", id: "n-l", kind: "appliance", origin: "manual" },
  ],
  segments: [
    { fromNodeId: "n-m", id: "s1", origin: "manual", toNodeId: "n-d" },
    { fromNodeId: "n-d", id: "s2", origin: "manual", toNodeId: "n-c" },
    { fromNodeId: "n-d", id: "s3", origin: "manual", toNodeId: "n-l" },
  ],
};
const TRAMOS = [
  { segmentId: "s1", fromNodeId: "n-m", toNodeId: "n-d", physicalLengthMeters: 2 },
  { segmentId: "s2", fromNodeId: "n-d", toNodeId: "n-c", physicalLengthMeters: 1 },
  { segmentId: "s3", fromNodeId: "n-d", toNodeId: "n-l", physicalLengthMeters: 5 },
];

export async function runTablasPlanoVerifications() {
  const results: TablasPlanoVerificationResult[] = [];

  check(results, "numera desde lo más lejano al medidor", () => {
    const numeracion = numerarPlano(RED, TRAMOS);

    return (
      numeracion.nodos.get("n-l") === "1" &&
      numeracion.nodos.get("n-c") === "2" &&
      numeracion.nodos.get("n-d") === "A" &&
      numeracion.nodos.get("n-m") === "M" &&
      numeracion.tramos.get("s3") === "1-A" &&
      numeracion.tramos.get("s1") === "A-M"
    );
  });

  const tablas = crearTablasPlano({
    bocasTaponadas: new Set(["cerca"]),
    calculationSheet: hojaFicticia(),
    equipment: artefactosFicticios(),
    materialTakeoff: materialesFicticios(),
    network: RED,
    projectGas: { heatingValueKcalPerM3: 9300 },
    result: {
      nodeLabels: {},
      segments: TRAMOS.map((tramo) => ({
        fromNodeId: tramo.fromNodeId,
        segmentId: tramo.segmentId,
        segmentPhysicalLengthMeters: tramo.physicalLengthMeters,
        toNodeId: tramo.toNodeId,
      })),
    } as unknown as TechnicalCalculationResult,
  });

  check(results, "Referencias trae número, consumos y boca taponada", () => {
    const [primera, segunda] = tablas.referencias.filas;

    return (
      primera.join("|") === "1|Calefón|18.600|2,000|—" &&
      segunda.join("|") === "2|Cocina|9.300|1,000|Sí"
    );
  });

  check(results, "Materiales deja las llaves de paso al final", () => {
    const nombres = tablas.materiales.filas.map((fila) => fila[0]);

    return nombres.join("|") === "Caño 25 mm|Codo 25|Llave de paso 20";
  });

  check(results, "Cálculo suma longitud real y equivalente", () => {
    const fila = tablas.calculo.filas.find((item) => item[0] === "1-A");

    return fila?.slice(1, 4).join("|") === "7,00|1,50|8,50" && tablas.avisos.length === 0;
  });

  const doc = await PDFDocument.create();
  const page = doc.addPage([1190, 842]);
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const tablaLarga: TablaLamina = {
    titulo: "LARGA",
    columnas: [{ titulo: "A", ancho: 1 }],
    filas: Array.from({ length: 80 }, () => ["x"]),
  };
  let error = "";

  try {
    dibujarTablasPdf({
      fuente,
      fuenteTitulo: fuente,
      page,
      tablas: [tablaLarga],
      zona: { x1: 285, y1: 5, x2: 415, y2: 120 },
    });
  } catch (causa) {
    error = causa instanceof Error ? causa.message : "";
  }

  check(results, "si las tablas no entran avisa y no recorta filas", () =>
    error === ERROR_TABLAS_NO_ENTRAN,
  );

  return results;
}

function artefactosFicticios(): WorkbenchEquipment[] {
  const base = {
    connectionPoint: { x: 0, y: 0 },
    planBaseId: "plan",
    role: "appliance" as const,
    source: "manual" as const,
  };

  return [
    { ...base, demandUnit: "kcal_h", demandValue: 9300, id: "cerca", name: "Cocina", type: "stove" },
    { ...base, demandUnit: "kcal_h", demandValue: 18600, id: "lejos", name: "Calefón", type: "instant_water_heater" },
  ];
}

function hojaFicticia(): TechnicalCalculationSheet {
  return {
    pendingRowCount: 0,
    status: "resolved",
    unsupportedRowCount: 0,
    rows: [
      {
        accessoryEquivalentLengthMeters: 1,
        adoptedDiameter: null,
        calculatedDiameter: { externalDiameterMillimeters: 20, id: "d20", label: "20" },
        capacityM3h: 3,
        downstreamApplianceIds: ["lejos"],
        downstreamAppliances: ["Calefón"],
        effectiveDiameter: { externalDiameterMillimeters: 25, id: "d25", label: "25" },
        finalCalculationLengthMeters: 8.5,
        flowM3h: 2,
        initialRouteLengthMeters: 7,
        observations: [],
        physicalLengthMeters: 5,
        segmentId: "s3",
        source: "adoption",
        status: "resolved",
        tabulatedLengthMeters: 10,
        transitionEquivalentLengthMeters: 0.5,
        tramo: "interno",
      },
    ],
  };
}

function materialesFicticios(): TechnicalMaterialTakeoff {
  const accesorio = (label: string, accessoryKind: "elbow" | "valve") => ({
    accessoryKind,
    configurationKey: label,
    familyId: label,
    kind: "accessory" as const,
    label,
    quantity: 1,
    quantityDomain: "physical_material" as const,
    source: "route_accessory" as const,
    sourceIds: [],
  });

  return {
    accessoryItems: [accesorio("Llave de paso 20", "valve"), accesorio("Codo 25", "elbow")],
    calculationQuantities: {
      routeAccessoryEquivalentLengthMetersByRouteId: {},
      routeTransitionEquivalentLengthMetersByRouteId: {},
      segmentSizingLengthMetersBySegmentId: {},
    },
    pendingItems: [],
    pendingSummary: { accessoryCount: 0, adoptionCount: 0, pipeCount: 0, total: 0, transitionCount: 0 },
    physicalMaterialQuantities: { accessoryQuantity: 2, pipeLengthMeters: 8, pipeSegmentCount: 3 },
    pipeItems: [
      {
        diameter: { externalDiameterMillimeters: 25, id: "d25", label: "25" },
        diameterKey: "d25",
        kind: "pipe",
        label: "Caño",
        physicalLengthMeters: 8,
        quantityDomain: "physical_material",
        segmentCount: 3,
        segmentIds: ["s1", "s2", "s3"],
      },
    ],
    status: "resolved",
  };
}

function check(
  results: TablasPlanoVerificationResult[],
  name: string,
  condition: () => boolean,
) {
  if (!condition()) {
    throw new Error(`No se cumple: ${name}`);
  }

  results.push({ name, status: "passed" });
}
