import { createSuggestedEquipmentTerminalConfig } from "@/lib/equipment/terminalConfig";
import type { EquipmentType, WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import type { ManualRouteNetwork, RouteSegment } from "@/lib/routing/types";

/*
 * Tercera obra de prueba, con datos inventados: la casa de 10 × 8 m que se cargó desde cero
 * en el relevamiento (RELEVAMIENTO.md), con medidor y 4 artefactos.
 *
 * Es como la deja un gasista que no tocó nada más que lo básico: cañería trazada a mano en
 * forma de peine (caño principal + bajadas), sin accesorios cargados, sin confirmar tes,
 * sin alturas y sin agrandar diámetros. Lo que falte lo tiene que poner la app sola.
 * Coordenadas en mm (1 unidad = 1 mm).
 */

const BASE_ID = "obra-casa-planta";

function artefacto(
  id: string,
  type: EquipmentType,
  name: string,
  connectionPoint: Point2D,
  kcalPorHora?: number,
): WorkbenchEquipment {
  const esMedidor = type === "meter_regulator";

  return {
    connectionPoint,
    id,
    name,
    planBaseId: BASE_ID,
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
  };
}

export const ARTEFACTOS_CASA: WorkbenchEquipment[] = [
  artefacto("ca-medidor", "meter_regulator", "Medidor", { x: 1000, y: 200 }),
  artefacto("ca-estufa", "space_heater", "Estufa", { x: 200, y: 5500 }, 3000),
  artefacto("ca-cocina", "stove", "Cocina", { x: 6000, y: 7700 }, 9000),
  artefacto("ca-calefon", "instant_water_heater", "Calefón", { x: 8600, y: 7700 }, 20000),
  artefacto("ca-calefactor", "space_heater", "Calefactor", { x: 8600, y: 600 }, 3000),
];

const tramo = (id: string, fromNodeId: string, toNodeId: string): RouteSegment => ({
  fromNodeId,
  id,
  origin: "manual",
  toNodeId,
});

/** Caño principal por y = 4 m; una bajada a cada artefacto. */
export const CANERIA_CASA: ManualRouteNetwork = {
  nodes: [
    { equipmentId: "ca-medidor", id: "n-medidor", kind: "supply", origin: "manual" },
    { id: "n-a", kind: "route", origin: "manual", position: { x: 1000, y: 4000 } },
    { id: "n-esquina", kind: "route", origin: "manual", position: { x: 200, y: 4000 } },
    { id: "n-b", kind: "route", origin: "manual", position: { x: 6000, y: 4000 } },
    { id: "n-c", kind: "route", origin: "manual", position: { x: 8600, y: 4000 } },
    { equipmentId: "ca-estufa", id: "n-estufa", kind: "appliance", origin: "manual" },
    { equipmentId: "ca-cocina", id: "n-cocina", kind: "appliance", origin: "manual" },
    { equipmentId: "ca-calefon", id: "n-calefon", kind: "appliance", origin: "manual" },
    { equipmentId: "ca-calefactor", id: "n-calefactor", kind: "appliance", origin: "manual" },
  ],
  segments: [
    tramo("c-medidor-a", "n-medidor", "n-a"),
    tramo("c-a-esquina", "n-a", "n-esquina"),
    tramo("c-esquina-estufa", "n-esquina", "n-estufa"),
    tramo("c-a-b", "n-a", "n-b"),
    tramo("c-b-cocina", "n-b", "n-cocina"),
    tramo("c-b-c", "n-b", "n-c"),
    tramo("c-c-calefon", "n-c", "n-calefon"),
    tramo("c-c-calefactor", "n-c", "n-calefactor"),
  ],
};

/** Escala: 1 unidad del plano = 1 mm. */
export const ESCALA_CASA_M_POR_UNIDAD = 0.001;
