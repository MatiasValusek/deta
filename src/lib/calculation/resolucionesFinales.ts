import type { TechnicalCalculationResult } from "./technicalTree";

/**
 * Accesorios y reducciones con los que se calculó cada recorrido, con los diámetros que
 * quedan en el plano: los agrandados por el gasista si los hay y están validados; si no,
 * el mínimo por tabla. null si el cálculo todavía no está resuelto.
 */
export function resolucionesFinales(result: TechnicalCalculationResult | null) {
  const adopcion = result?.professionalDiameterAdoption;

  if (adopcion && adopcion.decisions.length > 0 && adopcion.status === "validated") {
    return {
      accesorios: adopcion.routeAccessoryResolutions,
      reducciones: adopcion.routeTransitionResolutions,
    };
  }

  const minimo = result?.transitionAwareNetworkSizing;

  if (minimo?.status === "resolved") {
    return {
      accesorios: minimo.routeAccessoryResolutions,
      reducciones: minimo.routeTransitionResolutions,
    };
  }

  return null;
}
