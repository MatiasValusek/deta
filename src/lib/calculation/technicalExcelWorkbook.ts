import type { Cell, SheetData } from "write-excel-file/browser";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type {
  TechnicalCalculationSheet,
  TechnicalCalculationSheetRow,
} from "@/lib/calculation/technicalCalculationSheet";
import type {
  TechnicalMaterialTakeoff,
  TechnicalMaterialAccessoryItem,
  TechnicalMaterialPendingItem,
  TechnicalMaterialPipeItem,
} from "@/lib/calculation/technicalMaterialTakeoff";

export const TECHNICAL_CALCULATION_WORKBOOK_SHEETS = {
  calculation: "Calculo",
  materials: "Materiales",
} as const;

export type TechnicalWorkbookSheet = {
  columns: Array<{ width: number }>;
  data: SheetData;
  sheet: typeof TECHNICAL_CALCULATION_WORKBOOK_SHEETS[keyof typeof TECHNICAL_CALCULATION_WORKBOOK_SHEETS];
  stickyRowsCount: number;
};

export function createTechnicalWorkbookSheets(params: {
  calculationSheet: TechnicalCalculationSheet;
  materialTakeoff: TechnicalMaterialTakeoff;
}): TechnicalWorkbookSheet[] {
  return [
    {
      columns: [
        { width: 18 },
        { width: 32 },
        { width: 14 },
        { width: 16 },
        { width: 22 },
        { width: 18 },
        { width: 20 },
        { width: 22 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 22 },
        { width: 16 },
        { width: 34 },
      ],
      data: createCalculationSheetData(params.calculationSheet),
      sheet: TECHNICAL_CALCULATION_WORKBOOK_SHEETS.calculation,
      stickyRowsCount: 1,
    },
    {
      columns: [
        { width: 16 },
        { width: 34 },
        { width: 28 },
        { width: 18 },
        { width: 14 },
        { width: 16 },
        { width: 42 },
      ],
      data: createMaterialsSheetData(params.materialTakeoff),
      sheet: TECHNICAL_CALCULATION_WORKBOOK_SHEETS.materials,
      stickyRowsCount: 1,
    },
  ];
}

export function createTechnicalWorkbookFileName(date = new Date()) {
  const timestamp = date
    .toISOString()
    .slice(0, 19)
    .replace(/[-:T]/g, "");

  return `deta-calculo-tecnico-${timestamp}.xlsx`;
}

function createCalculationSheetData(
  sheet: TechnicalCalculationSheet,
): SheetData {
  return [
    calculationHeaderRow(),
    ...sheet.rows.map((row) => [
      textCell(row.tramo),
      textCell(formatAppliances(row)),
      numberOrPending(row.flowM3h),
      numberOrPending(row.physicalLengthMeters),
      numberOrPending(row.initialRouteLengthMeters),
      numberOrPending(row.accessoryEquivalentLengthMeters),
      numberOrPending(row.transitionEquivalentLengthMeters),
      numberOrPending(row.finalCalculationLengthMeters),
      textCell(formatDiameter(row.calculatedDiameter)),
      textCell(formatAdoptedDiameter(row.adoptedDiameter)),
      textCell(formatDiameter(row.effectiveDiameter)),
      numberOrPending(row.tabulatedLengthMeters),
      numberOrPending(row.capacityM3h),
      textCell(formatCalculationRowStatus(row)),
    ]),
  ];
}

function createMaterialsSheetData(takeoff: TechnicalMaterialTakeoff): SheetData {
  const rows: SheetData = [materialsHeaderRow()];

  for (const item of takeoff.pipeItems) {
    rows.push(materialPipeRow(item));
  }

  for (const item of takeoff.accessoryItems) {
    rows.push(materialAccessoryRow(item));
  }

  for (const item of takeoff.pendingItems) {
    rows.push(materialPendingRow(item));
  }

  if (rows.length === 1) {
    rows.push([
      textCell("Sin materiales"),
      textCell("Sin materiales computables"),
      blankCell(),
      blankCell(),
      blankCell(),
      textCell("Pendiente"),
      blankCell(),
    ]);
  }

  return rows;
}

