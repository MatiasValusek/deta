import { inflateSync } from "node:zlib";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFPage } from "pdf-lib";
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

  check("toda letra que usa la hoja está incluida en el PDF (si no, otros visores no muestran los textos)", () => {
    const usadas = letrasUsadas(pagina);
    const incluidas = letrasIncluidas(pagina);
    return usadas.length > 0 && usadas.every((nombre) => incluidas.includes(nombre));
  });

  return results;
}

function letrasUsadas(pagina: PDFPage) {
  const contenido = pagina.node.Contents();
  const flujos = contenido
    ? "asArray" in contenido
      ? contenido.asArray().map((ref) => pagina.doc.context.lookup(ref))
      : [contenido]
    : [];
  const texto = flujos
    .filter((flujo): flujo is PDFRawStream => flujo instanceof PDFRawStream)
    .map((flujo) => {
      const filtro = flujo.dict.get(PDFName.of("Filter"));
      const bytes = flujo.getContents();
      return Buffer.from(filtro ? inflateSync(bytes) : bytes).toString("latin1");
    })
    .join("\n");
  return [...new Set([...texto.matchAll(/\/(\S+)\s+[\d.]+\s+Tf/g)].map((m) => m[1]))];
}

function letrasIncluidas(pagina: PDFPage) {
  const fuentes = pagina.node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
  return fuentes ? fuentes.keys().map((clave) => clave.decodeText()) : [];
}
