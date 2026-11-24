import { tipoCodosDeSubida } from "@/lib/calculation/codosDeSubida";
import { bocasTaponadasDe } from "@/lib/laminas/tablasPlano";
import { OBRA_GUARDADA_HOY } from "./obraGuardadaHoy";
import { calcularObraDePrueba, OBRAS_DE_PRUEBA, type ObraDePrueba } from "./obrasDePrueba";
import { parsePersistedWorkbenchProject } from "./persistence";

type Resultado = { name: string; status: "passed" };

/*
 * Red de seguridad antes de rehacer las pantallas (RELEVAMIENTO.md, punto 9).
 * Fija lo que hoy sale en las tablas del A3 de las tres obras de prueba. Si un cambio mueve
 * un número, esta prueba falla: hay que mirar si el cambio es a propósito y, si lo es,
 * actualizar el valor acá y anotarlo en el commit.
 */

type FotoTablas = {
  referencias: string[][];
  notas: string[];
  /** Material, diámetro y cantidad (marca y matrícula son fijas). */
  materiales: string[][];
  calculo: string[][];
};

const FOTO: Record<ObraDePrueba["nombre"], FotoTablas> = {
  ejemplo: {
    referencias: [
      ["1", "CALEFÓN", "20.000", "2,151"],
      ["2", "COCINA", "9.000", "0,968"],
      ["3", "CALEFACTOR", "3.000", "0,323"],
      ["4", "ESTUFA", "3.000", "0,323"],
      ["", "TOTAL", "35.000", "3,763"],
    ],
    notas: ["", "", "BOCA TAPONADA", "", ""],
    materiales: [
      ["CAÑO", "20", "6,30 m"],
      // A-B iba en 25 en materiales aunque el cálculo pide 32 (corregido): 3 m pasan a 32.
      ["CAÑO", "25", "4,70 m"],
      ["CAÑO", "32", "10,80 m"],
      ["CODO", "20", "6"],
      ["CODO", "25", "2"],
      ["CODO", "32", "4"],
      ["TE", "32", "3"],
      ["CUPLA DE REDUCCIÓN", "32", "3"],
      ["TAPÓN", "20", "1"],
    ],
    calculo: [
      ["1-A", "4,70", "15,50", "9,09", "24,59", "2,151", "25", "25"],
      ["2-B", "4,70", "12,50", "8,86", "21,36", "0,968", "20", "20"],
      ["3-A", "0,80", "11,60", "8,40", "20,00", "0,323", "20", "20"],
      ["4-C", "0,80", "3,60", "7,93", "11,53", "0,323", "20", "20"],
      ["A-B", "3,00", "15,50", "9,09", "24,59", "2,473", "32", "32"],
      ["B-C", "5,00", "15,50", "9,09", "24,59", "3,441", "32", "32"],
      ["C-M", "2,80", "15,50", "9,09", "24,59", "3,763", "32", "32"],
    ],
  },
  "tres derivaciones": {
    referencias: [
      ["1", "ANAFE", "9.000", "0,968"],
      ["2", "HORNO", "3.000", "0,323"],
      ["3", "TERMOTANQUE", "6.500", "0,699"],
      ["4", "CALDERA", "30.000", "3,226"],
      ["", "TOTAL", "48.500", "5,215"],
    ],
    notas: ["", "BOCA TAPONADA", "", "BOCA TAPONADA", ""],
    materiales: [
      ["CAÑO", "25", "10,40 m"],
      ["CAÑO", "32", "7,15 m"],
      ["CODO", "25", "11"],
      ["CODO", "32", "6"],
      ["TE", "25", "2"],
      ["TE", "32", "3"],
      ["CUPLA DE REDUCCIÓN", "32", "1"],
      ["LLAVE DE PASO", "25", "3"],
      ["LLAVE DE PASO", "32", "1"],
      ["TAPÓN", "25", "1"],
      ["TAPÓN", "32", "1"],
    ],
    calculo: [
      ["1-A", "3,40", "10,75", "12,69", "23,44", "0,968", "20", "25"],
      ["2-A", "3,40", "10,75", "12,69", "23,44", "0,323", "20", "25"],
      ["3-B", "1,70", "7,15", "8,39", "15,54", "0,699", "20", "25"],
      ["4-C", "1,70", "4,70", "8,40", "13,10", "3,226", "25", "32"],
      ["A-B", "1,90", "10,75", "12,69", "23,44", "1,290", "25", "25"],
      ["B-C", "2,45", "10,75", "12,69", "23,44", "1,989", "25", "32"],
      ["C-M", "3,00", "10,75", "12,69", "23,44", "5,215", "32", "32"],
    ],
  },
  "casa desde cero": {
    referencias: [
      ["1", "CALEFÓN", "20.000", "2,151"],
      ["2", "CALEFACTOR", "3.000", "0,323"],
      ["3", "COCINA", "9.000", "0,968"],
      ["4", "ESTUFA", "3.000", "0,323"],
      ["", "TOTAL", "35.000", "3,763"],
    ],
    notas: ["", "", "", "", ""],
    materiales: [
      ["CAÑO", "20", "9,40 m"],
      ["CAÑO", "25", "6,30 m"],
      ["CAÑO", "32", "8,80 m"],
      ["CODO", "20", "6"],
      ["CODO", "25", "2"],
      ["CODO", "32", "4"],
      ["TE", "25", "1"],
      ["TE", "32", "2"],
      ["CUPLA DE REDUCCIÓN", "25", "1"],
      ["CUPLA DE REDUCCIÓN", "32", "2"],
    ],
    calculo: [
      ["1-A", "3,70", "15,10", "8,87", "23,97", "2,151", "25", "25"],
      ["2-A", "3,40", "14,80", "9,39", "24,19", "0,323", "20", "20"],
      ["3-B", "3,70", "12,50", "8,86", "21,36", "0,968", "20", "20"],
      ["4-C", "1,50", "6,10", "7,93", "14,03", "0,323", "20", "20"],
      ["A-B", "2,60", "15,10", "8,87", "23,97", "2,473", "25", "25"],
      ["B-D", "5,00", "15,10", "8,87", "23,97", "3,441", "32", "32"],
      ["C-D", "0,80", "6,10", "7,93", "14,03", "0,323", "20", "20"],
      ["D-M", "3,80", "15,10", "8,87", "23,97", "3,763", "32", "32"],
    ],
  },
};

