import { PDFDocument } from "pdf-lib";
import { crearDatosCroquis, crearRotulo } from "@/lib/obra/obraData";
import { ROTULO_RECUADRO } from "@/lib/obra/rotuloFormato";
import {
  INSTALADOR_EJEMPLO,
  OBRA_EJEMPLO,
  crearProyectoEjemplo,
} from "@/lib/workbench/obraEjemplo";
import { armarFactibilidad, crearFactibilidadPdf, plantaFactibilidad } from "./factibilidadPdf";
import { MARCO_LAMINA } from "./planoInstalacionArmado";

type Resultado = { name: string; status: "passed" };

export async function runFactibilidadVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean) => {
    if (!ok()) throw new Error(`Factibilidad: ${name}`);
    results.push({ name, status: "passed" });
  };
  const zonas = [...armarFactibilidad(), ROTULO_RECUADRO];

  check("la planta, el croquis y el rótulo quedan dentro del marco", () =>
    zonas.every(
      (r) =>
        r.x1 >= MARCO_LAMINA.x1 &&
        r.x2 <= MARCO_LAMINA.x2 &&
        r.y1 >= MARCO_LAMINA.y1 &&
        r.y2 <= MARCO_LAMINA.y2,
    ),
  );
  check("no se pisan entre sí", () =>
    zonas.every((a, i) =>
      zonas.slice(i + 1).every(
        (b) => a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1,
      ),
    ),
  );

  const base = crearProyectoEjemplo().bases[0];
  const planta = plantaFactibilidad({ drawing: base.drawing, equipment: base.equipment });

  check("la planta lleva solo el medidor marcado con M y sin cañería", () =>
    planta.network.segments.length === 0 &&
    planta.equipment.length === 1 &&
    [...planta.numeracion.nodos.values()].join() === "M",
  );

  const croquis = crearDatosCroquis(OBRA_EJEMPLO);
  check("la obra de ejemplo trae todo para el croquis", () => croquis !== null);

  const bytes = await crearFactibilidadPdf(
    crearRotulo(OBRA_EJEMPLO, INSTALADOR_EJEMPLO),
    planta,
    croquis!,
  );
  const leido = await PDFDocument.load(bytes);
  const [pagina] = leido.getPages();

  check("sale una sola hoja A3 apaisada", () =>
    leido.getPageCount() === 1 &&
    Math.abs(pagina.getWidth() - 1190.55) < 1 &&
    Math.abs(pagina.getHeight() - 841.89) < 1,
  );

  return results;
}
