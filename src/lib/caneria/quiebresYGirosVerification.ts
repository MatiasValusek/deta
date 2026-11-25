import type { Point2D } from "@/lib/geometry/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { ARTEFACTOS_CASA } from "@/lib/workbench/obraCasaDesdeCero";
import { calcularObraDePrueba } from "@/lib/workbench/obrasDePrueba";

type Resultado = { name: string; status: "passed" };

/*
 * En obra el caño no se curva: los cambios de dirección van con codos (Deta, por ahora, solo a
 * 90°). Datos inventados: medidor en (0, 0), un quiebre en (0, 3 m) y una estufa más allá. El
 * tramo que sale del medidor está agrandado a Ø32 por el gasista y la bajada va en Ø20, así que
 * en el quiebre cambia la medida.
 * - Quiebre de entre 3° y 10°: es un error de dibujo. Se toma como recto: solo la reducción.
 * - Giro a 90° con cambio de medida: codo + reducción, con los valores de la tabla.
 * En los dos casos, sin agrandar caños.
 */

const medidor = { ...ARTEFACTOS_CASA[0], connectionPoint: { x: 0, y: 0 } };
const estufa = ARTEFACTOS_CASA[1];

function calcular(punto: Point2D) {
  const equipment = [medidor, { ...estufa, connectionPoint: punto }];
  const network: ManualRouteNetwork = {
    nodes: [
      { equipmentId: medidor.id, id: "n-m", kind: "supply", origin: "manual" },
      { id: "n-1", kind: "route", origin: "manual", position: { x: 0, y: 3000 } },
      { equipmentId: estufa.id, id: "n-e", kind: "appliance", origin: "manual" },
    ],
    segments: [
      { fromNodeId: "n-m", id: "t-m-1", origin: "manual", toNodeId: "n-1" },
      { fromNodeId: "n-1", id: "t-1-e", origin: "manual", toNodeId: "n-e" },
    ],
  };
  return calcularObraDePrueba({
    adoptedDiameterDecisions: [{ decidedAt: 0, diameterId: "sigas-32", origin: "user_adopted", segmentId: "t-m-1" }],
    equipment,
    network,
    nombre: "casa desde cero",
    scaleMetersPerSourceUnit: 0.001,
  });
}

const grados = (g: number) => (g * Math.PI) / 180;

export function runQuiebresYGirosVerifications() {
  const results: Resultado[] = [];
  const verify = (name: string, run: () => void) => {
    run();
    results.push({ name, status: "passed" });
  };
  const cantidad = (r: ReturnType<typeof calcular>, material: string, diametro: string) =>
    Number(r.tablas.materiales.filas.find((f) => f[0] === material && f[1] === diametro)?.[2] ?? 0);
  const adoptados = (r: ReturnType<typeof calcular>) => r.tablas.calculo.filas.map((f) => `${f[0]} ${f.at(-1)}`).join(", ");

  for (const angulo of [4, 5, 9]) {
    verify(`quiebre de ${angulo}° con cambio de medida: se endereza y se cuenta solo la reducción`, () => {
      const r = calcular({ x: 3000 * Math.tan(grados(angulo)), y: 6000 });
      igual(r.result.status, "valid");
      igual(adoptados(r), "1-A 20, A-M 32");
      igual(cantidad(r, "CUPLA DE REDUCCIÓN", "32"), 1);
      // Sin codo en el quiebre: solo los 2 de subida (Ø20) y los 4 de salida del medidor (Ø32).
      igual(cantidad(r, "CODO", "20"), 2);
      igual(cantidad(r, "CODO", "32"), 4);
    });
  }

  verify("quiebre de 2° (recto de siempre): las mismas piezas que el de 5°", () => {
    const piezas = (r: ReturnType<typeof calcular>) =>
      JSON.stringify(r.tablas.materiales.filas.filter((f) => f[0] !== "CAÑO"));
    igual(piezas(calcular({ x: 3000 * Math.tan(grados(2)), y: 6000 })), piezas(calcular({ x: 3000 * Math.tan(grados(5)), y: 6000 })));
  });

  verify("giro a 90° con cambio de medida: codo + reducción, con los valores de la tabla, sin agrandar", () => {
    const giro = calcular({ x: 3000, y: 3000 });
    const recto = calcular({ x: 0, y: 6000 });
    igual(giro.result.status, "valid");
    igual(adoptados(giro), "1-A 20, A-M 32");
    igual(cantidad(giro, "CUPLA DE REDUCCIÓN", "32"), 1);
    // El codo del giro va en el tramo que sale (Ø20), además de los 2 de subida.
    igual(cantidad(giro, "CODO", "20"), 3);
    igual(cantidad(giro, "CODO", "32"), 4);
    // Mismo largo que la bajada recta: la diferencia es el codo Ø20 de la tabla (0,953 m).
    const equivalente = (r: ReturnType<typeof calcular>) =>
      Number(r.tablas.calculo.filas.find((f) => f[0] === "1-A")?.[3]?.replace(",", "."));
    igual(Math.abs(equivalente(giro) - equivalente(recto) - 0.953) <= 0.01, true);
  });

  return results;
}

function igual(actual: unknown, esperado: unknown) {
  if (actual !== esperado) throw new Error(`Se esperaba ${String(esperado)}, dio ${String(actual)}.`);
}
