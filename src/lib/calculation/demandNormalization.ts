import {
  demandUnitLabel,
  type DemandUnit,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import {
  isUsableHeatingValueKcalPerM3,
  type ProjectGasConfig,
} from "@/lib/calculation/projectGas";

export type EquipmentDemandNormalizationStatus = "resolved" | "unresolved";

export type EquipmentDemandNormalizationSource =
  | "declared_m3_h"
  | "declared_kcal_h_project_heating_value"
  | "invalid_declared_demand"
  | "missing_declared_demand"
  | "missing_project_heating_value";

export type EquipmentDemandNormalizationMethod =
  | "direct_m3_h"
  | "kcal_h_divided_by_heating_value"
  | "none";

export type EquipmentDemandNormalization = {
  equipmentId: string;
  heatingValueKcalPerM3: number | null;
  method: EquipmentDemandNormalizationMethod;
  normalizedFlowM3h: number | null;
  originalUnit: DemandUnit | null;
  originalValue: number | null;
  reason: string | null;
  source: EquipmentDemandNormalizationSource;
  status: EquipmentDemandNormalizationStatus;
};

export function normalizeEquipmentDemand(
  equipment: WorkbenchEquipment,
  projectGas: ProjectGasConfig | null,
): EquipmentDemandNormalization {
  const originalValue =
    equipment.demandValue !== undefined &&
    Number.isFinite(equipment.demandValue)
      ? equipment.demandValue
      : null;
  const originalUnit = equipment.demandUnit ?? null;

  if (originalValue === null || !originalUnit) {
    return {
      equipmentId: equipment.id,
      heatingValueKcalPerM3: projectGas?.heatingValueKcalPerM3 ?? null,
      method: "none",
      normalizedFlowM3h: null,
      originalUnit,
      originalValue,
      reason: "Falta valor o unidad de consumo del artefacto.",
      source: "missing_declared_demand",
      status: "unresolved",
    };
  }

  if (originalValue <= 0) {
    return {
      equipmentId: equipment.id,
      heatingValueKcalPerM3: projectGas?.heatingValueKcalPerM3 ?? null,
      method: "none",
      normalizedFlowM3h: null,
      originalUnit,
      originalValue,
      reason: "El consumo del artefacto debe ser mayor a cero.",
      source: "invalid_declared_demand",
      status: "unresolved",
    };
  }

  if (originalUnit === "m3_h") {
    return {
      equipmentId: equipment.id,
      heatingValueKcalPerM3: projectGas?.heatingValueKcalPerM3 ?? null,
      method: "direct_m3_h",
      normalizedFlowM3h: originalValue,
      originalUnit,
      originalValue,
      reason: null,
      source: "declared_m3_h",
      status: "resolved",
    };
  }

  const heatingValueKcalPerM3 = projectGas?.heatingValueKcalPerM3 ?? null;

  if (!isUsableHeatingValueKcalPerM3(heatingValueKcalPerM3)) {
    return {
      equipmentId: equipment.id,
      heatingValueKcalPerM3,
      method: "none",
      normalizedFlowM3h: null,
      originalUnit,
      originalValue,
      reason:
        "Falta poder calorifico valido del gas de proyecto para convertir kcal/h a m3/h.",
      source: "missing_project_heating_value",
      status: "unresolved",
    };
  }

  return {
    equipmentId: equipment.id,
    heatingValueKcalPerM3,
    method: "kcal_h_divided_by_heating_value",
    normalizedFlowM3h: originalValue / heatingValueKcalPerM3,
    originalUnit,
    originalValue,
    reason: null,
    source: "declared_kcal_h_project_heating_value",
    status: "resolved",
  };
}

export function normalizeEquipmentDemands(
  equipment: WorkbenchEquipment[],
  projectGas: ProjectGasConfig | null,
) {
  return equipment
    .filter((item) => item.role === "appliance")
    .map((item) => normalizeEquipmentDemand(item, projectGas))
    .sort((first, second) => first.equipmentId.localeCompare(second.equipmentId));
}

export function createDemandNormalizationIndex(
  normalizations: EquipmentDemandNormalization[],
) {
  return new Map(
    normalizations.map((normalization) => [
      normalization.equipmentId,
      normalization,
    ]),
  );
}

export function formatEquipmentDemandWithNormalization(
  normalization: EquipmentDemandNormalization | null | undefined,
) {
  if (!normalization) {
    return "Consumo pendiente";
  }

  const original = formatOriginalDemand(normalization);

  if (normalization.status !== "resolved") {
    return original
      ? `${original} - normalizacion pendiente`
      : "Consumo pendiente";
  }

  const normalized = formatNormalizedFlowM3h(
    normalization.normalizedFlowM3h,
    "Pendiente",
  );

  if (
    normalization.originalUnit === "m3_h" &&
    normalization.originalValue !== null
  ) {
    return normalized;
  }

  return original ? `${original} → ${normalized}` : normalized;
}

export function formatNormalizedFlowM3h(
  value: number | null,
  pendingLabel = "Pendiente",
) {
  if (value === null || !Number.isFinite(value)) {
    return pendingLabel;
  }

  return `${formatDemandNumber(value)} ${demandUnitLabel("m3_h")}`;
}

function formatOriginalDemand(
  normalization: EquipmentDemandNormalization,
) {
  if (normalization.originalValue === null || !normalization.originalUnit) {
    return null;
  }

  return `${formatDemandNumber(normalization.originalValue)} ${demandUnitLabel(
    normalization.originalUnit,
  )}`;
}

function formatDemandNumber(value: number) {
  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
    useGrouping: false,
  });
}
