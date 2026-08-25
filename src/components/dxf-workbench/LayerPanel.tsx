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
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold">Capas</h2>
        <div className="mt-3 flex gap-2">
          <button
            className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
            disabled={layers.length === 0}
            type="button"
            onClick={() => onSetAll(true)}
          >
            Mostrar
          </button>
          <button
            className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
            disabled={layers.length === 0}
            type="button"
            onClick={() => onSetAll(false)}
          >
            Ocultar
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {layers.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Seleccione un DXF.</p>
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
