# Deta — guía para trabajar en este proyecto

## Qué es Deta
Una app para **gasistas matriculados** que no manejan AutoCAD ni programas de punta.
El gasista sube el plano de la casa, ubica el medidor y los artefactos, traza la cañería
y **descarga lo que presenta en la distribuidora**, listo y prolijo.

> Simple para el que la usa. Profesional en lo que entrega.

## Lo que la app TIENE que producir (el norte)
Todo cambio se mide contra esto. Si algo no ayuda a producir estas hojas, no es prioridad.

1. **Factibilidad (A3):** planta + croquis de ubicación + rótulo.
2. **Plano de instalación (A3):** planta con la traza en rojo y tramos numerados
   (1, 2, A, B… M = medidor), isométrica, croquis de ubicación, detalle del gabinete
   del medidor (50×40×30), tabla de **Referencias** (artefacto, kcal/h, m³/h,
   boca taponada), tabla de **Materiales** (caño, accesorios, llaves de paso; marca y
   matrícula), tabla de **Cálculo cañería SIGAS** (tramo, long. real, long. equivalente,
   long. total, consumo m³/h, diámetro según tabla, diámetro adoptado) y **rótulo**.
3. **Planilla de cálculo:** por cada tramo, accesorios contados por diámetro
   (uniones, codos, tes, llave esférica, reducciones, transiciones) y su longitud equivalente.

**Rótulo:** "INSTALACIÓN PARA GAS NATURAL", propietario, calle y número, entre calles,
localidad, partido, instalador, matrícula y categoría, firmas de propietario e instalador.

### Referencia real del formato
Trabajos reales ya presentados en `C:\Users\matia\OneDrive\Documentos\cata\`
(PDF del plano parcial, cálculos parcial, factibilidad y el Excel `CALCULOS (2).xlsx`).
**Son datos reales de clientes:** usarlos solo como referencia de formato y para comparar
resultados. No copiar nombres, direcciones ni matrículas al código, a los tests ni a git.
`_material-prueba/` está en `.gitignore` y debe seguir así.

## El flujo (5 pasos, nada más)
1. **Datos de la obra** — propietario, dirección, localidad. Los datos del instalador se guardan una vez.
2. **Subí el plano** — DXF o PDF, y marcá una medida conocida (escala).
3. **Ubicá medidor y artefactos** — consumos típicos precargados; opción "boca taponada".
4. **Trazá la cañería** — la app numera los tramos sola. Cortes y alturas: opcionales.
5. **Revisá y descargá** — vista previa de las 3 hojas; avisos en lenguaje claro.

## Reglas
- **No agregar más precisión al motor de cálculo.** Ya reproduce el método del gasista. Congelado salvo bugs.
- **La app decide por defecto.** Accesorios, transiciones y familias se resuelven solos con
  la opción compatible. Los ajustes finos van a un **"Modo experto"** escondido.
- **Hablar como gasista, no como programador.** Ver glosario. Nunca mostrar IDs, "compounds",
  "recorrido gobernante", "empate", "familia técnica", "preview", etc.
- **Textos con tildes y ortografía correcta** (Diámetro, Cañería, Cálculo, Instalación).
- **Un aviso = qué pasa + qué hacer.** Ej: "Falta ubicar el medidor. Tocá *Medidor* y marcalo en el plano."
- **Archivos chicos.** No sumar código a `DxfWorkbench.tsx` (~11.300 líneas) ni a
  `CalculationPanel.tsx` (~4.900). Lo nuevo va en archivos propios por paso; al tocar
  un paso existente, sacarlo a su archivo.
- Antes de terminar una tarea: `npm run typecheck` sin errores.
- Commits chicos, uno por cambio entendible.

## Glosario (pantalla → no usar)
| Decir | No decir |
|---|---|
| Plano / Planta | Base, source, DXF base |
| Escala | Calibración, millimetersPerSourceUnit |
| Artefacto | Equipment, appliance, terminal |
| Medidor | Supply, meter_regulator |
| Cañería / traza | Network, route, polyline |
| Tramo | Segment, edge |
| Consumo (kcal/h, m³/h) | Demand |
| Diámetro adoptado | Diámetro efectivo, diámetro final con transiciones |
| Longitud equivalente | Equiv. transiciones, equiv. compounds |
| Boca taponada | — |
| Corte (opcional) | Section registration, vínculo planta-corte |

## Mapa del código
- `src/components/dxf-workbench/` — interfaz (todo vive hoy en `DxfWorkbench.tsx`).
- `src/lib/calculation/` — motor SIGAS, materiales, axonométrica, PDF y Excel. **Reutilizar.**
- `src/lib/calculation/pipeSystems/sigas/` — tablas y accesorios SIGAS.
- `src/lib/equipment/`, `src/lib/routing/` — artefactos y trazado.
- `src/lib/sections/` — cortes y alturas (pasa a opcional / modo experto).
- `src/lib/workbench/` — etapas del flujo y guardado.

Plan de trabajo: ver `PLAN.md`.