/** Compara sin importar el orden de los campos. */
const ordenado = (valor: unknown): unknown =>
  Array.isArray(valor)
    ? valor.map(ordenado)
    : valor && typeof valor === "object"
      ? Object.fromEntries(
          Object.entries(valor)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([clave, dato]) => [clave, ordenado(dato)]),
        )
      : valor;
const igual = (a: unknown, b: unknown) =>
  JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));

/** Muestra la primera fila distinta, para que el aviso diga qué número cambió. */
function diferencia(nombre: string, hoy: string[][], esperado: string[][]) {
  const largo = Math.max(hoy.length, esperado.length);
  for (let i = 0; i < largo; i += 1) {
    if (!igual(hoy[i], esperado[i])) {
      return `${nombre}: fila ${i + 1} da ${JSON.stringify(hoy[i] ?? null)}, se esperaba ${JSON.stringify(esperado[i] ?? null)}`;
    }
  }
  return null;
}

export function runRedDeSeguridadVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean | string) => {
    const salida = ok();
    if (salida !== true) {
      throw new Error(`Red de seguridad: ${name}${typeof salida === "string" ? ` (${salida})` : ""}`);
    }
    results.push({ name, status: "passed" });
  };

  for (const obra of OBRAS_DE_PRUEBA) {
    const { calculationSheet, result, tablas } = calcularObraDePrueba(obra);
    const foto = FOTO[obra.nombre];
    const materiales = tablas.materiales.filas.map((fila) => fila.slice(0, 3));

    // 1. Las tablas del A3 dan exactamente los valores de hoy.
    check(`${obra.nombre}: calcula sin pendientes ni avisos`, () =>
      result.status === "valid" && calculationSheet.status === "resolved" && tablas.avisos.length === 0
        ? true
        : tablas.avisos.join(" / ") || result.status,
    );
    check(`${obra.nombre}: tabla Cálculo cañería SIGAS igual a la de hoy`, () =>
      diferencia("SIGAS", tablas.calculo.filas, foto.calculo) ?? true,
    );
    check(`${obra.nombre}: tabla Referencias igual a la de hoy`, () =>
      diferencia("Referencias", tablas.referencias.filas, foto.referencias) ??
      (igual(tablas.referencias.notasDerecha?.notas, foto.notas) || "notas de boca taponada"),
    );
    check(`${obra.nombre}: tabla Materiales igual a la de hoy`, () =>
      diferencia("Materiales", materiales, foto.materiales) ?? true,
    );

    // 2. Materiales completos: codos de subida y de salida del medidor, y tapones.
    const artefactos = obra.equipment.filter((item) => item.role === "appliance").length;
    const codos = (tipo: "subida" | "salida_medidor") =>
      result.segments
        .flatMap((segment) => segment.accessories)
        .filter((accessory) => tipoCodosDeSubida(accessory.id) === tipo)
        .reduce((total, accessory) => total + accessory.quantity, 0);
    check(`${obra.nombre}: 4 codos a la salida del medidor y 2 por cada bajada`, () =>
      (codos("salida_medidor") === 4 && codos("subida") === 2 * artefactos) ||
      `medidor ${codos("salida_medidor")}, bajadas ${codos("subida")}`,
    );
    check(`${obra.nombre}: un tapón por cada boca taponada`, () => {
      const tapones = materiales
        .filter(([material]) => material === "TAPÓN")
        .reduce((total, fila) => total + Number(fila[2]), 0);
      return tapones === bocasTaponadasDe(obra.equipment).size || `${tapones} tapones`;
    });

    // 3. Cada derivación cuenta su te. La obra de tres derivaciones no entra: copia la planilla
    // de la gasista, que carga la te en cada recorrido que pasa por ella (5 piezas para 3 tes).
    if (obra.nombre === "tres derivaciones") continue;
    const grado = new Map<string, number>();
    for (const segment of obra.network.segments) {
      for (const nodeId of [segment.fromNodeId, segment.toNodeId]) {
        grado.set(nodeId, (grado.get(nodeId) ?? 0) + 1);
      }
    }
    const derivaciones = [...grado.values()].filter((cantidad) => cantidad >= 3).length;
    check(`${obra.nombre}: una te por derivación en Materiales`, () => {
      const tes = materiales
        .filter(([material]) => material === "TE" || material === "TE DE REDUCCIÓN")
        .reduce((total, fila) => total + Number(fila[2]), 0);
      return tes === derivaciones || `${tes} tes para ${derivaciones} derivaciones`;
    });
  }

  // 3. La casa cargada desde cero no tiene ninguna decisión ni pieza cargada a mano.
  const casa = OBRAS_DE_PRUEBA.find((obra) => obra.nombre === "casa desde cero")!;
  check("casa desde cero: no trae decisiones ni piezas cargadas a mano", () =>
    casa.adoptedDiameterDecisions.length === 0 &&
    casa.network.segments.every((segment) => (segment.accessories ?? []).length === 0),
  );

  // 4. Una obra guardada con la versión de hoy se sigue abriendo igual.
  const leida = parsePersistedWorkbenchProject(OBRA_GUARDADA_HOY);
  const tres = OBRAS_DE_PRUEBA.find((obra) => obra.nombre === "tres derivaciones")!;
  check("la obra guardada hoy se vuelve a abrir", () =>
    leida.status === "loaded" || ("reason" in leida ? leida.reason : leida.status),
  );
  if (leida.status === "loaded") {
    const base = leida.project.bases[0];
    check("la obra guardada conserva artefactos, cañería y diámetros agrandados", () =>
      // Al leer, la app completa de dónde salen las alturas por defecto; lo demás queda igual.
      igual(
        base.equipment.map(({ elevation: _altura, terminalConfig, ...item }) => {
          const { heightSource: _origen, ...config } = terminalConfig ?? {};
          return { ...item, ...(terminalConfig ? { terminalConfig: config } : {}) };
        }),
        tres.equipment,
      ) &&
      igual(base.routeNetwork, tres.network) &&
      igual(base.adoptedDiameterDecisions, tres.adoptedDiameterDecisions),
    );
    check("la obra guardada da la misma tabla SIGAS que la obra de prueba", () => {
      const escala = (base.calibration.calibration?.millimetersPerSourceUnit ?? 0) / 1000;
      const abierta = calcularObraDePrueba({
        adoptedDiameterDecisions: base.adoptedDiameterDecisions,
        equipment: base.equipment,
        network: base.routeNetwork,
        nombre: "tres derivaciones",
        scaleMetersPerSourceUnit: escala,
      });
      return diferencia("SIGAS", abierta.tablas.calculo.filas, FOTO["tres derivaciones"].calculo) ?? true;
    });
  }

  return results;
}
