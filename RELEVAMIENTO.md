# Relevamiento de Deta — 24/11/2026

Hecho sobre `main` = `wip/integracion-02a` (commit `6bbf6a1`), sin cambiar código.
Se usó la app real en el navegador (servidor de desarrollo) y se corrieron las verificaciones.

## Resumen (5 líneas)

1. **El cálculo es confiable:** las 439 verificaciones pasan y la obra de tres derivaciones coincide con el plano presentado. Las hojas A3, la planilla y el rótulo ya salen.
2. **Las pantallas son el problema.** Desde cero, llegar al PDF lleva **70 clics**. En el paso Recorrido aparecen tes que no se pueden elegir (opciones apagadas) y la única salida es "Rechazar".
3. **Llaves de paso:** con el flujo normal la app **no pone ninguna** (ni en artefactos ni la general del medidor). En la isométrica se escribe "LL.P" igual, haya llave o no. Los codos de subida y bajada **sí** se cuentan sin alturas cargadas.
4. **El trazado automático no sirve todavía para presentar:** en una casa simple sacó la cañería por fuera de la casa, y al arrastrar un punto para corregirla la app no dejó.
5. **Recomendación: (b)** rehacer solo las pantallas sobre el motor y las láminas actuales. Antes, sumar 4 o 5 pruebas que protejan lo que ya sale bien.

---

## 1. Flujo actual, pantalla por pantalla

Arriba hay 5 botones: **Plano · Artefactos · Recorrido · Calcular · Entregar**, más **Datos de la obra** y **Restablecer**.

### Con la obra de ejemplo: 4 clics hasta el PDF
"Probar con una obra de ejemplo" (1) → "Entregar" (1) → "Ver plano A3" (1) → botón de descarga del visor de PDF (1).
La obra de ejemplo viene armada: ya trae la escala, la cañería y las tes confirmadas. Por eso no pasa por las trabas que se describen abajo.

### Desde cero, con la misma casa: 70 clics (contados) y 14 campos para escribir
Se dibujó la misma casa de 10 × 8 m en un DXF, con medidor y 4 artefactos.

| Paso | Qué ve y qué le pide | Clics |
|---|---|---:|
| **Datos de la obra** | Ventana con propietario, calle, número, entre calles, localidad y partido, más croquis (calle de atrás, metros a cada esquina, norte) e instalador (nombre, matrícula, categoría). Abrir 1 + 9 campos + categoría 2 + "Listo" 1. | **13** |
| **Plano** | "Cargar Planta" + elegir el archivo (3). "Calibrar escala": marcar 2 puntos (2), escribir la distancia (1), cambiar la unidad (2, viene en **milímetros**), "Confirmar" (1). "Continuar a Artefactos" (1). | **11** |
| **Artefactos** | Medidor: "Agregar medidor" + tocar el plano + "Aceptar" = 3. Cada artefacto: "Agregar artefacto", tipo (2), consumo (1), "Ubicar", tocar el plano, "Aceptar" = 7 (la cocina 5, porque ya viene elegida). **El consumo no viene precargado. No hay forma de marcar "boca taponada".** Pasar a Recorrido 1. | **30** |
| **Recorrido** | "Generar recorrido" (1). La propuesta queda "incomplete" y no deja aceptar: hay que entrar a "Revisar accesorios" (1). Pide 4 decisiones de "Seleccionar familia": 2 codos (elegir tipo + confirmar = 3 c/u = 6) y 2 tes cuyas opciones están **apagadas** ("Te Normal, flujo a 90 – requiere datos"). Solo queda "Rechazar" (2). "Volver al resumen" (1), "Aceptar recorrido" (1), "Continuar a Calcular" (1). | **13** |
| **Calcular** | Muestra "Cálculo completo" y la tabla. No pide nada: es un paso de paso. | 0 |
| **Entregar** | "Entregar" (1), "Ver plano A3" (1), descargar desde el visor (1). | **3** |
| **Total hasta el Plano de instalación A3** | | **70** |

Además, para tener **las 3 hojas**: Factibilidad (+2 clics, y antes completar el croquis: +5 clics y 3 campos más) y Planilla (+2 clics). Cada hoja se descarga por separado desde el visor del navegador. La app no tiene un botón propio de "Descargar".

