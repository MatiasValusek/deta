import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { MM_POR_PT } from "@/lib/obra/rotuloFormato";
import type { ColumnaTabla, TablaLamina } from "./tablasPlano";

const NEGRO = rgb(0, 0, 0);
const GRIS_ENCABEZADO = rgb(0.91, 0.91, 0.91);
const LINEA_PT = 0.4;
const ALTO_FILA_MAX_MM = 4.2;
const ALTO_FILA_MIN_MM = 2.4;
const LETRA_POR_FILA = 0.62;
const RELLENO_MM = 0.8;
const SEPARACION_MM = 1.5;
const mmAPt = (mm: number) => mm / MM_POR_PT;

export type ZonaTablas = { x1: number; y1: number; x2: number; y2: number };

export const ERROR_TABLAS_NO_ENTRAN =
  "Las tablas tienen demasiadas filas para la lámina. Apagá el croquis o revisá si sobran tramos.";

/** Apila las tablas en la zona. Nunca recorta filas: si no entran, avisa. */
export function dibujarTablasPdf(params: {
  fuente: PDFFont;
  fuenteTitulo: PDFFont;
  page: PDFPage;
  tablas: TablaLamina[];
  zona: ZonaTablas;
}) {
  const { fuente, fuenteTitulo, page, tablas, zona } = params;
  const renglones = tablas.reduce((total, tabla) => total + tabla.filas.length + 2, 0);
  const disponible = zona.y2 - zona.y1 - SEPARACION_MM * (tablas.length + 1);
  const altoFila = Math.min(ALTO_FILA_MAX_MM, disponible / renglones);

  if (altoFila < ALTO_FILA_MIN_MM) {
    throw new Error(ERROR_TABLAS_NO_ENTRAN);
  }

  const x = zona.x1 + SEPARACION_MM;
  const ancho = zona.x2 - zona.x1 - SEPARACION_MM * 2;
  const yPdf = (mm: number) => page.getHeight() - mmAPt(mm);
  const texto = (
    valor: string,
    columna: Pick<ColumnaTabla, "alinear">,
    celdaX: number,
    celdaAncho: number,
    y: number,
    fuenteCelda: PDFFont,
  ) => {
    const limpio = textoAdmitido(valor, fuenteCelda);
    const util = celdaAncho - RELLENO_MM * 2;
    const base = mmAPt(altoFila * LETRA_POR_FILA);
    const medido = fuenteCelda.widthOfTextAtSize(limpio, base) * MM_POR_PT;
    const size = medido > util ? (base * util) / medido : base;
    const final = fuenteCelda.widthOfTextAtSize(limpio, size) * MM_POR_PT;
    const posicion =
      columna.alinear === "derecha"
        ? celdaX + celdaAncho - RELLENO_MM - final
        : columna.alinear === "centro"
          ? celdaX + (celdaAncho - final) / 2
          : celdaX + RELLENO_MM;

    page.drawText(limpio, {
      x: mmAPt(posicion),
      y: yPdf(y + altoFila * 0.72),
      size,
      font: fuenteCelda,
      color: NEGRO,
    });
  };
  const linea = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({
      start: { x: mmAPt(x1), y: yPdf(y1) },
      end: { x: mmAPt(x2), y: yPdf(y2) },
      thickness: LINEA_PT,
      color: NEGRO,
    });
  let y = zona.y1 + SEPARACION_MM;

  for (const tabla of tablas) {
    const arriba = y + altoFila;
    const abajo = arriba + altoFila * (tabla.filas.length + 1);
    const anchoTabla = ancho * (1 - (tabla.notasDerecha?.reserva ?? 0));
    const posiciones = tabla.columnas.reduce<number[]>(
      (acumulado, columna) => [
        ...acumulado,
        acumulado[acumulado.length - 1] + columna.ancho * anchoTabla,
      ],
      [x],
    );

    texto(tabla.titulo, {}, x, ancho, y, fuenteTitulo);
    page.drawRectangle({
      x: mmAPt(x),
      y: yPdf(arriba + altoFila),
      width: mmAPt(anchoTabla),
      height: mmAPt(altoFila),
      color: GRIS_ENCABEZADO,
    });

    tabla.columnas.forEach((columna, indice) => {
      texto(columna.titulo, columna, posiciones[indice], columna.ancho * anchoTabla, arriba, fuenteTitulo);
    });
    tabla.notasDerecha?.notas.forEach((nota, indiceFila) => {
      if (nota) {
        texto(
          nota,
          {},
          x + anchoTabla,
          ancho - anchoTabla,
          arriba + altoFila * (indiceFila + 1),
          fuenteTitulo,
        );
      }
    });
    tabla.filas.forEach((fila, indiceFila) => {
      fila.forEach((celda, indice) => {
        const columna = tabla.columnas[indice];

        if (celda) {
          texto(
            celda,
            columna,
            posiciones[indice],
            columna.ancho * anchoTabla,
            arriba + altoFila * (indiceFila + 1),
            fuente,
          );
        }
      });
    });

    for (let fila = 0; fila <= tabla.filas.length + 1; fila += 1) {
      linea(x, arriba + altoFila * fila, x + anchoTabla, arriba + altoFila * fila);
    }
    for (const posicion of posiciones) {
      linea(posicion, arriba, posicion, abajo);
    }

    y = abajo + SEPARACION_MM;
  }
}

function textoAdmitido(texto: string, fuente: PDFFont) {
  const admitidos = new Set(fuente.getCharacterSet());

  // m³/h sale como "m3/h": algunos visores no muestran el ³ de la fuente estándar.
  return Array.from(texto.normalize("NFC").replace(/³/g, "3").replace(/²/g, "2"), (letra) =>
    admitidos.has(letra.codePointAt(0) ?? -1) ? letra : "?",
  ).join("");
}
