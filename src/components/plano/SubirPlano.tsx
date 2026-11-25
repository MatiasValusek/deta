"use client";

import { ObraEjemploBoton } from "@/components/dxf-workbench/ObraEjemploBoton";

/** Paso 2 sin plano todavía: un recuadro grande para subirlo. */
export function SubirPlano({ importando, onSubir }: { importando: boolean; onSubir: () => void }) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center bg-[#eef0ec] px-6 py-10">
      <div className="w-full max-w-md rounded border-2 border-dashed border-[#b9c2bc] bg-white px-8 py-10 text-center">
        <h2 className="text-2xl font-semibold tracking-normal">Subí el plano</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          DXF o PDF. Si el archivo trae la escala, la app la toma sola.
        </p>
        <button
          className="mt-6 w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
          disabled={importando}
          type="button"
          onClick={onSubir}
        >
          {importando ? "Abriendo el plano…" : "Elegir archivo"}
        </button>
        <ObraEjemploBoton disabled={importando} />
      </div>
    </div>
  );
}
