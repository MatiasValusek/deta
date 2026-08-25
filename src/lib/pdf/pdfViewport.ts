import type { Point2D } from "@/lib/geometry/types";
import type { ViewportSize } from "@/lib/geometry/viewport";
import type { PdfPageSize } from "./types";

export type PdfViewTransform = ViewportSize & {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function createPdfFitTransform(
  page: PdfPageSize,
  size: ViewportSize,
  padding = 32,
): PdfViewTransform {
  const pageWidth = Math.max(page.width, 1);
  const pageHeight = Math.max(page.height, 1);
  const availableWidth = Math.max(size.width - padding * 2, 1);
  const availableHeight = Math.max(size.height - padding * 2, 1);
  const scale = Math.min(
    availableWidth / pageWidth,
    availableHeight / pageHeight,
  );
  const fittedWidth = pageWidth * scale;
  const fittedHeight = pageHeight * scale;

  return {
    ...size,
    scale,
    offsetX: (size.width - fittedWidth) / 2,
    offsetY: (size.height - fittedHeight) / 2,
  };
}

export function pdfSourceToScreen(
  point: Point2D,
  transform: PdfViewTransform,
): Point2D {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  };
}

export function pdfScreenToSource(
  point: Point2D,
  transform: PdfViewTransform,
): Point2D {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale,
  };
}

export function panPdfTransform(
  transform: PdfViewTransform,
  delta: Point2D,
): PdfViewTransform {
  return {
    ...transform,
    offsetX: transform.offsetX + delta.x,
    offsetY: transform.offsetY + delta.y,
  };
}

export function zoomPdfTransformAt(
  transform: PdfViewTransform,
  screenPoint: Point2D,
  factor: number,
): PdfViewTransform {
  const sourcePoint = pdfScreenToSource(screenPoint, transform);
  const scale = clamp(transform.scale * factor, 0.01, 100);

  return {
    ...transform,
    scale,
    offsetX: screenPoint.x - sourcePoint.x * scale,
    offsetY: screenPoint.y - sourcePoint.y * scale,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
