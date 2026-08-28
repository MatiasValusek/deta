import type {
  PipeDiameterReference,
  PipeDiameterTransitionTraversalKind,
  PipeSystemResolutionStatus,
} from "@/lib/calculation/pipeSystem";
import type {
  DiameterTransitionKind,
  DiameterTransitionProposal,
} from "@/lib/calculation/diameterTransitionProposals";
import type {
  TechnicalRouteAccessoryContribution,
  TechnicalRouteAccessoryResolution,
} from "@/lib/calculation/technicalRouteAccessories";
import type {
  TechnicalRouteTransitionContribution,
  TechnicalRouteTransitionResolution,
} from "@/lib/calculation/technicalRouteTransitions";
import type {
  TechnicalCalculationResult,
} from "@/lib/calculation/technicalTree";
import type { Point2D } from "@/lib/geometry/types";
import {
  automaticAccessoryId,
  type AccessoryProposal,
} from "@/lib/routing/routeAccessoryProposals";
import type { RouteAccessoryType } from "@/lib/routing/types";

export type TechnicalPhysicalAccessoryKind =
  | "elbow_90"
  | "other"
  | "reduced_tee"
  | "reducing_coupling"
  | "rh_elbow"
  | "tee"
  | "transition"
  | "valve";

export type TechnicalPhysicalAccessorySource =
  | "compound_transition"
  | "diameter_transition"
  | "route_accessory";

export type TechnicalPhysicalAccessoryStatus =
  | "pending"
  | "resolved"
  | "unsupported";

export type TechnicalPhysicalAccessoryDiameter = {
  diameter: PipeDiameterReference | null;
  role:
    | "diameter_change"
    | "downstream"
    | "incident"
    | "single"
    | "turn"
    | "upstream";
  segmentId?: string;
};

export type TechnicalPhysicalAccessoryRouteUse = {
  downstreamSegmentId?: string | null;
  equivalentLengthMeters: number | null;
  routeId: string;
  segmentIds: string[];
  status: PipeSystemResolutionStatus | "inactive";
  traversalKind: PipeDiameterTransitionTraversalKind | null;
  upstreamSegmentId?: string | null;
  variantLabel?: string;
};

export type TechnicalPhysicalAccessory = {
  catalogCode?: string;
  catalogFamilyId?: string;
  diameters: TechnicalPhysicalAccessoryDiameter[];
  id: string;
  kind: TechnicalPhysicalAccessoryKind;
  label: string;
  nodeId: string | null;
  position: Point2D | null;
  routeUses: TechnicalPhysicalAccessoryRouteUse[];
  segmentIds: string[];
  source: TechnicalPhysicalAccessorySource;
  sourceIds: string[];
  status: "resolved";
};

export type TechnicalPhysicalAccessoryPendingItem = {
  id: string;
  kind: TechnicalPhysicalAccessoryKind;
  nodeId: string | null;
  reason: string;
  routeId?: string;
  segmentIds: string[];
  sourceId: string;
  status: Exclude<TechnicalPhysicalAccessoryStatus, "resolved">;
};

export type TechnicalPhysicalAccessoryInventory = {
  accessoryIdsByRouteId: Record<string, string[]>;
  accessoryIdsBySegmentId: Record<string, string[]>;
  items: TechnicalPhysicalAccessory[];
  pendingItems: TechnicalPhysicalAccessoryPendingItem[];
  status: "pending" | "resolved" | "unavailable";
};

type AccessoryDraft = Omit<
  TechnicalPhysicalAccessory,
  "routeUses" | "segmentIds" | "sourceIds" | "status"
> & {
  routeUse: TechnicalPhysicalAccessoryRouteUse;
  segmentIds: string[];
  sourceId: string;
};

