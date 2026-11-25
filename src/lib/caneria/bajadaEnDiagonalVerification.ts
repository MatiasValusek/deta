import { causasDelAumento, tesSupuestas } from "@/lib/calculation/causaDelAumento";
import type { TechnicalCalculationSheetRow } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import {
  MOTIVO_AMPLIACION,
  MOTIVO_CALCULO_DE_RED,
  MOTIVO_PIEZA_SIN_CONTAR,
  MOTIVO_REDUCCIONES,
  motivoDiametroAdoptado,
} from "@/lib/laminas/motivoDiametro";
import { INSTALADOR_VACIO, OBRA_VACIA } from "@/lib/obra/obraData";
import { avisosDelCalculo } from "@/lib/revisar/avisosDelCalculo";
import { avisosParaDescargar, hojasListas } from "@/lib/revisar/avisosRevisar";
import { ARTEFACTOS_CASA, ESCALA_CASA_M_POR_UNIDAD } from "@/lib/workbench/obraCasaDesdeCero";
import { calcularObraDePrueba, OBRAS_DE_PRUEBA } from "@/lib/workbench/obrasDePrueba";
import { armarRed, TRAZA_VACIA, type TrazaCanoPrincipal } from "./canoPrincipal";

type Resultado = { name: string; status: "passed" };

/*
 * Red de seguridad: una pieza que el motor no sabe clasificar nunca agranda un caño en silencio.
 *
 * Casa desde cero (datos inventados). La bajada a la estufa sale de la te de C en diagonal (45°)
 * y después sube hasta la estufa. En la te no se puede saber si sigue derecho o dobla: antes la
 * te quedaba sin contar y el motor llevaba la bajada a Ø32 con el motivo "Por longitud
 * equivalente de reducciones", que no era cierto. Ahora:
 * - la te se cuenta con la variante que más longitud suma (a 90°: 0,928 m en Ø32, contra 0,235 a
 *   través) + la cupla 32→20, y la bajada queda en Ø20 como pide la tabla;
 * - la pantalla avisa que se supuso la te, sin frenar la descarga;
 * - si igual el motor agranda un tramo, la hoja imprime el motivo real.
 */

const TRAZA_DIAGONAL: TrazaCanoPrincipal = {
  ...TRAZA_VACIA,
  bajadasAMano: { "ca-estufa": [{ x: 200, y: 4800 }] },
  puntos: [{ x: 1000, y: 4000 }, { x: 8600, y: 4000 }],
  salidas: { "ca-estufa": { x: 1000, y: 4000 } },
};

function calcular(traza: TrazaCanoPrincipal) {
  const network = armarRed({
    equipment: ARTEFACTOS_CASA,
    metrosPorUnidad: ESCALA_CASA_M_POR_UNIDAD,
    traza,
  }).network;
  const calculo = calcularObraDePrueba({
    adoptedDiameterDecisions: [],
    equipment: ARTEFACTOS_CASA,
    network,
    nombre: "casa desde cero",
    scaleMetersPerSourceUnit: ESCALA_CASA_M_POR_UNIDAD,
  });
  return { ...calculo, network };
}

const fila = (r: ReturnType<typeof calcular>, tramo: string) => {
  const encontrada = r.tablas.calculo.filas.find((f) => f[0] === tramo);
  if (!encontrada) throw new Error(`no está el tramo ${tramo}`);
  return encontrada;
};
const cantidad = (r: ReturnType<typeof calcular>, material: string, diametro: string) =>
  Number(r.tablas.materiales.filas.find((f) => f[0] === material && f[1] === diametro)?.[2] ?? 0);
const avisos = (r: ReturnType<typeof calcular>) =>
  avisosDelCalculo({
    calculationSheet: r.calculationSheet,
    numeracion: r.tablas.numeracion,
    result: r.result,
  });

