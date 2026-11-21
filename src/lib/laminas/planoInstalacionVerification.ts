import { PDFDocument } from "pdf-lib";
import { INSTALADOR_VACIO, OBRA_VACIA, crearRotulo } from "@/lib/obra/obraData";
import { ROTULO_RECUADRO } from "@/lib/obra/rotuloFormato";
import {
  A3_MM,
  MARCO_LAMINA,
  armarPlanoInstalacion,
  type OpcionesLamina,
} from "./planoInstalacionArmado";
import { crearPlanoInstalacionPdf } from "./planoInstalacionPdf";

export type PlanoInstalacionVerificationResult = {
  name: string;
  status: "passed";
};

const VARIANTES: OpcionesLamina[] = [
  {},
  { conCorte: true },
  { conCroquis: true },
  { conCorte: true, conCroquis: true },
];

export async function runPlanoInstalacionVerifications() {
  const results: PlanoInstalacionVerificationResult[] = [];
  const zonasDe = (opciones: OpcionesLamina) => [
    ...armarPlanoInstalacion(opciones),
    ROTULO_RECUADRO,
  ];

  results.push(check("los recuadros quedan dentro del marco", () =>
    VARIANTES.flatMap(zonasDe).every(
      (r) =>
        r.x1 >= MARCO_LAMINA.x1 &&
        r.x2 <= MARCO_LAMINA.x2 &&
        r.y1 >= MARCO_LAMINA.y1 &&
        r.y2 <= MARCO_LAMINA.y2,
    ),
  ));
  results.push(check("los recuadros y el rótulo no se pisan", () =>
    VARIANTES.every((opciones) => {
      const zonas = zonasDe(opciones);

      return zonas.every((a, i) =>
        zonas.slice(i + 1).every(
          (b) => a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1,
        ),
      );
    }),
  ));
  results.push(check("el rótulo comparte la esquina con el marco", () =>
    ROTULO_RECUADRO.x2 === MARCO_LAMINA.x2 &&
    ROTULO_RECUADRO.y2 === MARCO_LAMINA.y2,
  ));
  results.push(check("por defecto no hay corte ni croquis y la planta usa toda la altura", () => {
    const zonas = armarPlanoInstalacion();
    const planta = zonas.find((zona) => zona.id === "planta");

    return (
      !zonas.some((zona) => zona.id === "corte" || zona.id === "croquis") &&
      planta?.y2 === MARCO_LAMINA.y2
    );
  }));
  results.push(check("con corte, la planta deja la franja inferior", () => {
    const zonas = armarPlanoInstalacion({ conCorte: true });

    return (
      zonas.find((zona) => zona.id === "planta")?.y2 === 210 &&
      zonas.find((zona) => zona.id === "corte")?.y2 === MARCO_LAMINA.y2
    );
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
