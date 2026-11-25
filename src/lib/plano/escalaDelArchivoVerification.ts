import { escalaDelArchivo, medidasEnMetros } from "./escalaDelArchivo";

type Resultado = { name: string; status: "passed" };

const CASA_EN_MM = { maxX: 10000, maxY: 8000, minX: 0, minY: 0 };
const MM = { code: 4, label: "milimetros", source: "$INSUNITS" as const };

export function runEscalaDelArchivoVerifications() {
  const results: Resultado[] = [];

  verify(results, "un DXF en milímetros toma la escala sola", () => {
    const escala = escalaDelArchivo({ bounds: CASA_EN_MM, units: MM });
    if (escala.tipo !== "tomada") throw new Error(escala.motivo);
    assertCerca(escala.calibration.millimetersPerSourceUnit, 1);
    assertEqual(escala.calibration.origen, "archivo");
    assertEqual(escala.calibration.unit, "m");
    assertEqual(medidasEnMetros(CASA_EN_MM, escala.calibration.millimetersPerSourceUnit / 1000), "10,00 × 8,00 m");
  });

  verify(results, "un DXF en metros o centímetros también", () => {
    const metros = escalaDelArchivo({
      bounds: { maxX: 10, maxY: 8, minX: 0, minY: 0 },
      units: { code: 6, label: "metros", source: "$INSUNITS" },
    });
    const cm = escalaDelArchivo({
      bounds: { maxX: 1000, maxY: 800, minX: 0, minY: 0 },
      units: { code: 5, label: "centimetros", source: "$INSUNITS" },
    });
    if (metros.tipo !== "tomada" || cm.tipo !== "tomada") throw new Error("no tomó la escala");
    assertCerca(metros.calibration.millimetersPerSourceUnit, 1000);
    assertCerca(cm.calibration.millimetersPerSourceUnit, 10);
  });

  verify(results, "sin unidades pide marcar una medida", () => {
    const sinDato = escalaDelArchivo({ bounds: CASA_EN_MM, units: { code: null, label: null, source: "missing" } });
    const cero = escalaDelArchivo({ bounds: CASA_EN_MM, units: { code: 0, label: "sin unidades", source: "$INSUNITS" } });
    assertEqual(sinDato.tipo, "marcar");
    assertEqual(cero.tipo, "marcar");
  });

  verify(results, "si la unidad da una casa imposible, no adivina", () => {
    // Dibujado en mm pero el archivo dice metros: la casa mediría 10 km.
    const enMetros = escalaDelArchivo({ bounds: CASA_EN_MM, units: { code: 6, label: "metros", source: "$INSUNITS" } });
    // Dibujado en metros pero el archivo dice mm: la casa mediría 1 cm.
    const enMm = escalaDelArchivo({ bounds: { maxX: 10, maxY: 8, minX: 0, minY: 0 }, units: MM });
    if (enMetros.tipo !== "marcar" || enMm.tipo !== "marcar") throw new Error("adivinó la escala");
    assertEqual(enMetros.motivo, "El archivo dice que está en metros, pero así la casa mediría 10.000,00 × 8.000,00 m.");
  });

  verify(results, "un plano vacío pide marcar", () => {
    assertEqual(escalaDelArchivo({ bounds: null, units: MM }).tipo, "marcar");
  });

  return results;
}

function verify(results: Resultado[], name: string, run: () => void) {
  run();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}.`);
}

function assertCerca(actual: number, expected: number) {
  if (Math.abs(actual - expected) > 1e-9) throw new Error(`Expected ${expected}, got ${actual}.`);
}
