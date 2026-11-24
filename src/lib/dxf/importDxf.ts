import DxfParser, {
  type IArcEntity,
  type IBlock,
  type IDimensionEntity,
  type IDxf,
  type IEntity,
  type IInsertEntity,
  type ILayer,
  type ILineType,
  type ILineEntity,
  type ILwpolylineEntity,
  type IMtextEntity,
  type ITextEntity,
} from "dxf-parser";
import { boundsFromEntities } from "@/lib/geometry/bounds";
import type {
  ArcPrimitive,
  Bounds,
  DrawingLayer,
  DrawingPrimitive,
  DrawingUnits,
  DrawingVisualMetadata,
  EntityCountMap,
  HatchBoundary,
  HatchPrimitive,
  IgnoredEntity,
  ImportWarning,
  LinePrimitive,
  NormalizedDrawing,
  Point2D,
  PolylinePrimitive,
  TextPrimitive,
} from "@/lib/geometry/types";
import {
  scanDxfSource,
  type RawDxfHatchRecord,
  type RawDxfPair,
  type RawDxfScan,
} from "./rawScan";

type DxfPoint = {
  x?: number;
  y?: number;
  z?: number;
};

type DxfLayerTable = Record<string, ILayer>;
type DxfLineTypeTable = Record<string, ILineType>;

type ImportContext = {
  layers: Map<string, DrawingLayer>;
  entities: DrawingPrimitive[];
  normalizedCounts: EntityCountMap;
  rawColorMetadata: RawDxfScan["colorMetadata"];
  lineTypes: Map<string, number[]>;
  globalLineTypeScale: number;
  warnings: ImportWarning[];
  unsupportedHatchCount: number;
};

type BlockTransform = {
  blockBase: Point2D;
  blockColor: string | null;
  blockColorIndex: number | null;
  blockTrueColor: string | null;
  blockTrueColorValue: number | null;
  blockLineType: string | null;
  blockLineweight: number | null;
  blockName: string;
  insertion: Point2D;
  scaleX: number;
  scaleY: number;
  rotation: number;
  inheritedLayer: string;
  sourcePath: string;
};

const SOURCE_TYPES_WITH_RENDERING = new Set([
  "LINE",
  "LWPOLYLINE",
  "ARC",
  "TEXT",
  "MTEXT",
]);
const SUPPORTED_SOURCE_TYPES = [
  "LINE",
  "LWPOLYLINE",
  "ARC",
  "TEXT",
  "MTEXT",
  "DIMENSION",
  "INSERT",
  "HATCH",
];

