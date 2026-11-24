import { ROTULO_RECUADRO } from "@/lib/obra/rotuloFormato";

export const A3_MM = { ancho: 420, alto: 297 };

export type RecuadroId =
  | "planta"
  | "corte"
  | "isometrica"
  | "croquis"
  | "referencias"
  | "materiales"
  | "calculo"
  | "gabinete";

export type RecuadroLamina = {
  id: RecuadroId;
  titulo: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Parte superior del título, en mm. */
  tituloY: number;
};

export type OpcionesLamina = {
  /** Corte opcional abajo a la izquierda. Sin corte, la planta usa toda la altura. */
  conCorte?: boolean;
  /** Croquis opcional, apagado por defecto: va siempre en la Factibilidad. */
  conCroquis?: boolean;
};

// Zonas de docs/formato-lamina.md. El rótulo usa su medida exacta (284,8 / 217,7).
const { x1: COLUMNA, x2: DERECHA, y1: ROTULO_ARRIBA, y2: ABAJO } = ROTULO_RECUADRO;
const ARRIBA = 5;
const IZQUIERDA = 5;
const PLANTA_DERECHA = 230;
const CORTE_ARRIBA = 210;
const TABLAS_ABAJO = 120;
const ISOMETRICA_DERECHA = 355;
const GABINETE_ARRIBA = 150;
const CROQUIS_ABAJO = 50;
const MARGEN_TITULO = 2;
const GABINETE_TITULO_Y = 212;

export const MARCO_LAMINA = {
  x1: IZQUIERDA,
  y1: ARRIBA,
  x2: DERECHA,
  y2: ABAJO,
};

const recuadro = (
  id: RecuadroId,
  titulo: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tituloY = y1 + MARGEN_TITULO,
): RecuadroLamina => ({ id, titulo, x1, y1, x2, y2, tituloY });

export function armarPlanoInstalacion({
  conCorte = false,
  conCroquis = false,
}: OpcionesLamina = {}): RecuadroLamina[] {
  const tablasArriba = conCroquis ? CROQUIS_ABAJO : ARRIBA;
  const altoTabla = (TABLAS_ABAJO - tablasArriba) / 3;
  const corteTabla = (indice: number) => tablasArriba + altoTabla * indice;

  return [
    recuadro("planta", "PLANTA", IZQUIERDA, ARRIBA, PLANTA_DERECHA, conCorte ? CORTE_ARRIBA : ABAJO),
    ...(conCorte
      ? [recuadro("corte", "CORTE", IZQUIERDA, CORTE_ARRIBA, PLANTA_DERECHA, ABAJO)]
      : []),
    ...(conCroquis
      ? [recuadro("croquis", "CROQUIS DE UBICACIÓN", COLUMNA, ARRIBA, DERECHA, CROQUIS_ABAJO)]
      : []),
    recuadro("referencias", "REFERENCIAS", COLUMNA, corteTabla(0), DERECHA, corteTabla(1)),
    recuadro("materiales", "MATERIALES", COLUMNA, corteTabla(1), DERECHA, corteTabla(2)),
    recuadro("calculo", "CÁLCULO CAÑERÍA SIGAS", COLUMNA, corteTabla(2), DERECHA, TABLAS_ABAJO),
    recuadro("isometrica", "ISOMÉTRICA", PLANTA_DERECHA, TABLAS_ABAJO, ISOMETRICA_DERECHA, ROTULO_ARRIBA),
    recuadro("gabinete", "GABINETE 50*40*30", ISOMETRICA_DERECHA, GABINETE_ARRIBA, DERECHA, ROTULO_ARRIBA, GABINETE_TITULO_Y),
  ];
}