### Lo que se vio en pantalla y no debería estar
- Textos en inglés o de programador: "Propuesta incomplete/complete", "Resolve las decisiones", "Preview listo", "0 alimentacion", "Sin equipos colocados", "Nodo grado 3", "Seleccionar familia", "familia técnica", "Margen geometrico", "Snap", "Intenciones", "Restricciones incumplidas", "Boceto de relaciones para interpretar despues", "Diam. provisional", "Transiciones", "CANERIA NETA", "ACCESORIOS FISICOS", "planilla tecnica".
- Faltan tildes en muchos textos (calibracion, diametro, cañeria, revision).
- Al rechazar las tes, la app igual dice "Cálculo completo". El gasista no sabe qué quedó afuera.
- El botón viejo **"Exportar PDF"** sigue en Entregar. Saca un PDF interno que no sirve para presentar: muestra códigos internos ("physical-accessory:route:…"), "Cano ?20" en lugar de "Caño Ø20" y columnas como "Diam. efectivo" o "Equiv. transiciones".

### La obra de tres derivaciones en la app
No tiene botón para cargarla: solo existe en las pruebas. Se cargó a mano en el navegador. En la app:
- Queda **"Entrega bloqueada"**: vuelve a pedir la familia de las 3 tes, con las opciones apagadas. Se destraba solo con "Rechazar".
- En el A3, la columna **"Diám. adoptado"** de la tabla SIGAS muestra el diámetro de tabla (20 en 1-A). En cambio, la pantalla y la lista de materiales usan el agrandado por la gasista (25). **Hay una diferencia entre la pantalla y la hoja.** No pude confirmar la causa. Puede ser que el problema aparezca recién después de rechazar las tes, pero en la hoja hay que revisarlo antes de presentar.
- Las llaves aparecen en materiales porque en esta obra están cargadas a mano.

## 2. Decisiones técnicas que hoy se le piden al gasista

| Decisión | Dónde aparece | ¿Debería ser automática? |
|---|---|---|
| Familia de te (a 90° / a través) | Recorrido → Revisar accesorios, y Calcular/Entregar si queda pendiente | **Sí.** Además hoy las opciones vienen apagadas y no se puede elegir. |
| Familia de codo (normal / MH / rosca hembra) | Recorrido → Revisar accesorios | **Sí** (codo normal a 90°) |
| Confirmar o rechazar cada accesorio propuesto | Recorrido → Revisar accesorios ("Confirmar accesorio", "Rechazar") | **Sí.** Rechazar va a Modo experto. |
| Familia de reducción o de transición | Panel de cálculo ("Familia de reduccion", "Familia de transicion", "Confirmar familia", "Rechazar transición") | **Sí** (el plan ya lo fija: te normal + cupla) |
| "Decisión equivalente para 2 nodos" | Revisar accesorios | **Sí.** No debería mostrarse. |
| Agrandar diámetro adoptado | Revisar accesorios y Calcular ("Agrandar para ampliación futura", una lista por tramo) | Está bien que exista, pero **en Modo experto** o plegado. Hoy ocupa media pantalla. |
| Margen geométrico de la propuesta | Recorrido → Editar | **Sí.** Al Modo experto. |
| Snap, Ejes X/Y, Vértices, Muros, Ortogonal | Recorrido → Editar → "Edición física" | **Sí.** Dejar uno solo prendido por defecto. |
| "Conexiones manuales" e "Interpretar trazado" | Recorrido → Editar | **Al Modo experto** o sacar |
| Lado de salida del artefacto ("Invertir lado") | Artefactos, al ubicar | **Sí** (ya se calcula solo; el botón puede quedar escondido) |
| Unidad de la escala (viene en mm) | Plano → Calibrar escala | **Sí:** que venga en metros |
| Cortes A-A, B-B, alturas | Plano ("Agregar corte real (opcional)") y pestañas del Recorrido | **Al Modo experto** |

## 3. Llaves de paso, y codos de subidas y bajadas

**Llave en cada artefacto: no, en el flujo normal.**
- La app agrega la llave **solo cuando el gasista confirma la altura de conexión del artefacto** (`DxfWorkbench.tsx:9311`, `routing/terminalConnection.ts`). Las pantallas de Artefactos no piden alturas. Por eso, en el recorrido desde cero y en la obra de ejemplo **no hay ninguna llave**: ni en los materiales de pantalla, ni en la tabla del A3, ni en la longitud equivalente.
- Cuando la llave existe (obra de tres derivaciones, cargada a mano), **sí** se cuenta en materiales ("LLAVE DE PASO") y **sí** suma a la longitud equivalente según la tabla SIGAS. Ojo: figura en Ø20 en tramos con diámetro adoptado 25. Falta ver si debería ir con el adoptado.

