import type { AdoptedDiameterDecision } from "@/lib/calculation/professionalDiameterAdoption";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { crearTablasPlano, type TablasPlano } from "@/lib/laminas/tablasPlano";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { armarResultadosObra, calcularObra, GAS_DE_LA_OBRA } from "./calculoObra";
import { CANERIA_CASA, ARTEFACTOS_CASA, ESCALA_CASA_M_POR_UNIDAD } from "./obraCasaDesdeCero";
import { ARTEFACTOS_EJEMPLO, CANERIA_EJEMPLO } from "./obraEjemplo";
import {
  ADOPTADOS_PRUEBA,
  ARTEFACTOS_PRUEBA,
  CANERIA_PRUEBA,
} from "./obraPruebaTresDerivaciones";

/** Las tres obras de prueba, sin datos de clientes. Solo para las verificaciones. */
export type ObraDePrueba = {
  nombre: "ejemplo" | "tres derivaciones" | "casa desde cero";
  adoptedDiameterDecisions: AdoptedDiameterDecision[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  scaleMetersPerSourceUnit: number;
};

export const OBRAS_DE_PRUEBA: ObraDePrueba[] = [
  {
    adoptedDiameterDecisions: [],
    equipment: ARTEFACTOS_EJEMPLO,
    network: CANERIA_EJEMPLO,
    nombre: "ejemplo",
    scaleMetersPerSourceUnit: 0.001,
  },
  {
    adoptedDiameterDecisions: ADOPTADOS_PRUEBA,
    equipment: ARTEFACTOS_PRUEBA,
    network: CANERIA_PRUEBA,
    nombre: "tres derivaciones",
    scaleMetersPerSourceUnit: 0.001,
  },
  {
    adoptedDiameterDecisions: [],
    equipment: ARTEFACTOS_CASA,
    network: CANERIA_CASA,
    nombre: "casa desde cero",
    scaleMetersPerSourceUnit: ESCALA_CASA_M_POR_UNIDAD,
  },
];

/** Calcula la obra por el mismo camino que la pantalla y arma las tablas del A3. */
export function calcularObraDePrueba(obra: ObraDePrueba) {
  const result = calcularObra(obra);
  const resultados = armarResultadosObra({ ...obra, result });
  const tablas: TablasPlano = crearTablasPlano({
    calculationSheet: resultados.calculationSheet,
    equipment: obra.equipment,
    materialTakeoff: resultados.materialTakeoff,
    network: obra.network,
    projectGas: GAS_DE_LA_OBRA,
    result,
  });

  return { ...resultados, result, tablas };
}
