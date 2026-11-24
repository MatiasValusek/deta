import { normalizeEquipmentDemand } from "@/lib/calculation/demandNormalization";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type { ProjectGasConfig } from "@/lib/calculation/projectGas";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type {
  TechnicalMaterialAccessoryKind,
  TechnicalMaterialTakeoff,
} from "@/lib/calculation/technicalMaterialTakeoff";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { equipmentTypeLabel } from "@/lib/equipment/types";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { motivoDiametroAdoptado } from "./motivoDiametro";
import { numerarDesdeResultado, type NumeracionPlano } from "./numeracionPlano";

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
  /** Texto fuera de la tabla, a la derecha de cada fila. */
  notasDerecha?: { reserva: number; notas: string[] };
};

export type TablasPlano = {
  referencias: TablaLamina;
  materiales: TablaLamina;
  calculo: TablaLamina;
  numeracion: NumeracionPlano;
  avisos: string[];
};

const SIN_DATO = "—";
const MARCA_SIGAS = "SIGAS";
const MATRICULA_SIGAS = "044-42";
const RESERVA_BOCA_TAPONADA = 0.2;
const RESERVA_MOTIVO = 0.3;
const ORDEN_MATERIALES = [
  "CAÑO",
  "CODO",
  "CODO C/ROSCA HEMBRA",
  "TE",
  "TE DE REDUCCIÓN",
  "CUPLA DE REDUCCIÓN",
  "TRANSICIÓN",
  "LLAVE DE PASO",
  "TAPÓN",
  "OTROS ACCESORIOS",
];

/** Nombre de cada pieza en la tabla de Materiales. */
const MATERIAL_POR_PIEZA: Record<TechnicalMaterialAccessoryKind, string> = {
  elbow: "CODO",
  other: "OTROS ACCESORIOS",
  reduced_tee: "TE DE REDUCCIÓN",
  reducing_coupling: "CUPLA DE REDUCCIÓN",
  reduction: "CUPLA DE REDUCCIÓN",
  rh_elbow: "CODO C/ROSCA HEMBRA",
  tee: "TE",
  transition: "TRANSICIÓN",
  valve: "LLAVE DE PASO",
};

/** En derivaciones con reducción la app pone te normal + cupla: la te figura como TE. */
function materialDePieza(item: { accessoryKind: TechnicalMaterialAccessoryKind; familyId: string }) {
  if (item.accessoryKind === "reduced_tee" && item.familyId.startsWith("te-normal")) return "TE";
  return MATERIAL_POR_PIEZA[item.accessoryKind] ?? "OTROS ACCESORIOS";
}

/** Bocas taponadas: las marcadas, o las que dicen "boca taponada" en sus notas. */
export function bocasTaponadasDe(
  equipment: WorkbenchEquipment[],
  marcadas?: ReadonlySet<string>,
): ReadonlySet<string> {
  return (
    marcadas ??
    new Set(
      equipment
        .filter((item) => /boca\s+taponada/i.test(item.notes ?? ""))
        .map((item) => item.id),
    )
  );
}

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
  const numeracion = numerarDesdeResultado(params.network, params.result);
  const bocasTaponadas = bocasTaponadasDe(params.equipment, params.bocasTaponadas);

  return {
    referencias: crearReferencias({ ...params, bocasTaponadas }, numeracion, avisos),
    materiales: crearMateriales(params.materialTakeoff, avisos, tapones(params, bocasTaponadas)),
    calculo: crearCalculo(params.calculationSheet, numeracion, avisos),
    numeracion,
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
      const nombre = (item.name.trim() || equipmentTypeLabel(item.type)).toLocaleUpperCase("es-AR");
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
        kcalh,
        m3h,
        numero,
        nota: params.bocasTaponadas?.has(item.id) ? "BOCA TAPONADA" : "",
        celdas: [
          numero ?? SIN_DATO,
          nombre,
          kcalh === null ? SIN_DATO : numero_(kcalh, 0),
          m3h === null ? SIN_DATO : numero_(m3h, 3),
        ],
      };
    })
    .sort((a, b) =>
      (a.numero ?? "~").localeCompare(b.numero ?? "~", "es", { numeric: true }),
    );

  return {
    titulo: "REFERENCIAS",
    columnas: [
      { titulo: "N°", ancho: 0.1, alinear: "centro" },
      { titulo: "Artefacto", ancho: 0.5 },
      { titulo: "kcal/h", ancho: 0.2, alinear: "derecha" },
      { titulo: "m³/h", ancho: 0.2, alinear: "derecha" },
    ],
    filas: [
      ...filas.map((fila) => fila.celdas),
      [
        "",
        "TOTAL",
        filas.some((fila) => fila.kcalh === null)
          ? SIN_DATO
          : numero_(filas.reduce((total, fila) => total + (fila.kcalh ?? 0), 0), 0),
        filas.some((fila) => fila.m3h === null)
          ? SIN_DATO
          : numero_(filas.reduce((total, fila) => total + (fila.m3h ?? 0), 0), 3),
      ],
    ],
    notasDerecha: {
      reserva: RESERVA_BOCA_TAPONADA,
      notas: [...filas.map((fila) => fila.nota), ""],
    },
  };
}

