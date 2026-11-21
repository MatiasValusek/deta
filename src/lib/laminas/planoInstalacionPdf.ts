import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { RotuloContenido } from "@/lib/obra/obraData";
import { MM_POR_PT, ROTULO_LINEA_PT } from "@/lib/obra/rotuloFormato";
import { dibujarRotuloPdf } from "@/lib/obra/rotuloPdf";
import {
  A3_MM,
  MARCO_LAMINA,
  RECUADROS_PLANO_INSTALACION,
} from "./planoInstalacionArmado";

const NEGRO = rgb(0, 0, 0);
const ALTO_TITULO_MM = 3.5;
const ASCENSO = 0.905;
const MARGEN_TITULO_MM = 3;
const mmAPt = (mm: number) => mm / MM_POR_PT;

/** Lámina A3 con el armado vacío: marco, rótulo y recuadros de cada parte. */
export async function crearPlanoInstalacionPdf(rotulo: RotuloContenido) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([mmAPt(A3_MM.ancho), mmAPt(A3_MM.alto)]);
  // Reemplazo en negrita de Arial Black: la fuente original no se puede distribuir.
  const fuente = await doc.embedFont(StandardFonts.HelveticaBold);
  const yPdf = (mm: number) => page.getHeight() - mmAPt(mm);
  const rectangulo = (r: { x1: number; y1: number; x2: number; y2: number }) =>
    page.drawRectangle({
      x: mmAPt(r.x1),
      y: yPdf(r.y2),
      width: mmAPt(r.x2 - r.x1),
      height: mmAPt(r.y2 - r.y1),
      borderColor: NEGRO,
      borderWidth: ROTULO_LINEA_PT,
    });

  doc.setTitle("Plano de instalación");
  rectangulo(MARCO_LAMINA);

  for (const recuadro of RECUADROS_PLANO_INSTALACION) {
    rectangulo(recuadro);
    page.drawText(recuadro.titulo, {
      x: mmAPt(recuadro.x1 + MARGEN_TITULO_MM),
      y: yPdf(recuadro.tituloY + ALTO_TITULO_MM * ASCENSO),
      size: mmAPt(ALTO_TITULO_MM),
      font: fuente,
      color: NEGRO,
    });
  }

  dibujarRotuloPdf(page, fuente, rotulo);
  return doc.save();
}
