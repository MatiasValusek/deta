"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalRouteTransitionResolution } from "@/lib/calculation/technicalRouteTransitions";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import { numerarDesdeResultado } from "@/lib/laminas/numeracionPlano";
import { crearPlanillaTramos } from "@/lib/laminas/planillaTramos";
import { crearPlanillaTramosPdf } from "@/lib/laminas/planillaTramosPdf";
import { crearRotulo } from "@/lib/obra/obraData";
import {
  leerObraSnapshot,
  leerObraSnapshotServidor,
  suscribirObra,
} from "@/lib/obra/obraStore";
import type { ManualRouteNetwork } from "@/lib/routing/types";

/** Botón para ver la planilla de cálculo por tramo (accesorios y longitud equivalente). */
export function PlanillaTramosPreview({
  calculationSheet,
  network,
  result,
  revisionLista,
  routeTransitionResolutions,
}: {
  calculationSheet: TechnicalCalculationSheet;
  network: ManualRouteNetwork;
  result: TechnicalCalculationResult | null;
  revisionLista: boolean;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
}) {
  const { obra, instalador } = useSyncExternalStore(
    suscribirObra,
    leerObraSnapshot,
    leerObraSnapshotServidor,
  );
  const [vistaUrl, setVistaUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planilla = useMemo(
    () =>
      crearPlanillaTramos({
        calculationSheet,
        numeracion: numerarDesdeResultado(network, result),
        result,
        routeTransitionResolutions,
      }),
    [calculationSheet, network, result, routeTransitionResolutions],
  );
  const avisos = [
    ...(revisionLista
      ? []
      : ["Falta terminar la revisión del cálculo. Volvé a Calcular y resolvé los avisos pendientes."]),
    ...(planilla.tramos.length === 0
      ? ["Todavía no hay tramos calculados. Trazá la cañería y volvé a Calcular."]
      : []),
    ...planilla.avisos,
  ];

  useEffect(() => {
    if (!vistaUrl) return;
    return () => URL.revokeObjectURL(vistaUrl);
  }, [vistaUrl]);

  const abrir = async () => {
    setError(null);
    setGenerando(true);
    try {
      const bytes = await crearPlanillaTramosPdf(planilla, crearRotulo(obra, instalador));
      const copia = new Uint8Array(bytes.byteLength);
      copia.set(bytes);
      setVistaUrl(URL.createObjectURL(new Blob([copia.buffer], { type: "application/pdf" })));
    } catch {
      setError("No se pudo preparar la planilla. Revisá el cálculo y volvé a intentarlo.");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="mt-3 rounded border border-[var(--line)] bg-[#f8f9f6] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold">Planilla de cálculo</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Accesorios de cada tramo por diámetro y su longitud equivalente.
          </p>
        </div>
        <button
          className="shrink-0 rounded border border-[var(--accent)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)]"
          disabled={avisos.length > 0 || generando}
          type="button"
          onClick={abrir}
        >
          {generando ? "Preparando..." : "Ver planilla"}
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
          aria-label="Planilla de cálculo"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4"
          role="dialog"
        >
          <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col overflow-hidden rounded bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
              <h2 className="text-sm font-semibold">Planilla de cálculo</h2>
              <button
                className="rounded border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium hover:border-[var(--accent)]"
                type="button"
                onClick={() => setVistaUrl(null)}
              >
                Cerrar
              </button>
            </div>
            <iframe className="min-h-0 flex-1 bg-[#525659]" src={vistaUrl} title="Planilla de cálculo" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
