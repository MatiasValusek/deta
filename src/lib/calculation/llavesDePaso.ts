import { createSuggestedEquipmentTerminalConfig } from "@/lib/equipment/terminalConfig";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  ManualRouteNetwork,
  RouteSegment,
  RouteSegmentAccessory,
} from "@/lib/routing/types";

/*
 * Llaves de paso automáticas, sin pedirle nada al gasista:
 * - una llave general en el tramo que sale del medidor;
 * - una llave antes de cada artefacto (también en boca taponada), en el tramo que llega a él.
 * Son llaves esféricas con el diámetro del tramo: se cuentan en materiales y suman su
 * longitud equivalente de la tabla SIGAS.
 *
 * No dependen de la altura de conexión: si el artefacto no la tiene confirmada, vale la
 * sugerida para su tipo (terminalConfig.ts), que el gasista puede corregir en Artefactos.
 * Si el tramo ya trae una llave (cargada a mano o puesta por la conexión al artefacto con
 * altura confirmada), no se agrega otra. Un artefacto que no lleva llave se marca con
 * requiresShutoffValve = false (Modo experto).
 */

export const FAMILIA_LLAVE = "llave-esferica";
const PREFIJO_LLAVE_GENERAL = "llave-paso-general:";
const PREFIJO_LLAVE_ARTEFACTO = "llave-paso-artefacto:";
const SIGAS_ID = "sigas-thermofusion";

export type TipoLlaveDePaso = "general" | "artefacto";

export const llaveDePasoId = (tipo: TipoLlaveDePaso, segmentId: string) =>
  `${tipo === "general" ? PREFIJO_LLAVE_GENERAL : PREFIJO_LLAVE_ARTEFACTO}${segmentId}`;

/** Dice si una pieza es una llave puesta por la app, por su id (también ids compuestos). */
export function tipoLlaveDePaso(id: string): TipoLlaveDePaso | null {
  if (id.includes(PREFIJO_LLAVE_GENERAL)) return "general";
  if (id.includes(PREFIJO_LLAVE_ARTEFACTO)) return "artefacto";
  return null;
}

const tieneLlave = (segment: RouteSegment) =>
  (segment.accessories ?? []).some((accessory) => accessory.type === "valve" && accessory.quantity > 0);

/** El artefacto lleva llave salvo que se haya marcado lo contrario. */
function artefactoLlevaLlave(item: WorkbenchEquipment | undefined) {
  if (!item) return true;
  const config = item.terminalConfig ?? createSuggestedEquipmentTerminalConfig(item.type);
  return config.requiresShutoffValve !== false;
}

/** Devuelve la cañería con la llave general y una llave por artefacto agregadas. */
export function agregarLlavesDePaso(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  /** Solo con SIGAS, que tiene la llave esférica en sus tablas. */
  pipeSystemId?: string;
}): ManualRouteNetwork {
  if (params.pipeSystemId !== undefined && params.pipeSystemId !== SIGAS_ID) {
    return params.network;
  }

  const nodeById = new Map(params.network.nodes.map((node) => [node.id, node]));
  const equipmentById = new Map(params.equipment.map((item) => [item.id, item]));

  return {
    ...params.network,
    segments: params.network.segments.map((segment) => {
      if (tieneLlave(segment)) return segment;

      const extremos = [segment.fromNodeId, segment.toNodeId].map((id) => nodeById.get(id));
      const aMedidor = extremos.some((node) => node?.kind === "supply");
      const aArtefacto = extremos.some(
        (node) =>
          node?.kind === "appliance" &&
          artefactoLlevaLlave(node.equipmentId ? equipmentById.get(node.equipmentId) : undefined),
      );
      // Un tramo directo medidor → artefacto lleva las dos.
      const tipos: TipoLlaveDePaso[] = [
        ...(aMedidor ? (["general"] as const) : []),
        ...(aArtefacto ? (["artefacto"] as const) : []),
      ];

      if (tipos.length === 0) return segment;

      const llaves = tipos.map(
        (tipo): RouteSegmentAccessory => ({
          catalogFamilyId: FAMILIA_LLAVE,
          equivalentLengthMetersPerUnit: null,
          equivalentLengthSource: "pipe_system",
          id: llaveDePasoId(tipo, segment.id),
          origin: "automatic_confirmed",
          quantity: 1,
          segmentId: segment.id,
          type: "valve",
        }),
      );

      return { ...segment, accessories: [...(segment.accessories ?? []), ...llaves] };
    }),
  };
}

/**
 * Nodos de medidor o artefacto que tienen su llave al lado, según las llaves de la cañería
 * (ya con las automáticas). Sirve para dibujar el símbolo y el "LL.P" solo donde hay llave.
 */
export function nodosConLlave(network: ManualRouteNetwork): Set<string> {
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const nodos = new Set<string>();

  for (const segment of network.segments) {
    if (!tieneLlave(segment)) continue;
    for (const nodeId of [segment.fromNodeId, segment.toNodeId]) {
      const kind = nodeById.get(nodeId)?.kind;
      if (kind === "supply" || kind === "appliance") nodos.add(nodeId);
    }
  }

  return nodos;
}

/** Para las vistas: la llave general va en la salida del medidor; la del artefacto, en su llegada. */
export function extremoDeLlave(id: string): "salida_medidor" | "subida" | null {
  const tipo = tipoLlaveDePaso(id);
  return tipo === "general" ? "salida_medidor" : tipo === "artefacto" ? "subida" : null;
}
