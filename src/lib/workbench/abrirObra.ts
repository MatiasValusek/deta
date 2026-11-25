import {
  createSigasAccessorySelectionDiameterIndex,
  reconcileSigasAccessoryExactCatalogRows,
} from "@/lib/calculation/pipeSystems/sigas/sigasAccessoryExactSelection";
import type { AdoptedDiameterDecision } from "@/lib/calculation/professionalDiameterAdoption";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  detectRouteAccessoryProposals,
  reconcileRouteAccessoryProposalState,
  type AccessoryProposalDecision,
} from "@/lib/routing/routeAccessoryProposals";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import { calcularObra } from "./calculoObra";

/*
 * Lo que hace la pantalla con la cañería al abrir una obra: reconcilia las piezas propuestas
 * con las decisiones guardadas y ajusta las filas SIGAS de las piezas cargadas a mano. Es el
 * mismo camino que los efectos de la pantalla, para poder probar que guardar y volver a abrir
 * no cambia ningún número. Las piezas confirmadas por el gasista se respetan; la app solo
 * completa lo que falta.
 */
export function asentarObraAlAbrir(params: {
  adoptedDiameterDecisions: AdoptedDiameterDecision[];
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  routeAccessoryProposalDecisions: AccessoryProposalDecision[];
  scaleMetersPerSourceUnit: number;
}) {
  let network = params.network;
  let decisions = params.routeAccessoryProposalDecisions;

  // Como la pantalla, se repite hasta que nada cambie (dos vueltas alcanzan).
  for (let vuelta = 0; vuelta < 3; vuelta += 1) {
    const result = calcularObra({ ...params, network });
    const finales =
      result.transitionAwareNetworkSizing?.status === "resolved"
        ? result.transitionAwareNetworkSizing.finalDiameterBySegmentId
        : result.networkSizing?.finalDiameterBySegmentId ?? {};
    const diametros = new Map<string, PipeDiameterReference>(Object.entries(finales));
    const reconciliada = reconcileRouteAccessoryProposalState({
      decisions,
      network,
      proposals: detectRouteAccessoryProposals({
        decisions,
        diameterBySegmentId: diametros as never,
        equipment: params.equipment,
        network,
        scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit,
      }),
    });
    const conFilas = reconcileSigasAccessoryExactCatalogRows({
      diameterBySegmentId: createSigasAccessorySelectionDiameterIndex({
        adoptedDiameterDecisions: params.adoptedDiameterDecisions,
        diameterBySegmentId: diametros,
        result,
      }),
      network: reconciliada.network,
    });

    if (conFilas === network && reconciliada.decisions.length === decisions.length) {
      break;
    }

    network = conFilas;
    decisions = reconciliada.decisions;
  }

  return { network, routeAccessoryProposalDecisions: decisions };
}
