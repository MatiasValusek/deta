import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { getConnectedApplianceEquipmentIds, resolveRouteSegments } from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { ARTEFACTOS_CASA, ESCALA_CASA_M_POR_UNIDAD } from "@/lib/workbench/obraCasaDesdeCero";
import { calcularObraDePrueba } from "@/lib/workbench/obrasDePrueba";
import { armarRed, leerTraza, TRAZA_VACIA, type TrazaCanoPrincipal } from "./canoPrincipal";
import { moverQuiebre } from "./corregirTraza";
import { armarRecorridoDirecto, corresponderArmarDirecto } from "./recorridoDirecto";

type Resultado = { name: string; status: "passed" };

/*
 * Forma "Directo" (datos inventados): la app arma sola el recorrido desde el medidor a todos los
 * artefactos, cruzando por el medio, solo a 90° y lo más corto posible. Lo corregido a mano se
 * respeta: la app solo arma cuando todavía no hay caño principal.
 */

const directo = (equipment: WorkbenchEquipment[] = ARTEFACTOS_CASA) =>
  armarRecorridoDirecto({ equipment, metrosPorUnidad: ESCALA_CASA_M_POR_UNIDAD });
const red = (traza: TrazaCanoPrincipal, equipment: WorkbenchEquipment[] = ARTEFACTOS_CASA) =>
  armarRed({ equipment, metrosPorUnidad: ESCALA_CASA_M_POR_UNIDAD, traza });
const largo = (network: ManualRouteNetwork, equipment: WorkbenchEquipment[]) =>
  resolveRouteSegments(network, equipment).reduce(
    (total, tramo) => total + tramo.path.slice(1).reduce((suma, q, i) => suma + Math.hypot(q.x - tramo.path[i].x, q.y - tramo.path[i].y), 0),
    0,
  );

export function runRecorridoDirectoVerifications() {
  const results: Resultado[] = [];
  const verify = (name: string, run: () => void) => {
    run();
    results.push({ name, status: "passed" });
  };

  verify("casa desde cero: llega a los 4 artefactos, a 90°, sin cruces y con el cálculo completo", () => {
    const traza = directo();
    if (!traza) throw new Error("no armó nada");
    const { avisos, network } = red(traza);
    igual(avisos.length, 0);
    igual(getConnectedApplianceEquipmentIds(network, ARTEFACTOS_CASA).size, 4);
    aNoventa(network, ARTEFACTOS_CASA);
    const { result, tablas } = calcularObraDePrueba({
      adoptedDiameterDecisions: [],
      equipment: ARTEFACTOS_CASA,
      network,
      nombre: "casa desde cero",
      scaleMetersPerSourceUnit: ESCALA_CASA_M_POR_UNIDAD,
    });
    igual(result.status, "valid");
    igual(tablas.avisos.length, 0);
  });

  verify("casa desde cero: cruza por el medio y usa menos caño que el trazado a mano de las pruebas", () => {
    const traza = directo()!;
    // El caño principal sube del medidor (1; 0,2) hasta y = 5,5 m (la altura de la estufa, que
    // deja las bajadas más cortas) y cruza hasta el calefón y el calefactor.
    igual(JSON.stringify(traza.puntos), JSON.stringify([{ x: 1000, y: 5500 }, { x: 8600, y: 5500 }]));
    const aMano = { ...TRAZA_VACIA, puntos: [{ x: 1000, y: 4000 }, { x: 8600, y: 4000 }] };
    const conDirecto = largo(red(traza).network, ARTEFACTOS_CASA);
    igual(conDirecto < largo(red(aMano).network, ARTEFACTOS_CASA), true);
    igual((conDirecto / 1000).toFixed(2), "23.00");
  });

  verify("artefactos a los dos lados del medidor: llega a todos sin cruces", () => {
    const equipment = [
      artefacto("m", "supply", { x: 5000, y: 0 }),
      artefacto("a", "appliance", { x: 1000, y: 3000 }),
      artefacto("b", "appliance", { x: 9000, y: 3500 }),
      artefacto("c", "appliance", { x: 6000, y: 7000 }),
    ];
    const { avisos, network } = red(directo(equipment)!, equipment);
    igual(avisos.length, 0);
    igual(getConnectedApplianceEquipmentIds(network, equipment).size, 3);
    aNoventa(network, equipment);
  });

  verify("sin medidor o sin artefactos no arma nada", () => {
    igual(directo(ARTEFACTOS_CASA.filter((e) => e.role !== "supply")), null);
    igual(directo(ARTEFACTOS_CASA.filter((e) => e.role !== "appliance")), null);
  });

  verify("lo tocado a mano se respeta: solo arma cuando todavía no hay caño principal", () => {
    igual(corresponderArmarDirecto(TRAZA_VACIA, ARTEFACTOS_CASA), true);
    igual(corresponderArmarDirecto(null, ARTEFACTOS_CASA), false); // red de la pantalla anterior
    const armada = directo()!;
    igual(corresponderArmarDirecto(armada, ARTEFACTOS_CASA), false);
    // El gasista arrastra el quiebre: se guarda, se relee y la app no lo vuelve a armar.
    const movida = moverQuiebre(armada, ARTEFACTOS_CASA[0].connectionPoint, 0, { x: 1000, y: 5000 });
    const leida = leerTraza(red(movida).network, ARTEFACTOS_CASA);
    igual(JSON.stringify(leida?.puntos), JSON.stringify([{ x: 1000, y: 5000 }, { x: 8600, y: 5000 }]));
    igual(corresponderArmarDirecto(leida, ARTEFACTOS_CASA), false);
    igual(corresponderArmarDirecto({ ...TRAZA_VACIA, bajadasAMano: { x: [] } }, ARTEFACTOS_CASA), false);
  });

  return results;
}

function aNoventa(network: ManualRouteNetwork, equipment: WorkbenchEquipment[]) {
  for (const tramo of resolveRouteSegments(network, equipment)) {
    for (let i = 1; i < tramo.path.length; i += 1) {
      const a = tramo.path[i - 1];
      const b = tramo.path[i];
      if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.y - b.y) > 1e-6) throw new Error(`${tramo.id} va en diagonal`);
    }
  }
}

function artefacto(id: string, role: "supply" | "appliance", connectionPoint: Point2D): WorkbenchEquipment {
  const base = ARTEFACTOS_CASA.find((e) => e.role === role)!;
  return { ...base, connectionPoint, id };
}

function igual(actual: unknown, esperado: unknown) {
  if (actual !== esperado) throw new Error(`Se esperaba ${String(esperado)}, dio ${String(actual)}.`);
}
