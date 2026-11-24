"use client";

import { avisosCroquis, type DatosObra } from "@/lib/obra/obraData";
import { actualizarObra } from "@/lib/obra/obraStore";

const CLASE_CONTROL =
  "w-full rounded border border-[var(--line)] bg-white px-2 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none";

const DIRECCIONES_NORTE: Array<[string, string]> = [
  ["0", "Arriba ↑"],
  ["45", "Arriba a la derecha ↗"],
  ["90", "Derecha →"],
  ["135", "Abajo a la derecha ↘"],
  ["180", "Abajo ↓"],
  ["225", "Abajo a la izquierda ↙"],
  ["270", "Izquierda ←"],
  ["315", "Arriba a la izquierda ↖"],
];

/** Datos del croquis de ubicación: la calle de la obra queda abajo, las entre calles a los costados. */
export function CamposCroquis({ obra }: { obra: DatosObra }) {
  const esquina1 = obra.entreCalle1.trim() || "la primera entre calle";
  const esquina2 = obra.entreCalle2.trim() || "la segunda entre calle";
  const avisos = avisosCroquis(obra);

  return (
    <fieldset className="grid grid-cols-2 gap-3">
      <legend className="mb-1 text-sm font-semibold">Croquis de ubicación</legend>
      <p className="col-span-2 text-xs text-[var(--muted)]">
        La calle de la obra va abajo; la primera entre calle a la izquierda y la segunda a la
        derecha.
      </p>
      <label className="col-span-2 block text-xs font-medium">
        <span className="mb-1 block">Calle de atrás de la manzana</span>
        <input
          className={CLASE_CONTROL}
          name="calleContrafrente"
          type="text"
          value={obra.calleContrafrente}
          onChange={(evento) => actualizarObra({ calleContrafrente: evento.target.value })}
        />
      </label>
      <label className="block text-xs font-medium">
        <span className="mb-1 block">Metros hasta la esquina con {esquina1}</span>
        <input
          className={CLASE_CONTROL}
          inputMode="decimal"
          name="distanciaEsquina1"
          type="text"
          value={obra.distanciaEsquina1}
          onChange={(evento) => actualizarObra({ distanciaEsquina1: evento.target.value })}
        />
      </label>
      <label className="block text-xs font-medium">
        <span className="mb-1 block">Metros hasta la esquina con {esquina2}</span>
        <input
          className={CLASE_CONTROL}
          inputMode="decimal"
          name="distanciaEsquina2"
          type="text"
          value={obra.distanciaEsquina2}
          onChange={(evento) => actualizarObra({ distanciaEsquina2: evento.target.value })}
        />
      </label>
      <label className="col-span-2 block text-xs font-medium">
        <span className="mb-1 block">¿Hacia dónde queda el norte en el croquis?</span>
        <select
          className={CLASE_CONTROL}
          name="norteGrados"
          value={obra.norteGrados}
          onChange={(evento) => actualizarObra({ norteGrados: evento.target.value })}
        >
          <option value="">Elegir</option>
          {DIRECCIONES_NORTE.map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
      </label>
      {avisos.length > 0 && avisos.length < 7 ? (
        <p className="col-span-2 text-xs text-[var(--muted)]">{avisos[0]}</p>
      ) : null}
    </fieldset>
  );
}