function calculationHeaderRow() {
  return [
    headerCell("Tramo"),
    headerCell("Artefactos aguas abajo"),
    headerCell("Caudal (m3/h)"),
    headerCell("Longitud fisica (m)"),
    headerCell("Longitud inicial del recorrido (m)"),
    headerCell("Equiv. accesorios (m)"),
    headerCell("Equiv. transiciones (m)"),
    headerCell("Longitud final de calculo (m)"),
    headerCell("Diametro minimo"),
    headerCell("Diametro adoptado"),
    headerCell("Diametro efectivo"),
    headerCell("Longitud tabulada SIGAS (m)"),
    headerCell("Capacidad (m3/h)"),
    headerCell("Estado"),
  ];
}

function materialsHeaderRow() {
  return [
    headerCell("Tipo"),
    headerCell("Item"),
    headerCell("Diametro/configuracion"),
    headerCell("Metros fisicos (m)"),
    headerCell("Cantidad"),
    headerCell("Estado"),
    headerCell("Detalle"),
  ];
}

function materialPipeRow(item: TechnicalMaterialPipeItem) {
  return [
    textCell("Canio"),
    textCell(item.label),
    textCell(formatDiameter(item.diameter)),
    numberCell(item.physicalLengthMeters),
    numberCell(item.segmentCount),
    textCell("Computable"),
    textCell(item.segmentIds.join(", ")),
  ];
}

function materialAccessoryRow(item: TechnicalMaterialAccessoryItem) {
  return [
    textCell("Accesorio"),
    textCell(item.label),
    textCell(item.configurationKey),
    textCell("No aplica"),
    numberCell(item.quantity),
    textCell("Computable"),
    textCell(item.sourceIds.join(", ")),
  ];
}

function materialPendingRow(item: TechnicalMaterialPendingItem) {
  return [
    textCell("Pendiente"),
    textCell(item.label),
    textCell(
      item.sourceId ?? item.segmentId ?? item.transitionId ?? item.code,
    ),
    textCell("Pendiente"),
    textCell("Pendiente"),
    textCell("Pendiente"),
    textCell(item.reason),
  ];
}

function headerCell(value: string): Cell {
  return {
    alignVertical: "center",
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
    borderStyle: "thin",
    fontWeight: "bold",
    value,
    wrap: true,
  };
}

function textCell(value: string): Cell {
  return {
    alignVertical: "top",
    value,
    wrap: true,
  };
}

function numberCell(value: number): Cell {
  return {
    align: "right",
    type: Number,
    value,
  };
}

function numberOrPending(value: number | null): Cell {
  return typeof value === "number" && Number.isFinite(value)
    ? numberCell(value)
    : textCell("Pendiente");
}

function blankCell(): Cell {
  return null;
}

function formatAppliances(row: TechnicalCalculationSheetRow) {
  return row.downstreamAppliances.length > 0
    ? row.downstreamAppliances.join(", ")
    : "Sin artefactos";
}

function formatCalculationRowStatus(row: TechnicalCalculationSheetRow) {
  const label =
    row.status === "resolved"
      ? "Validado"
      : row.status === "unsupported"
        ? "Incompatible"
        : "Pendiente";

  return row.observations.length > 0
    ? `${label} - ${row.observations.join(" ")}`
    : label;
}

function formatAdoptedDiameter(diameter: PipeDiameterReference | null) {
  return diameter ? formatDiameter(diameter) : "Sin adopcion";
}

function formatDiameter(diameter: PipeDiameterReference | null) {
  if (!diameter) {
    return "Pendiente";
  }

  const external = formatNumber(diameter.externalDiameterMillimeters);
  const internal = formatNumber(diameter.internalDiameterMillimeters);

  if (external && internal) {
    return `DE ${external} mm / DI ${internal} mm`;
  }

  if (external) {
    return `DE ${external} mm`;
  }

  return diameter.label;
}

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("es-AR", {
        maximumFractionDigits: 3,
      }).format(value)
    : null;
}
