import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_PROJECT_GAS_CONFIG } from "@/lib/calculation/projectGas";
import { createTechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import { agregarTesYCodos, codoDeQuiebreId } from "@/lib/calculation/tesYCodos";
import { diametrosPorTramo, dibujarIsometricaPdf } from "@/lib/laminas/isometricaPdf";
import { armarPlanoInstalacion } from "@/lib/laminas/planoInstalacionArmado";
import { dibujarPlantaPdf } from "@/lib/laminas/plantaPdf";
import { MM_POR_PT } from "@/lib/obra/rotuloFormato";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { armarResultadosObra, LARGO_MINIMO_TRAMO } from "./calculoObra";
import { ARTEFACTOS_CASA, CANERIA_CASA } from "./obraCasaDesdeCero";
import { calcularObraDePrueba, OBRAS_DE_PRUEBA } from "./obrasDePrueba";

type Resultado = { name: string; status: "passed" };

/*
 * Tes y codos automáticos: toda derivación lleva te y todo giro en planta lleva codo, aunque
 * nadie los confirme. Se cuentan en materiales y en la longitud equivalente, se ubican en la
 * isométrica, y no se duplican con lo que el gasista cargó a mano.
 */

const derivaciones = (network: ManualRouteNetwork) => {
  const grado = new Map<string, number>();
  for (const segment of network.segments) {
    for (const nodeId of [segment.fromNodeId, segment.toNodeId]) {
      grado.set(nodeId, (grado.get(nodeId) ?? 0) + 1);
    }
  }
  return network.nodes.filter((node) => (grado.get(node.id) ?? 0) >= 3).map((node) => node.id);
};

/** Cuenta los puntos de derivación que deja un dibujo, espiando la hoja. */
async function contarPuntos(radiosMm: number[], dibujar: (page: PDFPage, fuente: never) => void) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1190.55, 841.89]);
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  let puntos = 0;
  const drawCircle = page.drawCircle.bind(page);
  page.drawCircle = ((opciones?: Parameters<PDFPage["drawCircle"]>[0]) => {
    if (radiosMm.some((radio) => Math.abs((opciones?.size ?? 0) - radio / MM_POR_PT) < 1e-9)) puntos += 1;
    drawCircle(opciones);
  }) as PDFPage["drawCircle"];
  dibujar(page, fuente as never);
  return puntos;
}

