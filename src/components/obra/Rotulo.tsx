import type { RotuloContenido } from "@/lib/obra/obraData";
import {
  MM_POR_PT,
  ROTULO_LINEA_PT,
  ROTULO_RECUADRO,
  armarRotulo,
} from "@/lib/obra/rotuloFormato";

const FUENTE = '"Arial Black", Arial, sans-serif';
const PESO = 900;
const GROSOR_MM = ROTULO_LINEA_PT * MM_POR_PT;

let lienzo: CanvasRenderingContext2D | null = null;

function medirTexto(texto: string, altoMm: number) {
  if (typeof document === "undefined") {
    return texto.length * altoMm * 0.7;
  }

  lienzo ??= document.createElement("canvas").getContext("2d");

  if (!lienzo) {
    return texto.length * altoMm * 0.7;
  }

  lienzo.font = `${PESO} 100px ${FUENTE}`;
  return (lienzo.measureText(texto).width / 100) * altoMm;
}

export function Rotulo({ contenido }: { contenido: RotuloContenido }) {
  const { x1, x2, y1, y2 } = ROTULO_RECUADRO;
  const { textos, lineasFirma } = armarRotulo(contenido, medirTexto);

  return (
    <svg
      aria-label="Rótulo"
      className="block h-auto w-full max-w-[420px] bg-white"
      role="img"
      viewBox={`${x1} ${y1} ${x2 - x1} ${y2 - y1}`}
    >
      <rect
        fill="white"
        height={y2 - y1}
        stroke="black"
        strokeWidth={GROSOR_MM * 2}
        width={x2 - x1}
        x={x1}
        y={y1}
      />
      {lineasFirma.map((linea) => (
        <line
          key={linea.x1}
          stroke="black"
          strokeWidth={GROSOR_MM}
          x1={linea.x1}
          x2={linea.x2}
          y1={linea.y}
          y2={linea.y}
        />
      ))}
      {textos.map((item) => (
        <text
          fill="black"
          fontFamily={FUENTE}
          fontSize={item.altoMm}
          fontWeight={PESO}
          key={`${item.xMm}-${item.baseMm}`}
          x={item.xMm}
          xmlSpace="preserve"
          y={item.baseMm}
        >
          {item.texto}
        </text>
      ))}
    </svg>
  );
}
