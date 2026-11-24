import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import { diametrosPorTramo } from "@/lib/laminas/isometricaPdf";
import { calcularObraDePrueba, OBRAS_DE_PRUEBA } from "./obrasDePrueba";

type Resultado = { name: string; status: "passed" };

/*
 * El diámetro adoptado de cada tramo tiene que ser el mismo en la pantalla (Calcular), en la
 * tabla SIGAS del A3, en la isométrica y en la lista de materiales.
 *
 * Antes no pasaba en la obra de tres derivaciones: la pantalla y los materiales usaban los
 * diámetros que agrandó la gasista, pero el cálculo que llena la tabla del A3 no los recibía
 * y mostraba el de tabla (20 en lugar de 25 en 1-A). Ahora todos salen de calcularObra().
 */

const mm = (diametro: PipeDiameterReference | null | undefined) =>
  diametro?.externalDiameterMillimeters === undefined
    ? "—"
    : String(diametro.externalDiameterMillimeters);

export function runDiametroAdoptadoVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => true | string) => {
    const salida = ok();
    if (salida !== true) throw new Error(`Diámetro adoptado: ${name} (${salida})`);
    results.push({ name, status: "passed" });
  };

  for (const obra of OBRAS_DE_PRUEBA) {
    const { adoptedDiameterValidation, calculationSheet, materialTakeoff, tablas } =
      calcularObraDePrueba(obra);
    const isometrica = diametrosPorTramo(tablas.numeracion, tablas.calculo.filas);
    const filaA3 = new Map(tablas.calculo.filas.map((fila) => [fila[0], fila[fila.length - 1]]));

    check(`${obra.nombre}: mismo adoptado en pantalla, A3, isométrica y materiales`, () => {
      const distintos = calculationSheet.rows.flatMap((row) => {
        const validacion = adoptedDiameterValidation.segments.find(
          (segment) => segment.segmentId === row.segmentId,
        );
        // Lo que muestra la columna "Diam. adoptado" de Calcular.
        const pantalla = mm(validacion?.adoptedDiameter ?? row.adoptedDiameter);
        const nombre = tablas.numeracion.tramos.get(row.segmentId) ?? row.segmentId;
        const a3 = filaA3.get(nombre) ?? "—";
        const iso = isometrica.get(row.segmentId) ?? "—";
        const cano = materialTakeoff.pipeItems.find((item) =>
          item.segmentIds.includes(row.segmentId),
        );
        const materiales = mm(cano?.diameter);
        const valores = [pantalla, a3, iso, materiales];

        return pantalla !== "—" && valores.every((valor) => valor === pantalla)
          ? []
          : [`${nombre}: pantalla ${pantalla}, A3 ${a3}, isométrica ${iso}, materiales ${materiales}`];
      });
      return distintos.length === 0 || distintos.join("; ");
    });
  }

  return results;
}
