export type Point2D = {
  x: number;
  y: number;
};

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type DrawingUnits = {
  code: number | null;
  label: string | null;
  source: "$INSUNITS" | "missing";
};

export type DrawingLayer = {
  id: string;
  name: string;
  visible: boolean;
  color: string | null;
  colorIndex: number | null;
  trueColor: string | null;
  trueColorValue: number | null;
};

export type DrawingColorSource =
  | "explicit"
  | "truecolor"
  | "bylayer"
  | "byblock"
  | "default"
  | "missing";

export type DrawingVisualMetadata = {
  originalLayer: string;
  resolvedLayer: string;
  explicitColor: string | null;
  explicitColorIndex: number | null;
  explicitTrueColor: string | null;
  explicitTrueColorValue: number | null;
  layerColor: string | null;
  layerColorIndex: number | null;
  layerTrueColor: string | null;
  layerTrueColorValue: number | null;
  blockColor: string | null;
  blockColorIndex: number | null;
  blockTrueColor: string | null;
  blockTrueColorValue: number | null;
  resolvedColor: string | null;
  colorSource: DrawingColorSource;
  lineType: string | null;
  lineweight: number | null;
  blockName: string | null;
  sourceEntityType: string;
};

export type HatchBoundaryKind = "polyline";

export type HatchBoundary = {
  kind: HatchBoundaryKind;
  typeFlag: number | null;
  points: Point2D[];
};

type BasePrimitive = {
  id: string;
  layer: string;
  sourceType: string;
  sourcePath: string;
  color: string | null;
  visual: DrawingVisualMetadata;
};

export type LinePrimitive = BasePrimitive & {
  kind: "line";
  start: Point2D;
  end: Point2D;
};

export type PolylinePrimitive = BasePrimitive & {
  kind: "polyline";
  points: Point2D[];
  closed: boolean;
};

export type ArcPrimitive = BasePrimitive & {
  kind: "arc";
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
};

export type HatchPrimitive = BasePrimitive & {
  kind: "hatch";
  handle: string | null;
  blockName: string | null;
  solidFill: boolean;
  patternName: string | null;
  outerRing: Point2D[];
  innerRings: Point2D[][];
  rings: Point2D[][];
  boundaries: HatchBoundary[];
};

export type DrawingPrimitive =
  | LinePrimitive
  | PolylinePrimitive
  | ArcPrimitive
  | HatchPrimitive;

export type EntityCountMap = Record<string, number>;

export type IgnoredEntity = {
  type: string;
  count: number;
  location: "ENTITIES" | "BLOCKS";
  reason: string;
};

export type ImportWarning = {
  message: string;
  entityType?: string;
  sourcePath?: string;
};

export type NormalizedDrawing = {
  fileName: string;
  units: DrawingUnits;
  layers: DrawingLayer[];
  entities: DrawingPrimitive[];
  bounds: Bounds | null;
  headerBounds: Bounds | null;
  rawEntityCounts: {
    ENTITIES: EntityCountMap;
    BLOCKS: EntityCountMap;
  };
  normalizedCounts: EntityCountMap;
  supportedSourceTypes: string[];
  ignoredEntities: IgnoredEntity[];
  warnings: ImportWarning[];
};
