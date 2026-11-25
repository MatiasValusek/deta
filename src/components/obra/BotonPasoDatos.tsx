"use client";

import { useSyncExternalStore } from "react";
import { BotonPaso } from "@/components/pasos/BarraDePasos";
import type { DatosObra } from "@/lib/obra/obraData";
import { leerObraSnapshot, leerObraSnapshotServidor, suscribirObra } from "@/lib/obra/obraStore";

/** Lo mínimo para el tilde: propietario, calle y número, localidad. */
export function datosMinimosCompletos(obra: DatosObra) {
  return (["propietario", "calle", "numero", "localidad"] as const).every(
    (campo) => obra[campo].trim() !== "",
  );
}

/** Paso 1 de la barra. Lee los datos guardados para mostrar el tilde. */
export function BotonPasoDatos({ activo, onClick }: { activo: boolean; onClick: () => void }) {
  const { obra } = useSyncExternalStore(suscribirObra, leerObraSnapshot, leerObraSnapshotServidor);
  return (
    <BotonPaso
      activo={activo}
      completo={datosMinimosCompletos(obra)}
      etiqueta="Datos de la obra"
      numero={1}
      onClick={onClick}
    />
  );
}
