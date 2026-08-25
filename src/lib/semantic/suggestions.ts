import type { DrawingPrimitive, NormalizedDrawing } from "@/lib/geometry/types";
import type {
  ClassificationProposal,
  SemanticCategory,
  SemanticSignal,
} from "./types";

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

const WALL_TERMS = ["wall", "muro", "pared", "cerramiento"];

const STRUCTURE_TERMS = [
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

export function generateClassificationProposals(
  drawing: NormalizedDrawing,
): ClassificationProposal[] {
  const byLayer = new Map<string, string[]>();
  const blockNamesByLayer = new Map<string, Set<string>>();
  const entitiesById = new Map(drawing.entities.map((entity) => [entity.id, entity]));
  const colorStats = createColorStats(drawing.entities);

  for (const entity of drawing.entities) {
    byLayer.set(entity.layer, [...(byLayer.get(entity.layer) ?? []), entity.id]);

    if (entity.visual.blockName) {
      const blockNames = blockNamesByLayer.get(entity.layer) ?? new Set<string>();
      blockNames.add(entity.visual.blockName);
      blockNamesByLayer.set(entity.layer, blockNames);
    }
  }

  return Array.from(byLayer.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([layer, entityIds]) => {
      const match = matchName(layer);
      const blockMatch = findBlockMatch(blockNamesByLayer.get(layer));

      if (match) {
        return {
          id: `layer:${layer}`,
          entityIds,
          category: match.category,
          signals: [
            {
              source: "layer",
              value: layer,
              reason: match.reason,
            },
          ],
          confidence: match.category === "hard_structure" ? 0.86 : 0.92,
          explanation: `La capa "${layer}" contiene ${match.reason}.`,
          status: "pending",
        };
      }

      if (layer === "0" && blockMatch) {
        return {
          id: `layer:${layer}`,
          entityIds,
          category: blockMatch.category,
          signals: [
            {
              source: "block",
              value: blockMatch.blockName,
              reason: blockMatch.reason,
            },
          ],
          confidence: 0.78,
          explanation: `La capa "${layer}" no aporta senal, pero el bloque "${blockMatch.blockName}" contiene ${blockMatch.reason}.`,
          status: "pending",
        };
      }

      const colorMatch = findColorMatch(entityIds, entitiesById, colorStats);

      if (colorMatch) {
        return {
          id: `color:${colorMatch.color}:layer:${layer}`,
          entityIds: colorMatch.entityIds,
          category: colorMatch.category,
          signals: [
            {
              source: "color",
              value: colorMatch.color,
              reason: colorMatch.reason,
            },
          ],
          confidence: colorMatch.category === "hard_structure" ? 0.62 : 0.56,
          explanation: `El color resuelto ${colorMatch.color} sugiere ${colorMatch.reason}, sin confirmar la clasificacion.`,
          status: "pending",
        };
      }

      return {
        id: `layer:${layer}`,
        entityIds,
        category: "unclassified",
        signals: [],
        confidence: 0.1,
        explanation: `La capa "${layer}" no contiene senales semanticas suficientes.`,
        status: "pending",
      };
    });
}

type ColorStatsRecord = {
  count: number;
  sources: Record<string, number>;
  total: number;
};

type ColorStats = Map<string, ColorStatsRecord>;

function createColorStats(entities: DrawingPrimitive[]): ColorStats {
  const colorStats: ColorStats = new Map();

  for (const entity of entities) {
    const color = entity.visual.resolvedColor;

    if (!color) {
      continue;
    }

    const record =
      colorStats.get(color) ??
      {
        count: 0,
        sources: {},
        total: entities.length,
      };

    record.count += 1;
    record.sources[entity.visual.colorSource] =
      (record.sources[entity.visual.colorSource] ?? 0) + 1;
    colorStats.set(color, record);
  }

  return colorStats;
}

function findColorMatch(
  entityIds: string[],
  entitiesById: Map<string, DrawingPrimitive>,
  colorStats: ColorStats,
) {
  const idsByColor = new Map<string, string[]>();

  for (const entityId of entityIds) {
    const entity = entitiesById.get(entityId);
    const color = entity?.visual.resolvedColor;

    if (!color) {
      continue;
    }

    idsByColor.set(color, [...(idsByColor.get(color) ?? []), entityId]);
  }

  const candidates = Array.from(idsByColor.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  for (const [color, matchedEntityIds] of candidates) {
    const stats = colorStats.get(color);

    if (!stats || isDominantOrDefaultColor(color, stats)) {
      continue;
    }

    const match = matchSemanticColor(color);

    if (!match) {
      continue;
    }

    return {
      ...match,
      color,
      entityIds: matchedEntityIds,
    };
  }

  return null;
}

function isDominantOrDefaultColor(
  color: string,
  stats: ColorStatsRecord,
) {
  const normalizedColor = color.toLowerCase();
  const dominantRatio = stats.total === 0 ? 0 : stats.count / stats.total;
  const inheritedDefaultCount =
    (stats.sources.bylayer ?? 0) +
    (stats.sources.byblock ?? 0) +
    (stats.sources.default ?? 0);

  if (dominantRatio >= 0.45) {
    return true;
  }

  return normalizedColor === "#ffffff" && inheritedDefaultCount >= stats.count * 0.8;
}

function matchSemanticColor(
  color: string,
): { category: SemanticCategory; reason: string } | null {
  const rgb = parseHexColor(color);

  if (!rgb) {
    return null;
  }

  const luminance = relativeLuminance(rgb);
  const saturation = colorSaturation(rgb);

  if (luminance < 0.18) {
    return {
      category: "hard_structure",
      reason: "un color oscuro asociado a estructura",
    };
  }

  if (saturation < 0.12 && luminance >= 0.22 && luminance <= 0.86) {
    return {
      category: "reference_wall",
      reason: "un color gris asociado a muros de referencia",
    };
  }

  return null;
}

function parseHexColor(color: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);

  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 16);

  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function colorSaturation({ r, g, b }: { r: number; g: number; b: number }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max === 0) {
    return 0;
  }

  return (max - min) / max;
}

export function nextSemanticCategory(
  category: SemanticCategory,
): SemanticCategory {
  if (category === "hard_structure") {
    return "reference_wall";
  }

  if (category === "reference_wall") {
    return "opening";
  }

  if (category === "opening") {
    return "unclassified";
  }

  return "hard_structure";
}

function matchName(
  name: string,
): { category: SemanticCategory; reason: string } | null {
  const normalized = normalizeSearchText(name);

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

function findBlockMatch(blockNames: Set<string> | undefined) {
  if (!blockNames) {
    return null;
  }

  for (const blockName of Array.from(blockNames).sort()) {
    if (blockName.startsWith("*")) {
      continue;
    }

    const match = matchName(blockName);

    if (match) {
      return {
        ...match,
        blockName,
      };
    }
  }

  return null;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function containsAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}
