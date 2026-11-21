import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { RotuloContenido } from "./obraData";
import {
  MM_POR_PT,
  ROTULO_LINEA_PT,
  ROTULO_RECUADRO,
  armarRotulo,
} from "./rotuloFormato";

const NEGRO = rgb(0, 0, 0);
const mmAPt = (mm: number) => mm / MM_POR_PT;

/** Dibuja el rótulo en una hoja A3 apaisada. `fuente`: Arial Black o su reemplazo en negrita. */
export function dibujarRotuloPdf(
  page: PDFPage,
  fuente: PDFFont,
  contenido: RotuloContenido,
) {
  const altoHoja = page.getHeight();
  const yPdf = (mm: number) => altoHoja - mmAPt(mm);
  const admitidos = new Set(fuente.getCharacterSet());
  const limpio = (texto: string) =>
    Array.from(texto.normalize("NFC"), (letra) =>
      admitidos.has(letra.codePointAt(0) ?? -1) ? letra : "?",
    ).join("");
  const rotulo = armarRotulo(
    { ...contenido, ...limpiarCampos(contenido, limpio) },
    (texto, altoMm) =>
      fuente.widthOfTextAtSize(texto, mmAPt(altoMm)) * MM_POR_PT,
  );
  const { x1, x2, y1, y2 } = ROTULO_RECUADRO;

  page.drawRectangle({
    x: mmAPt(x1),
    y: yPdf(y2),
    width: mmAPt(x2 - x1),
    height: mmAPt(y2 - y1),
    borderColor: NEGRO,
    borderWidth: ROTULO_LINEA_PT,
  });

  for (const linea of rotulo.lineasFirma) {
    page.drawLine({
      start: { x: mmAPt(linea.x1), y: yPdf(linea.y) },
      end: { x: mmAPt(linea.x2), y: yPdf(linea.y) },
      color: NEGRO,
      thickness: ROTULO_LINEA_PT,
    });
  }

  for (const item of rotulo.textos) {
    page.drawText(item.texto, {
      x: mmAPt(item.xMm),
      y: yPdf(item.baseMm),
      size: mmAPt(item.altoMm),
      font: fuente,
      color: NEGRO,
    });
  }
}

function limpiarCampos(
  contenido: RotuloContenido,
  limpio: (texto: string) => string,
): Omit<RotuloContenido, "firmas"> {
  return {
    titulo: limpio(contenido.titulo),
    propietario: limpio(contenido.propietario),
    calleNumero: limpio(contenido.calleNumero),
    entreCalles: limpio(contenido.entreCalles),
    localidad: limpio(contenido.localidad),
    partido: limpio(contenido.partido),
    instalador: limpio(contenido.instalador),
    matricula: limpio(contenido.matricula),
    categoria: limpio(contenido.categoria),
  };
}
