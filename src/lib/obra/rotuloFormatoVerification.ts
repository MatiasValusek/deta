import { PDFDocument, StandardFonts } from "pdf-lib";
import { crearRotulo, type RotuloContenido } from "./obraData";
import { ROTULO_RECUADRO, armarRotulo } from "./rotuloFormato";
import { dibujarRotuloPdf } from "./rotuloPdf";

export type RotuloFormatoVerificationResult = {
  name: string;
  status: "passed";
};

const LARGO = "NOMBRE MUY LARGO ".repeat(8).trim();
const medir = (texto: string, altoMm: number) => texto.length * altoMm * 0.7;

const contenido: RotuloContenido = crearRotulo(
  {
    propietario: LARGO,
    calle: LARGO,
    numero: "100",
    entreCalle1: LARGO,
    entreCalle2: "Calle Tres",
    localidad: LARGO,
    partido: LARGO,
  },
  { nombre: LARGO, matricula: "00000", categoria: "1" },
);

export async function runRotuloFormatoVerifications() {
  const results: RotuloFormatoVerificationResult[] = [];

  await verify(results, "el recuadro respeta las medidas de la hoja A3", () => {
    assertClose(ROTULO_RECUADRO.x2 - ROTULO_RECUADRO.x1, 130.2);
    assertClose(ROTULO_RECUADRO.y2 - ROTULO_RECUADRO.y1, 74.3);
  });

  await verify(results, "un texto largo no sale de su lugar", () => {
    const { textos } = armarRotulo(contenido, medir);
    const instalador = textos.find((item) => item.texto.startsWith("Instalador"));

    for (const item of textos) {
      assert(item.xMm + medir(item.texto, item.altoMm) <= ROTULO_RECUADRO.x2);
    }
    assert(Boolean(instalador));
    assert(instalador!.xMm + medir(instalador!.texto, instalador!.altoMm) <= 369.001);
  });

  await verify(results, "el PDF acepta letras que la fuente no tiene", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([(420 * 72) / 25.4, (297 * 72) / 25.4]);
    const fuente = await doc.embedFont(StandardFonts.HelveticaBold);

    dibujarRotuloPdf(page, fuente, { ...contenido, propietario: "Łukasz Ñandú 漢" });
    assert((await doc.save()).byteLength > 0);
  });

  return results;
}

async function verify(
  results: RotuloFormatoVerificationResult[],
  name: string,
  run: () => void | Promise<void>,
) {
  await run();
  results.push({ name, status: "passed" });
}

function assert(condition: boolean) {
  if (!condition) {
    throw new Error("Condición no cumplida.");
  }
}

function assertClose(actual: number, expected: number) {
  assert(Math.abs(actual - expected) < 0.001);
}
