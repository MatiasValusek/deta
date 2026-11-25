import { createConfirmedCalibration } from "@/lib/calibration/calibration";
import type { ConfirmedCalibration } from "@/lib/calibration/types";
import type { Bounds, DrawingUnits } from "@/lib/geometry/types";

/*
 * Escala tomada del archivo. Un DXF suele decir en qué unidad está dibujado ($INSUNITS).
 * La app la usa solo si la casa queda de un tamaño creíble; si no, no adivina y pide marcar
 * una medida conocida.
 */

/** Metros por unidad de dibujo, según el código $INSUNITS del DXF. */
const METROS_POR_UNIDAD: Record<number, number> = {
  1: 0.0254, // pulgadas
  2: 0.3048, // pies
  4: 0.001, // milímetros
  5: 0.01, // centímetros
  6: 1, // metros
  14: 0.1, // decímetros
};

const NOMBRE_UNIDAD: Record<number, string> = {
  1: "pulgadas",
  2: "pies",
  4: "milímetros",
  5: "centímetros",
  6: "metros",
  14: "decímetros",
};

/** Una planta de casa (con o sin terreno) mide entre 3 y 200 m de lado. */
const LADO_MINIMO_M = 3;
const LADO_MAXIMO_M = 200;

export type EscalaDelArchivo =
  | { tipo: "tomada"; calibration: ConfirmedCalibration; unidad: string }
  | { tipo: "marcar"; motivo: string };

export function escalaDelArchivo(params: {
  bounds: Bounds | null;
  units: DrawingUnits | null;
}): EscalaDelArchivo {
  const codigo = params.units?.code ?? null;
  const metrosPorUnidad = codigo === null ? undefined : METROS_POR_UNIDAD[codigo];
  if (metrosPorUnidad === undefined || codigo === null) {
    return { tipo: "marcar", motivo: "El archivo no dice en qué unidad está dibujado." };
  }

  const bounds = params.bounds;
  const ancho = bounds ? bounds.maxX - bounds.minX : 0;
  const alto = bounds ? bounds.maxY - bounds.minY : 0;
  if (!bounds || !(ancho > 0 || alto > 0)) {
    return { tipo: "marcar", motivo: "El plano no tiene dibujo para medir." };
  }

  const unidad = NOMBRE_UNIDAD[codigo];
  const ladoMayor = Math.max(ancho, alto) * metrosPorUnidad;
  if (ladoMayor < LADO_MINIMO_M || ladoMayor > LADO_MAXIMO_M) {
    return {
      tipo: "marcar",
      motivo: `El archivo dice que está en ${unidad}, pero así la casa mediría ${medidasEnMetros(bounds, metrosPorUnidad)}.`,
    };
  }

  // La referencia es el ancho del dibujo (o el alto, si es una línea vertical).
  const horizontal = ancho >= alto;
  const points = horizontal
    ? { end: { x: bounds.maxX, y: bounds.minY }, start: { x: bounds.minX, y: bounds.minY } }
    : { end: { x: bounds.minX, y: bounds.maxY }, start: { x: bounds.minX, y: bounds.minY } };
  const calibration = createConfirmedCalibration({
    distanceOriginal: (horizontal ? ancho : alto) * metrosPorUnidad,
    points,
    unit: "m",
  });
  return { calibration: { ...calibration, origen: "archivo" }, tipo: "tomada", unidad };
}

/** "10,00 × 8,00 m": cuánto mide el dibujo con la escala dada. */
export function medidasEnMetros(bounds: Bounds, metrosPorUnidad: number) {
  const ancho = (bounds.maxX - bounds.minX) * metrosPorUnidad;
  const alto = (bounds.maxY - bounds.minY) * metrosPorUnidad;
  return `${formatoMetros(ancho)} × ${formatoMetros(alto)} m`;
}

export function formatoMetros(valor: number) {
  return valor.toLocaleString("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

