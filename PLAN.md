# Plan de reacomodo de Deta

Objetivo: que un gasista haga de punta a punta un trabajo real y descargue las 3 hojas
que presenta (ver `CLAUDE.md`), en 5 pasos simples.

Marcar con [x] lo terminado. Hacer una fase a la vez y mostrar el resultado antes de seguir.

---

## Fase 0 — Auditoría técnica (antes de tocar nada)
- [x] Listar qué módulos de `src/lib` usa realmente el flujo actual y cuáles quedaron sin uso.
- [x] Ubicar en `DxfWorkbench.tsx` dónde empieza y termina cada paso (Planta, Artefactos,
      Recorrido, Revisar, Calcular, Entregar) para poder sacarlos a archivos propios.
- [x] Confirmar que `npm run typecheck` pasa hoy. Anotar errores existentes.
- [x] Entregar un resumen corto (en este archivo, sección "Notas") — sin cambiar código.

## Fase 1 — La salida: las 3 hojas
Lo más valioso. Usa lo que el motor ya calcula.
- [x] **Datos de la obra:** modelo + formulario (propietario, calle y número, entre calles,
      localidad, partido). **Datos del instalador** (nombre, matrícula, categoría)
      guardados aparte y reutilizados en cada obra.
- [x] **Rótulo** reutilizable para las láminas A3. (Contenido y vista en pantalla; el dibujo
      en PDF se hace con la lámina A3, usando el mismo `crearRotulo`.)
- [ ] **Lámina "Plano de instalación" A3** con el mismo armado que los planos reales de
      `cata/`: planta + traza roja + tramos numerados, isométrica, croquis de ubicación,
      gabinete 50×40×30, tablas Referencias / Materiales / Cálculo SIGAS, rótulo.
  - [x] Vista previa temporal desde Entregar, conectada al DXF, cañería, artefactos,
        resultados del cálculo y datos de obra actuales. No reemplaza la descarga existente.
  - [x] La planta DXF conserva y representa TEXT, MTEXT, cotas con bloque gráfico,
        tipos de línea y espesores heredados por capa o bloque.
  - [ ] Completar cotas sin bloque gráfico, bloques anidados y formato MTEXT avanzado.
  - [x] Isométrica y gabinete 50×40×30.
  - [ ] Corte opcional.
- [x] **Planilla de accesorios por tramo** igual a la hoja "Cal. Artefactos" del Excel.
      Vista desde Entregar (A4, 3 tramos por hoja). Lee los accesorios que ya sumó el cálculo.
- [x] **Lámina "Factibilidad" A3:** planta + croquis + rótulo. Botón en Entregar.
- [x] Croquis de ubicación simple: manzana, calles (4 nombres), distancias a esquina, norte.
      Datos en *Datos de la obra*; en el Plano de instalación va apagado y se prende en Entregar.
- [x] Tabla Referencias con numeración de artefactos y "boca taponada" (se marca en Artefactos).

## Fase 2 — Flujo simple de 5 pasos
- [x] Pasos visibles: Datos de la obra → Plano → Artefactos → Cañería → Revisar y descargar.
      Barra de 5 pasos con tildes y "Siguiente"; las pantallas de Plano, Artefactos y Cañería
      siguen siendo las de antes. "Revisar y descargar" es nueva (`components/revisar/`):
      3 hojas en miniatura, avisos antes del botón, "Agrandar para ampliación futura" y
      "Descargar las 3 hojas". Calcular y Entregar ya no son pasos. "Exportar materiales (Excel)"
      queda en Revisar y descargar como opción secundaria, debajo de las hojas.
- [x] **Datos de la obra como paso** (`components/obra/PasoDatosObra.tsx`): un formulario en una
      columna, croquis plegado, datos del instalador cargados una vez (después, una línea con
      "Cambiar"). Nada frena "Siguiente". "Nueva obra" (antes "Restablecer") vuelve a este paso
      y conserva el instalador. Partido sugerido según la localidad ya usada
      (`lib/obra/partidosUsados.ts`). Una obra nueva abre acá; una empezada, en el Plano.
- [x] **Plano: escala del archivo** (`lib/plano/escalaDelArchivo.ts`, `components/plano/`).
      Un DXF con `$INSUNITS` (mm, cm, m, dm, pulgadas, pies) toma la escala solo si la casa da
      entre 3 y 200 m de lado; muestra "La casa mide 10,00 × 8,00 m" para confirmar con los
      ojos. Si no se puede (PDF, DXF sin unidades o con la unidad equivocada) abre "Marcá una
      medida que conozcas": dos puntos y la medida en **metros**. "La medida no es correcta"
      lleva al mismo marcado. Cortes y paneles de antes quedan plegados en "Cortes y más
      opciones". El PDF se guarda en el navegador (IndexedDB, `lib/plano/pdfGuardado.ts`) y se
      reabre solo al volver; antes había que subirlo otra vez.
