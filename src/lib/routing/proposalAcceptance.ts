import type { AutomaticRouteProposal } from "@/lib/routing/types";
import {
  hasDuplicateNodeIds,
  hasDuplicateSegmentIds,
  hasSegmentsWithMissingEndpoints,
} from "@/lib/routing/network";

export function routeProposalCanBeAccepted(
  proposal: AutomaticRouteProposal,
  requiredApplianceCount: number,
  isOutdated = false,
) {
  return (
    routeProposalAcceptanceBlockReason(
      proposal,
      requiredApplianceCount,
      isOutdated,
    ) === null
  );
}

export function routeProposalAcceptanceBlockReason(
  proposal: AutomaticRouteProposal,
  requiredApplianceCount: number,
  isOutdated = false,
) {
  if (isOutdated) {
    return "La propuesta esta desactualizada. Regenerala antes de aceptar.";
  }

  if (!proposalConnectsAllRequiredAppliances(proposal, requiredApplianceCount)) {
    return `La propuesta conecta ${proposal.reachedEquipmentIds.length} de ${requiredApplianceCount} artefactos.`;
  }

  return proposalTopologyBlockReason(proposal);
}

export function proposalConnectsAllRequiredAppliances(
  proposal: AutomaticRouteProposal,
  requiredApplianceCount: number,
) {
  return (
    requiredApplianceCount > 0 &&
    proposal.reachedEquipmentIds.length === requiredApplianceCount &&
    proposal.unreachedEquipmentIds.length === 0
  );
}

function proposalTopologyBlockReason(proposal: AutomaticRouteProposal) {
  const validation = proposal.validation;
  const network = {
    nodes: proposal.nodes,
    segments: proposal.segments,
  };

  if (hasDuplicateNodeIds(network)) {
    return "La propuesta contiene nodos duplicados.";
  }

  if (hasDuplicateSegmentIds(network)) {
    return "La propuesta contiene tramos duplicados.";
  }

  if (hasSegmentsWithMissingEndpoints(network)) {
    return "La propuesta contiene tramos con extremos inexistentes.";
  }

  if (!validation.appliancesTerminal) {
    return "Cada artefacto debe quedar como terminal.";
  }

  if (!validation.connectedToSupply) {
    return "La red debe quedar conectada al medidor.";
  }

  if (validation.hasCrossingsWithoutNode) {
    return "La propuesta contiene cruces sin nodo.";
  }

  if (validation.hasCycle) {
    return "La propuesta contiene un ciclo.";
  }

  if (validation.hasDuplicateSegments) {
    return "La propuesta duplica un tramo existente.";
  }

  if (validation.hasZeroLengthSegments) {
    return "La propuesta contiene un tramo sin longitud.";
  }

  if (validation.restrictionCount > 0) {
    return "La propuesta incumple restricciones activas.";
  }

  return null;
}
