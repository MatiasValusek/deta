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
import { dibujarSimboloLlave, LARGO_LLAVE_MM } from "./simboloLlave";
import type { ZonaPlanta } from "./plantaPdf";
import {
  cuadrado,
  elegirLugar,
  linea,
  lugaresAlrededor,
  Ocupado,
  rectangulo,
  type Direccion,
  type Figura,
} from "./ubicarTextos";

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
/** Aire mínimo entre un texto y el dibujo (caño, llave, medidor). */
const HOLGURA_TEXTO_MM = 0.4;
/** Alto de las mayúsculas y números respecto del tamaño de la letra. */
const ALTO_LETRA = 0.75;
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

/**
 * Medidor y artefactos que tienen la llave de paso al lado, según las piezas de la vista
 * (las mismas que se cuentan en Materiales). Solo ahí van el símbolo y el "LL.P".
 */
export function nodosConLlaveEnVista(vista: TechnicalAxonometricView): Set<string> {
  const tipoDeNodo = new Map(vista.nodes.map((nodo) => [nodo.id, nodo.kind]));
  const extremo = (nodeId: string | null | undefined) =>
    nodeId && (tipoDeNodo.get(nodeId) === "supply" || tipoDeNodo.get(nodeId) === "appliance");
  const nodos = new Set<string>();

  for (const pieza of vista.accessories) {
    if (pieza.kind !== "valve") continue;
    if (extremo(pieza.nodeId)) {
      nodos.add(pieza.nodeId as string);
      continue;
    }
    for (const tramo of vista.segments.filter((item) => pieza.segmentIds.includes(item.id))) {
      for (const nodeId of [tramo.fromNodeId, tramo.toNodeId]) {
        if (extremo(nodeId)) nodos.add(nodeId);
      }
    }
  }

  return nodos;
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

  // Lo ya dibujado, para que ningún texto pise un caño, una llave o el medidor.
  const ocupado = new Ocupado();
  const holgura = mmAPt(HOLGURA_TEXTO_MM);
  const ocuparLinea = (desde: Punto, hasta: Punto) =>
    ocupado.agregar(linea(desde, hasta, LINEA_TRAZA_PT + holgura * 2));

  for (const tramo of recorridos) {
    for (let i = 1; i < tramo.puntos.length; i += 1) {
      const desde = aPdf(tramo.puntos[i - 1]);
      const hasta = aPdf(tramo.puntos[i]);
      page.drawLine({ start: desde, end: hasta, thickness: LINEA_TRAZA_PT, color: ROJO });
      ocuparLinea(desde, hasta);
    }
  }

  const conLlave = nodosConLlaveEnVista(datos.vista);
  const ladoLlave = mmAPt(LARGO_LLAVE_MM) + holgura * 2;
  // Sentido del caño que llega a cada nodo, para orientar el símbolo de la llave.
  const salidaDe = (nodeId: string) => {
    for (const tramo of datos.vista.segments) {
      const puntos = recorridos.find((item) => item.id === tramo.id)?.puntos;
      if (!puntos || puntos.length < 2) continue;
      if (tramo.fromNodeId === nodeId) return { desde: aPdf(puntos[0]), hacia: aPdf(puntos[1]) };
      if (tramo.toNodeId === nodeId) {
        return { desde: aPdf(puntos[puntos.length - 1]), hacia: aPdf(puntos[puntos.length - 2]) };
      }
    }
    return null;
  };
  const llaveEn = (centro: Punto, direccion: Punto) => {
    dibujarSimboloLlave(page, centro, direccion);
    ocupado.agregar(cuadrado(centro, ladoLlave));
  };
  const llaveSobreCano = (nodeId: string) => {
    const salida = salidaDe(nodeId);
    if (!salida) return null;
    const dx = salida.hacia.x - salida.desde.x;
    const dy = salida.hacia.y - salida.desde.y;
    const largo = Math.hypot(dx, dy) || 1;
    const distancia = Math.min(mmAPt(LARGO_LLAVE_MM * 1.5), largo / 2);
    const centro = { x: salida.desde.x + (dx / largo) * distancia, y: salida.desde.y + (dy / largo) * distancia };
    llaveEn(centro, { x: dx, y: dy });
    return centro;
  };

  // Primero todo lo dibujado; después los textos, que buscan lugar libre.
  type TextoNodo = {
    altoMm: number;
    centro: Punto;
    direcciones: Direccion[];
    separacion: number;
    texto: string;
  };
  const textos: TextoNodo[] = [];
  const textosLlave: TextoNodo[] = [];

  for (const nodo of nodos) {
    const base = aPdf(nodo.punto);
    let centro = base;

    // Subida vertical del artefacto: la llave y el número van arriba.
    if (nodo.kind === "appliance" && conSubidas) {
      centro = { x: base.x, y: base.y + mmAPt(SUBIDA_MM) };
      page.drawLine({ start: base, end: centro, thickness: LINEA_TRAZA_PT, color: ROJO });
      ocuparLinea(base, centro);
    }

    const etiqueta = datos.numeracion.nodos.get(nodo.id);

    if (nodo.kind === "supply") {
      dibujarMedidor(page, fuente, centro);
      const lado = mmAPt(LADO_MEDIDOR_MM);
      ocupado.agregar(rectangulo({ x: centro.x - lado, y: centro.y - lado / 2 }, lado, lado));
      // Llave general a la salida del medidor; el "LL.P" al costado, sin pisar caño ni llave.
      const llave = conLlave.has(nodo.id) ? llaveSobreCano(nodo.id) : null;
      if (llave) {
        textosLlave.push({
          altoMm: ALTO_LLAVE_MM,
          centro: llave,
          direcciones: ["N", "NE", "NO", "S", "SE", "SO", "E", "O"],
          separacion: ladoLlave / 2,
          texto: "LL.P",
        });
      }
      continue;
    }
    if (nodo.kind === "derivation") {
      page.drawCircle({ x: centro.x, y: centro.y, size: mmAPt(RADIO_DERIVACION_MM), color: ROJO });
      ocupado.agregar(cuadrado(centro, mmAPt(RADIO_DERIVACION_MM * 2)));
    }
    if (etiqueta) {
      textos.push({
        altoMm: ALTO_ETIQUETA_MM,
        centro,
        direcciones:
          nodo.kind === "appliance"
            ? ["NE", "E", "N", "SE", "NO", "O"]
            : ["NE", "NO", "SE", "SO", "N", "S", "E", "O"],
        separacion: mmAPt(1),
        texto: etiqueta,
      });
    }
    if (nodo.kind === "appliance" && conLlave.has(nodo.id)) {
      // Llave antes del artefacto: sobre la subida, o sobre el caño si no hay subida dibujada.
      if (conSubidas) {
        llaveEn({ x: base.x, y: (base.y + centro.y) / 2 }, { x: 0, y: 1 });
      } else {
        llaveSobreCano(nodo.id);
      }
      textosLlave.push({
        altoMm: ALTO_LLAVE_MM,
        centro,
        direcciones: ["NO", "O", "N", "SO", "NE"],
        separacion: mmAPt(1),
        texto: "LL.P",
      });
    }
  }

  for (const item of [...textos, ...textosLlave]) {
    const tamano = mmAPt(item.altoMm);
    const lugar = elegirLugar(
      ocupado,
      lugaresAlrededor({
        alto: tamano * ALTO_LETRA,
        ancho: fuente.widthOfTextAtSize(item.texto, tamano),
        centro: item.centro,
        direcciones: item.direcciones,
        separacion: item.separacion,
      }),
    );
    if (lugar) escribir(page, fuente, item.texto, lugar.origen.x, lugar.origen.y, item.altoMm);
  }

  // Diámetros, al final: buscan lugar a lo largo de su tramo. Si no entran sin pisar nada y
  // un tramo vecino ya tiene la misma medida escrita, se omiten (tramos muy cortos).
  const tamanoDiametro = mmAPt(ALTO_DIAMETRO_MM);
  const escritos = new Map<string, string>();
  const enHoja = new Map(recorridos.map((tramo) => [tramo.id, tramo.puntos.map(aPdf)]));
  const porLargo = [...recorridos].sort(
    (a, b) => largoEnHoja(enHoja.get(b.id) ?? []) - largoEnHoja(enHoja.get(a.id) ?? []),
  );
  const escribirDiametro = (tramoId: string, aunqueNoEntre: boolean) => {
    const diametro = datos.diametros.get(tramoId);
    if (!diametro) return true;
    const texto = `${diametro} mm`;
    const lugar = elegirLugar(
      ocupado,
      lugaresSobreTramo({
        alto: tamanoDiametro * ALTO_LETRA,
        ancho: fuente.widthOfTextAtSize(texto, tamanoDiametro),
        aunqueNoEntre,
        puntos: enHoja.get(tramoId) ?? [],
        separacion: mmAPt(0.8),
      }),
      { soloLibre: !aunqueNoEntre },
    );
    if (!lugar) return false;
    escribirGirado(page, fuente, texto, lugar.origen, lugar.angulo, tamanoDiametro);
    escritos.set(tramoId, diametro);
    return true;
  };
  // En una esquina (dos tramos, sin derivación) con la misma medida es el mismo caño que
  // dobla: la medida va una vez, en el tramo más largo.
  const tramosDelNodo = new Map<string, string[]>();
  for (const tramo of datos.vista.segments) {
    for (const nodeId of [tramo.fromNodeId, tramo.toNodeId]) {
      tramosDelNodo.set(nodeId, [...(tramosDelNodo.get(nodeId) ?? []), tramo.id]);
    }
  }
  const largoDe = (tramoId: string) => largoEnHoja(enHoja.get(tramoId) ?? []);
  const repetidos = new Set<string>();
  for (const nodo of nodos) {
    const ids = tramosDelNodo.get(nodo.id) ?? [];
    if (nodo.kind === "supply" || nodo.kind === "appliance" || ids.length !== 2) continue;
    const [a, b] = ids;
    if (datos.diametros.get(a) && datos.diametros.get(a) === datos.diametros.get(b)) {
      repetidos.add(largoDe(a) < largoDe(b) ? a : b);
    }
  }
  const sinLugar = porLargo.filter(
    (tramo) => !repetidos.has(tramo.id) && !escribirDiametro(tramo.id, false),
  );

  for (const tramo of sinLugar) {
    const info = datos.vista.segments.find((item) => item.id === tramo.id);
    const extremos = info ? [info.fromNodeId, info.toNodeId] : [];
    const vecinoIgual = datos.vista.segments.some(
      (otro) =>
        otro.id !== tramo.id &&
        escritos.get(otro.id) === datos.diametros.get(tramo.id) &&
        (extremos.includes(otro.fromNodeId) || extremos.includes(otro.toNodeId)),
    );
    if (!vecinoIgual) escribirDiametro(tramo.id, true);
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

function largoEnHoja(puntos: Punto[]) {
  let largo = 0;
  for (let i = 1; i < puntos.length; i += 1) {
    largo += Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].y - puntos[i - 1].y);
  }
  return largo;
}

