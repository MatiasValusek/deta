import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_PROJECT_GAS_CONFIG } from "@/lib/calculation/projectGas";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import {
  applyAccessoryProposalDecisions,
  detectRouteAccessoryProposals,
} from "@/lib/routing/routeAccessoryProposals";
import { crearProyectoEjemplo } from "./obraEjemplo";
import { parsePersistedWorkbenchProject } from "./persistence";

type Resultado = { name: string; status: "passed" };

export function runObraEjemploVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean) => {
    if (!ok()) throw new Error(`Obra de ejemplo: ${name}`);
    results.push({ name, status: "passed" });
  };

  const proyecto = crearProyectoEjemplo();
  const leido = parsePersistedWorkbenchProject(JSON.stringify(proyecto));
  const base = proyecto.bases[0];

  check("se guarda y se vuelve a leer como un trabajo normal", () => leido.status === "loaded");
  check("el plano trae paredes y textos", () =>
    (base.drawing?.entities.length ?? 0) >= 12 && base.drawing?.bounds !== null,
  );

  const resultado = calculateTechnicalTree({
    equipment: base.equipment,
    minSegmentLengthSource: 0.0001,
    network: base.routeNetwork,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    projectGas: DEFAULT_PROJECT_GAS_CONFIG,
    scaleMetersPerSourceUnit: (base.calibration.calibration?.millimetersPerSourceUnit ?? 0) / 1000,
  });

  check("la cañería calcula sin errores", () => resultado.status === "valid");
  check("los siete tramos tienen diámetro", () =>
    resultado.segments.length === 7 &&
    resultado.segments.every((segmento) => segmento.calculatedDiameter !== null),
  );

  check("las tes de las derivaciones ya vienen confirmadas", () => {
    const propuestas = applyAccessoryProposalDecisions({
      decisions: base.routeAccessoryProposalDecisions,
      proposals: detectRouteAccessoryProposals({
        equipment: base.equipment,
        network: base.routeNetwork,
      }),
    });
    return propuestas.length === 3 && propuestas.every((p) => p.state === "confirmed");
  });

  return results;
}
