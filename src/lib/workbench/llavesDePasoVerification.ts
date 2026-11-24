import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { agregarLlavesDePaso, tipoLlaveDePaso } from "@/lib/calculation/llavesDePaso";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_PROJECT_GAS_CONFIG } from "@/lib/calculation/projectGas";
import { createTechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { diametrosPorTramo, dibujarIsometricaPdf } from "@/lib/laminas/isometricaPdf";
import { armarPlanoInstalacion } from "@/lib/laminas/planoInstalacionArmado";
import { dibujarPlantaPdf } from "@/lib/laminas/plantaPdf";
import { LARGO_LLAVE_MM } from "@/lib/laminas/simboloLlave";
import { MM_POR_PT } from "@/lib/obra/rotuloFormato";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { armarResultadosObra, LARGO_MINIMO_TRAMO } from "./calculoObra";
import { ARTEFACTOS_CASA, CANERIA_CASA } from "./obraCasaDesdeCero";
import { calcularObraDePrueba, OBRAS_DE_PRUEBA, type ObraDePrueba } from "./obrasDePrueba";

type Resultado = { name: string; status: "passed" };

/*
 * Llaves de paso automáticas: una general a la salida del medidor y una antes de cada
 * artefacto, sin que el gasista cargue nada. Se cuentan en materiales, suman longitud
 * equivalente y se dibujan (con "LL.P" en la isométrica) solo donde hay llave.
 */

const llavesDelTramo = (network: ManualRouteNetwork, segmentId: string) =>
  (network.segments.find((segment) => segment.id === segmentId)?.accessories ?? [])
    .filter((accessory) => accessory.type === "valve")
    .reduce((total, accessory) => total + accessory.quantity, 0);

/** Textos y símbolos de llave que deja una lámina, espiando lo que se dibuja en la hoja. */
async function espiarHoja() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1190.55, 841.89]);
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const textos: string[] = [];
  let simbolos = 0;
  const radioLlave = LARGO_LLAVE_MM / MM_POR_PT / 2;
  const drawText = page.drawText.bind(page);
  const drawCircle = page.drawCircle.bind(page);
  page.drawText = ((texto: string, opciones?: Parameters<PDFPage["drawText"]>[1]) => {
    textos.push(texto);
    drawText(texto, opciones);
  }) as PDFPage["drawText"];
  page.drawCircle = ((opciones?: Parameters<PDFPage["drawCircle"]>[0]) => {
    if (Math.abs((opciones?.size ?? 0) - radioLlave) < 1e-9) simbolos += 1;
    drawCircle(opciones);
  }) as PDFPage["drawCircle"];

  return {
    fuente,
    page,
    leer: () => ({ llp: textos.filter((texto) => texto === "LL.P").length, simbolos }),
  };
}

function calcularSinLlaves(obra: ObraDePrueba) {
  return calculateTechnicalTree({
    adoptedDiameterDecisions: obra.adoptedDiameterDecisions,
    equipment: obra.equipment,
    llavesDePaso: false,
    minSegmentLengthSource: LARGO_MINIMO_TRAMO,
    network: obra.network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    projectGas: DEFAULT_PROJECT_GAS_CONFIG,
    scaleMetersPerSourceUnit: obra.scaleMetersPerSourceUnit,
  });
}