export function importDxf(fileName: string, source: string): NormalizedDrawing {
  const rawScan = scanDxfSource(source);
  const parser = new DxfParser();
  const parsed = parser.parseSync(source);

  if (!parsed) {
    throw new Error("El parser DXF no devolvio un documento valido.");
  }

  const context: ImportContext = {
    layers: readLayers(parsed, rawScan.colorMetadata.layers),
    entities: [],
    globalLineTypeScale: readGlobalLineTypeScale(parsed),
    lineTypes: readLineTypes(parsed),
    normalizedCounts: {},
    rawColorMetadata: rawScan.colorMetadata,
    unsupportedHatchCount: 0,
    warnings: [],
  };

  for (const [index, entity] of parsed.entities.entries()) {
    normalizeTopLevelEntity(parsed, entity, index, context);
  }

  normalizeRawHatches(rawScan.hatches, context);

  const ignoredEntities = collectIgnoredEntities(
    rawScan.entityCounts,
    context.unsupportedHatchCount,
  );
  const bounds = boundsFromEntities(context.entities);

  if (!bounds) {
    context.warnings.push({
      message: "No se pudo calcular una extension valida a partir de entidades soportadas.",
    });
  }

  return {
    fileName,
    units: readUnits(parsed),
    layers: Array.from(context.layers.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    entities: context.entities,
    bounds,
    headerBounds: readHeaderBounds(parsed),
    rawEntityCounts: rawScan.entityCounts,
    normalizedCounts: context.normalizedCounts,
    supportedSourceTypes: SUPPORTED_SOURCE_TYPES,
    ignoredEntities,
    warnings: [
      ...ignoredEntities.map((ignored) => ({
        entityType: ignored.type,
        message: `${ignored.type} ignorada en ${ignored.location}: ${ignored.reason}`,
      })),
      ...context.warnings,
    ],
  };
}

function normalizeTopLevelEntity(
  parsed: IDxf,
  entity: IEntity,
  index: number,
  context: ImportContext,
) {
  const sourcePath = `ENTITIES/${entity.type}/${stableEntityKey(entity, index)}`;

  if (entity.type === "INSERT") {
    normalizeInsert(parsed, entity as IInsertEntity, index, context, sourcePath);
    return;
  }

  if (entity.type === "DIMENSION") {
    normalizeDimension(parsed, entity as IDimensionEntity, context, sourcePath);
    return;
  }

  normalizeRenderableEntity(entity, context, sourcePath);
}

function normalizeInsert(
  parsed: IDxf,
  insert: IInsertEntity,
  index: number,
  context: ImportContext,
  sourcePath: string,
) {
  const block = parsed.blocks?.[insert.name];

  ensureLayer(context, layerName(insert.layer), null, null, true);

  if (!block) {
    context.warnings.push({
      entityType: "INSERT",
      sourcePath,
      message: `No se encontro el bloque "${insert.name}" para INSERT ${stableEntityKey(insert, index)}.`,
    });
    return;
  }

  const instances = expandInsertInstances(insert);

  for (const instance of instances) {
    const insertLayer = layerName(insert.layer);
    const insertVisual = resolveVisualMetadata(insert, insertLayer, context, undefined);
    const transform: BlockTransform = {
      blockBase: pointFromDxf(block.position),
      blockColor: insertVisual.resolvedColor,
      blockColorIndex:
        insertVisual.explicitColorIndex ??
        insertVisual.layerColorIndex ??
        insertVisual.blockColorIndex,
      blockTrueColor:
        insertVisual.explicitTrueColor ??
        insertVisual.layerTrueColor ??
        insertVisual.blockTrueColor,
      blockTrueColorValue:
        insertVisual.explicitTrueColorValue ??
        insertVisual.layerTrueColorValue ??
        insertVisual.blockTrueColorValue,
      blockLineType: insertVisual.resolvedLineType ?? null,
      blockLineweight: insertVisual.resolvedLineweight ?? null,
      blockName: block.name,
      insertion: instance.insertion,
      scaleX: finiteOrDefault(insert.xScale, 1),
      scaleY: finiteOrDefault(insert.yScale, 1),
      rotation: degreesToRadians(finiteOrDefault(insert.rotation, 0)),
      inheritedLayer: insertLayer,
      sourcePath: `${sourcePath}[${instance.key}]/BLOCKS/${block.name}`,
    };

    normalizeBlockEntities(block, context, transform);
  }
}

function normalizeDimension(
  parsed: IDxf,
  dimension: IDimensionEntity,
  context: ImportContext,
  sourcePath: string,
) {
  const block = parsed.blocks?.[dimension.block];
  const layer = layerName(dimension.layer);
  ensureLayer(context, layer, null, null, true);

  if (!block) {
    context.warnings.push({
      entityType: "DIMENSION",
      sourcePath,
      message: `Cota conservada sin representación: no se encontró el bloque gráfico "${dimension.block}".`,
    });
    return;
  }

  const visual = resolveVisualMetadata(dimension, layer, context);
  const transform: BlockTransform = {
    blockBase: pointFromDxf(block.position),
    blockColor: visual.resolvedColor,
    blockColorIndex:
      visual.explicitColorIndex ?? visual.layerColorIndex ?? visual.blockColorIndex,
    blockTrueColor:
      visual.explicitTrueColor ?? visual.layerTrueColor ?? visual.blockTrueColor,
    blockTrueColorValue:
      visual.explicitTrueColorValue ??
      visual.layerTrueColorValue ??
      visual.blockTrueColorValue,
    blockLineType: visual.resolvedLineType ?? null,
    blockLineweight: visual.resolvedLineweight ?? null,
    blockName: block.name,
    insertion: { x: 0, y: 0 },
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    inheritedLayer: layer,
    sourcePath: `${sourcePath}/BLOCKS/${block.name}`,
  };

  normalizeBlockEntities(block, context, transform);
  context.normalizedCounts.dimension =
    (context.normalizedCounts.dimension ?? 0) + 1;
}

function normalizeBlockEntities(
  block: IBlock,
  context: ImportContext,
  transform: BlockTransform,
) {
  for (const [index, entity] of block.entities.entries()) {
    const sourcePath = `${transform.sourcePath}/${entity.type}/${stableEntityKey(entity, index)}`;
    normalizeRenderableEntity(entity, context, sourcePath, transform);
  }
}

function normalizeRenderableEntity(
  entity: IEntity,
  context: ImportContext,
  sourcePath: string,
  transform?: BlockTransform,
) {
  if (!SOURCE_TYPES_WITH_RENDERING.has(entity.type)) {
    return;
  }

  const layer = resolveLayer(entity.layer, transform?.inheritedLayer);
  ensureLayer(context, layer, null, null, true);
  const visual = resolveVisualMetadata(entity, layer, context, transform);

  if (entity.type === "LINE") {
    const primitive = normalizeLine(entity as ILineEntity, sourcePath, layer, visual, transform);
    if (primitive) {
      addPrimitive(context, primitive);
    }
    return;
  }

  if (entity.type === "LWPOLYLINE") {
    const primitive = normalizeLwPolyline(
      entity as ILwpolylineEntity,
      sourcePath,
      layer,
      visual,
      transform,
    );
    if (primitive) {
      addPrimitive(context, primitive);
    }
    return;
  }

  if (entity.type === "ARC") {
    const primitive = normalizeArc(entity as IArcEntity, sourcePath, layer, visual, transform, context);
    if (primitive) {
      addPrimitive(context, primitive);
    }
    return;
  }

  if (entity.type === "TEXT") {
    const primitive = normalizeText(
      entity as ITextEntity,
      sourcePath,
      layer,
      visual,
      transform,
    );
    if (primitive) {
      addPrimitive(context, primitive);
    }
    return;
  }

  if (entity.type === "MTEXT") {
    const primitive = normalizeMtext(
      entity as IMtextEntity,
      sourcePath,
      layer,
      visual,
      transform,
    );
    if (primitive) {
      addPrimitive(context, primitive);
    }
  }
}

function normalizeText(
  entity: ITextEntity,
  sourcePath: string,
  layer: string,
  visual: DrawingVisualMetadata,
  transform?: BlockTransform,
): TextPrimitive | null {
  if (!entity.startPoint || !entity.text || !Number.isFinite(entity.textHeight)) {
    return null;
  }

  const metrics = transformTextMetrics(
    finiteOrDefault(entity.rotation, 0),
    finiteOrDefault(entity.xScale, 1),
    transform,
  );

  return {
    id: primitiveId(sourcePath),
    kind: "text",
    sourceType: "TEXT",
    sourcePath,
    layer,
    color: visual.resolvedColor,
    visual,
    position: transformPoint(pointFromDxf(entity.startPoint), transform),
    alignmentPoint: entity.endPoint
      ? transformPoint(pointFromDxf(entity.endPoint), transform)
      : null,
    text: entity.text,
    rawText: entity.text,
    height: entity.textHeight * metrics.heightScale,
    width: null,
    widthFactor: metrics.widthFactor,
    rotation: metrics.rotation,
    horizontalAlignment: finiteOrNull(entity.halign),
    verticalAlignment: finiteOrNull(entity.valign),
    attachmentPoint: null,
    multiline: false,
  };
}

function normalizeMtext(
  entity: IMtextEntity,
  sourcePath: string,
  layer: string,
  visual: DrawingVisualMetadata,
  transform?: BlockTransform,
): TextPrimitive | null {
  if (!entity.position || !entity.text || !Number.isFinite(entity.height)) {
    return null;
  }

  const directionRotation = entity.directionVector
    ? radiansToDegrees(
        Math.atan2(entity.directionVector.y ?? 0, entity.directionVector.x ?? 1),
      )
    : undefined;
  const metrics = transformTextMetrics(
    finiteOrDefault(entity.rotation, finiteOrDefault(directionRotation, 0)),
    1,
    transform,
  );
  const blockWidthScale = transform
    ? Math.hypot(transform.scaleX, transform.scaleY) / Math.SQRT2
    : 1;

  return {
    id: primitiveId(sourcePath),
    kind: "text",
    sourceType: "MTEXT",
    sourcePath,
    layer,
    color: visual.resolvedColor,
    visual,
    position: transformPoint(pointFromDxf(entity.position), transform),
    alignmentPoint: null,
    text: plainMtext(entity.text),
    rawText: entity.text,
    height: entity.height * metrics.heightScale,
    width: Number.isFinite(entity.width)
      ? entity.width * blockWidthScale
      : null,
    widthFactor: metrics.widthFactor,
    rotation: metrics.rotation,
    horizontalAlignment: null,
    verticalAlignment: null,
    attachmentPoint: finiteOrNull(entity.attachmentPoint),
    multiline: true,
  };
}

function normalizeLine(
  entity: ILineEntity,
  sourcePath: string,
  layer: string,
  visual: DrawingVisualMetadata,
  transform?: BlockTransform,
): LinePrimitive | null {
  const [start, end] = entity.vertices;

  if (!start || !end) {
    return null;
  }

  return {
    id: primitiveId(sourcePath),
    kind: "line",
    sourceType: "LINE",
    sourcePath,
    layer,
    color: visual.resolvedColor,
    visual,
    start: transformPoint(pointFromDxf(start), transform),
    end: transformPoint(pointFromDxf(end), transform),
  };
}

function normalizeLwPolyline(
  entity: ILwpolylineEntity,
  sourcePath: string,
  layer: string,
  visual: DrawingVisualMetadata,
  transform?: BlockTransform,
): PolylinePrimitive | null {
  const points = entity.vertices
    .map(pointFromDxf)
    .map((point) => transformPoint(point, transform));

  if (points.length < 2) {
    return null;
  }

  return {
    id: primitiveId(sourcePath),
    kind: "polyline",
    sourceType: "LWPOLYLINE",
    sourcePath,
    layer,
    color: visual.resolvedColor,
    visual,
    points,
    closed: Boolean(entity.shape),
  };
}

function normalizeArc(
  entity: IArcEntity,
  sourcePath: string,
  layer: string,
  visual: DrawingVisualMetadata,
  transform: BlockTransform | undefined,
  context: ImportContext,
): ArcPrimitive | null {
  if (!entity.center || !Number.isFinite(entity.radius)) {
    return null;
  }

  const scaleX = transform?.scaleX ?? 1;
  const scaleY = transform?.scaleY ?? 1;

  if (!nearlyEqual(Math.abs(scaleX), Math.abs(scaleY))) {
    context.warnings.push({
      entityType: "ARC",
      sourcePath,
      message: "ARC ignorado porque el INSERT aplica escala no uniforme.",
    });
    return null;
  }

  const transformedArc = transformArcGeometry(entity, transform);

  return {
    id: primitiveId(sourcePath),
    kind: "arc",
    sourceType: "ARC",
    sourcePath,
    layer,
    color: visual.resolvedColor,
    visual,
    center: transformedArc.center,
    radius: transformedArc.radius,
    startAngle: transformedArc.startAngle,
    endAngle: transformedArc.endAngle,
  };
}

function normalizeRawHatches(
  hatches: RawDxfHatchRecord[],
  context: ImportContext,
) {
  for (const [index, hatch] of hatches.entries()) {
    const parsed = parseRawHatch(hatch, index);
    const sourcePath = `${hatch.location}/HATCH/${parsed.handle ?? index}`;

    if (!parsed.supported) {
      context.unsupportedHatchCount += 1;
      context.warnings.push({
        entityType: "HATCH",
        sourcePath,
        message: `HATCH ignorada: ${parsed.reason}`,
      });
      continue;
    }

    const layer = layerName(parsed.layer);
    ensureLayer(context, layer, null, null, true);
    const visual = resolveRawHatchVisualMetadata(parsed, layer, context);
    const rings = parsed.boundaries.map((boundary) => boundary.points);
    const ringModel = createHatchRingModel(rings);
    const primitive: HatchPrimitive = {
      id: primitiveId(sourcePath),
      kind: "hatch",
      sourceType: "HATCH",
      sourcePath,
      layer,
      color: visual.resolvedColor,
      visual,
      handle: parsed.handle,
      blockName: null,
      solidFill: true,
      patternName: parsed.patternName,
      outerRing: ringModel.outerRing,
      innerRings: ringModel.innerRings,
      rings,
      boundaries: parsed.boundaries,
    };

    addPrimitive(context, primitive);
  }
}

function resolveVisualMetadata(
  entity: IEntity,
  resolvedLayer: string,
  context: ImportContext,
  transform?: BlockTransform,
): DrawingVisualMetadata {
  const layer = context.layers.get(resolvedLayer);
  const entityColor = readEntityColorMetadata(entity, context.rawColorMetadata);
  const explicitColorIndex = isExplicitColorIndex(entityColor.colorIndex)
    ? entityColor.colorIndex
    : null;
  const explicitColor = explicitColorIndex === null ? null : entityColor.color;
  const explicitTrueColor = entityColor.trueColor;
  const explicitTrueColorValue = entityColor.trueColorValue;
  const layerColor = layer?.color ?? null;
  const layerColorIndex = layer?.colorIndex ?? null;
  const layerTrueColor = layer?.trueColor ?? null;
  const layerTrueColorValue = layer?.trueColorValue ?? null;
  const blockColor = transform?.blockColor ?? null;
  const blockColorIndex = transform?.blockColorIndex ?? null;
  const blockTrueColor = transform?.blockTrueColor ?? null;
  const blockTrueColorValue = transform?.blockTrueColorValue ?? null;
  const colorSource = resolveColorSource(entityColor.colorIndex, explicitTrueColor);
  const resolvedColor =
    colorSource === "truecolor"
      ? explicitTrueColor
      : colorSource === "explicit"
      ? explicitColor
      : colorSource === "byblock"
        ? blockTrueColor ?? blockColor ?? layerTrueColor ?? layerColor
        : colorSource === "bylayer"
          ? layerTrueColor ?? layerColor
          : null;
  const originalLineType = normalizeLineType(entity.lineType);
  const resolvedLineType = resolveLineType(
    originalLineType,
    layer?.lineType ?? null,
    transform?.blockLineType ?? null,
  );
  const entityLineTypeScale = positiveOrDefault(entity.lineTypeScale, 1);
  const blockScale = transform
    ? Math.hypot(transform.scaleX, transform.scaleY) / Math.SQRT2
    : 1;
  const lineTypeScale = context.globalLineTypeScale * entityLineTypeScale * blockScale;
  const pattern = resolvedLineType
    ? context.lineTypes.get(resolvedLineType.toUpperCase()) ?? null
    : null;
  const originalLineweight = finiteOrNull(entity.lineweight);
  const resolvedLineweight = resolveLineweight(
    originalLineweight,
    layer?.lineweight ?? null,
    transform?.blockLineweight ?? null,
  );

  return {
    originalLayer: layerName(entity.layer),
    resolvedLayer,
    explicitColor,
    explicitColorIndex,
    explicitTrueColor,
    explicitTrueColorValue,
    layerColor,
    layerColorIndex,
    layerTrueColor,
    layerTrueColorValue,
    blockColor,
    blockColorIndex,
    blockTrueColor,
    blockTrueColorValue,
    resolvedColor,
    colorSource,
    lineType: originalLineType,
    lineTypePattern: pattern?.map((length) => length * lineTypeScale) ?? null,
    lineTypeScale,
    resolvedLineType,
    lineweight: originalLineweight,
    resolvedLineweight,
    blockName: transform?.blockName ?? null,
    sourceEntityType: entity.type,
  };
}

type ParsedRawHatch =
  | (RawHatchHeader & {
      boundaries: HatchBoundary[];
      supported: true;
    })
  | (Partial<RawHatchHeader> & {
      reason: string;
      supported: false;
    });

type RawHatchHeader = {
  associative: number | null;
  colorIndex: number | null;
  handle: string | null;
  layer: string;
  loopCount: number | null;
  patternName: string | null;
  solidFill: number | null;
  trueColor: string | null;
  trueColorValue: number | null;
};

function parseRawHatch(
  hatch: RawDxfHatchRecord,
  index: number,
): ParsedRawHatch {
  const header = readRawHatchHeader(hatch.pairs);

  if (header.loopCount === null || header.loopStartIndex === null) {
    return unsupportedRawHatch(header, "no informa cantidad de loops");
  }

  if (header.solidFill !== 1 || normalizePatternName(header.patternName) !== "SOLID") {
    return unsupportedRawHatch(
      header,
      `patron no solido (${header.patternName ?? "sin patron"})`,
    );
  }

  let cursor = header.loopStartIndex;
  const boundaries: HatchBoundary[] = [];

  for (let loopIndex = 0; loopIndex < header.loopCount; loopIndex += 1) {
    const loop = parseHatchPolylineLoop(hatch.pairs, cursor, header.handle, loopIndex);

    if (!loop.supported) {
      return unsupportedRawHatch(header, loop.reason);
    }

    cursor = loop.nextIndex;
    boundaries.push({
      kind: "polyline",
      typeFlag: loop.typeFlag,
      points: loop.points,
    });
  }

  if (boundaries.length === 0) {
    return unsupportedRawHatch(header, "no contiene loops renderizables");
  }

  return {
    associative: header.associative,
    boundaries,
    colorIndex: header.colorIndex,
    handle: header.handle ?? String(index),
    layer: header.layer,
    loopCount: header.loopCount,
    patternName: header.patternName,
    solidFill: header.solidFill,
    supported: true,
    trueColor: header.trueColor,
    trueColorValue: header.trueColorValue,
  };
}

function readRawHatchHeader(pairs: RawDxfPair[]) {
  const header: RawHatchHeader & { loopStartIndex: number | null } = {
    associative: null,
    colorIndex: null,
    handle: null,
    layer: "0",
    loopCount: null,
    loopStartIndex: null,
    patternName: null,
    solidFill: null,
    trueColor: null,
    trueColorValue: null,
  };

  for (const [index, pair] of pairs.entries()) {
    if (pair.code === "5") {
      header.handle = pair.value;
    } else if (pair.code === "8") {
      header.layer = layerName(pair.value);
    } else if (pair.code === "2" && header.patternName === null) {
      header.patternName = pair.value;
    } else if (pair.code === "62") {
      header.colorIndex = parseDxfInteger(pair.value);
    } else if (pair.code === "420") {
      header.trueColorValue = parseDxfInteger(pair.value);
      header.trueColor = trueColorNumberToHex(header.trueColorValue);
    } else if (pair.code === "70") {
      header.solidFill = parseDxfInteger(pair.value);
    } else if (pair.code === "71") {
      header.associative = parseDxfInteger(pair.value);
    } else if (pair.code === "91") {
      header.loopCount = parseDxfInteger(pair.value);
      header.loopStartIndex = index + 1;
      break;
    }
  }

  return header;
}

function parseHatchPolylineLoop(
  pairs: RawDxfPair[],
  startIndex: number,
  hatchHandle: string | null,
  loopIndex: number,
) {
  let cursor = startIndex;
  const context = `HATCH ${hatchHandle ?? "sin handle"} loop ${loopIndex}`;

  if (pairs[cursor]?.code !== "92") {
    return unsupportedHatchLoop(`${context}: falta boundary type 92`);
  }

  const typeFlag = parseDxfInteger(pairs[cursor].value);
  cursor += 1;

  if (pairs[cursor]?.code !== "72") {
    return unsupportedHatchLoop(
      `${context}: boundary no polilinea o edge boundary no soportado`,
    );
  }

  const hasBulge = parseDxfInteger(pairs[cursor].value);
  cursor += 1;

  if (hasBulge !== 0) {
    return unsupportedHatchLoop(`${context}: contiene bulges`);
  }

  if (pairs[cursor]?.code !== "73") {
    return unsupportedHatchLoop(`${context}: falta indicador de cierre 73`);
  }

  const closed = parseDxfInteger(pairs[cursor].value);
  cursor += 1;

  if (closed !== 1) {
    return unsupportedHatchLoop(`${context}: loop abierto`);
  }

  if (pairs[cursor]?.code !== "93") {
    return unsupportedHatchLoop(`${context}: falta cantidad de vertices 93`);
  }

  const vertexCount = parseDxfInteger(pairs[cursor].value);
  cursor += 1;

  if (vertexCount === null || vertexCount < 3) {
    return unsupportedHatchLoop(`${context}: cantidad invalida de vertices`);
  }

  const points: Point2D[] = [];

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    if (pairs[cursor]?.code !== "10") {
      return unsupportedHatchLoop(`${context}: falta X de vertice ${vertexIndex}`);
    }

    const x = parseDxfNumber(pairs[cursor].value);
    cursor += 1;

    if (pairs[cursor]?.code !== "20") {
      return unsupportedHatchLoop(`${context}: falta Y de vertice ${vertexIndex}`);
    }

    const y = parseDxfNumber(pairs[cursor].value);
    cursor += 1;

    if (x === null || y === null) {
      return unsupportedHatchLoop(`${context}: vertice invalido ${vertexIndex}`);
    }

    if (pairs[cursor]?.code === "42") {
      const bulge = parseDxfNumber(pairs[cursor].value);
      cursor += 1;

      if (bulge !== null && !nearlyEqual(bulge, 0)) {
        return unsupportedHatchLoop(`${context}: contiene bulge no nulo`);
      }
    }

    points.push({ x, y });
  }

  if (pairs[cursor]?.code === "97") {
    const sourceBoundaryCount = parseDxfInteger(pairs[cursor].value) ?? 0;
    cursor += 1 + sourceBoundaryCount;
  }

  return {
    nextIndex: cursor,
    points,
    supported: true as const,
    typeFlag,
  };
}

