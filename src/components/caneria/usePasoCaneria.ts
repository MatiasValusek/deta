"use client";

import { useEffect, useMemo, useState } from "react";
import {
  armarRed,
  enEscuadra,
  leerTraza,
  TRAZA_VACIA,
  type TrazaCanoPrincipal,
} from "@/lib/caneria/canoPrincipal";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { armarRecorridoDirecto, corresponderArmarDirecto } from "@/lib/caneria/recorridoDirecto";
import type { ManualRouteNetwork, RouteDraft } from "@/lib/routing/types";
import type { FormaDeRecorrido } from "./FormaDeRecorrido";

/*
 * Estado del paso Cañería. Con "Directo" (por defecto) la app arma sola el caño principal si
 * todavía no hay uno, y el gasista lo corrige arrastrando: lo que toca queda guardado y la app no
 * lo vuelve a armar (salvo que lo pida con "Volver a armar el recorrido").
 * A mano, cada toque en el plano es un quiebre o el fin del caño principal (en escuadra con el
 * anterior) y la app rearma las bajadas al momento.
 * La red queda guardada en la obra en cada cambio: "Siguiente" no necesita "Terminar".
 */

export function usePasoCaneria(params: {
  activo: boolean;
  baseId: string | null;
  equipment: WorkbenchEquipment[];
  metrosPorUnidad: number | null;
  network: ManualRouteNetwork;
  pdfPageNumber?: number;
  guardarRed: (network: ManualRouteNetwork) => void;
}) {
  const { equipment, network } = params;
  const [corrigiendo, setCorrigiendo] = useState(false);
  /** Por ahora solo "directo" está hecho (Perimetral y Por la pared: "Próximamente"). */
  const [forma, setForma] = useState<FormaDeRecorrido>("directo");
  /** El gasista eligió marcar el caño principal a mano: la app no lo arma sola. */
  const [aMano, setAMano] = useState(false);
  const [cursor, setCursor] = useState<Point2D | null>(null);
  const traza = useMemo(() => leerTraza(network, equipment), [network, equipment]);
  const medidor = equipment.find((item) => item.role === "supply") ?? null;
  const armada = useMemo(
    () =>
      traza
        ? armarRed({ equipment, metrosPorUnidad: params.metrosPorUnidad, pdfPageNumber: params.pdfPageNumber, traza })
        : null,
    [equipment, params.metrosPorUnidad, params.pdfPageNumber, traza],
  );
  /** La red la trazó la pantalla anterior: no se pisa sin que el gasista lo pida. */
  const ajena = traza === null;
  const directo = forma === "directo" && !aMano;
  /** Con Directo, lo armado se corrige arrastrando (no se agregan puntos tocando el plano). */
  const enCorreccion = corrigiendo || (directo && (traza?.puntos.length ?? 0) > 0);
  const marcando = params.activo && !ajena && !enCorreccion && medidor !== null;
  const ultimo = traza?.puntos.at(-1) ?? medidor?.connectionPoint ?? null;
  /** El punto antes del último: con él se sabe hacia dónde venía el caño. */
  const previo = traza && traza.puntos.length > 0 ? (traza.puntos.at(-2) ?? medidor?.connectionPoint) : undefined;

  function guardar(nueva: TrazaCanoPrincipal) {
    params.guardarRed(
      armarRed({ equipment, metrosPorUnidad: params.metrosPorUnidad, pdfPageNumber: params.pdfPageNumber, traza: nueva }).network,
    );
  }

  // La red guardada puede haber quedado vieja (se movió un artefacto): se rearma al entrar.
  const desactualizada =
    params.activo && armada !== null && (traza?.puntos.length ?? 0) > 0 && formaDeLaRed(armada.network) !== formaDeLaRed(network);

  useEffect(() => {
    if (desactualizada && armada) params.guardarRed(armada.network);
    // Solo cuando cambia la forma: guardar la misma red no vuelve a disparar.
  }, [desactualizada]);

  // Directo: sin caño principal, la app lo arma sola. Nunca pisa lo marcado.
  const armarSola = params.activo && directo && corresponderArmarDirecto(traza, equipment);
  useEffect(() => {
    if (!armarSola) return;
    const nueva = armarRecorridoDirecto({ equipment, metrosPorUnidad: params.metrosPorUnidad });
    if (nueva) guardar(nueva);
  }, [armarSola]);

  return {
    ajena,
    avisos: armada?.avisos ?? [],
    corrigiendo: params.activo && enCorreccion,
    directo,
    forma,
    elegirForma(nueva: FormaDeRecorrido) {
      if (nueva !== "directo") return;
      setForma(nueva);
      setAMano(false);
    },
    /** Vuelve a armar el recorrido Directo (se pierde lo corregido). */
    rearmarDirecto() {
      const nueva = armarRecorridoDirecto({ equipment, metrosPorUnidad: params.metrosPorUnidad });
      if (nueva) guardar(nueva);
    },
    /** Deja Directo y marca el caño principal a mano, desde el medidor. */
    marcarAMano() {
      setAMano(true);
      setCorrigiendo(false);
      params.guardarRed({ nodes: [], segments: [] });
    },
    desactualizada,
    marcando,
    puntos: traza?.puntos ?? [],
    traza: traza ?? TRAZA_VACIA,
    /** El tramo que se va a agregar, siguiendo al mouse. */
    borrador:
      marcando && ultimo && cursor && params.baseId
        ? ({
            error: null,
            originNodeId: null,
            originPoint: ultimo,
            originSplitSegmentId: null,
            planBaseId: params.baseId,
            pdfPageNumber: params.pdfPageNumber,
            previewPoint: enEscuadra(ultimo, cursor, previo),
            routePoints: [],
            step: "drawing",
            targetEquipmentId: null,
          } satisfies RouteDraft)
        : null,
    tocarPlano(punto: Point2D) {
      if (!traza || !ultimo) return;
      const nuevo = enEscuadra(ultimo, punto, previo);
      if (Math.hypot(nuevo.x - ultimo.x, nuevo.y - ultimo.y) <= 1e-9) return;
      guardar({ ...traza, puntos: [...traza.puntos, nuevo] });
    },
    mirar: setCursor,
    deshacer() {
      if (traza && traza.puntos.length > 0) guardar({ ...traza, puntos: traza.puntos.slice(0, -1) });
    },
    empezarDeNuevo() {
      setCorrigiendo(false);
      params.guardarRed({ nodes: [], segments: [] });
    },
    rearmar() {
      if (traza) guardar(traza);
    },
    guardar,
    corregir: () => setCorrigiendo(true),
    seguirMarcando: () => {
      setAMano(true);
      setCorrigiendo(false);
    },
  };
}

/** La forma de la red (nodos, tramos y quiebres), sin las piezas que suma el cálculo. */
function formaDeLaRed(network: ManualRouteNetwork) {
  return JSON.stringify([
    network.nodes.map((n) => [n.id, n.equipmentId, n.position?.x, n.position?.y]),
    network.segments.map((s) => [s.id, s.fromNodeId, s.toNodeId, (s.vertices ?? []).map((v) => [v.x, v.y])]),
  ]);
}