export function createTechnicalPhysicalAccessoryInventory(params: {
  accessoryProposals?: AccessoryProposal[];
  diameterTransitionProposals?: DiameterTransitionProposal[];
  result: TechnicalCalculationResult | null;
  routeTransitionResolutions?: Record<string, TechnicalRouteTransitionResolution>;
}): TechnicalPhysicalAccessoryInventory {
  if (!params.result) {
    return createEmptyInventory("unavailable");
  }

  const itemsById = new Map<string, TechnicalPhysicalAccessory>();
  const pendingItems: TechnicalPhysicalAccessoryPendingItem[] = [];
  const accessoryProposalByAccessoryId =
    createAccessoryProposalByAccessoryId(params.accessoryProposals ?? []);
  const transitionProposalById = new Map(
    (params.diameterTransitionProposals ?? []).map((proposal) => [
      proposal.id,
      proposal,
    ]),
  );

  addRouteAccessoryPieces({
    accessoryProposalByAccessoryId,
    itemsById,
    pendingItems,
    resolutions: selectRouteAccessoryResolutions(params.result),
  });
  addTransitionPieces({
    itemsById,
    pendingItems,
    resolutions:
      params.routeTransitionResolutions ??
      selectRouteTransitionResolutions(params.result),
    transitionProposalById,
  });

  const items = [...itemsById.values()].sort(comparePhysicalAccessories);
  const pending = dedupePendingItems(pendingItems);

  return {
    accessoryIdsByRouteId: createRouteIndex(items),
    accessoryIdsBySegmentId: createSegmentIndex(items),
    items,
    pendingItems: pending,
    status:
      items.length === 0 && pending.length === 0
        ? "unavailable"
        : pending.length > 0
          ? "pending"
          : "resolved",
  };
}

function addRouteAccessoryPieces(params: {
  accessoryProposalByAccessoryId: Map<string, AccessoryProposal>;
  itemsById: Map<string, TechnicalPhysicalAccessory>;
  pendingItems: TechnicalPhysicalAccessoryPendingItem[];
  resolutions: Record<string, TechnicalRouteAccessoryResolution>;
}) {
  for (const resolution of sortRouteAccessoryResolutions(params.resolutions)) {
    for (const contribution of sortRouteAccessoryContributions(
      resolution.contributions,
    )) {
      const proposal = params.accessoryProposalByAccessoryId.get(
        contribution.accessoryId,
      );
      const pieceId = routeAccessoryPieceId(contribution);
      const kind = routeAccessoryKind(contribution);
      const segmentIds = [contribution.ownerSegmentId];

      if (contribution.status !== "resolved") {
        params.pendingItems.push({
          id: pieceId,
          kind,
          nodeId: proposal?.nodeId ?? null,
          reason:
            contribution.reason ??
            "Accesorio confirmado pendiente de resolucion tecnica.",
          routeId: contribution.routeId,
          segmentIds,
          sourceId: routeAccessoryPhysicalKey(contribution),
          status:
            contribution.status === "unsupported" ? "unsupported" : "pending",
        });
        continue;
      }

      addPhysicalAccessory(params.itemsById, {
        catalogCode: contribution.catalogCode,
        catalogFamilyId: contribution.catalogFamilyId,
        diameters: [
          {
            diameter: contribution.diameter,
            role: "single",
            segmentId: contribution.ownerSegmentId,
          },
        ],
        id: pieceId,
        kind,
        label: routeAccessoryLabel(contribution, kind),
        nodeId: proposal?.nodeId ?? null,
        position: proposal?.position ?? null,
        routeUse: {
          equivalentLengthMeters: contribution.equivalentLengthMetersPerUnit,
          routeId: contribution.routeId,
          segmentIds,
          status: contribution.status,
          traversalKind: null,
          variantLabel: routeAccessoryVariantLabel(contribution),
        },
        segmentIds,
        source: "route_accessory",
        sourceId: routeAccessoryPhysicalKey(contribution),
      });
    }
  }
}