function unsupportedRawHatch(
  header: Partial<RawHatchHeader>,
  reason: string,
): ParsedRawHatch {
  return {
    ...header,
    reason,
    supported: false,
  };
}

function unsupportedHatchLoop(reason: string) {
  return {
    reason,
    supported: false as const,
  };
}

function resolveRawHatchVisualMetadata(
  hatch: Extract<ParsedRawHatch, { supported: true }>,
  resolvedLayer: string,
  context: ImportContext,
): DrawingVisualMetadata {
  const layer = context.layers.get(resolvedLayer);
  const explicitColorIndex = isExplicitColorIndex(hatch.colorIndex)
    ? hatch.colorIndex
    : null;
  const explicitColor = null;
  const explicitTrueColor = hatch.trueColor;
  const explicitTrueColorValue = hatch.trueColorValue;
  const layerColor = layer?.color ?? null;
  const layerColorIndex = layer?.colorIndex ?? null;
  const layerTrueColor = layer?.trueColor ?? null;
  const layerTrueColorValue = layer?.trueColorValue ?? null;
  const colorSource = resolveColorSource(hatch.colorIndex, explicitTrueColor);
  const resolvedColor =
    colorSource === "truecolor"
      ? explicitTrueColor
      : colorSource === "explicit"
        ? explicitColor
        : colorSource === "bylayer"
          ? layerTrueColor ?? layerColor
          : null;

  return {
    originalLayer: hatch.layer,
    resolvedLayer,
    explicitColor,
    explicitColorIndex,
    explicitTrueColor,
    explicitTrueColorValue,
    layerColor,
    layerColorIndex,
    layerTrueColor,
    layerTrueColorValue,
    blockColor: null,
    blockColorIndex: null,
    blockTrueColor: null,
    blockTrueColorValue: null,
    resolvedColor,
    colorSource,
    lineType: null,
    lineTypePattern: null,
    lineTypeScale: null,
    resolvedLineType: null,
    lineweight: null,
    resolvedLineweight: null,
    blockName: null,
    sourceEntityType: "HATCH",
  };
}

