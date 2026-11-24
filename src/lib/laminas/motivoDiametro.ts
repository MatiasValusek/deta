import type { TechnicalCalculationSheetRow } from "@/lib/calculation/technicalCalculationSheet";

/*
 * Motivo, con palabras del oficio, de por qué el diámetro adoptado es mayor que el de tabla.
 * Solo lee la fila del cálculo; no calcula nada.
 * - El gasista lo agrandó (Agrandar para ampliación futura).
 * - La app lo subió porque con las piezas de reducción la longitud total pide más diámetro.
 */
export const MOTIVO_AMPLIACION = "Previsto para ampliación";
export const MOTIVO_REDUCCIONES = "Por longitud equivalente de reducciones";

type Fila = Pick<
  TechnicalCalculationSheetRow,
  "adoptedDiameter" | "calculatedDiameter" | "effectiveDiameter"
>;

export function motivoDiametroAdoptado(fila: Fila): string | null {
  const tabla = fila.calculatedDiameter?.externalDiameterMillimeters;
  const adoptado = fila.effectiveDiameter?.externalDiameterMillimeters;

  if (tabla === undefined || adoptado === undefined || adoptado <= tabla) {
    return null;
  }

  return fila.adoptedDiameter ? MOTIVO_AMPLIACION : MOTIVO_REDUCCIONES;
}
