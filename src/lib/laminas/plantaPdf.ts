import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
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
  const anchoFuente = Math.max(limites.maxX - limites.minX, 1e-9);
  const altoFuente = Math.max(limites.maxY - limites.minY, 1e-9);
  const anchoUtil = zona.x2 - zona.x1 - margenMm * 2;
  const altoUtil = zona.y2 - zona.y1 - margenMm * 2;
  const escala = Math.min(anchoUtil / anchoFuente, altoUtil / altoFuente);
  const offsetX = zona.x1 + margenMm + (anchoUtil - anchoFuente * escala) / 2;
  const offsetY = zona.y1 + margenMm + (altoUtil - altoFuente * escala) / 2;

  return (punto: Point2D): Point2D => ({
    x: offsetX + (punto.x - limites.minX) * escala,
    y: offsetY + (limites.maxY - punto.y) * escala,
  });
}

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
  const puntos = [
    ...lineasPlano.flat(),
    ...piernas.flatMap((pierna) => [pierna.from, pierna.to]),
  ];

  if (puntos.length === 0) {
    return;
  }

  const aHoja = ajustarAZona(limitesDe(puntos), zona);
  const yPdf = (mm: number) => page.getHeight() - mmAPt(mm);
  const aPdf = (punto: Point2D) => {
    const hoja = aHoja(punto);
    return { x: mmAPt(hoja.x), y: yPdf(hoja.y) };
  };

  for (const [desde, hasta] of lineasPlano) {
    page.drawLine({
      start: aPdf(desde),
      end: aPdf(hasta),
      thickness: LINEA_PLANO_PT,
      color: NEGRO,
    });
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