function createHatchRingModel(rings: Point2D[][]) {
  const outerIndex = rings.reduce(
    (largestIndex, ring, index) =>
      Math.abs(ringArea(ring)) > Math.abs(ringArea(rings[largestIndex]))
        ? index
        : largestIndex,
    0,
  );
  const outerRing = rings[outerIndex] ?? [];
  const innerRings = rings.filter(
    (ring, index) => index !== outerIndex && ring[0] && pointInRing(ring[0], outerRing),
  );

  return {
    innerRings,
    outerRing,
  };
}

function ringArea(points: Point2D[]) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function pointInRing(point: Point2D, ring: Point2D[]) {
  let inside = false;

  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (crosses) {
      inside = !inside;
    }
  }

  return inside;
}

function normalizePatternName(patternName: string | null) {
  return patternName?.trim().toUpperCase() ?? null;
}

function resolveColorSource(
  colorIndex: number | null,
  explicitTrueColor: string | null,
) {
  if (explicitTrueColor) {
    return "truecolor";
  }

  if (colorIndex === 0) {
    return "byblock";
  }

  if (colorIndex === null || colorIndex === 256) {
    return "bylayer";
  }

  return "explicit";
}

function readEntityColorMetadata(
  entity: IEntity,
  rawColorMetadata: RawDxfScan["colorMetadata"],
) {
  const rawColor = readRawEntityColor(entity, rawColorMetadata);
  const parserTrueColorValue = readParserTrueColorValue(entity);

  return {
    color: colorNumberToHex(entity.color),
    colorIndex: rawColor?.colorIndex ?? finiteOrNull(entity.colorIndex),
    trueColor: rawColor?.trueColor ?? trueColorNumberToHex(parserTrueColorValue),
    trueColorValue: rawColor?.trueColorValue ?? parserTrueColorValue,
  };
}

