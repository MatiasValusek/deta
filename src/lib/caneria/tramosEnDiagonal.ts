import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { resolveRouteSegments } from "@/lib/routing/network";
import type { ManualRouteNetwork } from "@/lib/routing/types";

/*
 * Tramos en diagonal. En obra el caño embutido va vertical, horizontal o paralelo a las paredes
 * y no se curva (NAG-200, 4.7.1.9 y 4.7.2.2 a); Deta, por ahora, traza todo a 90°. Las obras
 * cargadas antes pueden traer tramos en diagonal: no se borran, se avisan.
 *
 * Un pedazo que se aparta menos de 10° de horizontal o vertical es un error de dibujo (se toma
 * como recto, igual que el cálculo y los codos), no una diagonal.
 */

const GRADOS_ERROR_DE_DIBUJO = 10;

export const AVISO_TRAMOS_EN_DIAGONAL =
  "Hay tramos en diagonal: en obra van a 90°. Tocá Cañería y marcalos de nuevo en escuadra.";

/** Ids de los tramos con algún pedazo en diagonal. */
export function tramosEnDiagonal(network: ManualRouteNetwork, equipment: WorkbenchEquipment[]): string[] {
  return resolveRouteSegments(network, equipment)
    .filter((tramo) => tramo.path.some((p, i) => i > 0 && enDiagonal(tramo.path[i - 1], p)))
    .map((tramo) => tramo.id);
}

function enDiagonal(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (Math.hypot(dx, dy) <= 1e-9) return false;
  const respectoDelEje = (Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180) / Math.PI;
  return respectoDelEje >= GRADOS_ERROR_DE_DIBUJO;
}
