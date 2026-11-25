import type { TechnicalCalculationSheetRow } from "@/lib/calculation/technicalCalculationSheet";

/*
 * Motivo, con palabras del oficio, de por qué el diámetro adoptado es mayor que el de tabla.
 * Solo lee la fila del cálculo; no calcula nada. Tiene que ser siempre el motivo real:
 * - El gasista lo agrandó (Agrandar para ampliación futura).
 * - La app lo subió porque con las piezas de reducción la longitud total pide más diámetro
 *   (el motor lo comprobó: con un escalón menos la tabla no alcanza).
 * - La app lo subió porque no pudo contar una pieza con el diámetro más chico. No debería
 *   pasar (ver causaDelAumento.ts); si pasa, la hoja lo dice y la pantalla avisa.
 * - Cualquier otro caso: lo subió el cálculo de la red, sin inventar otra razón.
 */
export const MOTIVO_AMPLIACION = "Previsto para ampliación";
export const MOTIVO_REDUCCIONES = "Por longitud equivalente de reducciones";
export const MOTIVO_PIEZA_SIN_CONTAR = "Por seguridad: pieza sin contar";
export const MOTIVO_CALCULO_DE_RED = "Por el cálculo de la red";

type Fila = Pick<
  TechnicalCalculationSheetRow,
  "adoptedDiameter" | "calculatedDiameter" | "effectiveDiameter" | "enlargementCause"
>;

export function motivoDiametroAdoptado(fila: Fila): string | null {
  const tabla = fila.calculatedDiameter?.externalDiameterMillimeters;
  const adoptado = fila.effectiveDiameter?.externalDiameterMillimeters;

  if (tabla === undefined || adoptado === undefined || adoptado <= tabla) {
    return null;
  }

  if (fila.adoptedDiameter) {
    return MOTIVO_AMPLIACION;
  }

  switch (fila.enlargementCause) {
    case "longitud_equivalente":
      return MOTIVO_REDUCCIONES;
    case "pieza_sin_contar":
      return MOTIVO_PIEZA_SIN_CONTAR;
    default:
      return MOTIVO_CALCULO_DE_RED;
  }
}
