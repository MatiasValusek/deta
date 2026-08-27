export type ProjectGasConfig = {
  heatingValueKcalPerM3: number | null;
};

export const DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3 = 9300;

export const DEFAULT_PROJECT_GAS_CONFIG: ProjectGasConfig = {
  heatingValueKcalPerM3: DEFAULT_NATURAL_GAS_HEATING_VALUE_KCAL_PER_M3,
};

export function projectGasConfigOrDefault(
  projectGas: ProjectGasConfig | null | undefined,
): ProjectGasConfig | null {
  return projectGas === undefined ? DEFAULT_PROJECT_GAS_CONFIG : projectGas;
}

export function isUsableHeatingValueKcalPerM3(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
