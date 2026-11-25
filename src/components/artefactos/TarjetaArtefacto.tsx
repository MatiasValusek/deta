"use client";

import { useState } from "react";
import { formatearNumero, tipoDeArtefacto } from "@/lib/artefactos/tiposDeArtefacto";
import type { DemandUnit, WorkbenchEquipment } from "@/lib/equipment/types";

/**
 * La tarjeta del artefacto tocado: nombre y consumo para cambiar, moverlo o borrarlo.
 * Todo se guarda al escribir; no hay "Aceptar".
 */
export function TarjetaArtefacto(props: {
  artefacto: WorkbenchEquipment;
  moviendo: boolean;
  numero: string | null;
  onBorrar: () => void;
  onCambiar: (cambio: Partial<WorkbenchEquipment>) => void;
  onMover: () => void;
}) {
  const { artefacto } = props;
  const esMedidor = artefacto.role === "supply";

  return (
    <section className="rounded border border-[var(--accent)] bg-white px-3 py-3" aria-label={artefacto.name}>
      <div className="flex items-center gap-2">
        {props.numero ? <Numero texto={props.numero} /> : null}
        {esMedidor ? (
          <h3 className="font-semibold">Medidor</h3>
        ) : (
          <input
            aria-label="Nombre"
            className="min-w-0 flex-1 rounded border border-[var(--line)] px-2 py-1 text-sm font-semibold focus:border-[var(--accent)] focus:outline-none"
            name="nombre-artefacto"
            type="text"
            value={artefacto.name}
            onChange={(evento) => props.onCambiar({ name: evento.target.value })}
          />
        )}
      </div>

      {esMedidor ? null : (
        <CampoConsumo
          artefacto={artefacto}
          key={artefacto.id}
          onCambiar={(demandValue, demandUnit) => props.onCambiar({ demandUnit, demandValue })}
        />
      )}

      {esMedidor ? null : (
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            checked={artefacto.bocaTaponada === true}
            className="mt-0.5"
            name="boca-taponada"
            type="checkbox"
            onChange={(evento) => props.onCambiar({ bocaTaponada: evento.target.checked })}
          />
          <span>
            Boca taponada
            <span className="block text-xs text-[var(--muted)]">
              Queda la boca con tapón para conectar después. Suma su consumo y sale en Referencias.
            </span>
          </span>
        </label>
      )}

      {props.moviendo ? (
        <p className="mt-3 rounded bg-[#eef6f5] px-2 py-1.5 text-xs">Tocá en el plano el lugar nuevo.</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            className="rounded border border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-medium hover:border-[var(--accent)]"
            type="button"
            onClick={props.onMover}
          >
            <span className="text-[13px]">Mover</span>
          </button>
          <button
            className="rounded border border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-medium text-red-800 hover:border-red-700"
            type="button"
            onClick={props.onBorrar}
          >
            <span className="text-[13px]">Borrar</span>
          </button>
        </div>
      )}
    </section>
  );
}

/** El consumo se escribe libre ("9000", "1,2") y se guarda cuando es un número válido. */
function CampoConsumo(props: {
  artefacto: WorkbenchEquipment;
  onCambiar: (valor: number | undefined, unidad: DemandUnit) => void;
}) {
  const unidad = props.artefacto.demandUnit ?? "kcal_h";
  const [texto, setTexto] = useState(
    props.artefacto.demandValue === undefined ? "" : formatearNumero(props.artefacto.demandValue).replace(/\./g, ""),
  );
  const valor = leerNumero(texto);
  const invalido = texto.trim() !== "" && valor === null;
  const tipico = tipoDeArtefacto(props.artefacto.type).kcalPorHora;

  return (
    <div className="mt-3">
      <label className="block text-xs font-medium" htmlFor={`consumo-${props.artefacto.id}`}>
        Consumo
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          className="w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
          id={`consumo-${props.artefacto.id}`}
          inputMode="decimal"
          name="consumo"
          placeholder="Escribí el consumo"
          type="text"
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value);
            const nuevo = leerNumero(evento.target.value);
            if (nuevo !== null || evento.target.value.trim() === "") props.onCambiar(nuevo ?? undefined, unidad);
          }}
        />
        <select
          aria-label="Unidad del consumo"
          className="rounded border border-[var(--line)] bg-white px-1.5 py-1.5 text-sm"
          name="unidad-consumo"
          value={unidad}
          onChange={(evento) => props.onCambiar(valor ?? undefined, evento.target.value as DemandUnit)}
        >
          <option value="kcal_h">kcal/h</option>
          <option value="m3_h">m³/h</option>
        </select>
      </div>
      {invalido ? (
        <p className="mt-1 text-xs text-red-800">El consumo tiene que ser un número mayor que cero, por ejemplo 9000.</p>
      ) : texto.trim() === "" ? (
        <p className="mt-1 text-xs text-[#7a4b00]">Falta el consumo. Escribilo como figura en la chapa del artefacto.</p>
      ) : tipico !== null && unidad === "kcal_h" && valor === tipico ? (
        <p className="mt-1 text-xs text-[var(--muted)]">Consumo típico. Cambialo si la chapa dice otro.</p>
      ) : null}
    </div>
  );
}

export function Numero(props: { texto: string }) {
  return (
    <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] px-1.5 text-xs font-semibold text-white">
      {props.texto}
    </span>
  );
}

function leerNumero(texto: string) {
  const limpio = texto.trim().replace(/\s/g, "");
  if (limpio === "") return null;
  // "9.000" es nueve mil; "1,5" es uno y medio.
  const normal = /^\d{1,3}(\.\d{3})+$/.test(limpio) ? limpio.replace(/\./g, "") : limpio.replace(",", ".");
  const valor = Number(normal);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}
