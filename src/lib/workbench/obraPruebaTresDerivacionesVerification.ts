import { agregarCodosDeSubida, tipoCodosDeSubida } from "@/lib/calculation/codosDeSubida";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_PROJECT_GAS_CONFIG } from "@/lib/calculation/projectGas";
import { createTechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { MOTIVO_AMPLIACION, motivoDiametroAdoptado } from "@/lib/laminas/motivoDiametro";
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
 * - Longitud equivalente: la app pone sola 4 codos a la salida del medidor y 2 en cada
 *   bajada, y en las derivaciones que bajan de medida cuenta te normal + cupla. Además pone la
 *   llave general a la salida del medidor (Ø32, 0,33 m), que la gasista no contó. Los recorridos
 *   al 1 y al 2 quedan 2,04 m por encima de la gasista (ella no contó codos en esas bajadas)
 *   y el del 4, 0,33 m (la llave general).
 * - B-3 queda 0,44 m por debajo por método, no por seguridad: la app cuenta los codos y la
 *   llave del tramo en 25, que es su medida; la gasista los contó en 32. Con la longitud de
 *   ella la tabla da el mismo diámetro (20 en la fila de 18 m), así que en B-3 se controla
 *   el diámetro en lugar de la longitud.
 */
const TOLERANCIA_M = 0.005;
const DIFERENCIA_DE_METODO_B3_M = 0.442;

function calcular(equipment: WorkbenchEquipment[]) {
  const result = calculateTechnicalTree({
    adoptedDiameterDecisions: ADOPTADOS_PRUEBA,
    equipment,
    minSegmentLengthSource: 0.0001,
    network: CANERIA_PRUEBA,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    projectGas: DEFAULT_PROJECT_GAS_CONFIG,
    scaleMetersPerSourceUnit: 0.001,
  });
  return { hoja: createTechnicalCalculationSheet({ equipment, result }), result };
}

export function runObraPruebaTresDerivacionesVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean) => {
    if (!ok()) throw new Error(`Obra de prueba (plano parcial): ${name}`);
    results.push({ name, status: "passed" });
  };

  const { hoja, result } = calcular(ARTEFACTOS_PRUEBA);
  const filas = Object.entries(CALCULO_PRESENTADO).map(([tramo, real]) => ({
    app: hoja.rows.find((fila) => fila.segmentId === tramo),
    real,
    tramo,
  }));
  const mm = (valor: { externalDiameterMillimeters?: number } | null | undefined) =>
    valor?.externalDiameterMillimeters ?? 0;
  const equivalente = (fila: (typeof filas)[number]["app"]) =>
    (fila?.finalCalculationLengthMeters ?? 0) - (fila?.initialRouteLengthMeters ?? 0);
  const codos = (segmentId: string, tipo: "subida" | "salida_medidor") =>
    result.segments
      .find((segment) => segment.segmentId === segmentId)
      ?.accessories.filter((accessory) => tipoCodosDeSubida(accessory.id) === tipo)
      .reduce((total, accessory) => total + accessory.quantity, 0) ?? 0;

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
  check("sin alturas cargadas: 4 codos a la salida del medidor y 2 en cada bajada", () =>
    codos("C-M", "salida_medidor") === 4 &&
    ["1-A", "2-A", "B-3", "C-4"].every((tramo) => codos(tramo, "subida") === 2) &&
    ["B-C", "A-B"].every((tramo) => codos(tramo, "subida") === 0),
  );
  check(
    "seguridad: ningún tramo queda con diámetro ni longitud equivalente menor que la gasista",
    () =>
      filas.every(
        ({ app, real, tramo }) =>
          mm(app?.effectiveDiameter) >= real.adoptado &&
          (tramo === "B-3" || equivalente(app) >= real.equivalente - TOLERANCIA_M),
      ),
  );

  // B-3: con la longitud de la gasista (la de la app + 0,44 m) el diámetro no puede dar
  // mayor que el que da la app ni que el adoptado.
  const b3 = filas.find(({ tramo }) => tramo === "B-3")?.app;
  const diametroB3 = (largo: number) => {
    const sizing = SIGAS_PIPE_SYSTEM.sizeSegment({
      accessoryEquivalentLengthMeters: null,
      accumulatedFlow: b3?.flowM3h ?? null,
      accumulatedFlowUnit: "m3_h",
      calculationLengthMeters: largo,
      physicalLengthMeters: b3?.physicalLengthMeters ?? null,
      segmentId: "B-3",
    });
    return sizing.status === "resolved" ? mm(sizing.value.selectedDiameter) : Infinity;
  };
  check("B-3: la diferencia con la gasista es de método, no cambia el diámetro", () => {
    const largoApp = b3?.finalCalculationLengthMeters ?? 0;
    const largoGasista = largoApp + DIFERENCIA_DE_METODO_B3_M;
    return (
      Math.abs(largoGasista - CALCULO_PRESENTADO["B-3"].total) < 0.01 &&
      diametroB3(largoGasista) === mm(b3?.calculatedDiameter) &&
      diametroB3(largoGasista) <= mm(b3?.effectiveDiameter)
    );
  });

  check("si el adoptado supera a la tabla, figura el motivo con palabras del oficio", () =>
    filas.every(({ app, tramo }) =>
      app && mm(app.effectiveDiameter) > mm(app.calculatedDiameter)
        ? motivoDiametroAdoptado(app) === MOTIVO_AMPLIACION
        : app !== undefined && motivoDiametroAdoptado(app) === null,
    ) && motivoDiametroAdoptado(filas.find(({ tramo }) => tramo === "B-3")!.app!) === MOTIVO_AMPLIACION,
  );

  // Con alturas confirmadas por el gasista, la bajada al anafe se cuenta por las alturas:
  // si llega al mismo nivel que la cañería, no lleva codos de bajada (no se cuentan dos veces).
  const conAlturas = ARTEFACTOS_PRUEBA.map((item) =>
    item.id === "pr-anafe" && item.terminalConfig
      ? {
          ...item,
          terminalConfig: {
            ...item.terminalConfig,
            connectionHeightMeters: 0,
            heightSource: "professional_edit" as const,
            heightStatus: "confirmed" as const,
            verticalDropMeters: 0,
          },
        }
      : item,
  );
  const alturas = calcular(conAlturas).result;
  check("con alturas cargadas se usan esas en lugar de los codos fijos", () =>
    !alturas.segments
      .find((segment) => segment.segmentId === "1-A")
      ?.accessories.some((accessory) => tipoCodosDeSubida(accessory.id) === "subida"),
  );

  // Si la conexión al artefacto ya trae su codo con rosca hembra, ese es uno de los 2.
  const conCodoFinal = agregarCodosDeSubida({
    equipment: ARTEFACTOS_PRUEBA,
    network: {
      ...CANERIA_PRUEBA,
      segments: CANERIA_PRUEBA.segments.map((segment) =>
        segment.id === "C-4"
          ? {
              ...segment,
              accessories: [
                ...(segment.accessories ?? []),
                {
                  catalogFamilyId: "codo-90-rosca-hembra",
                  equivalentLengthMetersPerUnit: null,
                  equivalentLengthSource: "pipe_system" as const,
                  id: "route-terminal:pr-caldera:terminal",
                  quantity: 1,
                  segmentId: "C-4",
                  type: "elbow" as const,
                },
              ],
            }
          : segment,
      ),
    },
  });
  check("el codo con rosca hembra del artefacto cuenta como uno de los 2", () =>
    (conCodoFinal.segments
      .find((segment) => segment.id === "C-4")
      ?.accessories?.find((accessory) => tipoCodosDeSubida(accessory.id) === "subida")
      ?.quantity ?? 0) === 1,
  );

  return results;
}
