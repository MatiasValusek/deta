"use client";

import { useState } from "react";
import { esTramoPrincipal, type TrazaCanoPrincipal } from "@/lib/caneria/canoPrincipal";
import {
  agregarQuiebre,
  artefactosDeLaDerivacion,
  bajadaAMano,
  bajadaAutomatica,
  moverQuiebre,
  moverSalida,
  moverTramoEnParalelo,
  quiebreDelNodo,
  quiebreDelVertice,
  sacarQuiebre,
  tramoRectoCercano,
} from "@/lib/caneria/corregirTraza";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import type { PhysicalRouteEditSelection } from "@/lib/routing/physicalRouteEditing";
import type { ManualRouteNetwork } from "@/lib/routing/types";

/*
 * Correcciones del caño principal y de las bajadas: arrastrar (lo maneja el dibujo de la
 * cañería) y las acciones que necesitan un botón o un toque más.
 */

export type SeleccionCaneria =
  | { tipo: "quiebre"; indice: number }
  | { tipo: "derivacion" }
  | { tipo: "tramo"; tramo: number; punto: Point2D }
  | { tipo: "bajada"; equipmentId: string; aMano: boolean };

type Espera =
  | { tipo: "moverTramo"; tramo: number }
  | { tipo: "bajada"; equipmentId: string; salida: Point2D; quiebres: Point2D[] };

export function useCorreccionCaneria(params: {
  activa: boolean;
  cursor: Point2D | null;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  traza: TrazaCanoPrincipal;
  guardar: (traza: TrazaCanoPrincipal) => void;
}) {
  const { equipment, network, traza, guardar } = params;
  const [seleccion, setSeleccion] = useState<SeleccionCaneria | null>(null);
  const [edicion, setEdicion] = useState<PhysicalRouteEditSelection | null>(null);
  const [espera, setEspera] = useState<Espera | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const medidor = equipment.find((item) => item.role === "supply")?.connectionPoint ?? null;
  const posicion = (nodeId: string) => network.nodes.find((n) => n.id === nodeId)?.position ?? null;
  const artefactoDeBajada = (segmentId: string) => /^cp:(?:b|bs|bm):(.+)$/.exec(segmentId)?.[1] ?? null;

  function limpiar() {
    setSeleccion(null);
    setEdicion(null);
    setEspera(null);
    setAviso(null);
  }

  return {
    activa: params.activa,
    aviso,
    edicion: params.activa ? edicion : null,
    espera: params.activa ? espera : null,
    /** El plano espera un toque (mover un tramo o marcar una bajada a mano). */
    esperaToque: params.activa && espera !== null,
    seleccion: params.activa ? seleccion : null,
    limpiar,

    seleccionar(elegido: PhysicalRouteEditSelection) {
      setEdicion(elegido);
      setAviso(null);
      if (elegido.kind === "vertex") {
        const indice = quiebreDelVertice(traza, network, elegido.segmentId, elegido.vertexIndex);
        setSeleccion(indice === null ? null : { indice, tipo: "quiebre" });
      } else if (elegido.kind === "node") {
        const indice = quiebreDelNodo(traza, network, elegido.nodeId);
        setSeleccion(indice === null ? { tipo: "derivacion" } : { indice, tipo: "quiebre" });
      } else if (elegido.kind === "segment") {
        const equipmentId = artefactoDeBajada(elegido.segmentId);
        if (equipmentId) {
          setSeleccion({ aMano: elegido.segmentId.startsWith("cp:bm:"), equipmentId, tipo: "bajada" });
        } else if (medidor && params.cursor && esTramoPrincipal(elegido.segmentId)) {
          const tramo = tramoRectoCercano(traza, medidor, params.cursor);
          setSeleccion(tramo === null ? null : { punto: params.cursor, tipo: "tramo", tramo });
        }
      }
    },

    /** Arrastrar un nodo: una esquina o la punta se mueven; una derivación corre por el caño. */
    moverNodo(nodeId: string, destino: Point2D) {
      if (!medidor) return;
      const indice = quiebreDelNodo(traza, network, nodeId);
      if (indice !== null) guardar(moverQuiebre(traza, medidor, indice, destino));
      else guardar(moverSalida(traza, artefactosDeLaDerivacion(network, nodeId), destino));
    },

    /** Arrastrar un quiebre: del caño principal, o de una bajada (pasa a ser a mano). */
    moverVertice(segmentId: string, vertexIndex: number, destino: Point2D) {
      if (!medidor) return;
      const indice = quiebreDelVertice(traza, network, segmentId, vertexIndex);
      if (indice !== null) {
        guardar(moverQuiebre(traza, medidor, indice, destino));
        return;
      }
      const equipmentId = artefactoDeBajada(segmentId);
      const tramo = network.segments.find((s) => s.id === segmentId);
      const artefacto = equipment.find((e) => e.id === equipmentId);
      const salida = tramo ? posicion(tramo.fromNodeId) : null;
      if (!artefacto || !tramo || !salida) return;
      const quiebres = (tramo.vertices ?? []).map((v, i) => (i === vertexIndex ? destino : v));
      guardar(bajadaAMano(traza, artefacto, salida, quiebres));
    },

    /** Doble toque sobre el caño principal: un quiebre nuevo ahí. */
    insertarVertice(segmentId: string, punto: Point2D) {
      if (medidor && esTramoPrincipal(segmentId)) guardar(agregarQuiebre(traza, medidor, punto));
    },

    agregarQuiebreAca() {
      if (medidor && seleccion?.tipo === "tramo") {
        guardar(agregarQuiebre(traza, medidor, seleccion.punto));
        limpiar();
      }
    },
    sacarQuiebre() {
      if (medidor && seleccion?.tipo === "quiebre") {
        guardar(sacarQuiebre(traza, medidor, seleccion.indice));
        limpiar();
      }
    },
    moverTramo() {
      if (seleccion?.tipo === "tramo") setEspera({ tipo: "moverTramo", tramo: seleccion.tramo });
    },
    trazarBajadaAMano() {
      if (seleccion?.tipo !== "bajada") return;
      const tramo = network.segments.find((s) => artefactoDeBajada(s.id) === seleccion.equipmentId);
      const salida = tramo ? posicion(tramo.fromNodeId) : null;
      if (salida) setEspera({ equipmentId: seleccion.equipmentId, quiebres: [], salida, tipo: "bajada" });
    },
    volverABajadaAutomatica() {
      if (seleccion?.tipo === "bajada") {
        guardar(bajadaAutomatica(traza, seleccion.equipmentId));
        limpiar();
      }
    },
    terminarBajada() {
      const artefacto = espera?.tipo === "bajada" ? equipment.find((e) => e.id === espera.equipmentId) : null;
      if (espera?.tipo === "bajada" && artefacto) guardar(bajadaAMano(traza, artefacto, espera.salida, espera.quiebres));
      limpiar();
    },
    cancelar: limpiar,

    tocarPlano(punto: Point2D) {
      if (espera?.tipo === "moverTramo") {
        const corrido = moverTramoEnParalelo(traza, espera.tramo, punto);
        if (corrido) {
          guardar(corrido);
          limpiar();
        } else {
          setEspera(null);
          setAviso("El tramo que sale del medidor no se mueve en paralelo: arrastrá su punta.");
        }
      } else if (espera?.tipo === "bajada") {
        setEspera({ ...espera, quiebres: [...espera.quiebres, punto] });
      }
    },
  };
}
