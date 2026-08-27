import {
  APPLIANCE_EQUIPMENT_DEFINITIONS,
  DEMAND_UNITS,
  equipmentCode,
  equipmentTypeLabel,
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
  isTraceReady: boolean;
  pendingDemandCount: number;
  planReady: boolean;
  projectGas: ProjectGasConfig | null;
  selectedEquipment: WorkbenchEquipment | null;
  showEquipment: boolean;
  supplyCount: number;
  onAddAppliance: () => void;
  onAddSupply: () => void;
  onBeginPlacement: () => void;
  onCancelDraft: () => void;
  onDeleteSelected: () => void;
  onDraftDemandUnitChange: (unit: DemandUnit) => void;
  onDraftDemandValueChange: (value: string) => void;
  onDraftNameChange: (value: string) => void;
  onDraftNotesChange: (value: string) => void;
  onDraftTypeChange: (type: EquipmentType) => void;
  onEditSelected: () => void;
  onGoToPlan: () => void;
  onRelocateSelected: () => void;
  onSaveDraft: () => void;
  onSelectEquipment: (equipmentId: string) => void;
  onShowEquipmentChange: (show: boolean) => void;
};

export function EquipmentPanel({
  canSaveDraft,
  draft,
  equipment,
  error,
  isPlanActive,
  isSectionContent = false,
  isTraceReady,
  pendingDemandCount,
  planReady,
  projectGas,
  selectedEquipment,
  showEquipment,
  supplyCount,
  onAddAppliance,
  onAddSupply,
  onBeginPlacement,
  onCancelDraft,
  onDeleteSelected,
  onDraftDemandUnitChange,
  onDraftDemandValueChange,
  onDraftNameChange,
  onDraftNotesChange,
  onDraftTypeChange,
  onEditSelected,
  onGoToPlan,
  onRelocateSelected,
  onSaveDraft,
  onSelectEquipment,
  onShowEquipmentChange,
}: EquipmentPanelProps) {
  const applianceCount = equipment.filter(
    (item) => item.role === "appliance",
  ).length;
  const demandNormalizationByEquipmentId = createDemandNormalizationIndex(
    normalizeEquipmentDemands(equipment, projectGas),
  );
  const equipmentDemandLabel = (item: WorkbenchEquipment) =>
    formatEquipmentDemandWithNormalization(
      demandNormalizationByEquipmentId.get(item.id),
    );

  return (
    <section
      className={
        isSectionContent
          ? "bg-white px-4 py-3 text-sm"
          : "max-h-[42%] shrink-0 overflow-auto border-t border-[var(--line)] bg-white px-4 py-3 text-sm"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className={isSectionContent ? "sr-only" : "text-sm font-semibold"}>
            Equipos
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {planReady
              ? isTraceReady
                ? "Preparado para trazado"
                : "Etapa incompleta"
              : "Sin Planta"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            checked={showEquipment}
            disabled={!planReady}
            name="show-equipment"
            type="checkbox"
            onChange={(event) => onShowEquipmentChange(event.target.checked)}
          />
          Mostrar equipos
        </label>
      </div>

      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_70px] gap-x-2 gap-y-1 text-xs">
        <dt>Alimentación</dt>
        <dd className="text-right font-medium">
          {supplyCount === 1 ? "lista" : "pendiente"}
        </dd>
        <dt>Artefactos</dt>
        <dd className="text-right font-mono">{applianceCount}</dd>
        <dt>Consumos pendientes</dt>
        <dd className="text-right font-mono">{pendingDemandCount}</dd>
      </dl>

      {!isPlanActive && planReady ? (
        <div className="mt-3 rounded border border-[#ecd5ad] bg-[#fff9ec] px-3 py-2 text-xs text-[var(--warning)]">
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

      <div className="mt-3 grid grid-cols-2 gap-1">
        <button
          className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:text-[var(--muted)]"
          disabled={!planReady || !isPlanActive || Boolean(draft)}
          type="button"
          onClick={onAddSupply}
        >
          Agregar alimentación
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

      {draft ? (
        <DraftEditor
          canSaveDraft={canSaveDraft}
          draft={draft}
          onBeginPlacement={onBeginPlacement}
          onCancelDraft={onCancelDraft}
          onDraftDemandUnitChange={onDraftDemandUnitChange}
          onDraftDemandValueChange={onDraftDemandValueChange}
          onDraftNameChange={onDraftNameChange}
          onDraftNotesChange={onDraftNotesChange}
          onDraftTypeChange={onDraftTypeChange}
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
            {equipment.map((item) => (
              <button
                className={`w-full rounded border px-2 py-1 text-left text-xs ${selectedEquipment?.id === item.id ? "border-[#6d28d9]" : "border-[var(--line)]"}`}
                key={item.id}
                type="button"
                onClick={() => onSelectEquipment(item.id)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-mono font-semibold">
                    {equipmentCode(item.type)}
                  </span>
                  <span className="min-w-0 truncate font-medium">{item.name}</span>
                </span>
                <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
                  {equipmentTypeLabel(item.type)} - {equipmentDemandLabel(item)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedEquipment && !draft ? (
        <div className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
          <div className="font-semibold">{selectedEquipment.name}</div>
          <div className="mt-1 text-[var(--muted)]">
            {equipmentTypeLabel(selectedEquipment.type)} -{" "}
            {equipmentDemandLabel(selectedEquipment)}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <button
              className="rounded border border-[var(--line)] px-2 py-1 hover:border-[var(--accent)]"
              type="button"
              onClick={onEditSelected}
            >
              Editar datos
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
        </div>
      ) : null}
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
  onDraftNotesChange,
  onDraftTypeChange,
  onSaveDraft,
}: {
  canSaveDraft: boolean;
  draft: EquipmentDraft;
  onBeginPlacement: () => void;
  onCancelDraft: () => void;
  onDraftDemandUnitChange: (unit: DemandUnit) => void;
  onDraftDemandValueChange: (value: string) => void;
  onDraftNameChange: (value: string) => void;
  onDraftNotesChange: (value: string) => void;
  onDraftTypeChange: (type: EquipmentType) => void;
  onSaveDraft: () => void;
}) {
  const isEditing = Boolean(draft.editingEquipmentId);
  const isSupply = draft.role === "supply";
  const hasPoint = Boolean(draft.connectionPoint);
  const placementLabel = hasPoint ? "Volver a ubicar" : "Ubicar en Planta";

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <h3 className="font-semibold">
        {isEditing ? "Editar equipo" : isSupply ? "Nueva alimentación" : "Nuevo artefacto"}
      </h3>

      {!isSupply ? (
        <label className="mt-2 block text-[var(--muted)]">
          <span className="mb-1 block">Tipo</span>
          <select
          className="w-full rounded border border-[var(--line)] px-2 py-1 text-[var(--foreground)] disabled:bg-[#f3f4f6]"
          disabled={isEditing}
          name="equipment-type"
          value={draft.type}
            onChange={(event) => onDraftTypeChange(event.target.value as EquipmentType)}
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
              onChange={(event) => onDraftDemandUnitChange(event.target.value as DemandUnit)}
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

      <label className="mt-2 block text-[var(--muted)]">
        <span className="mb-1 block">Notas</span>
        <textarea
          className="min-h-16 w-full resize-y rounded border border-[var(--line)] px-2 py-1 text-[var(--foreground)]"
          name="equipment-notes"
          value={draft.notes}
          onChange={(event) => onDraftNotesChange(event.target.value)}
        />
      </label>

      <p className="mt-2 text-[var(--muted)]">
        {draft.step === "placing"
          ? isSupply
            ? "Marcá en la Planta el punto de salida del medidor/regulador"
            : "Marcá en la Planta el punto de conexión de gas"
          : hasPoint
            ? "Punto de conexión definido"
            : "Sin punto de conexión"}
      </p>

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
          {placementLabel}
        </button>
        <button
          className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:bg-white disabled:text-[var(--muted)]"
          disabled={!canSaveDraft}
          type="button"
          onClick={onSaveDraft}
        >
          Guardar
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
