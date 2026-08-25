import type { DrawingPrimitive } from "@/lib/geometry/types";

export type SemanticCategory =
  | "hard_structure"
  | "reference_wall"
  | "opening"
  | "unclassified";

export type SemanticStatus =
  | "pending"
  | "confirmed"
  | "modified"
  | "discarded";

export type SemanticSignal = {
  source: "layer" | "block" | "color" | "visual";
  value: string;
  reason: string;
};

export type ClassificationProposal = {
  id: string;
  entityIds: string[];
  category: SemanticCategory;
  signals: SemanticSignal[];
  confidence: number;
  explanation: string;
  status: SemanticStatus;
};

export type ConfirmedClassification = {
  id: string;
  entityIds: string[];
  category: SemanticCategory;
  origin: "proposal" | "manual";
  rule: string;
  status: Extract<SemanticStatus, "confirmed" | "modified">;
};

export type EntityClassification = {
  assignmentId: string;
  category: SemanticCategory;
  origin: "proposal" | "manual";
  rule: string;
  status: Extract<SemanticStatus, "confirmed" | "modified">;
};

export type ClassificationIndex = Record<string, EntityClassification>;

export type SemanticInspection = {
  layers: Array<{
    name: string;
    entityCount: number;
    colors: string[];
    blocks: string[];
  }>;
  colors: Array<{
    color: string;
    entityCount: number;
    sources: Record<string, number>;
  }>;
  explicitColorCount: number;
  trueColorCount: number;
  byLayerCount: number;
  byBlockCount: number;
  lineTypes: Array<{ value: string; count: number }>;
  lineweights: Array<{ value: string; count: number }>;
  blocks: Array<{ name: string; count: number }>;
  visuallyUndifferentiatedCount: number;
  allEntitiesShareColor: boolean;
};

export type ManualSelectionMode = "pan" | "entity" | "rectangle";

export type SemanticViewMode = "original" | "prepared";

export type DrawingEntityLike = Pick<
  DrawingPrimitive,
  "id" | "layer" | "visual"
>;
