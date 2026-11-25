import { asentarObraAlAbrir } from "./abrirObra";
import { OBRA_GUARDADA_HOY } from "./obraGuardadaHoy";
import { calcularObraDePrueba, OBRAS_DE_PRUEBA, type ObraDePrueba } from "./obrasDePrueba";
import { parsePersistedWorkbenchProject } from "./persistence";

type Resultado = { name: string; status: "passed" };

/*
 * Guardar una obra y volver a abrirla no cambia ningún número: longitudes, diámetros y
 * materiales de las hojas son los mismos. Se guarda con el formato de hoy, se lee como lo lee
 * la app y se hace lo mismo que la pantalla al abrir (asentarObraAlAbrir). Dos vueltas.
 */
function guardarYAbrir(obra: ObraDePrueba): ObraDePrueba {
  const proyecto = JSON.parse(OBRA_GUARDADA_HOY);
  const base = proyecto.bases[0];
  base.equipment = obra.equipment;
  base.routeNetwork = obra.network;
  base.adoptedDiameterDecisions = obra.adoptedDiameterDecisions;
  base.routeAccessoryProposalDecisions = [];
  base.calibration.calibration.millimetersPerSourceUnit = obra.scaleMetersPerSourceUnit * 1000;

  const leida = parsePersistedWorkbenchProject(JSON.stringify(proyecto));
  if (leida.status !== "loaded") {
    throw new Error(`${obra.nombre}: no se pudo abrir la obra guardada`);
  }
  const abierta = leida.project.bases[0];
  const escala = (abierta.calibration.calibration?.millimetersPerSourceUnit ?? 0) / 1000;
  const asentada = asentarObraAlAbrir({
    adoptedDiameterDecisions: abierta.adoptedDiameterDecisions,
    equipment: abierta.equipment,
    network: abierta.routeNetwork,
    routeAccessoryProposalDecisions: abierta.routeAccessoryProposalDecisions,
    scaleMetersPerSourceUnit: escala,
  });

  return {
    ...obra,
    adoptedDiameterDecisions: abierta.adoptedDiameterDecisions,
    equipment: abierta.equipment,
    network: asentada.network,
    scaleMetersPerSourceUnit: escala,
  };
}

export function runGuardarYAbrirVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: boolean, detalle = "") => {
    if (!ok) throw new Error(`Guardar y abrir: ${name}${detalle ? ` (${detalle})` : ""}`);
    results.push({ name, status: "passed" });
  };

  for (const obra of OBRAS_DE_PRUEBA) {
    const antes = calcularObraDePrueba(obra).tablas;
    const unaVez = guardarYAbrir(obra);
    const dosVeces = guardarYAbrir(unaVez);

    for (const [vuelta, abierta] of [["una vez", unaVez], ["dos veces", dosVeces]] as const) {
      const despues = calcularObraDePrueba(abierta).tablas;
      for (const [hoja, a, b] of [
        ["tabla SIGAS (longitudes y diámetros)", antes.calculo.filas, despues.calculo.filas],
        ["materiales", antes.materiales.filas, despues.materiales.filas],
        ["referencias", antes.referencias.filas, despues.referencias.filas],
      ] as const) {
        const distinta = a.findIndex((fila, i) => JSON.stringify(fila) !== JSON.stringify(b[i]));
        check(
          `${obra.nombre}: abierta ${vuelta}, ${hoja} igual`,
          a.length === b.length && distinta < 0,
          distinta >= 0 ? `${JSON.stringify(a[distinta])} → ${JSON.stringify(b[distinta])}` : "",
        );
      }
    }
  }

  // Las tes que la gasista confirmó en la obra de tres derivaciones se respetan al abrir.
  const tres = OBRAS_DE_PRUEBA.find((obra) => obra.nombre === "tres derivaciones");
  if (!tres) throw new Error("Falta la obra de tres derivaciones");
  const fila1A = calcularObraDePrueba(guardarYAbrir(tres)).tablas.calculo.filas.find(
    (fila) => fila[0] === "1-A",
  );
  check("tres derivaciones: 1-A sigue con 13,01 m de longitud equivalente", fila1A?.[3] === "13,01", fila1A?.[3]);

  return results;
}
