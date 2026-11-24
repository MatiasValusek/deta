import { degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DatosCroquis } from "@/lib/obra/obraData";
import { MM_POR_PT } from "@/lib/obra/rotuloFormato";
import type { ZonaPlanta } from "./plantaPdf";

const NEGRO = rgb(0, 0, 0);
const ROJO = rgb(0.9, 0, 0);
const LINEA_PT = 0.5;
const FINA_PT = 0.25;
const ALTO_CALLE_MM = 2.2;
const ALTO_COTA_MM = 1.8;
/** Ancho de la calle y de los pedazos de manzanas vecinas, en mm de hoja. */
const CALLE_MM = 6;
const VECINA_MM = 3;
/** Lugar a la izquierda para la flecha del norte. */
const NORTE_MM = 14;
/** Espacio arriba para el título del recuadro. */
const TITULO_MM = 9;
const MARGEN_MM = 2;
const mmAPt = (mm: number) => mm / MM_POR_PT;

export type OpcionesCroquis = {
  /** Norte adentro de la manzana, arriba a la izquierda (Factibilidad). Si no, a la izquierda del croquis. */
  norteDentro?: boolean;
};
/** Distancia del centro de la flecha del norte a las esquinas de la manzana, cuando va adentro. */
const NORTE_DENTRO_MM = 9;

/** Proporción máxima ancho/alto de la manzana, para que no quede chata como una franja. */
const PROPORCION_MAXIMA = 2.2;

/** Manzana del medio, donde está el terreno, en mm de hoja. */
export function manzanaCroquis(zona: ZonaPlanta, opciones: OpcionesCroquis = {}) {
  const borde = VECINA_MM + CALLE_MM;
  const izquierda = zona.x1 + MARGEN_MM + (opciones.norteDentro ? 0 : NORTE_MM) + borde;
  const derecha = zona.x2 - MARGEN_MM - borde;
  const y1 = zona.y1 + TITULO_MM + borde;
  const y2 = zona.y2 - MARGEN_MM - borde;
  const ancho = Math.min(derecha - izquierda, (y2 - y1) * PROPORCION_MAXIMA);
  const x1 = (izquierda + derecha) / 2 - ancho / 2;

  return { x1, y1, x2: x1 + ancho, y2 };
}

/** Posición del terreno sobre el frente, repartida según los metros a cada esquina. */
export function posicionTerreno(datos: DatosCroquis, x1: number, x2: number) {
  const total = datos.distanciaIzquierda + datos.distanciaDerecha;
  const parte = total > 0 ? datos.distanciaIzquierda / total : 0.5;
  // Que el terreno no quede pegado a la esquina aunque la distancia sea chica.
  const margen = Math.min(10, (x2 - x1) / 4);
  return Math.min(x2 - margen, Math.max(x1 + margen, x1 + (x2 - x1) * parte));
}

