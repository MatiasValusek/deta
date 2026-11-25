import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { numerarPlano } from "@/lib/laminas/numeracionPlano";
import { resolveRouteSegments } from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";

/*
 * Número de cada artefacto en pantalla, con el mismo criterio que el plano: 1 es el más
 * lejano al medidor. Con la cañería trazada se cuenta por la cañería (igual que la lámina);
 * antes, por la distancia en ángulo recto desde el medidor. El medidor es "M".
 */
export function numerarArtefactos(
  equipment: WorkbenchEquipment[],
  network: ManualRouteNetwork,
): Map<string, string> {
  const medidor = equipment.find((item) => item.role === "supply");
  const artefactos = equipment.filter((item) => item.role === "appliance");
  const numeros = new Map<string, string>();

  if (medidor) numeros.set(medidor.id, "M");

  const porCanieria = numerarPorCanieria(equipment, network);
  if (porCanieria && artefactos.every((item) => porCanieria.has(item.id))) {
    for (const item of artefactos) numeros.set(item.id, porCanieria.get(item.id) as string);
    return numeros;
  }

  const desde = medidor?.connectionPoint ?? null;
  const ordenados = artefactos
    .map((item, orden) => ({ distancia: desde ? enAnguloRecto(desde, item.connectionPoint) : 0, item, orden }))
    .sort((a, b) => b.distancia - a.distancia || a.orden - b.orden);

  ordenados.forEach(({ item }, indice) => numeros.set(item.id, String(indice + 1)));
  return numeros;
}

function numerarPorCanieria(equipment: WorkbenchEquipment[], network: ManualRouteNetwork) {
  if (network.segments.length === 0) return null;

  const tramos = resolveRouteSegments(network, equipment).map((tramo) => ({
    fromNodeId: tramo.fromNodeId,
    physicalLengthMeters: largo(tramo.path),
    segmentId: tramo.id,
    toNodeId: tramo.toNodeId,
  }));
  const numeracion = numerarPlano(network, tramos);
  const alcanzados = new Set(tramos.flatMap((tramo) => [tramo.fromNodeId, tramo.toNodeId]));
  const porArtefacto = new Map<string, string>();

  for (const nodo of network.nodes) {
    const numero = numeracion.nodos.get(nodo.id);
    if (nodo.kind === "appliance" && nodo.equipmentId && numero && alcanzados.has(nodo.id)) {
      porArtefacto.set(nodo.equipmentId, numero);
    }
  }

  return porArtefacto;
}

function largo(path: Point2D[]) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

function enAnguloRecto(a: Point2D, b: Point2D) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
