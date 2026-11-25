import { DEFAULT_PROJECT_GAS_CONFIG } from "@/lib/calculation/projectGas";
import type { TechnicalRouteTransitionResolution } from "@/lib/calculation/technicalRouteTransitions";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { NormalizedDrawing } from "@/lib/geometry/types";
import { crearFactibilidadPdf, plantaFactibilidad } from "@/lib/laminas/factibilidadPdf";
import type { FondoPdf } from "@/lib/laminas/fondoPdf";
import { diametrosPorTramo, hayAlturasCargadas } from "@/lib/laminas/isometricaPdf";
import { numerarDesdeResultado } from "@/lib/laminas/numeracionPlano";
import { crearPlanillaTramos } from "@/lib/laminas/planillaTramos";
import { crearPlanillaTramosPdf } from "@/lib/laminas/planillaTramosPdf";
import { crearPlanoInstalacionPdf } from "@/lib/laminas/planoInstalacionPdf";
import { crearTablasPlano } from "@/lib/laminas/tablasPlano";
import {
  crearDatosCroquis,
  crearRotulo,
  type DatosInstalador,
  type DatosObra,
} from "@/lib/obra/obraData";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import type { ResultadosObra } from "@/lib/workbench/calculoObra";
import type { HojaId } from "./avisosRevisar";

/*
 * Las 3 hojas que presenta el gasista, armadas con el mismo cálculo que la pantalla:
 * Factibilidad A3, Plano de instalación A3 y Planilla de cálculo.
 */

export type DatosHojas = {
  conCroquisEnPlano: boolean;
  drawing: NormalizedDrawing | null;
  equipment: WorkbenchEquipment[];
  /** Plano en PDF: su página va de fondo en la planta de las dos láminas A3. */
  fondoPdf?: FondoPdf | null;
  instalador: DatosInstalador;
  network: ManualRouteNetwork;
  obra: DatosObra;
  result: TechnicalCalculationResult | null;
  resultados: ResultadosObra;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  visibleLayers: Record<string, boolean>;
};

/** Tablas del Plano de instalación y planilla por tramo, sin dibujar todavía. */
export function prepararHojas(datos: Omit<DatosHojas, "conCroquisEnPlano" | "instalador" | "obra" | "visibleLayers" | "drawing" | "fondoPdf">) {
  const tablas = crearTablasPlano({
    calculationSheet: datos.resultados.calculationSheet,
    equipment: datos.equipment,
    materialTakeoff: datos.resultados.materialTakeoff,
    network: datos.network,
    projectGas: DEFAULT_PROJECT_GAS_CONFIG,
    result: datos.result,
  });
  const planilla = crearPlanillaTramos({
    calculationSheet: datos.resultados.calculationSheet,
    numeracion: numerarDesdeResultado(datos.network, datos.result),
    result: datos.result,
    routeTransitionResolutions: datos.routeTransitionResolutions,
  });

  return { planilla, tablas };
}

export async function crearHoja(hoja: HojaId, datos: DatosHojas): Promise<Uint8Array> {
  const rotulo = crearRotulo(datos.obra, datos.instalador);
  const { planilla, tablas } = prepararHojas(datos);

  if (hoja === "factibilidad") {
    const croquis = crearDatosCroquis(datos.obra);
    if (!croquis) throw new Error("Faltan datos del croquis");
    return crearFactibilidadPdf(
      rotulo,
      plantaFactibilidad({
        capasVisibles: datos.visibleLayers,
        drawing: datos.drawing,
        equipment: datos.equipment,
        ...(datos.fondoPdf ? { fondoPdf: datos.fondoPdf } : {}),
      }),
      croquis,
    );
  }

  if (hoja === "planilla") {
    return crearPlanillaTramosPdf(planilla, rotulo);
  }

  if (!datos.drawing && !datos.fondoPdf) throw new Error("Falta el plano");
  const croquis = datos.conCroquisEnPlano ? (crearDatosCroquis(datos.obra) ?? undefined) : undefined;
  return crearPlanoInstalacionPdf(
    rotulo,
    { conCroquis: Boolean(croquis) },
    tablas,
    {
      capasVisibles: datos.visibleLayers,
      drawing: datos.drawing,
      equipment: datos.equipment,
      ...(datos.fondoPdf ? { fondoPdf: datos.fondoPdf } : {}),
      network: datos.network,
      numeracion: tablas.numeracion,
    },
    {
      alturasCargadas: hayAlturasCargadas(datos.network, datos.equipment),
      diametros: diametrosPorTramo(tablas.numeracion, tablas.calculo.filas),
      numeracion: tablas.numeracion,
      vista: datos.resultados.axonometricView,
      yHaciaAbajo: Boolean(datos.fondoPdf),
    },
    croquis,
  );
}

/** Nombre del archivo: la hoja y la dirección de la obra ("Plano de instalación - Calle 123.pdf"). */
export function nombreArchivo(hoja: HojaId, obra: DatosObra) {
  const nombres: Record<HojaId, string> = {
    factibilidad: "Factibilidad",
    planilla: "Planilla de cálculo",
    plano: "Plano de instalación",
  };
  return `${nombres[hoja]}${sufijoDireccion(obra)}.pdf`;
}

/** "Materiales - Calle 123.xlsx": cálculo y materiales en Excel. */
export function nombreArchivoExcel(obra: DatosObra) {
  return `Materiales${sufijoDireccion(obra)}.xlsx`;
}

function sufijoDireccion(obra: DatosObra) {
  const direccion = [obra.calle.trim(), obra.numero.trim()].filter(Boolean).join(" ");
  const limpio = direccion.replace(/[\\/:*?"<>|]+/g, "").trim();
  return limpio ? ` - ${limpio}` : "";
}

/** "4 artefactos · 3,76 m³/h · 8 tramos · caño de 20 a 32". */
export function resumenObra(params: {
  equipment: WorkbenchEquipment[];
  filasCalculo: string[][];
  filasReferencias: string[][];
}) {
  const artefactos = params.equipment.filter((item) => item.role === "appliance").length;
  const total = params.filasReferencias.find((fila) => fila[1] === "TOTAL")?.at(-1);
  const diametros = params.filasCalculo
    .map((fila) => Number(fila.at(-1)))
    .filter((valor) => Number.isFinite(valor) && valor > 0);
  const partes = [`${artefactos} ${artefactos === 1 ? "artefacto" : "artefactos"}`];
  if (total) partes.push(`${total} m³/h`);
  if (params.filasCalculo.length > 0) {
    partes.push(`${params.filasCalculo.length} ${params.filasCalculo.length === 1 ? "tramo" : "tramos"}`);
  }
  if (diametros.length > 0) {
    const menor = Math.min(...diametros);
    const mayor = Math.max(...diametros);
    partes.push(menor === mayor ? `caño de ${menor}` : `caño de ${menor} a ${mayor}`);
  }
  return partes.join(" · ");
}
