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
- [ ] **Planilla de accesorios por tramo** igual a la hoja "Cal. Artefactos" del Excel.
- [ ] **Lámina "Factibilidad" A3:** planta + croquis + rótulo.
- [ ] Croquis de ubicación simple: manzana, calles (4 nombres), distancias a esquina, norte.
- [ ] Tabla Referencias con numeración de artefactos y "boca taponada".

## Fase 2 — Flujo simple de 5 pasos
- [ ] Pasos visibles: Datos de la obra → Plano → Artefactos → Cañería → Revisar y descargar.
- [ ] Resolución automática de accesorios, transiciones y familias (opción compatible por defecto).
- [ ] "Modo experto" que agrupe: decisiones de accesorios/transiciones, cortes y alturas,
      anclaje a paredes, propuesta automática de recorrido.
- [ ] Numeración automática de tramos con letras/números como en los planos reales.
- [ ] Consumos típicos precargados por artefacto (cocina, calefactor TB, termotanque,
      calefón, caldera, horno), editables.
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
