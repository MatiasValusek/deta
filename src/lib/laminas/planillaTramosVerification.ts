import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_PROJECT_GAS_CONFIG } from "@/lib/calculation/projectGas";
import { createTechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import { crearProyectoEjemplo } from "@/lib/workbench/obraEjemplo";
import { numerarDesdeResultado } from "./numeracionPlano";
import {
  FILAS_PLANILLA,
  clasificarAccesorio,
  crearPlanillaTramos,
  diametrosPlanilla,
  tablaDeTramo,
} from "./planillaTramos";

type Resultado = { name: string; status: "passed" };

export function runPlanillaTramosVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean) => {
    if (!ok()) throw new Error(`Planilla por tramo: ${name}`);
    results.push({ name, status: "passed" });
  };

  check("cada accesorio SIGAS cae en su fila", () =>
    clasificarAccesorio("te-normal-32-mm-flujo-a-90").fila === "Te normal flujo a 90°" &&
    clasificarAccesorio("te-normal-flujo-a-traves-25-mm").fila === "Te normal flujo a través" &&
    clasificarAccesorio("codo-normal-a-90-20-mm").fila === "Codo normal 90°" &&
    clasificarAccesorio("llave-esferica-20-mm").fila === "Llave esférica" &&
    clasificarAccesorio("union-normal-25-mm").fila === "Unión normal",
  );
  check("reducciones y transiciones llevan su medida", () =>
    clasificarAccesorio("cupla-reduccion-hh-32-a-25-mm").medida === "32-25" &&
    clasificarAccesorio("te-reduc-central-32-x-20-flujo-a-90").medida === "32-20" &&
    clasificarAccesorio("codo-90-con-rosca-hembra-20-x-1-2").medida === "x1/2" &&
    clasificarAccesorio("transicion-hembra-25-x-3-4").medida === "25x3/4",
  );

  // Con la obra de ejemplo, la planilla tiene que cerrar con lo que usó el cálculo.
  const base = crearProyectoEjemplo().bases[0];
  const result = calculateTechnicalTree({
    equipment: base.equipment,
    minSegmentLengthSource: 0.0001,
    network: base.routeNetwork,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    projectGas: DEFAULT_PROJECT_GAS_CONFIG,
    scaleMetersPerSourceUnit: 0.001,
  });
  const routeTransitionResolutions =
    result.transitionAwareNetworkSizing?.routeTransitionResolutions ?? {};
  const calculationSheet = createTechnicalCalculationSheet({
    equipment: base.equipment,
    result,
    routeTransitionResolutions,
  });
  const numeracion = numerarDesdeResultado(base.routeNetwork, result);
  const planilla = crearPlanillaTramos({ calculationSheet, numeracion, result, routeTransitionResolutions });

  check("hay un bloque por tramo, nombrado como en la lámina", () =>
    planilla.tramos.length === 7 && planilla.tramos.every((t) => /^[0-9A-Z]+-[A-Z]$/.test(t.tramo)),
  );
  check("los accesorios de cada tramo suman la longitud equivalente del cálculo", () =>
    planilla.avisos.length === 0 &&
    planilla.tramos.every((t) => t.equivalente !== null && t.items.length > 0),
  );
  check("cada tramo se arma como tabla con todas las filas del Excel y los totales", () => {
    const tabla = tablaDeTramo(planilla.tramos[0], diametrosPlanilla(planilla.tramos));
    return tabla.filas.length === FILAS_PLANILLA.length + 2 && tabla.titulo.startsWith("TRAMO ");
  });

  return results;
}
