import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { resolveRouteSegments } from "@/lib/routing/network";
import type {
  ManualRouteNetwork,
  RouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";

/*
 * Tes y codos automáticos, sin que el gasista confirme nada:
 * - Te en toda derivación (nodo con 3 tramos). Va en cada tramo que sale del nodo, "a 90°" o
 *   "a través" según el recorrido, así cada recorrido suma la te que le toca; en materiales es
 *   una sola pieza por nodo. Donde la derivación cambia de medida, el motor ya cuenta te normal
 *   + cupla y deja de lado esta te (technicalNetworkSizingWithTransitions): no se cuenta dos veces.
 * - Codo en todo cambio de dirección en planta: en la unión de dos tramos que giran (esquina del
 *   caño principal) y en cada quiebre dentro de un tramo. Con el diámetro del tramo.
 *
 * Usan el mismo id que las piezas que propone la app ("route-accessory:accessory-proposal:
 * <nodo>:<tipo>:<tramo>"), así se ubican en el dibujo y se reconocen en el resto del motor.
 * No se agregan si el gasista ya cargó la pieza de ese nodo, ni codos en un tramo donde el
 * gasista cargó codos a mano (se entiende que ya contó los giros de ese tramo).
 */

const PREFIJO = "route-accessory:accessory-proposal:";
const PREFIJO_QUIEBRE = "codo-quiebre:";
const SIGAS_ID = "sigas-thermofusion";
/** Menos de 10° de giro se toma como recto. */
const COS_RECTO = Math.cos((10 * Math.PI) / 180);
/** Para "a través": la salida sigue a la entrada con menos de 30° de desvío. */
const COS_A_TRAVES = Math.cos((30 * Math.PI) / 180);

/** El último pedazo del id no puede llevar ":" (el nodo se lee sacando los dos últimos). */
const sinDosPuntos = (texto: string) => texto.replaceAll(":", "_");

export const teAutomaticaId = (nodeId: string, segmentId: string) =>
  `${PREFIJO}${nodeId}:tee:${sinDosPuntos(segmentId)}`;
export const codoAutomaticoId = (nodeId: string, segmentId: string) =>
  `${PREFIJO}${nodeId}:elbow:${sinDosPuntos(segmentId)}`;
export const codoDeQuiebreId = (segmentId: string, indice: number) =>
  `${PREFIJO_QUIEBRE}${segmentId}:${indice}`;

/** Punto del quiebre de un codo dentro de un tramo, por su id (null si no es de quiebre). */
export function quiebreDeCodo(id: string, path: Point2D[]): Point2D | null {
  const inicio = id.indexOf(PREFIJO_QUIEBRE);
  if (inicio < 0) return null;
  const indice = Number(id.slice(inicio + PREFIJO_QUIEBRE.length).split(":").at(-1));
  return Number.isInteger(indice) ? limpiar(path)[indice] ?? null : null;
}

type Vector = { x: number; y: number };

const unitario = (desde: Point2D, hasta: Point2D): Vector | null => {
  const dx = hasta.x - desde.x;
  const dy = hasta.y - desde.y;
  const largo = Math.hypot(dx, dy);
  return largo > 1e-9 ? { x: dx / largo, y: dy / largo } : null;
};
const producto = (a: Vector, b: Vector) => a.x * b.x + a.y * b.y;

/** Puntos del recorrido sin repetidos consecutivos. */
function limpiar(path: Point2D[]) {
  return path.filter(
    (punto, i) => i === 0 || Math.hypot(punto.x - path[i - 1].x, punto.y - path[i - 1].y) > 1e-9,
  );
}

const pieza = (
  segmentId: string,
  id: string,
  type: "tee" | "elbow",
  catalogFamilyId: string,
): RouteSegmentAccessory => ({
  catalogFamilyId,
  equivalentLengthMetersPerUnit: null,
  equivalentLengthSource: "pipe_system",
  id,
  origin: "automatic_confirmed",
  quantity: 1,
  segmentId,
  type,
});

/** Codos que el gasista cargó a mano (no los que pone la app). */
const esCodoAMano = (accessory: RouteSegmentAccessory) =>
  accessory.type === "elbow" &&
  !accessory.id.startsWith(PREFIJO) &&
  !accessory.id.startsWith(PREFIJO_QUIEBRE) &&
  !accessory.id.startsWith("codos-subida:") &&
  !accessory.id.startsWith("codos-salida-medidor:") &&
  !accessory.id.startsWith("codos-cambio-nivel:") &&
  !accessory.id.startsWith("route-terminal:");

/** Devuelve la cañería con las tes de las derivaciones y los codos de los giros agregados. */
export function agregarTesYCodos(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  /** Solo con SIGAS, que tiene la te normal y el codo a 90° en sus tablas. */
  pipeSystemId?: string;
}): ManualRouteNetwork {
  if (params.pipeSystemId !== undefined && params.pipeSystemId !== SIGAS_ID) {
    return params.network;
  }

  const { network } = params;
  const caminoPorTramo = new Map(
    resolveRouteSegments(network, params.equipment).map((tramo) => [tramo.id, limpiar(tramo.path)]),
  );
  const tramosDelNodo = new Map<string, RouteSegment[]>();
  for (const segment of network.segments) {
    for (const nodeId of [segment.fromNodeId, segment.toNodeId]) {
      tramosDelNodo.set(nodeId, [...(tramosDelNodo.get(nodeId) ?? []), segment]);
    }
  }

  // Tramo de entrada de cada nodo, recorriendo desde el medidor.
  const entrada = new Map<string, RouteSegment>();
  const medidor = network.nodes.find((node) => node.kind === "supply");
  const visitados = new Set<string>(medidor ? [medidor.id] : []);
  const cola = medidor ? [medidor.id] : [];
  while (cola.length > 0) {
    const nodeId = cola.shift() as string;
    for (const segment of tramosDelNodo.get(nodeId) ?? []) {
      const vecino = segment.fromNodeId === nodeId ? segment.toNodeId : segment.fromNodeId;
      if (visitados.has(vecino)) continue;
      visitados.add(vecino);
      entrada.set(vecino, segment);
      cola.push(vecino);
    }
  }

  /** Sentido en que el tramo sale del nodo (en planta). */
  const salidaDesde = (segment: RouteSegment, nodeId: string): Vector | null => {
    const camino = caminoPorTramo.get(segment.id) ?? [];
    if (camino.length < 2) return null;
    return segment.fromNodeId === nodeId
      ? unitario(camino[0], camino[1])
      : unitario(camino[camino.length - 1], camino[camino.length - 2]);
  };
  const piezaDelNodoCargada = (nodeId: string, tipo: "tee" | "elbow") =>
    network.segments.some((segment) =>
      (segment.accessories ?? []).some((accessory) =>
        accessory.id.includes(`accessory-proposal:${nodeId}:${tipo}:`),
      ),
    );
  const conCodosAMano = new Set(
    network.segments
      .filter((segment) => (segment.accessories ?? []).some(esCodoAMano))
      .map((segment) => segment.id),
  );

  const agregados = new Map<string, RouteSegmentAccessory[]>();
  const agregar = (accessory: RouteSegmentAccessory) =>
    agregados.set(accessory.segmentId, [...(agregados.get(accessory.segmentId) ?? []), accessory]);

  for (const node of network.nodes) {
    if (node.kind !== "route") continue;
    const tramos = tramosDelNodo.get(node.id) ?? [];
    const llega = entrada.get(node.id);
    if (!llega) continue;
    const salen = tramos.filter((segment) => segment.id !== llega.id);
    const sentidoEntrada = salidaDesde(llega, node.id);

    if (tramos.length === 3 && !piezaDelNodoCargada(node.id, "tee")) {
      // Hay que distinguir "a través" (sigue derecho) de "a 90°" (dobla).
      for (const sale of salen) {
        const sentido = salidaDesde(sale, node.id);
        const aTraves =
          sentido !== null && sentidoEntrada !== null && producto(sentido, sentidoEntrada) < -COS_A_TRAVES;
        agregar(
          pieza(
            sale.id,
            teAutomaticaId(node.id, sale.id),
            "tee",
            aTraves ? "te-normal-flujo-a-traves" : "te-normal-flujo-a-90",
          ),
        );
      }
    }

    if (tramos.length === 2 && salen.length === 1 && !piezaDelNodoCargada(node.id, "elbow")) {
      const sale = salen[0];
      const sentido = salidaDesde(sale, node.id);
      const gira =
        sentido !== null && sentidoEntrada !== null && producto(sentido, sentidoEntrada) > -COS_RECTO;
      if (gira && !conCodosAMano.has(sale.id) && !conCodosAMano.has(llega.id)) {
        agregar(pieza(sale.id, codoAutomaticoId(node.id, sale.id), "elbow", "codo-normal-a-90"));
      }
    }
  }

  // Quiebres dentro de cada tramo.
  for (const segment of network.segments) {
    if (conCodosAMano.has(segment.id)) continue;
    const camino = caminoPorTramo.get(segment.id) ?? [];
    for (let i = 1; i < camino.length - 1; i += 1) {
      const antes = unitario(camino[i - 1], camino[i]);
      const despues = unitario(camino[i], camino[i + 1]);
      if (antes && despues && producto(antes, despues) < COS_RECTO) {
        agregar(pieza(segment.id, codoDeQuiebreId(segment.id, i), "elbow", "codo-normal-a-90"));
      }
    }
  }

  if (agregados.size === 0) return network;

  return {
    ...network,
    segments: network.segments.map((segment) => {
      const nuevos = (agregados.get(segment.id) ?? []).filter(
        (accessory) => !(segment.accessories ?? []).some((actual) => actual.id === accessory.id),
      );
      return nuevos.length > 0
        ? { ...segment, accessories: [...(segment.accessories ?? []), ...nuevos] }
        : segment;
    }),
  };
}

/** Nodo de una te o un codo de la app, leído del id de la pieza (también ids compuestos). */
export function nodoDePieza(pieza: { id: string; sourceIds?: string[] }): string | null {
  for (const id of [pieza.id, ...(pieza.sourceIds ?? [])]) {
    const te = id.indexOf("tee-node:");
    if (te >= 0) return id.slice(te + "tee-node:".length) || null;
    const marca = id.indexOf("accessory-proposal:");
    if (marca < 0) continue;
    const partes = id.slice(marca + "accessory-proposal:".length).split(":");
    if (partes.length >= 3) return partes.slice(0, -2).join(":") || null;
  }
  return null;
}

/** Punto del quiebre para un codo de quiebre, con el recorrido del tramo (null si no es). */
export function quiebreDePieza(pieza: { id: string; sourceIds?: string[] }, path: Point2D[]) {
  for (const id of [pieza.id, ...(pieza.sourceIds ?? [])]) {
    const punto = quiebreDeCodo(id, path);
    if (punto) return punto;
  }
  return null;
}