function addTransitionPieces(params: {
  itemsById: Map<string, TechnicalPhysicalAccessory>;
  pendingItems: TechnicalPhysicalAccessoryPendingItem[];
  resolutions: Record<string, TechnicalRouteTransitionResolution>;
  transitionProposalById: Map<string, DiameterTransitionProposal>;
}) {
  for (const resolution of sortRouteTransitionResolutions(params.resolutions)) {
    for (const contribution of sortRouteTransitionContributions(
      resolution.contributions,
    )) {
      if (
        contribution.status === "inactive" ||
        contribution.source === "not_required"
      ) {
        continue;
      }

      const pieceId = transitionPieceId(contribution);
      const proposal = params.transitionProposalById.get(
        contribution.transitionId,
      );
      const segmentIds = transitionSegmentIds(contribution, proposal);
      const kind = transitionAccessoryKind(contribution);

      if (
        contribution.status !== "resolved" ||
        contribution.source !== "pipe_system"
      ) {
        params.pendingItems.push({
          id: pieceId,
          kind,
          nodeId: contribution.nodeId,
          reason:
            contribution.reason ??
            "Transicion pendiente de resolucion tecnica.",
          routeId: contribution.routeId,
          segmentIds,
          sourceId: transitionPhysicalKey(contribution),
          status:
            contribution.status === "unsupported" ? "unsupported" : "pending",
        });
        continue;
      }

      addPhysicalAccessory(params.itemsById, {
        catalogCode: contribution.catalogCode,
        catalogFamilyId: contribution.catalogFamilyId,
        diameters: transitionDiameters(contribution, proposal),
        id: pieceId,
        kind,
        label: transitionAccessoryLabel(contribution, kind),
        nodeId: contribution.nodeId,
        position: proposal?.position ?? null,
        routeUse: {
          downstreamSegmentId: contribution.downstreamSegmentId,
          equivalentLengthMeters: contribution.equivalentLengthMeters,
          routeId: contribution.routeId,
          segmentIds:
            contribution.upstreamSegmentId && contribution.downstreamSegmentId
              ? [
                  contribution.upstreamSegmentId,
                  contribution.downstreamSegmentId,
                ]
              : segmentIds,
          status: contribution.status,
          traversalKind: contribution.traversalKind,
          upstreamSegmentId: contribution.upstreamSegmentId,
          variantLabel:
            contribution.variantLabel ?? contribution.variant?.label,
        },
        segmentIds,
        source:
          contribution.transitionKind === "compound_turn_transition"
            ? "compound_transition"
            : "diameter_transition",
        sourceId: transitionPhysicalKey(contribution),
      });
    }
  }
}

function addPhysicalAccessory(
  itemsById: Map<string, TechnicalPhysicalAccessory>,
  draft: AccessoryDraft,
) {
  const current = itemsById.get(draft.id);

  if (current) {
    mergeUnique(current.segmentIds, draft.segmentIds);
    mergeUnique(current.sourceIds, [draft.sourceId]);
    mergeDiameters(current.diameters, draft.diameters);
    addRouteUse(current.routeUses, draft.routeUse);
    return;
  }

  itemsById.set(draft.id, {
    catalogCode: draft.catalogCode,
    catalogFamilyId: draft.catalogFamilyId,
    diameters: [...draft.diameters],
    id: draft.id,
    kind: draft.kind,
    label: draft.label,
    nodeId: draft.nodeId,
    position: draft.position,
    routeUses: [draft.routeUse],
    segmentIds: [...draft.segmentIds].sort(),
    source: draft.source,
    sourceIds: [draft.sourceId],
    status: "resolved",
  });
}

