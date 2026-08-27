import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type {
  TechnicalCalculationSheet,
  TechnicalCalculationSheetRow,
} from "@/lib/calculation/technicalCalculationSheet";
import type {
  TechnicalMaterialAccessoryItem,
  TechnicalMaterialPendingItem,
  TechnicalMaterialPipeItem,
  TechnicalMaterialTakeoff,
} from "@/lib/calculation/technicalMaterialTakeoff";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";

export type TechnicalPdfCell = number | string;

export type TechnicalPdfTableColumn = {
  align?: "left" | "right";
  header: string;
  width: number;
};

export type TechnicalPdfTable = {
  columns: TechnicalPdfTableColumn[];
  rows: TechnicalPdfCell[][];
};

export type TechnicalPdfDocumentModel = {
  calculationTable: TechnicalPdfTable;
  generatedAt: Date;
  installationSummary: Array<[string, string]>;
  materialTable: TechnicalPdfTable;
  observationLines: string[];
  title: string;
};

type PdfFonts = {
  bold: PDFFont;
  regular: PDFFont;
};

type PdfContext = {
  doc: PDFDocument;
  fonts: PdfFonts;
  page: PDFPage;
  y: number;
};

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const PAGE_SIZE: [number, number] = [PAGE_WIDTH, PAGE_HEIGHT];
const MARGIN = 24;
const BOTTOM_MARGIN = 28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TEXT_COLOR = rgb(0.12, 0.16, 0.22);
const MUTED_COLOR = rgb(0.38, 0.44, 0.52);
const LINE_COLOR = rgb(0.8, 0.84, 0.9);
const HEADER_FILL = rgb(0.95, 0.97, 0.99);
const PENDING = "Pendiente";

export function createTechnicalPdfDocumentModel(params: {
  calculationSheet: TechnicalCalculationSheet;
  generatedAt?: Date;
  materialTakeoff: TechnicalMaterialTakeoff;
  result: TechnicalCalculationResult | null;
}): TechnicalPdfDocumentModel {
  const generatedAt = params.generatedAt ?? new Date();

  return {
    calculationTable: {
      columns: calculationColumns(),
      rows: params.calculationSheet.rows.map(calculationRow),
    },
    generatedAt,
    installationSummary: installationSummary({
      calculationSheet: params.calculationSheet,
      materialTakeoff: params.materialTakeoff,
      result: params.result,
    }),
    materialTable: {
      columns: materialColumns(),
      rows: materialRows(params.materialTakeoff),
    },
    observationLines: observationLines({
      calculationSheet: params.calculationSheet,
      materialTakeoff: params.materialTakeoff,
      result: params.result,
    }),
    title: "Deta - Calculo tecnico",
  };
}

export async function createTechnicalPdfBytes(params: {
  calculationSheet: TechnicalCalculationSheet;
  generatedAt?: Date;
  materialTakeoff: TechnicalMaterialTakeoff;
  result: TechnicalCalculationResult | null;
}) {
  const model = createTechnicalPdfDocumentModel(params);
  const doc = await PDFDocument.create();
  const fonts = {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    regular: await doc.embedFont(StandardFonts.Helvetica),
  };
  const context: PdfContext = {
    doc,
    fonts,
    page: doc.addPage(PAGE_SIZE),
    y: PAGE_HEIGHT - MARGIN,
  };

  drawTitle(context, model);
  drawSummary(context, model.installationSummary);
  drawSectionTitle(context, "Planilla de calculo");
  drawTable(context, model.calculationTable);
  drawSectionTitle(context, "Materiales");
  drawTable(context, model.materialTable);
  drawSectionTitle(context, "Pendientes y observaciones");
  drawObservationLines(context, model.observationLines);
  drawFooters(context.doc, fonts);

  return context.doc.save();
}

export function createTechnicalPdfFileName(date = new Date()) {
  const timestamp = date
    .toISOString()
    .slice(0, 19)
    .replace(/[-:T]/g, "");

  return `deta-calculo-tecnico-${timestamp}.pdf`;
}

