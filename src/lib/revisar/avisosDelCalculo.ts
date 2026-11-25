import { tesSupuestas } from "@/lib/calculation/causaDelAumento";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { NumeracionPlano } from "@/lib/laminas/numeracionPlano";

/*
 * Avisos del cálculo para el gasista: lo que la app tuvo que suponer o agrandar por su cuenta.
 * No frenan la descarga (las hojas quedan del lado seguro y dicen el motivo real), pero nunca
 * pasan en silencio. Un aviso = qué pasa + qué hacer.
 */

export function avisosDelCalculo(params: {
  calculationSheet: TechnicalCalculationSheet;
  numeracion: NumeracionPlano;
  result: TechnicalCalculationResult | null;
}): string[] {
  const avisos: string[] = [];
  const tramo = (segmentId: string) => params.numeracion.tramos.get(segmentId) ?? "sin nombre";
  const nodo = (nodeId: string) => params.numeracion.nodos.get(nodeId);

  for (const te of tesSupuestas(params.result)) {
    const donde = nodo(te.nodeId);
    avisos.push(
      `En la te ${donde ? `de ${donde} ` : ""}no se ve si el tramo ${tramo(te.segmentId)} sigue derecho o dobla (sale en diagonal). ` +
        "Se contó la te que más longitud equivalente suma, por seguridad. " +
        "Si querés el valor justo, tocá Cañería y hacé que ese tramo salga en escuadra.",
    );
  }

  for (const fila of params.calculationSheet.rows) {
    if (fila.adoptedDiameter) continue;
    const tabla = fila.calculatedDiameter?.externalDiameterMillimeters;
    const adoptado = fila.effectiveDiameter?.externalDiameterMillimeters;
    if (tabla === undefined || adoptado === undefined || adoptado <= tabla) continue;

    const nombre = tramo(fila.segmentId);
    if (fila.enlargementCause === "pieza_sin_contar") {
      avisos.push(
        `El tramo ${nombre} quedó en Ø${adoptado} aunque por tabla alcanza Ø${tabla}: la app no pudo contar una pieza de ese tramo y lo agrandó por seguridad. ` +
          "Tocá Cañería y revisá cómo sale ese tramo (mejor en escuadra).",
      );
    } else if (fila.enlargementCause !== "longitud_equivalente") {
      avisos.push(
        `El tramo ${nombre} quedó en Ø${adoptado} aunque por tabla alcanza Ø${tabla}, por el cálculo de la red. ` +
          "Tocá Cañería y revisá la traza de ese tramo.",
      );
    }
  }

  return avisos;
}
