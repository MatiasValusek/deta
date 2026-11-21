import { normalizeEquipmentDemand } from "@/lib/calculation/demandNormalization";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type { ProjectGasConfig } from "@/lib/calculation/projectGas";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { equipmentTypeLabel } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { numerarPlano, type NumeracionPlano } from "./numeracionPlano";

export type ColumnaTabla = {
  titulo: string;
  /** Parte del ancho de la tabla; las columnas de una tabla suman 1. */
  ancho: number;
  alinear?: "izquierda" | "derecha" | "centro";
};

export type TablaLamina = {
  titulo: string;
  columnas: ColumnaTabla[];
  filas: string[][];
};

export type TablasPlano = {
  referencias: TablaLamina;
  materiales: TablaLamina;
  calculo: TablaLamina;
  avisos: string[];
};

const SIN_DATO = "—";
const TOLERANCIA_LONGITUD_M = 0.011;

export function crearTablasPlano(params: {
  bocasTaponadas?: ReadonlySet<string>;
  calculationSheet: TechnicalCalculationSheet;
  equipment: WorkbenchEquipment[];
  materialTakeoff: TechnicalMaterialTakeoff;
  network: ManualRouteNetwork;
  projectGas: ProjectGasConfig;
  result: TechnicalCalculationResult | null;
}): TablasPlano {
  const avisos: string[] = [];
  const numeracion = numerarPlano(
    params.network,
    (params.result?.segments ?? []).map((tramo) => ({
      segmentId: tramo.segmentId,
      fromNodeId: tramo.fromNodeId,
      toNodeId: tramo.toNodeId,
      physicalLengthMeters: tramo.segmentPhysicalLengthMeters,
    })),
  );

  return {
    referencias: crearReferencias(params, numeracion, avisos),
    materiales: crearMateriales(params.materialTakeoff, avisos),
    calculo: crearCalculo(params.calculationSheet, numeracion, avisos),
    avisos,
  };
}

function crearReferencias(
  params: Parameters<typeof crearTablasPlano>[0],
  numeracion: NumeracionPlano,
  avisos: string[],
): TablaLamina {
  const etiquetaPorArtefacto = new Map(
    params.network.nodes.flatMap((nodo) =>
      nodo.kind === "appliance" && nodo.equipmentId && numeracion.nodos.has(nodo.id)
        ? [[nodo.equipmentId, numeracion.nodos.get(nodo.id) as string] as const]
        : [],
    ),
  );
  const filas = params.equipment
    .filter((item) => item.role === "appliance")
    .map((item) => {
      const numero = etiquetaPorArtefacto.get(item.id) ?? null;
      const consumo = normalizeEquipmentDemand(item, params.projectGas);
      const m3h = consumo.status === "resolved" ? consumo.normalizedFlowM3h : null;
      const nombre = item.name.trim() || equipmentTypeLabel(item.type);
      const calorPorM3 = params.projectGas.heatingValueKcalPerM3;
      const kcalh =
        consumo.status !== "resolved"
          ? null
          : consumo.originalUnit === "kcal_h"
            ? consumo.originalValue
            : m3h !== null && calorPorM3 !== null
              ? m3h * calorPorM3
              : null;

      if (numero === null) {
        avisos.push(`${nombre} no está conectado. Trazá la cañería hasta el artefacto.`);
      }
      if (m3h === null) {
        avisos.push(`Falta el consumo de ${nombre}. Cargalo en Artefactos.`);
      }

      return {
        numero,
        celdas: [
          numero ?? SIN_DATO,
          nombre,
          kcalh === null ? SIN_DATO : numero_(kcalh, 0),
          m3h === null ? SIN_DATO : numero_(m3h, 3),
          params.bocasTaponadas?.has(item.id) ? "Sí" : SIN_DATO,
        ],
      };
    })
    .sort((a, b) =>
      (a.numero ?? "~").localeCompare(b.numero ?? "~", "es", { numeric: true }),
    )
    .map((fila) => fila.celdas);

  return {
    titulo: "REFERENCIAS",
    columnas: [
      { titulo: "N°", ancho: 0.08, alinear: "centro" },
      { titulo: "Artefacto", ancho: 0.42 },
      { titulo: "kcal/h", ancho: 0.16, alinear: "derecha" },
      { titulo: "m³/h", ancho: 0.14, alinear: "derecha" },
      { titulo: "Boca taponada", ancho: 0.2, alinear: "centro" },
    ],
    filas,
  };
}