**Llave general a la salida del medidor: no existe.** Solo está dibujada en el detalle del gabinete (`laminas/gabinetePdf.ts:114`). No se cuenta en materiales ni suma a la longitud equivalente.

**Dibujo:** en la planta no hay símbolo de llave. En la isométrica se escribe el texto "LL.P" **en todos los artefactos siempre**, aunque la llave no esté cargada (`laminas/isometricaPdf.ts:223`). Hoy ese texto es solo un rótulo: no refleja lo que la app calculó.

**Codos de subidas y bajadas sin alturas: sí se cuentan** (verificado en pantalla y en pruebas).
- 4 codos a la salida del medidor y 2 por cada bajada a artefacto, también en boca taponada. En la obra de ejemplo: codos Ø20 ×6 (3 bajadas), Ø25 ×2 (calefón), Ø32 ×4 (medidor). Aparecen en materiales y en la planilla por tramo.
- Si el artefacto tiene altura confirmada, se cuenta por cambio de nivel y no se cuenta dos veces (hay prueba).

## 4. Formas de trazar la cañería

| Forma | ¿Existe? | Cómo anduvo |
|---|---|---|
| **Automática** ("Generar recorrido") | Sí. Busca un camino en ángulo recto apoyándose en las paredes y prueba varios órdenes de artefactos (`routing/autoProposal.ts`, `coordinatedInstallationProposal.ts`, ~3.800 líneas). | En la casa de prueba **sacó la cañería por fuera de la casa** (un rulo por detrás de la pared del fondo). Después trabó el avance con las tes. |
| **Por paredes** | No como opción propia. "Muros" es una ayuda para enganchar al editar, y la automática se guía por paredes. | — |
| **Perimetral automática** | No existe. | — |
| **A mano** | Sí: "Editar" → "Conectar", más un "boceto" que la app interpreta ("Interpretar trazado"). | No probado con clics. Visto en el código. |
| **Arrastrar para corregir** | Se pueden arrastrar puntos y quiebres, y agregar o borrar quiebres (`routing/physicalRouteEditing.ts`). **No se puede arrastrar un tramo entero.** | Al bajar la esquina del rulo para meterla en la casa, la app **no lo aceptó**: "La edicion cruza tramos sin nodo". |

**Qué tan cerca estamos:** de un trazado perimetral confiable, lejos. La búsqueda actual es compleja y en un caso simple da un resultado que no se presentaría. Arrastrar existe a medias (puntos sí, tramos no, y se traba al cruzar).

**La versión más simple que sirve para presentar: "caño principal + bajadas" (peine).**
1. El gasista marca con 2 toques por dónde va el caño principal (una línea recta o con un quiebre, pegada a una pared).
2. La app baja una derivación en ángulo recto desde el caño principal a cada artefacto. Pone tes, codos, llaves, codos de subida y tapones sola, y numera (M, A, B, C… 1, 2, 3).
3. Para corregir: arrastrar el caño principal en paralelo y mover cada punto de derivación sobre él.

Es lo que muestran los planos reales (la obra de tres derivaciones es exactamente eso: M-C-B-A-1 en línea con bajadas). No necesita búsqueda inteligente y siempre da lo mismo. La propuesta automática actual puede quedar en Modo experto.

## 5. Lo que está a medio hacer, duplicado o sin uso

**A medio hacer**
- Tes con reducción: el plan dice que la app pone sola te normal + cupla, pero la pantalla todavía pide elegir la te y no deja hacerlo.
- Boca taponada: el motor y la hoja la manejan (tapón en materiales, "BOCA TAPONADA" en Referencias), pero **no hay dónde marcarla en pantalla**. Hoy solo funciona si el texto está en las notas del artefacto, y la pantalla no tiene campo de notas.
- Consumos típicos precargados: no están.
- Llaves de paso: dependen de las alturas (ver punto 3). Falta la llave general.
- Modo experto: no existe como pantalla. Lo "experto" está mezclado con lo básico.
- Planta desde PDF en la lámina A3: pendiente según `PLAN.md`. No probado.
- `PLAN.md` dice que la fusión de ramas está "pendiente de confirmación", pero ya está hecha (commit `79e7866`). Hay que actualizarlo.

