import type { EntityCountMap } from "@/lib/geometry/types";

export type RawDxfScan = {
  entityCounts: {
    ENTITIES: EntityCountMap;
    BLOCKS: EntityCountMap;
  };
  colorMetadata: {
    layers: Record<string, RawDxfColorRecord>;
    entitiesByHandle: Record<string, RawDxfColorRecord>;
  };
  hatches: RawDxfHatchRecord[];
};

export type RawDxfColorRecord = {
  colorIndex: number | null;
  trueColor: string | null;
  trueColorValue: number | null;
};

export type RawDxfPair = {
  code: string;
  value: string;
};

export type RawDxfHatchRecord = {
  location: "ENTITIES" | "BLOCKS";
  pairs: RawDxfPair[];
};

const BLOCKS_SENTINELS = new Set(["BLOCK", "ENDBLK", "ENDSEC", "EOF", "SEQEND"]);
const ENTITIES_SENTINELS = new Set(["ENDSEC", "EOF", "SEQEND"]);

export function scanDxfSource(source: string): RawDxfScan {
  const lines = source.split(/\r\n|\r|\n/g);
  let section: string | null = null;
  let tableName: string | null = null;
  let layerRecord: RawLayerRecord | null = null;
  let entityRecord: RawEntityRecord | null = null;
  const entityCounts = {
    ENTITIES: {} as EntityCountMap,
    BLOCKS: {} as EntityCountMap,
  };
  const colorMetadata: RawDxfScan["colorMetadata"] = {
    layers: {},
    entitiesByHandle: {},
  };
  const hatches: RawDxfHatchRecord[] = [];

  for (let index = 0; index < lines.length - 1; index += 2) {
    const code = lines[index]?.trim();
    const value = lines[index + 1]?.trim();

    if (code === "0") {
      if (value === "SECTION") {
        flushLayerRecord(colorMetadata, layerRecord);
        flushEntityRecord(colorMetadata, hatches, entityRecord);
        layerRecord = null;
        entityRecord = null;

        const sectionCode = lines[index + 2]?.trim();
        const sectionName = lines[index + 3]?.trim();
        section = sectionCode === "2" && sectionName ? sectionName : null;
        tableName = null;
        continue;
      }

      if (value === "ENDSEC") {
        flushLayerRecord(colorMetadata, layerRecord);
        flushEntityRecord(colorMetadata, hatches, entityRecord);
        layerRecord = null;
        entityRecord = null;
        section = null;
        tableName = null;
        continue;
      }

      if (section === "TABLES") {
        if (value === "TABLE") {
          flushLayerRecord(colorMetadata, layerRecord);
          layerRecord = null;
          const tableCode = lines[index + 2]?.trim();
          const nextTableName = lines[index + 3]?.trim();
          tableName = tableCode === "2" && nextTableName ? nextTableName : null;
          continue;
        }

        if (value === "ENDTAB") {
          flushLayerRecord(colorMetadata, layerRecord);
          layerRecord = null;
          tableName = null;
          continue;
        }

        if (tableName === "LAYER" && value === "LAYER") {
          flushLayerRecord(colorMetadata, layerRecord);
          layerRecord = {
            colorIndex: null,
            name: null,
            trueColor: null,
            trueColorValue: null,
          };
          continue;
        }
      }

      if (section === "ENTITIES" && value && !ENTITIES_SENTINELS.has(value)) {
        flushEntityRecord(colorMetadata, hatches, entityRecord);
        entityRecord = createRawEntityRecord(value, "ENTITIES");
        increment(entityCounts.ENTITIES, value);
        continue;
      }

      if (section === "BLOCKS" && value && !BLOCKS_SENTINELS.has(value)) {
        flushEntityRecord(colorMetadata, hatches, entityRecord);
        entityRecord = createRawEntityRecord(value, "BLOCKS");
        increment(entityCounts.BLOCKS, value);
        continue;
      }

      flushEntityRecord(colorMetadata, hatches, entityRecord);
      entityRecord = null;
      continue;
    }

    if (section === "TABLES" && tableName === "LAYER" && layerRecord) {
      readLayerColorPair(layerRecord, code, value);
      continue;
    }

    if ((section === "ENTITIES" || section === "BLOCKS") && entityRecord) {
      readEntityColorPair(entityRecord, code, value);
      continue;
    }
  }

  flushLayerRecord(colorMetadata, layerRecord);
  flushEntityRecord(colorMetadata, hatches, entityRecord);

  return { entityCounts, colorMetadata, hatches };
}

function increment(counts: EntityCountMap, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

type RawLayerRecord = RawDxfColorRecord & {
  name: string | null;
};

type RawEntityRecord = RawDxfColorRecord & {
  handle: string | null;
  location: "ENTITIES" | "BLOCKS";
  pairs: RawDxfPair[] | null;
  type: string;
};

function createRawEntityRecord(
  type: string,
  location: "ENTITIES" | "BLOCKS",
): RawEntityRecord {
  return {
    colorIndex: null,
    handle: null,
    location,
    pairs: type === "HATCH" ? [] : null,
    trueColor: null,
    trueColorValue: null,
    type,
  };
}

function readLayerColorPair(
  record: RawLayerRecord,
  code: string | undefined,
  value: string | undefined,
) {
  if (code === "2") {
    record.name = value ?? null;
  }

  if (code === "62") {
    record.colorIndex = parseDxfInteger(value);
  }

  if (code === "420") {
    const trueColorValue = parseDxfInteger(value);
    record.trueColorValue = trueColorValue;
    record.trueColor = trueColorValueToHex(trueColorValue);
  }
}

function readEntityColorPair(
  record: RawEntityRecord,
  code: string | undefined,
  value: string | undefined,
) {
  if (code !== undefined && value !== undefined) {
    record.pairs?.push({ code, value });
  }

  if (code === "5") {
    record.handle = value ?? null;
  }

  if (code === "62") {
    record.colorIndex = parseDxfInteger(value);
  }

  if (code === "420") {
    const trueColorValue = parseDxfInteger(value);
    record.trueColorValue = trueColorValue;
    record.trueColor = trueColorValueToHex(trueColorValue);
  }
}

function flushLayerRecord(
  metadata: RawDxfScan["colorMetadata"],
  record: RawLayerRecord | null,
) {
  if (!record?.name) {
    return;
  }

  metadata.layers[record.name] = {
    colorIndex: record.colorIndex,
    trueColor: record.trueColor,
    trueColorValue: record.trueColorValue,
  };
}

function flushEntityRecord(
  metadata: RawDxfScan["colorMetadata"],
  hatches: RawDxfHatchRecord[],
  record: RawEntityRecord | null,
) {
  if (record?.type === "HATCH" && record.pairs) {
    hatches.push({
      location: record.location,
      pairs: record.pairs,
    });
  }

  if (!record?.handle) {
    return;
  }

  if (record.colorIndex === null && record.trueColor === null) {
    return;
  }

  metadata.entitiesByHandle[record.handle] = {
    colorIndex: record.colorIndex,
    trueColor: record.trueColor,
    trueColorValue: record.trueColorValue,
  };
}

function parseDxfInteger(value: string | undefined) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

function trueColorValueToHex(value: number | null) {
  if (value === null) {
    return null;
  }

  const rgb = value & 0xffffff;
  return `#${rgb.toString(16).padStart(6, "0")}`;
}
