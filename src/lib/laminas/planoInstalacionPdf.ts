import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DatosCroquis, RotuloContenido } from "@/lib/obra/obraData";
import { MM_POR_PT, ROTULO_LINEA_PT } from "@/lib/obra/rotuloFormato";
import { dibujarRotuloPdf } from "@/lib/obra/rotuloPdf";
import {
  A3_MM,
  MARCO_LAMINA,
  armarPlanoInstalacion,
  type OpcionesLamina,
  type RecuadroId,
} from "./planoInstalacionArmado";
import { dibujarCroquisPdf } from "./croquisPdf";
import { dibujarGabinetePdf } from "./gabinetePdf";
import { incrustarFondoPdf } from "./fondoPdf";
import { dibujarIsometricaPdf, type DatosIsometrica } from "./isometricaPdf";
import { dibujarPlantaPdf, type DatosPlanta } from "./plantaPdf";
import { dibujarTablasPdf } from "./tablasPdf";
import type { TablasPlano } from "./tablasPlano";

const NEGRO = rgb(0, 0, 0);
const ALTO_TITULO_MM = 3.5;
const ASCENSO = 0.905;
const MARGEN_TITULO_MM = 3;
const ZONAS_TABLA: RecuadroId[] = ["referencias", "materiales", "calculo"];
const mmAPt = (mm: number) => mm / MM_POR_PT;

/** Lámina A3: marco, rótulo, gabinete, y planta, isométrica, croquis y tablas si los hay. */
export async function crearPlanoInstalacionPdf(
  rotulo: RotuloContenido,
  opciones: OpcionesLamina = {},
  tablas?: TablasPlano,
  planta?: DatosPlanta,
  isometrica?: DatosIsometrica,
  croquis?: DatosCroquis,
) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([mmAPt(A3_MM.ancho), mmAPt(A3_MM.alto)]);
  // Reemplazo en negrita de Arial Black: la fuente original no se puede distribuir.
  const fuente = await doc.embedFont(StandardFonts.HelveticaBold);
  const fuenteTabla = await doc.embedFont(StandardFonts.Helvetica);
  const fondo = planta?.fondoPdf ? await incrustarFondoPdf(doc, planta.fondoPdf) : null;
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

    // Como en los planos reales, la planta va sin recuadro propio.
    if (recuadro.id === "planta") {
      if (planta) {
        dibujarPlantaPdf({ datos: planta, fondo, fuente: fuenteTabla, page, zona: recuadro });
        continue;
      }
    } else if (recuadro.id === "croquis") {
      rectangulo(recuadro);
      if (croquis) {
        dibujarCroquisPdf({ datos: croquis, fuente: fuenteTabla, page, zona: recuadro });
      }
    } else if (recuadro.id === "gabinete") {
      // Como en los planos reales: dibujo suelto con el título abajo, sin recuadro.
      dibujarGabinetePdf({ fuente: fuenteTabla, page, zona: recuadro });
    } else if (
      recuadro.id !== "isometrica" ||
      !isometrica ||
      !dibujarIsometricaPdf({ datos: isometrica, fuente: fuenteTabla, page, zona: recuadro })
    ) {
      rectangulo(recuadro);
    }

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