export async function runTesYCodosVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean | string) => {
    const salida = ok();
    if (salida !== true) {
      throw new Error(`Tes y codos: ${name}${typeof salida === "string" ? ` (${salida})` : ""}`);
    }
    results.push({ name, status: "passed" });
  };
  const zonas = armarPlanoInstalacion();

  // La casa desde cero: nadie confirmó nada.
  const casa = OBRAS_DE_PRUEBA.find((obra) => obra.nombre === "casa desde cero")!;
  const calculoCasa = calcularObraDePrueba(casa);
  const piezas = calculoCasa.physicalAccessoryInventory.items;
  const piezaEn = (kind: "tee" | "reduced_tee" | "elbow_90", nodeId: string) =>
    piezas.filter(
      (item) =>
        (item.kind === kind || (kind === "tee" && item.kind === "reduced_tee")) &&
        (item.nodeId === nodeId || item.sourceIds.some((id) => id.includes(`:${nodeId}:`))),
    );

  check("casa: la derivación del calefón y el calefactor tiene su te", () =>
    piezaEn("tee", "n-c").length === 1 || `${piezaEn("tee", "n-c").length} tes en n-c`,
  );
  check("casa: la esquina del caño principal tiene su codo", () =>
    piezaEn("elbow_90", "n-esquina").length === 1 || `${piezaEn("elbow_90", "n-esquina").length} codos`,
  );
  check("casa: el codo de la esquina va con el diámetro del tramo", () => {
    const codo = calculoCasa.materialTakeoff.accessoryItems.find((item) =>
      item.sourceIds.some((id) => id.includes("n-esquina:elbow")),
    );
    const nombre = calculoCasa.tablas.numeracion.tramos.get("c-esquina-estufa");
    const adoptado = calculoCasa.tablas.calculo.filas.find((fila) => fila[0] === nombre)?.at(-1);
    return Boolean(codo?.label.includes(`Ø${adoptado}`)) || `${codo?.label ?? "sin codo"} en ${adoptado}`;
  });

  const sinPiezas = calculateTechnicalTree({
    equipment: casa.equipment,
    minSegmentLengthSource: LARGO_MINIMO_TRAMO,
    network: casa.network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    projectGas: DEFAULT_PROJECT_GAS_CONFIG,
    scaleMetersPerSourceUnit: casa.scaleMetersPerSourceUnit,
    tesYCodos: false,
  });
  check("casa: el codo de la esquina suma longitud equivalente", () => {
    const antes = createTechnicalCalculationSheet({ equipment: casa.equipment, result: sinPiezas });
    const fila = (sheet: typeof antes, id: string) =>
      sheet.rows.find((row) => row.segmentId === id)?.finalCalculationLengthMeters ?? 0;
    return fila(calculoCasa.calculationSheet, "c-esquina-estufa") > fila(antes, "c-esquina-estufa");
  });
  check("casa: la te y el codo se ubican en la isométrica", () => {
    const ubicadas = calculoCasa.axonometricView.accessories.filter(
      (pieza) => (pieza.kind === "tee" || pieza.kind === "reduced_tee" || pieza.kind === "elbow_90") && pieza.projected,
    );
    const pendientes = calculoCasa.axonometricView.pendingItems.filter((item) => item.type === "accessory");
    return (ubicadas.length > 0 && pendientes.length === 0) || pendientes.map((item) => item.message).join("; ");
  });

  for (const obra of OBRAS_DE_PRUEBA) {
    const calculo = calcularObraDePrueba(obra);
    const nodos = derivaciones(obra.network);

    check(`${obra.nombre}: una te por derivación en materiales`, () => {
      const tes = calculo.tablas.materiales.filas
        .filter(([material]) => material === "TE" || material === "TE DE REDUCCIÓN")
        .reduce((total, fila) => total + Number(fila[2]), 0);
      return tes === nodos.length || `${tes} tes para ${nodos.length} derivaciones`;
    });

    // En la planta el punto marca la te; en la isométrica también (las esquinas no llevan punto).
    const puntosPlanta = await contarPuntos([0.6], (page, fuente) =>
      dibujarPlantaPdf({
        datos: { drawing: null, equipment: obra.equipment, network: obra.network, numeracion: calculo.tablas.numeracion },
        fuente,
        page,
        zona: zonas.find((zona) => zona.id === "planta")!,
      }),
    );
    check(`${obra.nombre}: la planta marca cada te`, () =>
      puntosPlanta === nodos.length || `${puntosPlanta} puntos para ${nodos.length} tes`,
    );
    const puntosIsometrica = await contarPuntos([0.5], (page, fuente) =>
      dibujarIsometricaPdf({
        datos: {
          diametros: diametrosPorTramo(calculo.tablas.numeracion, calculo.tablas.calculo.filas),
          numeracion: calculo.tablas.numeracion,
          vista: calculo.axonometricView,
        },
        fuente,
        page,
        zona: zonas.find((zona) => zona.id === "isometrica")!,
      }),
    );
    check(`${obra.nombre}: la isométrica marca cada te`, () =>
      puntosIsometrica === nodos.length || `${puntosIsometrica} puntos para ${nodos.length} tes`,
    );
  }

  // Quiebre dentro de un tramo: lleva codo, ubicado en el quiebre.
  const conQuiebre: ManualRouteNetwork = {
    ...CANERIA_CASA,
    segments: CANERIA_CASA.segments.map((segment) =>
      segment.id === "c-b-cocina" ? { ...segment, vertices: [{ x: 6000, y: 6000 }, { x: 6500, y: 6000 }] } : segment,
    ),
    nodes: CANERIA_CASA.nodes,
  };
  const equipoQuiebre = ARTEFACTOS_CASA.map((item) =>
    item.id === "ca-cocina" ? { ...item, connectionPoint: { x: 6500, y: 7700 } } : item,
  );
  const quiebres = agregarTesYCodos({ equipment: equipoQuiebre, network: conQuiebre }).segments
    .find((segment) => segment.id === "c-b-cocina")
    ?.accessories?.filter((accessory) => accessory.type === "elbow") ?? [];
  check("un tramo con dos quiebres lleva dos codos", () =>
    (quiebres.length === 2 &&
      quiebres.some((accessory) => accessory.id === codoDeQuiebreId("c-b-cocina", 1)) &&
      quiebres.some((accessory) => accessory.id === codoDeQuiebreId("c-b-cocina", 2))) ||
    quiebres.map((accessory) => accessory.id).join(", "),
  );
  const obraQuiebre = { ...casa, equipment: equipoQuiebre, network: conQuiebre };
  const calculoQuiebre = calcularObraDePrueba(obraQuiebre);
  check("los codos de los quiebres se ubican en el quiebre", () => {
    const codos = calculoQuiebre.physicalAccessoryInventory.items.filter((item) =>
      item.sourceIds.some((id) => id.includes("codo-quiebre:c-b-cocina")),
    );
    const vista = armarResultadosObra({ ...obraQuiebre, result: calculoQuiebre.result }).axonometricView;
    const enVista = vista.accessories.filter((pieza) => pieza.id.includes("codo-quiebre") && pieza.projected);
    return (
      (codos.length === 2 &&
        codos.some((item) => item.position?.x === 6000 && item.position?.y === 6000) &&
        codos.some((item) => item.position?.x === 6500 && item.position?.y === 6000) &&
        enVista.length === 2) ||
      `${codos.length} codos, ${enVista.length} en la isométrica`
    );
  });

  // Lo cargado a mano no se duplica.
  const conTeAMano: ManualRouteNetwork = {
    ...CANERIA_CASA,
    segments: CANERIA_CASA.segments.map((segment) =>
      segment.id === "c-c-calefon"
        ? {
            ...segment,
            accessories: [
              {
                catalogFamilyId: "te-normal-flujo-a-90",
                equivalentLengthMetersPerUnit: null,
                equivalentLengthSource: "pipe_system" as const,
                id: "route-accessory:accessory-proposal:n-c:tee:abc123",
                origin: "user_confirmed" as const,
                quantity: 1,
                segmentId: segment.id,
                type: "tee" as const,
              },
            ],
          }
        : segment.id === "c-esquina-estufa"
          ? {
              ...segment,
              accessories: [
                {
                  catalogFamilyId: "codo-normal-a-90",
                  equivalentLengthMetersPerUnit: null,
                  equivalentLengthSource: "pipe_system" as const,
                  id: "codos-a-mano",
                  quantity: 1,
                  segmentId: segment.id,
                  type: "elbow" as const,
                },
              ],
            }
          : segment,
    ),
  };
  const conAMano = agregarTesYCodos({ equipment: ARTEFACTOS_CASA, network: conTeAMano });
  const piezasDe = (tipo: "tee" | "elbow") =>
    conAMano.segments.flatMap((segment) => segment.accessories ?? []).filter((accessory) => accessory.type === tipo);
  check("una te cargada a mano en el nodo no se duplica", () =>
    piezasDe("tee").filter((accessory) => accessory.id.includes(":n-c:")).length === 1,
  );
  check("con codos cargados a mano en el tramo, la app no agrega otro en esa esquina", () =>
    piezasDe("elbow").length === 1 || `${piezasDe("elbow").length} codos`,
  );

  return results;
}
