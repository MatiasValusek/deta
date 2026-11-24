import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { NormalizedDrawing } from "@/lib/geometry/types";
import type { DatosCroquis, RotuloContenido } from "@/lib/obra/obraData";
import { MM_POR_PT, ROTULO_LINEA_PT, ROTULO_RECUADRO } from "@/lib/obra/rotuloFormato";
import { dibujarRotuloPdf } from "@/lib/obra/rotuloPdf";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { dibujarCroquisPdf } from "./croquisPdf";
import { A3_MM, MARCO_LAMINA } from "./planoInstalacionArmado";
import { dibujarPlantaPdf, type DatosPlanta } from "./plantaPdf";

/*
 * Lámina de Factibilidad A3, como la real: planta grande a la izquierda (sin cañería,
 * solo la "M" del medidor), croquis de ubicación arriba a la derecha y rótulo abajo.
 */

export type ZonaFactibilidad = {
  id: "planta" | "croquis";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const NEGRO = rgb(0, 0, 0);
const ALTO_TITULO_MM = 3.5;
const TITULO_SOBRE_RECUADRO_MM = 3;
const CROQUIS_ARRIBA = 24;
const CROQUIS_ABAJO = 110;
const SEPARACION_MM = 4;
const mmAPt = (mm: number) => mm / MM_POR_PT;

export function armarFactibilidad(): ZonaFactibilidad[] {
  const columna = ROTULO_RECUADRO.x1;

  return [
    {
      id: "planta",
      x1: MARCO_LAMINA.x1,
      y1: MARCO_LAMINA.y1,
      x2: columna - SEPARACION_MM,
      y2: MARCO_LAMINA.y2,
    },
    { id: "croquis", x1: columna, y1: CROQUIS_ARRIBA, x2: MARCO_LAMINA.x2 - SEPARACION_MM, y2: CROQUIS_ABAJO },
  ];
}

/** La planta de la factibilidad: el plano y el medidor marcado con "M", sin cañería. */
export function plantaFactibilidad(params: {
  capasVisibles?: Record<string, boolean>;
  drawing: NormalizedDrawing | null;
  equipment: WorkbenchEquipment[];
}): DatosPlanta {
  const medidor = params.equipment.find((item) => item.role === "supply");
  const network: ManualRouteNetwork = {
    nodes: medidor
      ? [{ equipmentId: medidor.id, id: "factibilidad-medidor", kind: "supply", origin: "manual" }]
      : [],
    segments: [],
  };

  return {
    capasVisibles: params.capasVisibles,
    drawing: params.drawing,
    equipment: medidor ? [medidor] : [],
    network,
    numeracion: {
      nodos: new Map(medidor ? [["factibilidad-medidor", "M"]] : []),
      tramos: new Map(),
    },
  };
}

export async function crearFactibilidadPdf(
  rotulo: RotuloContenido,
  planta: DatosPlanta,
  croquis: DatosCroquis,
) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([mmAPt(A3_MM.ancho), mmAPt(A3_MM.alto)]);
  // Reemplazo en negrita de Arial Black: la fuente original no se puede distribuir.
  const fuente = await doc.embedFont(StandardFonts.HelveticaBold);
  const fuenteTexto = await doc.embedFont(StandardFonts.Helvetica);
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

  doc.setTitle("Factibilidad");
  rectangulo(MARCO_LAMINA);

  for (const zona of armarFactibilidad()) {
    if (zona.id === "planta") {
      // Como en la factibilidad real, la planta va sin recuadro ni título.
      dibujarPlantaPdf({ datos: planta, fuente: fuenteTexto, page, zona });
      continue;
    }

    rectangulo(zona);
    dibujarCroquisPdf({ datos: croquis, fuente: fuenteTexto, page, zona });
    // Título arriba del recuadro, como en la factibilidad real.
    page.drawText("CROQUIS DE UBICACIÓN", {
      x: mmAPt(zona.x1),
      y: yPdf(zona.y1 - TITULO_SOBRE_RECUADRO_MM),
      size: mmAPt(ALTO_TITULO_MM),
      font: fuente,
      color: NEGRO,
    });
  }

  dibujarRotuloPdf(page, fuente, rotulo);
  return doc.save();
}
