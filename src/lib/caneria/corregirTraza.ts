import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import {
  enEscuadra,
  esTramoPrincipal,
  largosAcumulados,
  puntoMasCercano,
  type TrazaCanoPrincipal,
} from "./canoPrincipal";

/*
 * Correcciones del paso Cañería. Todas devuelven lo marcado con el cambio; la red se vuelve a
 * armar con armarRed, así las bajadas, las piezas y la numeración se acomodan solas.
 * El caño principal sigue en escuadra: al mover un quiebre, sus vecinos lo acompañan.
 */

const MISMO_PUNTO = 1e-6;

/** Qué quiebre de lo marcado es el vértice tocado de un tramo del caño principal (o null). */
export function quiebreDelVertice(
  traza: TrazaCanoPrincipal,
  network: ManualRouteNetwork,
  segmentId: string,
  vertexIndex: number,
): number | null {
  if (!esTramoPrincipal(segmentId)) return null;
  const vertice = network.segments.find((s) => s.id === segmentId)?.vertices?.[vertexIndex];
  if (!vertice) return null;
  const indice = traza.puntos.findIndex((p) => Math.hypot(p.x - vertice.x, p.y - vertice.y) <= cercania(traza));
  return indice >= 0 ? indice : null;
}

/** Qué punto de lo marcado está en una derivación del caño (la punta, o una esquina con bajada). */
export function quiebreDelNodo(traza: TrazaCanoPrincipal, network: ManualRouteNetwork, nodeId: string): number | null {
  const posicion = network.nodes.find((n) => n.id === nodeId)?.position;
  if (!posicion) return null;
  const indice = traza.puntos.findIndex((p) => Math.hypot(p.x - posicion.x, p.y - posicion.y) <= cercania(traza));
  return indice >= 0 ? indice : null;
}

/**
 * Mueve un quiebre. Los vecinos lo acompañan para que los tramos sigan rectos; si el vecino es
 * el medidor (no se mueve), el quiebre solo corre a lo largo de ese tramo.
 */
export function moverQuiebre(traza: TrazaCanoPrincipal, medidor: Point2D, indice: number, destino: Point2D): TrazaCanoPrincipal {
  const linea = [medidor, ...traza.puntos];
  const i = indice + 1;
  const nuevo = { ...destino };
  const vecinos = [i - 1, i + 1].filter((j) => j >= 0 && j < linea.length);
  const horizontal = (j: number) => Math.abs(linea[j].y - linea[i].y) <= Math.abs(linea[j].x - linea[i].x);

  if (vecinos.includes(0)) {
    if (horizontal(0)) nuevo.y = linea[0].y;
    else nuevo.x = linea[0].x;
  }

  const movida = [...linea];
  movida[i] = nuevo;
  for (const j of vecinos) {
    if (j === 0) continue;
    movida[j] = horizontal(j) ? { ...linea[j], y: nuevo.y } : { ...linea[j], x: nuevo.x };
  }

  return { ...traza, puntos: movida.slice(1) };
}

/** Agrega un quiebre en el lugar del caño principal más cercano al punto tocado. */
export function agregarQuiebre(traza: TrazaCanoPrincipal, medidor: Point2D, punto: Point2D): TrazaCanoPrincipal {
  const linea = [medidor, ...traza.puntos];
  if (linea.length < 2) return traza;
  const cercano = puntoMasCercano(linea, largosAcumulados(linea), punto);
  const puntos = [...traza.puntos];
  puntos.splice(cercano.tramo, 0, cercano.punto);
  return { ...traza, puntos };
}

/** Saca un quiebre; el punto siguiente se acomoda para que el caño siga en escuadra. */
export function sacarQuiebre(traza: TrazaCanoPrincipal, medidor: Point2D, indice: number): TrazaCanoPrincipal {
  const puntos = traza.puntos.filter((_p, i) => i !== indice);
  if (indice < puntos.length) {
    const anterior = indice === 0 ? medidor : puntos[indice - 1];
    puntos[indice] = enEscuadra(anterior, puntos[indice]);
  }
  return { ...traza, puntos };
}

