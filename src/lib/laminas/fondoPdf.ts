import {
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  PDFDocument,
  type PDFEmbeddedPage,
  type PDFPage,
} from "pdf-lib";
import type { Point2D } from "@/lib/geometry/types";

/*
 * Planta desde un PDF: la página del plano va de fondo en la lámina, como dibujo (no como
 * imagen), y la traza y los artefactos se dibujan encima con la misma cuenta.
 *
 * Los puntos de la pantalla están en el sistema de pdf.js a escala 1: origen arriba a la
 * izquierda, Y hacia abajo, con la rotación de la página ya aplicada.
 */

export type FondoPdf = {
  bytes: Uint8Array;
  /** Página del plano, desde 1. */
  pagina: number;
};

export type FondoIncrustado = {
  /** Tamaño de la página como se ve en pantalla (ya rotada). */
  ancho: number;
  alto: number;
  embebida: PDFEmbeddedPage;
  /** De la página sin rotar (origen abajo a la izquierda del recorte) a la pantalla. */
  aPantalla: (punto: Point2D) => Point2D;
};

export async function incrustarFondoPdf(doc: PDFDocument, fondo: FondoPdf): Promise<FondoIncrustado | null> {
  try {
    const origen = await PDFDocument.load(fondo.bytes, { ignoreEncryption: true });
    const pagina = origen.getPage(Math.max(0, Math.min(origen.getPageCount() - 1, fondo.pagina - 1)));
    const recorte = pagina.getCropBox();
    const embebida = await doc.embedPage(pagina, {
      bottom: recorte.y,
      left: recorte.x,
      right: recorte.x + recorte.width,
      top: recorte.y + recorte.height,
    });
    const rotacion = (((pagina.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    const W = recorte.width;
    const H = recorte.height;
    const aPantalla = (p: Point2D): Point2D => {
      if (rotacion === 90) return { x: p.y, y: p.x };
      if (rotacion === 180) return { x: W - p.x, y: p.y };
      if (rotacion === 270) return { x: H - p.y, y: W - p.x };
      return { x: p.x, y: H - p.y };
    };
    const girada = rotacion === 90 || rotacion === 270;

    return { alto: girada ? W : H, ancho: girada ? H : W, aPantalla, embebida };
  } catch {
    // Un PDF que no se deja incrustar: la planta sale sin fondo y la traza igual.
    return null;
  }
}

/** Dibuja la página de fondo; `aHojaPt` lleva un punto de pantalla a puntos de la hoja. */
export function dibujarFondoPdf(
  page: PDFPage,
  fondo: FondoIncrustado,
  aHojaPt: (punto: Point2D) => Point2D,
) {
  const completo = (p: Point2D) => aHojaPt(fondo.aPantalla(p));
  const o = completo({ x: 0, y: 0 });
  const ex = completo({ x: 1, y: 0 });
  const ey = completo({ x: 0, y: 1 });
  const nombre = page.node.newXObject("PlanoPdf", fondo.embebida.ref);

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y),
    drawObject(nombre),
    popGraphicsState(),
  );
}
