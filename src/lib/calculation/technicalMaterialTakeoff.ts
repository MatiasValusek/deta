import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type {
  TechnicalRouteAccessoryContribution,
  TechnicalRouteAccessoryResolution,
} from "@/lib/calculation/technicalRouteAccessories";
import type {
  TechnicalRouteTransitionContribution,
  TechnicalRouteTransitionResolution,
} from "@/lib/calculation/technicalRouteTransitions";
import type {
  DiameterTransitionKind,
  DiameterTransitionProposal,
} from "@/lib/calculation/diameterTransitionProposals";
import type { AccessoryProposal } from "@/lib/routing/routeAccessoryProposals";
import type {
  RouteAccessoryType,
} from "@/lib/routing/types";
import type {
  TechnicalCalculationResult,
  TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";

export type TechnicalMaterialTakeoffStatus =
  | "pending"
  | "resolved"
  | "unavailable";

export type TechnicalMaterialQuantityDomain =
  | "calculation"
  | "physical_material";

export type TechnicalMaterialAccessoryKind =
  | "elbow"
  | "other"
  | "reduced_tee"
  | "reduction"
  | "tee"
  | "valve";

export type TechnicalMaterialPendingCategory =
  | "accessory"
  | "adoption"
  | "pipe"
  | "transition";

export type TechnicalMaterialPipeItem = {
  diameter: PipeDiameterReference;
  diameterKey: string;
  kind: "pipe";
  label: string;
  physicalLengthMeters: number;
  quantityDomain: "physical_material";
  segmentCount: number;
  segmentIds: string[];
};

export type TechnicalMaterialAccessoryItem = {
  accessoryKind: TechnicalMaterialAccessoryKind;
  catalogCode?: string;
  configurationKey: string;
  familyId: string;
  kind: "accessory";
  label: string;
  quantity: number;
  quantityDomain: "physical_material";
  source:
    | "compound_transition"
    | "diameter_transition"
    | "mixed"
    | "route_accessory";
  sourceIds: string[];
};

export type TechnicalMaterialPendingItem = {
  category: TechnicalMaterialPendingCategory;
  code:
    | "accessory_confirmation_pending"
    | "branch_transition_pending"
    | "compound_transition_pending"
    | "diameter_effective_validation_pending"
    | "diameter_transition_pending"
    | "physical_length_pending"
    | "route_accessory_unresolved";
  countAsMaterial: false;
  label: string;
  reason: string;
  segmentId?: string;
  sourceId?: string;
  transitionId?: string;
};

export type TechnicalMaterialTakeoff = {
  calculationQuantities: {
    routeAccessoryEquivalentLengthMetersByRouteId: Record<string, number | null>;
    routeTransitionEquivalentLengthMetersByRouteId: Record<string, number | null>;
    segmentSizingLengthMetersBySegmentId: Record<string, number | null>;
  };
  pendingItems: TechnicalMaterialPendingItem[];
  pendingSummary: {
    accessoryCount: number;
    adoptionCount: number;
    pipeCount: number;
    total: number;
    transitionCount: number;
  };
  physicalMaterialQuantities: {
    accessoryQuantity: number;
    pipeLengthMeters: number;
    pipeSegmentCount: number;
  };
  pipeItems: TechnicalMaterialPipeItem[];
  accessoryItems: TechnicalMaterialAccessoryItem[];
  status: TechnicalMaterialTakeoffStatus;
};

type AccessoryDraft = Omit<
  TechnicalMaterialAccessoryItem,
  "kind" | "quantityDomain" | "sourceIds"
> & {
  sourceId: string;
};

type TransitionPiece = {
  contribution: TechnicalRouteTransitionContribution | null;
  hasMaterial: boolean;
  pendingReasons: string[];
  pieceKey: string;
};

type EffectiveDiameterResolution =
  | {
      diameter: PipeDiameterReference;
      status: "resolved";
    }
  | {
      reason: string;
      status: "pending";
    };

export function createTechnicalMaterialTakeoff(params: {
  accessoryProposals?: AccessoryProposal[];
  diameterTransitionProposals?: DiameterTransitionProposal[];
  result: TechnicalCalculationResult | null;
  routeTransitionResolutions?: Record<string, TechnicalRouteTransitionResolution>;
}): TechnicalMaterialTakeoff {
  if (!params.result) {
    return createEmptyTakeoff("unavailable");
  }

  const routeAccessoryResolutions =
    selectRouteAccessoryResolutions(params.result);
  const routeTransitionResolutions =
    params.routeTransitionResolutions ??
    selectRouteTransitionResolutions(params.result);
  const pendingItems: TechnicalMaterialPendingItem[] = [];
  const pipeItems = createPipeItems({
    pendingItems,
    result: params.result,
  });
  const accessoryItems = createAccessoryItems({
    accessoryProposals: params.accessoryProposals ?? [],
    diameterTransitionProposals: params.diameterTransitionProposals ?? [],
    pendingItems,
    routeAccessoryResolutions,
    routeTransitionResolutions,
  });
  const dedupedPendingItems = dedupePendingItems(pendingItems);

  return {
    calculationQuantities: {
      routeAccessoryEquivalentLengthMetersByRouteId:
        mapRouteAccessoryEquivalentLengths(routeAccessoryResolutions),
      routeTransitionEquivalentLengthMetersByRouteId:
        mapRouteTransitionEquivalentLengths(routeTransitionResolutions),
      segmentSizingLengthMetersBySegmentId:
        mapSegmentSizingLengths(params.result),
    },
    pendingItems: dedupedPendingItems,
    pendingSummary: createPendingSummary(dedupedPendingItems),
    physicalMaterialQuantities: {
      accessoryQuantity: accessoryItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      pipeLengthMeters: pipeItems.reduce(
        (sum, item) => sum + item.physicalLengthMeters,
        0,
      ),
      pipeSegmentCount: pipeItems.reduce(
        (sum, item) => sum + item.segmentCount,
        0,
      ),
    },
    pipeItems,
    accessoryItems,
    status:
      dedupedPendingItems.length > 0
        ? "pending"
        : pipeItems.length > 0 || accessoryItems.length > 0
          ? "resolved"
          : "unavailable",
  };
}

function createPipeItems(params: {
  pendingItems: TechnicalMaterialPendingItem[];
  result: TechnicalCalculationResult;
}) {
  const byDiameterKey = new Map<string, TechnicalMaterialPipeItem>();

  for (const segment of sortSegments(params.result.segments)) {
    const diameterResolution = resolveEffectiveDiameterForSegment(
      params.result,
      segment,
    );

    if (diameterResolution.status === "pending") {
      params.pendingItems.push({
        category: "adoption",
        code: "diameter_effective_validation_pending",
        countAsMaterial: false,
        label: `Diametro efectivo pendiente en tramo ${segment.segmentId}`,
        reason: diameterResolution.reason,
        segmentId: segment.segmentId,
        sourceId: segment.segmentId,
      });
      continue;
    }

    if (
      segment.segmentPhysicalLengthMeters === null ||
      !Number.isFinite(segment.segmentPhysicalLengthMeters)
    ) {
      params.pendingItems.push({
        category: "pipe",
        code: "physical_length_pending",
        countAsMaterial: false,
        label: `Longitud fisica pendiente en tramo ${segment.segmentId}`,
        reason: "Falta longitud fisica del tramo para computar cañeria.",
        segmentId: segment.segmentId,
        sourceId: segment.segmentId,
      });
      continue;
    }

    const diameterKey = pipeDiameterKey(diameterResolution.diameter);
    const current = byDiameterKey.get(diameterKey);

    if (current) {
      current.physicalLengthMeters += segment.segmentPhysicalLengthMeters;
      current.segmentCount += 1;
      current.segmentIds.push(segment.segmentId);
      current.segmentIds.sort();
      continue;
    }

    byDiameterKey.set(diameterKey, {
      diameter: diameterResolution.diameter,
      diameterKey,
      kind: "pipe",
      label: `Caño ${formatDiameterSymbol(diameterResolution.diameter)}`,
      physicalLengthMeters: segment.segmentPhysicalLengthMeters,
      quantityDomain: "physical_material",
      segmentCount: 1,
      segmentIds: [segment.segmentId],
    });
  }

  return [...byDiameterKey.values()].sort(comparePipeItems);
}

function createAccessoryItems(params: {
  accessoryProposals: AccessoryProposal[];
  diameterTransitionProposals: DiameterTransitionProposal[];
  pendingItems: TechnicalMaterialPendingItem[];
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
}) {
  const byItemKey = new Map<string, TechnicalMaterialAccessoryItem>();

  addRouteAccessoryItems({
    byItemKey,
    pendingItems: params.pendingItems,
    routeAccessoryResolutions: params.routeAccessoryResolutions,
  });
  addTransitionAccessoryItems({
    byItemKey,
    pendingItems: params.pendingItems,
    routeTransitionResolutions: params.routeTransitionResolutions,
  });
  addPendingAccessoryProposals(params.accessoryProposals, params.pendingItems);
  addPendingTransitionProposals(
    params.diameterTransitionProposals,
    params.pendingItems,
  );

  return [...byItemKey.values()].sort(compareAccessoryItems);
}

function addRouteAccessoryItems(params: {
  byItemKey: Map<string, TechnicalMaterialAccessoryItem>;
  pendingItems: TechnicalMaterialPendingItem[];
  routeAccessoryResolutions: Record<string, TechnicalRouteAccessoryResolution>;
}) {
  const contributionByPhysicalKey = new Map<
    string,
    {
      contribution: TechnicalRouteAccessoryContribution | null;
      pendingReasons: string[];
    }
  >();

  for (const resolution of sortRouteAccessoryResolutions(
    params.routeAccessoryResolutions,
  )) {
    for (const contribution of sortRouteAccessoryContributions(
      resolution.contributions,
    )) {
      const physicalKey = routeAccessoryPhysicalKey(contribution);
      const current =
        contributionByPhysicalKey.get(physicalKey) ?? {
          contribution: null,
          pendingReasons: [],
        };

      if (contribution.status === "resolved") {
        current.contribution = current.contribution ?? contribution;
      } else {
        current.pendingReasons.push(
          contribution.reason ??
            "Accesorio confirmado pendiente de resolucion tecnica.",
        );
      }

      contributionByPhysicalKey.set(physicalKey, current);
    }
  }

  for (const [physicalKey, entry] of [...contributionByPhysicalKey.entries()].sort(
    ([first], [second]) => first.localeCompare(second),
  )) {
    if (entry.pendingReasons.length > 0 || !entry.contribution) {
      const contribution = entry.contribution;

      params.pendingItems.push({
        category: "accessory",
        code: "route_accessory_unresolved",
        countAsMaterial: false,
        label: `Accesorio pendiente ${physicalKey}`,
        reason:
          entry.pendingReasons[0] ??
          "No se pudo resolver tecnicamente el accesorio confirmado.",
        segmentId: contribution?.ownerSegmentId,
        sourceId: physicalKey,
      });
      continue;
    }

    addAccessoryDraft(params.byItemKey, routeAccessoryDraft(entry.contribution));
  }
}

function addTransitionAccessoryItems(params: {
  byItemKey: Map<string, TechnicalMaterialAccessoryItem>;
  pendingItems: TechnicalMaterialPendingItem[];
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
}) {
  const pieceByKey = new Map<string, TransitionPiece>();

  for (const resolution of sortRouteTransitionResolutions(
    params.routeTransitionResolutions,
  )) {
    for (const contribution of sortRouteTransitionContributions(
      resolution.contributions,
    )) {
      const pieceKey = transitionPieceKey(contribution);

      if (!pieceKey) {
        continue;
      }

      const current =
        pieceByKey.get(pieceKey) ?? {
          contribution: null,
          hasMaterial: false,
          pendingReasons: [],
          pieceKey,
        };

      if (contribution.status === "inactive" || contribution.source === "not_required") {
        pieceByKey.set(pieceKey, current);
        continue;
      }

      if (contribution.status === "resolved" && contribution.source === "pipe_system") {
        current.contribution = current.contribution ?? contribution;
        current.hasMaterial = true;
      } else {
        current.pendingReasons.push(
          contribution.reason ??
            "Transicion pendiente de resolucion tecnica.",
        );
      }

      pieceByKey.set(pieceKey, current);
    }
  }

  for (const piece of [...pieceByKey.values()].sort((first, second) =>
    first.pieceKey.localeCompare(second.pieceKey),
  )) {
    if (!piece.hasMaterial && piece.pendingReasons.length === 0) {
      continue;
    }

    if (piece.pendingReasons.length > 0 || !piece.contribution) {
      params.pendingItems.push({
        category: "transition",
        code: pendingCodeForTransitionKind(
          piece.contribution?.transitionKind ?? "unresolved",
          piece.contribution?.compoundComponent ?? null,
        ),
        countAsMaterial: false,
        label: `Transicion pendiente ${piece.pieceKey}`,
        reason:
          piece.pendingReasons[0] ??
          "No se pudo resolver la pieza fisica de transicion.",
        sourceId: piece.pieceKey,
        transitionId: piece.contribution?.transitionId,
      });
      continue;
    }

    addAccessoryDraft(
      params.byItemKey,
      transitionAccessoryDraft(piece.contribution),
    );
  }
}

function addPendingAccessoryProposals(
  proposals: AccessoryProposal[],
  pendingItems: TechnicalMaterialPendingItem[],
) {
  for (const proposal of [...proposals].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    if (
      proposal.state !== "proposed" &&
      proposal.state !== "needs_review"
    ) {
      continue;
    }

    if (proposal.kind === "straight" || proposal.kind === "terminal") {
      continue;
    }

    pendingItems.push({
      category: "accessory",
      code: "accessory_confirmation_pending",
      countAsMaterial: false,
      label: `${accessoryProposalKindLabel(proposal.kind)} pendiente en nodo ${proposal.nodeId}`,
      reason: proposal.reason,
      sourceId: proposal.id,
    });
  }
}

function addPendingTransitionProposals(
  proposals: DiameterTransitionProposal[],
  pendingItems: TechnicalMaterialPendingItem[],
) {
  for (const proposal of [...proposals].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    if (
      proposal.state === "confirmed" ||
      proposal.state === "not_required"
    ) {
      continue;
    }

    pendingItems.push({
      category: "transition",
      code: pendingCodeForTransitionKind(proposal.kind, null),
      countAsMaterial: false,
      label: `${transitionKindLabel(proposal.kind)} pendiente en nodo ${proposal.nodeId}`,
      reason: proposal.reason,
      sourceId: proposal.id,
      transitionId: proposal.id,
    });
  }
}

function addAccessoryDraft(
  byItemKey: Map<string, TechnicalMaterialAccessoryItem>,
  draft: AccessoryDraft,
) {
  const itemKey = [
    draft.accessoryKind,
    draft.familyId,
    draft.configurationKey,
  ].join("|");
  const current = byItemKey.get(itemKey);

  if (current) {
    current.quantity += draft.quantity;
    current.source =
      current.source === draft.source ? current.source : "mixed";

    if (!current.sourceIds.includes(draft.sourceId)) {
      current.sourceIds.push(draft.sourceId);
      current.sourceIds.sort();
    }

    return;
  }

  byItemKey.set(itemKey, {
    ...draft,
    kind: "accessory",
    quantityDomain: "physical_material",
    sourceIds: [draft.sourceId],
  });
}

function routeAccessoryDraft(
  contribution: TechnicalRouteAccessoryContribution,
): AccessoryDraft {
  const familyId =
    contribution.catalogFamilyId ??
    contribution.catalogCode ??
    contribution.equivalentLengthSource;
  const configurationKey = pipeDiameterKey(contribution.diameter);
  const accessoryKind = accessoryKindFromRouteAccessoryType(contribution.type);

  return {
    accessoryKind,
    catalogCode: contribution.catalogCode,
    configurationKey,
    familyId,
    label: `${accessoryKindLabel(accessoryKind)} ${formatDiameterSymbol(
      contribution.diameter,
    )}`,
    quantity: contribution.quantity,
    source: "route_accessory",
    sourceId: routeAccessoryPhysicalKey(contribution),
  };
}

function transitionAccessoryDraft(
  contribution: TechnicalRouteTransitionContribution,
): AccessoryDraft {
  const accessoryKind = accessoryKindFromTransitionContribution(contribution);
  const familyId =
    contribution.catalogFamilyId ??
    contribution.catalogCode ??
    contribution.transitionKind;
  const configurationKey = transitionConfigurationKey(contribution);

  return {
    accessoryKind,
    catalogCode: contribution.catalogCode,
    configurationKey,
    familyId,
    label: `${accessoryKindLabel(accessoryKind)} ${transitionConfigurationLabel(
      contribution,
    )}`,
    quantity: 1,
    source:
      contribution.transitionKind === "compound_turn_transition"
        ? "compound_transition"
        : "diameter_transition",
    sourceId: transitionPieceKey(contribution) ?? contribution.transitionId,
  };
}

function resolveEffectiveDiameterForSegment(
  result: TechnicalCalculationResult,
  segment: TechnicalSegmentResult,
): EffectiveDiameterResolution {
  const adoption = result.professionalDiameterAdoption;

  if (adoption) {
    const adoptionSegment =
      adoption.segments.find((item) => item.segmentId === segment.segmentId) ??
      null;

    if (
      adoptionSegment &&
      (adoptionSegment.status === "validated" ||
        adoptionSegment.status === "using_calculated") &&
      adoptionSegment.effectiveDiameter
    ) {
      return {
        diameter: adoptionSegment.effectiveDiameter,
        status: "resolved",
      };
    }

    return {
      reason:
        adoptionSegment?.reason ??
        "El diametro efectivo del tramo no esta validado.",
      status: "pending",
    };
  }

  const transitionAwareSizing = result.transitionAwareNetworkSizing;
  const transitionAwareSegment =
    transitionAwareSizing?.segments.find(
      (item) => item.segmentId === segment.segmentId,
    ) ?? null;

  if (
    transitionAwareSizing?.status === "resolved" &&
    transitionAwareSegment?.status === "resolved" &&
    transitionAwareSegment.finalDiameter
  ) {
    return {
      diameter: transitionAwareSegment.finalDiameter,
      status: "resolved",
    };
  }

  return {
    reason:
      transitionAwareSegment?.issues[0]?.message ??
      transitionAwareSizing?.issues[0]?.message ??
      "El dimensionado completo del tramo esta pendiente.",
    status: "pending",
  };
}

function selectRouteAccessoryResolutions(
  result: TechnicalCalculationResult,
) {
  const adoption = result.professionalDiameterAdoption;

  if (adoption && adoption.decisions.length > 0) {
    return adoption.routeAccessoryResolutions;
  }

  if (
    result.transitionAwareNetworkSizing &&
    Object.keys(result.transitionAwareNetworkSizing.routeAccessoryResolutions)
      .length > 0
  ) {
    return result.transitionAwareNetworkSizing.routeAccessoryResolutions;
  }

  return result.routeAccessoryResolutions;
}

function selectRouteTransitionResolutions(
  result: TechnicalCalculationResult,
) {
  const adoption = result.professionalDiameterAdoption;

  if (adoption && adoption.decisions.length > 0) {
    return adoption.routeTransitionResolutions;
  }

  return result.transitionAwareNetworkSizing?.routeTransitionResolutions ?? {};
}

function mapSegmentSizingLengths(result: TechnicalCalculationResult) {
  const adoption = result.professionalDiameterAdoption;
  const adoptionSegmentById = new Map(
    adoption?.segments.map((segment) => [segment.segmentId, segment]) ?? [],
  );
  const transitionSegmentById = new Map(
    result.transitionAwareNetworkSizing?.segments.map((segment) => [
      segment.segmentId,
      segment,
    ]) ?? [],
  );
  const baselineSegmentById = new Map(
    result.networkSizing?.segments.map((segment) => [
      segment.segmentId,
      segment,
    ]) ?? [],
  );

  return Object.fromEntries(
    sortSegments(result.segments).map((segment) => [
      segment.segmentId,
      adoptionSegmentById.get(segment.segmentId)?.validationSegment
        ?.transitionAwareSizingLengthMeters ??
        transitionSegmentById.get(segment.segmentId)
          ?.transitionAwareSizingLengthMeters ??
        baselineSegmentById.get(segment.segmentId)?.sizingLengthMeters ??
        null,
    ]),
  );
}

function mapRouteAccessoryEquivalentLengths(
  resolutions: Record<string, TechnicalRouteAccessoryResolution>,
) {
  return Object.fromEntries(
    sortRouteAccessoryResolutions(resolutions).map((resolution) => [
      resolution.routeId,
      resolution.governingRouteAccessoryEquivalentLengthMeters,
    ]),
  );
}

function mapRouteTransitionEquivalentLengths(
  resolutions: Record<string, TechnicalRouteTransitionResolution>,
) {
  return Object.fromEntries(
    sortRouteTransitionResolutions(resolutions).map((resolution) => [
      resolution.routeId,
      resolution.equivalentLengthMeters,
    ]),
  );
}

function createPendingSummary(items: TechnicalMaterialPendingItem[]) {
  return {
    accessoryCount: items.filter((item) => item.category === "accessory").length,
    adoptionCount: items.filter((item) => item.category === "adoption").length,
    pipeCount: items.filter((item) => item.category === "pipe").length,
    total: items.length,
    transitionCount: items.filter((item) => item.category === "transition")
      .length,
  };
}

function createEmptyTakeoff(
  status: TechnicalMaterialTakeoffStatus,
): TechnicalMaterialTakeoff {
  return {
    accessoryItems: [],
    calculationQuantities: {
      routeAccessoryEquivalentLengthMetersByRouteId: {},
      routeTransitionEquivalentLengthMetersByRouteId: {},
      segmentSizingLengthMetersBySegmentId: {},
    },
    pendingItems: [],
    pendingSummary: {
      accessoryCount: 0,
      adoptionCount: 0,
      pipeCount: 0,
      total: 0,
      transitionCount: 0,
    },
    physicalMaterialQuantities: {
      accessoryQuantity: 0,
      pipeLengthMeters: 0,
      pipeSegmentCount: 0,
    },
    pipeItems: [],
    status,
  };
}

function routeAccessoryPhysicalKey(
  contribution: TechnicalRouteAccessoryContribution,
) {
  return `${contribution.ownerSegmentId}:${contribution.accessoryId}`;
}

function transitionPieceKey(
  contribution: TechnicalRouteTransitionContribution,
) {
  if (
    contribution.status === "inactive" ||
    contribution.source === "not_required"
  ) {
    return `transition:${contribution.transitionId}:not-required`;
  }

  if (contribution.transitionKind === "branch_transition") {
    return `transition:${contribution.transitionId}:branch`;
  }

  if (contribution.transitionKind === "compound_turn_transition") {
    return `transition:${contribution.transitionId}:compound:${
      contribution.compoundComponent ?? "unknown"
    }`;
  }

  if (
    contribution.transitionKind === "simple_reduction" ||
    contribution.transitionKind === "simple_transition"
  ) {
    return `transition:${contribution.transitionId}:reduction`;
  }

  return `transition:${contribution.transitionId}:${contribution.transitionKind}`;
}

function accessoryKindFromRouteAccessoryType(
  type: RouteAccessoryType,
): TechnicalMaterialAccessoryKind {
  if (type === "elbow") {
    return "elbow";
  }

  if (type === "tee") {
    return "tee";
  }

  if (type === "valve") {
    return "valve";
  }

  return "other";
}

function accessoryKindFromTransitionContribution(
  contribution: TechnicalRouteTransitionContribution,
): TechnicalMaterialAccessoryKind {
  if (contribution.transitionKind === "branch_transition") {
    return "reduced_tee";
  }

  if (
    contribution.transitionKind === "compound_turn_transition" &&
    contribution.compoundComponent === "turn"
  ) {
    return "elbow";
  }

  return "reduction";
}

function pendingCodeForTransitionKind(
  kind: DiameterTransitionKind,
  compoundComponent: TechnicalRouteTransitionContribution["compoundComponent"] | null,
): TechnicalMaterialPendingItem["code"] {
  if (kind === "branch_transition") {
    return "branch_transition_pending";
  }

  if (kind === "compound_turn_transition" || compoundComponent) {
    return "compound_transition_pending";
  }

  return "diameter_transition_pending";
}

function transitionConfigurationKey(
  contribution: TechnicalRouteTransitionContribution,
) {
  if (contribution.variant?.label) {
    return contribution.variant.label;
  }

  return [
    pipeDiameterKey(contribution.upstreamDiameter),
    pipeDiameterKey(contribution.downstreamDiameter),
    contribution.traversalKind ?? "",
    contribution.variantLabel ?? "",
  ].join(">");
}

function transitionConfigurationLabel(
  contribution: TechnicalRouteTransitionContribution,
) {
  if (contribution.variantLabel) {
    return contribution.variantLabel;
  }

  if (contribution.variant?.label) {
    return contribution.variant.label;
  }

  if (
    contribution.upstreamDiameter &&
    contribution.downstreamDiameter
  ) {
    return `${formatDiameterSymbol(
      contribution.upstreamDiameter,
    )}->${formatDiameterSymbol(contribution.downstreamDiameter)}`;
  }

  return "configuracion pendiente";
}

function accessoryKindLabel(kind: TechnicalMaterialAccessoryKind) {
  if (kind === "elbow") {
    return "Codo";
  }

  if (kind === "tee") {
    return "Tee";
  }

  if (kind === "reduced_tee") {
    return "Tee reductora";
  }

  if (kind === "reduction") {
    return "Cupla reduccion";
  }

  if (kind === "valve") {
    return "Valvula";
  }

  return "Accesorio";
}

function accessoryProposalKindLabel(kind: AccessoryProposal["kind"]) {
  if (kind === "elbow") {
    return "Codo";
  }

  if (kind === "tee") {
    return "Tee";
  }

  return "Accesorio";
}

function transitionKindLabel(kind: DiameterTransitionKind) {
  if (kind === "branch_transition") {
    return "Tee reductora";
  }

  if (kind === "compound_turn_transition") {
    return "Compound";
  }

  if (kind === "simple_reduction" || kind === "simple_transition") {
    return "Reduccion";
  }

  return "Transicion";
}

function pipeDiameterKey(diameter: PipeDiameterReference | null) {
  if (!diameter) {
    return "diameter:pending";
  }

  return [
    diameter.id,
    diameter.externalDiameterMillimeters ?? "",
    diameter.internalDiameterMillimeters ?? "",
    diameter.nominalDiameter ?? "",
  ].join("|");
}

function formatDiameterSymbol(diameter: PipeDiameterReference | null) {
  if (!diameter) {
    return "Ø pendiente";
  }

  const external = formatOptionalNumber(diameter.externalDiameterMillimeters);

  return external ? `Ø${external}` : diameter.label;
}

function sortSegments(segments: TechnicalSegmentResult[]) {
  return [...segments].sort(
    (first, second) =>
      first.depth - second.depth ||
      first.fromNodeId.localeCompare(second.fromNodeId) ||
      first.toNodeId.localeCompare(second.toNodeId) ||
      first.segmentId.localeCompare(second.segmentId),
  );
}

function sortRouteAccessoryResolutions(
  resolutions: Record<string, TechnicalRouteAccessoryResolution>,
) {
  return Object.values(resolutions).sort((first, second) =>
    first.routeId.localeCompare(second.routeId),
  );
}

function sortRouteAccessoryContributions(
  contributions: TechnicalRouteAccessoryContribution[],
) {
  return [...contributions].sort(
    (first, second) =>
      first.ownerSegmentId.localeCompare(second.ownerSegmentId) ||
      first.accessoryId.localeCompare(second.accessoryId),
  );
}

function sortRouteTransitionResolutions(
  resolutions: Record<string, TechnicalRouteTransitionResolution>,
) {
  return Object.values(resolutions).sort((first, second) =>
    first.routeId.localeCompare(second.routeId),
  );
}

function sortRouteTransitionContributions(
  contributions: TechnicalRouteTransitionContribution[],
) {
  return [...contributions].sort(
    (first, second) =>
      first.transitionId.localeCompare(second.transitionId) ||
      (first.compoundComponent ?? "").localeCompare(
        second.compoundComponent ?? "",
      ) ||
      first.routeId.localeCompare(second.routeId),
  );
}

function comparePipeItems(
  first: TechnicalMaterialPipeItem,
  second: TechnicalMaterialPipeItem,
) {
  return (
    diameterSortValue(first.diameter) - diameterSortValue(second.diameter) ||
    first.diameterKey.localeCompare(second.diameterKey)
  );
}

function compareAccessoryItems(
  first: TechnicalMaterialAccessoryItem,
  second: TechnicalMaterialAccessoryItem,
) {
  return (
    accessoryKindLabel(first.accessoryKind).localeCompare(
      accessoryKindLabel(second.accessoryKind),
    ) ||
    first.familyId.localeCompare(second.familyId) ||
    first.configurationKey.localeCompare(second.configurationKey)
  );
}

function dedupePendingItems(items: TechnicalMaterialPendingItem[]) {
  const seen = new Set<string>();
  const next: TechnicalMaterialPendingItem[] = [];

  for (const item of items) {
    const sourceKey =
      item.transitionId ?? item.sourceId ?? item.segmentId ?? item.label;
    const key = [
      item.code,
      item.category,
      sourceKey,
      item.segmentId ?? "",
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(item);
  }

  return next.sort(
    (first, second) =>
      first.category.localeCompare(second.category) ||
      first.code.localeCompare(second.code) ||
      (first.sourceId ?? "").localeCompare(second.sourceId ?? ""),
  );
}

function diameterSortValue(diameter: PipeDiameterReference) {
  return (
    diameter.externalDiameterMillimeters ??
    diameter.internalDiameterMillimeters ??
    Number.POSITIVE_INFINITY
  );
}

function formatOptionalNumber(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}
