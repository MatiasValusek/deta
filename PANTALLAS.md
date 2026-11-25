# Plan de las pantallas nuevas

Base: `RELEVAMIENTO.md` (hoy, desde cero, son **70 clics** hasta el plano A3) y el motor como quedó después
de los arreglos: llaves, tes y codos los pone la app sola, y el diámetro adoptado es el mismo en pantalla,
A3, isométrica y materiales.

**Meta: 15 a 20 clics desde cero hasta tener las 3 hojas descargadas.** Escribir datos no cuenta como clic.

**Regla para todas las pantallas:** la app decide y muestra lo que decidió; el gasista corrige solo si quiere.
Ninguna pantalla frena por una decisión técnica. Si algo falta, el aviso dice qué pasa y qué hacer.

---

## Los 5 pasos

Arriba, siempre visible: **1 Datos de la obra · 2 Plano · 3 Artefactos · 4 Cañería · 5 Revisar y descargar**.
Cada paso muestra un tilde cuando está completo. Se puede volver a cualquier paso tocándolo.
Abajo a la derecha, siempre el mismo botón: **Siguiente**.

### 1. Datos de la obra

**Qué ve:** un solo formulario, en una columna.
- Propietario, calle y número, entre calles, localidad, partido.
- Plegado debajo: "Croquis de ubicación (para la factibilidad)": calle de atrás, metros a cada esquina, norte.
- Datos del gasista (nombre, matrícula, categoría): **se cargan una sola vez** y se reusan en cada obra.
  Quedan guardados aparte de la obra: "Nueva obra" no los borra. Las obras siguientes los traen cargados
  y se ven en una línea ("Instalador: … · Mat. …") con "Cambiar". Cambiarlos no toca las obras ya descargadas.

**Qué pedimos (lo mínimo):** propietario, calle y número, localidad. El resto se puede completar después;
en Revisar avisa qué falta para cada hoja.

**Qué resuelve sola la app:** guarda mientras se escribe, mayúsculas del rótulo, partido sugerido según
la localidad si ya se usó antes.

**Qué puede corregir:** todo, volviendo al paso.

**Clics:** 2 ("Nueva obra" y Siguiente). La primera vez, los datos del instalador son 3 campos más.

### 2. Plano

**Qué ve:** un recuadro grande "Subí el plano (DXF o PDF)". Al subirlo, la planta ocupa la pantalla.

**Qué pedimos:** el archivo.

**Qué resuelve sola la app:**
- **La escala.** Si el DXF dice sus unidades (casi siempre), la toma de ahí y muestra para confirmar con
  los ojos: "Escala tomada del archivo: la casa mide 10,00 × 8,00 m". Si el plano tiene cotas, las usa.
- Muestra solo las capas útiles (paredes, textos); las demás quedan ocultas pero no se borran.

**Cuando el archivo no trae la escala clara** (un PDF, o un DXF sin unidades o dibujado en otra unidad,
por ejemplo en cm o en metros cuando parece mm): la app no adivina. Muestra "Marcá una medida que conozcas"
y el gasista toca los dos extremos de una distancia conocida (una pared, una cota) y escribe cuánto mide,
en **metros**. La app muestra el resultado para confirmar con los ojos ("la casa mide 10,00 × 8,00 m").

**Qué puede corregir:** "La medida no es correcta" → el mismo marcado de arriba: dos puntos y la medida en
**metros** (no en milímetros como hoy). Capas: un botón "Capas" plegado.

**Clics:** 2 (subir + elegir archivo) + 1 (Siguiente) = **3**. Si hay que marcar la escala a mano: +3
(2 puntos + Confirmar; escribir la medida no cuenta).

### 3. Artefactos

**Qué ve:** la planta y, al costado, una fila de botones grandes con dibujo:
Medidor · Cocina · Horno · Calefón · Termotanque · Caldera · Estufa / Calefactor · Secarropas · Otro.

**Qué pedimos:** tocar el botón y tocar en el plano dónde va. El botón queda elegido: si hay dos estufas,
se toca la estufa una vez y se marcan las dos.

**Qué resuelve sola la app:**
- **Consumo típico precargado** por tipo (por ejemplo cocina 9.000 kcal/h, calefón 20.000 kcal/h,
  termotanque 6.500 kcal/h, estufa 3.000 kcal/h). Se ve en la tarjeta del artefacto.