export async function runLlavesDePasoVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean | string) => {
    const salida = ok();
    if (salida !== true) {
      throw new Error(`Llaves de paso: ${name}${typeof salida === "string" ? ` (${salida})` : ""}`);
    }
    results.push({ name, status: "passed" });
  };
  const zonas = armarPlanoInstalacion();
  const zonaIsometrica = zonas.find((zona) => zona.id === "isometrica")!;
  const zonaPlanta = zonas.find((zona) => zona.id === "planta")!;

  for (const obra of OBRAS_DE_PRUEBA) {
    const calculo = calcularObraDePrueba(obra);
    const artefactos = obra.equipment.filter((item) => item.role === "appliance").length;
    const esperadas = artefactos + 1;
    const llavesEnMateriales = calculo.tablas.materiales.filas
      .filter(([material]) => material === "LLAVE DE PASO")
      .reduce((total, fila) => total + Number(fila[2]), 0);

    check(`${obra.nombre}: una llave general y una por artefacto en Materiales`, () =>
      llavesEnMateriales === esperadas || `${llavesEnMateriales} llaves, se esperaban ${esperadas}`,
    );

    const red: ManualRouteNetwork = {
      ...obra.network,
      segments: obra.network.segments.map((segment) => ({
        ...segment,
        accessories: calculo.result.segments.find((item) => item.segmentId === segment.id)
          ?.accessories as ManualRouteNetwork["segments"][number]["accessories"],
      })),
    };
    const nodo = (id: string) => obra.network.nodes.find((item) => item.id === id);
    const tramoMedidor = obra.network.segments.find((segment) =>
      [segment.fromNodeId, segment.toNodeId].some((id) => nodo(id)?.kind === "supply"),
    )!;
    const tramosArtefacto = obra.network.segments.filter((segment) =>
      [segment.fromNodeId, segment.toNodeId].some((id) => nodo(id)?.kind === "appliance"),
    );

    check(`${obra.nombre}: la general va en el tramo que sale del medidor`, () =>
      calculo.result.segments
        .find((segment) => segment.segmentId === tramoMedidor.id)
        ?.accessories.some((accessory) => tipoLlaveDePaso(accessory.id) === "general") ?? false,
    );
    check(`${obra.nombre}: una sola llave por bajada, sin duplicar las cargadas a mano`, () =>
      tramosArtefacto.every((segment) => llavesDelTramo(red, segment.id) === 1) ||
      tramosArtefacto.map((segment) => `${segment.id}: ${llavesDelTramo(red, segment.id)}`).join(", "),
    );

    check(`${obra.nombre}: la llave general va con el diámetro adoptado del tramo`, () => {
      const nombre = calculo.tablas.numeracion.tramos.get(tramoMedidor.id);
      const adoptado = calculo.tablas.calculo.filas.find((fila) => fila[0] === nombre)?.at(-1);
      const general = calculo.materialTakeoff.accessoryItems.find(
        (item) => item.accessoryKind === "valve" && item.sourceIds.some((id) => tipoLlaveDePaso(id) === "general"),
      );
      return (adoptado !== undefined && general?.label.includes(`Ø${adoptado}`)) ||
        `${general?.label ?? "sin llave"} en un tramo de ${adoptado}`;
    });

    const resultadoSinLlaves = calcularSinLlaves(obra);
    check(`${obra.nombre}: cada tramo con llave suma su longitud equivalente`, () =>
      calculo.result.segments
        .filter((segment) => segment.accessories.some((accessory) => tipoLlaveDePaso(accessory.id)))
        .every((segment) => {
          const antes = resultadoSinLlaves.segments.find((item) => item.segmentId === segment.segmentId);
          return (segment.accessoryEquivalentLengthMeters ?? 0) > (antes?.accessoryEquivalentLengthMeters ?? Infinity);
        }),
    );
    // Donde la llave no cambia ningún diámetro, todos los recorridos quedan más largos.
    if (obra.nombre !== "casa desde cero") {
      const sinLlaves = createTechnicalCalculationSheet({ equipment: obra.equipment, result: resultadoSinLlaves });
      check(`${obra.nombre}: la llave general alarga todos los recorridos`, () =>
        calculo.calculationSheet.rows.every((row) => {
          const antes = sinLlaves.rows.find((item) => item.segmentId === row.segmentId);
          return (row.finalCalculationLengthMeters ?? 0) > (antes?.finalCalculationLengthMeters ?? Infinity);
        }),
      );
    }

    // Dibujo: isométrica y planta, con y sin llaves.
    const diametros = diametrosPorTramo(calculo.tablas.numeracion, calculo.tablas.calculo.filas);
    const isometrica = await espiarHoja();
    dibujarIsometricaPdf({
      datos: { diametros, numeracion: calculo.tablas.numeracion, vista: calculo.axonometricView },
      fuente: isometrica.fuente,
      page: isometrica.page,
      zona: zonaIsometrica,
    });
    check(`${obra.nombre}: la isométrica dibuja cada llave con su "LL.P"`, () => {
      const { llp, simbolos } = isometrica.leer();
      return (llp === esperadas && simbolos === esperadas) || `${llp} LL.P y ${simbolos} símbolos`;
    });

    const vistaSinLlaves = armarResultadosObra({
      ...obra,
      result: resultadoSinLlaves,
    }).axonometricView;
    const isometricaSinLlaves = await espiarHoja();
    dibujarIsometricaPdf({
      datos: { diametros, numeracion: calculo.tablas.numeracion, vista: vistaSinLlaves },
      fuente: isometricaSinLlaves.fuente,
      page: isometricaSinLlaves.page,
      zona: zonaIsometrica,
    });
    // La obra de tres derivaciones trae llaves cargadas a mano en las 4 bajadas.
    const aMano = obra.nombre === "tres derivaciones" ? artefactos : 0;
    check(`${obra.nombre}: sin llaves no se escribe "LL.P"`, () =>
      isometricaSinLlaves.leer().llp === aMano || `${isometricaSinLlaves.leer().llp} LL.P`,
    );

    const planta = await espiarHoja();
    dibujarPlantaPdf({
      datos: {
        drawing: null,
        equipment: obra.equipment,
        network: obra.network,
        numeracion: calculo.tablas.numeracion,
      },
      fuente: planta.fuente,
      page: planta.page,
      zona: zonaPlanta,
    });
    check(`${obra.nombre}: la planta dibuja cada llave`, () =>
      planta.leer().simbolos === esperadas || `${planta.leer().simbolos} símbolos`,
    );
  }

  // Sin altura de conexión cargada, la llave va igual (con la altura sugerida del tipo).
  const sinConfig: WorkbenchEquipment[] = ARTEFACTOS_CASA.map(({ terminalConfig: _config, ...item }) => item);
  const conLlaves = agregarLlavesDePaso({ equipment: sinConfig, network: CANERIA_CASA });
  check("sin datos de conexión del artefacto, la llave va igual", () =>
    ["c-esquina-estufa", "c-b-cocina", "c-c-calefon", "c-c-calefactor"].every(
      (id) => llavesDelTramo(conLlaves, id) === 1,
    ) && llavesDelTramo(conLlaves, "c-medidor-a") === 1,
  );

  // Un artefacto marcado sin llave (Modo experto) no la lleva.
  const cocinaSinLlave = ARTEFACTOS_CASA.map((item) =>
    item.id === "ca-cocina" && item.terminalConfig
      ? { ...item, terminalConfig: { ...item.terminalConfig, requiresShutoffValve: false } }
      : item,
  );
  check("un artefacto marcado sin llave no la lleva", () =>
    llavesDelTramo(agregarLlavesDePaso({ equipment: cocinaSinLlave, network: CANERIA_CASA }), "c-b-cocina") === 0,
  );

  // Si el gasista confirma la altura, la conexión al artefacto trae su llave: no se duplica.
  const conConexion: ManualRouteNetwork = {
    ...CANERIA_CASA,
    segments: CANERIA_CASA.segments.map((segment) =>
      segment.id === "c-b-cocina"
        ? {
            ...segment,
            accessories: [
              {
                catalogFamilyId: "llave-esferica",
                equivalentLengthMetersPerUnit: null,
                equivalentLengthSource: "pipe_system" as const,
                id: "route-terminal:ca-cocina:valve",
                quantity: 1,
                segmentId: segment.id,
                type: "valve" as const,
              },
            ],
          }
        : segment,
    ),
  };
  check("con la llave de la conexión confirmada no se agrega otra", () =>
    llavesDelTramo(agregarLlavesDePaso({ equipment: ARTEFACTOS_CASA, network: conConexion }), "c-b-cocina") === 1,
  );

  // Otro sistema de cañería: no se agregan (la llave esférica es de las tablas SIGAS).
  check("solo con SIGAS", () =>
    llavesDelTramo(
      agregarLlavesDePaso({ equipment: ARTEFACTOS_CASA, network: CANERIA_CASA, pipeSystemId: "otro" }),
      "c-medidor-a",
    ) === 0,
  );

  return results;
}
