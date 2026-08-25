import type { NormalizedDrawing } from "@/lib/geometry/types";
import {
  SEMANTIC_CATEGORY_LABELS,
  SEMANTIC_CATEGORY_ORDER,
} from "@/lib/semantic/labels";
import type {
  ClassificationIndex,
  ClassificationProposal,
  ManualSelectionMode,
  SemanticCategory,
  SemanticInspection,
  SemanticViewMode,
} from "@/lib/semantic/types";

type GeometryPreparationPanelProps = {
  classificationIndex: ClassificationIndex;
  drawing: NormalizedDrawing | null;
  isSectionContent?: boolean;
  inspection: SemanticInspection | null;
  proposals: ClassificationProposal[];
  selectedEntityIds: string[];
  selectionMode: ManualSelectionMode;
  semanticViewMode: SemanticViewMode;
  onAnalyze: () => void;
  onAssignSelection: (category: SemanticCategory) => void;
  onChangeProposal: (proposalId: string) => void;
  onClearSelection: () => void;
  onConfirmProposal: (proposalId: string) => void;
  onDiscardProposal: (proposalId: string) => void;
  onSelectColor: (color: string) => void;
  onSelectLayer: (layer: string) => void;
  onSelectionModeChange: (mode: ManualSelectionMode) => void;
  onSemanticViewModeChange: (mode: SemanticViewMode) => void;
};

