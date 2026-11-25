"use client";

import type { ReactNode } from "react";
import {
  BOTONES_DE_ARTEFACTOS,
  consumoTipicoTexto,
  tipoDeArtefacto,
  type TipoDeArtefacto,
} from "@/lib/artefactos/tiposDeArtefacto";
import { formatEquipmentDemand, type WorkbenchEquipment } from "@/lib/equipment/types";
import { Numero, TarjetaArtefacto } from "./TarjetaArtefacto";
import type { Herramienta } from "./usePasoArtefactos";

/**
 * Paso 3, panel de la derecha: un botón por tipo con el consumo típico, la lista numerada
 * de lo ubicado y la tarjeta del artefacto tocado.
 */
export function PasoArtefactos(props: {
  equipment: WorkbenchEquipment[];
  herramienta: Herramienta | null;
  numeros: Map<string, string>;
  seleccionadoId: string | null;
  /** Alturas y lado de salida de la pantalla anterior, plegados al final. */
  masOpciones?: ReactNode;
  masOpcionesAbierto?: boolean;
  onBorrar: (id: string) => void;
  onCambiar: (id: string, cambio: Partial<WorkbenchEquipment>) => void;
  onElegir: (tipo: TipoDeArtefacto) => void;
  onMover: (id: string) => void;
  onSeleccionar: (id: string) => void;
}) {
  const medidor = props.equipment.find((item) => item.role === "supply") ?? null;
  const artefactos = props.equipment
    .filter((item) => item.role === "appliance")
    .sort((a, b) =>
      (props.numeros.get(a.id) ?? "~").localeCompare(props.numeros.get(b.id) ?? "~", "es", { numeric: true }),
    );
  const elegido = props.herramienta && "tipo" in props.herramienta ? props.herramienta.tipo : null;
  const moviendoId = props.herramienta && "moverId" in props.herramienta ? props.herramienta.moverId : null;
  const seleccionado = props.equipment.find((item) => item.id === props.seleccionadoId) ?? null;

  return (
    <div className="space-y-4 px-4 pb-24 pt-4 text-sm">
      <div>
        <h2 className="text-base font-semibold">Artefactos</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{indicacion(elegido, Boolean(moviendoId), Boolean(medidor))}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {BOTONES_DE_ARTEFACTOS.map((tipo) => {
          const activo = elegido === tipo.tipo;
          return (
            <button
              aria-pressed={activo}
              className={`flex min-h-[74px] flex-col items-center justify-center gap-1 rounded border px-1 py-2 text-center ${
                activo
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
              }`}
              key={tipo.tipo}
              title={tipo.tipo === "meter_regulator" ? "Medidor" : `${tipo.boton}: ${consumoTipicoTexto(tipo)}`}
              type="button"
              onClick={() => props.onElegir(tipo)}
            >
              <Sigla activo={activo} texto={tipo.sigla} />
              <span className="text-[12px] font-medium leading-tight">{tipo.boton}</span>
              {tipo.tipo === "meter_regulator" ? null : (
                <span className={`text-[10px] leading-tight ${activo ? "text-white/85" : "text-[var(--muted)]"}`}>
                  {tipo.kcalPorHora === null ? "consumo a cargar" : consumoTipicoTexto(tipo)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {seleccionado ? (
        <TarjetaArtefacto
          artefacto={seleccionado}
          key={seleccionado.id}
          moviendo={moviendoId === seleccionado.id}
          numero={props.numeros.get(seleccionado.id) ?? null}
          onBorrar={() => props.onBorrar(seleccionado.id)}
          onCambiar={(cambio) => props.onCambiar(seleccionado.id, cambio)}
          onMover={() => props.onMover(seleccionado.id)}
        />
      ) : null}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">En el plano</h3>
        {medidor || artefactos.length > 0 ? (
          <ul className="mt-2 divide-y divide-[var(--line)] rounded border border-[var(--line)]">
            {[...(medidor ? [medidor] : []), ...artefactos].map((item) => (
              <li key={item.id}>
                <button
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-[#f5f6f3] ${
                    item.id === props.seleccionadoId ? "bg-[#eef6f5]" : ""
                  }`}
                  type="button"
                  onClick={() => props.onSeleccionar(item.id)}
                >
                  <Numero texto={props.numeros.get(item.id) ?? "?"} />
                  <span className="min-w-0 flex-1 truncate">{item.role === "supply" ? "Medidor" : item.name}</span>
                  {item.role === "appliance" ? (
                    <span className={`shrink-0 text-xs ${item.demandValue === undefined ? "text-[#7a4b00]" : "text-[var(--muted)]"}`}>
                      {item.demandValue === undefined ? "Falta el consumo" : formatEquipmentDemand(item)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted)]">Todavía no hay nada ubicado.</p>
        )}
        {artefactos.length > 0 ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Los números son los del plano: el 1 es el más lejano al medidor.
          </p>
        ) : null}
      </section>

      {props.masOpciones ? (
        <details className="rounded border border-[var(--line)]" open={props.masOpcionesAbierto || undefined}>
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--muted)]">
            Alturas, lado de salida y más opciones
          </summary>
          <div className="border-t border-[var(--line)]">{props.masOpciones}</div>
        </details>
      ) : null}
    </div>
  );
}

function indicacion(elegido: string | null, moviendo: boolean, hayMedidor: boolean) {
  if (moviendo) return "Tocá en el plano el lugar nuevo.";
  if (elegido === "meter_regulator") {
    return hayMedidor ? "Tocá en el plano el lugar nuevo del medidor." : "Tocá en el plano dónde va el medidor.";
  }
  if (elegido) {
    const nombre = tipoDeArtefacto(elegido as TipoDeArtefacto["tipo"]).boton.toLocaleLowerCase("es-AR");
    return `Tocá en el plano dónde va: ${nombre}. Podés marcar varios seguidos.`;
  }
  return hayMedidor
    ? "Elegí un artefacto y tocá en el plano dónde va. Tocá uno ya ubicado para cambiarlo."
    : "Elegí Medidor y tocá en el plano dónde va.";
}

function Sigla(props: { activo: boolean; texto: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-1 text-[10px] font-bold ${
        props.activo ? "border-white text-white" : "border-[var(--foreground)] text-[var(--foreground)]"
      }`}
    >
      {props.texto}
    </span>
  );
}
