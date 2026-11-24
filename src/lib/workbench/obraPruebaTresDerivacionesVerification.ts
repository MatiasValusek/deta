import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_PROJECT_GAS_CONFIG } from "@/lib/calculation/projectGas";
import { createTechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import {
  ADOPTADOS_PRUEBA,
  ARTEFACTOS_PRUEBA,
  CALCULO_PRESENTADO,
  CANERIA_PRUEBA,
} from "./obraPruebaTresDerivaciones";

type Resultado = { name: string; status: "passed" };

/*
 * Comparación con la tabla del plano presentado. Diferencias conocidas, que no son errores:
 * - B-3 por tabla: la app da 20 y el plano 25. Con 0,699 m³/h, el caño de 20 alcanza en la
 *   fila de 16 m (1,399 m³/h) y en la de 18 m (1,319 m³/h): el 25 no sale de la tabla.
 * - Longitud equivalente: donde baja el diámetro, la app cuenta te de reducción con la medida
 *   real de cada tramo; la gasista contó te normal + cupla y todo en 32. Por eso los recorridos
 *   al 1 y al 2 dan 0,14 m menos y el del 3 da 1,40 m menos. El del 4 da igual.
 */
const TOLERANCIA_M = 0.2;
const TOLERANCIA_B3_M = 1.5;

export function runObraPruebaTresDerivacionesVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean) => {
    if (!ok()) throw new Error(`Obra de prueba (plano parcial): ${name}`);
    results.push({ name, status: "passed" });
  };

  const result = calculateTechnicalTree({
    adoptedDiameterDecisions: ADOPTADOS_PRUEBA,
    equipment: ARTEFACTOS_PRUEBA,
    minSegmentLengthSource: 0.0001,
    network: CANERIA_PRUEBA,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    projectGas: DEFAULT_PROJECT_GAS_CONFIG,
    scaleMetersPerSourceUnit: 0.001,
  });
  const hoja = createTechnicalCalculationSheet({ equipment: ARTEFACTOS_PRUEBA, result });
  const filas = Object.entries(CALCULO_PRESENTADO).map(([tramo, real]) => ({
    app: hoja.rows.find((fila) => fila.segmentId === tramo),
    real,
    tramo,
  }));
  const mm = (valor: { externalDiameterMillimeters?: number } | null | undefined) =>
    valor?.externalDiameterMillimeters;

  check("calcula sin pendientes", () => result.status === "valid" && hoja.status === "resolved");
  check("los largos reales y los consumos son los del plano", () =>
    filas.every(
      ({ app, real }) =>
        Math.abs((app?.initialRouteLengthMeters ?? 0) - real.largo) < 0.01 &&
        Math.abs((app?.flowM3h ?? 0) - real.consumo) < 0.002,
    ),
  );
  check("el diámetro adoptado es el de la gasista en todos los tramos", () =>
    filas.every(({ app, real }) => mm(app?.effectiveDiameter) === real.adoptado),
  );
  check("el diámetro por tabla coincide salvo B-3 (la tabla da 20)", () =>
    filas.every(({ app, real, tramo }) =>
      mm(app?.calculatedDiameter) === (tramo === "B-3" ? 20 : real.tabla),
    ),
  );
  check("las longitudes totales quedan cerca del plano", () =>
    filas.every(({ app, real, tramo }) =>
      Math.abs((app?.finalCalculationLengthMeters ?? 0) - real.total) <=
      (tramo === "B-3" ? TOLERANCIA_B3_M : TOLERANCIA_M),
    ),
  );

  return results;
}
