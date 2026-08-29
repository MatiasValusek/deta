import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  confirmEquipmentTerminalConfig,
  createEquipmentTerminalConfigFromHeight,
  createSuggestedEquipmentTerminalConfig,
  parseTerminalLateralOffsetInput,
  terminalEndHeightMeters,
} from "./terminalConfig";

export type TerminalConfigVerificationResult = {
  name: string;
  status: "passed";
};

const EPSILON = 0.000001;

export function runTerminalConfigVerifications() {
  const results: TerminalConfigVerificationResult[] = [];

  verify(
    results,
    "10.7B cocina admite altura sugerida lado derecho desplazamiento y confirmacion",
    () => {
      const suggested = createSuggestedEquipmentTerminalConfig("stove");
      const parsedOffset = parseTerminalLateralOffsetInput("0,50");

      assert(parsedOffset.ok, "El desplazamiento 0,50 m debe ser valido.");
      assertEqual(suggested.heightStatus, "suggested");
      assertEqual(suggested.requiresShutoffValve, true);
      assertEqual(suggested.terminalProfile, "stove_wall_valve");
      assertClose(suggested.verticalDropMeters, 0.2);

      const edited = {
        ...suggested,
        lateralOffsetMeters: parsedOffset.offsetMeters,
        outletSide: "right" as const,
      };
      const equipment = stoveEquipment(edited);

      assert(equipment.terminalConfig, "Falta configuracion terminal.");
      assertEqual(equipment.terminalConfig.heightStatus, "suggested");
      assertEqual(equipment.terminalConfig.outletSide, "right");
      assertClose(equipment.terminalConfig.lateralOffsetMeters, 0.5);
      assertClose(equipment.terminalConfig.verticalDropMeters, 0.2);
      assertClose(
        equipment.connectionPoint.z,
        terminalEndHeightMeters(equipment.terminalConfig) ?? -1,
      );

      const confirmed = confirmEquipmentTerminalConfig(equipment.terminalConfig);

      assertEqual(confirmed.heightStatus, "confirmed");
      assertEqual(confirmed.outletSide, "right");
      assertClose(confirmed.lateralOffsetMeters, 0.5);
      assertClose(confirmed.verticalDropMeters, 0.2);
      assertClose(confirmed.connectionHeightMeters, suggested.connectionHeightMeters ?? 0);
    },
  );

  verify(results, "10.7B altura cero es valida y no queda pendiente", () => {
    const zeroHeight = confirmEquipmentTerminalConfig(
      createEquipmentTerminalConfigFromHeight("other", 0),
    );

    assertEqual(zeroHeight.connectionHeightMeters, 0);
    assertEqual(zeroHeight.heightStatus, "confirmed");
  });

  return results;
}

function stoveEquipment(
  terminalConfig: WorkbenchEquipment["terminalConfig"],
): WorkbenchEquipment {
  const heightMeters = terminalConfig
    ? terminalEndHeightMeters(terminalConfig) ?? 0
    : 0;

  return {
    id: "equipment:stove",
    planBaseId: "plan:fixture",
    role: "appliance",
    type: "stove",
    name: "Cocina",
    bodyPoint: { x: 2, y: 0.35, z: heightMeters },
    connectionPoint: { x: 2, y: 0, z: heightMeters },
    terminalConfig,
    demandValue: 8500,
    demandUnit: "kcal_h",
    source: "manual",
  };
}

function verify(
  results: TerminalConfigVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(
    actual === expected,
    `Expected ${String(expected)}, got ${String(actual)}.`,
  );
}

function assertClose(actual: number | null | undefined, expected: number) {
  assert(
    actual !== null &&
      actual !== undefined &&
      Math.abs(actual - expected) <= EPSILON,
    `Expected ${expected}, got ${String(actual)}.`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(JSON.stringify(runTerminalConfigVerifications(), null, 2));
}
