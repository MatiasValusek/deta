import type { PasoId } from "@/lib/revisar/avisosRevisar";
import type { MainWorkflowStageId } from "@/lib/workbench/mainWorkflowNavigation";
import type { PasoDeLaBarra } from "./BarraDePasos";

/*
 * Pasos 2 a 5 de la barra sobre las pantallas de hoy. El paso 1 (Datos de la obra) es la
 * ventana de datos. "Calcular" y "Entregar" ya no son pasos: los reemplaza "Revisar y
 * descargar".
 */

export type EstadoDePasos = {
  artefactosListos: boolean;
  canieriaLista: boolean;
  planoListo: boolean;
};

const ETAPA_DE_PASO: Record<Exclude<PasoId, "datos">, MainWorkflowStageId> = {
  artefactos: "equipment",
  caneria: "route",
  plano: "plan",
  revisar: "review",
};

export function etapaDePaso(paso: Exclude<PasoId, "datos">) {
  return ETAPA_DE_PASO[paso];
}

export function pasosDeLaBarra(estado: EstadoDePasos): PasoDeLaBarra[] {
  return [
    { completo: estado.planoListo, etiqueta: "Plano", habilitado: true, id: "plan" },
    {
      completo: estado.artefactosListos,
      etiqueta: "Artefactos",
      habilitado: estado.planoListo,
      id: "equipment",
      motivo: "Primero subí el plano y marcá la escala.",
    },
    {
      completo: estado.canieriaLista,
      etiqueta: "Cañería",
      habilitado: estado.artefactosListos,
      id: "route",
      motivo: "Primero ubicá el medidor y los artefactos.",
    },
    {
      completo: false,
      etiqueta: "Revisar y descargar",
      habilitado: estado.artefactosListos,
      id: "review",
      motivo: "Primero ubicá el medidor y los artefactos.",
    },
  ];
}

/** Qué hace "Siguiente" en cada paso (null: no se muestra). */
export function siguientePaso(
  etapa: MainWorkflowStageId,
  estado: EstadoDePasos,
): { habilitado: boolean; hacia: MainWorkflowStageId; motivo: string } | null {
  if (etapa === "plan") {
    return {
      habilitado: estado.planoListo,
      hacia: "equipment",
      motivo: "Falta el plano o la escala. Subí el archivo y marcá una medida que conozcas.",
    };
  }
  if (etapa === "equipment") {
    return {
      habilitado: estado.artefactosListos,
      hacia: "route",
      motivo: "Falta ubicar el medidor o algún artefacto. Elegilo y marcalo en el plano.",
    };
  }
  if (etapa === "route") {
    return {
      habilitado: estado.canieriaLista,
      hacia: "review",
      motivo: "Falta terminar la cañería: tiene que llegar al medidor y a todos los artefactos, y estar aceptada.",
    };
  }
  return null;
}