function calculationColumns(): TechnicalPdfTableColumn[] {
  return [
    { header: "Tramo", width: 52 },
    { header: "Artefactos aguas abajo", width: 78 },
    { align: "right", header: "Caudal (m3/h)", width: 42 },
    { align: "right", header: "Long. fisica (m)", width: 46 },
    { align: "right", header: "Long. inicial (m)", width: 54 },
    { align: "right", header: "Equiv. accesorios (m)", width: 50 },
    { align: "right", header: "Equiv. transiciones (m)", width: 54 },
    { align: "right", header: "Long. final calculo (m)", width: 54 },
    { header: "Diam. minimo", width: 56 },
    { header: "Diam. adoptado", width: 56 },
    { header: "Diam. efectivo", width: 56 },
    { align: "right", header: "SIGAS (m)", width: 48 },
    { align: "right", header: "Capacidad (m3/h)", width: 46 },
    { header: "Estado", width: 95 },
  ];
}

function materialColumns(): TechnicalPdfTableColumn[] {
  return [
    { header: "Tipo", width: 60 },
    { header: "Item", width: 140 },
    { header: "Diametro/configuracion", width: 150 },
    { align: "right", header: "Metros fisicos (m)", width: 80 },
    { align: "right", header: "Cantidad", width: 60 },
    { header: "Estado", width: 70 },
    { header: "Detalle", width: 227 },
  ];
}

function calculationRow(row: TechnicalCalculationSheetRow): TechnicalPdfCell[] {
  return [
    row.tramo,
    formatAppliances(row),
    valueOrPending(row.flowM3h),
    valueOrPending(row.physicalLengthMeters),
    valueOrPending(row.initialRouteLengthMeters),
    valueOrPending(row.accessoryEquivalentLengthMeters),
    valueOrPending(row.transitionEquivalentLengthMeters),
    valueOrPending(row.finalCalculationLengthMeters),
    formatDiameter(row.calculatedDiameter),
    row.adoptedDiameter ? formatDiameter(row.adoptedDiameter) : "Sin adopcion",
    formatDiameter(row.effectiveDiameter),
    valueOrPending(row.tabulatedLengthMeters),
    valueOrPending(row.capacityM3h),
    formatCalculationRowStatus(row),
  ];
}

function materialRows(takeoff: TechnicalMaterialTakeoff): TechnicalPdfCell[][] {
  const rows = [
    ...takeoff.pipeItems.map(materialPipeRow),
    ...takeoff.accessoryItems.map(materialAccessoryRow),
    ...takeoff.pendingItems.map(materialPendingRow),
  ];

  return rows.length > 0
    ? rows
    : [["Sin materiales", "Sin materiales computables", "", "", "", PENDING, ""]];
}

function materialPipeRow(item: TechnicalMaterialPipeItem): TechnicalPdfCell[] {
  return [
    "Tuberia",
    item.label,
    formatDiameter(item.diameter),
    item.physicalLengthMeters,
    item.segmentCount,
    "Computable",
    item.segmentIds.join(", "),
  ];
}

function materialAccessoryRow(
  item: TechnicalMaterialAccessoryItem,
): TechnicalPdfCell[] {
  return [
    "Accesorio",
    item.label,
    item.configurationKey,
    "No aplica",
    item.quantity,
    "Computable",
    item.sourceIds.join(", "),
  ];
}

function materialPendingRow(item: TechnicalMaterialPendingItem): TechnicalPdfCell[] {
  return [
    PENDING,
    item.label,
    item.sourceId ?? item.segmentId ?? item.transitionId ?? item.code,
    PENDING,
    PENDING,
    PENDING,
    item.reason,
  ];
}

