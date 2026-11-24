import { degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type {
  TechnicalAxonometricProjectedPoint,
  TechnicalAxonometricView,
} from "@/lib/calculation/technicalAxonometric";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import { MM_POR_PT } from "@/lib/obra/rotuloFormato";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import type { NumeracionPlano } from "./numeracionPlano";
import type { ZonaPlanta } from "./plantaPdf";

export type DatosIsometrica = {
  vista: TechnicalAxonometricView;
  numeracion: NumeracionPlano;
  /** Diámetro adoptado por tramo, en mm, como en la tabla de cálculo ("25"). */
  diametros: Map<string, string>;
  /**
   * Si el gasista cargó alturas a mano, se dibujan. Si no, la traza va toda a un mismo
   * nivel con una subida vertical en cada artefacto, como en los planos presentados.
   */
  alturasCargadas?: boolean;
};

type Punto = TechnicalAxonometricProjectedPoint;

const NEGRO = rgb(0, 0, 0);
const BLANCO = rgb(1, 1, 1);
const ROJO = rgb(0.9, 0, 0);
const LINEA_TRAZA_PT = 1;
const MARGEN_MM = 7;
const MARGEN_TITULO_MM = 7;
const ALTO_ETIQUETA_MM = 2.5;
const ALTO_DIAMETRO_MM = 1.8;
const ALTO_LLAVE_MM = 1.6;
const LADO_MEDIDOR_MM = 3.2;
const RADIO_DERIVACION_MM = 0.5;
/** Largo en la hoja de la subida vertical a cada artefacto. */
const SUBIDA_MM = 8;
const COS30 = Math.cos(Math.PI / 6);
const mmAPt = (mm: number) => mm / MM_POR_PT;

/** Diámetro adoptado por tramo, leído de la tabla "Cálculo cañería SIGAS". */
export function diametrosPorTramo(
  numeracion: NumeracionPlano,
  filasCalculo: string[][],
): Map<string, string> {
  const porNombre = new Map(
    filasCalculo.map((fila) => [fila[0], fila[fila.length - 1]]),
  );
  const diametros = new Map<string, string>();

  for (const [segmentId, nombre] of numeracion.tramos) {
    const diametro = porNombre.get(nombre);

    if (diametro && diametro !== "—") {
      diametros.set(segmentId, diametro);
    }
  }

  return diametros;
}

/** Hay alturas cargadas a mano (no las sugeridas por la app) en la cañería o en los artefactos. */
export function hayAlturasCargadas(network: ManualRouteNetwork, equipment: WorkbenchEquipment[]) {
  const aMano = (fuente?: string) => fuente === "professional_edit";

  return (
    network.nodes.some((nodo) => aMano(nodo.elevation?.source)) ||
    network.segments.some((tramo) =>
      (tramo.vertexElevations ?? []).some((altura) => aMano(altura?.source)),
    ) ||
    equipment.some((item) => aMano(item.terminalConfig?.heightSource))
  );
}

/**
 * Proyección isométrica de la lámina, con la Y de la hoja hacia abajo.
 * Norte de la planta (Y+) va arriba a la derecha y Este (X+) abajo a la derecha:
 * mismo sentido de giro que la planta, así la isométrica no sale espejada.
 */
export function proyectarIsometrica(xMetros: number, yMetros: number, zMetros = 0): Punto {
  return {
    x: (xMetros + yMetros) * COS30,
    y: (xMetros - yMetros) * 0.5 - zMetros,
  };
}

type TramoIsometrica = { id: string; puntos: Punto[] };
type NodoIsometrica = {
  id: string;
  kind: TechnicalAxonometricView["nodes"][number]["kind"];
  punto: Punto;
};

/** Metros por unidad del plano, leídos de los nodos de la vista. */
function metrosPorUnidad(vista: TechnicalAxonometricView) {
  const conEscala = vista.nodes.find(
    (nodo) => nodo.point && Math.abs(nodo.point.source.x) > 1e-9,
  );
  return conEscala?.point ? conEscala.point.xMeters / conEscala.point.source.x : 1;
}

/** Tramos y nodos ya proyectados. Sin alturas cargadas, todo queda a nivel 0. */
export function geometriaIsometrica(
  vista: TechnicalAxonometricView,
  alturasCargadas = false,
): { tramos: TramoIsometrica[]; nodos: NodoIsometrica[] } {
  const escala = metrosPorUnidad(vista);
  const proyectar = (p: Point2D, z: number) =>
    proyectarIsometrica(p.x * escala, p.y * escala, alturasCargadas ? z : 0);
  const extremos = new Map<string, Punto>();
  const tramos = vista.segments
    .map((tramo) => {
      const puntos = sinRepetidos(
        tramo.path.map((punto) => proyectar(punto.planPoint, punto.elevationMeters)),
      );

      if (puntos.length >= 1) {
        extremos.set(tramo.fromNodeId, extremos.get(tramo.fromNodeId) ?? puntos[0]);
        extremos.set(tramo.toNodeId, extremos.get(tramo.toNodeId) ?? puntos[puntos.length - 1]);
      }

      return { id: tramo.id, puntos };
    })
    .filter((tramo) => tramo.puntos.length >= 2);
  const nodos = vista.nodes.flatMap((nodo) => {
    const punto = nodo.point
      ? proyectar(nodo.point.source, nodo.point.zMeters ?? 0)
      : extremos.get(nodo.id);
    return punto ? [{ id: nodo.id, kind: nodo.kind, punto }] : [];
  });

  return { tramos, nodos };
}

/** Recorridos de cada tramo en la isométrica de la lámina (sin puntos repetidos). */
export function recorridosIsometrica(vista: TechnicalAxonometricView, alturasCargadas = false) {
  return geometriaIsometrica(vista, alturasCargadas).tramos;
}

export function dibujarIsometricaPdf(params: {
  datos: DatosIsometrica;
  fuente: PDFFont;
  page: PDFPage;
  zona: ZonaPlanta;
}) {
  const { datos, fuente, page } = params;
  const zona = { ...params.zona, y1: params.zona.y1 + MARGEN_TITULO_MM };
  const conSubidas = !datos.alturasCargadas;
  const { tramos: recorridos, nodos } = geometriaIsometrica(datos.vista, datos.alturasCargadas);
  const puntos = [...recorridos.flatMap((tramo) => tramo.puntos), ...nodos.map((nodo) => nodo.punto)];

  if (recorridos.length === 0 || puntos.length === 0) {
    return false;
  }

  const minX = Math.min(...puntos.map((p) => p.x));
  const maxX = Math.max(...puntos.map((p) => p.x));
  const minY = Math.min(...puntos.map((p) => p.y));
  const maxY = Math.max(...puntos.map((p) => p.y));
  const anchoUtil = zona.x2 - zona.x1 - MARGEN_MM * 2;
  // Lugar arriba para las subidas a los artefactos.
  const reservaSubida = conSubidas ? SUBIDA_MM : 0;
  const altoUtil = zona.y2 - zona.y1 - MARGEN_MM * 2 - reservaSubida;
  const escala = Math.min(
    anchoUtil / Math.max(maxX - minX, 1e-9),
    altoUtil / Math.max(maxY - minY, 1e-9),
  );
  const offsetX = zona.x1 + MARGEN_MM + (anchoUtil - (maxX - minX) * escala) / 2;
  const offsetY =
    zona.y1 + MARGEN_MM + reservaSubida + (altoUtil - (maxY - minY) * escala) / 2;
  // La proyección de la lámina ya viene con Y hacia abajo, igual que la hoja.
  const aPdf = (p: Punto) => ({
    x: mmAPt(offsetX + (p.x - minX) * escala),
    y: page.getHeight() - mmAPt(offsetY + (p.y - minY) * escala),
  });

  for (const tramo of recorridos) {
    for (let i = 1; i < tramo.puntos.length; i += 1) {
      page.drawLine({
        start: aPdf(tramo.puntos[i - 1]),
        end: aPdf(tramo.puntos[i]),
        thickness: LINEA_TRAZA_PT,
        color: ROJO,
      });
    }

    const diametro = datos.diametros.get(tramo.id);

    if (diametro) {
      escribirSobreTramo({
        fuente,
        page,
        puntos: tramo.puntos.map(aPdf),
        texto: `${diametro} mm`,
      });
    }
  }

  for (const nodo of nodos) {
    const base = aPdf(nodo.punto);
    let centro = base;

    // Subida vertical del artefacto: la llave y el número van arriba.
    if (nodo.kind === "appliance" && conSubidas) {
      centro = { x: base.x, y: base.y + mmAPt(SUBIDA_MM) };
      page.drawLine({ start: base, end: centro, thickness: LINEA_TRAZA_PT, color: ROJO });
    }

    const etiqueta = datos.numeracion.nodos.get(nodo.id);

    if (nodo.kind === "supply") {
      dibujarMedidor(page, fuente, centro);
      continue;
    }
    if (nodo.kind === "derivation") {
      page.drawCircle({ x: centro.x, y: centro.y, size: mmAPt(RADIO_DERIVACION_MM), color: ROJO });
    }
    if (etiqueta) {
      escribir(page, fuente, etiqueta, centro.x + mmAPt(1), centro.y + mmAPt(1), ALTO_ETIQUETA_MM);
    }
    if (nodo.kind === "appliance") {
      const ancho = fuente.widthOfTextAtSize("LL.P", mmAPt(ALTO_LLAVE_MM));
      escribir(page, fuente, "LL.P", centro.x - ancho - mmAPt(1), centro.y + mmAPt(1), ALTO_LLAVE_MM);
    }
  }

  return true;
}

function dibujarMedidor(page: PDFPage, fuente: PDFFont, centro: { x: number; y: number }) {
  const lado = mmAPt(LADO_MEDIDOR_MM);
  const tamano = mmAPt(ALTO_ETIQUETA_MM);
  const ancho = fuente.widthOfTextAtSize("M", tamano);

  page.drawRectangle({
    x: centro.x - lado,
    y: centro.y - lado / 2,
    width: lado,
    height: lado,
    color: BLANCO,
    borderColor: NEGRO,
    borderWidth: 0.5,
  });
  page.drawText("M", {
    x: centro.x - lado / 2 - ancho / 2,
    y: centro.y - tamano * 0.36,
    size: tamano,
    font: fuente,
    color: NEGRO,
  });
}

/** Escribe el diámetro a lo largo de la pierna más larga del tramo, siempre legible. */
function escribirSobreTramo(params: {
  fuente: PDFFont;
  page: PDFPage;
  puntos: Array<{ x: number; y: number }>;
  texto: string;
}) {
  let mejor = { desde: params.puntos[0], hasta: params.puntos[1], largo: -1 };

  for (let i = 1; i < params.puntos.length; i += 1) {
    const desde = params.puntos[i - 1];
    const hasta = params.puntos[i];
    const largo = Math.hypot(hasta.x - desde.x, hasta.y - desde.y);

    if (largo > mejor.largo) {
      mejor = { desde, hasta, largo };
    }
  }

  let angulo = Math.atan2(mejor.hasta.y - mejor.desde.y, mejor.hasta.x - mejor.desde.x);

  if (angulo > Math.PI / 2 + 1e-6) angulo -= Math.PI;
  if (angulo < -Math.PI / 2 + 1e-6) angulo += Math.PI;

  const tamano = mmAPt(ALTO_DIAMETRO_MM);
  const ancho = params.fuente.widthOfTextAtSize(params.texto, tamano);

  if (ancho > mejor.largo) {
    return;
  }

  const medio = {
    x: (mejor.desde.x + mejor.hasta.x) / 2,
    y: (mejor.desde.y + mejor.hasta.y) / 2,
  };
  const separacion = mmAPt(0.8);
  // Texto apenas arriba de la línea: corrimiento perpendicular.
  const x = medio.x - Math.cos(angulo) * (ancho / 2) - Math.sin(angulo) * separacion;
  const y = medio.y - Math.sin(angulo) * (ancho / 2) + Math.cos(angulo) * separacion;

  params.page.drawText(params.texto, {
    x,
    y,
    size: tamano,
    font: params.fuente,
    color: NEGRO,
    rotate: degrees((angulo * 180) / Math.PI),
  });
}

function escribir(page: PDFPage, fuente: PDFFont, texto: string, x: number, y: number, altoMm: number) {
  const tamano = mmAPt(altoMm);
  const ancho = fuente.widthOfTextAtSize(texto, tamano);

  page.drawRectangle({ x: x - 0.5, y: y - 0.5, width: ancho + 1, height: tamano * 0.8 + 1, color: BLANCO });
  page.drawText(texto, { x, y, size: tamano, font: fuente, color: NEGRO });
}

function sinRepetidos(puntos: Punto[]) {
  return puntos.filter(
    (punto, indice) =>
      indice === 0 ||
      Math.hypot(punto.x - puntos[indice - 1].x, punto.y - puntos[indice - 1].y) > 1e-6,
  );
}
