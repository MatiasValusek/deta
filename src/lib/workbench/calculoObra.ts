import type {
  DiameterTransitionDecision,
  DiameterTransitionProposal,
} from "@/lib/calculation/diameterTransitionProposals";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import type { PipeSystem } from "@/lib/calculation/pipeSystem";
import type { AdoptedDiameterDecision } from "@/lib/calculation/professionalDiameterAdoption";
import { DEFAULT_PROJECT_GAS_CONFIG, type ProjectGasConfig } from "@/lib/calculation/projectGas";
import { createTechnicalAdoptedDiameterValidation } from "@/lib/calculation/technicalAdoptedDiameterValidation";
import { createTechnicalAxonometricView } from "@/lib/calculation/technicalAxonometric";
import { createTechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import { createTechnicalEquivalentAccessoryVerification } from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import { createTechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import { createTechnicalPhysicalAccessoryInventory } from "@/lib/calculation/technicalPhysicalAccessories";
import type { TechnicalRouteTransitionResolution } from "@/lib/calculation/technicalRouteTransitions";
import {
  calculateTechnicalTree,
  type TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { AccessoryProposal } from "@/lib/routing/routeAccessoryProposals";
import type { ManualRouteNetwork } from "@/lib/routing/types";

/*
 * Cálculo de la obra, una sola vez y por un solo camino: lo usan la pantalla, las láminas
 * y las pruebas. Así el diámetro adoptado de cada tramo es el mismo en la pantalla, la
 * tabla SIGAS, la isométrica y los materiales.
 */

export const LARGO_MINIMO_TRAMO = 0.0001;

/** El cálculo del motor, con los diámetros que agrandó el gasista. */
export function calcularObra(params: {
  adoptedDiameterDecisions?: AdoptedDiameterDecision[];
  diameterTransitionDecisions?: DiameterTransitionDecision[];
  equipment: WorkbenchEquipment[];
  minSegmentLengthSource?: number;
  network: ManualRouteNetwork;
  scaleMetersPerSourceUnit: number | null;
}): TechnicalCalculationResult {
  return calculateTechnicalTree({
    adoptedDiameterDecisions: params.adoptedDiameterDecisions,
    diameterTransitionDecisions: params.diameterTransitionDecisions,
    equipment: params.equipment,
    minSegmentLengthSource: params.minSegmentLengthSource ?? LARGO_MINIMO_TRAMO,
    network: params.network,
    pipeSystem: SIGAS_PIPE_SYSTEM,
    projectGas: DEFAULT_PROJECT_GAS_CONFIG,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
  });
}

/** Planilla, piezas, materiales e isométrica, a partir del cálculo. */
export function armarResultadosObra(params: {
  accessoryProposals?: AccessoryProposal[];
  adoptedDiameterDecisions?: AdoptedDiameterDecision[];
  diameterTransitionProposals?: DiameterTransitionProposal[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pipeSystem?: PipeSystem;
  result: TechnicalCalculationResult | null;
  routeTransitionResolutions?: Record<string, TechnicalRouteTransitionResolution>;
  scaleMetersPerSourceUnit: number | null;
}) {
  const pipeSystem = params.pipeSystem ?? SIGAS_PIPE_SYSTEM;
  const calculationSheet = createTechnicalCalculationSheet({
    equipment: params.equipment,
    result: params.result,
    routeTransitionResolutions: params.routeTransitionResolutions,
  });
  const physicalAccessoryInventory = createTechnicalPhysicalAccessoryInventory({
    accessoryProposals: params.accessoryProposals,
    diameterTransitionProposals: params.diameterTransitionProposals,
    equipment: params.equipment,
    network: params.network,
    result: params.result,
    routeTransitionResolutions: params.routeTransitionResolutions,
  });
  const equivalentAccessoryVerificationBySegmentId =
    createTechnicalEquivalentAccessoryVerification({
      inventory: physicalAccessoryInventory,
      pipeSystem,
      result: params.result,
    });
  const adoptedDiameterValidation = createTechnicalAdoptedDiameterValidation({
    decisions: params.adoptedDiameterDecisions ?? [],
    equivalentVerificationBySegmentId: equivalentAccessoryVerificationBySegmentId,
    pipeSystem,
    result: params.result,
  });
  const materialTakeoff = createTechnicalMaterialTakeoff({
    accessoryProposals: params.accessoryProposals,
    adoptedDiameterValidation,
    diameterTransitionProposals: params.diameterTransitionProposals,
    physicalAccessoryInventory,
    result: params.result,
    routeTransitionResolutions: params.routeTransitionResolutions,
  });
  const axonometricView = createTechnicalAxonometricView({
    adoptedDiameterValidation,
    equipment: params.equipment,
    inventory: physicalAccessoryInventory,
    network: params.network,
    result: params.result,
    scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
  });

  return {
    adoptedDiameterValidation,
    axonometricView,
    calculationSheet,
    equivalentAccessoryVerificationBySegmentId,
    materialTakeoff,
    physicalAccessoryInventory,
  };
}

export type ResultadosObra = ReturnType<typeof armarResultadosObra>;

export const GAS_DE_LA_OBRA: ProjectGasConfig = DEFAULT_PROJECT_GAS_CONFIG;
