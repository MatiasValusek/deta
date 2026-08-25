import type { NormalizedDrawing } from "@/lib/geometry/types";
import type { SemanticInspection } from "./types";

export function inspectDrawingSemantics(
  drawing: NormalizedDrawing,
): SemanticInspection {
  const layerMap = new Map<
    string,
    {
      name: string;
      entityCount: number;
      colors: Set<string>;
      blocks: Set<string>;
    }
  >();
  const colorMap = new Map<
    string,
    {
      color: string;
      entityCount: number;
      sources: Record<string, number>;
    }
  >();
  const lineTypes = new Map<string, number>();
  const lineweights = new Map<string, number>();
  const blocks = new Map<string, number>();
  let explicitColorCount = 0;
  let trueColorCount = 0;
  let byLayerCount = 0;
  let byBlockCount = 0;
  let visuallyUndifferentiatedCount = 0;

  for (const entity of drawing.entities) {
    const layer = getOrCreateLayer(layerMap, entity.layer);
    const color = entity.visual.resolvedColor ?? "sin color resuelto";

    layer.entityCount += 1;
    layer.colors.add(color);

    if (entity.visual.blockName) {
      layer.blocks.add(entity.visual.blockName);
      increment(blocks, entity.visual.blockName);
    }

    const colorRecord =
      colorMap.get(color) ??
      {
        color,
        entityCount: 0,
        sources: {},
      };
    colorRecord.entityCount += 1;
    colorRecord.sources[entity.visual.colorSource] =
      (colorRecord.sources[entity.visual.colorSource] ?? 0) + 1;
    colorMap.set(color, colorRecord);

    if (entity.visual.colorSource === "explicit") {
      explicitColorCount += 1;
    } else if (entity.visual.colorSource === "truecolor") {
      trueColorCount += 1;
    } else if (entity.visual.colorSource === "bylayer") {
      byLayerCount += 1;
    } else if (entity.visual.colorSource === "byblock") {
      byBlockCount += 1;
    }

    increment(lineTypes, entity.visual.lineType ?? "BYLAYER");
    increment(lineweights, formatLineweight(entity.visual.lineweight));

    if (
      entity.visual.resolvedColor === null &&
      entity.visual.lineType === null &&
      entity.visual.lineweight === null
    ) {
      visuallyUndifferentiatedCount += 1;
    }
  }

  return {
    layers: Array.from(layerMap.values())
      .map((layer) => ({
        name: layer.name,
        entityCount: layer.entityCount,
        colors: Array.from(layer.colors).sort(),
        blocks: Array.from(layer.blocks).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    colors: Array.from(colorMap.values()).sort((a, b) =>
      a.color.localeCompare(b.color),
    ),
    explicitColorCount,
    trueColorCount,
    byLayerCount,
    byBlockCount,
    lineTypes: toSortedEntries(lineTypes),
    lineweights: toSortedEntries(lineweights),
    blocks: toSortedEntries(blocks).map(({ value, count }) => ({
      name: value,
      count,
    })),
    visuallyUndifferentiatedCount,
    allEntitiesShareColor: colorMap.size <= 1,
  };
}

function getOrCreateLayer(
  layers: Map<
    string,
    {
      name: string;
      entityCount: number;
      colors: Set<string>;
      blocks: Set<string>;
    }
  >,
  name: string,
) {
  const existing = layers.get(name);

  if (existing) {
    return existing;
  }

  const next = {
    name,
    entityCount: 0,
    colors: new Set<string>(),
    blocks: new Set<string>(),
  };
  layers.set(name, next);
  return next;
}

function increment(map: Map<string, number>, value: string) {
  map.set(value, (map.get(value) ?? 0) + 1);
}

function toSortedEntries(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

function formatLineweight(lineweight: number | null) {
  return lineweight === null ? "sin espesor" : String(lineweight);
}
