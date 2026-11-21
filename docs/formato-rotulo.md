# Formato del rótulo (medido de planos reales presentados)

Medidas tomadas de los PDF vectoriales de `cata/` (Plano Parcial y Factibilidad).
Las dos láminas usan **exactamente el mismo rótulo, en la misma posición**.

## Hoja
- A3 apaisada: 420 × 297 mm.

## Recuadro
- **Un solo rectángulo, sin divisiones internas.**
- Posición: x 284,8 → 415,0 mm; y 217,7 → 292,0 mm (desde arriba a la izquierda).
- Tamaño: **130 × 74 mm**, en la esquina inferior derecha.
- Línea: 0,72 pt.

## Texto
- Tipografía: **Arial Black** en todo el rótulo (fallback: Arial Bold).
- Margen izquierdo del texto: 9 mm desde el borde del recuadro (x ≈ 294 mm).
- Alineado a la izquierda. Sin tablas ni líneas entre renglones.

| Renglón | y (mm, parte superior del texto) | Alto de letra | Contenido |
|---|---|---|---|
| Título | 221,9 | 5,2 mm (~15 pt) | INSTALACION PARA GAS NATURAL |
| 1 | 231,7 | 3,9 mm (~11 pt) | Propietario: {nombre} |
| 2 | 238,2 | 3,9 mm | Calle: {calle} N°{número} |
| 3 | 244,9 | 3,9 mm | entre {CALLE 1} y {CALLE 2} — **con sangría**, empieza en x ≈ 307 mm (alineado con el valor de "Calle:") |
| 4 | 252,0 | 3,9 mm | Localidad: {LOCALIDAD} |
| 5 | 258,8 | 3,9 mm | Partido: {PARTIDO} |
| 6 | 265,6 | 3,9 mm | Instalador: {NOMBRE}   …   {matrícula} (x ≈ 371 mm)   Cat. {1°} (x ≈ 393 mm) |

- Separación entre renglones: ~6,8 mm.
- La matrícula va **sin etiqueta**, solo el número, alineada a la derecha del nombre.
- En los planos reales calles, localidad, partido e instalador van en MAYÚSCULAS; el propietario
  se escribe como lo cargó el usuario.

## Firmas
- Dos líneas de 32,5 mm a y = 284,6 mm:
  - Propietario: x 293,8 → 326,3 mm
  - Instalador: x 362,2 → 394,8 mm
- Debajo, a y ≈ 286 mm, las palabras "Propietario" e "Instalador" centradas bajo cada línea,
  Arial Black 2,6 mm (~7 pt).

## Lo que NO hay en el rótulo real
- Logo, fecha, número de plano, escala, recuadros por campo. No agregarlos por ahora.

## Contexto en la lámina A3 del plano
- Encima del rótulo, en la misma columna derecha: detalle "GABINETE 50*40*30" (texto 3,5 mm a y ≈ 212 mm).
- Arriba a la derecha: tablas Referencias, Materiales y Cálculo cañería SIGAS.
- En la Factibilidad: arriba a la derecha va el CROQUIS DE UBICACION.
