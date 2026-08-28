import type { Point2D } from "@/lib/geometry/types";

export type EquipmentRole = "supply" | "appliance";

export type EquipmentType =
  | "meter_regulator"
  | "stove"
  | "oven"
  | "instant_water_heater"
  | "storage_water_heater"
  | "boiler"
  | "space_heater"
  | "gas_dryer"
  | "other";

export type DemandUnit = "kcal_h" | "m3_h";

export type EquipmentWallReferenceKind =
  | "hard_structure"
  | "manual_constraint"
  | "reference_wall";

export type EquipmentWallAnchor = {
  distanceSource: number | null;
  normal: Point2D | null;
  orientationRadians: number | null;
  pageNumber: number | null;
  referenceId: string | null;
  referenceKind: EquipmentWallReferenceKind | null;
  source: "dxf" | "pdf" | null;
  status: "anchored" | "pending";
  wallPoint: Point2D | null;
};

export type EquipmentTerminalHeightStatus =
  | "confirmed"
  | "pending"
  | "suggested";

export type EquipmentTerminalOutletSide = "direct" | "left" | "right";

export type EquipmentTerminalProfile =
  | "boiler_wall_rh"
  | "dryer_wall_valve"
  | "generic_terminal"
  | "heater_wall_rh"
  | "oven_wall_valve"
  | "space_heater_wall_valve"
  | "stove_wall_valve"
  | "storage_heater_wall_rh";

export type EquipmentTerminalConfig = {
  connectionHeightMeters: number | null;
  heightStatus: EquipmentTerminalHeightStatus;
  lateralOffsetMeters: number;
  outletSide: EquipmentTerminalOutletSide;
  requiresShutoffValve: boolean;
  terminalProfile: EquipmentTerminalProfile;
};

export type WorkbenchEquipment = {
  id: string;
  planBaseId: string;
  pdfPageNumber?: number;
  role: EquipmentRole;
  type: EquipmentType;
  name: string;
  bodyPoint?: Point2D;
  connectionPoint: Point2D;
  terminalConfig?: EquipmentTerminalConfig;
  wallAnchor?: EquipmentWallAnchor;
  demandValue?: number;
  demandUnit?: DemandUnit;
  notes?: string;
  source: "manual";
};

export type EquipmentDraftStep = "details" | "placing" | "review";

export type EquipmentDraft = {
  editingEquipmentId: string | null;
  planBaseId: string;
  pdfPageNumber?: number;
  role: EquipmentRole;
  type: EquipmentType;
  name: string;
  bodyPoint: Point2D | null;
  connectionPoint: Point2D | null;
  connectionHeightInput: string;
  previewPoint: Point2D | null;
  terminalConfig: EquipmentTerminalConfig | null;
  terminalLateralOffsetInput: string;
  wallAnchor: EquipmentWallAnchor | null;
  demandValueInput: string;
  demandUnit: DemandUnit;
  notes: string;
  step: EquipmentDraftStep;
  error: string | null;
};

export type EquipmentPlacementMode = "inactive" | "placing";

export type EquipmentDefinition = {
  code: string;
  label: string;
  role: EquipmentRole;
  type: EquipmentType;
};

export const EQUIPMENT_DEFINITIONS: EquipmentDefinition[] = [
  {
    code: "M",
    label: "Medidor/regulador",
    role: "supply",
    type: "meter_regulator",
  },
  {
    code: "COC",
    label: "Cocina",
    role: "appliance",
    type: "stove",
  },
  {
    code: "HOR",
    label: "Horno",
    role: "appliance",
    type: "oven",
  },
  {
    code: "CF",
    label: "Calefón",
    role: "appliance",
    type: "instant_water_heater",
  },
  {
    code: "TT",
    label: "Termotanque",
    role: "appliance",
    type: "storage_water_heater",
  },
  {
    code: "CLD",
    label: "Caldera",
    role: "appliance",
    type: "boiler",
  },
  {
    code: "EST",
    label: "Calefactor/estufa",
    role: "appliance",
    type: "space_heater",
  },
  {
    code: "SEC",
    label: "Secarropas a gas",
    role: "appliance",
    type: "gas_dryer",
  },
  {
    code: "OTR",
    label: "Otro",
    role: "appliance",
    type: "other",
  },
];

export const APPLIANCE_EQUIPMENT_DEFINITIONS = EQUIPMENT_DEFINITIONS.filter(
  (definition) => definition.role === "appliance",
);

export const DEMAND_UNITS: Array<{ label: string; value: DemandUnit }> = [
  { label: "kcal/h", value: "kcal_h" },
  { label: "m³/h", value: "m3_h" },
];

export function equipmentDefinitionForType(type: EquipmentType) {
  return (
    EQUIPMENT_DEFINITIONS.find((definition) => definition.type === type) ??
    EQUIPMENT_DEFINITIONS[EQUIPMENT_DEFINITIONS.length - 1]
  );
}

export function equipmentCode(type: EquipmentType) {
  return equipmentDefinitionForType(type).code;
}

export function equipmentTypeLabel(type: EquipmentType) {
  return equipmentDefinitionForType(type).label;
}

export function demandUnitLabel(unit: DemandUnit) {
  return DEMAND_UNITS.find((item) => item.value === unit)?.label ?? unit;
}

export function formatEquipmentDemand(equipment: WorkbenchEquipment) {
  if (
    equipment.role !== "appliance" ||
    equipment.demandValue === undefined ||
    !equipment.demandUnit
  ) {
    return "Consumo pendiente";
  }

  return `${formatDemandNumber(equipment.demandValue)} ${demandUnitLabel(
    equipment.demandUnit,
  )}`;
}

export function hasPendingDemand(equipment: WorkbenchEquipment) {
  return (
    equipment.role === "appliance" &&
    (equipment.demandValue === undefined || !equipment.demandUnit)
  );
}

function formatDemandNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 3,
  }).format(value);
}
