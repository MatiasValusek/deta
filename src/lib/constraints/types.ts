import type { Bounds, Point2D } from "@/lib/geometry/types";

export type ConstraintSource = "dxf" | "pdf";

export type ConstraintType = "hard_obstacle" | "avoid_zone";

export type ConstraintToolMode =
  | "none"
  | "select"
  | "draw_hard_rect"
  | "draw_hard_polygon"
  | "draw_avoid_polygon";

export type ManualConstraint = {
  id: string;
  source: ConstraintSource;
  pageNumber: number | null;
  type: ConstraintType;
  polygon: Point2D[];
  origin: "manual";
  active: boolean;
};

export type ConstraintDraft = {
  source: ConstraintSource;
  pageNumber: number | null;
  type: ConstraintType;
  shape: "rectangle" | "polygon";
  points: Point2D[];
  previewPoint: Point2D | null;
};

export type StructuralConstraintIndex = {
  entityIds: string[];
  byEntityId: Record<string, true>;
};

export type ConstraintSummary = {
  structuralPrimitiveCount: number;
  manualObstacleCount: number;
  avoidZoneCount: number;
  activeRestrictionCount: number;
};

export type ConstraintHit = {
  constraintId: string;
};

export type ConstraintVertexHit = ConstraintHit & {
  vertexIndex: number;
};

export type PolygonBounds = Bounds;
