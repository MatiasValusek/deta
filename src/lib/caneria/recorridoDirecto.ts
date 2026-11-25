import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { resolveRouteSegments } from "@/lib/routing/network";
import { armarRed, TRAZA_VACIA, type TrazaCanoPrincipal } from "./canoPrincipal";

/*
 * Forma "Directo": la app arma sola el caño principal, cruzando por el medio de los ambientes y
 * solo a 90°. Sale del medidor, va derecho hasta la línea del caño principal y la recorre hasta el
 * último artefacto; las bajadas en L las pone armarRed, como siempre.
 *
 * Se prueban caños principales horizontales y verticales, a la altura de cada artefacto, del
 * medidor y de la mediana (la que hace más cortas las bajadas), hacia los dos lados. Gana el que
 * suma menos caño en total sin bajadas que se crucen; si empatan, el de menos quiebres y el más
 * cerca del medio de los artefactos.
 *
 * No mira paredes: con PDF no hay, y "Directo" cruza los ambientes. El gasista corrige
 * arrastrando los quiebres; lo que toca se guarda en la traza y la app no lo vuelve a armar.
 */

type Candidato = { cruces: number; largo: number; puntos: Point2D[]; alMedio: number };

export function armarRecorridoDirecto(params: {
  equipment: WorkbenchEquipment[];
  metrosPorUnidad: number | null;
}): TrazaCanoPrincipal | null {
  const medidor = params.equipment.find((item) => item.role === "supply");
  const artefactos = params.equipment.filter((item) => item.role === "appliance");
  if (!medidor || artefactos.length === 0) return null;

  const m = plano(medidor.connectionPoint);
  const puntosArtefactos = artefactos.map((a) => plano(a.connectionPoint));
  const candidatos: Candidato[] = [];

  for (const horizontal of [true, false]) {
    // a: a lo largo del caño principal; p: de costado.
    const a = (q: Point2D) => (horizontal ? q.x : q.y);
    const p = (q: Point2D) => (horizontal ? q.y : q.x);
    const punto = (alLargo: number, deCostado: number) => (horizontal ? { x: alLargo, y: deCostado } : { x: deCostado, y: alLargo });
    const costados = puntosArtefactos.map(p);
    const medio = (Math.min(...costados) + Math.max(...costados)) / 2;
    const alturas = unicos([...costados, p(m), mediana(costados)]);
    const puntas = unicos([Math.min(...puntosArtefactos.map(a)), Math.max(...puntosArtefactos.map(a))]);

    for (const altura of alturas) {
      for (const punta of puntas) {
        const puntos: Point2D[] = [];
        if (Math.abs(altura - p(m)) > 1e-9) puntos.push(punto(a(m), altura));
        if (Math.abs(punta - a(m)) > 1e-9) puntos.push(punto(punta, altura));
        if (puntos.length === 0) continue;
        const traza = { ...TRAZA_VACIA, puntos };
        const armada = armarRed({ equipment: params.equipment, metrosPorUnidad: params.metrosPorUnidad, traza });
        candidatos.push({
          alMedio: Math.abs(altura - medio),
          cruces: armada.avisos.length,
          largo: largoTotal(armada.network, params.equipment),
          puntos,
        });
      }
    }
  }

  const escala = Math.max(1e-9, ...candidatos.map((c) => c.largo));
  const empate = escala * 1e-6;
  candidatos.sort(
    (x, y) =>
      x.cruces - y.cruces ||
      (Math.abs(x.largo - y.largo) > empate ? x.largo - y.largo : 0) ||
      x.puntos.length - y.puntos.length ||
      x.alMedio - y.alMedio,
  );
  const mejor = candidatos[0];
  return mejor ? { ...TRAZA_VACIA, puntos: mejor.puntos } : null;
}

/** La app arma el recorrido sola solo si todavía no hay caño principal (nunca pisa lo marcado). */
export function corresponderArmarDirecto(traza: TrazaCanoPrincipal | null, equipment: WorkbenchEquipment[]) {
  return (
    traza !== null &&
    traza.puntos.length === 0 &&
    Object.keys(traza.bajadasAMano).length === 0 &&
    equipment.some((item) => item.role === "supply") &&
    equipment.some((item) => item.role === "appliance")
  );
}

function largoTotal(network: Parameters<typeof resolveRouteSegments>[0], equipment: WorkbenchEquipment[]) {
  return resolveRouteSegments(network, equipment).reduce(
    (total, tramo) => total + tramo.path.slice(1).reduce((suma, q, i) => suma + Math.hypot(q.x - tramo.path[i].x, q.y - tramo.path[i].y), 0),
    0,
  );
}

function mediana(valores: number[]) {
  const orden = [...valores].sort((x, y) => x - y);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
}

function unicos(valores: number[]) {
  return valores.filter((v, i) => valores.findIndex((w) => Math.abs(w - v) <= 1e-9) === i);
}

function plano(q: Point2D): Point2D {
  return { x: q.x, y: q.y };
}
