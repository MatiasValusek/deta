"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { crearRotulo, type CategoriaInstalador, type DatosObra } from "@/lib/obra/obraData";
import {
  actualizarInstalador,
  actualizarObra,
  leerObraSnapshot,
  leerObraSnapshotServidor,
  recordarPartidoDeLaObra,
  suscribirObra,
} from "@/lib/obra/obraStore";
import { instaladorCompleto } from "@/lib/obra/partidosUsados";
import { CamposCroquis } from "./CamposCroquis";
import { Rotulo } from "./Rotulo";

export const CLASE_CONTROL =
  "w-full rounded border border-[var(--line)] bg-white px-2 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none";

/** Lo que va en el rótulo de las 3 hojas. Lo del croquis va plegado aparte. */
const CAMPOS_OBRA: Array<{ campo: keyof DatosObra; etiqueta: string; ancho?: boolean }> = [
  { campo: "propietario", etiqueta: "Propietario", ancho: true },
  { campo: "calle", etiqueta: "Calle" },
  { campo: "numero", etiqueta: "Número" },
  { campo: "entreCalle1", etiqueta: "Entre calle" },
  { campo: "entreCalle2", etiqueta: "Y calle" },
  { campo: "localidad", etiqueta: "Localidad" },
  { campo: "partido", etiqueta: "Partido" },
];

/**
 * Paso 1. Un formulario en una columna: la obra, el croquis plegado y los datos del
 * instalador, que se cargan una sola vez. Nada es obligatorio para seguir: Revisar y
 * descargar avisa qué falta para cada hoja.
 */
export function PasoDatosObra() {
  const { obra, instalador, errorAlGuardar } = useSyncExternalStore(
    suscribirObra,
    leerObraSnapshot,
    leerObraSnapshotServidor,
  );
  // Si el instalador ya está cargado se ve en una línea; se abre con "Cambiar".
  const [editandoInstalador, setEditandoInstalador] = useState(() => !instaladorCompleto(instalador));

  // Al salir del paso, la app recuerda el partido de la localidad para la próxima obra.
  useEffect(() => () => recordarPartidoDeLaObra(), []);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--background)]">
      <div className="mx-auto grid max-w-[1100px] gap-8 px-6 py-6 pb-24 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <form className="space-y-6" onSubmit={(evento) => evento.preventDefault()}>
          <div>
            <h2 className="text-xl font-semibold">Datos de la obra</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Van en el rótulo de las 3 hojas. Se guardan solos. Si falta algo podés seguir: en
              Revisar y descargar te avisa qué completar.
            </p>
          </div>

          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="sr-only">La obra</legend>
            {CAMPOS_OBRA.map(({ campo, etiqueta, ancho }) => (
              <Campo ancho={ancho} etiqueta={etiqueta} key={campo}>
                <input
                  className={CLASE_CONTROL}
                  name={campo}
                  type="text"
                  value={obra[campo]}
                  onChange={(evento) => actualizarObra({ [campo]: evento.target.value })}
                />
              </Campo>
            ))}
          </fieldset>

          <details className="rounded border border-[var(--line)] bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Croquis de ubicación (para la factibilidad)
            </summary>
            <div className="mt-3">
              <CamposCroquis obra={obra} />
            </div>
          </details>

          <section aria-labelledby="instalador-titulo" className="rounded border border-[var(--line)] bg-white px-4 py-3">
            <h3 className="text-sm font-semibold" id="instalador-titulo">
              Datos del instalador
            </h3>
            {editandoInstalador ? (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <p className="col-span-2 text-xs text-[var(--muted)]">
                  Se cargan una sola vez y quedan guardados para tus próximas obras.
                </p>
                <Campo ancho etiqueta="Nombre y apellido">
                  <input
                    className={CLASE_CONTROL}
                    name="instalador-nombre"
                    type="text"
                    value={instalador.nombre}
                    onChange={(evento) => actualizarInstalador({ nombre: evento.target.value })}
                  />
                </Campo>
                <Campo etiqueta="Matrícula">
                  <input
                    className={CLASE_CONTROL}
                    name="instalador-matricula"
                    type="text"
                    value={instalador.matricula}
                    onChange={(evento) => actualizarInstalador({ matricula: evento.target.value })}
                  />
                </Campo>
                <Campo etiqueta="Categoría">
                  <select
                    className={CLASE_CONTROL}
                    name="instalador-categoria"
                    value={instalador.categoria}
                    onChange={(evento) =>
                      actualizarInstalador({ categoria: evento.target.value as CategoriaInstalador })
                    }
                  >
                    <option value="">Elegir</option>
                    <option value="1">1°</option>
                    <option value="2">2°</option>
                    <option value="3">3°</option>
                  </select>
                </Campo>
                {instaladorCompleto(instalador) ? (
                  <div className="col-span-2">
                    <button
                      className="rounded border border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-medium hover:border-[var(--accent)]"
                      type="button"
                      onClick={() => setEditandoInstalador(false)}
                    >
                      <span className="text-[13px]">Listo</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                <span>
                  Instalador: {instalador.nombre.trim()} · Mat. {instalador.matricula.trim()} · Cat.{" "}
                  {instalador.categoria}°
                </span>
                <button
                  className="shrink-0 rounded border border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-medium hover:border-[var(--accent)]"
                  type="button"
                  onClick={() => setEditandoInstalador(true)}
                >
                  <span className="text-[13px]">Cambiar</span>
                </button>
              </div>
            )}
          </section>

          {errorAlGuardar ? (
            <p className="text-sm text-red-700" role="alert">
              {errorAlGuardar}
            </p>
          ) : null}
        </form>

        <aside className="space-y-3 lg:pt-14">
          <h3 className="text-sm font-semibold">Así sale en las hojas</h3>
          <Rotulo contenido={crearRotulo(obra, instalador)} />
        </aside>
      </div>
    </div>
  );
}

function Campo({ ancho, etiqueta, children }: { ancho?: boolean; etiqueta: string; children: ReactNode }) {
  return (
    <label className={`block text-xs font-medium ${ancho ? "col-span-2" : ""}`}>
      <span className="mb-1 block">{etiqueta}</span>
      {children}
    </label>
  );
}
