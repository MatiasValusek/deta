import {
  drawingPrimitiveHardRestrictions,
  drawingPrimitiveRouteGeometries,
} from "@/lib/architecture/geometry";
import { constraintBelongsToSource } from "@/lib/constraints/geometry";
import type { ManualConstraint } from "@/lib/constraints/types";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  DrawingPrimitive,
  NormalizedDrawing,
  Point2D,
} from "@/lib/geometry/types";
import {
  segmentIntersectsPolygon,
  segmentsIntersect,
} from "@/lib/routing/geometry";
import { resolveRouteSegments, routeSegmentPlanLegs } from "@/lib/routing/network";
import type {
  AutomaticRouteRestriction,
  ManualRouteNetwork,
  RouteProposalArchitecturalWarning,
} from "@/lib/routing/types";
import type {
  ClassificationProposal,
  ConfirmedClassification,
  SemanticCategory,
  SemanticStatus,
} from "@/lib/semantic/types";

export type ArchitecturalRouteFeatureOrigin =
  | "classification_proposal"
  | "confirmed_assignment"
  | "manual_constraint"
  | "visual_interpretation";

export type ArchitecturalRouteFeatureRole =
  | "blocked"
  | "guide"
  | "opening"
  | "unverified";

export type ArchitecturalRouteFeatureGeometry =
  | {
      kind: "polygon";
      polygon: Point2D[];
    }
  | {
      from: Point2D;
      kind: "segment";
      to: Point2D;
    };

export type ArchitecturalRouteFeature = {
  category: SemanticCategory;
  confidence: number | null;
  geometry: ArchitecturalRouteFeatureGeometry;
  id: string;
  origin: ArchitecturalRouteFeatureOrigin;
  pageNumber: number | null;
  referenceId: string;
  role: ArchitecturalRouteFeatureRole;
  source: "dxf" | "pdf";
  state: Extract<SemanticStatus, "confirmed" | "modified" | "pending">;
};

export type ArchitecturalRouteGuide = {
  from: Point2D;
  id: string;
  pageNumber: number | null;
  source: "dxf" | "pdf";
  state: ArchitecturalRouteFeature["state"];
  to: Point2D;
};

export type ArchitecturalRouteContext = {
  features: ArchitecturalRouteFeature[];
  guides: ArchitecturalRouteGuide[];
  openings: ArchitecturalRouteFeature[];
  pendingStructures: ArchitecturalRouteFeature[];
  restrictions: AutomaticRouteRestriction[];
};

export type BuildArchitecturalRouteContextInput = {
  assignments: ConfirmedClassification[];
  constraints: ManualConstraint[];
  drawing: NormalizedDrawing | null;
  interpretedFeatures?: ArchitecturalRouteFeature[];
  minSegmentLengthSource?: number;
  pageNumber: number | null;
  proposals: ClassificationProposal[];
  source: "dxf" | "pdf";
  viewType: "plan" | "section";
};

const TRUSTED_PENDING_WALL_CONFIDENCE = 0.9;
const CONTEXT_CACHE_LIMIT = 8;
const contextCache: Array<{
  input: BuildArchitecturalRouteContextInput;
  result: ArchitecturalRouteContext;
}> = [];

export function buildArchitecturalRouteContext(
  input: BuildArchitecturalRouteContextInput,
): ArchitecturalRouteContext {
  const cached = contextCache.find((entry) => sameContextInput(entry.input, input));

  if (cached) {
    return cached.result;
  }

  const result = buildArchitecturalRouteContextUncached(input);
  contextCache.unshift({ input: { ...input }, result });
  contextCache.splice(CONTEXT_CACHE_LIMIT);
  return result;
}