function crearMateriales(
  takeoff: TechnicalMaterialTakeoff,
  avisos: string[],
): TablaLamina {
  if (takeoff.pendingSummary.total > 0) {
    avisos.push(
      `Hay ${takeoff.pendingSummary.total} materiales sin definir. Resolvelos en Calcular.`,
    );
  }

  const accesorios = [...takeoff.accessoryItems].sort(
    (a, b) =>
      Number(a.accessoryKind === "valve") - Number(b.accessoryKind === "valve") ||
      a.label.localeCompare(b.label, "es", { numeric: true }),
  );

  return {
    titulo: "MATERIALES",
    columnas: [
      { titulo: "Material", ancho: 0.52 },
      { titulo: "Cantidad", ancho: 0.14, alinear: "derecha" },
      { titulo: "Marca", ancho: 0.17 },
      { titulo: "Matrícula", ancho: 0.17 },
    ],
    filas: [
      ...takeoff.pipeItems.map((item) => [
        `Caño ${diametro(item.diameter)}`,
        `${numero_(item.physicalLengthMeters, 2)} m`,
        "",
        "",
      ]),
      ...accesorios.map((item) => [item.label, String(item.quantity), "", ""]),
    ],
  };
}

function crearCalculo(
  sheet: TechnicalCalculationSheet,
  numeracion: NumeracionPlano,
  avisos: string[],
): TablaLamina {
  const ordenadas = sheet.rows
    .map((fila) => ({
      fila,
      tramo: numeracion.tramos.get(fila.segmentId) ?? fila.tramo,
    }))
    .sort((a, b) => a.tramo.localeCompare(b.tramo, "es", { numeric: true }));
  const filas = ordenadas.map(({ fila, tramo }) => {
    const equivalente =
      fila.accessoryEquivalentLengthMeters === null
        ? null
        : fila.accessoryEquivalentLengthMeters +
          (fila.transitionEquivalentLengthMeters ?? 0);

    if (fila.status !== "resolved") {
      avisos.push(`El tramo ${tramo} no está resuelto. Revisalo en Calcular.`);
    } else if (
      fila.initialRouteLengthMeters !== null &&
      equivalente !== null &&
      fila.finalCalculationLengthMeters !== null &&
      Math.abs(
        fila.initialRouteLengthMeters + equivalente - fila.finalCalculationLengthMeters,
      ) > TOLERANCIA_LONGITUD_M
    ) {
      avisos.push(
        `Las longitudes del tramo ${tramo} no cierran. Revisá sus accesorios en Calcular.`,
      );
    }

    return [
      tramo,
      longitud(fila.initialRouteLengthMeters),
      longitud(equivalente),
      longitud(fila.finalCalculationLengthMeters),
      fila.flowM3h === null ? SIN_DATO : numero_(fila.flowM3h, 3),
      diametro(fila.calculatedDiameter),
      diametro(fila.effectiveDiameter),
    ];
  });

  return {
    titulo: "CÁLCULO CAÑERÍA SIGAS",
    columnas: [
      { titulo: "Tramo", ancho: 0.12, alinear: "centro" },
      { titulo: "Long. real (m)", ancho: 0.14, alinear: "derecha" },
      { titulo: "Long. equiv. (m)", ancho: 0.15, alinear: "derecha" },
      { titulo: "Long. total (m)", ancho: 0.14, alinear: "derecha" },
      { titulo: "Consumo m³/h", ancho: 0.15, alinear: "derecha" },
      { titulo: "Diám. tabla", ancho: 0.14, alinear: "centro" },
      { titulo: "Diám. adoptado", ancho: 0.16, alinear: "centro" },
    ],
    filas,
  };
}

function longitud(valor: number | null) {
  return valor === null ? SIN_DATO : numero_(valor, 2);
}

function diametro(valor: PipeDiameterReference | null) {
  if (!valor) {
    return SIN_DATO;
  }

  return valor.externalDiameterMillimeters === undefined
    ? valor.label
    : `${numero_(valor.externalDiameterMillimeters, 0)} mm`;
}

function numero_(valor: number, decimales: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: decimales,
    minimumFractionDigits: decimales,
  }).format(valor);
}
