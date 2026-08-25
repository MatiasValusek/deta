import type { SemanticCategory } from "./types";

export const SEMANTIC_CATEGORY_LABELS: Record<SemanticCategory, string> = {
  hard_structure: "Estructura",
  reference_wall: "Muro",
  opening: "Abertura",
  unclassified: "Sin clasificar",
};

export const SEMANTIC_CATEGORY_ORDER: SemanticCategory[] = [
  "hard_structure",
  "reference_wall",
  "opening",
  "unclassified",
];