function readRawEntityColor(
  entity: IEntity,
  rawColorMetadata: RawDxfScan["colorMetadata"],
) {
  if (entity.handle === undefined || entity.handle === null) {
    return undefined;
  }

  return rawColorMetadata.entitiesByHandle[String(entity.handle)];
}

function readParserTrueColorValue(entity: IEntity) {
  const record = entity as unknown as Record<string, unknown>;

  return (
    finiteOrNull(record.trueColor) ??
    finiteOrNull(record.truecolor) ??
    finiteOrNull(record.trueColorValue)
  );
}

function isExplicitColorIndex(colorIndex: number | null) {
  return colorIndex !== null && colorIndex !== 0 && colorIndex !== 256;
}

function normalizeLineType(lineType: string | undefined): string | null {
  if (!lineType || lineType.trim().length === 0) {
    return null;
  }

  return lineType;
}

function resolveLineType(
  entityLineType: string | null,
  layerLineType: string | null,
  blockLineType: string | null,
) {
  const normalized = entityLineType?.trim().toUpperCase();

  if (normalized === "BYBLOCK") {
    return blockLineType ?? layerLineType ?? "Continuous";
  }

  if (!normalized || normalized === "BYLAYER") {
    return layerLineType ?? "Continuous";
  }

  return entityLineType;
}

