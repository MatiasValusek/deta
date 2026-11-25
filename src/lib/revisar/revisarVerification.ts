import type { NormalizedDrawing } from "@/lib/geometry/types";
import { INSTALADOR_VACIO, OBRA_VACIA } from "@/lib/obra/obraData";
import { armarResultadosObra } from "@/lib/workbench/calculoObra";
import { crearProyectoEjemplo, INSTALADOR_EJEMPLO, OBRA_EJEMPLO } from "@/lib/workbench/obraEjemplo";
import { calcularObraDePrueba, OBRAS_DE_PRUEBA } from "@/lib/workbench/obrasDePrueba";
import { avisosParaDescargar, hojasListas, type HojaId } from "./avisosRevisar";
import { crearHoja, prepararHojas, resumenObra, type DatosHojas } from "./hojas";

type Resultado = { name: string; status: "passed" };

/*
 * "Revisar y descargar": avisos por hoja en lenguaje de gasista y las 3 hojas armadas con el
 * mismo cálculo que la pantalla.
 */
export async function runRevisarVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: boolean, detalle = "") => {
    if (!ok) throw new Error(`Revisar y descargar: ${name}${detalle ? ` (${detalle})` : ""}`);
    results.push({ name, status: "passed" });
  };

  const ejemplo = OBRAS_DE_PRUEBA.find((obra) => obra.nombre === "ejemplo");
  const casa = OBRAS_DE_PRUEBA.find((obra) => obra.nombre === "casa desde cero");
  if (!ejemplo || !casa) throw new Error("Faltan obras de prueba");
  const drawing = crearProyectoEjemplo().bases[0].drawing as NormalizedDrawing;

  const datosDe = (
    obra: typeof ejemplo,
    cambios: Partial<DatosHojas> = {},
  ): DatosHojas => {
    const result = calcularObraDePrueba(obra).result;
    return {
      conCroquisEnPlano: false,
      drawing,
      equipment: obra.equipment,
      instalador: INSTALADOR_EJEMPLO,
      network: obra.network,
      obra: OBRA_EJEMPLO,
      result,
      resultados: armarResultadosObra({ ...obra, result }),
      routeTransitionResolutions: {},
      visibleLayers: {},
      ...cambios,
    };
  };
  const avisosDe = (datos: DatosHojas) => {
    const { planilla, tablas } = prepararHojas(datos);
    return avisosParaDescargar({
      avisosPlanilla: planilla.avisos,
      avisosTablas: tablas.avisos,
      conCroquisEnPlano: datos.conCroquisEnPlano,
      drawing: datos.drawing,
      equipment: datos.equipment,
      instalador: datos.instalador,
      materialesPendientes: datos.resultados.materialTakeoff.pendingSummary.total,
      network: datos.network,
      obra: datos.obra,
      result: datos.result,
    });
  };
  const listas = (datos: DatosHojas) => [...hojasListas(avisosDe(datos))].sort().join(",");

  // Obra completa: sin avisos y salen las 3 hojas.
  const completa = datosDe(ejemplo);
  check("obra completa: sin avisos", avisosDe(completa).length === 0, avisosDe(completa).map((a) => a.texto).join("; "));
  for (const hoja of ["factibilidad", "plano", "planilla"] as HojaId[]) {
    const bytes = await crearHoja(hoja, completa);
    check(`obra completa: sale ${hoja} en PDF`, new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-");
  }

  // Sin datos de la obra: frena las 3 hojas y lleva a Datos de la obra.
  const sinDatos = avisosDe(datosDe(ejemplo, { instalador: INSTALADOR_VACIO, obra: OBRA_VACIA }));
  check("sin datos: ninguna hoja sale", hojasListas(sinDatos).size === 0);
  check("sin datos: los avisos llevan a Datos de la obra", sinDatos.every((aviso) => aviso.paso === "datos"));

  // Sin croquis: solo frena la Factibilidad (el croquis del plano es opcional).
  const sinCroquis = datosDe(ejemplo, { obra: { ...OBRA_EJEMPLO, calleContrafrente: "" } });
  check("sin calle de atrás: salen plano y planilla", listas(sinCroquis) === "planilla,plano", listas(sinCroquis));
  check(
    "sin calle de atrás y con croquis en el plano: sale solo la planilla",
    listas({ ...sinCroquis, conCroquisEnPlano: true }) === "planilla",
  );

  // Sin plano: frena Factibilidad y Plano de instalación; la planilla sale.
  const sinPlano = avisosDe(datosDe(ejemplo, { drawing: null }));
  check("sin plano: sale solo la planilla", [...hojasListas(sinPlano)].join(",") === "planilla");
  check("sin plano: el aviso lleva al paso Plano", sinPlano.some((aviso) => aviso.paso === "plano"));

  // Sin cañería: el aviso lleva a Cañería.
  const sinCanieria = avisosDe(datosDe(ejemplo, { network: { nodes: [], segments: [] }, result: null }));
  check("sin cañería: el aviso lleva a Cañería", sinCanieria.some((aviso) => aviso.paso === "caneria"));

  // Todos los avisos hablan como gasista: qué pasa y qué hacer, sin pasos viejos ni palabras internas.
  const todos = [...sinDatos, ...sinPlano, ...sinCanieria, ...avisosDe(sinCroquis)];
  const prohibidas = /Calcular|Recorrido|Entregar|compound|preview|segment|network|supply|equipment/i;
  const malos = todos.filter((aviso) => prohibidas.test(aviso.texto) || !/\.\s*\S.*\.$/.test(aviso.texto));
  check("los avisos dicen qué pasa y qué hacer, como gasista", malos.length === 0, malos.map((a) => a.texto).join("; "));

  // Resumen de arriba.
  const tablasCasa = calcularObraDePrueba(casa).tablas;
  const resumen = resumenObra({
    equipment: casa.equipment,
    filasCalculo: tablasCasa.calculo.filas,
    filasReferencias: tablasCasa.referencias.filas,
  });
  check("resumen de la casa", resumen === "4 artefactos · 3,763 m³/h · 8 tramos · caño de 20 a 32", resumen);

  return results;
}