- [x] **PDF en Artefactos y en el A3** (resuelto: con PDF el artefacto queda donde se toca y las dos
      láminas A3 llevan la página del PDF de fondo, como dibujo; `laminas/fondoPdf.ts`) (encontrado al probar con PDF, 2026-11-25): la escala
      anda (un A4 a 1:100 da 29,70 × 21,00 m), pero en Artefactos no se puede ubicar ningún
      artefacto: la app busca una pared en el dibujo del DXF y un PDF no le da paredes ("No
      encontré una pared válida"). El medidor sí se ubica. Además, la planta del A3 se dibuja
      desde el DXF (`plantaPdf.ts`), así que con PDF tampoco saldría. Decidir en el paso
      Artefactos: ubicar sin pared en PDF y poner la página del PDF de fondo en la planta del A3.
- [ ] Resolución automática de accesorios, transiciones y familias (opción compatible por defecto).
- [ ] "Modo experto" que agrupe: decisiones de accesorios/transiciones, cortes y alturas,
      anclaje a paredes, propuesta automática de recorrido.
- [x] Numeración automática de tramos con letras/números como en los planos reales (M, A, B…
      1, 2…; se ve en el plano del paso Cañería con su diámetro: "C-M Ø32").
- [x] **Paso Cañería nuevo** (`components/caneria/`, `lib/caneria/`): el gasista toca dónde dobla y
      dónde termina el caño principal (sale del medidor, en escuadra); la app baja una derivación en
      ángulo recto a cada artefacto, pone tes, codos y llaves, numera y calcula. La red se guarda en
      cada toque (Siguiente sin "Terminar" ni "Aceptar"); lo marcado queda dentro de la misma red (ids
      `cp:`) y se relee al volver. Corregir: arrastrar esquinas, la punta y los puntos de salida,
      agregar y sacar quiebres, mover un tramo en paralelo, trazar una bajada a mano. Aviso si una
      bajada cruza otro caño. El trazado automático de antes queda plegado ("pantalla anterior") y
      una cañería hecha con él no se pisa hasta que el gasista elige marcar el caño principal.
- [x] **Paso Artefactos nuevo** (`components/artefactos/`, `lib/artefactos/`): un botón por tipo con
      el consumo típico (cocina 9.000, horno 3.000, calefón 20.000, termotanque 6.500, caldera 30.000,
      estufa/calefactor 3.000, secarropas 4.000 kcal/h; Otro sin consumo), un toque en el plano para
      ubicarlo (en DXF se apoya en la pared si hay una a menos de 0,5 m; si no, queda donde se tocó).
      Medidor ya elegido al entrar sin medidor. Numeración como la del plano (1 = el más lejano al
      medidor; con cañería, por la cañería). Tarjeta: nombre, consumo (kcal/h o m³/h), boca taponada,
      salida de gases, Mover y Borrar. La pantalla anterior queda plegada en "Alturas, lado de salida
      y más opciones".
- [x] Boca taponada: tilde en la tarjeta (`bocaTaponada`). Sale en Referencias, lleva tapón y el
      cálculo no cambia.
- [x] **Tiro de cada artefacto** (`tiro`: natural, balanceado o sin conducto), preparado para las
      ventilaciones. Típico por tipo; se cambia en "Salida de gases". Las ventilaciones no están hechas.
- [ ] Definir qué hacer con DWG (aceptarlo o explicar cómo convertir a DXF en un paso).

## Fase 3 — Prolijidad
- [ ] Revisar todos los textos con el glosario de `CLAUDE.md`; tildes y ortografía.
- [ ] Avisos con formato "qué pasa + qué hacer".
- [ ] Sacar cada paso de `DxfWorkbench.tsx` y `CalculationPanel.tsx` a su propio archivo.
- [ ] Quitar del PDF columnas internas (Diam. efectivo, Equiv. transiciones, etc.).

## Fase 4 — Prueba con trabajos reales
- [ ] Rehacer el trabajo más simple de `cata/` (2 tramos, 1 artefacto) y comparar
      diámetros, longitudes y consumos con el Excel y el plano presentado.
- [ ] Rehacer el trabajo con ramificaciones (varios artefactos) y comparar.
- [ ] Anotar diferencias y decidir si son errores de la app o del cálculo manual.

---

## Notas

### Red de seguridad: piezas que el motor no sabe clasificar (2026-11-25)
Prueba: `lib/caneria/bajadaEnDiagonalVerification.ts` (bajada a la estufa que sale de la te de C en
diagonal, 45°, y después sube).
- **Te sin sentido claro** (`calculation/technicalRouteTransitions.ts`): si no se ve si el recorrido
  sigue derecho o dobla, la te ya no queda sin contar. Se cuenta la variante que más longitud
  equivalente suma (te a 90°: 0,928 m en Ø32, contra 0,235 a través) + la cupla, y queda marcada
  (`traversalAssumed`). En la casa, la bajada en diagonal da Ø20 (antes 32), 9,89 m de equivalente.
- **Aviso en pantalla** (`revisar/avisosDelCalculo.ts`), en Revisar y descargar, con botón a Cañería
  y sin frenar la descarga ("No frena la descarga"): "En la te de C no se ve si el tramo 4-C sigue
  derecho o dobla (sale en diagonal). Se contó la te que más longitud equivalente suma, por seguridad.
  Si querés el valor justo, tocá Cañería y hacé que ese tramo salga en escuadra."
- **El motivo de la hoja es el real** (`calculation/causaDelAumento.ts`, `laminas/motivoDiametro.ts`).
  El motor ya probaba bajar un escalón cada tramo agrandado; ahora anota por qué no pudo (código del
  primer problema). La hoja imprime "Por longitud equivalente de reducciones" solo si lo que falta es
  longitud; "Por seguridad: pieza sin contar" si fue una pieza que no pudo contar (y la pantalla avisa
  con el tramo y la medida); "Por el cálculo de la red" en cualquier otro caso (también avisa). El
  gasista que agrandó sigue viendo "Previsto para ampliación".
- Ninguna obra de prueba cambia un número (tablas del A3 y planilla iguales). Verificaciones: 74
  grupos, 622, 0 fallas.
- **Queda afuera:** un cambio de medida en un nodo de 2 tramos que no es recto ni un giro claro (entre
  3° y 10°) y un giro con cambio de medida (codo + reducción) siguen sin pieza por defecto. Si
  agrandan un caño, la hoja ya lo dice ("pieza sin contar") y la pantalla avisa; contarlos solos queda
  para decidir. En las obras de prueba no aparecen.

### Estufa en la esquina: Ø32 en vez de Ø20 (2026-11-25) — arreglado
Prueba: `lib/caneria/estufaEnLaEsquinaVerification.ts`: exige Ø20, 9,19 m de equivalente, 15,29 m
de total y 3 cuplas de reducción 32. También con la bajada que sale a 90° y sube, y con la estufa de
frente a C.

**Arreglado** en `incidentVectorAtTransitionNode`: la dirección de cada tramo en la te se mide hacia
su primer quiebre, como en `routing/incidentGeometry.ts`. Las tres obras de prueba dan las mismas
tablas. En la casa de la estufa cambian, como se esperaba: 3 cuplas 32 (antes 2), codos Ø32 de 7 a 4,
codos Ø20 de 4 a 7, una llave Ø32 menos y una Ø20 más; la te de C pasa a contarse como te + cupla y
los otros recorridos suman lo mismo (2-A muestra 10,10 en vez de 10,09: es redondeo, vale 10,095 en
los dos casos). Con el caño principal doblando arriba (otra casa de prueba, no guardada) 3-B y 4-C
también bajaban de 32 a 20 por la misma causa.

Lo que sigue es el diagnóstico de antes del arreglo.

**El caso.** Casa desde cero, caño principal M → esquina C → fin; la bajada a la estufa sale de la te
de C, sube derecho 1,50 m (sigue la dirección del caño que viene del medidor) y dobla 0,80 m hasta la
estufa. Nada agrandado a mano.

**Lo que pide la tabla.** Recorrido al medidor: C-M 3,80 + 4-C 2,30 = 6,10 m. Piezas con 4-C en Ø20:
4 codos de salida del medidor Ø32 (4 × 1,191 = 4,764), llave general Ø32 (0,327), te normal a través
Ø32 (0,235), cupla de reducción 32→20 (0,329), codo del quiebre Ø20 (0,953), 2 codos de subida Ø20
(1,906), llave del artefacto Ø20 (0,678): 9,19 m. Total 15,29 m → fila de 16 m: el Ø20 lleva 1,399
m³/h y la estufa pide 0,323. **Ø20.**

**Por qué sale 32.** Para contar la te + cupla, el motor necesita saber si la estufa sale de la te "a
través" o "a 90°" (`classifyBranchTraversalKind` en `calculation/technicalRouteTransitions.ts`). Lo
mide con la recta del nodo C al artefacto, no con el primer tramo del caño: C → estufa forma 152° con
el caño que llega, que no es recto (±5°) ni 90° (±15°). La te queda sin contar
(`branch_transition_required`) y la búsqueda del menor aumento sube 4-C: en 25 sigue faltando la te;
en 32 los tres tramos de C miden lo mismo y ya no hay reducción, así que "cierra". Con 4-C en 32 la
longitud da 15,33 m y la tabla sigue diciendo 20: el 32 no lo pide la longitud. El motivo que sale en
la hoja ("Por longitud equivalente de reducciones") no es cierto en este caso.

**No es la norma.** Cada tramo se dimensiona con su consumo y su longitud de cálculo; una derivación
con reducción se arma con te + cupla (o te de reducción). Nada obliga a llevar la bajada en 32. Con la
estufa de frente a C (bajada recta) el mismo motor da 20, igual que si sale a 90°... una vez arreglado.

**Arreglo propuesto (aplicado, ver arriba).** En `incidentVectorAtTransitionNode`
(`calculation/technicalRouteTransitions.ts`), medir la dirección de cada tramo hacia su primer
quiebre (si tiene), como ya hace `routing/incidentGeometry.ts` para las propuestas de transición.
Unas 10 líneas. Probado en una copia, sin tocar el motor: las 615 verificaciones pasan, ninguna obra
de prueba cambia un número, y en la casa 4-C queda Ø20 (3 cuplas 32, codos Ø32 de 7 a 4, codos Ø20 de
4 a 7, una llave Ø32 menos y una Ø20 más). También arregla la bajada que sale a 90° y después sube.

### Paso Cañería nuevo (2026-11-25, contado en el navegador de punta a punta)
Casa de 10 × 8 m con medidor, 2 estufas, cocina y calefón (como `obraCasaDesdeCero.ts`), datos
inventados. El caño principal sube desde el medidor, dobla en una esquina y termina en la otra punta.
Las dos corridas terminaron con "Todo listo para descargar" y bajaron las 3 hojas.

| Paso | DXF | PDF |
|---|---:|---:|
| Datos de la obra (Nueva obra + Aceptar, croquis 1, norte 2, Siguiente) | 6 | 6 |
| Plano (archivo 2, Siguiente; con PDF + 2 puntos y Confirmar) | 3 | 6 |
| Artefactos (medidor 1, Estufa + 2, Cocina 2, Calefón 2, Siguiente) | 9 | 9 |
| Cañería (esquina, fin, Siguiente) | 3 | 3 |
| Revisar y descargar | 1 | 1 |
| **Total** | **22** | **25** |

Cañería quedó en 3 clics, los mismos que "Generar recorrido + Aceptar + Siguiente", pero ahora la
traza es la que marca el gasista (antes la automática sacó el caño por fuera de la casa) y no hay
nada que aceptar. Para 20: Datos de la obra (6 contra 2 de `PANTALLAS.md`) y la escala del PDF.

**Encontrado y resuelto al probar:**
- Al completarse la red, la revisión de antes (pestañas Corte/Axo) reencuadraba el plano y el toque
  siguiente caía en otro lugar. En el paso nuevo no se muestra.
- Al releer la red, todas las bajadas guardaban su salida como si el gasista la hubiera movido y se
  perdía el fin del caño. Ahora la bajada dice si su salida se movió (`cp:bs:`) o es a mano (`cp:bm:`).
- Una bajada con la salida corrida volvía por encima del caño principal; ahora sale en ángulo recto.

**Pendiente:**
- Con el plano chico en pantalla, algunas etiquetas de tramo se pisan (`4-C` y `B-C`).
- ~~En la casa de prueba la bajada a la estufa sale 32 en lugar de 20~~: arreglado en el motor (ver
  "Estufa en la esquina" abajo) y con red de seguridad para piezas que no sabe clasificar.
- Los marcadores "Z" de alturas de la pantalla anterior siguen sobre la cañería (van a Modo experto).
- Arrastrar el caño entero no es un arrastre: se toca el tramo y "Mover este tramo en paralelo" (+2).

### Paso Artefactos nuevo (2026-11-25, contado en el navegador)
Misma casa de 10 × 8 m, medidor, 2 estufas, cocina y calefón (como `obraCasaDesdeCero.ts`).

| Paso | DXF | PDF |
|---|---:|---:|
| Datos de la obra | 6 | 6 |
| Plano (+ 2 puntos y Confirmar con PDF) | 3 | 6 |
| Artefactos (medidor 1, Estufa + 2 toques, Cocina 2, Calefón 2, Siguiente 1) | 9 | 9 |
| Cañería (Generar recorrido, Aceptar recorrido, Siguiente) | 3 | 3 |
| Revisar y descargar | 1 | 1 |
| **Total** | **22** | **25** |

Artefactos bajó de 26 a 9 (la meta era 10 con 4 tipos distintos; las dos estufas comparten botón).
Lo que falta para 20 está en Cañería (pantalla de antes) y en el Plano con PDF.

**Encontrado y resuelto al probar:** la isométrica salía espejada con PDF (la Y del PDF va hacia
abajo); ahora se da vuelta en la lámina. El cartel del artefacto elegido tapaba el toque de al lado.

**Pendiente:**
- Con PDF la planta del A3 muestra la hoja entera del PDF: si tiene mucho blanco alrededor, la casa
  queda chica. Recortar a la casa sin cortar paredes queda para después.
- Los botones llevan la sigla del plano (COC, CF…), no un dibujo.
- Ventilaciones y conductos de evacuación (usan el tiro que ya guarda cada artefacto).

### Clics de la casa desde cero (2026-11-25, contados en el navegador)
Misma casa de 10 × 8 m (DXF en mm), medidor y 4 artefactos, hasta descargar las 3 hojas.
Escribir no cuenta; una lista desplegable cuenta 2 (abrir y elegir).

| Paso | Con el instalador guardado | Primera vez |
|---|---:|---:|
| Datos de la obra (Nueva obra + Aceptar / categoría 2, croquis 1, norte 2, Siguiente 1) | 6 | 6 |
| Plano (Elegir archivo, elegir el archivo, Siguiente) | 3 | 3 |
| Artefactos (pantalla de antes: medidor 3, cocina 4, otros 3 × 6, Siguiente 1) | 26 | 26 |
| Cañería (Generar recorrido, Aceptar recorrido, Siguiente) | 3 | 3 |
| Revisar y descargar (Descargar las 3 hojas) | 1 | 1 |
| **Total** | **39** | **39** |

La primera vez la app abre directo en Datos de la obra (no hay Nueva obra ni confirmación),
pero suma la categoría del instalador. Sin el croquis y las entre calles las hojas no salen
(van en el rótulo y la factibilidad). Si el plano no trae la escala: +3 (2 puntos + Confirmar).
Lo que falta para la meta de 20 está en Artefactos (26 contra 10 de `PANTALLAS.md`).

### Estado al 2026-11-24 (fin de sesión)
**Hecho hoy** (detalle en "Diámetro adoptado y comparación con un plano presentado"):
- Codos de subida (2 por bajada a artefacto, también boca taponada; el codo con rosca
  hembra cuenta como uno) y 4 de salida del medidor. Con alturas confirmadas se cuentan por
  cambio de nivel. Filas propias en la planilla. (`6619dbb`)
- Te normal + cupla por defecto en derivaciones con reducción. (`1389a09`)
- B-3: diferencia de método (accesorios en 25 contra 32), mismo diámetro por tabla con la
  longitud de la gasista. Test de seguridad sin excepciones. (`1389a09`)
- Motivo del diámetro adoptado cuando supera al de tabla: "Previsto para ampliación" o
  "Por longitud equivalente de reducciones", en la tabla SIGAS del plano y en la planilla
  por tramo. (`2ed23b0`)
- Motor congelado otra vez. Verificaciones: 51 grupos, 377, 0 fallas. Typecheck sin errores.

**Ramas: unidas.** El trabajo de la sesión y el del remoto (`origin/wip/integracion-02a`,
hasta `cedaedf`) quedaron juntos en `wip/integracion-02a` con el commit `79e7866`. Ya no
hay ramas separadas. Vercel publica `main` como Production; el resto sale como Preview.

### Arreglos tras el relevamiento (2026-11-24, sobre `RELEVAMIENTO.md`)
- **Red de seguridad** (`28e10c4`, `workbench/redDeSeguridadVerification.ts`): foto de las
  tablas del A3 (SIGAS, Referencias, Materiales) de las 3 obras de prueba (ejemplo, tres
  derivaciones y la casa cargada desde cero, `workbench/obraCasaDesdeCero.ts`); codos de
  subida y de medidor, tapones y una te por derivación; una obra guardada con el formato de
  hoy (`workbench/obraGuardadaHoy.ts`) se sigue abriendo igual. Si un número del A3 cambia,
  la prueba falla y dice cuál.
- **Un solo cálculo** (`workbench/calculoObra.ts`): pantalla, láminas y pruebas calculan por
  el mismo camino.
- **Diámetro adoptado igual en pantalla, A3, isométrica y materiales** (`6ac6bee`,
  `47782f6`, prueba `workbench/diametroAdoptadoVerification.ts`). Dos causas: el cálculo
  de la tabla SIGAS del A3 no recibía los diámetros agrandados por el gasista; y, sin
  agrandar nada, pantalla y materiales tomaban un diámetro que podía quedar por debajo del
  cálculo (obra de ejemplo: A-B en 25 cuando el cálculo pide 32). Corrección de seguridad:
  el requerido nunca baja del diámetro final del cálculo de la red.
- **Llaves de paso automáticas** (`732f962`, `calculation/llavesDePaso.ts`, prueba
  `workbench/llavesDePasoVerification.ts`): llave general en el tramo que sale del medidor
  y una por artefacto (también boca taponada), sin pedir alturas. Diámetro del tramo, en
  materiales, suman longitud equivalente, se dibujan en la planta y la isométrica del A3,
  y "LL.P" solo donde hay llave. No se duplican con las cargadas a mano o las de la
  conexión con altura confirmada. Un artefacto se puede marcar sin llave
  (`requiresShutoffValve = false`, para Modo experto).
- **Plano Parcial:** ningún diámetro cambia. La llave general (Ø32, 0,33 m) que la gasista
  no contó suma 0,33 m a todos los recorridos; B-3 queda 0,44 m por debajo por método (antes
  0,77 m), con el mismo diámetro.
- Verificaciones: 62 grupos, 495, 0 fallas. Typecheck sin errores.

**Tes y codos automáticos** (`9f89750`, `5c726fe`, prueba `a9cc873`,
`calculation/tesYCodos.ts`):
- Toda derivación lleva te sin que nadie la confirme: va en cada tramo que sale, a 90° o a
  través según el recorrido; en materiales es una pieza por nodo. Donde cambia la medida
  queda **te normal + cupla** (decidido: no te de reducción).
- Todo giro en planta lleva codo con el diámetro del tramo: esquinas entre tramos y
  quiebres dentro de un tramo.
- No se duplican con lo cargado a mano. En la planta del A3 el punto marca solo las tes;
  el codo se ve en el giro de la traza (sin símbolo propio, como en los planos reales).
- La llave general del medidor **sigue sumando** a la longitud equivalente (decidido).
- Números: obra de tres derivaciones sin cambios en el cálculo (materiales: 3 tes en lugar
  de 5); casa desde cero: A-B sube de 25 a 32; obra de ejemplo sin cambios.
- Verificaciones: 63 grupos, 515, 0 fallas.

**Pendientes para la próxima tarea (pantallas):**
- La pantalla sigue pidiendo confirmar tes que no se pueden confirmar ("requiere datos").
- La prueba de punta a punta con el navegador (punto 9.5 del relevamiento) queda para
  cuando estén las pantallas nuevas: hoy probaría pantallas que se van a rehacer y
  necesita sumar Playwright al proyecto.
- La altura sugerida del tipo "Otro" es 0 m. No afecta llaves ni cálculo, pero conviene un
  valor razonable cuando se arme la pantalla de Artefactos.

**Después:** datos de obra, propietario, matrícula, rótulo y carátula en el PDF (mostrar
antes qué datos se piden y dónde van); ventilaciones y conductos de evacuación; pantalla
de Modo experto (codos de subida, codos de salida del medidor, te de reducción).

### Integración temporal del Plano de instalación A3 (2026-11-21)
- La vista A3 se genera en el navegador con los datos actuales del área de trabajo. No usa
  datos ficticios, no guarda el PDF en el proyecto y mantiene la exportación anterior.
- Si faltan datos de obra, DXF, medidor, artefactos, cañería o cálculo resuelto, la interfaz
  explica qué falta y dónde completarlo antes de habilitar la vista.
- **Duda pendiente:** `plantaPdf.ts` recibe geometría normalizada de DXF; falta decidir cómo
  representar una Planta cargada desde PDF sin rasterizarla ni perder escala.
- **Duda pendiente:** el estado actual no guarda qué artefactos son bocas taponadas. La tabla
  no puede marcarlas hasta definir ese dato en la Fase 2, sin cambiar el cálculo.

### Fidelidad de arquitectura DXF en la lámina A3 (2026-11-21)
- La pérdida estaba repartida entre dos puntos: el importador descartaba TEXT, MTEXT y
  DIMENSION; el generador PDF ignoraba patrones y espesores que ya estaban parcialmente
  disponibles. El modelo ahora conserva texto original y visible, posición, alineación,
  rotación, escala, capa, patrón de línea y espesor resuelto.
- Las cotas compatibles se recuperan desde su bloque gráfico original. No se calculan ni se
  inventan medidas. Quedan pendientes las cotas sin bloque, los bloques anidados y las partes
  de cota expresadas con entidades todavía no soportadas, por ejemplo flechas SOLID.
- MTEXT conserva párrafos y formato geométrico básico. Quedan pendientes columnas, fuentes,
  apilados y códigos de formato avanzados; el texto original permanece guardado en el modelo.
- `plano-base.dxf` no contiene TEXT, MTEXT ni DIMENSION. Sí contiene dos arcos en la capa
  `puertas punteado`, con patrón `ACAD_ISO02W100` y espesor 0,05 mm; se representan con esos
  valores originales. Las cotas y nombres de ambientes visibles en la referencia real no se
  pueden recuperar de este archivo sin inventarlos.
- Captura de comparación generada desde la interfaz con datos de prueba en
  `_material-prueba/vistas-previas/captura-interfaz-a3-fidelidad.png`.
- Para cerrar la validación se revisaron todos los DXF de `_material-prueba`; ninguno tenía
  TEXT, MTEXT ni DIMENSION. Se creó localmente `dxf-fidelidad-anotado.dxf`, ignorado por Git,
  con siete textos, dos cotas, cuatro rotaciones, escalas, capas, patrones y espesores distintos.
- La importación desde la aplicación recuperó 17 líneas, 7 textos y 2 cotas, sin entidades
  ignoradas. Visor y PDF conservaron posiciones, proporciones, factores de ancho y rotaciones
  de 0°, 30°, 45° y 90°. Los patrones y espesores coincidieron con el archivo original.
- Evidencia local: `visor-dxf-fidelidad.png`, `plano-a3-dxf-fidelidad.png`, el PDF generado y
  `comparacion-dxf-fidelidad.json`, todos dentro de `_material-prueba/vistas-previas/` y fuera
  de Git.
- Limitaciones que siguen abiertas: cotas sin bloque gráfico, INSERT anidados, componentes de
  cota basados en entidades no soportadas y formato MTEXT avanzado. No bloquean las entidades
  compatibles comprobadas y no se amplía su alcance en esta fase.

### Diámetro adoptado y comparación con un plano presentado (2026-11-24)
**Decisión del diámetro adoptado.** Por defecto, el diámetro adoptado es el mínimo que da
la tabla SIGAS. La app resuelve sola las reducciones (te normal + cupla en derivaciones,
cupla de reducción en línea) para que ningún tramo suba de diámetro por no tener confirmada
una pieza. El gasista puede agrandar el diámetro adoptado de un tramo (por ejemplo, para
dejar prevista una ampliación). Ese diámetro mayor es el que se usa en accesorios,
reducciones y hojas.

**Comparación** (obra de prueba `workbench/obraPruebaTresDerivaciones.ts`, misma geometría,
consumos y largos que un plano parcial ya presentado, con los accesorios cargados a mano
como los contó la gasista):
- Largos reales, consumos y diámetro adoptado: iguales en los 7 tramos.
- Diámetro por tabla: igual salvo B-3. La app da 20 y el plano 25. Con 0,699 m³/h, el 20
  alcanza en la tabla, así que el 25 de la gasista es una elección, no un resultado de la tabla.
- Longitud total: diferencia de 0,14 m en los recorridos al 1, al 2 y al 4. En el recorrido
  al 3 (B-3) la app da 14,91 m y el plano 16,31 m: 1,40 m menos. Donde baja el diámetro, la
  app cuenta te de reducción con la medida real. La gasista contó te normal y cupla, todo en 32.
- **Codos de subidas y bajadas: la app no los contaba** (corregido, ver abajo). Solo pone codos donde la traza dobla
  en planta. En los extremos (medidor y artefactos) no agrega nada, y las alturas cargadas
  solo se usan para dibujar, no para el cálculo. En la prueba los codos están cargados a mano.
  Con la propuesta automática, B-3 y C-M son rectos en planta y quedarían con 0 codos (la
  gasista contó 2 y 4). La longitud equivalente queda corta, que es el lado inseguro.

**Decisión: codos de subidas y bajadas (corrección de seguridad, autorizada en el motor).**
- 4 codos a 90° en el primer tramo, a la salida del medidor.
- 2 codos por cada subida o bajada a un artefacto, también en boca taponada, con el
  diámetro del tramo que llega. Si la conexión al artefacto ya trae su codo con rosca
  hembra (lo pone la app al conectar), ese cuenta como uno de los 2 y se agrega 1 normal.
- Si ese extremo tiene alturas confirmadas por el gasista, se cuentan 2 codos por cada
  cambio de nivel del tramo en lugar de los fijos. No se cuentan dos veces.
- En la planilla por tramo figuran como filas propias: "Codos de subida" y "Codos de salida
  del medidor". Se ubican en la isométrica y en los cortes, en el extremo del tramo.
- Cantidad editable en Modo experto: el motor respeta la pieza si el tramo ya la trae con su
  id (`codos-subida:<tramo>`, `codos-salida-medidor:<tramo>`). Falta la pantalla (ver pendientes).
- Código: `calculation/codosDeSubida.ts`. Las pruebas viejas del motor que miden otras
  cosas con números exactos los apagan (`codosDeSubida: false`).
- Test de seguridad en la obra de prueba: ningún tramo con diámetro adoptado ni longitud
  equivalente menor que la planilla de la gasista. Resultado: los recorridos al 1 y al 2
  quedan 1,72 m por encima (ella no contó codos en esas bajadas) y el del 4 da igual.
  En B-3 se controla el diámetro (ver abajo).

**Decisión: derivaciones con reducción (2026-11-24).**
- Por defecto, la app cuenta **te normal + cupla de reducción**: la te con la medida de la
  entrada (a 90° o a través según el recorrido) y, si el recorrido baja de medida, la cupla.
  Da más longitud equivalente que la te de reducción central. La te de reducción se puede
  elegir en Modo experto (decisión del gasista sobre la derivación).
- **No** se cuentan los accesorios de un tramo con el diámetro mayor: no es coherente con el
  cálculo del tramo y agranda cañerías sin necesidad.

**B-3: la diferencia es de método, no de seguridad.**
- Con te normal + cupla (0,928 + 0,525 m), B-3 queda 0,77 m por debajo de la gasista:
  8,39 m de longitud equivalente contra 9,16. La diferencia sale de que la app cuenta
  los 2 codos y la llave del tramo en 25, que es su medida, y la gasista los contó en 32.
- Con la longitud de la gasista (15,54 + 0,77 = 16,31 m) y 0,699 m³/h, la tabla SIGAS da
  20 mm (fila de 18 m), igual que con la de la app (fila de 16 m). El adoptado sigue en 25.
- El test controla en B-3 que el diámetro no sea menor, y que con la longitud de la gasista
  no cambie el diámetro. Ya no hay excepciones.

**Pendiente de Modo experto (pantalla):**
- Cambiar la cantidad de codos de subida y de salida del medidor por tramo.
- Elegir te de reducción central en lugar de te normal + cupla en una derivación.

### Decisiones tras la Fase 0 (2026-11-20)
- Los paneles ocultos (diagnóstico, preparación del plano, obstáculos) quedan para
  "Modo experto". Cómo se integran se decide en la Fase 2.
- `sections/routeHeightProposals.ts` queda sin conectar.
- `CLAUDE.md` y `PLAN.md` se versionan en git.
- Antes de la Fase 1 se agrega `npm run verify` para correr las verificaciones del motor.
  Resultado inicial: 41 grupos, 317 verificaciones, 0 fallas.

### Fase 0 — Resultado (2026-11-20, sobre el commit `3bcf275`)

Análisis hecho leyendo el código y sus imports. No se abrió la app ni se ejecutaron
las verificaciones. Las líneas son de `DxfWorkbench.tsx` en ese commit.

**Typecheck:** `npm run typecheck` pasa, sin errores.

**Módulos de `src/lib` (113 archivos), alcanzados desde `src/app`:**

| Carpeta | Archivos | En uso | Solo tipos | Sin uso |
|---|---:|---:|---:|---:|
| `architecture` | 4 | 3 | 0 | 1 |
| `calculation` | 51 | 27 | 0 | 24 |
| `calibration` | 3 | 2 | 1 | 0 |
| `constraints` | 2 | 1 | 1 | 0 |
| `dxf` | 2 | 2 | 0 | 0 |
| `equipment` | 7 | 3 | 0 | 4 |
| `geometry` | 4 | 3 | 1 | 0 |
| `pdf` | 3 | 2 | 1 | 0 |
| `routing` | 15 | 9 | 1 | 5 |
| `sections` | 12 | 6 | 0 | 6 |
| `semantic` | 5 | 4 | 1 | 0 |
| `workbench` | 5 | 3 | 0 | 2 |
| **Total** | **113** | **65** | **6** | **42** |

- De los 42 sin uso, 41 son archivos `*Verification.ts`. No hay que borrarlos: son las
  pruebas del motor, aunque `package.json` no tiene un comando para correrlas.
- El único módulo funcional sin uso es `sections/routeHeightProposals.ts` (1.758 líneas),
  agregado en el último commit. Solo lo importa su verificación: todavía no está conectado.
- `calculation/technicalEquivalentAccessoryVerification.ts` se llama "Verification" pero
  **es código de producción** (lo usan `DxfWorkbench`, `CalculationPanel` y
  `technicalAdoptedDiameterValidation`). No tratarlo como prueba.

**Dónde está cada paso.** Los pasos reales son 5: Plano, Artefactos, Recorrido, Calcular
y Entregar (413-422). "Revisar" no es un paso: vive dentro de Recorrido.

| Paso | Acciones | Panel | Funciones auxiliares |
|---|---|---|---|
| Plano: importar y bases | 1922-2116, 2302-2422 | 7173-7205 | 7228-7254, 7306-7953 |
| Plano: escala | 5934-6122 | 6595-6613 | 10439-10498 |
| Plano: cortes (opcional) | 2453-3020, 5448-5531 | dentro de 7186 | 10677-11048 |
| Artefactos | 3021-3878 | 6405-6443 | 7954-8485 |
| Recorrido | 3879-5176 | 6444-6522 | 8486-10269 |
| Revisar (dentro de Recorrido) | 2151-2230 | 6506-6519, lienzo 6971-6980 | 11124-11251 |
| Calcular | 5177-5447 | 6523-6559 | 10270-10359 |
| Entregar | sin código propio | el mismo de Calcular (6540) | descarga en `CalculationPanel.tsx:407` |

**Lo que condiciona la extracción (Fase 3):**
- Los pasos no están separados: `DxfWorkbench()` va de 444 a 7226 y concentra el estado y
  los cálculos derivados de todos (445-6275). Mover solo el JSX no alcanza; primero hay
  que sacar estado y acciones a hooks por paso.
- `DxfViewer` (6986) y `PdfViewer` (7079) reciben props de todos los pasos a la vez.
- Calcular y Entregar comparten `CalculationPanel`, separados solo por la prop `mode`.
- **Paneles armados que no se muestran:** "Plano" (`geometry`, 6348-6404) y "Revisar"
  (`obstacles`, 6560-6594) no están en `MAIN_WORKFLOW_PANEL_SECTIONS` (423-432), y el paso
  Plano solo dibuja la escala. Por eso `DiagnosticsPanel`, `GeometryPreparationPanel`,
  `PdfDiagnosticsPanel` y `ObstaclesPanel` hoy no aparecen en pantalla. Falta decidir si
  van a "Modo experto" o se retiran.
