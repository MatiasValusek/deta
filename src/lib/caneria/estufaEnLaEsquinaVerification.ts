import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { ARTEFACTOS_CASA, ESCALA_CASA_M_POR_UNIDAD } from "@/lib/workbench/obraCasaDesdeCero";
import { calcularObraDePrueba } from "@/lib/workbench/obrasDePrueba";
import { armarRed, TRAZA_VACIA, type TrazaCanoPrincipal } from "./canoPrincipal";

type Resultado = { name: string; status: "passed" };

/*
 * Estufa en la esquina (ver PLAN.md, "Estufa en la esquina: Ø32 en vez de Ø20").
 *
 * Casa desde cero (datos inventados), caño principal con esquina C y fin; nada agrandado a mano.
 * La bajada a la estufa sale de la te de la esquina C: sube derecho (sigue la dirección del caño
 * que llega desde el medidor) y después dobla hacia la estufa.
 *
 * Por tabla le corresponde Ø20 (0,323 m³/h con 15,29 m → fila de 16 m, el 20 lleva 1,399 m³/h).
 * Antes salía Ø32: el motor medía la dirección de la bajada con la recta de C al artefacto (152°
 * del caño que llega) y no con su primer tramo. La te quedaba sin contar y el motor agrandaba 4-C
 * hasta 32 para no tener reducción. Ahora la mide hacia el primer quiebre: te a través + cupla.
 */

const TRAZA: TrazaCanoPrincipal = { ...TRAZA_VACIA, puntos: [{ x: 1000, y: 4000 }, { x: 8600, y: 4000 }] };

function calcular(equipment: WorkbenchEquipment[], traza = TRAZA) {
  const network = armarRed({ equipment, metrosPorUnidad: ESCALA_CASA_M_POR_UNIDAD, traza }).network;
  return calcularObraDePrueba({
    adoptedDiameterDecisions: [],
    equipment,
    network,
    nombre: "casa desde cero",
    scaleMetersPerSourceUnit: ESCALA_CASA_M_POR_UNIDAD,
  });
}

const fila = (r: ReturnType<typeof calcular>) => {
  const encontrada = r.tablas.calculo.filas.find((f) => f[0] === "4-C");
  if (!encontrada) throw new Error("no está el tramo 4-C");
  return encontrada;
};
const cantidad = (r: ReturnType<typeof calcular>, material: string, diametro: string) =>
  Number(r.tablas.materiales.filas.find((f) => f[0] === material && f[1] === diametro)?.[2] ?? 0);

export function runEstufaEnLaEsquinaVerifications() {
  const results: Resultado[] = [];
  const verify = (name: string, run: () => void) => {
    run();
    results.push({ name, status: "passed" });
  };

  const hoy = calcular(ARTEFACTOS_CASA);
  const [, largoTramo, largoCalculo, equivalente, total, consumo, porTabla, adoptado] = fila(hoy);

  verify("estufa en la esquina: largos, consumo y diámetro por tabla", () => {
    igual(largoTramo, "2,30");
    igual(largoCalculo, "6,10");
    igual(consumo, "0,323");
    igual(porTabla, "20");
    igual(hoy.result.status, "valid");
  });

  verify("estufa en la esquina: Ø20 con te a través 32 + cupla 32→20, como lo pide la tabla", () => {
    igual(adoptado, "20");
    igual(equivalente, "9,19");
    igual(total, "15,29");
    igual(cantidad(hoy, "CUPLA DE REDUCCIÓN", "32"), 3);
  });

  verify("estufa en la esquina: también si la bajada sale a 90° y después sube", () => {
    const aNoventa = calcular(ARTEFACTOS_CASA, {
      ...TRAZA,
      bajadasAMano: { "ca-estufa": [{ x: 200, y: 4000 }] },
      salidas: { "ca-estufa": { x: 1000, y: 4000 } },
    });
    igual(fila(aNoventa).at(-1), "20");
  });

  verify("estufa en la esquina: con la estufa de frente a C (bajada recta) también da Ø20", () => {
    const deFrente = ARTEFACTOS_CASA.map((e) =>
      e.id === "ca-estufa" ? { ...e, connectionPoint: { x: 1000, y: 5500 } } : e,
    );
    igual(fila(calcular(deFrente)).at(-1), "20");
  });

  return results;
}

function igual(actual: unknown, esperado: unknown) {
  if (actual !== esperado) throw new Error(`Se esperaba ${String(esperado)}, dio ${String(actual)}.`);
}
