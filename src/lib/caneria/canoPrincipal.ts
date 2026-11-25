import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import type { ManualRouteNetwork, RouteNode, RouteSegment } from "@/lib/routing/types";

/*
 * Cañería en peine, como en los planos presentados: un caño principal que sale del medidor
 * (el gasista marca dónde dobla y dónde termina) y una bajada en ángulo recto a cada artefacto.
 *
 * Lo que marcó el gasista se guarda dentro de la misma red (ids "cp:"), así se puede volver a
 * leer y corregir al reabrir la obra, sin cambiar el formato del guardado:
 * - "cp:m" es el medidor; "cp:d:N", las derivaciones sobre el caño principal; "cp:a:<id>", cada artefacto.
 * - "cp:p:N" son los tramos del caño principal; sus quiebres van como vértices del tramo.
 * - "cp:b:<id>" es la bajada que pone la app; "cp:bs:<id>", una a la que el gasista le movió el punto
 *   de salida; "cp:bm:<id>", una trazada a mano. Solo esas dos guardan su salida al releer.
 */

export type TrazaCanoPrincipal = {
  /** Quiebres y fin del caño principal, en orden desde el medidor. */
  puntos: Point2D[];
  /** Dónde sale la bajada de cada artefacto sobre el caño principal (si el gasista la movió). */
  salidas: Record<string, Point2D>;
  /** Quiebres de las bajadas trazadas a mano, del caño principal hacia el artefacto. */
  bajadasAMano: Record<string, Point2D[]>;
};

export const TRAZA_VACIA: TrazaCanoPrincipal = { bajadasAMano: {}, puntos: [], salidas: {} };

export const ID_MEDIDOR = "cp:m";
export const idArtefacto = (equipmentId: string) => `cp:a:${equipmentId}`;
export type TipoDeBajada = "automatica" | "salidaMovida" | "aMano";
const PREFIJO_BAJADA: Record<TipoDeBajada, string> = { aMano: "bm", automatica: "b", salidaMovida: "bs" };
export const idBajada = (equipmentId: string, tipo: TipoDeBajada = "automatica") =>
  `cp:${PREFIJO_BAJADA[tipo]}:${equipmentId}`;
export const esTramoPrincipal = (segmentId: string) => segmentId.startsWith("cp:p:");

/** Medio metro: una derivación no puede quedar pegada al medidor. */
const DISTANCIA_MINIMA_AL_MEDIDOR_M = 0.3;

export type RedArmada = {
  network: ManualRouteNetwork;
  /** Avisos en lenguaje del gasista: qué pasa y qué hacer. */
  avisos: string[];
};

/** Arma la red en peine a partir de lo marcado. Sin caño principal, no hay tramos. */
export function armarRed(params: {
  equipment: WorkbenchEquipment[];
  metrosPorUnidad: number | null;
  pdfPageNumber?: number;
  traza: TrazaCanoPrincipal;
}): RedArmada {
  const medidor = params.equipment.find((item) => item.role === "supply");
  const artefactos = params.equipment.filter((item) => item.role === "appliance");
  const pagina = params.pdfPageNumber === undefined ? {} : { pdfPageNumber: params.pdfPageNumber };

  if (!medidor) {
    return { avisos: ["Falta ubicar el medidor. Tocá Artefactos y marcalo en el plano."], network: { nodes: [], segments: [] } };
  }

  const linea = [plano(medidor.connectionPoint), ...limpiarPuntos(medidor.connectionPoint, params.traza.puntos)];

  if (linea.length < 2) {
    return {
      avisos: ["Falta el caño principal. Tocá en el plano dónde dobla y dónde termina."],
      network: { nodes: [], segments: [] },
    };
  }

  const largos = largosAcumulados(linea);
  const largoTotal = largos[largos.length - 1];
  const minimo = Math.min(
    largoTotal / 2,
    params.metrosPorUnidad && params.metrosPorUnidad > 0 ? DISTANCIA_MINIMA_AL_MEDIDOR_M / params.metrosPorUnidad : largoTotal / 20,
  );
  const tolerancia = Math.max(largoTotal * 1e-6, 1e-9);

  // Dónde sale cada bajada, medido a lo largo del caño principal desde el medidor.
  const salidas = artefactos.map((artefacto) => {
    const buscado = params.traza.salidas[artefacto.id] ?? artefacto.connectionPoint;
    const cercano = puntoMasCercano(linea, largos, buscado);
    const t = Math.max(cercano.t, minimo);
    return { artefacto, t, ...(t === cercano.t ? cercano : enLinea(linea, largos, t)) };
  });

  // Una derivación por lugar: dos bajadas que salen del mismo punto comparten la te.
  const derivaciones: Array<{ id: string; t: number; punto: Point2D; tramo: number }> = [];
  for (const salida of [...salidas].sort((a, b) => a.t - b.t)) {
    const igual = derivaciones.find((d) => Math.abs(d.t - salida.t) <= tolerancia);
    if (!igual) {
      derivaciones.push({ id: `cp:d:${derivaciones.length + 1}`, punto: salida.punto, t: salida.t, tramo: salida.tramo });
    }
  }

  const nodes: RouteNode[] = [
    { equipmentId: medidor.id, id: ID_MEDIDOR, kind: "supply", origin: "manual", ...pagina },
    ...derivaciones.map((d) => ({ id: d.id, kind: "route" as const, origin: "manual" as const, position: d.punto, ...pagina })),
    ...artefactos.map((a) => ({ equipmentId: a.id, id: idArtefacto(a.id), kind: "appliance" as const, origin: "manual" as const, ...pagina })),
  ];
  const segments: RouteSegment[] = [];

  // Caño principal: del medidor a cada derivación, con los quiebres que quedan en el medio.
  let desde = { id: ID_MEDIDOR, t: 0 };
  derivaciones.forEach((d, indice) => {
    const quiebres = linea.slice(1, -1).filter((_p, i) => largos[i + 1] > desde.t + tolerancia && largos[i + 1] < d.t - tolerancia);
    segments.push({
      fromNodeId: desde.id,
      id: `cp:p:${indice + 1}`,
      origin: "manual",
      toNodeId: d.id,
      ...(quiebres.length > 0 ? { vertices: quiebres } : {}),
    });
    desde = { id: d.id, t: d.t };
  });

  // Bajadas: en ángulo recto desde el caño principal hasta cada artefacto.
  for (const salida of salidas) {
    const derivacion = derivaciones.find((d) => Math.abs(d.t - salida.t) <= tolerancia) ?? derivaciones[0];
    const aMano = params.traza.bajadasAMano[salida.artefacto.id];
    const vertices = aMano ?? bajadaEnEscuadra(derivacion.punto, plano(salida.artefacto.connectionPoint), linea, salida.tramo);
    segments.push({
      fromNodeId: derivacion.id,
      id: idBajada(salida.artefacto.id, aMano ? "aMano" : params.traza.salidas[salida.artefacto.id] ? "salidaMovida" : "automatica"),
      origin: "manual",
      toNodeId: idArtefacto(salida.artefacto.id),
      ...(vertices.length > 0 ? { vertices } : {}),
    });
  }

  const network = { nodes, segments };
  return { avisos: avisosDeCruces(network, params.equipment), network };
}