export function GeometryPreparationPanel({
  classificationIndex,
  drawing,
  isSectionContent = false,
  inspection,
  proposals,
  selectedEntityIds,
  selectionMode,
  semanticViewMode,
  onAnalyze,
  onAssignSelection,
  onChangeProposal,
  onClearSelection,
  onConfirmProposal,
  onDiscardProposal,
  onSelectColor,
  onSelectLayer,
  onSelectionModeChange,
  onSemanticViewModeChange,
}: GeometryPreparationPanelProps) {
  const summary = createSummary(classificationIndex);
  const pendingCount = proposals.filter(
    (proposal) =>
      proposal.status === "pending" || proposal.status === "modified",
  ).length;
  const colorOptions = inspection?.colors ?? [];

  return (
    <section
      className={
        isSectionContent
          ? "bg-white px-4 py-3 text-sm"
          : "max-h-[54%] shrink-0 overflow-auto border-t border-[var(--line)] bg-white px-4 py-3 text-sm"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className={isSectionContent ? "sr-only" : "text-sm font-semibold"}>
            Preparar geometria
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {drawing ? `${drawing.entities.length} primitivas` : "Sin DXF"}
          </p>
        </div>
        <button
          className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-xs text-white hover:bg-[var(--accent-strong)]"
          disabled={!drawing}
          type="button"
          onClick={onAnalyze}
        >
          Analizar dibujo
        </button>
      </div>

      <div className="mt-3 flex overflow-hidden rounded border border-[var(--line)]">
        <button
          className={`flex-1 px-2 py-1 text-xs ${semanticViewMode === "original" ? "bg-[var(--accent)] text-white" : "bg-white"}`}
          type="button"
          onClick={() => onSemanticViewModeChange("original")}
        >
          Vista original
        </button>
        <button
          className={`flex-1 border-l border-[var(--line)] px-2 py-1 text-xs ${semanticViewMode === "prepared" ? "bg-[var(--accent)] text-white" : "bg-white"}`}
          type="button"
          onClick={() => onSemanticViewModeChange("prepared")}
        >
          Vista preparada
        </button>
      </div>

      {inspection ? (
        <section className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
            Inspeccion
          </h3>
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
            <dt className="text-[var(--muted)]">Colores distintos</dt>
            <dd>{inspection.colors.length}</dd>
            <dt className="text-[var(--muted)]">Color explicito</dt>
            <dd>{inspection.explicitColorCount}</dd>
            <dt className="text-[var(--muted)]">TrueColor</dt>
            <dd>{inspection.trueColorCount}</dd>
            <dt className="text-[var(--muted)]">BYLAYER</dt>
            <dd>{inspection.byLayerCount}</dd>
            <dt className="text-[var(--muted)]">BYBLOCK</dt>
            <dd>{inspection.byBlockCount}</dd>
            <dt className="text-[var(--muted)]">Sin diferenciacion</dt>
            <dd>{inspection.visuallyUndifferentiatedCount}</dd>
          </dl>
          <div className="mt-2 space-y-1">
            {inspection.layers.map((layer) => (
              <div className="flex justify-between gap-2 text-xs" key={layer.name}>
                <span className="truncate">{layer.name}</span>
                <span className="font-mono text-[var(--muted)]">{layer.entityCount}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
          Sugerencias
        </h3>
        {proposals.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Ejecute el analisis.</p>
        ) : (
          <div className="space-y-2">
            {proposals.map((proposal) => (
              <article
                className="rounded border border-[var(--line)] px-2 py-2"
                key={proposal.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">
                      {proposal.id.replace("layer:", "Capa ")}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {SEMANTIC_CATEGORY_LABELS[proposal.category]} - {proposal.entityIds.length} - {Math.round(proposal.confidence * 100)}%
                    </div>
                  </div>
                  <span className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px]">
                    {proposal.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">{proposal.explanation}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                    disabled={proposal.status === "discarded"}
                    type="button"
                    onClick={() => onConfirmProposal(proposal.id)}
                  >
                    Confirmar
                  </button>
                  <button
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                    disabled={proposal.status === "discarded"}
                    type="button"
                    onClick={() => onChangeProposal(proposal.id)}
                  >
                    Cambiar
                  </button>
                  <button
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                    disabled={proposal.status === "discarded"}
                    type="button"
                    onClick={() => onDiscardProposal(proposal.id)}
                  >
                    Descartar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
          Clasificacion manual
        </h3>
        <div className="grid grid-cols-3 gap-1">
          {(["pan", "entity", "rectangle"] as ManualSelectionMode[]).map((mode) => (
            <button
              className={`rounded border border-[var(--line)] px-2 py-1 text-xs ${selectionMode === mode ? "bg-[var(--accent)] text-white" : "bg-white"}`}
              key={mode}
              type="button"
              onClick={() => onSelectionModeChange(mode)}
            >
              {modeLabel(mode)}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            className="min-w-0 rounded border border-[var(--line)] px-2 py-1 text-xs"
            disabled={!drawing}
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) {
                onSelectLayer(event.target.value);
                event.target.value = "";
              }
            }}
          >
            <option value="">Seleccionar capa</option>
            {drawing?.layers.map((layer) => (
              <option key={layer.name} value={layer.name}>
                {layer.name}
              </option>
            ))}
          </select>
          <select
            className="min-w-0 rounded border border-[var(--line)] px-2 py-1 text-xs"
            disabled={colorOptions.length === 0}
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) {
                onSelectColor(event.target.value);
                event.target.value = "";
              }
            }}
          >
            <option value="">Seleccionar color</option>
            {colorOptions.map((color) => (
              <option key={color.color} value={color.color}>
                {color.color} ({color.entityCount})
              </option>
            ))}
          </select>
        </div>

        <p className="mt-2 text-xs text-[var(--muted)]">
          Seleccion: {selectedEntityIds.length}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {SEMANTIC_CATEGORY_ORDER.map((category) => (
            <button
              className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
              disabled={selectedEntityIds.length === 0}
              key={category}
              type="button"
              onClick={() => onAssignSelection(category)}
            >
              {SEMANTIC_CATEGORY_LABELS[category]}
            </button>
          ))}
          <button
            className="col-span-2 rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
            disabled={selectedEntityIds.length === 0}
            type="button"
            onClick={onClearSelection}
          >
            Limpiar seleccion
          </button>
        </div>
      </section>

      <section className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
          Resumen
        </h3>
        <dl className="grid grid-cols-[minmax(0,1fr)_55px] gap-x-2 gap-y-1 text-xs">
          <dt>Estructura confirmada</dt>
          <dd className="text-right font-mono">{summary.hard_structure}</dd>
          <dt>Muros confirmados</dt>
          <dd className="text-right font-mono">{summary.reference_wall}</dd>
          <dt>Aberturas confirmadas</dt>
          <dd className="text-right font-mono">{summary.opening}</dd>
          <dt>Pendientes</dt>
          <dd className="text-right font-mono">{pendingCount}</dd>
          <dt>Sin clasificar</dt>
          <dd className="text-right font-mono">{summary.unclassified}</dd>
        </dl>
      </section>
    </section>
  );
}

function createSummary(classificationIndex: ClassificationIndex) {
  const summary: Record<SemanticCategory, number> = {
    hard_structure: 0,
    reference_wall: 0,
    opening: 0,
    unclassified: 0,
  };

  for (const classification of Object.values(classificationIndex)) {
    summary[classification.category] += 1;
  }

  return summary;
}

function modeLabel(mode: ManualSelectionMode) {
  if (mode === "entity") {
    return "Entidad";
  }

  if (mode === "rectangle") {
    return "Rectangulo";
  }

  return "Navegar";
}