function installationSummary(params: {
  calculationSheet: TechnicalCalculationSheet;
  materialTakeoff: TechnicalMaterialTakeoff;
  result: TechnicalCalculationResult | null;
}): Array<[string, string]> {
  const result = params.result;

  return [
    ["Estado", result ? calculationStatusLabel(result.status) : PENDING],
    ["Sistema de calculo", result ? pipeSystemLabel(result) : PENDING],
    ["Modo tecnico", result ? calculationModeLabel(result) : PENDING],
    ["Tramos", String(result?.totals.segmentCount ?? params.calculationSheet.rows.length)],
    ["Artefactos", String(result?.totals.applianceCount ?? PENDING)],
    [
      "Caudal total (m3/h)",
      result?.totals.accumulatedFlowUnit === "m3_h"
        ? formatNumber(result.totals.accumulatedFlow)
        : PENDING,
    ],
    [
      "Longitud fisica total (m)",
      formatNumber(result?.totals.physicalLengthMeters ?? null),
    ],
    [
      "Longitud calculo total (m)",
      formatNumber(result?.totals.calculationLengthMeters ?? null),
    ],
    [
      "Materiales pendientes",
      String(params.materialTakeoff.pendingSummary.total),
    ],
  ];
}

function observationLines(params: {
  calculationSheet: TechnicalCalculationSheet;
  materialTakeoff: TechnicalMaterialTakeoff;
  result: TechnicalCalculationResult | null;
}) {
  const lines = [
    ...(params.result?.issues.map((issue) => issue.message) ?? []),
    ...params.calculationSheet.rows
      .filter((row) => row.status !== "resolved" || row.observations.length > 0)
      .map((row) =>
        `${row.tramo}: ${formatCalculationRowStatus(row)}`,
      ),
    ...params.materialTakeoff.pendingItems.map(
      (item) => `${item.label}: ${item.reason}`,
    ),
  ];
  const deduped = dedupeStrings(lines);

  return deduped.length > 0 ? deduped : ["Sin pendientes ni observaciones."];
}

function drawTitle(context: PdfContext, model: TechnicalPdfDocumentModel) {
  drawTextLine(context, model.title, {
    font: context.fonts.bold,
    size: 16,
  });
  drawTextLine(context, `Generado: ${formatDateTime(model.generatedAt)}`, {
    color: MUTED_COLOR,
    size: 8,
  });
  context.y -= 8;
}

function drawSummary(context: PdfContext, rows: Array<[string, string]>) {
  drawSectionTitle(context, "Resumen de instalacion");
  const columns: TechnicalPdfTableColumn[] = [
    { header: "Dato", width: 180 },
    { header: "Valor", width: 260 },
  ];

  drawTable(context, {
    columns,
    rows,
  });
}

function drawSectionTitle(context: PdfContext, title: string) {
  ensureSpace(context, 24);
  context.y -= 8;
  drawTextLine(context, title, {
    font: context.fonts.bold,
    size: 11,
  });
  context.y -= 3;
}

function drawTable(context: PdfContext, table: TechnicalPdfTable) {
  drawTableHeader(context, table.columns);

  for (const row of table.rows) {
    const rowHeight = calculateRowHeight({
      columns: table.columns,
      font: context.fonts.regular,
      row,
      size: 6,
    });

    if (context.y - rowHeight < BOTTOM_MARGIN) {
      addPage(context);
      drawTableHeader(context, table.columns);
    }

    drawTableRow(context, {
      columns: table.columns,
      fill: null,
      font: context.fonts.regular,
      row,
      rowHeight,
      size: 6,
      textColor: TEXT_COLOR,
    });
  }

  context.y -= 8;
}

function drawTableHeader(
  context: PdfContext,
  columns: TechnicalPdfTableColumn[],
) {
  const row = columns.map((column) => column.header);
  const rowHeight = calculateRowHeight({
    columns,
    font: context.fonts.bold,
    row,
    size: 6,
  });

  if (context.y - rowHeight < BOTTOM_MARGIN) {
    addPage(context);
  }

  drawTableRow(context, {
    columns,
    fill: HEADER_FILL,
    font: context.fonts.bold,
    row,
    rowHeight,
    size: 6,
    textColor: TEXT_COLOR,
  });
}

