import {
  APPLIANCE_EQUIPMENT_DEFINITIONS,
  DEMAND_UNITS,
  equipmentCode,
  equipmentTypeLabel,
  hasPendingDemand,
  type DemandUnit,
  type EquipmentDraft,
  type EquipmentType,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import {
  createDemandNormalizationIndex,
  formatEquipmentDemandWithNormalization,
  normalizeEquipmentDemands,
} from "@/lib/calculation/demandNormalization";
import type { ProjectGasConfig } from "@/lib/calculation/projectGas";

type EquipmentPanelProps = {
  canSaveDraft: boolean;
  draft: EquipmentDraft | null;
  equipment: WorkbenchEquipment[];
  error: string | null;
  isPlanActive: boolean;
  isSectionContent?: boolean;
  planReady: boolean;
  projectGas: ProjectGasConfig | null;
  selectedEquipment: WorkbenchEquipment | null;
  onAddAppliance: () => void;
  onAddSupply: () => void;
  onBeginPlacement: () => void;
  onCancelDraft: () => void;
  onDeleteSelected: () => void;
  onDraftDemandUnitChange: (unit: DemandUnit) => void;
  onDraftDemandValueChange: (value: string) => void;
  onDraftNameChange: (value: string) => void;
  onDraftTypeChange: (type: EquipmentType) => void;
  onDraftWallAlternativeSelect: (index: number) => void;
  onEditSelected: () => void;
  onGoToPlan: () => void;
  onInvertDraftTerminalSide: () => void;
  onRelocateSelected: () => void;
  onSaveDraft: () => void;
  onSelectEquipment: (equipmentId: string) => void;
};

export function EquipmentPanel({
  canSaveDraft,
  draft,
  equipment,
  error,
  isPlanActive,
  isSectionContent = false,
  planReady,
  projectGas,
  selectedEquipment,
  onAddAppliance,
  onAddSupply,
  onBeginPlacement,
  onCancelDraft,
  onDeleteSelected,
  onDraftDemandUnitChange,
  onDraftDemandValueChange,
  onDraftNameChange,
  onDraftTypeChange,
  onDraftWallAlternativeSelect,
  onEditSelected,
  onGoToPlan,
  onInvertDraftTerminalSide,
  onRelocateSelected,
  onSaveDraft,
  onSelectEquipment,
}: EquipmentPanelProps) {
  const demandNormalizationByEquipmentId = createDemandNormalizationIndex(
    normalizeEquipmentDemands(equipment, projectGas),
  );
  const equipmentDemandLabel = (item: WorkbenchEquipment) =>
    formatEquipmentDemandWithNormalization(
      demandNormalizationByEquipmentId.get(item.id),
    );
  const pendingDemandEquipment = equipment.filter(hasPendingDemand);

  return (
    <section
      className={
        isSectionContent
          ? "bg-white px-4 py-3 text-sm"
          : "max-h-[42%] shrink-0 overflow-auto border-t border-[var(--line)] bg-white px-4 py-3 text-sm"
      }
    >
      {!isPlanActive && planReady ? (
        <div className="mb-3 rounded border border-[#ecd5ad] bg-[#fff9ec] px-3 py-2 text-xs text-[var(--warning)]">
          <div>Los equipos se colocan en la Planta</div>
          <button
            className="mt-2 rounded border border-[var(--line)] bg-white px-2 py-1 text-xs hover:border-[var(--accent)]"
            type="button"
            onClick={onGoToPlan}
          >
            Ir a Planta
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-1">
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!planReady || !isPlanActive || Boolean(draft)}
          type="button"
          onClick={onAddSupply}
        >
          Agregar medidor
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!planReady || !isPlanActive || Boolean(draft)}
          type="button"
          onClick={onAddAppliance}
        >
          Agregar artefacto
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      {pendingDemandEquipment.length > 0 ? (
        <div className="mt-3 rounded border border-[#f1d28a] bg-[#fffaf0] px-3 py-2 text-xs text-[var(--warning)]">
          <div className="font-semibold">Falta consumo</div>
          <div className="mt-1">
            {pendingDemandEquipment
              .map((item) => `${equipmentCode(item.type)} ${item.name}`)
              .join(", ")}
          </div>
        </div>
      ) : null}

      {draft ? (
        <DraftEditor
          canSaveDraft={canSaveDraft}
          draft={draft}
          onBeginPlacement={onBeginPlacement}
          onCancelDraft={onCancelDraft}
          onDraftDemandUnitChange={onDraftDemandUnitChange}
          onDraftDemandValueChange={onDraftDemandValueChange}
          onDraftNameChange={onDraftNameChange}
          onDraftTypeChange={onDraftTypeChange}
          onDraftWallAlternativeSelect={onDraftWallAlternativeSelect}
          onInvertDraftTerminalSide={onInvertDraftTerminalSide}
          onSaveDraft={onSaveDraft}
        />
      ) : null}

      <section className="mt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
          Colocados
        </h3>
        {equipment.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Sin equipos colocados.</p>
        ) : (
          <div className="space-y-1">
            {equipment.map((item) => {
              const isSelected = selectedEquipment?.id === item.id;
              const demandPending = hasPendingDemand(item);

              return (
                <div
                  className={`rounded border px-2 py-1 text-xs ${
                    isSelected
                      ? "border-[#6d28d9]"
                      : demandPending
                        ? "border-[#f1d28a] bg-[#fffaf0]"
                      : "border-[var(--line)]"
                  }`}
                  key={item.id}
                >
                  <button
                    className="w-full text-left"
                    type="button"
                    onClick={() => onSelectEquipment(item.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 font-mono font-semibold">
                        {equipmentCode(item.type)}
                      </span>
                      <span className="min-w-0 truncate font-medium">
                        {item.name}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
                      {equipmentTypeLabel(item.type)}
                      {item.role === "appliance"
                        ? ` - ${
                            demandPending
                              ? "Falta consumo"
                              : equipmentDemandLabel(item)
                          }`
                        : ""}
                    </span>
                  </button>
                  {isSelected && !draft ? (
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      <button
                        className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
                        type="button"
                        onClick={onEditSelected}
                      >
                        Editar
                      </button>
                      <button
                        className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
                        type="button"
                        onClick={onRelocateSelected}
                      >
                        Reubicar
                      </button>
                      <button
                        className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
                        type="button"
                        onClick={onDeleteSelected}
                      >
                        Eliminar
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function DraftEditor({
  canSaveDraft,
  draft,
  onBeginPlacement,
  onCancelDraft,
  onDraftDemandUnitChange,
  onDraftDemandValueChange,
  onDraftNameChange,
  onDraftTypeChange,
  onDraftWallAlternativeSelect,
  onInvertDraftTerminalSide,
  onSaveDraft,
}: {
  canSaveDraft: boolean;
  draft: EquipmentDraft;
  onBeginPlacement: () => void;
  onCancelDraft: () => void;
  onDraftDemandUnitChange: (unit: DemandUnit) => void;
  onDraftDemandValueChange: (value: string) => void;
  onDraftNameChange: (value: string) => void;
  onDraftTypeChange: (type: EquipmentType) => void;
  onDraftWallAlternativeSelect: (index: number) => void;
  onInvertDraftTerminalSide: () => void;
  onSaveDraft: () => void;
}) {
  const isEditing = Boolean(draft.editingEquipmentId);
  const isSupply = draft.role === "supply";
  const hasPoint = Boolean(draft.connectionPoint);
  const canInvertSide =
    draft.role === "appliance" &&
    draft.step === "review" &&
    (draft.terminalConfig?.lateralOffsetMeters ?? 0) > 0;

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <h3 className="font-semibold">
        {isEditing
          ? "Editar equipo"
          : isSupply
            ? "Nuevo medidor"
            : "Nuevo artefacto"}
      </h3>

      {!isSupply ? (
        <label className="mt-2 block text-[var(--muted)]">
          <span className="mb-1 block">Tipo</span>
          <select
            className="w-full rounded border border-[var(--line)] px-2 py-1 text-[var(--foreground)] disabled:bg-[#f3f4f6]"
            disabled={isEditing}
            name="equipment-type"
            value={draft.type}
            onChange={(event) =>
              onDraftTypeChange(event.target.value as EquipmentType)
            }
          >
            {APPLIANCE_EQUIPMENT_DEFINITIONS.map((definition) => (
              <option key={definition.type} value={definition.type}>
                {definition.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="mt-2 block text-[var(--muted)]">
        <span className="mb-1 block">Nombre</span>
        <input
          className="w-full rounded border border-[var(--line)] px-2 py-1 text-[var(--foreground)]"
          name="equipment-name"
          type="text"
          value={draft.name}
          onChange={(event) => onDraftNameChange(event.target.value)}
        />
      </label>

      {!isSupply ? (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_90px] gap-2">
          <label className="min-w-0 text-[var(--muted)]">
            <span className="mb-1 block">Consumo</span>
            <input
              className="w-full rounded border border-[var(--line)] px-2 py-1 text-[var(--foreground)]"
              inputMode="decimal"
              name="equipment-demand"
              placeholder="Pendiente"
              type="text"
              value={draft.demandValueInput}
              onChange={(event) => onDraftDemandValueChange(event.target.value)}
            />
          </label>
          <label className="text-[var(--muted)]">
            <span className="mb-1 block">Unidad</span>
            <select
              className="w-full rounded border border-[var(--line)] px-2 py-1 text-[var(--foreground)]"
              name="equipment-demand-unit"
              value={draft.demandUnit}
              onChange={(event) =>
                onDraftDemandUnitChange(event.target.value as DemandUnit)
              }
            >
              {DEMAND_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <p className="mt-2 text-[var(--muted)]">{draftInstruction(draft)}</p>

      {!isSupply && draft.step === "review" ? (
        <div className="mt-2 space-y-2">
          {(draft.wallAlternatives?.length ?? 0) > 1 ? (
            <div className="grid grid-cols-2 gap-1">
              {draft.wallAlternatives?.map((alternative, index) => (
                <button
                  className={`rounded border px-2 py-1 ${
                    draft.selectedWallAlternativeIndex === index
                      ? "border-[var(--accent)] bg-[#eef2ff]"
                      : "border-[var(--line)]"
                  }`}
                  key={`${alternative.wallAnchor.referenceId ?? "wall"}:${index}`}
                  type="button"
                  onClick={() => onDraftWallAlternativeSelect(index)}
                >
                  Pared {index + 1}
                </button>
              ))}
            </div>
          ) : null}
          {canInvertSide ? (
            <button
              className="w-full rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
              type="button"
              onClick={onInvertDraftTerminalSide}
            >
              Invertir lado
            </button>
          ) : null}
        </div>
      ) : null}

      {draft.error ? (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">
          {draft.error}
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-3 gap-1">
        <button
          className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
          type="button"
          onClick={onBeginPlacement}
        >
          {hasPoint ? "Reubicar" : "Ubicar"}
        </button>
        <button
          className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:bg-white disabled:text-[var(--muted)]"
          disabled={!canSaveDraft}
          type="button"
          onClick={onSaveDraft}
        >
          Aceptar
        </button>
        <button
          className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
          type="button"
          onClick={onCancelDraft}
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}

function draftInstruction(draft: EquipmentDraft) {
  if (draft.step === "placing") {
    return draft.role === "supply"
      ? "Hace click en la posicion aproximada del medidor."
      : "Hace click cerca de la pared donde va el artefacto.";
  }

  if (draft.step === "review") {
    return "Preview listo. Acepta para confirmar o reubica si hace falta.";
  }

  return draft.role === "supply"
    ? "Ubica el medidor en la Planta."
    : "Completa tipo, nombre y consumo; despues ubicalo en la Planta.";
}
