"use client";

import { guardarObraEjemplo } from "@/lib/workbench/obraEjemplo";

/** Carga una obra con datos inventados para probar la app sin dibujar nada. */
export function ObraEjemploBoton({ disabled }: { disabled?: boolean }) {
  return (
    <button
      className="mt-3 w-full rounded border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed"
      disabled={disabled}
      type="button"
      onClick={() => {
        guardarObraEjemplo();
        window.location.reload();
      }}
    >
      Probar con una obra de ejemplo
    </button>
  );
}