function drawTableRow(
  context: PdfContext,
  params: {
    columns: TechnicalPdfTableColumn[];
    fill: ReturnType<typeof rgb> | null;
    font: PDFFont;
    row: TechnicalPdfCell[];
    rowHeight: number;
    size: number;
    textColor: ReturnType<typeof rgb>;
  },
) {
  let x = MARGIN;
  const y = context.y - params.rowHeight;

  for (let index = 0; index < params.columns.length; index += 1) {
    const column = params.columns[index];
    const rawValue = params.row[index] ?? "";
    const lines = wrapText({
      font: params.font,
      maxLines: 4,
      size: params.size,
      text: formatCellValue(rawValue),
      width: column.width - 6,
    });

    context.page.drawRectangle({
      borderColor: LINE_COLOR,
      borderWidth: 0.4,
      color: params.fill ?? undefined,
      height: params.rowHeight,
      width: column.width,
      x,
      y,
    });

    lines.forEach((line, lineIndex) => {
      const textWidth = params.font.widthOfTextAtSize(line, params.size);
      const textX =
        column.align === "right"
          ? x + column.width - 3 - textWidth
          : x + 3;

      context.page.drawText(line, {
        color: params.textColor,
        font: params.font,
        size: params.size,
        x: textX,
        y: y + params.rowHeight - 9 - lineIndex * 7,
      });
    });

    x += column.width;
  }

  context.y = y;
}

function drawObservationLines(context: PdfContext, lines: string[]) {
  for (const line of lines) {
    drawWrappedParagraph(context, `- ${line}`, {
      color: TEXT_COLOR,
      size: 8,
    });
  }
}

function drawTextLine(
  context: PdfContext,
  text: string,
  options: {
    color?: ReturnType<typeof rgb>;
    font?: PDFFont;
    size: number;
  },
) {
  ensureSpace(context, options.size + 6);
  context.page.drawText(safePdfText(text), {
    color: options.color ?? TEXT_COLOR,
    font: options.font ?? context.fonts.regular,
    size: options.size,
    x: MARGIN,
    y: context.y - options.size,
  });
  context.y -= options.size + 4;
}

function drawWrappedParagraph(
  context: PdfContext,
  text: string,
  options: {
    color: ReturnType<typeof rgb>;
    size: number;
  },
) {
  const lines = wrapText({
    font: context.fonts.regular,
    size: options.size,
    text,
    width: CONTENT_WIDTH,
  });
  const lineHeight = options.size + 3;

  for (const line of lines) {
    ensureSpace(context, lineHeight);
    context.page.drawText(line, {
      color: options.color,
      font: context.fonts.regular,
      size: options.size,
      x: MARGIN,
      y: context.y - options.size,
    });
    context.y -= lineHeight;
  }
}

function calculateRowHeight(params: {
  columns: TechnicalPdfTableColumn[];
  font: PDFFont;
  row: TechnicalPdfCell[];
  size: number;
}) {
  const maxLines = params.columns.reduce((max, column, index) => {
    const lines = wrapText({
      font: params.font,
      maxLines: 4,
      size: params.size,
      text: formatCellValue(params.row[index] ?? ""),
      width: column.width - 6,
    });

    return Math.max(max, lines.length);
  }, 1);

  return Math.max(15, maxLines * 7 + 8);
}

function ensureSpace(context: PdfContext, height: number) {
  if (context.y - height < BOTTOM_MARGIN) {
    addPage(context);
  }
}

function addPage(context: PdfContext) {
  context.page = context.doc.addPage(PAGE_SIZE);
  context.y = PAGE_HEIGHT - MARGIN;
}

function drawFooters(doc: PDFDocument, fonts: PdfFonts) {
  const pages = doc.getPages();

  pages.forEach((page, index) => {
    const label = `Pagina ${index + 1}/${pages.length}`;
    page.drawText(label, {
      color: MUTED_COLOR,
      font: fonts.regular,
      size: 7,
      x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(label, 7),
      y: 12,
    });
  });
}