function buildArchitecturalRouteContextUncached(
  input: BuildArchitecturalRouteContextInput,
): ArchitecturalRouteContext {
  const features: ArchitecturalRouteFeature[] = [];
  const restrictions: AutomaticRouteRestriction[] = [];

  for (const constraint of input.constraints) {
    if (
      !constraint.active ||
      !constraintBelongsToSource(constraint, input.source, input.pageNumber)
    ) {
      continue;
    }

    restrictions.push({
      id: constraint.id,
      kind: "polygon",
      polygon: constraint.polygon,
    });
    features.push({
      category: "hard_structure",
      confidence: 1,
      geometry: {
        kind: "polygon",
        polygon: constraint.polygon,
      },
      id: `manual:${constraint.id}`,
      origin: "manual_constraint",
      pageNumber: constraint.pageNumber,
      referenceId: constraint.id,
      role: "blocked",
      source: constraint.source,
      state: "confirmed",
    });
  }

  if (input.drawing && input.source === "dxf") {
    const assignmentByEntityId = assignmentsByEntityId(input.assignments);
    const proposalByEntityId = pendingProposalsByEntityId(input.proposals);

    for (const entity of input.drawing.entities) {
      const assignment = assignmentByEntityId.get(entity.id) ?? null;

      if (assignment) {
        const confirmedFeatures = featuresForDrawingEntity({
          category: assignment.category,
          confidence: 1,
          entity,
          origin: "confirmed_assignment",
          role: roleForConfirmedCategory(assignment.category),
          state: assignment.status,
        });
        features.push(...confirmedFeatures);

        if (assignment.category === "hard_structure") {
          restrictions.push(
            ...drawingPrimitiveHardRestrictions(
              entity,
              input.minSegmentLengthSource,
            ),
          );
        }

        continue;
      }

      for (const proposal of proposalByEntityId.get(entity.id) ?? []) {
        features.push(
          ...featuresForDrawingEntity({
            category: proposal.category,
            confidence: proposal.confidence,
            entity,
            origin: "classification_proposal",
            role: roleForPendingProposal(proposal),
            state: proposal.status === "modified" ? "modified" : "pending",
          }),
        );
      }
    }
  }

  for (const feature of input.interpretedFeatures ?? []) {
    if (
      feature.source === input.source &&
      feature.pageNumber === input.pageNumber
    ) {
      features.push(feature);

      if (feature.role === "blocked" && feature.state === "confirmed") {
        restrictions.push(...restrictionsForFeatures([feature]));
      }
    }
  }

  const activePlanFeatures =
    input.viewType === "plan"
      ? features
      : features.filter((feature) => feature.role === "blocked");

  return {
    features,
    guides: activePlanFeatures
      .filter(
        (feature): feature is ArchitecturalRouteFeature & {
          geometry: Extract<ArchitecturalRouteFeatureGeometry, { kind: "segment" }>;
        } => feature.role === "guide" && feature.geometry.kind === "segment",
      )
      .map((feature) => ({
        from: feature.geometry.from,
        id: feature.id,
        pageNumber: feature.pageNumber,
        source: feature.source,
        state: feature.state,
        to: feature.geometry.to,
      })),
    openings: activePlanFeatures.filter((feature) => feature.role === "opening"),
    pendingStructures: activePlanFeatures.filter(
      (feature) =>
        feature.category === "hard_structure" &&
        feature.role === "unverified" &&
        feature.state !== "confirmed",
    ),
    restrictions,
  };
}

function sameContextInput(
  first: BuildArchitecturalRouteContextInput,
  second: BuildArchitecturalRouteContextInput,
) {
  return (
    first.assignments === second.assignments &&
    first.constraints === second.constraints &&
    first.drawing === second.drawing &&
    first.interpretedFeatures === second.interpretedFeatures &&
    first.minSegmentLengthSource === second.minSegmentLengthSource &&
    first.pageNumber === second.pageNumber &&
    first.proposals === second.proposals &&
    first.source === second.source &&
    first.viewType === second.viewType
  );
}

