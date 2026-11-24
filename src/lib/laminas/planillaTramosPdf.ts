import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { RotuloContenido } from "@/lib/obra/obraData";
import { MM_POR_PT } from "@/lib/obra/rotuloFormato";
import { diametrosPlanilla, tablaDeTramo, type PlanillaTramos } from "./planillaTramos";
import { dibujarTablasPdf } from "./tablasPdf";

const A4_MM = { ancho: 210, alto: 297 };
const MARGEN_MM = 12;
const ENCABEZADO_MM = 16;
const TRAMOS_POR_HOJA = 3;
const ALTO_TITULO_MM = 4;
const ALTO_TEXTO_MM = 2.6;
const mmAPt = (mm: number) => mm / MM_POR_PT;

/** Planilla de cálculo en hojas A4: tres tramos por hoja, como la imprime el Excel. */
export async function crearPlanillaTramosPdf(planilla: PlanillaTramos, rotulo: RotuloContenido) {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const diametros = diametrosPlanilla(planilla.tramos);
  const hojas = Math.max(1, Math.ceil(planilla.tramos.length / TRAMOS_POR_HOJA));

  doc.setTitle("Planilla de cálculo");

  for (let hoja = 0; hoja < hojas; hoja += 1) {
    const page = doc.addPage([mmAPt(A4_MM.ancho), mmAPt(A4_MM.alto)]);
    const yPdf = (mm: number) => page.getHeight() - mmAPt(mm);
    const datosObra = [rotulo.propietario, rotulo.calleNumero, rotulo.localidad]
      .filter(Boolean)
      .join(" — ");

    page.drawText("PLANILLA DE CÁLCULO", {
      x: mmAPt(MARGEN_MM),
      y: yPdf(MARGEN_MM + ALTO_TITULO_MM),
      size: mmAPt(ALTO_TITULO_MM),
      font: negrita,
      color: rgb(0, 0, 0),
    });
    page.drawText(`${datosObra}   ·   Hoja ${hoja + 1} de ${hojas}`, {
      x: mmAPt(MARGEN_MM),
      y: yPdf(MARGEN_MM + ALTO_TITULO_MM + 2 + ALTO_TEXTO_MM),
      size: mmAPt(ALTO_TEXTO_MM),
      font: fuente,
      color: rgb(0, 0, 0),
    });

    const tramos = planilla.tramos.slice(hoja * TRAMOS_POR_HOJA, (hoja + 1) * TRAMOS_POR_HOJA);

    if (tramos.length === 0) {
      continue;
    }

    dibujarTablasPdf({
      fuente,
      fuenteTitulo: negrita,
      page,
      tablas: tramos.map((tramo) => tablaDeTramo(tramo, diametros)),
      zona: {
        x1: MARGEN_MM,
        y1: MARGEN_MM + ENCABEZADO_MM,
        x2: A4_MM.ancho - MARGEN_MM,
        // Siempre la misma altura de fila, aunque la última hoja tenga menos tramos.
        y2:
          MARGEN_MM +
          ENCABEZADO_MM +
          ((A4_MM.alto - MARGEN_MM * 2 - ENCABEZADO_MM) * tramos.length) / TRAMOS_POR_HOJA,
      },
    });
  }

  return doc.save();
}
