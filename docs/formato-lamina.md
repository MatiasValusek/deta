# Formato de la lámina A3 "Plano de instalación"

Medido y observado en los dos planos reales presentados de `cata/`.

## Lo que es fijo en los dos planos
- Hoja A3 apaisada 420 × 297 mm.
- **Marco**: rectángulo a 5 mm de cada borde (x 5 → 415, y 5 → 292).
- **Rótulo**: x 285 → 415, y 218 → 292. **Comparte el borde derecho e inferior con el marco**
  (está pegado a la esquina, no flotando adentro). Ver `formato-rotulo.md`.
- **Gabinete 50×40×30**: siempre en la columna derecha, encima del rótulo.
- **La planta es el elemento más grande**, a la izquierda, ocupando casi toda la altura.
- La traza va en **rojo** sobre la planta, la isométrica y el corte.

## Lo que cambia según el trabajo
El gasista acomoda los bloques según el espacio que deja la planta:
- Plano con varios artefactos: tablas (Referencias, Materiales, Cálculo SIGAS) **arriba a la derecha**;
  isométrica en el centro-derecha; gabinete sobre el rótulo; corte en la franja inferior izquierda;
  **sin croquis** (el croquis está en la Factibilidad).
- Plano con un solo artefacto y terreno largo: **croquis arriba a la derecha** (x 315 → 399, y 24 → 94);
  isométrica y corte en el centro; gabinete a la derecha; tablas **abajo al centro**, a la izquierda del rótulo.

## Armado por defecto propuesto para Deta
Zonas fijas (mm), la app escala cada dibujo para que entre en su zona:

| Zona | x | y | Notas |
|---|---|---|---|
| Planta | 5 → 230 | 5 → 210 | La más grande. |
| Corte / vista (opcional) | 5 → 230 | 210 → 292 | Si no hay corte, la planta usa toda la altura. |
| Isométrica | 230 → 355 | 120 → 218 | Centro-derecha, al lado del gabinete. |
| Tablas: Referencias, Materiales, Cálculo SIGAS | 285 → 415 | 5 → 120 | Apiladas en ese orden, de arriba hacia abajo. |
| Gabinete 50×40×30 | 355 → 415 | 150 → 218 | Encima del rótulo. |
| Rótulo | 285 → 415 | 218 → 292 | Fijo. |
| Croquis de ubicación | — | — | **Opcional en esta lámina, apagado por defecto** (va siempre en la Factibilidad). Si se activa, reemplaza la parte superior de la columna derecha y las tablas bajan. |

Estas zonas son un punto de partida: la referencia es el plano real con varios artefactos.
