import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { RotuloContenido } from "@/lib/obra/obraData";
import { MM_POR_PT, ROTULO_LINEA_PT } from "@/lib/obra/rotuloFormato";
import { dibujarRotuloPdf } from "@/lib/obra/rotuloPdf";
import {
  A3_MM,
  MARCO_LAMINA,
  armarPlanoInstalacion,
  type OpcionesLamina,
  type RecuadroId,
} from "./planoInstalacionArmado";
import { dibujarTablasPdf } from "./tablasPdf";
import type { TablasPlano } from "./tablasPlano";

const NEGRO = rgb(0, 0, 0);
const ALTO_TITULO_MM = 3.5;
const ASCENSO = 0.905;
const MARGEN_TITULO_MM = 3;
const ZONAS_TABLA: RecuadroId[] = ["referencias", "materiales", "calculo"];
const mmAPt = (mm: number) => mm / MM_POR_PT;

/** Lámina A3: marco, rótulo, tablas si las hay y recuadros de lo que falta dibujar. */
export async function crearPlanoInstalacionPdf(
  rotulo: RotuloContenido,
  opciones: OpcionesLamina = {},
  tablas?: TablasPlano,
) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([mmAPt(A3_MM.ancho), mmAPt(A3_MM.alto)]);
  // Reemplazo en negrita de Arial Black: la fuente original no se puede distribuir.
  const fuente = await doc.embedFont(StandardFonts.HelveticaBold);
  const fuenteTabla = await doc.embedFont(StandardFonts.Helvetica);
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
  const recuadros = armarPlanoInstalacion(opciones);

  doc.setTitle("Plano de instalación");
  rectangulo(MARCO_LAMINA);

  for (const recuadro of recuadros) {
    if (tablas && ZONAS_TABLA.includes(recuadro.id)) {
      continue;
    }

    rectangulo(recuadro);
    page.drawText(recuadro.titulo, {
      x: mmAPt(recuadro.x1 + MARGEN_TITULO_MM),
      y: yPdf(recuadro.tituloY + ALTO_TITULO_MM * ASCENSO),
      size: mmAPt(ALTO_TITULO_MM),
      font: fuente,
      color: NEGRO,
    });
  }

  if (tablas) {
    const zonas = recuadros.filter((recuadro) => ZONAS_TABLA.includes(recuadro.id));

    dibujarTablasPdf({
      fuente: fuenteTabla,
      fuenteTitulo: fuente,
      page,
      tablas: [tablas.referencias, tablas.materiales, tablas.calculo],
      zona: {
        x1: zonas[0].x1,
        y1: Math.min(...zonas.map((zona) => zona.y1)),
        x2: zonas[0].x2,
        y2: Math.max(...zonas.map((zona) => zona.y2)),
      },
    });
  }

  dibujarRotuloPdf(page, fuente, rotulo);
  return doc.save();
}
