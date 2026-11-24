import type { AdoptedDiameterDecision } from "@/lib/calculation/professionalDiameterAdoption";
import { createSuggestedEquipmentTerminalConfig } from "@/lib/equipment/terminalConfig";
import type { EquipmentType, WorkbenchEquipment } from "@/lib/equipment/types";
import type { ManualRouteNetwork, RouteSegment, RouteSegmentAccessory } from "@/lib/routing/types";

/*
 * Segunda obra de prueba, sin datos de clientes: misma geometría, consumos y largos que un
 * plano parcial ya presentado, para comparar la tabla de cálculo con la que hizo el gasista.
 *
 * Medidor → C → B → A → 1 en línea (10,75 m). Bajadas: 4 en C, 3 en B, 2 en A.
 * Coordenadas en mm (1 unidad = 1 mm).
 *
 * Accesorios como los contó el gasista en su planilla, recorrido por recorrido:
 * - Al 1 y al 2: 4 codos en C-M, te a través en C y en B, 5 codos en A-B, te a 90° y llave.
 * - Al 3: 4 codos en C-M, te a través en C, te a 90° en B, 2 codos y llave.
 * - Al 4: 4 codos en C-M, te a 90° en C, 2 codos y llave.
 * Cada te se carga en el tramo por donde sale el gas (a través o a 90°), así cada recorrido
 * suma la te que le corresponde. La cupla de reducción la pone el motor si baja el diámetro.
 * Los 4 codos de C-M (salida del medidor) y los 2 de cada bajada los pone la app sola
 * (codosDeSubida.ts); acá no se cargan para no contarlos dos veces.
 */

/** Tabla de cálculo del plano presentado, para comparar. */
export const CALCULO_PRESENTADO: Record<
  string,
  { largo: number; equivalente: number; total: number; consumo: number; tabla: number; adoptado: number }
> = {
  "1-A": { largo: 10.75, equivalente: 10.97, total: 21.72, consumo: 0.968, tabla: 20, adoptado: 25 },
  "2-A": { largo: 10.75, equivalente: 10.97, total: 21.72, consumo: 0.323, tabla: 20, adoptado: 25 },
  "A-B": { largo: 10.75, equivalente: 10.97, total: 21.72, consumo: 1.291, tabla: 25, adoptado: 25 },
  "B-3": { largo: 7.15, equivalente: 9.16, total: 16.31, consumo: 0.699, tabla: 25, adoptado: 25 },
  "B-C": { largo: 10.75, equivalente: 10.97, total: 21.72, consumo: 1.99, tabla: 25, adoptado: 32 },
  "C-4": { largo: 4.7, equivalente: 8.4, total: 13.1, consumo: 3.226, tabla: 25, adoptado: 32 },
  "C-M": { largo: 10.75, equivalente: 10.97, total: 21.72, consumo: 5.216, tabla: 32, adoptado: 32 },
};

function artefacto(
  id: string,
  type: EquipmentType,
  name: string,
  x: number,
  y: number,
  kcalPorHora?: number,
  notes?: string,
): WorkbenchEquipment {
  const esMedidor = type === "meter_regulator";

  return {
    connectionPoint: { x, y },
    id,
    name,
    planBaseId: "obra-prueba-planta",
    role: esMedidor ? "supply" : "appliance",
    source: "manual",
    type,
    ...(esMedidor
      ? {}
      : {
          demandUnit: "kcal_h" as const,
          demandValue: kcalPorHora,
          terminalConfig: createSuggestedEquipmentTerminalConfig(type),
        }),
    ...(notes ? { notes } : {}),
  };
}

export const ARTEFACTOS_PRUEBA: WorkbenchEquipment[] = [
  artefacto("pr-medidor", "meter_regulator", "Medidor", 0, 0),
  artefacto("pr-anafe", "stove", "Anafe", 10750, 0, 9000),
  artefacto("pr-horno", "oven", "Horno", 7350, 3400, 3000, "Boca taponada"),
  artefacto("pr-termotanque", "storage_water_heater", "Termotanque", 5450, 1700, 6500),
  artefacto("pr-caldera", "boiler", "Caldera", 3000, 1700, 30000, "Boca taponada"),
];

const pieza = (
  segmentId: string,
  id: string,
  type: RouteSegmentAccessory["type"],
  catalogFamilyId: string,
  quantity = 1,
): RouteSegmentAccessory => ({
  catalogFamilyId,
  equivalentLengthMetersPerUnit: null,
  equivalentLengthSource: "pipe_system",
  id,
  origin: "user_confirmed",
  quantity,
  segmentId,
  type,
});
/** Las tes llevan el nodo en el id, como las que propone la app. */
const te = (segmentId: string, nodo: string, flujo: "a-90" | "a-traves") =>
  pieza(
    segmentId,
    `route-accessory:accessory-proposal:${nodo}:tee:${segmentId}`,
    "tee",
    `te-normal-flujo-${flujo}`,
  );
const codos = (segmentId: string, cantidad: number) =>
  pieza(segmentId, `codos-${segmentId}`, "elbow", "codo-normal-a-90", cantidad);
const llave = (segmentId: string) =>
  pieza(segmentId, `llave-${segmentId}`, "valve", "llave-esferica");

const tramo = (
  id: string,
  fromNodeId: string,
  toNodeId: string,
  accessories: RouteSegmentAccessory[],
): RouteSegment => ({ accessories, fromNodeId, id, origin: "manual", toNodeId });

export const CANERIA_PRUEBA: ManualRouteNetwork = {
  nodes: [
    { equipmentId: "pr-medidor", id: "n-medidor", kind: "supply", origin: "manual" },
    { id: "n-c", kind: "route", origin: "manual", position: { x: 3000, y: 0 } },
    { id: "n-b", kind: "route", origin: "manual", position: { x: 5450, y: 0 } },
    { id: "n-a", kind: "route", origin: "manual", position: { x: 7350, y: 0 } },
    { equipmentId: "pr-anafe", id: "n-1", kind: "appliance", origin: "manual" },
    { equipmentId: "pr-horno", id: "n-2", kind: "appliance", origin: "manual" },
    { equipmentId: "pr-termotanque", id: "n-3", kind: "appliance", origin: "manual" },
    { equipmentId: "pr-caldera", id: "n-4", kind: "appliance", origin: "manual" },
  ],
  segments: [
    tramo("C-M", "n-medidor", "n-c", []),
    tramo("B-C", "n-c", "n-b", [te("B-C", "n-c", "a-traves")]),
    tramo("A-B", "n-b", "n-a", [te("A-B", "n-b", "a-traves"), codos("A-B", 5)]),
    tramo("1-A", "n-a", "n-1", [te("1-A", "n-a", "a-90"), llave("1-A")]),
    tramo("2-A", "n-a", "n-2", [te("2-A", "n-a", "a-90"), llave("2-A")]),
    tramo("B-3", "n-b", "n-3", [te("B-3", "n-b", "a-90"), llave("B-3")]),
    tramo("C-4", "n-c", "n-4", [te("C-4", "n-c", "a-90"), llave("C-4")]),
  ],
};

/** Diámetros que agrandó la gasista para dejar prevista una ampliación (los demás quedan por tabla). */
export const ADOPTADOS_PRUEBA: AdoptedDiameterDecision[] = Object.entries(CALCULO_PRESENTADO).map(
  ([segmentId, fila]) => ({
    decidedAt: 0,
    diameterId: `sigas-${fila.adoptado}`,
    origin: "user_adopted" as const,
    segmentId,
  }),
);