**Duplicado**
- **Dos PDF:** "Exportar PDF" (viejo, `calculation/technicalPdfDocument.ts` + `technicalPdfDownload.ts`) y las láminas A3 nuevas (`lib/laminas/`).
- **Dos listas de materiales con distintos nombres:** la pantalla dice "Tee reductora Ø20 a Ø32" y "Cupla reductora Ø20 a Ø25 a Ø32". El A3 dice "TE 32" y "CUPLA DE REDUCCIÓN 32".
- **Dos isométricas:** la pestaña "Axo" en pantalla (`calculation/technicalAxonometric.ts`) y la de la lámina (`laminas/isometricaPdf.ts`).
- **Cuatro maneras de armar la cañería automática:** la "legacy" (`generateLegacyAutomaticRouteProposal`), la coordinada, el borrador coordinado y la que interpreta el boceto.
- **Dos cálculos de red:** con y sin transiciones (`technicalNetworkSizing.ts` y `technicalNetworkSizingWithTransitions.ts`).
- **Calcular y Entregar** usan el mismo panel con un interruptor.

**Armado pero no visible (código muerto en la práctica)**
- `DiagnosticsPanel`, `GeometryPreparationPanel`, `PdfDiagnosticsPanel`, `ObstaclesPanel`: se arman en `DxfWorkbench.tsx`, pero sus secciones ("geometry", "obstacles") no están en la lista de lo que se muestra (`workbench/mainWorkflowNavigation.ts`).
- Lectura "semántica" del plano (`lib/semantic/`, ~600 líneas): alimenta esos paneles ocultos.
- Cortes y alturas (`lib/sections/`, ~6.200 líneas, más 3 dibujos encima del plano): se usan solo si el gasista agrega un corte. Es opcional y está a la vista en el paso Plano.

**Sin uso fuera de las pruebas:** solo `workbench/obraPruebaTresDerivaciones.ts`, que es una obra de prueba y está bien así. El resto de `lib/` se usa desde alguna pantalla.

## 6. Archivos más grandes

| Archivo | Líneas | Comentario |
|---|---:|---|
| `components/dxf-workbench/DxfWorkbench.tsx` | **12.148** | Creció **+845** desde que la regla dijo "no sumar más" (11.303). Una sola función de ~7.500 líneas (458–7971) con 35 estados. |
| `components/dxf-workbench/CalculationPanel.tsx` | **5.035** | +146 desde la regla. Incluye toda la revisión de accesorios y familias. |
| `calculation/technicalNetworkSizingWithTransitions.ts` | 2.228 | Motor. Probado. No tocar. |
| `routing/autoProposal.ts` | 2.215 | Trazado automático. |
| `calculation/technicalTree.ts` | 2.184 | Motor. Probado. No tocar. |
| `sections/routeHeightProposals.ts` | 2.105 | Alturas (experto). |
| `routing/coordinatedInstallationProposal.ts` | 1.607 | Trazado automático coordinado. |
| `components/dxf-workbench/DxfViewer.tsx` | 1.528 | Visor del plano. Reutilizable. |
| `dxf/importDxf.ts` | 1.502 | Lectura de DXF. Reutilizable. |
| `calculation/technicalMaterialTakeoff.ts` | 1.373 | Materiales. Reutilizable. |

Tamaño total: 44.000 líneas en `lib/` sin contar pruebas (cálculo 18.000, trazado 9.600, cortes 6.200, láminas 2.300) y 29.000 en pantallas.

**¿Conviene partirlos antes del cambio?** `DxfWorkbench.tsx` y `CalculationPanel.tsx`: **no**, si se van a rehacer las pantallas. Partir 12.000 líneas para después tirarlas es trabajo doble. Las pantallas nuevas se arman en archivos propios, una por paso, y van tomando del motor. Los archivos viejos quedan quietos hasta que se puedan borrar. Los archivos grandes del motor no se tocan (motor congelado).

## 7. Qué falta para una presentación aprobable