/**
 * Lugares para el diámetro a lo largo del tramo, siempre legible (nunca cabeza abajo): en
 * cada pierna, de la más larga a la más corta, al medio y corrido hacia las puntas, arriba
 * y abajo de la línea.
 */
function lugaresSobreTramo(params: {
  alto: number;
  ancho: number;
  aunqueNoEntre?: boolean;
  puntos: Punto[];
  separacion: number;
}) {
  const piernas = params.puntos
    .slice(1)
    .map((hasta, i) => {
      const desde = params.puntos[i];
      return { desde, hasta, largo: Math.hypot(hasta.x - desde.x, hasta.y - desde.y) };
    })
    .filter((pierna) => params.aunqueNoEntre || pierna.largo >= params.ancho)
    .sort((a, b) => b.largo - a.largo);
  const lugares: Array<{ angulo: number; figura: Figura; origen: Punto }> = [];

  for (const pierna of piernas) {
    let angulo = Math.atan2(pierna.hasta.y - pierna.desde.y, pierna.hasta.x - pierna.desde.x);
    if (angulo > Math.PI / 2 + 1e-6) angulo -= Math.PI;
    if (angulo < -Math.PI / 2 + 1e-6) angulo += Math.PI;
    const u = { x: Math.cos(angulo), y: Math.sin(angulo) };
    const n = { x: -u.y, y: u.x };

    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const punto = {
        x: pierna.desde.x + (pierna.hasta.x - pierna.desde.x) * t,
        y: pierna.desde.y + (pierna.hasta.y - pierna.desde.y) * t,
      };
      for (const corrimiento of [params.separacion, -params.separacion - params.alto]) {
        const origen = {
          x: punto.x - u.x * (params.ancho / 2) + n.x * corrimiento,
          y: punto.y - u.y * (params.ancho / 2) + n.y * corrimiento,
        };
        lugares.push({ angulo, figura: rectangulo(origen, params.ancho, params.alto, angulo), origen });
      }
    }
  }

  return lugares;
}

function escribirGirado(
  page: PDFPage,
  fuente: PDFFont,
  texto: string,
  origen: Punto,
  angulo: number,
  tamano: number,
) {
  page.drawText(texto, {
    x: origen.x,
    y: origen.y,
    size: tamano,
    font: fuente,
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