function wrapText(params: {
  font: PDFFont;
  maxLines?: number;
  size: number;
  text: string;
  width: number;
}) {
  const words = safePdfText(params.text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words.length > 0 ? words : [""]) {
    const pieces = splitLongWord({
      font: params.font,
      size: params.size,
      width: params.width,
      word,
    });

    for (const piece of pieces) {
      const candidate = current ? `${current} ${piece}` : piece;

      if (
        current &&
        params.font.widthOfTextAtSize(candidate, params.size) > params.width
      ) {
        lines.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
  }

  if (current || lines.length === 0) {
    lines.push(current);
  }

  if (params.maxLines && lines.length > params.maxLines) {
    const trimmed = lines.slice(0, params.maxLines);
    const last = trimmed[trimmed.length - 1] ?? "";
    trimmed[trimmed.length - 1] = fitText({
      font: params.font,
      size: params.size,
      suffix: "...",
      text: last,
      width: params.width,
    });

    return trimmed;
  }

  return lines;
}

function splitLongWord(params: {
  font: PDFFont;
  size: number;
  width: number;
  word: string;
}) {
  if (params.font.widthOfTextAtSize(params.word, params.size) <= params.width) {
    return [params.word];
  }

  const pieces: string[] = [];
  let current = "";

  for (const character of params.word) {
    const candidate = `${current}${character}`;

    if (
      current &&
      params.font.widthOfTextAtSize(candidate, params.size) > params.width
    ) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}

function fitText(params: {
  font: PDFFont;
  size: number;
  suffix: string;
  text: string;
  width: number;
}) {
  let text = params.text;

  while (
    text.length > 0 &&
    params.font.widthOfTextAtSize(`${text}${params.suffix}`, params.size) >
      params.width
  ) {
    text = text.slice(0, -1);
  }

  return `${text}${params.suffix}`;
}

function formatCellValue(value: TechnicalPdfCell) {
  return typeof value === "number" ? formatNumber(value) : value;
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
        : PENDING;

  return row.observations.length > 0
    ? `${label} - ${row.observations.join(" ")}`
    : label;
}

function valueOrPending(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : PENDING;
}

function formatDiameter(diameter: PipeDiameterReference | null) {
  if (!diameter) {
    return PENDING;
  }

  const external = formatNumberOrNull(diameter.externalDiameterMillimeters);
  const internal = formatNumberOrNull(diameter.internalDiameterMillimeters);

  if (external && internal) {
    return `DE ${external} mm / DI ${internal} mm`;
  }

  if (external) {
    return `DE ${external} mm`;
  }

  return diameter.label;
}

function pipeSystemLabel(result: TechnicalCalculationResult) {
  return [result.pipeSystem.name, result.pipeSystem.version]
    .filter(Boolean)
    .join(" ");
}

function calculationModeLabel(result: TechnicalCalculationResult) {
  if (result.professionalDiameterAdoption?.decisions.length) {
    return `Diametros efectivos con adopcion profesional (${adoptionStatusLabel(
      result.professionalDiameterAdoption.status,
    )})`;
  }

  if (result.transitionAwareNetworkSizing) {
    return `Dimensionado con transiciones (${networkStatusLabel(
      result.transitionAwareNetworkSizing.status,
    )})`;
  }

  if (result.networkSizing) {
    return `Dimensionado base (${networkStatusLabel(result.networkSizing.status)})`;
  }

  return PENDING;
}

function calculationStatusLabel(status: TechnicalCalculationResult["status"]) {
  if (status === "valid") {
    return "Valido";
  }

  if (status === "invalid") {
    return "Invalido";
  }

  return PENDING;
}

function networkStatusLabel(status: string) {
  if (status === "resolved") {
    return "resuelto";
  }

  if (status === "unsupported") {
    return "incompatible";
  }

  return "pendiente";
}

function adoptionStatusLabel(status: string) {
  if (status === "validated") {
    return "validada";
  }

  if (status === "incompatible") {
    return "incompatible";
  }

  return "pendiente";
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("es-AR", {
        maximumFractionDigits: 3,
      }).format(value)
    : PENDING;
}

function formatNumberOrNull(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("es-AR", {
        maximumFractionDigits: 3,
      }).format(value)
    : null;
}

function safePdfText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    next.push(value);
  }

  return next;
}
