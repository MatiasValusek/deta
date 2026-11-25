import { degrees, PDFDocument, PDFName } from "pdf-lib";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { crearDatosCroquis, crearRotulo } from "@/lib/obra/obraData";
import { INSTALADOR_EJEMPLO, OBRA_EJEMPLO } from "@/lib/workbench/obraEjemplo";
import { crearFactibilidadPdf, plantaFactibilidad } from "./factibilidadPdf";
import { incrustarFondoPdf } from "./fondoPdf";
import { crearPlanoInstalacionPdf } from "./planoInstalacionPdf";

type Resultado = { name: string; status: "passed" };

/* Plano en PDF: la página va de fondo en la planta de las láminas A3, sin pasar a imagen. */

async function planoDePrueba(rotacion = 0) {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([842, 595]); // A4 apaisado
  pagina.drawRectangle({ x: 100, y: 100, width: 600, height: 400, borderWidth: 2 });
  if (rotacion) pagina.setRotation(degrees(rotacion));
  return doc.save();
}

export async function runFondoPdfVerifications() {
  const results: Resultado[] = [];
  const verify = async (name: string, run: () => Promise<void>) => {
    await run();
    results.push({ name, status: "passed" });
  };

  await verify("la página sin girar: Y hacia abajo como en pantalla", async () => {
    const fondo = await incrustarFondoPdf(await PDFDocument.create(), { bytes: await planoDePrueba(), pagina: 1 });
    if (!fondo) throw new Error("no se incrustó");
    igual(fondo.ancho, 842);
    igual(fondo.alto, 595);
    // La esquina de arriba a la izquierda de la hoja es el (0, 0) de la pantalla.
    igualPunto(fondo.aPantalla({ x: 0, y: 595 }), { x: 0, y: 0 });
    igualPunto(fondo.aPantalla({ x: 842, y: 0 }), { x: 842, y: 595 });
  });

  await verify("la página girada 90°: se ve parada, como en pdf.js", async () => {
    const fondo = await incrustarFondoPdf(await PDFDocument.create(), { bytes: await planoDePrueba(90), pagina: 1 });
    if (!fondo) throw new Error("no se incrustó");
    igual(fondo.ancho, 595);
    igual(fondo.alto, 842);
    igualPunto(fondo.aPantalla({ x: 0, y: 0 }), { x: 0, y: 0 });
    igualPunto(fondo.aPantalla({ x: 0, y: 595 }), { x: 595, y: 0 });
  });

  await verify("un archivo que no es PDF no frena: la planta sale sin fondo", async () => {
    const fondo = await incrustarFondoPdf(await PDFDocument.create(), { bytes: new Uint8Array([1, 2, 3]), pagina: 1 });
    igual(fondo, null);
  });

  await verify("Factibilidad y Plano de instalación llevan la página del plano de fondo", async () => {
    const bytes = await planoDePrueba();
    const medidor: WorkbenchEquipment = {
      connectionPoint: { x: 150, y: 480 },
      id: "m",
      name: "Medidor",
      pdfPageNumber: 1,
      planBaseId: "p",
      role: "supply",
      source: "manual",
      type: "meter_regulator",
    };
    const rotulo = crearRotulo(OBRA_EJEMPLO, INSTALADOR_EJEMPLO);
    const planta = plantaFactibilidad({ drawing: null, equipment: [medidor], fondoPdf: { bytes, pagina: 1 } });
    const factibilidad = await crearFactibilidadPdf(rotulo, planta, crearDatosCroquis(OBRA_EJEMPLO)!);
    const plano = await crearPlanoInstalacionPdf(rotulo, {}, undefined, planta);
    for (const [nombre, hoja] of [["Factibilidad", factibilidad], ["Plano de instalación", plano]] as const) {
      const leida = await PDFDocument.load(hoja);
      const recursos = leida.getPage(0).node.Resources();
      const xobjects = recursos?.lookup(PDFName.of("XObject"));
      const claves = xobjects ? String(xobjects) : "";
      if (!claves.includes("PlanoPdf")) throw new Error(`${nombre}: no tiene el plano de fondo`);
    }
  });

  return results;
}

function igual(actual: unknown, esperado: unknown) {
  if (actual !== esperado) throw new Error(`Se esperaba ${String(esperado)}, dio ${String(actual)}.`);
}

function igualPunto(actual: { x: number; y: number }, esperado: { x: number; y: number }) {
  if (Math.abs(actual.x - esperado.x) > 1e-6 || Math.abs(actual.y - esperado.y) > 1e-6) {
    throw new Error(`Se esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(actual)}.`);
  }
}
