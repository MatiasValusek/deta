import { INSTALADOR_VACIO, OBRA_VACIA } from "@/lib/obra/obraData";
import { avisosParaDescargar, hojasListas } from "@/lib/revisar/avisosRevisar";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { ARTEFACTOS_CASA, ESCALA_CASA_M_POR_UNIDAD } from "@/lib/workbench/obraCasaDesdeCero";
import { OBRAS_DE_PRUEBA } from "@/lib/workbench/obrasDePrueba";
import { armarRed, TRAZA_VACIA } from "./canoPrincipal";
import { AVISO_TRAMOS_EN_DIAGONAL, tramosEnDiagonal } from "./tramosEnDiagonal";

type Resultado = { name: string; status: "passed" };

/*
 * Obras cargadas antes con tramos en diagonal (datos inventados): no se borran; Revisar y
 * descargar avisa, con botón a Cañería, y no frena la descarga.
 */

const PUNTOS = [{ x: 1000, y: 4000 }, { x: 8600, y: 4000 }];
const red = (bajadasAMano: Record<string, Array<{ x: number; y: number }>> = {}, salida = PUNTOS[0]) =>
  armarRed({
    equipment: ARTEFACTOS_CASA,
    metrosPorUnidad: ESCALA_CASA_M_POR_UNIDAD,
    traza: {
      ...TRAZA_VACIA,
      bajadasAMano,
      puntos: PUNTOS,
      salidas: Object.fromEntries(Object.keys(bajadasAMano).map((id) => [id, salida])),
    },
  }).network;

const avisos = (network: ManualRouteNetwork, equipment = ARTEFACTOS_CASA) =>
  avisosParaDescargar({
    avisosPlanilla: [],
    avisosTablas: [],
    conCroquisEnPlano: false,
    drawing: null,
    equipment,
    hayPlanoPdf: true,
    instalador: INSTALADOR_VACIO,
    materialesPendientes: 0,
    network,
    obra: OBRA_VACIA,
    result: null,
  }).filter((aviso) => aviso.texto === AVISO_TRAMOS_EN_DIAGONAL);

export function runTramosEnDiagonalVerifications() {
  const results: Resultado[] = [];
  const verify = (name: string, run: () => void) => {
    run();
    results.push({ name, status: "passed" });
  };

  verify("una bajada en diagonal guardada antes se conserva y se avisa, con botón a Cañería", () => {
    const network = red({ "ca-estufa": [{ x: 200, y: 4800 }] });
    const bajada = network.segments.find((s) => s.id === "cp:bm:ca-estufa");
    igual(JSON.stringify(bajada?.vertices), JSON.stringify([{ x: 200, y: 4800 }]));
    igual(tramosEnDiagonal(network, ARTEFACTOS_CASA).join(), "cp:bm:ca-estufa");
    const encontrados = avisos(network);
    igual(encontrados.length, 1);
    igual(encontrados[0]?.paso, "caneria");
    igual(hojasListas(encontrados).size, 3);
  });

  verify("todo a 90° (o con un error de dibujo de menos de 10°): sin aviso", () => {
    igual(avisos(red()).length, 0);
    // Bajada al calefactor desde la punta, con un quiebre corrido 5° de la vertical: se toma como recto.
    const corrido = 1700 * Math.tan((5 * Math.PI) / 180);
    const casiRecta = red({ "ca-calefactor": [{ x: 8600 + corrido, y: 2300 }] }, PUNTOS[1]);
    igual(tramosEnDiagonal(casiRecta, ARTEFACTOS_CASA).length, 0);
  });

  verify("las obras de prueba no tienen tramos en diagonal", () => {
    for (const obra of OBRAS_DE_PRUEBA) igual(tramosEnDiagonal(obra.network, obra.equipment).join(), "");
  });

  return results;
}

function igual(actual: unknown, esperado: unknown) {
  if (actual !== esperado) throw new Error(`Se esperaba ${String(esperado)}, dio ${String(actual)}.`);
}
