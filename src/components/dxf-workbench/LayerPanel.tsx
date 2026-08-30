import type { DrawingLayer } from "@/lib/geometry/types";
import type { LayerVisibility } from "./DxfWorkbench";

type LayerPanelProps = {
  layers: DrawingLayer[];
  visibility: LayerVisibility;
  counts: Record<string, number>;
  onToggle: (layerName: string) => void;
  onSetAll: (visible: boolean) => void;
};

export function LayerPanel({
  layers,
  visibility,
  counts,
  onToggle,
  onSetAll,
}: LayerPanelProps) {
  const allLayersVisible =
    layers.length > 0 &&
    layers.every((layer) => visibility[layer.name] ?? layer.visible);
  const nextGlobalVisibility = !allLayersVisible;
  const globalVisibilityLabel = nextGlobalVisibility
    ? "Mostrar todas las capas"
    : "Ocultar todas las capas";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold">Capas</h2>
        <button
          aria-label={globalVisibilityLabel}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:bg-[#f5f6f7] disabled:text-[var(--muted)]"
          disabled={layers.length === 0}
          title={globalVisibilityLabel}
          type="button"
          onClick={() => onSetAll(nextGlobalVisibility)}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
          >
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
            <circle cx="12" cy="12" r="2.8" />
            {!allLayersVisible ? <path d="M4 4l16 16" /> : null}
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {layers.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin capas disponibles.</p>
        ) : (
          <div className="space-y-1">
            {layers.map((layer) => {
              const checked = visibility[layer.name] ?? layer.visible;
              const count = counts[layer.name] ?? 0;

              return (
                <label
                  className="flex min-h-9 items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[#eef3ef]"
                  key={layer.id}
                >
                  <input
                    checked={checked}
                    className="h-4 w-4 accent-[var(--accent)]"
                    name={`layer-visibility-${layer.id}`}
                    type="checkbox"
                    onChange={() => onToggle(layer.name)}
                  />
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 border border-black/10"
                    style={{
                      backgroundColor:
                        layer.trueColor ?? layer.color ?? fallbackLayerColor(layer.name),
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{layer.name}</span>
                  <span className="font-mono text-xs text-[var(--muted)]">{count}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function fallbackLayerColor(name: string) {
  const palette = [
    "#2b6f77",
    "#8a4f2d",
    "#5f6f2b",
    "#7c4f8a",
    "#37694a",
    "#9a3f50",
    "#365f9a",
  ];
  let hash = 0;

  for (const character of name) {
    hash = (hash + character.charCodeAt(0)) % palette.length;
  }

  return palette[hash];
}
