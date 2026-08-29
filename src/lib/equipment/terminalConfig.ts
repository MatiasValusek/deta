import type {
  EquipmentTerminalConfig,
  EquipmentTerminalHeightStatus,
  EquipmentTerminalOutletSide,
  EquipmentTerminalProfile,
  EquipmentType,
} from "./types";

type TerminalProfileDefinition = EquipmentTerminalConfig & {
  profileLabel: string;
};

export const TERMINAL_OUTLET_SIDE_OPTIONS: Array<{
  label: string;
  value: EquipmentTerminalOutletSide;
}> = [
  { label: "Directa", value: "direct" },
  { label: "Izquierda", value: "left" },
  { label: "Derecha", value: "right" },
];

const TERMINAL_PROFILE_LABELS: Record<EquipmentTerminalProfile, string> = {
  boiler_wall_rh: "RH caldera",
  dryer_wall_valve: "Llave secarropas",
  generic_terminal: "Terminal generico",
  heater_wall_rh: "RH calefon",
  oven_wall_valve: "Llave horno",
  space_heater_wall_valve: "Llave calefactor",
  stove_wall_valve: "Llave cocina",
  storage_heater_wall_rh: "RH termotanque",
};

const TERMINAL_PROFILES_BY_TYPE: Record<EquipmentType, TerminalProfileDefinition> = {
  boiler: terminalProfile("boiler_wall_rh", 1.5, true),
  gas_dryer: terminalProfile("dryer_wall_valve", 0.8, true),
  instant_water_heater: terminalProfile("heater_wall_rh", 1.6, true),
  meter_regulator: terminalProfile("generic_terminal", 0, false),
  other: terminalProfile("generic_terminal", 0, true),
  oven: terminalProfile("oven_wall_valve", 0.6, true),
  space_heater: terminalProfile("space_heater_wall_valve", 0.3, true),
  storage_water_heater: terminalProfile("storage_heater_wall_rh", 1.2, true),
  stove: terminalProfile("stove_wall_valve", 1.1, true),
};

export function createSuggestedEquipmentTerminalConfig(
  type: EquipmentType,
): EquipmentTerminalConfig {
  const profile = TERMINAL_PROFILES_BY_TYPE[type];

  return {
    connectionHeightMeters: profile.connectionHeightMeters,
    heightStatus: profile.heightStatus,
    lateralOffsetMeters: profile.lateralOffsetMeters,
    outletSide: profile.outletSide,
    requiresShutoffValve: profile.requiresShutoffValve,
    terminalProfile: profile.terminalProfile,
  };
}

export function createEquipmentTerminalConfigFromHeight(
  type: EquipmentType,
  heightMeters: number,
  status: Exclude<EquipmentTerminalHeightStatus, "pending"> = "suggested",
): EquipmentTerminalConfig {
  return {
    ...createSuggestedEquipmentTerminalConfig(type),
    connectionHeightMeters: heightMeters,
    heightStatus: status,
  };
}

export function confirmEquipmentTerminalConfig(
  config: EquipmentTerminalConfig,
): EquipmentTerminalConfig {
  return {
    ...config,
    heightStatus:
      config.connectionHeightMeters === null ? "pending" : "confirmed",
  };
}

export function parseTerminalLateralOffsetInput(
  value: string,
):
  | { ok: true; offsetMeters: number }
  | { ok: false; message: string } {
  const normalized = value.trim().replace(",", ".");

  if (normalized.length === 0) {
    return { ok: true, offsetMeters: 0 };
  }

  const offsetMeters = Number(normalized);

  if (!Number.isFinite(offsetMeters) || offsetMeters < 0) {
    return {
      ok: false,
      message:
        "El desplazamiento lateral debe ser un numero finito mayor o igual a cero.",
    };
  }

  return { ok: true, offsetMeters };
}

export function terminalHeightStatusLabel(
  status: EquipmentTerminalHeightStatus,
) {
  if (status === "confirmed") {
    return "Confirmada";
  }

  return status === "suggested" ? "Sugerida" : "Pendiente";
}

export function terminalOutletSideLabel(side: EquipmentTerminalOutletSide) {
  return (
    TERMINAL_OUTLET_SIDE_OPTIONS.find((item) => item.value === side)?.label ??
    side
  );
}

export function terminalProfileLabel(profile: EquipmentTerminalProfile) {
  return TERMINAL_PROFILE_LABELS[profile];
}

function terminalProfile(
  terminalProfile: EquipmentTerminalProfile,
  connectionHeightMeters: number,
  requiresShutoffValve: boolean,
): TerminalProfileDefinition {
  return {
    connectionHeightMeters,
    heightStatus: "suggested",
    lateralOffsetMeters: 0,
    outletSide: "direct",
    profileLabel: TERMINAL_PROFILE_LABELS[terminalProfile],
    requiresShutoffValve,
    terminalProfile,
  };
}
