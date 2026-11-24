import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { pointZMeters } from "@/lib/geometry/height";
import type { Point2D } from "@/lib/geometry/types";
import type {
  ManualRouteNetwork,
  RouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import {
  createTechnicalRouteNodeElevationIndex,
  resolveTechnicalRouteSegments,
} from "@/lib/sections/technicalRouteElevation";

/*
 * Codos de las subidas y bajadas (corrección de seguridad).
 *
 * En la planta la traza puede ser recta, pero en obra cada subida o bajada a un artefacto
 * lleva codos, y la salida del medidor también. Si no se cuentan, la longitud equivalente
 * queda corta. Por defecto:
 * - 2 codos en el tramo que llega a cada artefacto (también boca taponada); si la conexión
 *   al artefacto ya trae su codo con rosca hembra, ese cuenta como uno de los 2;
 * - 4 codos a 90° en el primer tramo, a la salida del medidor.
 * Van con el diámetro del tramo. Si ese extremo tiene alturas cargadas por el gasista, se
 * cuentan 2 codos por cada cambio de nivel del tramo en lugar de los fijos (sin contar dos
 * veces). Si el tramo ya trae la pieza con el mismo id (cambiada en Modo experto), se respeta.
 *
 * Codos de cambio de nivel (corrección de seguridad): en los tramos que no llegan al medidor
 * ni a un artefacto, 2 codos a 90° por cada cambio de nivel, con alturas sugeridas o
 * confirmadas (si no, el hueco sigue cuando se acepta una propuesta sin revisar alturas).
 * Si el cambio de nivel arranca justo en una unión donde el detector de giros ya puso un
 * codo, ese codo es uno de los 2.
 */

export const CODOS_POR_SUBIDA = 2;
export const CODOS_SALIDA_MEDIDOR = 4;

const PREFIJO_SUBIDA = "codos-subida:";
const PREFIJO_SALIDA_MEDIDOR = "codos-salida-medidor:";
const PREFIJO_CAMBIO_NIVEL = "codos-cambio-nivel:";
const PREFIJO_DETECTOR = "route-accessory:accessory-proposal:";
const CAMBIO_DE_NIVEL_M = 0.05;
const SIGAS_ID = "sigas-thermofusion";

const codosFinalesDelArtefacto = (segment: RouteSegment) =>
  (segment.accessories ?? [])
    .filter((accessory) => accessory.id.startsWith("route-terminal:") && accessory.type === "elbow")
    .reduce((total, accessory) => total + accessory.quantity, 0);

export type TipoCodosDeSubida = "subida" | "salida_medidor" | "cambio_nivel";

const PREFIJOS: Record<TipoCodosDeSubida, string> = {
  cambio_nivel: PREFIJO_CAMBIO_NIVEL,
  salida_medidor: PREFIJO_SALIDA_MEDIDOR,
  subida: PREFIJO_SUBIDA,
};

export const codosDeSubidaId = (tipo: TipoCodosDeSubida, segmentId: string) =>
  `${PREFIJOS[tipo]}${segmentId}`;

/** Índices i donde la altura cambia entre path[i - 1] y path[i]. */
export function cambiosDeNivelEn(path: Point2D[]): number[] {
  const indices: number[] = [];
  for (let i = 1; i < path.length; i += 1) {
    if (Math.abs(pointZMeters(path[i]) - pointZMeters(path[i - 1])) > CAMBIO_DE_NIVEL_M) {
      indices.push(i);
    }
  }
  return indices;
}

/** Punto donde arranca el primer cambio de nivel del recorrido (para dibujar los codos). */
export function puntoCambioDeNivel(path: Point2D[]): Point2D | null {
  const [primero] = cambiosDeNivelEn(path);
  return primero === undefined ? null : path[primero - 1] ?? null;
}

/** Dice si un accesorio es de subida o de salida del medidor, por su id. */
export function tipoCodosDeSubida(accessoryId: string): TipoCodosDeSubida | null {
  if (accessoryId.startsWith(PREFIJO_SUBIDA)) return "subida";
  if (accessoryId.startsWith(PREFIJO_SALIDA_MEDIDOR)) return "salida_medidor";
  if (accessoryId.startsWith(PREFIJO_CAMBIO_NIVEL)) return "cambio_nivel";
  return null;
}

/** Devuelve la cañería con los codos de subida y de salida del medidor agregados. */
export function agregarCodosDeSubida(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  /** Solo se agregan con SIGAS, que tiene el codo normal a 90° en sus tablas. */
  pipeSystemId?: string;
}): ManualRouteNetwork {
  if (params.pipeSystemId !== undefined && params.pipeSystemId !== SIGAS_ID) {
    return params.network;
  }

  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const elevaciones = createTechnicalRouteNodeElevationIndex(params);
  const recorridos = new Map(
    resolveTechnicalRouteSegments({ ...params, nodeElevationById: elevaciones }).map(
      (segment) => [segment.id, segment],
    ),
  );
  const extremoConAlturas = (nodeId: string, segment: RouteSegment) =>
    elevaciones.get(nodeId)?.verificationStatus === "confirmed" ||
    (segment.vertexElevations ?? []).some((elevation) => elevation?.status === "confirmed");
  const cambiosDeNivel = (segmentId: string) =>
    cambiosDeNivelEn(recorridos.get(segmentId)?.path ?? []).length;
  // Uniones donde el detector de giros ya puso un codo (mide la dirección en 3D).
  const nodosConCodoDelDetector = new Set(
    params.network.segments.flatMap((segment) =>
      (segment.accessories ?? [])
        .filter((a) => a.type === "elbow" && a.id.startsWith(PREFIJO_DETECTOR) && a.quantity > 0)
        .map((a) => a.id.slice(PREFIJO_DETECTOR.length).split(":").slice(0, -2).join(":")),
    ),
  );
  const codosDeCambioDeNivel = (segment: RouteSegment) => {
    const path = recorridos.get(segment.id)?.path ?? [];
    let total = 0;
    for (const i of cambiosDeNivelEn(path)) {
      total += CODOS_POR_SUBIDA;
      if (i - 1 === 0 && nodosConCodoDelDetector.has(segment.fromNodeId)) total -= 1;
      if (i === path.length - 1 && nodosConCodoDelDetector.has(segment.toNodeId)) total -= 1;
    }
    return total;
  };
  const cantidad = (segment: RouteSegment, nodeId: string, fijos: number) =>
    extremoConAlturas(nodeId, segment) ? CODOS_POR_SUBIDA * cambiosDeNivel(segment.id) : fijos;

  return {
    ...params.network,
    segments: params.network.segments.map((segment) => {
      const extremos = [segment.fromNodeId, segment.toNodeId];
      const agregados: RouteSegmentAccessory[] = [];
      const llegaAExtremo = extremos.some((nodeId) => {
        const kind = nodeById.get(nodeId)?.kind;
        return kind === "appliance" || kind === "supply";
      });
      const idCambioNivel = codosDeSubidaId("cambio_nivel", segment.id);
      if (
        !llegaAExtremo &&
        !(segment.accessories ?? []).some((accessory) => accessory.id === idCambioNivel)
      ) {
        const n = codosDeCambioDeNivel(segment);
        if (n > 0) {
          agregados.push({
            catalogFamilyId: "codo-normal-a-90",
            equivalentLengthMetersPerUnit: null,
            equivalentLengthSource: "pipe_system",
            id: idCambioNivel,
            origin: "automatic_confirmed",
            quantity: n,
            segmentId: segment.id,
            type: "elbow",
          });
        }
      }

      for (const nodeId of extremos) {
        const kind = nodeById.get(nodeId)?.kind;
        if (kind !== "appliance" && kind !== "supply") continue;
        const tipo: TipoCodosDeSubida = kind === "supply" ? "salida_medidor" : "subida";
        const id = codosDeSubidaId(tipo, segment.id);
        if ((segment.accessories ?? []).some((accessory) => accessory.id === id)) continue;
        // El codo con rosca hembra que la app ya pone en la conexión al artefacto es uno de los 2.
        const codoFinal = tipo === "subida" ? codosFinalesDelArtefacto(segment) : 0;
        const n =
          cantidad(segment, nodeId, tipo === "subida" ? CODOS_POR_SUBIDA : CODOS_SALIDA_MEDIDOR) -
          codoFinal;
        if (n <= 0) continue;
        agregados.push({
          catalogFamilyId: "codo-normal-a-90",
          equivalentLengthMetersPerUnit: null,
          equivalentLengthSource: "pipe_system",
          id,
          origin: "automatic_confirmed",
          quantity: n,
          segmentId: segment.id,
          type: "elbow",
        });
      }

      return agregados.length > 0
        ? { ...segment, accessories: [...(segment.accessories ?? []), ...agregados] }
        : segment;
    }),
  };
}

/** Igual que tipoCodosDeSubida, pero para ids compuestos (piezas físicas, vistas). */
export function tipoCodosDeSubidaEnId(id: string): TipoCodosDeSubida | null {
  if (id.includes(PREFIJO_SUBIDA)) return "subida";
  if (id.includes(PREFIJO_SALIDA_MEDIDOR)) return "salida_medidor";
  if (id.includes(PREFIJO_CAMBIO_NIVEL)) return "cambio_nivel";
  return null;
}