function resolveLineweight(
  entityLineweight: number | null,
  layerLineweight: number | null,
  blockLineweight: number | null,
) {
  if (entityLineweight !== null && entityLineweight >= 0) {
    return entityLineweight;
  }

  if (entityLineweight === -2 && blockLineweight !== null && blockLineweight >= 0) {
    return blockLineweight;
  }

  return layerLineweight !== null && layerLineweight >= 0
    ? layerLineweight
    : null;
}

function readLineTypes(parsed: IDxf) {
  const result = new Map<string, number[]>();
  const table = parsed.tables?.lineType?.lineTypes as DxfLineTypeTable | undefined;

  for (const [name, lineType] of Object.entries(table ?? {})) {
    result.set(
      name.toUpperCase(),
      (lineType.pattern ?? [])
        .map(Number)
        .filter((length) => Number.isFinite(length)),
    );
  }

  return result;
}

function readGlobalLineTypeScale(parsed: IDxf) {
  return positiveOrDefault(parsed.header?.$LTSCALE, 1);
}

function readLayers(
  parsed: IDxf,
  rawLayers: RawDxfScan["colorMetadata"]["layers"],
): Map<string, DrawingLayer> {
  const layers = new Map<string, DrawingLayer>();
  const tableLayers = parsed.tables?.layer?.layers as DxfLayerTable | undefined;

  if (tableLayers) {
    for (const [name, layer] of Object.entries(tableLayers)) {
      const rawLayer = rawLayers[name];
      ensureLayer(
        { layers },
        name,
        rawLayer?.trueColor ?? colorNumberToHex(layer.color),
        rawLayer?.colorIndex ?? finiteOrNull(layer.colorIndex),
        layer.visible !== false,
        rawLayer?.trueColor ?? null,
        rawLayer?.trueColorValue ?? null,
        rawLayer?.lineType ?? null,
        rawLayer?.lineweight ?? null,
      );
    }
  }

  return layers;
}