| Parte | Estado |
|---|---|
| **Rótulo** | Está: "INSTALACIÓN PARA GAS NATURAL", propietario, calle y número, entre calles, localidad, partido, instalador, matrícula, categoría, firmas. Verificado en el A3. |
| **Carátula** | **No existe.** Nada en el código. |
| **Ventilaciones y conductos de evacuación** | **No existen.** Nada en el código. |
| **Llaves de paso** | Faltan en el cálculo y en los materiales con el flujo normal. Falta la llave general. El "LL.P" de la isométrica no refleja la realidad. |
| **Detalle de materiales** | Tabla con caño, codo, te, cupla de reducción, llave de paso y tapón, por diámetro, con marca y matrícula. La matrícula SIGAS está fija en el código ("044-42", `laminas/tablasPlano.ts:41`): confirmar que sea la correcta. Unificar los nombres con la pantalla. |
| **Tabla SIGAS** | Está. Revisar la diferencia del diámetro adoptado (punto 1). |
| **Numeración de tramos** | Está (M, A, B, C… 1, 2, 3, 4), la pone la app sola y es la misma en planta, isométrica y tabla. |
| **Boca taponada** | La hoja la muestra, pero no se puede marcar desde pantalla. |
| **Croquis de ubicación** | Está. Pide 4 datos más en Datos de la obra. |
| **Planta desde PDF** | Pendiente (ver `PLAN.md`). No probado. |
| **Descarga** | Una hoja por vez desde el visor del navegador. Falta un "Descargar todo". |
| **Corte** | Pendiente. Es opcional. |

## 8. Inventario para decidir

| Parte | Decisión | Por qué | Trabajo |
|---|---|---|---|
| Motor de cálculo (árbol, dimensionado, transiciones) | **Conservar** | Probado y reproduce el método del gasista. Congelado. | chico |
| Tablas SIGAS | **Conservar** | Datos correctos y probados. | chico |
| Lectura de DXF | **Conservar** | Lee líneas, textos, cotas y capas. Probado. | chico |
| Lectura de PDF | **Conservar** | Funciona como plano. Falta llevarla a la lámina A3. | mediano |
| Escala | **Conservar** (pantalla: retoque) | Anda. Que venga en metros y se llame "Escala". | chico |
| Artefactos (datos, tipos, salida) | **Conservar** | El modelo sirve. | chico |
| Pantalla de Artefactos | **Rehacer** | Faltan consumos precargados y boca taponada. Demasiados pasos por artefacto. | mediano |
| Anclaje a pared de artefactos | **Esconder en Modo experto** | Detalle fino. | chico |
| Trazado automático actual | **Esconder en Modo experto** | Saca la cañería fuera de la casa. Es complejo de corregir. | chico |
| Trazado "caño principal + bajadas" | **Hacer (nuevo)** | Lo más simple que sirve para presentar. | mediano |
| Edición de la traza (arrastrar puntos) | **Conservar** y simplificar | Funciona a medias: falta mover un tramo entero y no trabarse al cruzar. | mediano |
| Accesorios automáticos (tes, codos, cuplas) | **Conservar el motor; rehacer la revisión** | Que se confirmen solos. La revisión va al Modo experto. | mediano |
| Llaves de paso | **Completar** | Ponerlas siempre en cada artefacto, sumar la general del medidor y dibujar "LL.P" solo donde hay llave. | chico–mediano |
| Codos de subida y bajada | **Conservar** | Ya se cuentan bien sin alturas. | — |
| Cortes y alturas | **Esconder en Modo experto** | 6.200 líneas para algo opcional. | chico |
| Paneles ocultos (diagnóstico, preparación, obstáculos, semántica) | **Borrar de la pantalla** | Nadie los ve. Revisar antes si el trazado automático usa algo. | chico |
| Planilla de cálculo por tramo | **Conservar** | Igual al Excel real. | — |
| Isométrica de la lámina | **Conservar** | Sale bien. Corregir el "LL.P". | chico |
| Isométrica de pantalla ("Axo") | **Esconder en Modo experto** | Duplica la de la lámina. | chico |
| Materiales | **Conservar** y unificar nombres | Pantalla y hoja tienen que decir lo mismo. | chico |
| Láminas A3 (instalación, factibilidad) y rótulo | **Conservar** | Es lo más cercano a lo que se presenta. Faltan carátula y ventilaciones. | mediano |
| PDF viejo ("Exportar PDF") | **Borrar** | No es presentable y confunde. | chico |
| Excel ("Exportar Excel") | **Esconder en Modo experto** | No revisé su contenido. | chico |
| Guardado de la obra | **Conservar** | Probado. Las pantallas nuevas tienen que leer obras guardadas. | chico |
| Pantalla Datos de la obra | **Conservar** | Clara y en castellano. | — |
| Pantalla Plano | **Conservar** con retoques | Corte opcional al Modo experto, unidad en metros. | chico |
| Pantalla Recorrido | **Rehacer** | Es donde se traba todo: decisiones técnicas, textos en inglés, propuesta que no se puede aceptar. | grande |
| Pantalla Calcular | **Borrar como paso** | No pide nada. Lo que muestra va a "Revisá y descargá". | chico |
| Pantalla Entregar | **Rehacer** como "Revisá y descargá" | Vista de las 3 hojas, avisos claros y un botón de descarga. Sacar el PDF viejo. | mediano |
| `DxfWorkbench.tsx` / `CalculationPanel.tsx` | **Rehacer de a poco** (no partir) | Las pantallas nuevas se arman en archivos nuevos. Los viejos se borran al final. | grande |

