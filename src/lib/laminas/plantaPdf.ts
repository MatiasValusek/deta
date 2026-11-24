import {
  beginText,
  endText,
  LineCapStyle,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSqueeze,
  setFillingRgbColor,
  setFontAndSize,
  setTextMatrix,
  showText,
  type PDFFont,
  type PDFName,
  type PDFPage,
} from "pdf-lib";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Bounds, DrawingPrimitive, NormalizedDrawing, Point2D } from "@/lib/geometry/types";
import { MM_POR_PT } from "@/lib/obra/rotuloFormato";
import {
  resolveRouteNodePosition,
  resolveRouteSegments,
  routeSegmentPlanLegs,
} from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import type { NumeracionPlano } from "./numeracionPlano";

export type DatosPlanta = {
  capasVisibles?: Record<string, boolean>;
  drawing: NormalizedDrawing | null;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  numeracion: NumeracionPlano;
};

export type ZonaPlanta = { x1: number; y1: number; x2: number; y2: number };

const NEGRO = rgb(0, 0, 0);
const BLANCO = rgb(1, 1, 1);
const ROJO = rgb(0.9, 0, 0);
const LINEA_PLANO_PT = 0.3;
const LINEA_TRAZA_PT = 1;
const MARGEN_MM = 6;
const ALTO_ETIQUETA_MM = 3;
const SEPARACION_ETIQUETA_MM = 1.3;
const RADIO_DERIVACION_MM = 0.6;
const PASOS_ARCO = 24;
const mmAPt = (mm: number) => mm / MM_POR_PT;

/** Pasa del plano a mm de la hoja: misma escala en X e Y, centrado, Y hacia abajo. */
export function ajustarAZona(
  limites: Bounds,
  zona: ZonaPlanta,
  margenMm = MARGEN_MM,
) {
  return crearAjusteAZona(limites, zona, margenMm).punto;
}

function crearAjusteAZona(
  limites: Bounds,
  zona: ZonaPlanta,
  margenMm = MARGEN_MM,
) {
  const anchoFuente = Math.max(limites.maxX - limites.minX, 1e-9);
  const altoFuente = Math.max(limites.maxY - limites.minY, 1e-9);
  const anchoUtil = zona.x2 - zona.x1 - margenMm * 2;
  const altoUtil = zona.y2 - zona.y1 - margenMm * 2;
  const escala = Math.min(anchoUtil / anchoFuente, altoUtil / altoFuente);
  const offsetX = zona.x1 + margenMm + (anchoUtil - anchoFuente * escala) / 2;
  const offsetY = zona.y1 + margenMm + (altoUtil - altoFuente * escala) / 2;

  return {
    escala,
    punto: (punto: Point2D): Point2D => ({
      x: offsetX + (punto.x - limites.minX) * escala,
      y: offsetY + (limites.maxY - punto.y) * escala,
    }),
  };
}

