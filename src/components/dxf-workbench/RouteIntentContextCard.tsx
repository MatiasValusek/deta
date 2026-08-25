import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  RouteIntentDraft,
  RouteIntentEndpoint,
} from "@/lib/routing/types";

type RouteIntentContextCardProps = {
  draft: RouteIntentDraft;
  equipment: WorkbenchEquipment[];
  onCancelDraft: () => void;
  onSaveDraft: () => void;
};

export function RouteIntentContextCard({
  draft,
  equipment,
  onCancelDraft,
  onSaveDraft,
}: RouteIntentContextCardProps) {
  const canSave = Boolean(
    draft.step === "review" && !draft.error && draft.from && draft.to,
  );

  return (
    <div
      className="absolute left-4 top-4 z-20 w-[min(360px,calc(100%-32px))] rounded border border-[var(--line)] bg-white/95 px-3 py-2 text-xs shadow-sm"
      data-route-intent-context-card="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">Conexion manual</div>
          <div className="mt-1 text-[var(--muted)]">{stageLabel(draft)}</div>
        </div>
        <span className="shrink-0 rounded border border-[var(--line)] px-2 py-1 font-mono text-[10px]">
          {draft.step === "review" ? "2 pts" : draft.from ? "1 pt" : "0 pts"}
        </span>
      </div>

      <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1">
        <div>Desde: {endpointLabel(draft.from, equipment)}</div>
        <div>Hacia: {endpointLabel(draft.to, equipment)}</div>
      </div>

      {draft.error ? (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">
          {draft.error}
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-1">
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
    </div>
  );
}

function stageLabel(draft: RouteIntentDraft) {
  if (draft.step === "from") {
    return "Elegi el inicio";
  }

  if (draft.step === "to") {
    return "Elegi el destino";
  }

  return "Revisa y guarda";
}

function endpointLabel(
  endpoint: RouteIntentEndpoint | null,
  equipment: WorkbenchEquipment[],
) {
  if (!endpoint) {
    return "sin definir";
  }

  const item = equipment.find((equipmentItem) => equipmentItem.id === endpoint.equipmentId);

  if (!item) {
    return "equipo eliminado";
  }

  return item.role === "supply" ? "M" : item.name;
}
