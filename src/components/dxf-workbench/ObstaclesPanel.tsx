import type {
  ConstraintDraft,
  ConstraintSummary,
  ConstraintToolMode,
  ManualConstraint,
} from "@/lib/constraints/types";
import { isValidPolygon } from "@/lib/constraints/geometry";

type ObstaclesPanelProps = {
  activeConstraints: ManualConstraint[];
  draft: ConstraintDraft | null;
  isSectionContent?: boolean;
  selectedConstraint: ManualConstraint | null;
  showConstraints: boolean;
  sourceLabel: string;
  sourceReady: boolean;
  summary: ConstraintSummary;
  toolMode: ConstraintToolMode;
  onCancelDraft: () => void;
  onDeleteSelected: () => void;
  onFinishDraft: () => void;
  onSelectConstraint: (constraintId: string) => void;
  onShowConstraintsChange: (show: boolean) => void;
  onToggleSelectedActive: () => void;
  onToolModeChange: (mode: ConstraintToolMode) => void;
};

export function ObstaclesPanel({
  activeConstraints,
  draft,
  isSectionContent = false,
  selectedConstraint,
  showConstraints,
  sourceLabel,
  sourceReady,
  summary,
  toolMode,
  onCancelDraft,
  onDeleteSelected,
  onFinishDraft,
  onSelectConstraint,
  onShowConstraintsChange,
  onToggleSelectedActive,
  onToolModeChange,
}: ObstaclesPanelProps) {
  const canFinishDraft =
    draft?.shape === "polygon" ? isValidPolygon(draft.points) : false;

  return (
    <section
      className={
        isSectionContent
          ? "bg-white px-4 py-3 text-sm"
          : "max-h-[34%] shrink-0 overflow-auto border-t border-[var(--line)] bg-white px-4 py-3 text-sm"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className={isSectionContent ? "sr-only" : "text-sm font-semibold"}>
            Obstaculos
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{sourceLabel}</p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            checked={showConstraints}
            name="show-constraints"
            type="checkbox"
            onChange={(event) => onShowConstraintsChange(event.target.checked)}
          />
          Mostrar
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1">
        <ToolButton
          disabled={!sourceReady}
          isActive={toolMode === "none"}
          label="Navegar"
          onClick={() => onToolModeChange("none")}
        />
        <ToolButton
          disabled={!sourceReady}
          isActive={toolMode === "select"}
          label="Seleccionar"
          onClick={() => onToolModeChange("select")}
        />
        <ToolButton
          disabled={!sourceReady}
          isActive={toolMode === "draw_hard_rect"}
          label="Rectangulo"
          onClick={() => onToolModeChange("draw_hard_rect")}
        />
        <ToolButton
          disabled={!sourceReady}
          isActive={toolMode === "draw_hard_polygon"}
          label="Poligono"
          onClick={() => onToolModeChange("draw_hard_polygon")}
        />
        <ToolButton
          disabled={!sourceReady}
          isActive={toolMode === "draw_avoid_polygon"}
          label="Zona evitar"
          onClick={() => onToolModeChange("draw_avoid_polygon")}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1">
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!canFinishDraft}
          type="button"
          onClick={onFinishDraft}
        >
          Finalizar
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!draft}
          type="button"
          onClick={onCancelDraft}
        >
          Cancelar
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_55px] gap-x-2 gap-y-1 text-xs">
        <dt>Estructura</dt>
        <dd className="text-right font-mono">{summary.structuralPrimitiveCount}</dd>
        <dt>Obstaculos</dt>
        <dd className="text-right font-mono">{summary.manualObstacleCount}</dd>
        <dt>Zonas evitar</dt>
        <dd className="text-right font-mono">{summary.avoidZoneCount}</dd>
        <dt>Restricciones activas</dt>
        <dd className="text-right font-mono">{summary.activeRestrictionCount}</dd>
      </dl>

      <section className="mt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
          Manuales
        </h3>
        {activeConstraints.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Sin zonas manuales.</p>
        ) : (
          <div className="space-y-1">
            {activeConstraints.map((constraint) => (
              <button
                className={`w-full rounded border px-2 py-1 text-left text-xs ${selectedConstraint?.id === constraint.id ? "border-[#e11d48]" : "border-[var(--line)]"}`}
                key={constraint.id}
                type="button"
                onClick={() => onSelectConstraint(constraint.id)}
              >
                <span className="block truncate">{labelForConstraint(constraint)}</span>
                <span className="block text-[10px] text-[var(--muted)]">
                  {constraint.active ? "activa" : "desactivada"} - {constraint.polygon.length} vertices
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="mt-3 grid grid-cols-2 gap-1">
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!selectedConstraint}
          type="button"
          onClick={onToggleSelectedActive}
        >
          {selectedConstraint?.active === false ? "Activar" : "Desactivar"}
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!selectedConstraint}
          type="button"
          onClick={onDeleteSelected}
        >
          Eliminar
        </button>
      </div>
    </section>
  );
}

function ToolButton({
  disabled,
  isActive,
  label,
  onClick,
}: {
  disabled: boolean;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded border border-[var(--line)] px-2 py-1 text-xs ${isActive ? "bg-[var(--accent)] text-white" : "bg-white"} disabled:text-[var(--muted)]`}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function labelForConstraint(constraint: ManualConstraint) {
  const prefix =
    constraint.type === "hard_obstacle" ? "Obstaculo" : "Zona a evitar";

  return `${prefix} ${constraint.id.replace("manual:", "")}`;
}
