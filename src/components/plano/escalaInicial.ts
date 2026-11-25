import type { SourceCalibrationState } from "@/components/dxf-workbench/CalibrationPanel";
import type { NormalizedDrawing } from "@/lib/geometry/types";
import { escalaDelArchivo } from "@/lib/plano/escalaDelArchivo";

/**
 * Escala con la que arranca un plano recién subido: la del archivo si se puede leer y da una
 * casa creíble; si no (un PDF, un DXF sin unidades), queda lista para marcar dos puntos.
 */
export function estadoDeEscalaInicial(drawing: NormalizedDrawing | null): SourceCalibrationState {
  const escala = drawing ? escalaDelArchivo({ bounds: drawing.bounds, units: drawing.units }) : null;
  return {
    calibration: escala?.tipo === "tomada" ? escala.calibration : null,
    draft: { distanceOriginal: "", points: [], status: "pending", unit: "m" },
    error: null,
    measurementPoints: [],
    toolMode: escala?.tipo === "tomada" ? "idle" : "calibrate",
  };
}
