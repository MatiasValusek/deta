import { rgb, type PDFPage } from "pdf-lib";
import { MM_POR_PT } from "@/lib/obra/rotuloFormato";

const NEGRO = rgb(0, 0, 0);
const BLANCO = rgb(1, 1, 1);
const mmAPt = (mm: number) => mm / MM_POR_PT;

/** Largo del símbolo de la llave en la hoja, en mm. */
export const LARGO_LLAVE_MM = 2.4;

type Punto = { x: number; y: number };

/**
 * Símbolo de llave de paso (dos triángulos punta con punta) sobre la cañería, en puntos PDF.
 * `direccion` es el sentido del caño en la hoja; el símbolo queda centrado en `centro`.
 */
export function dibujarSimboloLlave(
  page: PDFPage,
  centro: Punto,
  direccion: Punto,
  largoMm = LARGO_LLAVE_MM,
) {
  const largo = Math.hypot(direccion.x, direccion.y) || 1;
  const u = { x: direccion.x / largo, y: direccion.y / largo };
  const n = { x: -u.y, y: u.x };
  const medio = mmAPt(largoMm) / 2;
  const alto = medio * 0.8;
  const punto = (a: number, b: number) => ({
    x: centro.x + u.x * a + n.x * b,
    y: centro.y + u.y * a + n.y * b,
  });
  const a = punto(-medio, alto);
  const b = punto(-medio, -alto);
  const c = punto(medio, alto);
  const d = punto(medio, -alto);

  // Fondo blanco para que la traza no cruce el símbolo.
  page.drawCircle({ x: centro.x, y: centro.y, size: medio, color: BLANCO });
  for (const [desde, hasta] of [
    [a, b],
    [c, d],
    [a, d],
    [b, c],
  ] as const) {
    page.drawLine({ start: desde, end: hasta, thickness: 0.6, color: NEGRO });
  }
}
