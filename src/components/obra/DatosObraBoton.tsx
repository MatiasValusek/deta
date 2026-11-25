"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { BotonPaso } from "@/components/pasos/BarraDePasos";
import {
  avisosDatosFaltantes,
  crearRotulo,
  type CategoriaInstalador,
  type DatosObra,
} from "@/lib/obra/obraData";
import {
  actualizarInstalador,
  actualizarObra,
  leerObraSnapshot,
  leerObraSnapshotServidor,
  suscribirObra,
} from "@/lib/obra/obraStore";
import { CamposCroquis } from "./CamposCroquis";
import { Rotulo } from "./Rotulo";

const CAMPOS_OBRA: Array<{
  campo: keyof DatosObra;
  etiqueta: string;
  ancho?: boolean;
}> = [
  { campo: "propietario", etiqueta: "Propietario", ancho: true },
  { campo: "calle", etiqueta: "Calle" },
  { campo: "numero", etiqueta: "Número" },
  { campo: "entreCalle1", etiqueta: "Entre calle" },
  { campo: "entreCalle2", etiqueta: "Y calle" },
  { campo: "localidad", etiqueta: "Localidad" },
  { campo: "partido", etiqueta: "Partido" },
];

const CLASE_CONTROL =
  "w-full rounded border border-[var(--line)] bg-white px-2 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none";

/** Pide abrir la ventana de Datos de la obra desde otro lado (por ejemplo, un aviso). */
export function abrirDatosDeLaObra() {
  window.dispatchEvent(new Event(EVENTO_ABRIR));
}

const EVENTO_ABRIR = "deta:abrir-datos-obra";

/** Lo mínimo para empezar: propietario, calle y número, localidad. */
export function datosMinimosCompletos(obra: DatosObra) {
  return (["propietario", "calle", "numero", "localidad"] as const).every(
    (campo) => obra[campo].trim() !== "",
  );
}

/** Con `comoPaso`, el botón es el paso 1 de la barra de pasos. */
export function DatosObraBoton({ comoPaso = false }: { comoPaso?: boolean } = {}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const { obra, instalador, errorAlGuardar } = useSyncExternalStore(
    suscribirObra,
    leerObraSnapshot,
    leerObraSnapshotServidor,
  );
  const avisos = avisosDatosFaltantes(obra, instalador);

  useEffect(() => {
    const abrir = () => dialogo.current?.showModal();
    window.addEventListener(EVENTO_ABRIR, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR, abrir);
  }, []);

  return (
    <>
      {comoPaso ? (
        <BotonPaso
          activo={false}
          completo={datosMinimosCompletos(obra)}
          etiqueta="Datos de la obra"
          numero={1}
          onClick={() => dialogo.current?.showModal()}
        />
      ) : (
        <button
          className="rounded border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium hover:border-[var(--accent)]"
          type="button"
          onClick={() => dialogo.current?.showModal()}
        >
          Datos de la obra
          {avisos.length > 0 ? (
            <span className="ml-2 text-xs font-normal text-[var(--muted)]">
              {avisos.length} {avisos.length === 1 ? "falta" : "faltan"}
            </span>
          ) : null}
        </button>
      )}

      <dialog
        aria-labelledby="datos-obra-titulo"
        className="m-auto max-h-[92vh] w-[min(920px,94vw)] overflow-auto rounded border border-[var(--line)] bg-white p-0 text-[var(--foreground)] backdrop:bg-black/40"
        ref={dialogo}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <h2 className="text-base font-semibold" id="datos-obra-titulo">
            Datos de la obra
          </h2>
          <button
            className="rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
            type="button"
            onClick={() => dialogo.current?.close()}
          >
            Listo
          </button>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <form
            className="space-y-5"
            onSubmit={(evento) => evento.preventDefault()}
          >
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-2 text-sm font-semibold">La obra</legend>
              {CAMPOS_OBRA.map(({ campo, etiqueta, ancho }) => (
                <Campo ancho={ancho} etiqueta={etiqueta} key={campo}>
                  <input
                    className={CLASE_CONTROL}
                    name={campo}
                    type="text"
                    value={obra[campo]}
                    onChange={(evento) =>
                      actualizarObra({ [campo]: evento.target.value })
                    }
                  />
                </Campo>
              ))}
            </fieldset>

            <CamposCroquis obra={obra} />

            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-1 text-sm font-semibold">
                Datos del instalador
              </legend>
              <p className="col-span-2 text-xs text-[var(--muted)]">
                Se guardan una vez y se usan en todas tus obras.
              </p>
              <Campo ancho etiqueta="Nombre y apellido">
                <input
                  className={CLASE_CONTROL}
                  name="instalador-nombre"
                  type="text"
                  value={instalador.nombre}
                  onChange={(evento) =>
                    actualizarInstalador({ nombre: evento.target.value })
                  }
                />
              </Campo>
              <Campo etiqueta="Matrícula">
                <input
                  className={CLASE_CONTROL}
                  name="instalador-matricula"
                  type="text"
                  value={instalador.matricula}
                  onChange={(evento) =>
                    actualizarInstalador({ matricula: evento.target.value })
                  }
                />
              </Campo>
              <Campo etiqueta="Categoría">
                <select
                  className={CLASE_CONTROL}
                  name="instalador-categoria"
                  value={instalador.categoria}
                  onChange={(evento) =>
                    actualizarInstalador({
                      categoria: evento.target.value as CategoriaInstalador,
                    })
                  }
                >
                  <option value="">Elegir</option>
                  <option value="1">1°</option>
                  <option value="2">2°</option>
                  <option value="3">3°</option>
                </select>
              </Campo>
            </fieldset>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Así sale en el plano</h3>
            <Rotulo contenido={crearRotulo(obra, instalador)} />
            {errorAlGuardar ? (
              <p className="text-sm text-red-700" role="alert">
                {errorAlGuardar}
              </p>
            ) : null}
            {avisos.length > 0 ? (
              <ul className="space-y-1 text-xs text-[var(--muted)]">
                {avisos.slice(0, 3).map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
                {avisos.length > 3 ? (
                  <li>Y {avisos.length - 3} datos más para completar.</li>
                ) : null}
              </ul>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Datos completos. Se guardan solos.
              </p>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

function Campo({
  ancho,
  etiqueta,
  children,
}: {
  ancho?: boolean;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-xs font-medium ${ancho ? "col-span-2" : ""}`}>
      <span className="mb-1 block">{etiqueta}</span>
      {children}
    </label>
  );
}