function ensureLayer(
  context: Pick<ImportContext, "layers">,
  name: string,
  color: string | null,
  colorIndex: number | null,
  visible: boolean,
  trueColor: string | null = null,
  trueColorValue: number | null = null,
  lineType: string | null = null,
  lineweight: number | null = null,
) {
  if (context.layers.has(name)) {
    return;
  }

  context.layers.set(name, {
    id: name,
    name,
    visible,
    color,
    colorIndex,
    trueColor,
    trueColorValue,
    lineType,
    lineweight,
  });
}

function addPrimitive(context: ImportContext, primitive: DrawingPrimitive) {
  context.entities.push(primitive);
  context.normalizedCounts[primitive.kind] =
    (context.normalizedCounts[primitive.kind] ?? 0) + 1;
}

function collectIgnoredEntities(
  rawCounts: {
    ENTITIES: EntityCountMap;
    BLOCKS: EntityCountMap;
  },
  unsupportedHatchCount: number,
): IgnoredEntity[] {
  const ignored: IgnoredEntity[] = [];

  for (const location of ["ENTITIES", "BLOCKS"] as const) {
    for (const [type, count] of Object.entries(rawCounts[location])) {
      if (!SUPPORTED_SOURCE_TYPES.includes(type)) {
        ignored.push({
          type,
          count,
          location,
          reason: "tipo fuera del alcance de la Tanda 01 para este archivo",
        });
      }
    }
  }

  if (unsupportedHatchCount > 0) {
    ignored.push({
      type: "HATCH",
      count: unsupportedHatchCount,
      location: "ENTITIES",
      reason: "patron o boundary fuera del subconjunto solido soportado",
    });
  }

  return ignored.sort((a, b) =>
    `${a.location}:${a.type}`.localeCompare(`${b.location}:${b.type}`),
  );
}

function readUnits(parsed: IDxf): DrawingUnits {
  const rawValue = parsed.header?.$INSUNITS;
  const code = typeof rawValue === "number" ? rawValue : null;

  if (code === null) {
    return {
      code: null,
      label: null,
      source: "missing",
    };
  }

  return {
    code,
    label: insunitsLabel(code),
    source: "$INSUNITS",
  };
}

function readHeaderBounds(parsed: IDxf): Bounds | null {
  const min = parsed.header?.$EXTMIN as DxfPoint | undefined;
  const max = parsed.header?.$EXTMAX as DxfPoint | undefined;
  const minX = finiteOrNull(min?.x);
  const minY = finiteOrNull(min?.y);
  const maxX = finiteOrNull(max?.x);
  const maxY = finiteOrNull(max?.y);

  if (
    minX !== null &&
    minY !== null &&
    maxX !== null &&
    maxY !== null
  ) {
    return {
      minX,
      minY,
      maxX,
      maxY,
    };
  }

  return null;
}

function expandInsertInstances(insert: IInsertEntity) {
  const rowCount = Math.max(1, finiteOrDefault(insert.rowCount, 1));
  const columnCount = Math.max(1, finiteOrDefault(insert.columnCount, 1));
  const rowSpacing = finiteOrDefault(insert.rowSpacing, 0);
  const columnSpacing = finiteOrDefault(insert.columnSpacing, 0);
  const base = pointFromDxf(insert.position);
  const instances: Array<{ key: string; insertion: Point2D }> = [];

  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      instances.push({
        key: `r${row}c${column}`,
        insertion: {
          x: base.x + column * columnSpacing,
          y: base.y + row * rowSpacing,
        },
      });
    }
  }

  return instances;
}