/** Un tapón por boca taponada, con el diámetro del tramo que llega a ella. */
function tapones(
  params: Parameters<typeof crearTablasPlano>[0],
  bocasTaponadas: ReadonlySet<string>,
) {
  const nodoPorArtefacto = new Map(
    params.network.nodes.flatMap((nodo) =>
      nodo.kind === "appliance" && nodo.equipmentId ? [[nodo.equipmentId, nodo.id] as const] : [],
    ),
  );
  return [...bocasTaponadas].map((equipmentId) => {
    const nodo = nodoPorArtefacto.get(equipmentId);
    const tramo = params.network.segments.find(
      (segment) => segment.toNodeId === nodo || segment.fromNodeId === nodo,
    );
    const fila = params.calculationSheet.rows.find((row) => row.segmentId === tramo?.id);
    return diametro(fila?.effectiveDiameter ?? null);
  });
}

function crearMateriales(
  takeoff: TechnicalMaterialTakeoff,
  avisos: string[],
  diametrosTapones: string[] = [],
): TablaLamina {
  if (takeoff.pendingSummary.total > 0) {
    avisos.push(
      `Hay ${takeoff.pendingSummary.total} materiales sin definir. Resolvelos en Calcular.`,
    );
  }

  const resumen = new Map<string, { material: string; diametro: string; cantidad: number }>();
  const sumar = (material: string, diametroTexto: string, cantidad: number) => {
    const clave = `${material}|${diametroTexto}`;
    const actual = resumen.get(clave);

    resumen.set(clave, {
      material,
      diametro: diametroTexto,
      cantidad: (actual?.cantidad ?? 0) + cantidad,
    });
  };

  for (const item of takeoff.pipeItems) {
    sumar("CAÑO", diametro(item.diameter), item.physicalLengthMeters);
  }
  for (const item of takeoff.accessoryItems) {
    const medida = mayorDiametroDeEtiqueta(item.label);

    if (medida === null) {
      avisos.push(`No se pudo leer el diámetro de ${item.label}. Revisalo en Calcular.`);
    }
    sumar(
      materialDePieza(item),
      medida === null ? SIN_DATO : String(medida),
      item.quantity,
    );
  }
  for (const medida of diametrosTapones) {
    sumar("TAPÓN", medida, 1);
  }

  return {
    titulo: "MATERIALES",
    columnas: [
      { titulo: "Material", ancho: 0.32 },
      { titulo: "Diám. (mm)", ancho: 0.16, alinear: "centro" },
      { titulo: "Cantidad", ancho: 0.18, alinear: "derecha" },
      { titulo: "Marca", ancho: 0.17, alinear: "centro" },
      { titulo: "Matrícula", ancho: 0.17, alinear: "centro" },
    ],
    filas: [...resumen.values()]
      .sort(
        (a, b) =>
          ORDEN_MATERIALES.indexOf(a.material) - ORDEN_MATERIALES.indexOf(b.material) ||
          a.diametro.localeCompare(b.diametro, "es", { numeric: true }),
      )
      .map((fila) => [
        fila.material,
        fila.diametro,
        fila.material === "CAÑO"
          ? `${numero_(fila.cantidad, 2)} m`
          : String(fila.cantidad),
        MARCA_SIGAS,
        MATRICULA_SIGAS,
      ]),
  };
}

/** Las reducciones se resumen en su diámetro mayor. */
function mayorDiametroDeEtiqueta(etiqueta: string) {
  const medidas = [...etiqueta.matchAll(/Ø\s*(\d+)(?:\s*[-x×]\s*Ø?\s*(\d+))?/g)]
    .flatMap((coincidencia) => [coincidencia[1], coincidencia[2]])
    .filter((valor): valor is string => valor !== undefined)
    .map(Number);

  return medidas.length > 0 ? Math.max(...medidas) : null;
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
    // La longitud equivalente es la que el motor sumó realmente al calcular.
    const equivalente =
      fila.initialRouteLengthMeters === null ||
      fila.finalCalculationLengthMeters === null
        ? null
        : fila.finalCalculationLengthMeters - fila.initialRouteLengthMeters;

    if (fila.status !== "resolved") {
      avisos.push(`El tramo ${tramo} no está resuelto. Revisalo en Calcular.`);
    }

    return [
      tramo,
      longitud(fila.physicalLengthMeters),
      longitud(fila.initialRouteLengthMeters),
      longitud(equivalente),
      longitud(fila.finalCalculationLengthMeters),
      fila.flowM3h === null ? SIN_DATO : numero_(fila.flowM3h, 3),
      diametro(fila.calculatedDiameter),
      diametro(fila.effectiveDiameter),
    ];
  });

  const motivos = ordenadas.map(({ fila }) => motivoDiametroAdoptado(fila));

  return {
    titulo: "CÁLCULO CAÑERÍA SIGAS",
    columnas: [
      { titulo: "Tramo", ancho: 0.09, alinear: "centro" },
      { titulo: "Long. tramo (m)", ancho: 0.12, alinear: "derecha" },
      { titulo: "Long. de cálculo (m)", ancho: 0.14, alinear: "derecha" },
      { titulo: "Long. equiv. (m)", ancho: 0.13, alinear: "derecha" },
      { titulo: "Long. total (m)", ancho: 0.12, alinear: "derecha" },
      { titulo: "Consumo m³/h", ancho: 0.13, alinear: "derecha" },
      { titulo: "Diám. tabla (mm)", ancho: 0.13, alinear: "centro" },
      { titulo: "Diám. adoptado (mm)", ancho: 0.14, alinear: "centro" },
    ],
    filas,
    // Si el adoptado supera al de tabla, el motivo va a la derecha de la fila.
    ...(motivos.some(Boolean)
      ? { notasDerecha: { reserva: RESERVA_MOTIVO, notas: motivos.map((motivo) => motivo ?? "") } }
      : {}),
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
    : numero_(valor.externalDiameterMillimeters, 0);
}

function numero_(valor: number, decimales: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: decimales,
    minimumFractionDigits: decimales,
  }).format(valor);
}