export function runBajadaEnDiagonalVerifications() {
  const results: Resultado[] = [];
  const verify = (name: string, run: () => void) => {
    run();
    results.push({ name, status: "passed" });
  };

  const diagonal = calcular(TRAZA_DIAGONAL);
  const [, , , equivalente, total, consumo, porTabla, adoptado] = fila(diagonal, "4-C");

  verify("bajada en diagonal: Ø20 como pide la tabla, sin agrandar", () => {
    igual(diagonal.result.status, "valid");
    igual(consumo, "0,323");
    igual(porTabla, "20");
    igual(adoptado, "20");
    igual(causasDelAumento(diagonal.result).size, 0);
    igual(diagonal.tablas.calculo.notasDerecha, undefined);
  });

  verify("bajada en diagonal: la te se cuenta con la variante más exigente (a 90°) + cupla", () => {
    const supuestas = tesSupuestas(diagonal.result);
    igual(supuestas.length, 1);
    igual(supuestas[0]?.segmentId, "cp:bm:ca-estufa");
    const aportes = Object.values(diagonal.result.transitionAwareNetworkSizing?.routeTransitionResolutions ?? {})
      .flatMap((resolucion) => resolucion.contributions)
      .filter((aporte) => aporte.traversalAssumed);
    igual(aportes.some((aporte) => aporte.catalogFamilyId === "te-normal-flujo-a-90"), true);
    igual(aportes.some((aporte) => aporte.catalogFamilyId === "cupla-reduccion-hh"), true);
    // 9,19 m con la te a través (bajada recta) → con la te a 90° y el codo del quiebre suma más.
    igual(equivalente, "9,89");
    igual(total, "15,52");
    igual(cantidad(diagonal, "CUPLA DE REDUCCIÓN", "32"), 3);
  });

  verify("bajada en diagonal: aviso claro en pantalla, que no frena la descarga", () => {
    const textos = avisos(diagonal);
    igual(textos.length, 1);
    igual(textos[0]?.startsWith("En la te de C no se ve si el tramo 4-C sigue derecho o dobla"), true);
    igual(textos[0]?.includes("tocá Cañería"), true);
    const enRevisar = avisosParaDescargar({
      avisosCalculo: textos,
      avisosPlanilla: [],
      avisosTablas: [],
      conCroquisEnPlano: false,
      drawing: null,
      equipment: ARTEFACTOS_CASA,
      hayPlanoPdf: true,
      instalador: INSTALADOR_VACIO,
      materialesPendientes: 0,
      network: diagonal.network,
      obra: OBRA_VACIA,
      result: diagonal.result,
    }).filter((aviso) => aviso.texto === textos[0]);
    igual(enRevisar.length, 1);
    igual(enRevisar[0]?.paso, "caneria");
    igual(enRevisar[0]?.hojas.length, 0);
    igual(hojasListas(enRevisar).size, 3);
  });

  verify("sin piezas supuestas no hay avisos del cálculo (obras de prueba y bajada recta)", () => {
    const recta = calcular({ ...TRAZA_VACIA, puntos: TRAZA_DIAGONAL.puntos });
    igual(avisos(recta).length, 0);
    for (const obra of OBRAS_DE_PRUEBA) {
      const r = { ...calcularObraDePrueba(obra), network: obra.network };
      igual(avisos(r).length, 0);
      igual(tesSupuestas(r.result).length, 0);
    }
  });

  verify("el motivo de la hoja es el real", () => {
    const d = (mm: number) => ({ externalDiameterMillimeters: mm, id: `sigas-${mm}` }) as never;
    const base = { adoptedDiameter: null, calculatedDiameter: d(20), effectiveDiameter: d(32) };
    igual(motivoDiametroAdoptado({ ...base, enlargementCause: "longitud_equivalente" }), MOTIVO_REDUCCIONES);
    igual(motivoDiametroAdoptado({ ...base, enlargementCause: "pieza_sin_contar" }), MOTIVO_PIEZA_SIN_CONTAR);
    igual(motivoDiametroAdoptado({ ...base, enlargementCause: "otra" }), MOTIVO_CALCULO_DE_RED);
    // Sin comprobación del motor no se afirma que fueron las reducciones.
    igual(motivoDiametroAdoptado({ ...base, enlargementCause: null }), MOTIVO_CALCULO_DE_RED);
    igual(motivoDiametroAdoptado({ ...base, adoptedDiameter: d(32) }), MOTIVO_AMPLIACION);
    igual(motivoDiametroAdoptado({ ...base, effectiveDiameter: d(20) }), null);
  });

  verify("si el motor agranda por una pieza sin contar, lo dice la hoja y lo avisa la pantalla", () => {
    // La auditoría del motor: con un escalón menos, la te queda sin contar.
    const result = {
      ...diagonal.result,
      transitionAwareNetworkSizing: {
        ...diagonal.result.transitionAwareNetworkSizing!,
        minimalityAudit: [
          {
            finalDiameter: { externalDiameterMillimeters: 32, id: "sigas-32" },
            loweredDiameter: { externalDiameterMillimeters: 25, id: "sigas-25" },
            loweredIssueCode: "branch_transition_required",
            reason: "",
            segmentId: "cp:bm:ca-estufa",
            status: "passed",
          },
        ],
        routeTransitionResolutions: {},
      },
    } as unknown as TechnicalCalculationResult;
    igual(causasDelAumento(result).get("cp:bm:ca-estufa"), "pieza_sin_contar");
    const filaAgrandada = diagonal.calculationSheet.rows.find((f) => f.segmentId === "cp:bm:ca-estufa")!;
    const agrandada: TechnicalCalculationSheetRow = {
      ...filaAgrandada,
      effectiveDiameter: { ...filaAgrandada.effectiveDiameter!, externalDiameterMillimeters: 32 },
      enlargementCause: "pieza_sin_contar",
    };
    igual(motivoDiametroAdoptado(agrandada), MOTIVO_PIEZA_SIN_CONTAR);
    const textos = avisosDelCalculo({
      calculationSheet: { ...diagonal.calculationSheet, rows: [agrandada] },
      numeracion: diagonal.tablas.numeracion,
      result,
    });
    igual(textos.length, 1);
    igual(
      textos[0]?.startsWith("El tramo 4-C quedó en Ø32 aunque por tabla alcanza Ø20: la app no pudo contar una pieza"),
      true,
    );
  });

  return results;
}

function igual(actual: unknown, esperado: unknown) {
  if (actual !== esperado) throw new Error(`Se esperaba ${String(esperado)}, dio ${String(actual)}.`);
}
