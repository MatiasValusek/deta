"use client";

import type { ReactNode } from "react";
import type { SourceCalibrationState } from "@/components/dxf-workbench/CalibrationPanel";
import type { Bounds, NormalizedDrawing } from "@/lib/geometry/types";
import { escalaDelArchivo, medidasEnMetros } from "@/lib/plano/escalaDelArchivo";

/**
 * Paso 2, panel de la derecha: muestra la escala para confirmarla con los ojos ("la casa mide
 * 10,00 × 8,00 m") y, si no se pudo tomar del archivo o no da, el marcado de una medida
 * conocida: dos puntos en el plano y cuánto mide, en metros.
 */
export function EscalaDelPlano(props: {
  drawing: NormalizedDrawing | null;
  nombreArchivo: string;
  /** Tamaño de la página del PDF, en las mismas unidades que los puntos marcados. */
  paginaPdf: { height: number; width: number } | null;
  state: SourceCalibrationState;
  /** Lo que no es del día a día (cortes, quitar el plano), plegado al final. */
  masOpciones?: ReactNode;
  onCambiarPlano: () => void;
  onCancelar: () => void;
  onConfirmar: () => void;
  onCorregir: () => void;
  onDistancia: (valor: string) => void;
}) {
  const { state } = props;
  const calibration = state.calibration;
  const marcando = state.toolMode === "calibrate";
  const puntos = Math.min(state.draft.points.length, 2);
  const motivo = props.drawing
    ? escalaDelArchivo({ bounds: props.drawing.bounds, units: props.drawing.units })
    : null;
  const porQueMarcar =
    motivo?.tipo === "marcar"
      ? `${motivo.motivo} Marcá una medida que conozcas.`
      : !props.drawing
        ? "Un PDF no trae la escala. Marcá una medida que conozcas."
        : "Marcá una medida que conozcas.";

  return (
    <div className="space-y-4 px-4 py-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Plano</h2>
          <p className="truncate text-xs text-[var(--muted)]" title={props.nombreArchivo}>
            {props.nombreArchivo}
          </p>
        </div>
        <button
          className="shrink-0 rounded border border-[var(--line)] bg-white px-2.5 py-1 text-xs font-medium hover:border-[var(--accent)]"
          type="button"
          onClick={props.onCambiarPlano}
        >
          <span className="text-xs">Cambiar el plano</span>
        </button>
      </div>

      {marcando ? (
        <section className="rounded border border-[var(--accent)] bg-[#eef6f5] px-3 py-3">
          <h3 className="font-semibold">Marcá una medida que conozcas</h3>
          {!calibration ? <p className="mt-1 text-xs">{porQueMarcar}</p> : null}
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs">
            <li>
              Tocá en el plano los dos extremos de una pared o de una cota.{" "}
              <span className="font-medium">
                ({puntos} de 2 {puntos === 1 ? "punto" : "puntos"})
              </span>
            </li>
            <li>Escribí cuánto mide.</li>
          </ol>
          <label className="mt-3 block text-xs font-medium">
            <span className="mb-1 block">¿Cuánto mide?</span>
            <span className="flex items-center gap-2">
              <input
                className="w-full rounded border border-[var(--line)] bg-white px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
                inputMode="decimal"
                name="medida-conocida"
                placeholder="Por ejemplo 3,50"
                type="text"
                value={state.draft.distanceOriginal}
                onChange={(evento) => props.onDistancia(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter" && puntos === 2) props.onConfirmar();
                }}
              />
              <span className="text-sm">metros</span>
            </span>
          </label>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
              disabled={puntos < 2 || state.draft.distanceOriginal.trim() === ""}
              type="button"
              onClick={props.onConfirmar}
            >
              <span className="text-[13px]">Confirmar</span>
            </button>
            {calibration ? (
              <button
                className="rounded border border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-medium hover:border-[var(--accent)]"
                type="button"
                onClick={props.onCancelar}
              >
                <span className="text-[13px]">Cancelar</span>
              </button>
            ) : null}
          </div>
          {state.error ? (
            <p className="mt-2 text-xs text-red-800" role="alert">
              {textoDeError(state.error)}
            </p>
          ) : null}
        </section>
      ) : calibration ? (
        <section className="rounded border border-[#cfe3d6] bg-[#f3faf5] px-3 py-3">
          <h3 className="font-semibold text-[#2f6b46]">
            ✓ {calibration.origen === "archivo" ? "Escala tomada del archivo" : "Escala marcada"}
          </h3>
          <p className="mt-1">{tamanio(props, calibration.millimetersPerSourceUnit / 1000)}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Mirá que tenga sentido. Si no, marcá una medida que conozcas.
          </p>
          <button
            className="mt-3 rounded border border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-medium hover:border-[var(--accent)]"
            type="button"
            onClick={props.onCorregir}
          >
            <span className="text-[13px]">La medida no es correcta</span>
          </button>
        </section>
      ) : (
        <section className="rounded border border-[#f1d28a] bg-[#fffaf0] px-3 py-3">
          <p className="text-[#7a4b00]">{porQueMarcar}</p>
          <button
            className="mt-3 rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[var(--accent-strong)]"
            type="button"
            onClick={props.onCorregir}
          >
            <span className="text-[13px]">Marcar una medida</span>
          </button>
        </section>
      )}

      {props.masOpciones ? (
        <details className="rounded border border-[var(--line)]">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--muted)]">
            Cortes y más opciones
          </summary>
          <div className="border-t border-[var(--line)]">{props.masOpciones}</div>
        </details>
      ) : null}
    </div>
  );
}

function tamanio(
  props: { drawing: NormalizedDrawing | null; paginaPdf: { height: number; width: number } | null },
  metrosPorUnidad: number,
) {
  if (props.drawing?.bounds) {
    return `La casa mide ${medidasEnMetros(props.drawing.bounds, metrosPorUnidad)}.`;
  }
  if (props.paginaPdf) {
    const hoja: Bounds = { maxX: props.paginaPdf.width, maxY: props.paginaPdf.height, minX: 0, minY: 0 };
    return `Con esta escala, la hoja entera abarca ${medidasEnMetros(hoja, metrosPorUnidad)}.`;
  }
  return "Escala lista.";
}

/** Los errores de hoy vienen escritos para otro panel; acá se dicen con qué hacer. */
function textoDeError(error: string) {
  if (error.includes("dos puntos")) return "Faltan puntos. Tocá los dos extremos de la medida en el plano.";
  if (error.includes("positiva")) return "La medida tiene que ser un número mayor que cero, por ejemplo 3,50.";
  if (error.includes("distintos")) return "Los dos puntos son el mismo. Tocá los dos extremos de la medida.";
  return error;
}