export function createArchitecturalRouteWarnings(params: {
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  pendingStructures: ArchitecturalRouteFeature[];
}): RouteProposalArchitecturalWarning[] {
  if (params.pendingStructures.length === 0) {
    return [];
  }

  const referenceIds = new Set<string>();

  for (const segment of resolveRouteSegments(params.network, params.equipment)) {
    for (const leg of routeSegmentPlanLegs(segment)) {
      for (const feature of params.pendingStructures) {
        if (routeLegIntersectsFeature(leg.from, leg.to, feature)) {
          referenceIds.add(feature.referenceId);
        }
      }
    }
  }

  if (referenceIds.size === 0) {
    return [];
  }

  const sortedReferenceIds = [...referenceIds].sort();

  return [
    {
      featureIds: sortedReferenceIds,
      id: `pending-structure-crossing:${sortedReferenceIds.join(":")}`,
      kind: "pending_structure_crossing",
      message:
        sortedReferenceIds.length === 1
          ? "El recorrido atraviesa un elemento propuesto como estructura que requiere confirmacion."
          : `El recorrido atraviesa ${sortedReferenceIds.length} elementos propuestos como estructura que requieren confirmacion.`,
    },
  ];
}

function assignmentsByEntityId(assignments: ConfirmedClassification[]) {
  const index = new Map<string, ConfirmedClassification>();

  for (const assignment of assignments) {
    for (const entityId of assignment.entityIds) {
      index.set(entityId, assignment);
    }
  }

  return index;
}

function pendingProposalsByEntityId(proposals: ClassificationProposal[]) {
  const index = new Map<string, ClassificationProposal[]>();

  for (const proposal of proposals) {
    if (proposal.status !== "pending" && proposal.status !== "modified") {
      continue;
    }

    for (const entityId of proposal.entityIds) {
      index.set(entityId, [...(index.get(entityId) ?? []), proposal]);
    }
  }

  return index;
}

function featuresForDrawingEntity(params: {
  category: SemanticCategory;
  confidence: number;
  entity: DrawingPrimitive;
  origin: ArchitecturalRouteFeatureOrigin;
  role: ArchitecturalRouteFeatureRole;
  state: ArchitecturalRouteFeature["state"];
}) {
  return drawingPrimitiveRouteGeometries(params.entity).map(
    (geometry, index): ArchitecturalRouteFeature => ({
      category: params.category,
      confidence: params.confidence,
      geometry,
      id: `${params.origin}:${params.entity.id}:${geometry.kind}:${index}`,
      origin: params.origin,
      pageNumber: null,
      referenceId: params.entity.id,
      role: params.role,
      source: "dxf",
      state: params.state,
    }),
  );
}

function roleForConfirmedCategory(
  category: SemanticCategory,
): ArchitecturalRouteFeatureRole {
  if (category === "hard_structure") {
    return "blocked";
  }

  if (category === "reference_wall") {
    return "guide";
  }

  return category === "opening" ? "opening" : "unverified";
}

function roleForPendingProposal(
  proposal: ClassificationProposal,
): ArchitecturalRouteFeatureRole {
  if (
    proposal.category === "reference_wall" &&
    proposal.status === "pending" &&
    proposal.confidence >= TRUSTED_PENDING_WALL_CONFIDENCE &&
    proposal.signals.some((signal) => signal.source === "layer")
  ) {
    return "guide";
  }

  return proposal.category === "opening" ? "opening" : "unverified";
}

function restrictionsForFeatures(features: ArchitecturalRouteFeature[]) {
  return features.map((feature): AutomaticRouteRestriction =>
    feature.geometry.kind === "polygon"
      ? {
          id: hardRestrictionId(feature),
          kind: "polygon",
          polygon: feature.geometry.polygon,
        }
      : {
          from: feature.geometry.from,
          id: hardRestrictionId(feature),
          kind: "segment",
          to: feature.geometry.to,
        },
  );
}

function hardRestrictionId(feature: ArchitecturalRouteFeature) {
  const suffix = feature.id.split(":").slice(-2).join(":");
  return `hard-structure:${feature.referenceId}:${suffix}`;
}

function routeLegIntersectsFeature(
  from: Point2D,
  to: Point2D,
  feature: ArchitecturalRouteFeature,
) {
  return feature.geometry.kind === "polygon"
    ? segmentIntersectsPolygon(from, to, feature.geometry.polygon)
    : segmentsIntersect(
        from,
        to,
        feature.geometry.from,
        feature.geometry.to,
      );
}
