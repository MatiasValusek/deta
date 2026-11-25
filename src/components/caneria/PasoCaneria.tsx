"use client";

import type { ReactNode } from "react";
import { FormaDeRecorridoBotones, type FormaDeRecorrido } from "./FormaDeRecorrido";

/**
 * Paso 4, panel de la derecha. El gasista marca el caño principal (dónde dobla y dónde
 * termina) y la app pone las bajadas, las piezas y la numeración. Lo de antes queda plegado.
 */
export function PasoCaneria(props: {
  ajena: boolean;
  avisos: string[];
  /** Las acciones para corregir (punto 3), cuando se está corrigiendo. */
  correccion?: ReactNode;
  corrigiendo: boolean;
  forma: FormaDeRecorrido;
  hayMedidor: boolean;
  /** Tramos con su diámetro, cuando ya hay cálculo ("C-M 32 mm"). */
  resumen?: ReactNode;
  puntos: number;
  masOpciones?: ReactNode;
  onCorregir: () => void;
  onDeshacer: () => void;
  onElegirForma: (forma: FormaDeRecorrido) => void;
  onEmpezarDeNuevo: () => void;
  onSeguirMarcando: () => void;
}) {
  return (
    <div className="space-y-4 px-4 pb-24 pt-4 text-sm">
      <div>
        <h2 className="text-base font-semibold">Cañería</h2>
        <div className="mt-2">
          <FormaDeRecorridoBotones elegida={props.forma} onElegir={props.onElegirForma} />
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {props.ajena
            ? "Esta cañería se trazó con la pantalla anterior."
            : props.corrigiendo
              ? "Arrastrá un quiebre o el punto donde sale una bajada. Tocá un tramo para ver qué podés hacer."
              : props.puntos === 0
                ? "Marcá por dónde va el caño principal: sale del medidor. Tocá dónde dobla y dónde termina."
                : "Seguí tocando dónde dobla y dónde termina. Las bajadas a cada artefacto las pone la app."}
        </p>
      </div>

      {!props.hayMedidor ? (
        <p className="rounded border border-[#f1d28a] bg-[#fffaf0] px-3 py-2 text-[#7a4b00]">
          Falta ubicar el medidor. Tocá Artefactos y marcalo en el plano.
        </p>
      ) : props.ajena ? (
        <section className="rounded border border-[#f1d28a] bg-[#fffaf0] px-3 py-3">
          <p className="text-[#7a4b00]">
            Podés seguir con ella o marcar el caño principal de nuevo: la app pone las bajadas sola.
          </p>
          <Boton principal onClick={props.onEmpezarDeNuevo}>
            Marcar el caño principal
          </Boton>
        </section>
      ) : (
        <>
          {props.corrigiendo ? (
            <section className="space-y-2">
              {props.correccion}
              <Boton onClick={props.onSeguirMarcando}>Seguir marcando el caño</Boton>
            </section>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Boton deshabilitado={props.puntos === 0} onClick={props.onDeshacer}>
                Deshacer el último punto
              </Boton>
              <Boton deshabilitado={props.puntos === 0} onClick={props.onCorregir}>
                Corregir el trazado
              </Boton>
              <Boton deshabilitado={props.puntos === 0} onClick={props.onEmpezarDeNuevo}>
                Empezar de nuevo
              </Boton>
            </div>
          )}

          {props.avisos.length > 0 && props.puntos > 0 ? (
            <ul className="space-y-2">
              {props.avisos.map((aviso) => (
                <li className="rounded border border-[#f1d28a] bg-[#fffaf0] px-3 py-2 text-[#7a4b00]" key={aviso}>
                  {aviso}
                </li>
              ))}
            </ul>
          ) : null}

          {props.resumen}
        </>
      )}

      {props.masOpciones ? (
        <details className="rounded border border-[var(--line)]">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--muted)]">
            Trazado automático y más opciones (pantalla anterior)
          </summary>
          <div className="border-t border-[var(--line)]">{props.masOpciones}</div>
        </details>
      ) : null}
    </div>
  );
}

export function Boton(props: {
  children: ReactNode;
  deshabilitado?: boolean;
  principal?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`mt-2 rounded border px-3 py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:text-[var(--muted)] ${
        props.principal
          ? "border-[var(--accent)] bg-[var(--accent)] font-semibold text-white hover:bg-[var(--accent-strong)]"
          : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
      }`}
      disabled={props.deshabilitado}
      type="button"
      onClick={props.onClick}
    >
      <span className="text-[13px]">{props.children}</span>
    </button>
  );
}
