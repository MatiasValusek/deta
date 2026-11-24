"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ProjectGasConfig } from "@/lib/calculation/projectGas";
import type { TechnicalAxonometricView } from "@/lib/calculation/technicalAxonometric";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { NormalizedDrawing } from "@/lib/geometry/types";
import { diametrosPorTramo, hayAlturasCargadas } from "@/lib/laminas/isometricaPdf";
import { crearPlanoInstalacionPdf } from "@/lib/laminas/planoInstalacionPdf";
import { crearTablasPlano } from "@/lib/laminas/tablasPlano";
import {
  avisosDatosFaltantes,
  crearDatosCroquis,
  crearRotulo,
} from "@/lib/obra/obraData";
import {
  leerObraSnapshot,
  leerObraSnapshotServidor,
  suscribirObra,
} from "@/lib/obra/obraStore";
import type { ManualRouteNetwork } from "@/lib/routing/types";

type PlanoInstalacionPreviewProps = {
  axonometricView: TechnicalAxonometricView;
  calculationSheet: TechnicalCalculationSheet;
  drawing: NormalizedDrawing | null;
  equipment: WorkbenchEquipment[];
  materialTakeoff: TechnicalMaterialTakeoff;
  network: ManualRouteNetwork;
  projectGas: ProjectGasConfig;
  result: TechnicalCalculationResult | null;
  revisionLista: boolean;
  visibleLayers: Record<string, boolean>;
};

export function PlanoInstalacionPreview({
  axonometricView,
  calculationSheet,
  drawing,
  equipment,
  materialTakeoff,
  network,
  projectGas,
  result,
  revisionLista,
  visibleLayers,
}: PlanoInstalacionPreviewProps) {
  const { obra, instalador } = useSyncExternalStore(
    suscribirObra,
    leerObraSnapshot,
    leerObraSnapshotServidor,
  );
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vistaUrl, setVistaUrl] = useState<string | null>(null);
  const tablas = useMemo(
    () =>
      crearTablasPlano({
        calculationSheet,
        equipment,
        materialTakeoff,
        network,
        projectGas,
        result,
      }),
    [
      calculationSheet,
      equipment,
      materialTakeoff,
      network,
      projectGas,
      result,
    ],
  );
  const avisos = useMemo(
    () =>
      sinRepetidos([
        ...avisosDatosFaltantes(obra, instalador),
        ...avisosDePlano({
          calculationSheet,
          drawing,
          equipment,
          network,
          result,
          revisionLista,
        }),
        ...tablas.avisos,
      ]),
    [
      calculationSheet,
      drawing,
      equipment,
      instalador,
      network,
      obra,
      result,
      revisionLista,
      tablas.avisos,
    ],
  );

  useEffect(() => {
    if (!vistaUrl) {
      return;
    }

    return () => URL.revokeObjectURL(vistaUrl);
  }, [vistaUrl]);

  const abrirVista = async () => {
    if (avisos.length > 0 || generando || !drawing || !result) {
      return;
    }

    setError(null);
    setGenerando(true);

    try {
      // El croquis es opcional en esta lámina: sale solo si sus datos están completos.
      const croquis = crearDatosCroquis(obra) ?? undefined;
      const bytes = await crearPlanoInstalacionPdf(
        crearRotulo(obra, instalador),
        { conCroquis: Boolean(croquis) },
        tablas,
        {
          capasVisibles: visibleLayers,
          drawing,
          equipment,
          network,
          numeracion: tablas.numeracion,
        },
        {
          alturasCargadas: hayAlturasCargadas(network, equipment),
          diametros: diametrosPorTramo(tablas.numeracion, tablas.calculo.filas),
          numeracion: tablas.numeracion,
          vista: axonometricView,
        },
        croquis,
      );
      const copia = new Uint8Array(bytes.byteLength);
      copia.set(bytes);
      setVistaUrl(
        URL.createObjectURL(
          new Blob([copia.buffer], { type: "application/pdf" }),
        ),
      );
    } catch {
      setError(
        "No se pudo preparar la vista A3. Revisá los datos y volvé a intentarlo.",
      );
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="mt-3 rounded border border-[var(--line)] bg-[#f8f9f6] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold">Plano de instalación A3</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Vista temporal con los datos actuales. No reemplaza la descarga disponible.
          </p>
        </div>
        <button
          className="shrink-0 rounded border border-[var(--accent)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)]"
          disabled={avisos.length > 0 || generando}
          type="button"
          onClick={abrirVista}
        >
          {generando ? "Preparando..." : "Ver plano A3"}
        </button>
      </div>

      {avisos.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-[var(--warning)]">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[#2f6b46]">
          La planta, la isométrica, el gabinete, las tablas y el rótulo están listos para revisar.
        </p>
      )}

      {error ? (
        <p className="mt-3 text-xs text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {vistaUrl ? (
        <div
          aria-labelledby="vista-plano-a3-titulo"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4"
          role="dialog"
        >
          <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
              <h2 className="text-sm font-semibold" id="vista-plano-a3-titulo">
                Plano de instalación A3 — vista temporal
              </h2>
              <button
                className="rounded border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium hover:border-[var(--accent)]"
                type="button"
                onClick={() => setVistaUrl(null)}
              >
                Cerrar
              </button>
            </div>
            <iframe
              className="min-h-0 flex-1 bg-[#525659]"
              src={vistaUrl}
              title="Plano de instalación A3"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function avisosDePlano(params: {
  calculationSheet: TechnicalCalculationSheet;
  drawing: NormalizedDrawing | null;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  result: TechnicalCalculationResult | null;
  revisionLista: boolean;
}) {
  const avisos: string[] = [];

  if (!params.drawing || params.drawing.entities.length === 0) {
    avisos.push(
      "Falta cargar la Planta en DXF. Volvé a Plano, tocá Cargar Planta y elegí el archivo DXF.",
    );
  }
  if (!params.equipment.some((item) => item.role === "supply")) {
    avisos.push(
      "Falta ubicar el medidor. Volvé a Artefactos, elegí Medidor y marcalo en el plano.",
    );
  }
  if (!params.equipment.some((item) => item.role === "appliance")) {
    avisos.push(
      "Falta ubicar al menos un artefacto. Volvé a Artefactos y marcalo en el plano.",
    );
  }
  if (params.network.segments.length === 0) {
    avisos.push(
      "Falta trazar la cañería. Volvé a Recorrido y dibujala desde el medidor hasta los artefactos.",
    );
  }
  if (!params.result || params.result.status !== "valid") {
    avisos.push(
      "Falta completar el cálculo. Volvé a Calcular y resolvé los avisos pendientes.",
    );
  } else if (params.calculationSheet.rows.length === 0) {
    avisos.push(
      "Faltan tramos calculados. Revisá la cañería en Recorrido y volvé a Calcular.",
    );
  }
  if (!params.revisionLista) {
    avisos.push(
      "Falta terminar la revisión del cálculo. Volvé a Calcular y resolvé los avisos pendientes.",
    );
  }

  return avisos;
}

function sinRepetidos(avisos: string[]) {
  return [...new Set(avisos)];
}