/** Lee lo marcado desde una red armada por este paso; null si la trazó otra pantalla. */
export function leerTraza(network: ManualRouteNetwork, equipment: WorkbenchEquipment[]): TrazaCanoPrincipal | null {
  if (network.segments.length === 0 && network.nodes.length === 0) return TRAZA_VACIA;
  if (!network.segments.every((s) => s.id.startsWith("cp:")) || !network.nodes.some((n) => n.id === ID_MEDIDOR)) {
    return null;
  }

  const medidor = equipment.find((item) => item.role === "supply");
  const posicion = new Map(network.nodes.flatMap((n) => (n.position ? [[n.id, n.position] as const] : [])));
  const puntos: Point2D[] = [];
  let actual = ID_MEDIDOR;

  for (;;) {
    const tramo = network.segments.find((s) => esTramoPrincipal(s.id) && s.fromNodeId === actual);
    if (!tramo) break;
    puntos.push(...(tramo.vertices ?? []).map(plano));
    const fin = posicion.get(tramo.toNodeId);
    if (fin) puntos.push(plano(fin));
    actual = tramo.toNodeId;
  }

  const salidas: Record<string, Point2D> = {};
  const bajadasAMano: Record<string, Point2D[]> = {};
  for (const tramo of network.segments) {
    const [, tipo, equipmentId] = /^cp:(b|bs|bm):(.+)$/.exec(tramo.id) ?? [];
    if (!equipmentId) continue;
    const desde = posicion.get(tramo.fromNodeId);
    if (desde && tipo !== "b") salidas[equipmentId] = plano(desde);
    if (tipo === "bm") bajadasAMano[equipmentId] = (tramo.vertices ?? []).map(plano);
  }

  return {
    bajadasAMano,
    puntos: medidor ? limpiarPuntos(medidor.connectionPoint, puntos) : puntos,
    salidas,
  };
}

/**
 * El punto tocado, en escuadra con el anterior: el caño principal va recto y dobla a 90°.
 * Se queda con la dirección en la que más se movió.
 */
export function enEscuadra(anterior: Point2D, tocado: Point2D): Point2D {
  return Math.abs(tocado.x - anterior.x) >= Math.abs(tocado.y - anterior.y)
    ? { x: tocado.x, y: anterior.y }
    : { x: anterior.x, y: tocado.y };
}

/** Saca puntos repetidos y los que quedan en línea recta con sus vecinos (no son quiebres). */
export function limpiarPuntos(medidor: Point2D, puntos: Point2D[]): Point2D[] {
  const todos = [plano(medidor), ...puntos.map(plano)];
  const sinRepetir = todos.filter((p, i) => i === 0 || distancia(p, todos[i - 1]) > 1e-9);
  const limpios = sinRepetir.filter((p, i) => {
    if (i === 0 || i === sinRepetir.length - 1) return true;
    const a = sinRepetir[i - 1];
    const b = sinRepetir[i + 1];
    const cruz = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
    const escala = Math.max(distancia(a, p) * distancia(p, b), 1e-12);
    return Math.abs(cruz) / escala > 1e-6;
  });
  return limpios.slice(1);
}

