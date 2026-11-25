"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AgrandarDiametroPanel } from "@/components/dxf-workbench/AgrandarDiametroPanel";
import type { DiameterTransitionProposal } from "@/lib/calculation/diameterTransitionProposals";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { AdoptedDiameterDecision } from "@/lib/calculation/professionalDiameterAdoption";
import type { TechnicalRouteTransitionResolution } from "@/lib/calculation/technicalRouteTransitions";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { NormalizedDrawing } from "@/lib/geometry/types";
import type { FondoPdf } from "@/lib/laminas/fondoPdf";
import { leerObraSnapshot, leerObraSnapshotServidor, suscribirObra } from "@/lib/obra/obraStore";
import {
  avisosParaDescargar,
  hojasListas,
  NOMBRE_HOJA,
  NOMBRE_PASO,
  type HojaId,
  type PasoId,
} from "@/lib/revisar/avisosRevisar";
import {
  crearHoja,
  nombreArchivo,
  nombreArchivoExcel,
  prepararHojas,
  resumenObra,
  type DatosHojas,
} from "@/lib/revisar/hojas";
import type { AccessoryProposal } from "@/lib/routing/routeAccessoryProposals";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { armarResultadosObra } from "@/lib/workbench/calculoObra";
import { ExportarExcel } from "./ExportarExcel";
import { MiniaturaHoja } from "./MiniaturaHoja";

const HOJAS: HojaId[] = ["factibilidad", "plano", "planilla"];

/**
 * Paso 5. Las 3 hojas en miniatura, los avisos en lenguaje simple antes del botón de
 * descarga, "Agrandar para ampliación futura" a la vista y "Descargar las 3 hojas".
 */