/** Qué tramo recto del caño principal (contando desde el medidor) está más cerca de un punto. */
export function tramoRectoCercano(traza: TrazaCanoPrincipal, medidor: Point2D, punto: Point2D) {
  const linea = [medidor, ...traza.puntos];
  return linea.length < 2 ? null : puntoMasCercano(linea, largosAcumulados(linea), punto).tramo;
}

/**
 * Mueve en paralelo un tramo recto del caño principal hasta el punto tocado.
 * El que sale del medidor no se puede: el medidor queda fijo (se arrastra su punta).
 */
export function moverTramoEnParalelo(
  traza: TrazaCanoPrincipal,
  tramo: number,
  destino: Point2D,
): TrazaCanoPrincipal | null {
  if (tramo <= 0 || tramo >= traza.puntos.length) return null;
  const a = traza.puntos[tramo - 1];
  const b = traza.puntos[tramo];
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const puntos = [...traza.puntos];
  puntos[tramo - 1] = horizontal ? { ...a, y: destino.y } : { ...a, x: destino.x };
  puntos[tramo] = horizontal ? { ...b, y: destino.y } : { ...b, x: destino.x };
  // El vecino de cada punta queda en escuadra solo: su tramo es perpendicular.
  return { ...traza, puntos };
}

/** La bajada de un artefacto sale de otro lugar del caño principal. */
export function moverSalida(traza: TrazaCanoPrincipal, equipmentIds: string[], destino: Point2D): TrazaCanoPrincipal {
  const salidas = { ...traza.salidas };
  for (const id of equipmentIds) salidas[id] = { x: destino.x, y: destino.y };
  return { ...traza, salidas };
}

/** Artefactos cuyas bajadas salen de una derivación. */
export function artefactosDeLaDerivacion(network: ManualRouteNetwork, nodeId: string) {
  return network.segments
    .filter((s) => s.fromNodeId === nodeId && !esTramoPrincipal(s.id))
    .map((s) => /^cp:(?:b|bs|bm):(.+)$/.exec(s.id)?.[1])
    .filter((id): id is string => Boolean(id));
}

/**
 * Bajada trazada a mano: los quiebres que tocó el gasista, en escuadra. Si el último no queda
 * de frente al artefacto, la app agrega el último codo.
 */
export function bajadaAMano(
  traza: TrazaCanoPrincipal,
  artefacto: WorkbenchEquipment,
  salida: Point2D,
  quiebres: Point2D[],
): TrazaCanoPrincipal {
  const vertices: Point2D[] = [];
  let anterior = salida;
  for (const q of quiebres) {
    const enLinea = enEscuadra(anterior, q);
    vertices.push(enLinea);
    anterior = enLinea;
  }
  const destino = artefacto.connectionPoint;
  if (Math.abs(anterior.x - destino.x) > MISMO_PUNTO && Math.abs(anterior.y - destino.y) > MISMO_PUNTO) {
    const ultimoHorizontal =
      vertices.length === 0
        ? false
        : Math.abs((vertices.at(-2) ?? salida).y - anterior.y) <= MISMO_PUNTO;
    vertices.push(ultimoHorizontal ? { x: anterior.x, y: destino.y } : { x: destino.x, y: anterior.y });
  }
  return {
    ...traza,
    bajadasAMano: { ...traza.bajadasAMano, [artefacto.id]: vertices },
    salidas: { ...traza.salidas, [artefacto.id]: salida },
  };
}

/** Vuelve la bajada a la que pone la app. */
export function bajadaAutomatica(traza: TrazaCanoPrincipal, equipmentId: string): TrazaCanoPrincipal {
  const { [equipmentId]: _mano, ...bajadasAMano } = traza.bajadasAMano;
  const { [equipmentId]: _salida, ...salidas } = traza.salidas;
  return { ...traza, bajadasAMano, salidas };
}

function cercania(traza: TrazaCanoPrincipal) {
  const xs = traza.puntos.map((p) => Math.abs(p.x) + Math.abs(p.y));
  return Math.max(1e-6, Math.max(0, ...xs) * 1e-9);
}
