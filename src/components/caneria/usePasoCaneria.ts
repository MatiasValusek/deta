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
import type { ManualRouteNetwork, RouteDraft } from "@/lib/routing/types";

/*
 * Estado del paso Cañería. Mientras se marca, cada toque en el plano es un quiebre o el fin
 * del caño principal (en escuadra con el anterior) y la app rearma las bajadas al momento.
 * La red queda guardada en la obra en cada toque: "Siguiente" no necesita "Terminar".
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
  const marcando = params.activo && !ajena && !corrigiendo && medidor !== null;
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
    params.activo && armada !== null && (traza?.puntos.length ?? 0) > 0 && forma(armada.network) !== forma(network);

  useEffect(() => {
    if (desactualizada && armada) params.guardarRed(armada.network);
    // Solo cuando cambia la forma: guardar la misma red no vuelve a disparar.
  }, [desactualizada]);

  return {
    ajena,
    avisos: armada?.avisos ?? [],
    corrigiendo: params.activo && corrigiendo,
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
    seguirMarcando: () => setCorrigiendo(false),
  };
}

/** La forma de la red (nodos, tramos y quiebres), sin las piezas que suma el cálculo. */
function forma(network: ManualRouteNetwork) {
  return JSON.stringify([
    network.nodes.map((n) => [n.id, n.equipmentId, n.position?.x, n.position?.y]),
    network.segments.map((s) => [s.id, s.fromNodeId, s.toNodeId, (s.vertices ?? []).map((v) => [v.x, v.y])]),
  ]);
}
