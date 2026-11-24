"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { NormalizedDrawing } from "@/lib/geometry/types";
import { crearFactibilidadPdf, plantaFactibilidad } from "@/lib/laminas/factibilidadPdf";
import {
  avisosCroquis,
  avisosDatosFaltantes,
  crearDatosCroquis,
  crearRotulo,
} from "@/lib/obra/obraData";
import {
  leerObraSnapshot,
  leerObraSnapshotServidor,
  suscribirObra,
} from "@/lib/obra/obraStore";

/** Botón para ver la Factibilidad A3: planta con el medidor, croquis de ubicación y rótulo. */
export function FactibilidadPreview({
  drawing,
  equipment,
  visibleLayers,
}: {
  drawing: NormalizedDrawing | null;
  equipment: WorkbenchEquipment[];
  visibleLayers: Record<string, boolean>;
}) {
  const { obra, instalador } = useSyncExternalStore(
    suscribirObra,
    leerObraSnapshot,
    leerObraSnapshotServidor,
  );
  const [vistaUrl, setVistaUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avisos = useMemo(
    () => [
      ...new Set([
        ...avisosDatosFaltantes(obra, instalador),
        ...(!drawing || drawing.entities.length === 0
          ? ["Falta cargar la Planta. Volvé a Plano, tocá Cargar Planta y elegí el archivo."]
          : []),
        ...(equipment.some((item) => item.role === "supply")
          ? []
          : ["Falta ubicar el medidor. Volvé a Artefactos, elegí Medidor y marcalo en el plano."]),
        ...avisosCroquis(obra),
      ]),
    ],
    [drawing, equipment, instalador, obra],
  );

  useEffect(() => {
    if (!vistaUrl) return;
    return () => URL.revokeObjectURL(vistaUrl);
  }, [vistaUrl]);

  const abrir = async () => {
    const croquis = crearDatosCroquis(obra);
    if (avisos.length > 0 || generando || !croquis) return;

    setError(null);
    setGenerando(true);
    try {
      const bytes = await crearFactibilidadPdf(
        crearRotulo(obra, instalador),
        plantaFactibilidad({ capasVisibles: visibleLayers, drawing, equipment }),
        croquis,
      );
      const copia = new Uint8Array(bytes.byteLength);
      copia.set(bytes);
      setVistaUrl(URL.createObjectURL(new Blob([copia.buffer], { type: "application/pdf" })));
    } catch {
      setError("No se pudo preparar la factibilidad. Revisá los datos y volvé a intentarlo.");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="mt-3 rounded border border-[var(--line)] bg-[#f8f9f6] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold">Factibilidad A3</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Planta con el medidor, croquis de ubicación y rótulo.
          </p>
        </div>
        <button
          className="shrink-0 rounded border border-[var(--accent)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)]"
          disabled={avisos.length > 0 || generando}
          type="button"
          onClick={abrir}
        >
          {generando ? "Preparando..." : "Ver factibilidad"}
        </button>
      </div>

      {avisos.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-[var(--warning)]">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="mt-3 text-xs text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {vistaUrl ? (
        <div
          aria-label="Factibilidad A3"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4"
          role="dialog"
        >
          <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
              <h2 className="text-sm font-semibold">Factibilidad A3</h2>
              <button
                className="rounded border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium hover:border-[var(--accent)]"
                type="button"
                onClick={() => setVistaUrl(null)}
              >
                Cerrar
              </button>
            </div>
            <iframe className="min-h-0 flex-1 bg-[#525659]" src={vistaUrl} title="Factibilidad A3" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