export function RevisarYDescargar(props: {
  accessoryProposals: AccessoryProposal[];
  adoptedDiameterDecisions: AdoptedDiameterDecision[];
  diameterTransitionProposals: DiameterTransitionProposal[];
  drawing: NormalizedDrawing | null;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  /** Plano en PDF: cómo leer el archivo y qué página va de fondo en las láminas. */
  planoPdf?: { leer: () => Promise<Uint8Array | null>; pagina: number } | null;
  result: TechnicalCalculationResult | null;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  scaleMetersPerSourceUnit: number | null;
  visibleLayers: Record<string, boolean>;
  onAdoptSegmentDiameter: (segmentId: string, diameterId: string | null) => void;
  onIrAPaso: (paso: PasoId) => void;
}) {
  const { obra, instalador } = useSyncExternalStore(suscribirObra, leerObraSnapshot, leerObraSnapshotServidor);
  const [conCroquisEnPlano, setConCroquisEnPlano] = useState(false);
  const [hojas, setHojas] = useState<Partial<Record<HojaId, Uint8Array>>>({});
  const [vista, setVista] = useState<{ hoja: HojaId; url: string } | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fondoPdf, setFondoPdf] = useState<FondoPdf | null>(null);
  const planoPdf = props.planoPdf ?? null;

  // El PDF del plano se lee una vez para ponerlo de fondo en las dos láminas A3.
  useEffect(() => {
    let cancelado = false;
    if (!planoPdf) {
      setFondoPdf(null);
      return;
    }
    planoPdf.leer().then((bytes) => {
      if (!cancelado) setFondoPdf(bytes ? { bytes, pagina: planoPdf.pagina } : null);
    });
    return () => {
      cancelado = true;
    };
    // Se vuelve a leer si cambia el plano o la página (viene memorizado desde el área de trabajo).
  }, [planoPdf]);

  // El mismo cálculo que usan las pruebas (workbench/calculoObra.ts).
  const resultados = useMemo(
    () =>
      armarResultadosObra({
        accessoryProposals: props.accessoryProposals,
        adoptedDiameterDecisions: props.adoptedDiameterDecisions,
        diameterTransitionProposals: props.diameterTransitionProposals,
        equipment: props.equipment,
        network: props.network,
        result: props.result,
        routeTransitionResolutions: props.routeTransitionResolutions,
        scaleMetersPerSourceUnit: props.scaleMetersPerSourceUnit,
      }),
    [
      props.accessoryProposals,
      props.adoptedDiameterDecisions,
      props.diameterTransitionProposals,
      props.equipment,
      props.network,
      props.result,
      props.routeTransitionResolutions,
      props.scaleMetersPerSourceUnit,
    ],
  );
  const datos: DatosHojas = useMemo(
    () => ({
      conCroquisEnPlano,
      drawing: props.drawing,
      equipment: props.equipment,
      fondoPdf,
      instalador,
      network: props.network,
      obra,
      result: props.result,
      resultados,
      routeTransitionResolutions: props.routeTransitionResolutions,
      visibleLayers: props.visibleLayers,
    }),
    [
      conCroquisEnPlano,
      fondoPdf,
      instalador,
      obra,
      props.drawing,
      props.equipment,
      props.network,
      props.result,
      props.routeTransitionResolutions,
      props.visibleLayers,
      resultados,
    ],
  );
  const { planilla, tablas } = useMemo(() => prepararHojas(datos), [datos]);
  const avisos = useMemo(
    () =>
      avisosParaDescargar({
        avisosPlanilla: planilla.avisos,
        avisosTablas: tablas.avisos,
        conCroquisEnPlano,
        drawing: props.drawing,
        equipment: props.equipment,
        hayPlanoPdf: Boolean(fondoPdf),
        instalador,
        materialesPendientes: resultados.materialTakeoff.pendingSummary.total,
        network: props.network,
        obra,
        result: props.result,
      }),
    [
      conCroquisEnPlano,
      fondoPdf,
      instalador,
      obra,
      planilla.avisos,
      props.drawing,
      props.equipment,
      props.network,
      props.result,
      resultados,
      tablas.avisos,
    ],
  );
  // Por texto, para no rearmar las hojas en cada dibujo de la pantalla.
  const clavesListas = [...hojasListas(avisos)].join(",");
  const listas = useMemo(() => new Set(clavesListas.split(",").filter(Boolean) as HojaId[]), [clavesListas]);
  const todasListas = listas.size === HOJAS.length;
  const resumen = resumenObra({
    equipment: props.equipment,
    filasCalculo: tablas.calculo.filas,
    filasReferencias: tablas.referencias.filas,
  });

  // Las hojas listas se arman solas para verlas en miniatura.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const nuevas: Partial<Record<HojaId, Uint8Array>> = {};
      for (const hoja of HOJAS) {
        if (!listas.has(hoja)) continue;
        try {
          nuevas[hoja] = await crearHoja(hoja, datos);
        } catch {
          // Si una hoja no se puede armar, queda sin miniatura; la descarga avisa.
        }
      }
      if (!cancelado) setHojas(nuevas);
    })();
    return () => {
      cancelado = true;
    };
  }, [datos, listas]);

  useEffect(() => {
    if (!vista) return;
    return () => URL.revokeObjectURL(vista.url);
  }, [vista]);

  const urlDe = (bytes: Uint8Array) => {
    const copia = new Uint8Array(bytes.byteLength);
    copia.set(bytes);
    return URL.createObjectURL(new Blob([copia.buffer], { type: "application/pdf" }));
  };
  const bajar = (hoja: HojaId, bytes: Uint8Array) => {
    const url = urlDe(bytes);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo(hoja, obra);
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const descargar = async (cuales: HojaId[]) => {
    setError(null);
    setDescargando(true);
    try {
      for (const hoja of cuales) {
        bajar(hoja, hojas[hoja] ?? (await crearHoja(hoja, datos)));
      }
    } catch {
      setError("No se pudo armar una de las hojas. Revisá los avisos y volvé a intentar.");
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--background)]">
      <div className="mx-auto grid max-w-[1400px] gap-6 px-6 py-6 pb-24 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Revisá y descargá</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{resumen}</p>

          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {HOJAS.map((hoja) => (
              <li className="overflow-hidden rounded border border-[var(--line)] bg-white" key={hoja}>
                <button
                  className="block w-full disabled:cursor-default"
                  disabled={!hojas[hoja]}
                  title={hojas[hoja] ? "Tocá para verla grande" : undefined}
                  type="button"
                  onClick={() => {
                    const bytes = hojas[hoja];
                    if (bytes) setVista({ hoja, url: urlDe(bytes) });
                  }}
                >
                  {hojas[hoja] ? (
                    <MiniaturaHoja bytes={hojas[hoja] as Uint8Array} titulo={NOMBRE_HOJA[hoja]} />
                  ) : (
                    <div className="flex aspect-[1.414] w-full items-center justify-center bg-[#f5f6f3] px-4 text-center text-xs text-[var(--muted)]">
                      {listas.has(hoja) ? "Preparando…" : "Todavía no sale: mirá los avisos."}
                    </div>
                  )}
                </button>
                <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-3 py-2">
                  <span className="text-sm font-medium">{NOMBRE_HOJA[hoja]}</span>
                  <button
                    className="rounded border border-[var(--line)] px-2.5 py-1 text-[13px] font-medium leading-5 hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--muted)]"
                    disabled={!listas.has(hoja) || descargando}
                    type="button"
                    onClick={() => descargar([hoja])}
                  >
                    <span className="text-[13px]">Descargar</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              checked={conCroquisEnPlano}
              type="checkbox"
              onChange={(evento) => setConCroquisEnPlano(evento.target.checked)}
            />
            Agregar el croquis de ubicación al Plano de instalación (achica las tablas)
          </label>

          <ExportarExcel
            calculationSheet={resultados.calculationSheet}
            materialTakeoff={resultados.materialTakeoff}
            nombreArchivo={nombreArchivoExcel(obra)}
          />

          <div className="mt-6">
            <AgrandarDiametroPanel
              adoptedDiameterDecisions={props.adoptedDiameterDecisions}
              calculationSheet={resultados.calculationSheet}
              network={props.network}
              pipeSystem={SIGAS_PIPE_SYSTEM}
              result={props.result}
              onAdoptSegmentDiameter={props.onAdoptSegmentDiameter}
            />
          </div>
        </div>

        <aside className="lg:sticky lg:top-0 lg:self-start">
          <section aria-labelledby="avisos-titulo" className="rounded border border-[var(--line)] bg-white px-4 py-4">
            <h3 className="text-sm font-semibold" id="avisos-titulo">
              {avisos.length === 0 ? "Todo listo para descargar" : `Antes de descargar (${avisos.length})`}
            </h3>
            {avisos.length === 0 ? (
              <p className="mt-2 text-sm text-[#2f6b46]">
                Las 3 hojas tienen todos los datos. Revisalas en las miniaturas y descargalas.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {avisos.map((aviso) => (
                  <li className="rounded border border-[#f1d28a] bg-[#fffaf0] px-3 py-2" key={aviso.texto}>
                    <p className="text-sm text-[#7a4b00]">{aviso.texto}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--muted)]">
                        Frena: {aviso.hojas.map((hoja) => NOMBRE_HOJA[hoja]).join(", ")}
                      </span>
                      {aviso.paso !== "revisar" ? (
                        <button
                          className="shrink-0 rounded border border-[var(--accent)] bg-white px-2 py-1 text-xs font-medium hover:bg-[var(--accent-soft)]"
                          type="button"
                          onClick={() => props.onIrAPaso(aviso.paso)}
                        >
                          <span className="text-xs">Ir a {NOMBRE_PASO[aviso.paso]}</span>
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button
              className="mt-4 w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-4 py-3 text-base font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[#f5f6f7] disabled:text-[var(--muted)]"
              disabled={!todasListas || descargando}
              type="button"
              onClick={() => descargar(HOJAS)}
            >
              {descargando ? "Preparando…" : "Descargar las 3 hojas"}
            </button>
            {!todasListas ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {listas.size > 0
                  ? `Ya ${listas.size === 1 ? "sale" : "salen"}: ${[...listas].map((hoja) => NOMBRE_HOJA[hoja]).join(", ")}. Se descargan desde su miniatura.`
                  : "Resolvé los avisos de arriba para descargar."}
              </p>
            ) : null}
            {error ? (
              <p className="mt-2 text-xs text-red-800" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      {vista ? (
        <div
          aria-label={NOMBRE_HOJA[vista.hoja]}
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4"
          role="dialog"
        >
          <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
              <h2 className="text-sm font-semibold">{NOMBRE_HOJA[vista.hoja]}</h2>
              <button
                className="rounded border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium hover:border-[var(--accent)]"
                type="button"
                onClick={() => setVista(null)}
              >
                Cerrar
              </button>
            </div>
            <iframe className="min-h-0 flex-1 bg-[#525659]" src={vista.url} title={NOMBRE_HOJA[vista.hoja]} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
