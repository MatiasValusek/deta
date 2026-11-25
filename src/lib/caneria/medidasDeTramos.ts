import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { TablasPlano } from "@/lib/laminas/tablasPlano";

/*
 * "C-M Ø32" por tramo, para mostrar en el plano del paso Cañería: el nombre del tramo y el
 * diámetro adoptado, leídos de la misma tabla "Cálculo cañería SIGAS" que sale en el A3.
 */
export function medidasDeTramos(
  tablas: Pick<TablasPlano, "calculo" | "numeracion">,
  result: TechnicalCalculationResult | null,
): Map<string, string> {
  const etiquetas = new Map<string, string>();
  if (!result || result.status !== "valid") return etiquetas;

  const adoptado = new Map(tablas.calculo.filas.map((fila) => [fila[0], fila.at(-1) ?? ""]));
  for (const [segmentId, nombre] of tablas.numeracion.tramos) {
    const diametro = adoptado.get(nombre);
    etiquetas.set(segmentId, diametro && /^\d+$/.test(diametro) ? `${nombre} Ø${diametro}` : nombre);
  }
  return etiquetas;
}
