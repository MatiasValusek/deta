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
- [ ] Tabla Referencias con numeración de artefactos y "boca taponada".

## Fase 2 — Flujo simple de 5 pasos
- [ ] Pasos visibles: Datos de la obra → Plano → Artefactos → Cañería → Revisar y descargar.
- [ ] Resolución automática de accesorios, transiciones y familias (opción compatible por defecto).
- [ ] "Modo experto" que agrupe: decisiones de accesorios/transiciones, cortes y alturas,
      anclaje a paredes, propuesta automática de recorrido.
- [ ] Numeración automática de tramos con letras/números como en los planos reales.
- [ ] Consumos típicos precargados por artefacto (cocina, calefactor TB, termotanque,
      calefón, caldera, horno), editables.
- [ ] Agregar en el paso Artefactos dónde marcar "boca taponada". La boca taponada suma
      consumo, así que el cálculo no cambia.
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
