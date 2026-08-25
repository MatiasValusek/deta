import { boundsHeight, boundsWidth } from "./bounds";
import type { Bounds, Point2D } from "./types";

export type ViewportSize = {
  width: number;
  height: number;
};

export type ViewTransform = ViewportSize & {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function createFitTransform(
  bounds: Bounds,
  size: ViewportSize,
  padding = 32,
): ViewTransform {
  const drawingWidth = Math.max(boundsWidth(bounds), 1);
  const drawingHeight = Math.max(boundsHeight(bounds), 1);
  const availableWidth = Math.max(size.width - padding * 2, 1);
  const availableHeight = Math.max(size.height - padding * 2, 1);
  const scale = Math.min(
    availableWidth / drawingWidth,
    availableHeight / drawingHeight,
  );
  const fittedWidth = drawingWidth * scale;
  const fittedHeight = drawingHeight * scale;
  const left = (size.width - fittedWidth) / 2;
  const top = (size.height - fittedHeight) / 2;

  return {
    ...size,
    scale,
    offsetX: left - bounds.minX * scale,
    offsetY: top + bounds.maxY * scale,
  };
}

export function worldToScreen(
  point: Point2D,
  transform: ViewTransform,
): Point2D {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: -point.y * transform.scale + transform.offsetY,
  };
}

export function screenToWorld(
  point: Point2D,
  transform: ViewTransform,
): Point2D {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: -(point.y - transform.offsetY) / transform.scale,
  };
}

export function panTransform(
  transform: ViewTransform,
  delta: Point2D,
): ViewTransform {
  return {
    ...transform,
    offsetX: transform.offsetX + delta.x,
    offsetY: transform.offsetY + delta.y,
  };
}

export function zoomTransformAt(
  transform: ViewTransform,
  screenPoint: Point2D,
  factor: number,
): ViewTransform {
  const worldPoint = screenToWorld(screenPoint, transform);
  const scale = clamp(transform.scale * factor, 0.001, 100000);

  return {
    ...transform,
    scale,
    offsetX: screenPoint.x - worldPoint.x * scale,
    offsetY: screenPoint.y + worldPoint.y * scale,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
