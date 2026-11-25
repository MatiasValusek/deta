import type { Point2D } from "@/lib/geometry/types";
import type { ResolvedRouteSegment } from "@/lib/routing/types";

/**
 * El nombre y el diámetro de cada tramo sobre el plano ("C-M Ø32"), en la mitad de su parte
 * más larga, con fondo blanco para que se lea sobre las paredes.
 */
export function EtiquetasDeTramos(props: {
  etiquetas: ReadonlyMap<string, string>;
  segments: ResolvedRouteSegment[];
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  return (
    <g data-etiquetas-de-tramos="true" pointerEvents="none">
      {props.segments.map((tramo) => {
        const texto = props.etiquetas.get(tramo.id);
        if (!texto || tramo.path.length < 2) return null;
        const pantalla = tramo.path.map(props.sourceToScreen);
        let mejor = { a: pantalla[0], b: pantalla[1], largo: -1 };
        for (let i = 1; i < pantalla.length; i += 1) {
          const largo = Math.hypot(pantalla[i].x - pantalla[i - 1].x, pantalla[i].y - pantalla[i - 1].y);
          if (largo > mejor.largo) mejor = { a: pantalla[i - 1], b: pantalla[i], largo };
        }
        if (mejor.largo < 24) return null;
        const vertical = Math.abs(mejor.b.y - mejor.a.y) > Math.abs(mejor.b.x - mejor.a.x);
        const x = (mejor.a.x + mejor.b.x) / 2 + (vertical ? 8 : 0);
        const y = (mejor.a.y + mejor.b.y) / 2 + (vertical ? 4 : -7);
        const ancho = texto.length * 6.4 + 8;

        return (
          <g key={tramo.id}>
            <rect
              fill="#ffffff"
              fillOpacity="0.9"
              height="15"
              rx="3"
              stroke="#b91c1c"
              strokeWidth="0.8"
              width={ancho}
              x={vertical ? x : x - ancho / 2}
              y={y - 11}
            />
            <text
              fill="#7f1d1d"
              fontSize="11"
              fontWeight="600"
              textAnchor={vertical ? "start" : "middle"}
              x={vertical ? x + 4 : x}
              y={y}
            >
              {texto}
            </text>
          </g>
        );
      })}
    </g>
  );
}