function transformPoint(point: Point2D, transform?: BlockTransform): Point2D {
  if (!transform) {
    return point;
  }

  const localX = (point.x - transform.blockBase.x) * transform.scaleX;
  const localY = (point.y - transform.blockBase.y) * transform.scaleY;
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);

  return {
    x: localX * cos - localY * sin + transform.insertion.x,
    y: localX * sin + localY * cos + transform.insertion.y,
  };
}

function transformTextMetrics(
  rotationDegrees: number,
  widthFactor: number,
  transform?: BlockTransform,
) {
  const sourceRotation = degreesToRadians(rotationDegrees);
  const scaleX = transform?.scaleX ?? 1;
  const scaleY = transform?.scaleY ?? 1;
  const baseline = {
    x: Math.cos(sourceRotation) * scaleX,
    y: Math.sin(sourceRotation) * scaleY,
  };
  const vertical = {
    x: -Math.sin(sourceRotation) * scaleX,
    y: Math.cos(sourceRotation) * scaleY,
  };
  const outerRotation = transform?.rotation ?? 0;
  const cos = Math.cos(outerRotation);
  const sin = Math.sin(outerRotation);
  const rotatedBaseline = {
    x: baseline.x * cos - baseline.y * sin,
    y: baseline.x * sin + baseline.y * cos,
  };
  const baselineScale = Math.hypot(baseline.x, baseline.y);
  const heightScale = Math.hypot(vertical.x, vertical.y);

  return {
    heightScale,
    rotation: Math.atan2(rotatedBaseline.y, rotatedBaseline.x),
    widthFactor:
      finiteOrDefault(widthFactor, 1) *
      (heightScale > Number.EPSILON ? baselineScale / heightScale : 1),
  };
}

function plainMtext(value: string) {
  return value
    .replace(/\\P/gi, "\n")
    .replace(/\\~/g, " ")
    .replace(/\\[AaCcFfHhQqTtWw][^;]*;/g, "")
    .replace(/\\S([^;^\\/]+)[^;]*[\^\\/]([^;]+);/g, "$1/$2")
    .replace(/[{}]/g, "");
}

function transformArcGeometry(entity: IArcEntity, transform?: BlockTransform) {
  const sourceCenter = pointFromDxf(entity.center);
  const center = transformPoint(sourceCenter, transform);
  const radiusScale = Math.abs(transform?.scaleX ?? 1);
  const radius = Math.abs(entity.radius * radiusScale);
  const startPoint = transformPoint(pointOnSourceArc(entity, entity.startAngle), transform);
  const endPoint = transformPoint(pointOnSourceArc(entity, entity.endAngle), transform);
  const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
  const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);

  if ((transform?.scaleX ?? 1) * (transform?.scaleY ?? 1) < 0) {
    return {
      center,
      endAngle: startAngle,
      radius,
      startAngle: endAngle,
    };
  }

  return {
    center,
    endAngle,
    radius,
    startAngle,
  };
}

function pointOnSourceArc(entity: IArcEntity, angle: number): Point2D {
  return {
    x: entity.center.x + Math.cos(angle) * entity.radius,
    y: entity.center.y + Math.sin(angle) * entity.radius,
  };
}

function pointFromDxf(point: DxfPoint | undefined): Point2D {
  return {
    x: finiteOrDefault(point?.x, 0),
    y: finiteOrDefault(point?.y, 0),
  };
}

function layerName(layer: string | undefined): string {
  return layer && layer.trim().length > 0 ? layer : "0";
}

function resolveLayer(layer: string | undefined, inheritedLayer?: string): string {
  const ownLayer = layerName(layer);
  return ownLayer === "0" && inheritedLayer ? inheritedLayer : ownLayer;
}

function stableEntityKey(entity: IEntity, index: number): string {
  const handle = entity.handle;
  return handle === undefined || handle === null ? String(index) : String(handle);
}

function primitiveId(sourcePath: string) {
  return sourcePath.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function finiteOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveOrDefault(value: unknown, fallback: number): number {
  const finite = finiteOrDefault(value, fallback);
  return finite > 0 ? finite : fallback;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDxfInteger(value: string | undefined) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

function parseDxfNumber(value: string | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function colorNumberToHex(color: unknown): string | null {
  if (typeof color !== "number" || !Number.isFinite(color)) {
    return null;
  }

  return `#${Math.trunc(color).toString(16).padStart(6, "0").slice(-6)}`;
}

function trueColorNumberToHex(color: number | null): string | null {
  if (color === null) {
    return null;
  }

  return `#${(Math.trunc(color) & 0xffffff).toString(16).padStart(6, "0")}`;
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.000001;
}

function insunitsLabel(code: number): string | null {
  const labels: Record<number, string> = {
    0: "sin unidades",
    1: "pulgadas",
    2: "pies",
    3: "millas",
    4: "milimetros",
    5: "centimetros",
    6: "metros",
    7: "kilometros",
    8: "micropulgadas",
    9: "mils",
    10: "yardas",
    11: "angstroms",
    12: "nanometros",
    13: "micrones",
    14: "decimetros",
    15: "decametros",
    16: "hectometros",
    17: "gigametros",
    18: "unidades astronomicas",
    19: "anos luz",
    20: "parsecs",
  };

  return labels[code] ?? null;
}
