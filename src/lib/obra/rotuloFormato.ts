import type { RotuloContenido } from "./obraData";

// Medidas de docs/formato-rotulo.md, en mm desde arriba a la izquierda de la hoja A3.
export const ROTULO_RECUADRO = { x1: 284.8, y1: 217.7, x2: 415, y2: 292 };
export const ROTULO_LINEA_PT = 0.72;
export const MM_POR_PT = 25.4 / 72;

const X_TEXTO = 294;
const X_ENTRE_CALLES = 307;
const X_MATRICULA = 371;
const X_CATEGORIA = 393;
const X_LIMITE = ROTULO_RECUADRO.x2 - 2;
const SEPARACION_COLUMNAS = 2;
const ALTO_TITULO = 5.2;
const ALTO_TEXTO = 3.9;
const ALTO_FIRMA = 2.6;
const Y_FIRMA_LINEA = 284.6;
const Y_FIRMA_TEXTO = 286;
// Distancia de la parte superior del texto a su línea base, en altos de letra.
const ASCENSO = 0.905;
const FIRMAS = [
  { x1: 293.8, x2: 326.3 },
  { x1: 362.2, x2: 394.8 },
];

export type MedirTexto = (texto: string, altoMm: number) => number;

export type TextoRotulo = {
  texto: string;
  xMm: number;
  baseMm: number;
  altoMm: number;
};

export type LineaRotulo = { x1: number; x2: number; y: number };

export type RotuloArmado = {
  textos: TextoRotulo[];
  lineasFirma: LineaRotulo[];
};

/** Ubica cada texto en mm. Un texto largo achica su letra para no salir de su lugar. */
export function armarRotulo(
  contenido: RotuloContenido,
  medir: MedirTexto,
): RotuloArmado {
  const texto = (
    valor: string,
    xMm: number,
    arribaMm: number,
    altoMm: number,
    limiteMm = X_LIMITE,
  ): TextoRotulo => {
    const ancho = medir(valor, altoMm);
    const disponible = limiteMm - xMm;

    return {
      texto: valor,
      xMm,
      baseMm: arribaMm + altoMm * ASCENSO,
      altoMm: ancho > disponible ? (altoMm * disponible) / ancho : altoMm,
    };
  };
  const firma = (valor: string, { x1, x2 }: { x1: number; x2: number }) => ({
    texto: valor,
    xMm: (x1 + x2 - medir(valor, ALTO_FIRMA)) / 2,
    baseMm: Y_FIRMA_TEXTO + ALTO_FIRMA * ASCENSO,
    altoMm: ALTO_FIRMA,
  });
  const limiteInstalador = contenido.matricula
    ? X_MATRICULA - SEPARACION_COLUMNAS
    : contenido.categoria
      ? X_CATEGORIA - SEPARACION_COLUMNAS
      : X_LIMITE;
  const limiteMatricula = contenido.categoria
    ? X_CATEGORIA - SEPARACION_COLUMNAS
    : X_LIMITE;

  return {
    textos: [
      texto(contenido.titulo, X_TEXTO, 221.9, ALTO_TITULO),
      texto(`Propietario: ${contenido.propietario}`, X_TEXTO, 231.7, ALTO_TEXTO),
      texto(`Calle: ${contenido.calleNumero}`, X_TEXTO, 238.2, ALTO_TEXTO),
      texto(contenido.entreCalles, X_ENTRE_CALLES, 244.9, ALTO_TEXTO),
      texto(`Localidad: ${contenido.localidad}`, X_TEXTO, 252, ALTO_TEXTO),
      texto(`Partido: ${contenido.partido}`, X_TEXTO, 258.8, ALTO_TEXTO),
      texto(
        `Instalador: ${contenido.instalador}`,
        X_TEXTO,
        265.6,
        ALTO_TEXTO,
        limiteInstalador,
      ),
      texto(contenido.matricula, X_MATRICULA, 265.6, ALTO_TEXTO, limiteMatricula),
      texto(contenido.categoria, X_CATEGORIA, 265.6, ALTO_TEXTO),
      firma(contenido.firmas[0], FIRMAS[0]),
      firma(contenido.firmas[1], FIRMAS[1]),
    ].filter((item) => item.texto !== ""),
    lineasFirma: FIRMAS.map((linea) => ({ ...linea, y: Y_FIRMA_LINEA })),
  };
}
