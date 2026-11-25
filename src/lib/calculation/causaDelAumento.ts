import type { TechnicalTransitionAwareNetworkSizingIssueCode } from "@/lib/calculation/technicalNetworkSizingWithTransitions";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";

/*
 * Por qué el motor dejó un tramo más grande que el de tabla. Lo lee de la auditoría que el
 * motor ya hace al terminar: para cada tramo agrandado prueba bajarlo un escalón y anota el
 * primer problema que aparece. No calcula nada nuevo.
 * - longitud_equivalente: con las piezas de reducción la longitud total pide más diámetro.
 * - pieza_sin_contar: la app no pudo contar una pieza (una te, una reducción) con el diámetro
 *   más chico y agrandó el caño para no tener que contarla.
 * - otra: cualquier otro problema del cálculo de la red.
 */

export type CausaDelAumento = "longitud_equivalente" | "pieza_sin_contar" | "otra";

const POR_LONGITUD: ReadonlySet<TechnicalTransitionAwareNetworkSizingIssueCode> = new Set([
  "candidate_diameter_below_required",
]);

const POR_PIEZA: ReadonlySet<TechnicalTransitionAwareNetworkSizingIssueCode> = new Set([
  "branch_transition_required",
  "compound_transition_required",
  "route_accessories_unresolved",
  "route_transitions_unresolved",
  "transition_family_incompatible",
  "unconfirmed_required_transition",
]);

/** Causa por tramo, solo de los tramos que el motor agrandó por encima de la tabla. */
export function causasDelAumento(
  result: TechnicalCalculationResult | null | undefined,
): Map<string, CausaDelAumento> {
  const causas = new Map<string, CausaDelAumento>();

  for (const entrada of result?.transitionAwareNetworkSizing?.minimalityAudit ?? []) {
    if (!entrada.loweredDiameter) continue;
    const codigo = entrada.loweredIssueCode;
    causas.set(
      entrada.segmentId,
      codigo && POR_LONGITUD.has(codigo)
        ? "longitud_equivalente"
        : codigo && POR_PIEZA.has(codigo)
          ? "pieza_sin_contar"
          : "otra",
    );
  }

  return causas;
}

/** Nodos donde una te se contó con la variante más exigente porque no se supo el sentido. */
export function tesSupuestas(
  result: TechnicalCalculationResult | null | undefined,
): Array<{ nodeId: string; segmentId: string }> {
  const vistas = new Map<string, { nodeId: string; segmentId: string }>();
  const resoluciones = result?.transitionAwareNetworkSizing?.routeTransitionResolutions ?? {};

  for (const resolucion of Object.values(resoluciones)) {
    for (const aporte of resolucion.contributions) {
      if (!aporte.traversalAssumed || !aporte.downstreamSegmentId) continue;
      const clave = `${aporte.nodeId}|${aporte.downstreamSegmentId}`;
      if (!vistas.has(clave)) {
        vistas.set(clave, { nodeId: aporte.nodeId, segmentId: aporte.downstreamSegmentId });
      }
    }
  }

  return [...vistas.values()];
}
