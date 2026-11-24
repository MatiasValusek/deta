import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { pointZMeters } from "@/lib/geometry/height";
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
 */

export const CODOS_POR_SUBIDA = 2;
export const CODOS_SALIDA_MEDIDOR = 4;

const PREFIJO_SUBIDA = "codos-subida:";
const PREFIJO_SALIDA_MEDIDOR = "codos-salida-medidor:";
const CAMBIO_DE_NIVEL_M = 0.05;
const SIGAS_ID = "sigas-thermofusion";

const codosFinalesDelArtefacto = (segment: RouteSegment) =>
  (segment.accessories ?? [])
    .filter((accessory) => accessory.id.startsWith("route-terminal:") && accessory.type === "elbow")
    .reduce((total, accessory) => total + accessory.quantity, 0);

export type TipoCodosDeSubida = "subida" | "salida_medidor";

export const codosDeSubidaId = (tipo: TipoCodosDeSubida, segmentId: string) =>
  `${tipo === "subida" ? PREFIJO_SUBIDA : PREFIJO_SALIDA_MEDIDOR}${segmentId}`;

/** Dice si un accesorio es de subida o de salida del medidor, por su id. */
export function tipoCodosDeSubida(accessoryId: string): TipoCodosDeSubida | null {
  if (accessoryId.startsWith(PREFIJO_SUBIDA)) return "subida";
  if (accessoryId.startsWith(PREFIJO_SALIDA_MEDIDOR)) return "salida_medidor";
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
  const cambiosDeNivel = (segmentId: string) => {
    const recorrido = recorridos.get(segmentId);
    const alturas = recorrido?.path.map((point) => pointZMeters(point)) ?? [];
    let cambios = 0;
    for (let i = 1; i < alturas.length; i += 1) {
      if (Math.abs(alturas[i] - alturas[i - 1]) > CAMBIO_DE_NIVEL_M) cambios += 1;
    }
    return cambios;
  };
  const cantidad = (segment: RouteSegment, nodeId: string, fijos: number) =>
    extremoConAlturas(nodeId, segment) ? CODOS_POR_SUBIDA * cambiosDeNivel(segment.id) : fijos;

  return {
    ...params.network,
    segments: params.network.segments.map((segment) => {
      const extremos = [segment.fromNodeId, segment.toNodeId];
      const agregados: RouteSegmentAccessory[] = [];

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
  return null;
}
