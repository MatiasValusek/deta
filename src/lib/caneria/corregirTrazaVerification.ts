import type { Point2D } from "@/lib/geometry/types";
import { getConnectedApplianceEquipmentIds } from "@/lib/routing/network";
import { ARTEFACTOS_CASA, ESCALA_CASA_M_POR_UNIDAD } from "@/lib/workbench/obraCasaDesdeCero";
import { calcularObraDePrueba } from "@/lib/workbench/obrasDePrueba";
import { armarRed, leerTraza, TRAZA_VACIA, type TrazaCanoPrincipal } from "./canoPrincipal";
import {
  agregarQuiebre,
  artefactosDeLaDerivacion,
  bajadaAMano,
  bajadaAutomatica,
  moverQuiebre,
  moverSalida,
  moverTramoEnParalelo,
  quiebreDelNodo,
  quiebreDelVertice,
  sacarQuiebre,
  tramoRectoCercano,
} from "./corregirTraza";

type Resultado = { name: string; status: "passed" };

/* Correcciones del paso Cañería, con la casa desde cero (datos inventados). */

const MEDIDOR = ARTEFACTOS_CASA[0].connectionPoint;
const ESQUINA = { x: 1000, y: 4000 };
const FIN = { x: 8600, y: 4000 };
const CASA: TrazaCanoPrincipal = { ...TRAZA_VACIA, puntos: [ESQUINA, FIN] };
const armar = (traza: TrazaCanoPrincipal) =>
  armarRed({ equipment: ARTEFACTOS_CASA, metrosPorUnidad: ESCALA_CASA_M_POR_UNIDAD, traza });

export function runCorregirTrazaVerifications() {
  const results: Resultado[] = [];
  const verify = (name: string, run: () => void) => {
    run();
    results.push({ name, status: "passed" });
  };

  verify("mover la esquina: el tramo del medidor la sigue recto y el fin la acompaña", () => {
    const movida = moverQuiebre(CASA, MEDIDOR, 0, { x: 1300, y: 5000 });
    igualPuntos(movida.puntos, [{ x: 1000, y: 5000 }, { x: 8600, y: 5000 }]);
    sigueCompleta(movida);
  });

  verify("agregar un quiebre en un tramo recto no suma codos ni cambia el cálculo", () => {
    const conQuiebre = agregarQuiebre(CASA, MEDIDOR, { x: 3000, y: 4300 });
    igualPuntos(conQuiebre.puntos, [ESQUINA, { x: 3000, y: 4000 }, FIN]);
    const leida = leerTraza(armar(conQuiebre).network, ARTEFACTOS_CASA);
    igual(leida?.puntos.length, 3, "el quiebre se pierde al releer");
    igual(JSON.stringify(calculo(conQuiebre)), JSON.stringify(calculo(CASA)));
  });

  verify("el quiebre agregado se encuentra al tocarlo y se puede arrastrar", () => {
    const conQuiebre = agregarQuiebre(CASA, MEDIDOR, { x: 3000, y: 4300 });
    const red = armar(conQuiebre).network;
    const tramo = red.segments.find((s) => (s.vertices ?? []).some((v) => v.x === 3000));
    if (!tramo) throw new Error("no hay tramo con el quiebre");
    const indice = quiebreDelVertice(conQuiebre, red, tramo.id, tramo.vertices!.findIndex((v) => v.x === 3000));
    igual(indice, 1);
  });

  verify("sacar la esquina deja el caño en escuadra", () => {
    const sinEsquina = sacarQuiebre(CASA, MEDIDOR, 0);
    igualPuntos(sinEsquina.puntos, [{ x: 8600, y: 200 }]);
    sigueCompleta(sinEsquina);
  });

  verify("mover un tramo en paralelo; el que sale del medidor no se mueve así", () => {
    igual(tramoRectoCercano(CASA, MEDIDOR, { x: 5000, y: 3800 }), 1);
    const corrido = moverTramoEnParalelo(CASA, 1, { x: 0, y: 4500 });
    igualPuntos(corrido?.puntos ?? [], [{ x: 1000, y: 4500 }, { x: 8600, y: 4500 }]);
    igual(moverTramoEnParalelo(CASA, 0, { x: 0, y: 4500 }), null);
  });

  verify("arrastrar el punto de salida de una derivación mueve las bajadas que salen de ahí", () => {
    const red = armar(CASA).network;
    const derivacion = red.segments.find((s) => s.toNodeId === "cp:a:ca-cocina")!.fromNodeId;
    const ids = artefactosDeLaDerivacion(red, derivacion);
    igual(ids.join(), "ca-cocina");
    const movida = armar(moverSalida(CASA, ids, { x: 5000, y: 3900 })).network;
    const nueva = movida.segments.find((s) => s.toNodeId === "cp:a:ca-cocina")!;
    igualPuntos([movida.nodes.find((n) => n.id === nueva.fromNodeId)!.position!], [{ x: 5000, y: 4000 }]);
  });

  verify("la punta del caño es una derivación y también un quiebre que se arrastra", () => {
    const red = armar(CASA).network;
    const punta = red.segments.find((s) => s.toNodeId === "cp:a:ca-calefon")!.fromNodeId;
    igual(quiebreDelNodo(CASA, red, punta), 1);
  });

  verify("bajada a mano: en escuadra, con el último codo que pone la app, y se puede volver a la automática", () => {
    const cocina = ARTEFACTOS_CASA.find((a) => a.id === "ca-cocina")!;
    const aMano = bajadaAMano(CASA, cocina, { x: 5000, y: 4000 }, [{ x: 5050, y: 6000 }]);
    igualPuntos(aMano.bajadasAMano["ca-cocina"], [{ x: 5000, y: 6000 }, { x: 6000, y: 6000 }]);
    const red = armar(aMano).network;
    igual(red.segments.some((s) => s.id === "cp:bm:ca-cocina"), true);
    sigueCompleta(aMano);
    igual(JSON.stringify(leerTraza(red, ARTEFACTOS_CASA)?.bajadasAMano), JSON.stringify(aMano.bajadasAMano));
    const vuelta = bajadaAutomatica(aMano, "ca-cocina");
    igual(JSON.stringify(armar(vuelta).network), JSON.stringify(armar(CASA).network));
  });

  return results;
}