function createAccessoryProposalByAccessoryId(proposals: AccessoryProposal[]) {
  const map = new Map<string, AccessoryProposal>();

  for (const proposal of proposals) {
    map.set(automaticAccessoryId(proposal.id), proposal);
  }

  return map;
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

function selectRouteTransitionResolutions(result: TechnicalCalculationResult) {
  const adoption = result.professionalDiameterAdoption;

  if (adoption && adoption.decisions.length > 0) {
    return adoption.routeTransitionResolutions;
  }

  return result.transitionAwareNetworkSizing?.routeTransitionResolutions ?? {};
}

function routeAccessoryPieceId(
  contribution: TechnicalRouteAccessoryContribution,
) {
  return `physical-accessory:route:${routeAccessoryPhysicalKey(contribution)}`;
}

function routeAccessoryPhysicalKey(
  contribution: TechnicalRouteAccessoryContribution,
) {
  return `${contribution.ownerSegmentId}:${contribution.accessoryId}`;
}

function transitionPieceId(
  contribution: TechnicalRouteTransitionContribution,
) {
  return `physical-accessory:${transitionPhysicalKey(contribution)}`;
}

function transitionPhysicalKey(
  contribution: TechnicalRouteTransitionContribution,
) {
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

function routeAccessoryKind(
  contribution: TechnicalRouteAccessoryContribution,
): TechnicalPhysicalAccessoryKind {
  const label = routeAccessoryVariantLabel(contribution);

  if (label && isRhElbowLabel(label)) {
    return "rh_elbow";
  }

  if (contribution.type === "elbow") {
    return "elbow_90";
  }

  if (contribution.type === "tee") {
    return "tee";
  }

  if (contribution.type === "valve") {
    return "valve";
  }

  return "other";
}

function transitionAccessoryKind(
  contribution: TechnicalRouteTransitionContribution,
): TechnicalPhysicalAccessoryKind {
  const label = contribution.variantLabel ?? contribution.variant?.label;

  if (
    contribution.transitionKind === "compound_turn_transition" &&
    contribution.compoundComponent === "turn"
  ) {
    return label && isRhElbowLabel(label) ? "rh_elbow" : "elbow_90";
  }

  if (contribution.transitionKind === "branch_transition") {
    return "reduced_tee";
  }

  if (contribution.transitionKind === "simple_reduction") {
    return "reducing_coupling";
  }

  if (contribution.transitionKind === "simple_transition") {
    return "transition";
  }

  return "transition";
}

function routeAccessoryLabel(
  contribution: TechnicalRouteAccessoryContribution,
  kind: TechnicalPhysicalAccessoryKind,
) {
  return routeAccessoryVariantLabel(contribution) ?? accessoryKindLabel(kind);
}

function routeAccessoryVariantLabel(
  contribution: TechnicalRouteAccessoryContribution,
) {
  return (
    recordStringValue(contribution.equivalentLengthResolution.data, "tableLabel") ??
    contribution.catalogCode ??
    contribution.catalogFamilyId
  );
}

function transitionAccessoryLabel(
  contribution: TechnicalRouteTransitionContribution,
  kind: TechnicalPhysicalAccessoryKind,
) {
  return (
    contribution.variantLabel ??
    contribution.variant?.label ??
    contribution.catalogCode ??
    contribution.catalogFamilyId ??
    accessoryKindLabel(kind)
  );
}

function transitionSegmentIds(
  contribution: TechnicalRouteTransitionContribution,
  proposal: DiameterTransitionProposal | undefined,
) {
  const ids =
    proposal?.incidentSegments.map((segment) => segment.segmentId) ??
    [contribution.upstreamSegmentId, contribution.downstreamSegmentId].filter(
      (segmentId): segmentId is string => Boolean(segmentId),
    );

  return [...new Set(ids)].sort();
}

function transitionDiameters(
  contribution: TechnicalRouteTransitionContribution,
  proposal: DiameterTransitionProposal | undefined,
): TechnicalPhysicalAccessoryDiameter[] {
  if (proposal) {
    return proposal.incidentSegments.map((segment) => ({
      diameter: segment.diameter,
      role: "incident" as const,
      segmentId: segment.segmentId,
    }));
  }

  return [
    {
      diameter: contribution.upstreamDiameter,
      role: "upstream" as const,
      segmentId: contribution.upstreamSegmentId ?? undefined,
    },
    {
      diameter: contribution.downstreamDiameter,
      role: "downstream" as const,
      segmentId: contribution.downstreamSegmentId ?? undefined,
    },
  ];
}

function accessoryKindLabel(kind: TechnicalPhysicalAccessoryKind) {
  switch (kind) {
    case "elbow_90":
      return "Codo 90";
    case "reduced_tee":
      return "Tee reductora";
    case "reducing_coupling":
      return "Cupla reductora";
    case "rh_elbow":
      return "Codo RH";
    case "tee":
      return "Tee";
    case "transition":
      return "Transicion";
    case "valve":
      return "Llave";
    default:
      return "Accesorio";
  }
}

function isRhElbowLabel(label: string) {
  const normalized = label.toLocaleLowerCase("es-AR");

  return (
    normalized.includes("rosca hembra") ||
    normalized.includes("rh") ||
    normalized.includes("hembra")
  );
}

function createRouteIndex(items: TechnicalPhysicalAccessory[]) {
  const index: Record<string, string[]> = {};

  for (const item of items) {
    for (const routeUse of item.routeUses) {
      const current = index[routeUse.routeId] ?? [];
      current.push(item.id);
      current.sort();
      index[routeUse.routeId] = [...new Set(current)];
    }
  }

  return index;
}

function createSegmentIndex(items: TechnicalPhysicalAccessory[]) {
  const index: Record<string, string[]> = {};

  for (const item of items) {
    for (const segmentId of item.segmentIds) {
      const current = index[segmentId] ?? [];
      current.push(item.id);
      current.sort();
      index[segmentId] = [...new Set(current)];
    }
  }

  return index;
}

function mergeUnique(target: string[], values: string[]) {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }

  target.sort();
}

function mergeDiameters(
  target: TechnicalPhysicalAccessoryDiameter[],
  values: TechnicalPhysicalAccessoryDiameter[],
) {
  for (const value of values) {
    const key = diameterEntryKey(value);

    if (!target.some((item) => diameterEntryKey(item) === key)) {
      target.push(value);
    }
  }

  target.sort((first, second) =>
    diameterEntryKey(first).localeCompare(diameterEntryKey(second)),
  );
}

function addRouteUse(
  routeUses: TechnicalPhysicalAccessoryRouteUse[],
  routeUse: TechnicalPhysicalAccessoryRouteUse,
) {
  const key = routeUseKey(routeUse);

  if (!routeUses.some((item) => routeUseKey(item) === key)) {
    routeUses.push(routeUse);
    routeUses.sort((first, second) =>
      routeUseKey(first).localeCompare(routeUseKey(second)),
    );
  }
}

function routeUseKey(routeUse: TechnicalPhysicalAccessoryRouteUse) {
  return [
    routeUse.routeId,
    routeUse.segmentIds.join(","),
    routeUse.traversalKind ?? "",
    routeUse.variantLabel ?? "",
  ].join("|");
}

function diameterEntryKey(entry: TechnicalPhysicalAccessoryDiameter) {
  return [
    entry.segmentId ?? "",
    entry.role,
    entry.diameter?.id ?? "",
  ].join("|");
}

function dedupePendingItems(items: TechnicalPhysicalAccessoryPendingItem[]) {
  const byId = new Map<string, TechnicalPhysicalAccessoryPendingItem>();

  for (const item of items) {
    if (!byId.has(item.id)) {
      byId.set(item.id, {
        ...item,
        segmentIds: [...item.segmentIds].sort(),
      });
    }
  }

  return [...byId.values()].sort((first, second) =>
    first.id.localeCompare(second.id),
  );
}

function createEmptyInventory(
  status: TechnicalPhysicalAccessoryInventory["status"],
): TechnicalPhysicalAccessoryInventory {
  return {
    accessoryIdsByRouteId: {},
    accessoryIdsBySegmentId: {},
    items: [],
    pendingItems: [],
    status,
  };
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
      routeAccessoryPhysicalKey(first).localeCompare(
        routeAccessoryPhysicalKey(second),
      ) || first.routeId.localeCompare(second.routeId),
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
      transitionPhysicalKey(first).localeCompare(transitionPhysicalKey(second)) ||
      first.routeId.localeCompare(second.routeId),
  );
}

function comparePhysicalAccessories(
  first: TechnicalPhysicalAccessory,
  second: TechnicalPhysicalAccessory,
) {
  return (
    (first.nodeId ?? "").localeCompare(second.nodeId ?? "") ||
    first.kind.localeCompare(second.kind) ||
    first.id.localeCompare(second.id)
  );
}

function recordStringValue(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  const value = record?.[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

export function technicalPhysicalAccessoryKindLabel(
  kind: TechnicalPhysicalAccessoryKind,
) {
  return accessoryKindLabel(kind);
}
