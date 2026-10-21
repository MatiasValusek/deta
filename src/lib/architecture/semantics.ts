import type { SemanticCategory } from "@/lib/semantic/types";

const OPENING_TERMS = [
  "window",
  "ventana",
  "door",
  "puerta",
  "opening",
  "abertura",
  "glass",
  "vidrio",
];

const WALL_TERMS = [
  "wall",
  "muro",
  "muros",
  "pared",
  "paredes",
  "cerramiento",
  "tabique",
  "arquitectura",
  "architecture",
];

const STRUCTURE_TERMS = [
  "hard",
  "structure",
  "estructura",
  "structural",
  "column",
  "columna",
  "beam",
  "viga",
  "slab",
  "losa",
  "foundation",
  "fundacion",
];

export type ArchitecturalNameMatch = {
  category: Exclude<SemanticCategory, "unclassified">;
  reason: string;
};

export function classifyArchitecturalName(
  name: string,
): ArchitecturalNameMatch | null {
  return classifyNormalizedArchitecturalName(normalizeArchitecturalSearchText(name));
}

export function classifyArchitecturalNames(
  names: string[],
): ArchitecturalNameMatch | null {
  const matches = names
    .map(classifyArchitecturalName)
    .filter((match): match is ArchitecturalNameMatch => Boolean(match));

  for (const category of [
    "opening",
    "hard_structure",
    "reference_wall",
  ] satisfies ArchitecturalNameMatch["category"][]) {
    const match = matches.find((candidate) => candidate.category === category);

    if (match) {
      return match;
    }
  }

  return null;
}

export function normalizeArchitecturalSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function classifyNormalizedArchitecturalName(
  normalized: string,
): ArchitecturalNameMatch | null {
  if (containsAny(normalized, OPENING_TERMS)) {
    return {
      category: "opening",
      reason: "terminos asociados a aberturas",
    };
  }

  if (containsAny(normalized, WALL_TERMS)) {
    return {
      category: "reference_wall",
      reason: "terminos asociados a muros o arquitectura",
    };
  }

  if (containsAny(normalized, STRUCTURE_TERMS)) {
    return {
      category: "hard_structure",
      reason: "terminos inequivocos de estructura",
    };
  }

  return null;
}

function containsAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}
