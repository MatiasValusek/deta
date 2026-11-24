import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalRouteTransitionResolution } from "@/lib/calculation/technicalRouteTransitions";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { NumeracionPlano } from "./numeracionPlano";
import type { TablaLamina } from "./tablasPlano";

/*
 * Planilla de cálculo por tramo, como la hoja "Cal. Artefactos" del Excel:
 * para cada tramo, los accesorios de su recorrido contados por diámetro y su
 * longitud equivalente. Lee lo que el motor ya sumó; no calcula nada nuevo.
 */

export const FILAS_PLANILLA = [
  "Unión normal",
  "Unión doble mixta",
  "Codo normal 90°",
  "Codo normal 45°",
  "Codo a 90° c/RH",
  "Te normal flujo a 90°",
  "Te normal flujo a través",
  "Llave esférica",
  "Te reducción central flujo a 90°",
  "Te reducción central flujo a través",
  "Cupla de reducción",
  "Transición",
] as const;

export type FilaPlanilla = (typeof FILAS_PLANILLA)[number] | "Otros";

const DIAMETROS_BASE = [20, 25, 32, 40];
const SIN_DATO = "—";
/** Diferencia tolerada entre la suma de la planilla y lo que usó el motor. */
const TOLERANCIA_M = 0.01;

export type ItemPlanilla = {
  fila: FilaPlanilla;
  diametro: number | null;
  /** Medida para codos con rosca, reducciones y transiciones ("32-25", "x1/2"). */
  medida: string;
  cantidad: number;
  metros: number;
};

export type TramoPlanilla = {
  segmentId: string;
  tramo: string;
  longitudInicial: number | null;
  caudal: number | null;
  diametroInicial: number | null;
  items: ItemPlanilla[];
  /** Longitud equivalente que el motor sumó para este tramo. */
  equivalente: number | null;
  total: number | null;
};

export type PlanillaTramos = { tramos: TramoPlanilla[]; avisos: string[] };

/** Ubica un accesorio SIGAS en su fila de la planilla y saca su medida del código. */
export function clasificarAccesorio(codigo: string): { fila: FilaPlanilla; medida: string } {
  const c = codigo.toLowerCase();
  const par = c.match(/(\d+)(?:-x-|-a-|-)(\d+)(?:-mm)?(?:-|$)/);
  const medidaPar = par ? `${par[1]}-${par[2]}` : "";
  const rosca = c.match(/\d+-x-(\d+(?:-\d+)?(?:-\d+)?)$/);
  const pulgadas = rosca ? rosca[1].replace(/^(\d+)-(\d+)$/, "$1/$2").replace(/^(\d+)-(\d+)-(\d+)$/, "$1 $2/$3") : "";

  if (c.includes("union-normal")) return { fila: "Unión normal", medida: "" };
  if (c.includes("union-doble") || c.includes("mixta")) return { fila: "Unión doble mixta", medida: "" };
  if (c.includes("rosca-hembra") || c.includes("codo-mh")) return { fila: "Codo a 90° c/RH", medida: pulgadas ? `x${pulgadas}` : "" };
  if (c.includes("codo-normal-a-90")) return { fila: "Codo normal 90°", medida: "" };
  if (c.includes("codo-normal-a-45")) return { fila: "Codo normal 45°", medida: "" };
  if (c.includes("te-reduc")) {
    return {
      fila: c.includes("traves") ? "Te reducción central flujo a través" : "Te reducción central flujo a 90°",
      medida: medidaPar,
    };
  }
  if (c.includes("te-normal")) {
    return { fila: c.includes("traves") ? "Te normal flujo a través" : "Te normal flujo a 90°", medida: "" };
  }
  if (c.includes("llave-esferica")) return { fila: "Llave esférica", medida: "" };
  if (c.includes("reduccion") || c.includes("reductor")) return { fila: "Cupla de reducción", medida: medidaPar };
  if (c.includes("transicion")) return { fila: "Transición", medida: pulgadas ? `${c.match(/(\d+)-x/)?.[1] ?? ""}x${pulgadas}` : "" };
  return { fila: "Otros", medida: "" };
}

const mm = (d: PipeDiameterReference | null | undefined) => d?.externalDiameterMillimeters ?? null;

