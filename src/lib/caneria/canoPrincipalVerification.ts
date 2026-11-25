import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { resolveRouteSegments, getConnectedApplianceEquipmentIds } from "@/lib/routing/network";
import { ARTEFACTOS_CASA, ESCALA_CASA_M_POR_UNIDAD } from "@/lib/workbench/obraCasaDesdeCero";
import { calcularObraDePrueba } from "@/lib/workbench/obrasDePrueba";
import { armarRed, enEscuadra, leerTraza, limpiarPuntos, TRAZA_VACIA, type TrazaCanoPrincipal } from "./canoPrincipal";

type Resultado = { name: string; status: "passed" };

/*
 * Paso Cañería: caño principal + bajadas, con la casa desde cero (datos inventados).
 * El medidor está en (1, 0,2) m; el gasista marca la esquina (1, 4) y el fin (8,6, 4).
 */

const ESQUINA = { x: 1000, y: 4000 };
const FIN = { x: 8600, y: 4000 };
const TRAZA_CASA: TrazaCanoPrincipal = { ...TRAZA_VACIA, puntos: [ESQUINA, FIN] };

const armar = (traza: TrazaCanoPrincipal, equipment: WorkbenchEquipment[] = ARTEFACTOS_CASA) =>
  armarRed({ equipment, metrosPorUnidad: ESCALA_CASA_M_POR_UNIDAD, traza });