function calculo(traza: TrazaCanoPrincipal) {
  const { tablas } = calcularObraDePrueba({
    adoptedDiameterDecisions: [],
    equipment: ARTEFACTOS_CASA,
    network: armar(traza).network,
    nombre: "casa desde cero",
    scaleMetersPerSourceUnit: ESCALA_CASA_M_POR_UNIDAD,
  });
  return { calculo: tablas.calculo.filas, materiales: tablas.materiales.filas };
}

function sigueCompleta(traza: TrazaCanoPrincipal) {
  const { avisos, network } = armar(traza);
  igual(getConnectedApplianceEquipmentIds(network, ARTEFACTOS_CASA).size, 4);
  igual(avisos.length, 0, avisos.join(" / "));
  const { result } = calcularObraDePrueba({
    adoptedDiameterDecisions: [],
    equipment: ARTEFACTOS_CASA,
    network,
    nombre: "casa desde cero",
    scaleMetersPerSourceUnit: ESCALA_CASA_M_POR_UNIDAD,
  });
  igual(result.status, "valid");
}

function igual(actual: unknown, esperado: unknown, detalle = "") {
  if (actual !== esperado) throw new Error(`Se esperaba ${String(esperado)}, dio ${String(actual)}. ${detalle}`);
}

function igualPuntos(actual: Point2D[] | undefined, esperado: Point2D[]) {
  const redondo = (ps: Point2D[] | undefined) => JSON.stringify((ps ?? []).map((p) => [Math.round(p.x), Math.round(p.y)]));
  if (redondo(actual) !== redondo(esperado)) throw new Error(`Se esperaba ${redondo(esperado)}, dio ${redondo(actual)}.`);
}