export const formatoMetros = (metros: number) =>
  metros.toLocaleString("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** Croquis de ubicación como en la Factibilidad: manzana, 4 calles, distancias a esquina y norte. */
export function dibujarCroquisPdf(params: {
  datos: DatosCroquis;
  fuente: PDFFont;
  opciones?: OpcionesCroquis;
  page: PDFPage;
  zona: ZonaPlanta;
}) {
  const { datos, fuente, page, zona } = params;
  const opciones = params.opciones ?? {};
  const yPdf = (mm: number) => page.getHeight() - mmAPt(mm);
  const linea = (x1: number, y1: number, x2: number, y2: number, grosor = LINEA_PT, color = NEGRO) =>
    page.drawLine({
      start: { x: mmAPt(x1), y: yPdf(y1) },
      end: { x: mmAPt(x2), y: yPdf(y2) },
      thickness: grosor,
      color,
    });
  const rect = (x1: number, y1: number, x2: number, y2: number) => {
    if (x2 - x1 <= 0 || y2 - y1 <= 0) return;
    page.drawRectangle({
      x: mmAPt(x1),
      y: yPdf(y2),
      width: mmAPt(x2 - x1),
      height: mmAPt(y2 - y1),
      borderColor: NEGRO,
      borderWidth: LINEA_PT,
    });
  };
  const ancho = (t: string, alto: number) => fuente.widthOfTextAtSize(t, mmAPt(alto)) * MM_POR_PT;
  /** Achica la letra si el nombre no entra en el largo disponible. */
  const altoQueEntra = (t: string, alto: number, largo: number) =>
    Math.min(alto, (alto * largo) / Math.max(ancho(t, alto), 0.001));
  const textoCentrado = (t: string, cx: number, cy: number, alto: number, largo: number) => {
    const a = altoQueEntra(t, alto, largo);
    page.drawText(t, {
      x: mmAPt(cx - ancho(t, a) / 2),
      y: yPdf(cy + a * 0.35),
      size: mmAPt(a),
      font: fuente,
      color: NEGRO,
    });
  };
  const textoVertical = (t: string, cx: number, cy: number, alto: number, largo: number) => {
    const a = altoQueEntra(t, alto, largo);
    page.drawText(t, {
      x: mmAPt(cx + a * 0.35),
      y: yPdf(cy + ancho(t, a) / 2),
      size: mmAPt(a),
      font: fuente,
      color: NEGRO,
      rotate: degrees(90),
    });
  };

  const m = manzanaCroquis(zona, opciones);
  const exterior = {
    x1: m.x1 - CALLE_MM - VECINA_MM,
    y1: m.y1 - CALLE_MM - VECINA_MM,
    x2: m.x2 + CALLE_MM + VECINA_MM,
    y2: m.y2 + CALLE_MM + VECINA_MM,
  };

  // Manzana del terreno y pedazos de las manzanas vecinas (como en los planos presentados).
  rect(m.x1, m.y1, m.x2, m.y2);
  const recorte = Math.min(8, (m.x2 - m.x1) / 6);
  rect(m.x1 + recorte, exterior.y1, m.x2 - recorte, m.y1 - CALLE_MM);
  rect(m.x1 + recorte, m.y2 + CALLE_MM, m.x2 - recorte, exterior.y2);
  rect(exterior.x1, m.y1 + 2, m.x1 - CALLE_MM, m.y2 - 2);
  rect(m.x2 + CALLE_MM, m.y1 + 2, exterior.x2, m.y2 - 2);
  for (const x of [exterior.x1, m.x2 + CALLE_MM]) {
    rect(x, exterior.y1, x + VECINA_MM, m.y1 - CALLE_MM);
    rect(x, m.y2 + CALLE_MM, x + VECINA_MM, exterior.y2);
  }

  // Nombres de las cuatro calles.
  const largoHorizontal = m.x2 - m.x1 - 4;
  const largoVertical = m.y2 - m.y1 - 2;
  textoCentrado(datos.frente, (m.x1 + m.x2) / 2, m.y2 + CALLE_MM / 2, ALTO_CALLE_MM, largoHorizontal);
  textoCentrado(datos.atras, (m.x1 + m.x2) / 2, m.y1 - CALLE_MM / 2, ALTO_CALLE_MM, largoHorizontal);
  textoVertical(datos.izquierda, m.x1 - CALLE_MM / 2, (m.y1 + m.y2) / 2, ALTO_CALLE_MM, largoVertical);
  textoVertical(datos.derecha, m.x2 + CALLE_MM / 2, (m.y1 + m.y2) / 2, ALTO_CALLE_MM, largoVertical);

  // Cota de distancias a cada esquina, sobre el frente, y marca del terreno.
  const xTerreno = posicionTerreno(datos, m.x1, m.x2);
  const yCota = m.y2 - 4;
  linea(m.x1, yCota, m.x2, yCota, FINA_PT);
  for (const x of [m.x1, xTerreno, m.x2]) {
    linea(x - 0.6, yCota + 0.6, x + 0.6, yCota - 0.6, FINA_PT);
  }
  const izquierda = formatoMetros(datos.distanciaIzquierda);
  const derecha = formatoMetros(datos.distanciaDerecha);
  textoCentrado(izquierda, (m.x1 + xTerreno) / 2, yCota - 1.6, ALTO_COTA_MM, xTerreno - m.x1 - 1);
  textoCentrado(derecha, (xTerreno + m.x2) / 2, yCota - 1.6, ALTO_COTA_MM, m.x2 - xTerreno - 1);
  linea(xTerreno, yCota - 4, xTerreno, m.y2, LINEA_PT);
  linea(xTerreno, m.y2 - 1.5, xTerreno, m.y2 + 2, 1, ROJO);

  // Flecha del norte: 0° apunta arriba, 90° a la derecha.
  const cx = opciones.norteDentro
    ? m.x1 + NORTE_DENTRO_MM
    : m.x1 - CALLE_MM - VECINA_MM - NORTE_MM / 2;
  const cy = opciones.norteDentro ? m.y1 + NORTE_DENTRO_MM : (zona.y1 + TITULO_MM + zona.y2) / 2;
  const angulo = (datos.norteGrados * Math.PI) / 180;
  const punto = (largo: number, desvio: number) => {
    const a = angulo + desvio;
    return { x: cx + Math.sin(a) * largo, y: cy - Math.cos(a) * largo };
  };
  const punta = punto(5, 0);
  const cola = punto(5, Math.PI);
  const lado1 = punto(1.8, Math.PI / 2);
  const lado2 = punto(1.8, -Math.PI / 2);
  linea(cola.x, cola.y, cx, cy, LINEA_PT);
  const svg = (p: { x: number; y: number }) => `${p.x - cx} ${p.y - cy}`;
  const mitad = (lado: { x: number; y: number }, rellena: boolean) =>
    page.drawSvgPath(`M ${svg(punta)} L ${svg(lado)} L 0 0 Z`, {
      x: mmAPt(cx),
      y: yPdf(cy),
      scale: 1 / MM_POR_PT,
      borderColor: NEGRO,
      borderWidth: FINA_PT,
      ...(rellena ? { color: NEGRO } : {}),
    });
  mitad(lado1, true);
  mitad(lado2, false);
  const etiqueta = punto(7.5, 0);
  textoCentrado("N", etiqueta.x, etiqueta.y, ALTO_CALLE_MM, 5);
}
