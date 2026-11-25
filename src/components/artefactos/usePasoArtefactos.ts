"use client";

import { useEffect, useMemo, useState } from "react";
import { crearArtefacto, moverArtefacto, type PlanoParaUbicar } from "@/lib/artefactos/colocarArtefacto";
import { numerarArtefactos } from "@/lib/artefactos/numerarArtefactos";
import type { EquipmentType, WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";

/*
 * Estado del paso Artefactos: qué botón está elegido y qué pasa al tocar el plano.
 * El botón queda elegido para marcar varios del mismo tipo; el medidor se suelta solo
 * (hay uno). Al entrar al paso sin medidor, Medidor ya viene elegido.
 */

export type Herramienta = { tipo: EquipmentType } | { moverId: string };

export function usePasoArtefactos(params: {
  activo: boolean;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  plano: PlanoParaUbicar | null;
  guardar: (equipment: WorkbenchEquipment[], seleccionadoId: string | null) => void;
}) {
  const { activo, equipment, plano, guardar } = params;
  const [herramienta, setHerramienta] = useState<Herramienta | null>(null);
  const hayMedidor = equipment.some((item) => item.role === "supply");

  // Al entrar al paso, Medidor elegido si falta; al salir, nada elegido.
  useEffect(() => {
    setHerramienta(activo && !hayMedidor ? { tipo: "meter_regulator" } : null);
    // Solo al entrar o salir del paso: después, el gasista elige.
  }, [activo]);

  const numeros = useMemo(() => numerarArtefactos(equipment, params.network), [equipment, params.network]);

  function tocarPlano(punto: Point2D) {
    if (!plano || !herramienta) return;

    if ("moverId" in herramienta) {
      const artefacto = equipment.find((item) => item.id === herramienta.moverId);
      if (artefacto) {
        guardar(
          equipment.map((item) => (item.id === artefacto.id ? moverArtefacto(plano, artefacto, punto) : item)),
          artefacto.id,
        );
      }
      setHerramienta(null);
      return;
    }

    // Hay un solo medidor: si ya está, el toque lo cambia de lugar.
    const medidor = equipment.find((item) => item.role === "supply");
    if (herramienta.tipo === "meter_regulator" && medidor) {
      guardar(equipment.map((item) => (item.id === medidor.id ? moverArtefacto(plano, medidor, punto) : item)), medidor.id);
      setHerramienta(null);
      return;
    }

    const nuevo = crearArtefacto({
      existentes: equipment,
      id: `equipment:${plano.baseId}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      plano,
      punto,
      tipo: herramienta.tipo,
    });
    guardar([...equipment, nuevo], nuevo.id);
    if (herramienta.tipo === "meter_regulator") setHerramienta(null);
  }

  return {
    herramienta,
    numeros,
    /** El plano espera un toque para ubicar o mover. */
    ubicando: activo && herramienta !== null && plano !== null,
    // Tocar el botón ya elegido lo deja elegido: soltarlo de golpe confunde.
    elegir: (tipo: EquipmentType) => setHerramienta({ tipo }),
    mover: (id: string) => setHerramienta({ moverId: id }),
    soltar: () => setHerramienta(null),
    tocarPlano,
  };
}
