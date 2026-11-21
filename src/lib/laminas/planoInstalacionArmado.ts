import { ROTULO_RECUADRO } from "@/lib/obra/rotuloFormato";

export const A3_MM = { ancho: 420, alto: 297 };

export type RecuadroId =
  | "planta"
  | "isometrica"
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

const { x1: COLUMNA, x2: DERECHA, y1: ROTULO_ARRIBA, y2: ABAJO } = ROTULO_RECUADRO;
const ARRIBA = 5;
const IZQUIERDA = 5;
const CORTE_PLANTA = 190;
const CORTE_REFERENCIAS = 50;
const CORTE_MATERIALES = 105;
const CORTE_CALCULO = 168;
const MARGEN_TITULO = 2;

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

export const RECUADROS_PLANO_INSTALACION: RecuadroLamina[] = [
  recuadro("planta", "PLANTA", IZQUIERDA, ARRIBA, COLUMNA, CORTE_PLANTA),
  recuadro("isometrica", "ISOMÉTRICA", IZQUIERDA, CORTE_PLANTA, COLUMNA, ABAJO),
  recuadro("referencias", "REFERENCIAS", COLUMNA, ARRIBA, DERECHA, CORTE_REFERENCIAS),
  recuadro("materiales", "MATERIALES", COLUMNA, CORTE_REFERENCIAS, DERECHA, CORTE_MATERIALES),
  recuadro("calculo", "CÁLCULO CAÑERÍA SIGAS", COLUMNA, CORTE_MATERIALES, DERECHA, CORTE_CALCULO),
  // El título del gabinete va abajo, a la altura medida en los planos reales.
  recuadro("gabinete", "GABINETE 50*40*30", COLUMNA, CORTE_CALCULO, DERECHA, ROTULO_ARRIBA, 212),
];
