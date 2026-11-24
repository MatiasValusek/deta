import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { MM_POR_PT } from "@/lib/obra/rotuloFormato";
import type { ZonaPlanta } from "./plantaPdf";

const NEGRO = rgb(0, 0, 0);
const ROJO = rgb(0.9, 0, 0);
const LINEA_PT = 0.5;
const FINA_PT = 0.25;
const ALTO_COTA_MM = 2.4;
/** Escala del detalle: 50 mm de hoja por metro (0,40 m → 20 mm). */
const MM_POR_METRO = 50;
const ANCHO_M = 0.4;
const ALTO_M = 0.5;
const BASE_M = 0.1;
/** Espacio libre abajo para el título "GABINETE 50*40*30". */
const RESERVA_TITULO_MM = 9;
const mmAPt = (mm: number) => mm / MM_POR_PT;

/** Medidas del dibujo en mm de la hoja, para verificar que entra en su zona. */
export function medidasGabinete(zona: ZonaPlanta) {
  const ancho = ANCHO_M * MM_POR_METRO;
  const alto = ALTO_M * MM_POR_METRO;
  const base = BASE_M * MM_POR_METRO;
  const suelo = zona.y2 - RESERVA_TITULO_MM;
  const x1 = (zona.x1 + zona.x2) / 2 - ancho / 2 + 2;

  return {
    x1,
    x2: x1 + ancho,
    arriba: suelo - base - alto,
    pisoGabinete: suelo - base,
    suelo,
  };
}

/** Detalle fijo del gabinete del medidor, de frente, con cotas como en los planos presentados. */
export function dibujarGabinetePdf(params: {
  fuente: PDFFont;
  page: PDFPage;
  zona: ZonaPlanta;
}) {
  const { fuente, page, zona } = params;
  const m = medidasGabinete(zona);
  const yPdf = (mm: number) => page.getHeight() - mmAPt(mm);
  const linea = (x1: number, y1: number, x2: number, y2: number, grosor = LINEA_PT, color = NEGRO) =>
    page.drawLine({
      start: { x: mmAPt(x1), y: yPdf(y1) },
      end: { x: mmAPt(x2), y: yPdf(y2) },
      thickness: grosor,
      color,
    });
  const rect = (x1: number, y1: number, x2: number, y2: number, grosor = LINEA_PT) =>
    page.drawRectangle({
      x: mmAPt(x1),
      y: yPdf(y2),
      width: mmAPt(x2 - x1),
      height: mmAPt(y2 - y1),
      borderColor: NEGRO,
      borderWidth: grosor,
    });
  const texto = (t: string, x: number, y: number) =>
    page.drawText(t, {
      x: mmAPt(x),
      y: yPdf(y),
      size: mmAPt(ALTO_COTA_MM),
      font: fuente,
      color: NEGRO,
    });
  const anchoTexto = (t: string) => fuente.widthOfTextAtSize(t, mmAPt(ALTO_COTA_MM)) * MM_POR_PT;

  // Gabinete: marco exterior grueso y contorno interior.
  rect(m.x1, m.arriba, m.x2, m.pisoGabinete, 1.2);
  rect(m.x1 + 1, m.arriba + 1, m.x2 - 1, m.pisoGabinete - 0.5, FINA_PT);

  // Base de mampostería rayada, bajo el gabinete.
  rect(m.x1, m.pisoGabinete, m.x2, m.suelo, LINEA_PT);
  for (let x = m.x1 - (m.suelo - m.pisoGabinete); x < m.x2; x += 1.2) {
    const desde = Math.max(x, m.x1);
    const hasta = Math.min(x + (m.suelo - m.pisoGabinete), m.x2);
    if (hasta <= desde) continue;
    linea(desde, m.suelo - (desde - x), hasta, m.suelo - (hasta - x), FINA_PT);
  }

  // Nivel de vereda.
  linea(m.x1 - 14, m.suelo, m.x2 + 14, m.suelo, LINEA_PT);

  // Medidor con regulador.
  const ancho = m.x2 - m.x1;
  const alto = m.pisoGabinete - m.arriba;
  const med = {
    x1: m.x1 + ancho * 0.22,
    x2: m.x1 + ancho * 0.62,
    y1: m.arriba + alto * 0.38,
    y2: m.arriba + alto * 0.78,
  };
  rect(med.x1, med.y1, med.x2, med.y2);
  rect(med.x1 + 1.5, med.y1 + 1.5, med.x2 - 1.5, med.y1 + 3.5, FINA_PT);
  page.drawCircle({
    x: mmAPt(m.x1 + ancho * 0.3),
    y: yPdf(m.arriba + alto * 0.2),
    size: mmAPt(2),
    borderColor: NEGRO,
    borderWidth: LINEA_PT,
  });
  page.drawCircle({
    x: mmAPt(m.x1 + ancho * 0.3),
    y: yPdf(m.arriba + alto * 0.2),
    size: mmAPt(0.9),
    borderColor: NEGRO,
    borderWidth: FINA_PT,
  });
  linea(m.x1 + ancho * 0.3, m.arriba + alto * 0.2 + 2, m.x1 + ancho * 0.3, med.y1, LINEA_PT);

  // Cañería de salida (en rojo) desde el medidor hasta el piso, con llave de paso.
  const xCano = m.x1 + ancho * 0.82;
  linea(med.x2, m.arriba + alto * 0.2, xCano, m.arriba + alto * 0.2, 0.9, ROJO);
  linea(xCano, m.arriba + alto * 0.12, xCano, m.suelo, 0.9, ROJO);
  rect(xCano - 1, m.arriba + alto * 0.08, xCano + 1, m.arriba + alto * 0.16, FINA_PT);
  rect(xCano - 1.2, m.arriba + alto * 0.85, xCano + 1.2, m.arriba + alto * 0.92, FINA_PT);

  // Cota de ancho, arriba.
  const yCotaAncho = m.arriba - 3;
  linea(m.x1, yCotaAncho, m.x2, yCotaAncho, FINA_PT);
  linea(m.x1, yCotaAncho - 1, m.x1, yCotaAncho + 1, FINA_PT);
  linea(m.x2, yCotaAncho - 1, m.x2, yCotaAncho + 1, FINA_PT);
  texto("0,40 Mts.", (m.x1 + m.x2) / 2 - anchoTexto("0,40 Mts.") / 2, yCotaAncho - 0.8);

  // Cotas de alto, a la izquierda.
  const xCota = m.x1 - 5;
  linea(xCota, m.arriba, xCota, m.suelo, FINA_PT);
  for (const y of [m.arriba, m.pisoGabinete, m.suelo]) {
    linea(xCota - 1, y, xCota + 1, y, FINA_PT);
  }
  // Como en los planos presentados: textos horizontales a la izquierda de la cota.
  const alTexto = (t: string) => xCota - 1.5 - anchoTexto(t);
  texto("0,50 Mts.", alTexto("0,50 Mts."), (m.arriba + m.pisoGabinete) / 2 + ALTO_COTA_MM / 2);
  texto("0,10 Mts.", alTexto("0,10 Mts."), (m.pisoGabinete + m.suelo) / 2 + ALTO_COTA_MM / 2);
}
