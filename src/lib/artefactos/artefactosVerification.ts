import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { calcularObraDePrueba, OBRAS_DE_PRUEBA } from "@/lib/workbench/obrasDePrueba";
import { OBRA_GUARDADA_HOY } from "@/lib/workbench/obraGuardadaHoy";
import { crearArtefacto, moverArtefacto, type PlanoParaUbicar } from "./colocarArtefacto";
import { numerarArtefactos } from "./numerarArtefactos";
import { BOTONES_DE_ARTEFACTOS, tipoDeArtefacto } from "./tiposDeArtefacto";

type Resultado = { name: string; status: "passed" };

/* Paso Artefactos: un botón por tipo con su consumo, un toque para ubicar, numeración sola. */

// Plano de prueba en mm: un rectángulo de paredes de (-500, -500) a (11500, 4000).
const DIBUJO = JSON.parse(OBRA_GUARDADA_HOY).bases[0].drawing;
const PLANO_DXF: PlanoParaUbicar = {
  baseId: "plano",
  constraints: [],
  drawing: DIBUJO,
  fuente: "dxf",
  metrosPorUnidad: 0.001,
  semanticAssignments: [],
};
const PLANO_PDF: PlanoParaUbicar = { ...PLANO_DXF, drawing: null, fuente: "pdf", paginaPdf: 2 };

export function runArtefactosVerifications() {
  const results: Resultado[] = [];
  const verify = (name: string, run: () => void) => {
    run();
    results.push({ name, status: "passed" });
  };

  verify("los botones: Medidor primero y los consumos típicos de PANTALLAS.md", () => {
    assertEqual(BOTONES_DE_ARTEFACTOS.map((tipo) => tipo.boton).join(", "),
      "Medidor, Cocina, Horno, Calefón, Termotanque, Caldera, Estufa / Calefactor, Secarropas, Otro");
    assertEqual(tipoDeArtefacto("stove").kcalPorHora, 9000);
    assertEqual(tipoDeArtefacto("instant_water_heater").kcalPorHora, 20000);
    assertEqual(tipoDeArtefacto("storage_water_heater").kcalPorHora, 6500);
    assertEqual(tipoDeArtefacto("space_heater").kcalPorHora, 3000);
    assertEqual(tipoDeArtefacto("other").kcalPorHora, null);
  });

  verify("un toque crea el artefacto con su consumo típico y un nombre que no se repite", () => {
    const cocina = crearArtefacto({ existentes: [], id: "c1", plano: PLANO_PDF, punto: { x: 10, y: 20 }, tipo: "stove" });
    const otra = crearArtefacto({ existentes: [cocina], id: "c2", plano: PLANO_PDF, punto: { x: 30, y: 20 }, tipo: "stove" });
    assertEqual(cocina.name, "Cocina");
    assertEqual(otra.name, "Cocina 2");
    assertEqual(cocina.role, "appliance");
    assertEqual(cocina.demandValue, 9000);
    assertEqual(cocina.demandUnit, "kcal_h");
    assertEqual(cocina.terminalConfig?.requiresShutoffValve, true);
    const otro = crearArtefacto({ existentes: [], id: "o", plano: PLANO_PDF, punto: { x: 0, y: 0 }, tipo: "other" });
    assertEqual(otro.demandValue, undefined);
  });

  verify("el medidor es el que alimenta, sin consumo", () => {
    const medidor = crearArtefacto({ existentes: [], id: "m", plano: PLANO_DXF, punto: { x: 1000, y: 200 }, tipo: "meter_regulator" });
    assertEqual(medidor.role, "supply");
    assertEqual(medidor.demandValue, undefined);
    assertEqual(medidor.connectionPoint.x, 1000);
  });

  verify("con PDF queda donde se tocó, sin buscar pared, en la página del plano", () => {
    const calefon = crearArtefacto({ existentes: [], id: "cf", plano: PLANO_PDF, punto: { x: 123, y: 456 }, tipo: "instant_water_heater" });
    assertEqual(calefon.connectionPoint.x, 123);
    assertEqual(calefon.connectionPoint.y, 456);
    assertEqual(calefon.wallAnchor, undefined);
    assertEqual(calefon.pdfPageNumber, 2);
  });

  verify("con DXF se apoya en la pared cercana; lejos de una pared, queda donde se tocó", () => {
    const cerca = crearArtefacto({ existentes: [], id: "a", plano: PLANO_DXF, punto: { x: 2000, y: -300 }, tipo: "stove" });
    assertEqual(cerca.wallAnchor?.status, "anchored");
    assertEqual(Math.round(cerca.connectionPoint.y), -500);
    const lejos = crearArtefacto({ existentes: [], id: "b", plano: PLANO_DXF, punto: { x: 5000, y: 2000 }, tipo: "stove" });
    assertEqual(lejos.wallAnchor, undefined);
    assertEqual(lejos.connectionPoint.x, 5000);
    assertEqual(lejos.connectionPoint.y, 2000);
  });

  verify("mover cambia solo el lugar", () => {
    const cocina = crearArtefacto({ existentes: [], id: "c", plano: PLANO_DXF, punto: { x: 2000, y: -300 }, tipo: "stove" });
    const movida = moverArtefacto(PLANO_DXF, { ...cocina, demandValue: 8000, name: "Anafe" }, { x: 5000, y: 2000 });
    assertEqual(movida.name, "Anafe");
    assertEqual(movida.demandValue, 8000);
    assertEqual(movida.wallAnchor, undefined);
    assertEqual(movida.connectionPoint.x, 5000);
  });

  verify("sin cañería, el 1 es el más lejano al medidor", () => {
    const equipo: WorkbenchEquipment[] = [
      crearArtefacto({ existentes: [], id: "m", plano: PLANO_PDF, punto: { x: 0, y: 0 }, tipo: "meter_regulator" }),
      crearArtefacto({ existentes: [], id: "cerca", plano: PLANO_PDF, punto: { x: 100, y: 0 }, tipo: "stove" }),
      crearArtefacto({ existentes: [], id: "lejos", plano: PLANO_PDF, punto: { x: 500, y: 500 }, tipo: "boiler" }),
    ];
    const numeros = numerarArtefactos(equipo, { nodes: [], segments: [] });
    assertEqual(numeros.get("m"), "M");
    assertEqual(numeros.get("lejos"), "1");
    assertEqual(numeros.get("cerca"), "2");
  });

  verify("con la cañería trazada, la pantalla numera igual que el plano en las 3 obras de prueba", () => {
    for (const obra of OBRAS_DE_PRUEBA) {
      const { tablas } = calcularObraDePrueba(obra);
      const numeros = numerarArtefactos(obra.equipment, obra.network);
      for (const nodo of obra.network.nodes) {
        if (nodo.kind !== "appliance" || !nodo.equipmentId) continue;
        const enPlano = tablas.numeracion.nodos.get(nodo.id);
        if (numeros.get(nodo.equipmentId) !== enPlano) {
          throw new Error(`${obra.nombre}: ${nodo.equipmentId} da ${numeros.get(nodo.equipmentId)}, el plano ${enPlano}`);
        }
      }
    }
  });

  return results;
}

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Se esperaba ${String(expected)}, dio ${String(actual)}.`);
}