- Altura de conexión típica por tipo, lado de salida y llave de paso: no se muestran.
- Numeración de artefactos (1, 2, 3…) en el orden que después usa el plano.

**Qué puede corregir:** tocando el artefacto aparece su tarjeta:
- consumo (se toca el número y se escribe, en kcal/h o m³/h);
- **"Boca taponada"** (un tilde) — sale en Referencias y lleva tapón en materiales;
- nombre ("Cocina comedor"), moverlo arrastrando, borrarlo.

**Clics:** al entrar al paso, **Medidor ya viene elegido** (siempre es lo primero): tocar el plano 1.
4 artefactos × 2 (botón + plano) = 8, + Siguiente 1 = **10**. Cada boca taponada +1.

### 4. Cañería

**Qué ve:** la planta con el medidor y los artefactos, y un mensaje: "Marcá por dónde va el caño principal".

**Qué pedimos:** el **caño principal**: sale solo del medidor; el gasista toca dónde dobla (si dobla) y
dónde termina. Una línea recta o con quiebres, pegada a una pared.

**Qué resuelve sola la app** (lo que el relevamiento llamó "caño principal + bajadas", en peine):
- baja una derivación en ángulo recto desde el caño principal a cada artefacto;
- pone las **tes** en cada derivación, los **codos** en cada giro, las **llaves** (general y una por
  artefacto), los codos de subida y bajada, y los tapones de las bocas taponadas;
- numera los tramos (M, A, B, C… 1, 2, 3) como en los planos presentados;
- calcula los diámetros y muestra cada tramo con su medida en el plano.

**Qué puede corregir:**
- arrastrar el caño principal entero (se mueve en paralelo);
- arrastrar el punto donde sale cada derivación sobre el caño principal;
- agregar o sacar un quiebre (tocar el caño y "Agregar quiebre");
- "Trazar a mano este tramo" para un caso raro (pared en el medio): se marcan los puntos.
- Si algo no cierra, aviso claro: "El caño a la caldera cruza otro caño. Arrastrá el punto de salida".

**Las piezas no frenan nunca.** Tes, codos y llaves los pone la app y no se piden confirmar ni rechazar.
Si el gasista cargó a mano un codo o una llave y no tiene posición en el corte, **se cuenta en el cálculo
y en materiales y listo**: no frena el paso ni la descarga. Solo queda sin dibujar en el corte (Modo experto).

**Clics, recontados con una casa de 2 esquinas** (el caño principal sale del medidor, dobla en las dos
esquinas y termina en la otra punta). Se cuenta cada punto que marca el gasista:

| Qué toca | Clics |
|---|---:|
| Primera esquina | 1 |
| Segunda esquina | 1 |
| Fin del caño principal | 1 |
| Siguiente (cierra el caño, no hace falta "Terminar") | 1 |
| **Total** | **4** |

Las bajadas a cada artefacto las pone la app: 0 clics. Si una bajada tiene que esquivar una pared,
+1 por cada quiebre que marque a mano. Con una casa recta (sin esquinas): 2 (fin + Siguiente).

### 5. Revisar y descargar

**Qué ve:**
- arriba, un resumen: "4 artefactos · 5,2 m³/h · 7 tramos · caño de 20 a 32";
- las **3 hojas en miniatura**: Factibilidad, Plano de instalación, Planilla de cálculo;
  tocando una se ve grande;
- **avisos** (si hay), cada uno con qué pasa y qué hacer, y un botón que lleva al paso:
  "Falta la calle de atrás para el croquis. Tocá *Datos de la obra*.";
- **avisos en lenguaje simple, arriba del botón de descarga** (nunca después): primero se leen, después
  se descarga. Cada aviso dice qué pasa y qué hacer, sin códigos ni palabras técnicas. Si no hay avisos,
  se ve "Todo listo para descargar";
- **"Agrandar para ampliación futura"** visible en esta pantalla, no en Modo experto: en la tabla de tramos,
  cada tramo tiene su medida y se puede agrandar (ver abajo);
- un botón grande: **Descargar las 3 hojas**.
- debajo de las hojas, chico: "Exportar materiales (Excel)" (cálculo y materiales en una planilla).

