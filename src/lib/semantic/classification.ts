import type {
  ClassificationIndex,
  ClassificationProposal,
  ConfirmedClassification,
  EntityClassification,
  SemanticCategory,
} from "./types";

export function createClassificationFromProposal(
  proposal: ClassificationProposal,
): ConfirmedClassification {
  return {
    id: `proposal:${proposal.id}`,
    entityIds: proposal.entityIds,
    category: proposal.category,
    origin: "proposal",
    rule:
      proposal.signals[0]?.source === "layer"
        ? `layer:${proposal.signals[0].value}`
        : "proposal",
    status: proposal.status === "modified" ? "modified" : "confirmed",
  };
}

export function createManualClassification(params: {
  assignmentId: string;
  category: SemanticCategory;
  entityIds: string[];
  rule: string;
}): ConfirmedClassification {
  return {
    id: params.assignmentId,
    entityIds: params.entityIds,
    category: params.category,
    origin: "manual",
    rule: params.rule,
    status: "modified",
  };
}

export function buildClassificationIndex(
  assignments: ConfirmedClassification[],
): ClassificationIndex {
  const index: ClassificationIndex = {};

  for (const assignment of assignments) {
    const value: EntityClassification = {
      assignmentId: assignment.id,
      category: assignment.category,
      origin: assignment.origin,
      rule: assignment.rule,
      status: assignment.status,
    };

    for (const entityId of assignment.entityIds) {
      index[entityId] = value;
    }
  }

  return index;
}