export function crearPlanillaTramos(params: {
  calculationSheet: TechnicalCalculationSheet;
  numeracion: NumeracionPlano;
  result: TechnicalCalculationResult | null;
  routeTransitionResolutions?: Record<string, TechnicalRouteTransitionResolution>;
}): PlanillaTramos {
  const segmentos = new Map(params.result?.segments.map((s) => [s.segmentId, s]) ?? []);
  const avisos: string[] = [];
  const tramos = params.calculationSheet.rows.map((fila): TramoPlanilla => {
    const nombre = params.numeracion.tramos.get(fila.segmentId) ?? fila.tramo;
    const ruta = segmentos.get(fila.segmentId)?.governingRoute?.routeId;
    const accesorios = ruta ? params.result?.routeAccessoryResolutions[ruta]?.contributions ?? [] : [];
    const transiciones = ruta ? params.routeTransitionResolutions?.[ruta]?.contributions ?? [] : [];
    const items: ItemPlanilla[] = [
      ...accesorios.map((a) => ({
        ...clasificarAccesorio(a.catalogCode ?? a.catalogFamilyId ?? ""),
        diametro: mm(a.diameter),
        cantidad: a.quantity,
        metros: a.totalEquivalentLengthMeters ?? 0,
      })),
      ...transiciones
        .filter((t) => (t.equivalentLengthMeters ?? 0) > 0)
        .map((t) => {
          const clase = clasificarAccesorio(t.catalogCode ?? t.catalogFamilyId ?? "reduccion");
          const arriba = mm(t.upstreamDiameter);
          const abajo = mm(t.downstreamDiameter);
          return {
            fila: clase.fila === "Otros" ? ("Cupla de reducción" as const) : clase.fila,
            medida: clase.medida || (arriba && abajo ? `${Math.max(arriba, abajo)}-${Math.min(arriba, abajo)}` : ""),
            diametro: arriba && abajo ? Math.max(arriba, abajo) : arriba ?? abajo,
            cantidad: 1,
            metros: t.equivalentLengthMeters ?? 0,
          };
        }),
    ];
    const equivalente =
      fila.initialRouteLengthMeters === null || fila.finalCalculationLengthMeters === null
        ? null
        : fila.finalCalculationLengthMeters - fila.initialRouteLengthMeters;
    const suma = items.reduce((total, item) => total + item.metros, 0);

    if (equivalente !== null && Math.abs(suma - equivalente) > TOLERANCIA_M) {
      avisos.push(
        `En el tramo ${nombre} los accesorios suman ${formatear(suma)} m y el cálculo usó ${formatear(equivalente)} m. Revisá los accesorios en Calcular.`,
      );
    }

    return {
      segmentId: fila.segmentId,
      tramo: nombre,
      longitudInicial: fila.initialRouteLengthMeters,
      caudal: fila.flowM3h,
      diametroInicial: mm(fila.calculatedDiameter),
      items,
      equivalente,
      total: fila.finalCalculationLengthMeters,
    };
  });

  tramos.sort((a, b) => a.tramo.localeCompare(b.tramo, "es", { numeric: true }));
  return { tramos, avisos };
}

/** Diámetros a mostrar como columnas: 20, 25, 32, 40 y los mayores que aparezcan. */
export function diametrosPlanilla(tramos: TramoPlanilla[]) {
  const usados = tramos.flatMap((t) => t.items.map((i) => i.diametro)).filter((d): d is number => d !== null);
  return [...new Set([...DIAMETROS_BASE, ...usados])].sort((a, b) => a - b);
}

/** Cada tramo como tabla, lista para dibujar con dibujarTablasPdf. */
export function tablaDeTramo(tramo: TramoPlanilla, diametros: number[]): TablaLamina {
  const anchoDiametro = 0.6 / diametros.length;
  const filas = [...FILAS_PLANILLA, ...(tramo.items.some((i) => i.fila === "Otros") ? (["Otros"] as const) : [])];

  return {
    titulo:
      `TRAMO ${tramo.tramo}   ·   Long. inicial: ${longitud(tramo.longitudInicial)} m   ·   ` +
      `Caudal: ${tramo.caudal === null ? SIN_DATO : formatear(tramo.caudal, 3)} m³/h   ·   ` +
      `Diám. inicial: ${tramo.diametroInicial ?? SIN_DATO}`,
    columnas: [
      { titulo: "Accesorios", ancho: 0.28 },
      ...diametros.map((d) => ({ titulo: `${d}`, ancho: anchoDiametro, alinear: "centro" as const })),
      { titulo: "Long. equiv. (m)", ancho: 0.12, alinear: "derecha" as const },
    ],
    filas: [
      ...filas.map((fila) => {
        const items = tramo.items.filter((i) => i.fila === fila);
        const metros = items.reduce((total, i) => total + i.metros, 0);
        return [
          fila,
          ...diametros.map((d) => celda(items.filter((i) => i.diametro === d))),
          items.length > 0 ? formatear(metros) : "",
        ];
      }),
      ["Total (m)", ...diametros.map(() => ""), longitud(tramo.equivalente)],
      ["Longitud equivalente total del tramo (m)", ...diametros.map(() => ""), longitud(tramo.total)],
    ],
  };
}

function celda(items: ItemPlanilla[]) {
  const porMedida = new Map<string, number>();
  for (const item of items) {
    porMedida.set(item.medida, (porMedida.get(item.medida) ?? 0) + item.cantidad);
  }
  return [...porMedida]
    .map(([medida, cantidad]) => (medida ? `${medida}: ${cantidad}` : `${cantidad}`))
    .join("  ");
}

function longitud(valor: number | null) {
  return valor === null ? SIN_DATO : formatear(valor);
}

function formatear(valor: number, decimales = 2) {
  return valor.toLocaleString("es-AR", {
    maximumFractionDigits: decimales,
    minimumFractionDigits: decimales,
  });
}
