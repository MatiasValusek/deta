import {
  agregarCodosDeSubida,
  cambiosDeNivelEn,
  tipoCodosDeSubida,
} from "@/lib/calculation/codosDeSubida";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import { DEFAULT_PROJECT_GAS_CONFIG } from "@/lib/calculation/projectGas";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import { calculateTechnicalTree } from "@/lib/calculation/technicalTree";
import type { ManualRouteNetwork, RouteSegment, RouteSegmentAccessory } from "@/lib/routing/types";
import {
  createTechnicalRouteNodeElevationIndex,
  resolveTechnicalRouteSegments,
} from "@/lib/sections/technicalRouteElevation";
import { ARTEFACTOS_PRUEBA, CANERIA_PRUEBA } from "@/lib/workbench/obraPruebaTresDerivaciones";

type Resultado = { name: string; status: "passed" };

const ALTO = 2.4;

/*
 * Tramo del medio B-C (no llega al medidor ni a un artefacto) con un solo cambio de nivel:
 * sale de C a la altura de la unión, sube en x = 4000 y sigue alto hasta B (B y A están
 * altos, así A-B queda sin cambio de nivel). Altura sugerida, como la deja una propuesta aceptada sin revisar.
 */
function conCambioDeNivel(extra: (segment: RouteSegment) => RouteSegmentAccessory[] = () => []) {
  const sugerida = { source: "derived_calculation" as const, status: "suggested" as const };
  const network: ManualRouteNetwork = {
    nodes: CANERIA_PRUEBA.nodes.map((node) =>
      (node.id === "n-b" || node.id === "n-a") && node.position
        ? { ...node, position: { ...node.position, z: ALTO }, elevation: sugerida }
        : { ...node },
    ),
    segments: CANERIA_PRUEBA.segments.map((segment) =>
      segment.id === "B-C"
        ? {
            ...segment,
            accessories: [...(segment.accessories ?? []), ...extra(segment)],
            vertexElevations: [sugerida, sugerida],
            vertices: [
              { x: 4000, y: 0 },
              { x: 4000, y: 0, z: ALTO },
            ],
          }
        : { ...segment },
    ),
  } as ManualRouteNetwork;
  return network;
}

const codosCambioNivel = (network: ManualRouteNetwork, segmentId: string) =>
  network.segments
    .find((segment) => segment.id === segmentId)
    ?.accessories?.filter((a) => tipoCodosDeSubida(a.id) === "cambio_nivel")
    .reduce((total, a) => total + a.quantity, 0) ?? 0;

export function runCodosCambioDeNivelVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean) => {
    if (!ok()) throw new Error(`Codos de cambio de nivel: ${name}`);
    results.push({ name, status: "passed" });
  };

  const network = conCambioDeNivel();
  const params = { equipment: ARTEFACTOS_PRUEBA, network };
  const recorrido = resolveTechnicalRouteSegments({
    ...params,
    nodeElevationById: createTechnicalRouteNodeElevationIndex(params),
  }).find((segment) => segment.id === "B-C");

  check("el tramo B-C tiene un solo cambio de nivel", () =>
    cambiosDeNivelEn(recorrido?.path ?? []).length === 1,
  );

  const conCodos = agregarCodosDeSubida(params);
  check("suma 2 codos a 90° en el tramo del medio", () => codosCambioNivel(conCodos, "B-C") === 2);
  check("van como codo normal a 90°", () =>
    conCodos.segments
      .find((segment) => segment.id === "B-C")
      ?.accessories?.some(
        (a) => tipoCodosDeSubida(a.id) === "cambio_nivel" && a.catalogFamilyId === "codo-normal-a-90",
      ) === true,
  );
  check("no se suman en tramos que llegan al medidor o a un artefacto", () =>
    conCodos.segments
      .filter((segment) => segment.id !== "B-C")
      .every((segment) => codosCambioNivel(conCodos, segment.id) === 0),
  );
  check("sin cambio de nivel no se suma nada", () =>
    agregarCodosDeSubida({ equipment: ARTEFACTOS_PRUEBA, network: CANERIA_PRUEBA }).segments.every(
      (segment) => codosCambioNivel({ ...CANERIA_PRUEBA, segments: [segment] }, segment.id) === 0,
    ),
  );
  check("no se cuenta dos veces al volver a pasar", () =>
    codosCambioNivel(agregarCodosDeSubida({ ...params, network: conCodos }), "B-C") === 2,
  );

  // Si el cambio de nivel arranca en la unión y el detector de giros ya puso un codo ahí,
  // ese codo es uno de los 2.
  const enLaUnion = conCambioDeNivel((segment) => [
    {
      catalogFamilyId: "codo-normal-a-90",
      equivalentLengthMetersPerUnit: null,
      equivalentLengthSource: "pipe_system",
      id: `route-accessory:accessory-proposal:n-c:elbow:${segment.id}`,
      origin: "automatic_confirmed",
      quantity: 1,
      segmentId: segment.id,
      type: "elbow",
    },
  ]);
  enLaUnion.segments = enLaUnion.segments.map((segment) =>
    segment.id === "B-C"
      ? { ...segment, vertices: [{ x: 3000, y: 0, z: ALTO }] }
      : segment,
  );
  check("con codo del detector en la unión, suma 1 (no 2)", () =>
    codosCambioNivel(agregarCodosDeSubida({ equipment: ARTEFACTOS_PRUEBA, network: enLaUnion }), "B-C") === 1,
  );

  const result = calculateTechnicalTree({
    equipment: ARTEFACTOS_PRUEBA,
    minSegmentLengthSource: 0.0001,
    network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    projectGas: DEFAULT_PROJECT_GAS_CONFIG,
    scaleMetersPerSourceUnit: 0.001,
  });
  check("el cálculo de B-C cuenta los 2 codos de cambio de nivel", () =>
    (result.segments
      .find((segment) => segment.segmentId === "B-C")
      ?.accessories.filter((a) => tipoCodosDeSubida(a.id) === "cambio_nivel")
      .reduce((total, a) => total + a.quantity, 0) ?? 0) === 2,
  );
  const pieza = createTechnicalPhysicalAccessoryInventory({
    equipment: ARTEFACTOS_PRUEBA,
    network,
    result,
  }).items.find((item) =>
    [item.id, ...item.sourceIds].some((id) => tipoCodosDeSubida(id.slice(id.indexOf("codos-"))) === "cambio_nivel"),
  );
  check("se ubican en el punto del cambio de nivel (isométrica y cortes)", () =>
    pieza?.position?.x === 4000 && pieza.position.y === 0,
  );

  return results;
}