## 9. Red de seguridad

**Qué hay:**
- 59 grupos de verificaciones, **439 comprobaciones, 0 fallas** (`npm run verify`). Cubren motor, tablas SIGAS, accesorios, materiales, isométrica, láminas, planilla, rótulo, guardado, trazado automático y cortes.
- `npm run typecheck`: sin errores.
- **No hay pruebas de pantalla.** Nada controla que se pueda ir de Datos de la obra al PDF.

**Comparación con el Plano Parcial:**
- La versión **actual** (`obraPruebaTresDerivacionesVerification.ts`, 10 comprobaciones) **pasa**.
- La versión **original** del commit `ac1bc2c`, corrida contra el código de hoy, **falla** en "las longitudes totales quedan cerca del plano". Es esperable: después se agregaron a propósito los codos de subida y la te normal + cupla, y la prueba se actualizó en `6619dbb`, `1389a09` y `2ed23b0`. Hoy controla lo de seguridad: ningún tramo queda con diámetro o longitud equivalente menor que la gasista.
- **Pero en la pantalla esa obra no llega:** queda bloqueada por las tes, y el A3 muestra un diámetro adoptado distinto al de la pantalla. La prueba solo mira el motor, no lo que sale en la hoja.

**Qué proteger con pruebas antes de tocar nada:**
1. **Hoja A3 de las dos obras de prueba:** que la tabla SIGAS, Referencias y Materiales del A3 den exactamente los valores de hoy, y que el diámetro adoptado de la hoja sea igual al del motor (hoy no lo es en la obra de tres derivaciones).
2. **Materiales completos:** una llave por artefacto, la llave general, tapón por boca taponada, 4 + 2 codos de subida. Hoy falla en las llaves: la prueba sirve para mostrar el arreglo.
3. **Obra sin decisiones manuales:** que una cañería sin ninguna confirmación del gasista dé "listo para descargar" y que no quede ninguna te sin contar.
4. **Guardado:** que una obra guardada con la versión de hoy se abra igual con las pantallas nuevas.
5. **Recorrido de pantalla de punta a punta** (con el navegador): cargar plano, escala, medidor, 4 artefactos, cañería y A3 habilitado. Contar los clics para no volver a crecer.

## 10. Recomendación

**(b) Rehacer solo las pantallas usando el motor actual.**

- **(a) Seguir con esta base:** es lo más barato al principio, pero cada arreglo pasa por un archivo de 12.000 líneas que ya creció a pesar de la regla. Riesgo: seguir sumando peso sin ganar simpleza.
- **(b) Pantallas nuevas sobre el motor y las láminas actuales:** se conserva lo que vale y está probado: cálculo, SIGAS, materiales, planilla, A3, rótulo y guardado. Hay que rehacer Artefactos, Recorrido (con el trazado "caño principal + bajadas") y "Revisá y descargá". Costo: mediano-grande, por partes y sin apagar lo viejo. Riesgo: bajo, si antes se agregan las pruebas del punto 9.
- **(c) Empezar de cero:** se tira el motor que hoy coincide con un plano presentado, más 439 comprobaciones. Costo: grande. Riesgo: alto, de volver a errores de cálculo ya resueltos.

---

### Qué no se pudo verificar
- El contenido del Excel exportado.
- El trazado a mano ("Conectar" e "Interpretar trazado"): visto en el código, no probado con clics.
- Cargar un plano en PDF y llevarlo a la lámina.
- La causa de la diferencia del diámetro adoptado entre pantalla y A3 en la obra de tres derivaciones.
- Si al rechazar una te se pierde su longitud equivalente. En materiales siguen apareciendo tes, pero no lo confirmé tramo por tramo.
