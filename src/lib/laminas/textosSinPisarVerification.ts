import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { calcularObraDePrueba, OBRAS_DE_PRUEBA } from "@/lib/workbench/obrasDePrueba";
import { diametrosPorTramo, dibujarIsometricaPdf } from "./isometricaPdf";
import { armarPlanoInstalacion } from "./planoInstalacionArmado";
import { dibujarPlantaPdf } from "./plantaPdf";
import { linea, rectangulo, seTocan, type Figura } from "./ubicarTextos";

type Resultado = { name: string; status: "passed" };

/*
 * En la isométrica y en la planta del A3 ningún texto (número, letra, "LL.P", diámetro)
 * pisa un caño, una llave o el medidor, en las tres obras de prueba. Se espía lo que se
 * dibuja en la hoja: líneas y recuadros con borde son dibujo; cada texto, su rectángulo.
 */
async function espiar(
  dibujar: (page: PDFPage, fuente: never) => void,
): Promise<{ dibujo: Figura[]; textos: Array<{ texto: string; figura: Figura }> }> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1190.55, 841.89]);
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const dibujo: Figura[] = [];
  const textos: Array<{ texto: string; figura: Figura }> = [];
  const drawLine = page.drawLine.bind(page);
  const drawText = page.drawText.bind(page);
  const drawRectangle = page.drawRectangle.bind(page);

  page.drawLine = ((opciones: Parameters<PDFPage["drawLine"]>[0]) => {
    dibujo.push(linea(opciones.start, opciones.end, opciones.thickness ?? 1));
    drawLine(opciones);
  }) as PDFPage["drawLine"];
  page.drawRectangle = ((opciones: Parameters<PDFPage["drawRectangle"]>[0] = {}) => {
    if (opciones.borderColor) {
      const x = opciones.x ?? 0;
      const y = opciones.y ?? 0;
      const ancho = opciones.width ?? 0;
      const alto = opciones.height ?? 0;
      // Solo el borde: un texto adentro (la "M" del medidor) no lo pisa.
      for (const [a, b] of [
        [{ x, y }, { x: x + ancho, y }],
        [{ x: x + ancho, y }, { x: x + ancho, y: y + alto }],
        [{ x: x + ancho, y: y + alto }, { x, y: y + alto }],
        [{ x, y: y + alto }, { x, y }],
      ] as const) {
        dibujo.push(linea(a, b, opciones.borderWidth ?? 1));
      }
    }
    drawRectangle(opciones);
  }) as PDFPage["drawRectangle"];
  page.drawText = ((texto: string, opciones: Parameters<PDFPage["drawText"]>[1] = {}) => {
    const tamano = opciones.size ?? 12;
    const angulo = ((opciones.rotate?.angle ?? 0) * Math.PI) / 180;
    textos.push({
      figura: rectangulo(
        { x: opciones.x ?? 0, y: opciones.y ?? 0 },
        fuente.widthOfTextAtSize(texto, tamano),
        tamano * 0.7,
        angulo,
      ),
      texto,
    });
    drawText(texto, opciones);
  }) as PDFPage["drawText"];

  dibujar(page, fuente as never);
  return { dibujo, textos };
}

export async function runTextosSinPisarVerifications() {
  const results: Resultado[] = [];
  const zonas = armarPlanoInstalacion();
  const zona = (id: string) => {
    const encontrada = zonas.find((item) => item.id === id);
    if (!encontrada) throw new Error(`Falta la zona ${id}`);
    return encontrada;
  };

  for (const obra of OBRAS_DE_PRUEBA) {
    const calculo = calcularObraDePrueba(obra);
    const dibujos = {
      isométrica: await espiar((page, fuente) =>
        dibujarIsometricaPdf({
          datos: {
            diametros: diametrosPorTramo(calculo.tablas.numeracion, calculo.tablas.calculo.filas),
            numeracion: calculo.tablas.numeracion,
            vista: calculo.axonometricView,
          },
          fuente,
          page,
          zona: zona("isometrica"),
        }),
      ),
      planta: await espiar((page, fuente) =>
        dibujarPlantaPdf({
          datos: {
            drawing: null,
            equipment: obra.equipment,
            network: obra.network,
            numeracion: calculo.tablas.numeracion,
          },
          fuente,
          page,
          zona: zona("planta"),
        }),
      ),
    };

    for (const [nombre, { dibujo, textos }] of Object.entries(dibujos)) {
      const pisados = textos.filter((texto) => dibujo.some((figura) => seTocan(texto.figura, figura)));
      const encimados = textos.filter((texto, i) =>
        textos.some((otro, j) => j !== i && seTocan(texto.figura, otro.figura)),
      );
      const name = `${obra.nombre}, ${nombre}: ningún texto pisa el dibujo ni otro texto`;
      if (textos.length === 0 || pisados.length > 0 || encimados.length > 0) {
        throw new Error(
          `${name} (pisan: ${pisados.map((t) => t.texto).join(", ") || "-"}; encimados: ${
            encimados.map((t) => t.texto).join(", ") || "-"
          })`,
        );
      }
      results.push({ name, status: "passed" });
    }
  }

  return results;
}