/** Dibuja la planta y devuelve cómo pasar del plano a mm de hoja (null si no hay nada). */
export function dibujarPlantaPdf(params: {
  datos: DatosPlanta;
  fuente: PDFFont;
  page: PDFPage;
  zona: ZonaPlanta;
}) {
  const { datos, fuente, page, zona } = params;
  const equipoPorId = new Map(datos.equipment.map((item) => [item.id, item]));
  const tramos = resolveRouteSegments(datos.network, datos.equipment);
  const piernas = tramos.flatMap((tramo) => routeSegmentPlanLegs(tramo));
  const entidades = (datos.drawing?.entities ?? []).filter(
    (entidad) => datos.capasVisibles?.[entidad.layer] !== false,
  );
  const lineasPlano = entidades.flatMap(lineasDeEntidad);
  const textosPlano = entidades.filter(
    (entidad): entidad is Extract<DrawingPrimitive, { kind: "text" }> =>
      entidad.kind === "text",
  );
  const puntos = [
    ...lineasPlano.flat(),
    ...textosPlano.flatMap((texto) => [
      texto.position,
      ...(texto.alignmentPoint ? [texto.alignmentPoint] : []),
    ]),
    ...piernas.flatMap((pierna) => [pierna.from, pierna.to]),
  ];

  if (puntos.length === 0) {
    return null;
  }

  const ajuste = crearAjusteAZona(limitesDe(puntos), zona);
  const aHoja = ajuste.punto;
  const yPdf = (mm: number) => page.getHeight() - mmAPt(mm);
  const aPdf = (punto: Point2D) => {
    const hoja = aHoja(punto);
    return { x: mmAPt(hoja.x), y: yPdf(hoja.y) };
  };

  // La letra se nombra por su clave en los recursos de la hoja (F1, F2…), no por
  // "Helvetica": con el nombre suelto otros visores no la encuentran y no muestran el texto.
  const claveFuente = page.node.newFontDictionary(fuente.name, fuente.ref);

  for (const entidad of entidades) {
    if (entidad.kind === "text") {
      dibujarTextoArquitectura({ ajuste, claveFuente, entidad, fuente, page, aPdf });
      continue;
    }

    const thickness = grosorDeEntidad(entidad);
    const dashArray = patronDeEntidad(entidad, ajuste.escala, thickness);

    for (const [desde, hasta] of lineasDeEntidad(entidad)) {
      page.drawLine({
        start: aPdf(desde),
        end: aPdf(hasta),
        thickness,
        color: NEGRO,
        dashArray,
        lineCap: dashArray ? LineCapStyle.Round : LineCapStyle.Butt,
      });
    }
  }
  for (const pierna of piernas) {
    page.drawLine({
      start: aPdf(pierna.from),
      end: aPdf(pierna.to),
      thickness: LINEA_TRAZA_PT,
      color: ROJO,
    });
  }

  const tamano = mmAPt(ALTO_ETIQUETA_MM);

  for (const nodo of datos.network.nodes) {
    const posicion = resolveRouteNodePosition(nodo, equipoPorId);
    const etiqueta = datos.numeracion.nodos.get(nodo.id);

    if (!posicion || !etiqueta) {
      continue;
    }

    const centro = aPdf(posicion);
    const separacion = mmAPt(SEPARACION_ETIQUETA_MM);
    const ancho = fuente.widthOfTextAtSize(etiqueta, tamano);

    if (nodo.kind === "route") {
      page.drawCircle({
        x: centro.x,
        y: centro.y,
        size: mmAPt(RADIO_DERIVACION_MM),
        color: ROJO,
      });
    }

    page.drawRectangle({
      x: centro.x + separacion - 1,
      y: centro.y + separacion - 1,
      width: ancho + 2,
      height: tamano * 0.8 + 2,
      color: BLANCO,
    });
    page.drawText(etiqueta, {
      x: centro.x + separacion,
      y: centro.y + separacion,
      size: tamano,
      font: fuente,
      color: NEGRO,
    });
  }

  // Para que cada lámina pueda dibujar encima con la misma escala.
  return aHoja;
}

function dibujarTextoArquitectura(params: {
  ajuste: ReturnType<typeof crearAjusteAZona>;
  claveFuente: PDFName;
  entidad: Extract<DrawingPrimitive, { kind: "text" }>;
  fuente: PDFFont;
  page: PDFPage;
  aPdf: (punto: Point2D) => Point2D;
}) {
  const { ajuste, claveFuente, entidad, fuente, page, aPdf } = params;
  const sourcePosition =
    entidad.alignmentPoint &&
    ((entidad.horizontalAlignment ?? 0) !== 0 ||
      (entidad.verticalAlignment ?? 0) !== 0)
      ? entidad.alignmentPoint
      : entidad.position;
  const position = aPdf(sourcePosition);
  const size = mmAPt(entidad.height * ajuste.escala);

  if (!Number.isFinite(size) || size <= 0) {
    return;
  }

  const allowed = new Set(fuente.getCharacterSet());
  const lines = entidad.text.split("\n").map((line) =>
    Array.from(line.normalize("NFC"), (character) =>
      allowed.has(character.codePointAt(0) ?? -1) ? character : "?",
    ).join(""),
  );
  const cos = Math.cos(entidad.rotation);
  const sin = Math.sin(entidad.rotation);
  const widthFactor = entidad.widthFactor > 0 ? entidad.widthFactor : 1;
  const lineHeight = size * 1.2;
  const verticalOffset = textVerticalOffset(entidad, size);

  for (const [index, line] of lines.entries()) {
    if (line.length === 0) {
      continue;
    }

    const textWidth = fuente.widthOfTextAtSize(line, size) * widthFactor;
    const horizontalOffset = textHorizontalOffset(entidad, textWidth);
    const localY = verticalOffset - index * lineHeight;
    const x = position.x + horizontalOffset * cos - localY * sin;
    const y = position.y + horizontalOffset * sin + localY * cos;

    page.pushOperators(
      pushGraphicsState(),
      beginText(),
      setFillingRgbColor(0, 0, 0),
      setFontAndSize(claveFuente, size),
      setCharacterSqueeze(widthFactor * 100),
      setTextMatrix(cos, sin, -sin, cos, x, y),
      showText(fuente.encodeText(line)),
      endText(),
      popGraphicsState(),
    );
  }
}

