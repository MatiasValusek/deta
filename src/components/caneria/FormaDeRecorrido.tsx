"use client";

/*
 * Arriba del paso Cañería: por dónde va el caño. Solo "Directo" está hecho; las otras dos formas
 * están escritas en PLAN.md ("Perimetral y Por la pared") y aparecen deshabilitadas.
 */

export type FormaDeRecorrido = "directo" | "perimetral" | "porLaPared";

const FORMAS: Array<{ id: FormaDeRecorrido; nombre: string; ayuda: string; lista: boolean }> = [
  { ayuda: "Cruza por el medio de los ambientes, a 90°.", id: "directo", lista: true, nombre: "Directo" },
  { ayuda: "Por el piso, cerca de la pared; sube en cada artefacto.", id: "perimetral", lista: false, nombre: "Perimetral" },
  { ayuda: "Por la pared, a una altura; sube o baja a cada artefacto.", id: "porLaPared", lista: false, nombre: "Por la pared" },
];

export function FormaDeRecorridoBotones(props: { elegida: FormaDeRecorrido; onElegir: (forma: FormaDeRecorrido) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Forma del recorrido">
      {FORMAS.map((forma) => {
        const elegida = forma.lista && props.elegida === forma.id;
        return (
          <button
            aria-checked={elegida}
            className={`rounded border px-2 py-1.5 text-left disabled:cursor-not-allowed ${
              elegida
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : forma.lista
                  ? "border-[var(--line)] bg-white hover:border-[var(--accent)]"
                  : "border-[var(--line)] bg-[#f6f6f4] text-[var(--muted)]"
            }`}
            disabled={!forma.lista}
            key={forma.id}
            role="radio"
            title={forma.ayuda}
            type="button"
            onClick={() => props.onElegir(forma.id)}
          >
            <span className="block text-[13px] font-semibold">{forma.nombre}</span>
            <span className={`block text-[11px] ${elegida ? "text-white/85" : "text-[var(--muted)]"}`}>
              {forma.lista ? "A 90°, lo más corto" : "Próximamente"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
