import { PDFDocument } from "pdf-lib";
import { INSTALADOR_VACIO, OBRA_VACIA, crearRotulo } from "@/lib/obra/obraData";
import { ROTULO_RECUADRO } from "@/lib/obra/rotuloFormato";
import {
  A3_MM,
  MARCO_LAMINA,
  RECUADROS_PLANO_INSTALACION,
  type RecuadroLamina,
} from "./planoInstalacionArmado";
import { crearPlanoInstalacionPdf } from "./planoInstalacionPdf";

export type PlanoInstalacionVerificationResult = {
  name: string;
  status: "passed";
};

export async function runPlanoInstalacionVerifications() {
  const results: PlanoInstalacionVerificationResult[] = [];
  const zonas = [
    ...RECUADROS_PLANO_INSTALACION,
    { ...ROTULO_RECUADRO, id: "rotulo" } as unknown as RecuadroLamina,
  ];

  results.push(check("los recuadros quedan dentro del marco", () =>
    zonas.every(
      (r) =>
        r.x1 >= MARCO_LAMINA.x1 &&
        r.x2 <= MARCO_LAMINA.x2 &&
        r.y1 >= MARCO_LAMINA.y1 &&
        r.y2 <= MARCO_LAMINA.y2,
    ),
  ));
  results.push(check("los recuadros y el rótulo no se pisan", () =>
    zonas.every((a, i) =>
      zonas.slice(i + 1).every(
        (b) => a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1,
      ),
    ),
  ));
  results.push(check("cubren toda la superficie del marco", () => {
    const area = (r: { x1: number; y1: number; x2: number; y2: number }) =>
      (r.x2 - r.x1) * (r.y2 - r.y1);
    const suma = zonas.reduce((total, zona) => total + area(zona), 0);
    return Math.abs(suma - area(MARCO_LAMINA)) < 0.01;
  }));

  const bytes = await crearPlanoInstalacionPdf(
    crearRotulo(OBRA_VACIA, INSTALADOR_VACIO),
  );
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);

  results.push(check("el PDF es una hoja A3 apaisada", () =>
    doc.getPageCount() === 1 &&
    Math.abs(page.getWidth() - (A3_MM.ancho * 72) / 25.4) < 0.01 &&
    Math.abs(page.getHeight() - (A3_MM.alto * 72) / 25.4) < 0.01,
  ));

  return results;
}

function check(
  name: string,
  condition: () => boolean,
): PlanoInstalacionVerificationResult {
  if (!condition()) {
    throw new Error(`No se cumple: ${name}`);
  }

  return { name, status: "passed" };
}