function textHorizontalOffset(
  entidad: Extract<DrawingPrimitive, { kind: "text" }>,
  width: number,
) {
  if (entidad.attachmentPoint) {
    const column = ((entidad.attachmentPoint - 1) % 3) + 1;
    return column === 2 ? -width / 2 : column === 3 ? -width : 0;
  }

  return entidad.horizontalAlignment === 1 || entidad.horizontalAlignment === 4
    ? -width / 2
    : entidad.horizontalAlignment === 2
      ? -width
      : 0;
}

function textVerticalOffset(
  entidad: Extract<DrawingPrimitive, { kind: "text" }>,
  height: number,
) {
  if (entidad.attachmentPoint) {
    const row = Math.ceil(entidad.attachmentPoint / 3);
    return row === 1 ? -height : row === 2 ? -height / 2 : 0;
  }

  return entidad.verticalAlignment === 3
    ? -height
    : entidad.verticalAlignment === 2
      ? -height / 2
      : 0;
}

function grosorDeEntidad(entidad: DrawingPrimitive) {
  const hundredthsOfMillimeter = entidad.visual.resolvedLineweight;

  return hundredthsOfMillimeter === undefined || hundredthsOfMillimeter === null
    ? LINEA_PLANO_PT
    : mmAPt(hundredthsOfMillimeter / 100);
}

function patronDeEntidad(
  entidad: DrawingPrimitive,
  escala: number,
  thickness: number,
) {
  const pattern = entidad.visual.lineTypePattern;

  if (!pattern || pattern.length === 0) {
    return undefined;
  }

  return pattern.map((length) =>
    Math.max(mmAPt(Math.abs(length) * escala), Math.max(thickness, 0.1)),
  );
}

function lineasDeEntidad(entidad: DrawingPrimitive): Array<[Point2D, Point2D]> {
  if (entidad.kind === "line") {
    return [[entidad.start, entidad.end]];
  }
  if (entidad.kind === "polyline") {
    return unir(entidad.points, entidad.closed);
  }
  if (entidad.kind === "hatch") {
    return entidad.rings.flatMap((anillo) => unir(anillo, true));
  }
  if (entidad.kind === "text") {
    return [];
  }

  const fin =
    entidad.endAngle >= entidad.startAngle
      ? entidad.endAngle
      : entidad.endAngle + Math.PI * 2;
  const puntos = Array.from({ length: PASOS_ARCO + 1 }, (_, indice) => {
    const angulo =
      entidad.startAngle + ((fin - entidad.startAngle) * indice) / PASOS_ARCO;

    return {
      x: entidad.center.x + entidad.radius * Math.cos(angulo),
      y: entidad.center.y + entidad.radius * Math.sin(angulo),
    };
  });

  return unir(puntos, false);
}

function unir(puntos: Point2D[], cerrado: boolean): Array<[Point2D, Point2D]> {
  const lineas = puntos
    .slice(0, -1)
    .map((punto, indice): [Point2D, Point2D] => [punto, puntos[indice + 1]]);

  return cerrado && puntos.length > 2
    ? [...lineas, [puntos[puntos.length - 1], puntos[0]]]
    : lineas;
}

function limitesDe(puntos: Point2D[]): Bounds {
  const limites = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  for (const punto of puntos) {
    limites.minX = Math.min(limites.minX, punto.x);
    limites.minY = Math.min(limites.minY, punto.y);
    limites.maxX = Math.max(limites.maxX, punto.x);
    limites.maxY = Math.max(limites.maxY, punto.y);
  }

  return limites;
}
