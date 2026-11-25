import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import { AVISO_TRAMOS_EN_DIAGONAL, tramosEnDiagonal } from "@/lib/caneria/tramosEnDiagonal";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { NormalizedDrawing } from "@/lib/geometry/types";
import {
  avisosCroquis,
  avisosDatosFaltantes,
  type DatosInstalador,
  type DatosObra,
} from "@/lib/obra/obraData";
import type { ManualRouteNetwork } from "@/lib/routing/types";

/*
 * Avisos de "Revisar y descargar": qué falta para cada hoja, en lenguaje de gasista, con el
 * paso donde se arregla. Un aviso = qué pasa + qué hacer. No hay decisiones técnicas acá:
 * solo datos que faltan o algo del dibujo.
 */

export type PasoId = "datos" | "plano" | "artefactos" | "caneria" | "revisar";
export type HojaId = "factibilidad" | "plano" | "planilla";

export const NOMBRE_PASO: Record<PasoId, string> = {
  artefactos: "Artefactos",
  caneria: "Cañería",
  datos: "Datos de la obra",
  plano: "Plano",
  revisar: "Revisar y descargar",
};

export const NOMBRE_HOJA: Record<HojaId, string> = {
  factibilidad: "Factibilidad",
  planilla: "Planilla de cálculo",
  plano: "Plano de instalación",
};

export type AvisoRevisar = {
  /** Hojas que no salen mientras el aviso siga (ninguna: el aviso informa y no frena). */
  hojas: HojaId[];
  paso: PasoId;
  texto: string;
};

const TODAS: HojaId[] = ["factibilidad", "plano", "planilla"];

export function avisosParaDescargar(params: {
  /** Lo que el cálculo supuso o agrandó por su cuenta: se avisa, no frena. */
  avisosCalculo?: string[];
  avisosPlanilla: string[];
  avisosTablas: string[];
  conCroquisEnPlano: boolean;
  drawing: NormalizedDrawing | null;
  equipment: WorkbenchEquipment[];
  /** El plano es un PDF y su página está lista para ir de fondo. */
  hayPlanoPdf?: boolean;
  instalador: DatosInstalador;
  materialesPendientes: number;
  network: ManualRouteNetwork;
  obra: DatosObra;
  result: TechnicalCalculationResult | null;
}): AvisoRevisar[] {
  const avisos: AvisoRevisar[] = [];
  const agregar = (texto: string, paso: PasoId, hojas: HojaId[]) => {
    const mismo = avisos.find((aviso) => aviso.texto === texto);
    if (mismo) {
      mismo.hojas = [...new Set([...mismo.hojas, ...hojas])];
      return;
    }
    avisos.push({ hojas, paso, texto });
  };

  // El rótulo va en las tres hojas.
  for (const texto of avisosDatosFaltantes(params.obra, params.instalador)) {
    agregar(texto, "datos", TODAS);
  }
  for (const texto of avisosCroquis(params.obra)) {
    agregar(texto, "datos", params.conCroquisEnPlano ? ["factibilidad", "plano"] : ["factibilidad"]);
  }

  if (!params.hayPlanoPdf && (!params.drawing || params.drawing.entities.length === 0)) {
    agregar("Falta el plano de la casa. Tocá Plano y subí el archivo (DXF o PDF).", "plano", ["factibilidad", "plano"]);
  }
  if (!params.equipment.some((item) => item.role === "supply")) {
    agregar("Falta ubicar el medidor. Tocá Artefactos, elegí Medidor y marcalo en el plano.", "artefactos", TODAS);
  }
  if (!params.equipment.some((item) => item.role === "appliance")) {
    agregar("Falta ubicar los artefactos. Tocá Artefactos y marcalos en el plano.", "artefactos", ["plano", "planilla"]);
  }
  if (params.network.segments.length === 0) {
    agregar(
      "Falta trazar la cañería. Tocá Cañería y marcá por dónde va desde el medidor.",
      "caneria",
      ["plano", "planilla"],
    );
  } else if (!params.result || params.result.status !== "valid") {
    agregar(
      "La cañería no llega a todos los artefactos o tiene un tramo sin cerrar. Tocá Cañería y revisá la traza.",
      "caneria",
      ["plano", "planilla"],
    );
  }
  if (params.materialesPendientes > 0) {
    agregar(
      `Hay ${params.materialesPendientes} ${params.materialesPendientes === 1 ? "pieza" : "piezas"} sin definir en materiales. Tocá Cañería y revisá la traza.`,
      "caneria",
      ["plano"],
    );
  }
  for (const texto of params.avisosTablas) {
    agregar(texto, pasoDelTexto(texto), ["plano"]);
  }
  for (const texto of params.avisosPlanilla) {
    agregar(texto, pasoDelTexto(texto), ["planilla"]);
  }
  for (const texto of params.avisosCalculo ?? []) {
    agregar(texto, "caneria", []);
  }
  // Obras cargadas antes con tramos en diagonal: no se tocan, se avisa (no frena la descarga).
  if (tramosEnDiagonal(params.network, params.equipment).length > 0) {
    agregar(AVISO_TRAMOS_EN_DIAGONAL, "caneria", []);
  }

  return avisos;
}

/** Las hojas que se pueden descargar ya (ningún aviso las frena). */
export function hojasListas(avisos: AvisoRevisar[]): Set<HojaId> {
  return new Set(TODAS.filter((hoja) => !avisos.some((aviso) => aviso.hojas.includes(hoja))));
}

function pasoDelTexto(texto: string): PasoId {
  if (texto.includes("Datos de la obra") || texto.includes("Datos del instalador")) return "datos";
  if (texto.includes("Artefactos")) return "artefactos";
  if (texto.includes("Plano")) return "plano";
  return "caneria";
}
