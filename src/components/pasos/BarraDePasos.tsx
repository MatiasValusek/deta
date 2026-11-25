"use client";

import type { ReactNode } from "react";

export type PasoDeLaBarra = {
  completo: boolean;
  etiqueta: string;
  habilitado: boolean;
  id: string;
  /** Por qué no se puede abrir todavía (se muestra al pasar el mouse). */
  motivo?: string;
};

/**
 * Los 5 pasos, siempre a la vista: 1 Datos de la obra · 2 Plano · 3 Artefactos · 4 Cañería ·
 * 5 Revisar y descargar. Cada paso muestra un tilde cuando está completo y se puede volver a
 * cualquiera tocándolo. El paso 1 lo dibuja quien llama (abre la ventana de datos).
 */
export function BarraDePasos({
  activo,
  pasoDatos,
  pasos,
  onElegir,
}: {
  activo: string;
  pasoDatos: ReactNode;
  pasos: PasoDeLaBarra[];
  onElegir: (id: string) => void;
}) {
  return (
    <nav aria-label="Pasos" className="flex min-w-0 flex-wrap items-center justify-center gap-1">
      {pasoDatos}
      {pasos.map((paso, indice) => (
        <BotonPaso
          activo={paso.id === activo}
          completo={paso.completo}
          deshabilitado={!paso.habilitado}
          etiqueta={paso.etiqueta}
          key={paso.id}
          numero={indice + 2}
          titulo={paso.habilitado ? undefined : paso.motivo}
          onClick={() => onElegir(paso.id)}
        />
      ))}
    </nav>
  );
}

export function BotonPaso({
  activo,
  completo,
  deshabilitado = false,
  etiqueta,
  numero,
  titulo,
  onClick,
}: {
  activo: boolean;
  completo: boolean;
  deshabilitado?: boolean;
  etiqueta: string;
  numero: number;
  titulo?: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={activo ? "step" : undefined}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        activo
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
      } disabled:cursor-not-allowed disabled:bg-[#f5f6f7] disabled:text-[var(--muted)]`}
      disabled={deshabilitado}
      title={titulo}
      type="button"
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
          completo
            ? activo
              ? "bg-white text-[var(--accent)]"
              : "bg-[#2f6b46] text-white"
            : activo
              ? "bg-white/25"
              : "bg-[#eef0ec]"
        }`}
      >
        {completo ? "✓" : numero}
      </span>
      {etiqueta}
      {completo ? <span className="sr-only"> (completo)</span> : null}
    </button>
  );
}

/** Abajo a la derecha, siempre el mismo: lleva al paso siguiente. */
export function BotonSiguiente({
  etiqueta,
  habilitado,
  motivo,
  onClick,
}: {
  etiqueta: string;
  habilitado: boolean;
  motivo?: string;
  onClick: () => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col items-end gap-1">
      {!habilitado && motivo ? (
        <p className="pointer-events-auto max-w-[320px] rounded border border-[#f1d28a] bg-[#fffaf0] px-3 py-2 text-xs text-[var(--warning)] shadow">
          {motivo}
        </p>
      ) : null}
      <button
        className="pointer-events-auto rounded border border-[var(--accent)] bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[#f5f6f7] disabled:text-[var(--muted)] disabled:shadow-none"
        disabled={!habilitado}
        type="button"
        onClick={onClick}
      >
        {etiqueta} →
      </button>
    </div>
  );
}
