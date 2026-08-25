import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { RouteDraft } from "@/lib/routing/types";

type RouteContextCardProps = {
  draft: RouteDraft;
  target: WorkbenchEquipment | null;
  onBackDraft: () => void;
  onCancelDraft: () => void;
  onSaveDraft: () => void;
  onUndoDraftPoint: () => void;
};

export function RouteContextCard({
  draft,
  target,
  onBackDraft,
  onCancelDraft,
  onSaveDraft,
  onUndoDraftPoint,
}: RouteContextCardProps) {
  const targetName = target?.name ?? "artefacto";
  const canUndo = draft.step === "drawing" && draft.routePoints.length > 0;
  const canSave = draft.step === "review" && !draft.error;
  const pointCount =
    (draft.originPoint ? 1 : 0) +
    draft.routePoints.length +
    (draft.step === "review" ? 1 : 0);

  return (
    <div
      className="absolute left-4 top-4 z-20 w-[min(380px,calc(100%-32px))] rounded border border-[var(--line)] bg-white/95 px-3 py-2 text-xs shadow-sm"
      data-route-context-card="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            Conectar: {target ? targetName : "elegir artefacto"}
          </div>
          <div className="mt-1 text-[var(--muted)]">{stageLabel(draft, targetName)}</div>
        </div>
        <span className="shrink-0 rounded border border-[var(--line)] px-2 py-1 font-mono text-[10px]">
          {pointCount} pts
        </span>
      </div>

      <p className="mt-2 text-[var(--foreground)]">
        {instructionForDraft(draft, targetName)}
      </p>

      {draft.error ? (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">
          {draft.error}
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-3 gap-1">
        <button
          className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!canUndo}
          type="button"
          onClick={onUndoDraftPoint}
        >
          Deshacer ultimo punto
        </button>
        <button
          className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
          disabled={!canSave}
          type="button"
          onClick={onSaveDraft}
        >
          Guardar conexion
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
          type="button"
          onClick={onCancelDraft}
        >
          Cancelar
        </button>
      </div>

      {draft.step === "review" ? (
        <button
          className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
          type="button"
          onClick={onBackDraft}
        >
          Volver a editar
        </button>
      ) : null}
    </div>
  );
}

function stageLabel(draft: RouteDraft, targetName: string) {
  if (draft.step === "target") {
    return "Elegir artefacto";
  }

  if (draft.step === "origin") {
    return "Elegi el inicio en la red";
  }

  if (draft.step === "drawing" && draft.routePoints.length === 0) {
    return `Pulsa ${targetName} para finalizar`;
  }

  if (draft.step === "drawing") {
    return "Marca el recorrido";
  }

  return "Revisa y guarda la conexion";
}

function instructionForDraft(draft: RouteDraft, targetName: string) {
  if (draft.step === "target") {
    return "Elegi el artefacto sin conectar en el panel Trazado.";
  }

  if (draft.step === "origin") {
    return "Pulsa el medidor, un nodo existente o un punto sobre un segmento.";
  }

  if (draft.step === "drawing") {
    return `Marca vertices o pulsa ${targetName} para finalizar.`;
  }

  return "Revisa la previsualizacion completa antes de guardar.";
}