export function runCanoPrincipalVerifications() {
  const results: Resultado[] = [];
  const verify = (name: string, run: () => void) => {
    run();
    results.push({ name, status: "passed" });
  };

  verify("con la esquina y el fin, la app llega a los 4 artefactos sin avisos", () => {
    const { avisos, network } = armar(TRAZA_CASA);
    igual(avisos.length, 0, avisos.join(" / "));
    igual(getConnectedApplianceEquipmentIds(network, ARTEFACTOS_CASA).size, 4);
  });

  verify("todo va en ángulo recto: caño principal y bajadas", () => {
    for (const tramo of resolveRouteSegments(armar(TRAZA_CASA).network, ARTEFACTOS_CASA)) {
      for (let i = 1; i < tramo.path.length; i += 1) {
        const a = tramo.path[i - 1];
        const b = tramo.path[i];
        if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.y - b.y) > 1e-6) throw new Error(`${tramo.id} va en diagonal`);
      }
    }
  });

  verify("una derivación por lugar: la estufa sale de la esquina; calefón y calefactor, de la punta", () => {
    const { network } = armar(TRAZA_CASA);
    const derivaciones = network.nodes.filter((n) => n.kind === "route");
    igual(derivaciones.length, 3);
    const salidaDe = (id: string) =>
      network.nodes.find((n) => n.id === network.segments.find((s) => s.toNodeId === `cp:a:${id}`)?.fromNodeId)?.position;
    igualPunto(salidaDe("ca-estufa"), ESQUINA);
    igualPunto(salidaDe("ca-calefon"), FIN);
    igualPunto(salidaDe("ca-calefactor"), FIN);
    igualPunto(salidaDe("ca-cocina"), { x: 6000, y: 4000 });
  });

  verify("el cálculo sale completo, con tes, codos, llaves y tramos numerados como en los planos", () => {
    const { network } = armar(TRAZA_CASA);
    const { calculationSheet, result, tablas } = calcularObraDePrueba({
      adoptedDiameterDecisions: [],
      equipment: ARTEFACTOS_CASA,
      network,
      nombre: "casa desde cero",
      scaleMetersPerSourceUnit: ESCALA_CASA_M_POR_UNIDAD,
    });
    igual(result.status, "valid");
    igual(calculationSheet.status, "resolved");
    igual(tablas.avisos.length, 0, tablas.avisos.join(" / "));
    const tramos = tablas.calculo.filas.map((fila) => fila[0]).sort().join(" ");
    igual(tramos, "1-A 2-A 3-B 4-C A-B B-C C-M");
    const cantidad = (material: string) =>
      tablas.materiales.filas.filter((f) => f[0] === material).reduce((total, f) => total + Number(f[2]), 0);
    igual(cantidad("TE"), 3);
    igual(cantidad("LLAVE DE PASO"), 5);
  });

  verify("lo marcado se vuelve a leer de la red guardada", () => {
    const traza = leerTraza(armar(TRAZA_CASA).network, ARTEFACTOS_CASA);
    if (!traza) throw new Error("no se pudo leer");
    igual(JSON.stringify(armar(traza).network), JSON.stringify(armar(TRAZA_CASA).network));
  });

  verify("tocar de a un punto (y releer la red entre toque y toque) da lo mismo que marcar todo junto", () => {
    const conEsquina = leerTraza(armar({ ...TRAZA_VACIA, puntos: [ESQUINA] }).network, ARTEFACTOS_CASA);
    if (!conEsquina) throw new Error("no se pudo leer");
    igual(Object.keys(conEsquina.salidas).length, 0);
    const conFin = { ...conEsquina, puntos: [...conEsquina.puntos, FIN] };
    igual(JSON.stringify(armar(conFin).network), JSON.stringify(armar(TRAZA_CASA).network));
  });

  verify("una salida movida se recuerda al releer", () => {
    const movida = { ...TRAZA_CASA, salidas: { "ca-cocina": { x: 5000, y: 4000 } } };
    const leida = leerTraza(armar(movida).network, ARTEFACTOS_CASA);
    igual(JSON.stringify(leida?.salidas), JSON.stringify(movida.salidas));
  });

  verify("una red de la pantalla anterior no se toca: se avisa y se puede empezar de nuevo", () => {
    igual(leerTraza({ nodes: [{ id: "n1", kind: "route" }], segments: [{ fromNodeId: "n1", id: "t1", toNodeId: "n1" }] }, ARTEFACTOS_CASA), null);
    igual(JSON.stringify(leerTraza({ nodes: [], segments: [] }, ARTEFACTOS_CASA)), JSON.stringify(TRAZA_VACIA));
  });

  verify("el punto tocado queda en escuadra con el anterior", () => {
    igualPunto(enEscuadra({ x: 0, y: 0 }, { x: 100, y: 7 }), { x: 100, y: 0 });
    igualPunto(enEscuadra({ x: 0, y: 0 }, { x: 5, y: -80 }), { x: 0, y: -80 });
  });

  verify("un punto en línea recta no es un quiebre", () => {
    igual(limpiarPuntos({ x: 0, y: 0 }, [{ x: 0, y: 50 }, { x: 0, y: 100 }, { x: 100, y: 100 }]).length, 2);
  });

  verify("sin caño principal, avisa qué hacer", () => {
    igual(armar(TRAZA_VACIA).avisos[0], "Falta el caño principal. Tocá en el plano dónde dobla y dónde termina.");
  });

  verify("mover el punto de salida cambia de dónde sale la bajada", () => {
    const { network } = armar({ ...TRAZA_CASA, salidas: { "ca-cocina": { x: 5000, y: 4300 } } });
    const bajada = network.segments.find((s) => s.toNodeId === "cp:a:ca-cocina");
    igualPunto(network.nodes.find((n) => n.id === bajada?.fromNodeId)?.position, { x: 5000, y: 4000 });
    igual(bajada?.vertices?.length, 1);
  });

  verify("una bajada que cruza otro caño trae aviso", () => {
    const { avisos } = armar({ ...TRAZA_CASA, bajadasAMano: { "ca-cocina": [{ x: 6000, y: 3000 }, { x: 7000, y: 3000 }, { x: 7000, y: 7700 }] } });
    igual(avisos.length, 1);
    if (!avisos[0].startsWith("El caño a Cocina cruza otro caño.")) throw new Error(avisos[0]);
  });

  return results;
}

function igual(actual: unknown, esperado: unknown, detalle = "") {
  if (actual !== esperado) throw new Error(`Se esperaba ${String(esperado)}, dio ${String(actual)}. ${detalle}`);
}

function igualPunto(actual: Point2D | undefined, esperado: Point2D) {
  if (!actual || Math.abs(actual.x - esperado.x) > 1e-6 || Math.abs(actual.y - esperado.y) > 1e-6) {
    throw new Error(`Se esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(actual)}.`);
  }
}