Los avisos no son decisiones técnicas: hablan de datos que faltan para una hoja ("Falta la calle de atrás
para el croquis") o de algo del dibujo ("El caño a la caldera cruza otro caño"). Ninguno pide elegir piezas.

**Qué pedimos:** nada. Si no hay avisos, descargar.

**Qué resuelve sola la app:** todo el cálculo SIGAS, materiales con marca y matrícula, rótulo, isométrica,
gabinete, planilla por tramo.

**Qué puede corregir:**
- "Agrandar un tramo" (para dejar prevista una ampliación, como hizo la gasista en el Plano Parcial):
  se toca el tramo en la tabla y se elige la medida. El motivo sale solo en la hoja.
- Agregar croquis al plano de instalación (un tilde).

**Clics:** 1 (Descargar las 3 hojas).

### Total desde cero

| Paso | Clics |
|---|---:|
| Datos de la obra | 2 |
| Plano | 3 |
| Artefactos (medidor + 4) | 10 |
| Cañería (casa de 2 esquinas) | 4 |
| Revisar y descargar | 1 |
| **Total** | **20** |

Contra los 70 de hoy. Si la escala no viene en el archivo: +3. Cada boca taponada: +1. Cada quiebre a mano
en una bajada: +1. Sin el Medidor elegido de entrada serían 21: por eso se elige solo.

---

## Modo experto

Un interruptor escondido en el menú de la obra ("Modo experto"). Apagado por defecto. Prendido, cada paso
muestra una sección más, al final y plegada:

| Va a Modo experto | Dónde estaba hoy |
|---|---|
| Cortes A-A, B-B y alturas de la cañería | Plano ("Agregar corte real") y pestañas de Recorrido |
| Alturas de conexión, lado de salida, "Invertir lado", anclaje a pared | Artefactos |
| Artefacto sin llave de paso | (nuevo) |
| Trazado automático por búsqueda (el de hoy) | Recorrido → "Generar recorrido" |
| Ayudas de dibujo: snap, ejes, vértices, muros, ortogonal, margen | Recorrido → Editar |
| Cambiar una pieza: te de reducción en vez de te normal + cupla, codo con rosca hembra, sacar o agregar una pieza | Revisar accesorios / Calcular |
| Tabla de cálculo completa (con todas las columnas) | Calcular |
| Isométrica de pantalla ("Axo") | Recorrido / Calcular |

**Se borra de las pantallas** (no va ni a Modo experto):
- "Exportar PDF" viejo (no es presentable, muestra códigos internos);
- paneles que nadie ve: diagnóstico, preparación de geometría, obstáculos, lectura de recintos;
- "Revisar accesorios" con Confirmar/Rechazar pieza por pieza (las piezas ya las pone la app);
- el paso **Calcular** como paso propio (lo útil pasa a Revisar y descargar);
- "Conexiones manuales" e "Interpretar trazado";
- los textos en inglés o de programador que listó el relevamiento.

---

## Orden de trabajo (pasos chicos, la app andando entre paso y paso)

Mientras dure el cambio, las pantallas nuevas se abren con "Nueva obra" y las viejas siguen disponibles en
"Pantallas anteriores". Cada paso termina con la app funcionando, las verificaciones en verde y un commit.

1. **Destrabar lo que hoy frena** (sin pantallas nuevas todavía): que la revisión no pida confirmar ni
   rechazar tes, codos ni llaves (ya los pone el motor) y que una pieza cargada a mano sin posición en el
   corte no bloquee el paso a calcular: se cuenta y listo (hoy pasa en la obra de tres derivaciones). Arreglar en la isométrica el "LL.P" del medidor que pisa el
   caño y los textos que se amontonan en tramos cortos (ver capturas en `docs/capturas/`).
2. **Barra de 5 pasos** con las pantallas viejas adentro. Ningún cambio de cálculo.
3. **Revisar y descargar** nuevo: las 3 hojas, avisos con botón al paso, "Descargar las 3 hojas".
   Primero este porque es lo que se entrega. Saca de la vista "Calcular" y el PDF viejo.
4. **Datos de la obra** como paso (hoy es una ventana): instalador guardado una vez.
5. **Plano**: escala leída del archivo, corrección en metros.
6. **Artefactos**: botones por tipo, consumos precargados, boca taponada.
7. **Cañería**: caño principal + bajadas, arrastrar para corregir. El trazado de hoy pasa a Modo experto.
8. **Modo experto**: juntar ahí lo de la tabla de arriba.
9. **Borrar** las pantallas viejas y lo que quedó sin uso. Recién acá se sacan "Pantallas anteriores".

Después de cada paso: prueba con navegador de punta a punta (abajo) y contar clics.

---

## Cómo partir los dos archivos grandes

`DxfWorkbench.tsx` (12.100 líneas) y `CalculationPanel.tsx` (5.000) no se parten primero: se van vaciando.
Cada pantalla nueva va en su archivo y toma del motor lo que necesita; lo viejo queda quieto hasta el paso 9,
donde se borra lo que nadie usa. Partir primero sería trabajo doble sobre código que después se tira.

Cómo queda al final, una carpeta por paso:

| Parte | Qué tiene | Sale de |
|---|---|---|
| La obra en curso | lo que se guarda y se abre (datos, plano, artefactos, cañería) y el cálculo una sola vez | el estado y el guardado de `DxfWorkbench.tsx`; el cálculo ya está en `workbench/calculoObra.ts` |
| Barra de pasos | los 5 pasos, tildes, Siguiente, Modo experto | la navegación de `DxfWorkbench.tsx` |
| Visor del plano | mostrar la planta, tocar, arrastrar | `DxfViewer.tsx` y `PdfViewer.tsx` (se reutilizan) |
| Paso Datos de la obra | el formulario | `components/obra/` (se reutiliza) |
| Paso Plano | subir, escala, capas | `CalibrationPanel.tsx`, `LayerPanel.tsx` |
| Paso Artefactos | botones, tarjeta del artefacto | `EquipmentPanel.tsx`, `EquipmentOverlay.tsx` |
| Paso Cañería | caño principal + bajadas, arrastrar | nuevo; dibujo de `RouteOverlay.tsx` |
| Paso Revisar y descargar | hojas, avisos, descarga, agrandar tramo | `PlanoInstalacionPreview.tsx`, `FactibilidadPreview.tsx`, `PlanillaTramosPreview.tsx`, `AgrandarDiametroPanel.tsx` |
| Modo experto | cortes, alturas, cambiar piezas, trazado automático, tabla completa | lo que sirva de `CalculationPanel.tsx`, `RoutePanel.tsx` y los dibujos de cortes |

Ningún archivo nuevo pasa de unas 400 líneas. El motor (`lib/calculation`) no se toca.

---

## Prueba con navegador de punta a punta

Con Playwright (una herramienta que maneja el navegador sola). Hay que sumarla al proyecto.
Usa la **casa desde cero** (datos inventados): el mismo plano de 10 × 8 m, el medidor y los 4 artefactos de
`workbench/obraCasaDesdeCero.ts`.

Lo que hace, como un gasista:
1. Abre la app con el guardado vacío y toca "Nueva obra".
2. **Datos de la obra:** escribe propietario, calle, número, localidad. Siguiente.
3. **Plano:** sube el DXF de la casa (hay que guardarlo con las pruebas; hoy la casa existe solo como datos). Controla que diga
   "la casa mide 10,00 × 8,00 m". Siguiente.
4. **Artefactos:** medidor, estufa, cocina, calefón y calefactor en sus puntos del plano. Controla los
   consumos precargados. Siguiente.
5. **Cañería:** marca el fin del caño principal (y la esquina). Controla que aparezcan 4 bajadas y los
   tramos numerados. Siguiente.
6. **Revisar y descargar:** controla que no haya avisos y descarga las 3 hojas.

Qué controla al final:
- que se descargaron 3 archivos PDF;
- que la tabla "Cálculo cañería SIGAS" de la hoja da lo mismo que la foto de la casa desde cero en
  `workbench/redDeSeguridadVerification.ts` (mismos tramos, longitudes y diámetros);
- que materiales trae 3 tes, 5 llaves y el codo de la esquina;
- **que no pasó de 20 clics** (la prueba los cuenta y falla si se pasa).

Se corre a mano antes de cada commit de pantallas (`npm run prueba-navegador`) y no reemplaza las
verificaciones del motor.