/** Lugar del caño principal más cercano a un punto: a qué distancia del medidor y en qué tramo. */
export function puntoMasCercano(linea: Point2D[], largos: number[], punto: Point2D) {
  let mejor = { distancia: Infinity, punto: linea[0], t: 0, tramo: 0 };
  for (let i = 0; i < linea.length - 1; i += 1) {
    const a = linea[i];
    const b = linea[i + 1];
    const largo = distancia(a, b);
    const f = largo > 0 ? Math.max(0, Math.min(1, ((punto.x - a.x) * (b.x - a.x) + (punto.y - a.y) * (b.y - a.y)) / (largo * largo))) : 0;
    const proyectado = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    const d = distancia(proyectado, punto);
    if (d < mejor.distancia - 1e-9) mejor = { distancia: d, punto: proyectado, t: largos[i] + largo * f, tramo: i };
  }
  return mejor;
}

export function largosAcumulados(linea: Point2D[]) {
  const largos = [0];
  for (let i = 1; i < linea.length; i += 1) largos.push(largos[i - 1] + distancia(linea[i - 1], linea[i]));
  return largos;
}

function enLinea(linea: Point2D[], largos: number[], t: number) {
  for (let i = 0; i < linea.length - 1; i += 1) {
    if (t <= largos[i + 1] || i === linea.length - 2) {
      const largo = largos[i + 1] - largos[i] || 1;
      const f = Math.max(0, Math.min(1, (t - largos[i]) / largo));
      return {
        punto: { x: linea[i].x + (linea[i + 1].x - linea[i].x) * f, y: linea[i].y + (linea[i + 1].y - linea[i].y) * f },
        tramo: i,
      };
    }
  }
  return { punto: linea[linea.length - 1], tramo: linea.length - 2 };
}

/**
 * Bajada de la derivación al artefacto. Si el artefacto queda de frente, va recta; si queda
 * más allá de la punta del caño, sigue la dirección del caño y dobla una vez a 90°.
 */
function bajadaEnEscuadra(desde: Point2D, hasta: Point2D, linea: Point2D[], tramo: number): Point2D[] {
  const tolerancia = Math.max(distancia(desde, hasta) * 1e-6, 1e-9);
  if (Math.abs(desde.x - hasta.x) <= tolerancia || Math.abs(desde.y - hasta.y) <= tolerancia) return [];
  const a = linea[tramo];
  const b = linea[tramo + 1];
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  return [horizontal ? { x: hasta.x, y: desde.y } : { x: desde.x, y: hasta.y }];
}

/** "El caño a la caldera cruza otro caño": bajadas que se cruzan con otro tramo. */
function avisosDeCruces(network: ManualRouteNetwork, equipment: WorkbenchEquipment[]) {
  const posicion = new Map<string, Point2D>();
  for (const n of network.nodes) {
    const p = n.position ?? equipment.find((e) => e.id === n.equipmentId)?.connectionPoint;
    if (p) posicion.set(n.id, plano(p));
  }
  const piernas = network.segments.flatMap((s) => {
    const desde = posicion.get(s.fromNodeId);
    const hasta = posicion.get(s.toNodeId);
    if (!desde || !hasta) return [];
    const camino = [desde, ...(s.vertices ?? []).map(plano), hasta];
    return camino.slice(0, -1).map((p, i) => ({ a: p, b: camino[i + 1], tramo: s }));
  });
  const avisos: string[] = [];

  for (const bajada of network.segments.filter((s) => !esTramoPrincipal(s.id))) {
    const propias = piernas.filter((p) => p.tramo === bajada);
    const cruza = piernas.some(
      (otra) =>
        otra.tramo !== bajada &&
        propias.some((propia) => seCruzan(propia.a, propia.b, otra.a, otra.b)),
    );
    if (cruza) {
      const artefacto = equipment.find((e) => idArtefacto(e.id) === bajada.toNodeId);
      const nombre = artefacto?.name.trim() || "un artefacto";
      avisos.push(`El caño a ${nombre} cruza otro caño. Arrastrá su punto de salida o trazá esa bajada a mano.`);
    }
  }
  return avisos;
}

/** Cruce de verdad: en el medio de los dos tramos, no en una punta compartida. */
function seCruzan(a: Point2D, b: Point2D, c: Point2D, d: Point2D) {
  const orientacion = (p: Point2D, q: Point2D, r: Point2D) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const escala = Math.max(distancia(a, b), distancia(c, d), 1e-9);
  const eps = escala * escala * 1e-9;
  const d1 = orientacion(c, d, a);
  const d2 = orientacion(c, d, b);
  const d3 = orientacion(a, b, c);
  const d4 = orientacion(a, b, d);
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

function distancia(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Solo X e Y: la altura la pone el cálculo. */
function plano(p: Point2D): Point2D {
  return { x: p.x, y: p.y };
}
