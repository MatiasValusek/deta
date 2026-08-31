"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  createPdfFitTransform,
  panPdfTransform,
  pdfScreenToSource,
  pdfSourceToScreen,
  zoomPdfTransformAt,
  type PdfViewTransform,
} from "@/lib/pdf/pdfViewport";
import type { Bounds, Point2D } from "@/lib/geometry/types";
import type { PdfPageModel } from "@/lib/pdf/types";
import {
  createRectanglePolygon,
  findConstraintAtPoint,
  findNearestConstraintVertex,
} from "@/lib/constraints/geometry";
import type {
  ConstraintDraft,
  ConstraintToolMode,
  ManualConstraint,
} from "@/lib/constraints/types";
import type {
  EquipmentDraft,
  EquipmentPlacementMode,
  WorkbenchEquipment,
} from "@/lib/equipment/types";
import type {
  AutomaticRouteProposal,
  ManualRouteNetwork,
  RouteDraft,
  RouteIntentConnection,
  RouteIntentDraft,
  RouteToolMode,
} from "@/lib/routing/types";
import { ConstraintsOverlay } from "./ConstraintsOverlay";
import { EquipmentOverlay } from "./EquipmentOverlay";
import { RouteOverlay } from "./RouteOverlay";
import {
  SectionLinksOverlay,
  type SectionLinkDraftOverlay,
  type SectionLinkToolMode,
  type SectionPlanLink,
  type SectionViewSide,
} from "./SectionLinksOverlay";
import {
  SectionRegistrationOverlay,
  type SectionRegistrationDraftOverlay,
  type SectionRegistrationSavedOverlay,
  type SectionRegistrationToolMode,
} from "./SectionRegistrationOverlay";
import { SectionRouteProjectionOverlay } from "./SectionRouteProjectionOverlay";
import { SourceOverlay, type SourceOverlayData } from "./SourceOverlay";
import type { SectionRouteProjection } from "@/lib/sections/routeProjection";
import type { SectionRouteHeightTarget } from "@/lib/sections/routeHeightEditing";
import type { PhysicalRouteEditSelection } from "@/lib/routing/physicalRouteEditing";

type PdfViewerProps = {
  activePage: PdfPageModel | null;
  baseId: string;
  constraintDraft: ConstraintDraft | null;
  constraints: ManualConstraint[];
  constraintToolMode: ConstraintToolMode;
  documentProxy: PDFDocumentProxy | null;
  fitBounds?: Bounds | null;
  fitNonce: number;
  isPointSelectionActive: boolean;
  overlay: SourceOverlayData;
  equipment: WorkbenchEquipment[];
  equipmentDraft: EquipmentDraft | null;
  equipmentPlacementMode: EquipmentPlacementMode;
  hoveredEquipmentId: string | null;
  highlightedRouteSegmentIds: Set<string>;
  invalidRouteSegmentIds: Set<string>;
  isRouteEditing: boolean;
  routeProposal: AutomaticRouteProposal | null;
  routeProposalOutdated: boolean;
  routeDraft: RouteDraft | null;
  routeIntentConnections: RouteIntentConnection[];
  routeIntentDraft: RouteIntentDraft | null;
  routeNetwork: ManualRouteNetwork;
  routeToolMode: RouteToolMode;
  savedView: PdfViewTransform | null;
  selectedEquipmentId: string | null;
  selectedConstraintId: string | null;
  sectionLinkDraft: SectionLinkDraftOverlay | null;
  sectionLinkMode: SectionLinkToolMode;
  sectionLinks: SectionPlanLink[];
  sectionNames: Record<string, string>;
  sectionRegistrationDraft: SectionRegistrationDraftOverlay | null;
  sectionRegistrationMode: SectionRegistrationToolMode;
  sectionRegistrationSaved: SectionRegistrationSavedOverlay | null;
  sectionRouteProjection: SectionRouteProjection | null;
  selectedSectionRouteHeightTarget: SectionRouteHeightTarget | null;
  selectedRouteEdit: PhysicalRouteEditSelection | null;
  showConstraints: boolean;
  onConstraintCreateRectangle: (start: Point2D, end: Point2D) => void;
  onConstraintDraftPoint: (point: Point2D) => void;
  onConstraintMove: (constraintId: string, delta: Point2D) => void;
  onConstraintMoveVertex: (
    constraintId: string,
    vertexIndex: number,
    point: Point2D,
  ) => void;
  onConstraintPreviewPoint: (point: Point2D | null) => void;
  onConstraintSelect: (constraintId: string | null) => void;
  onCursorChange: (point: Point2D | null) => void;
  onEquipmentHover: (equipmentId: string | null) => void;
  onEquipmentPoint: (point: Point2D) => void;
  onEquipmentPreview: (point: Point2D | null) => void;
  onEquipmentSelect: (equipmentId: string) => void;
  onPhysicalRouteElementSelect: (selection: PhysicalRouteEditSelection) => void;
  onPhysicalRouteNodeMove: (
    nodeId: string,
    point: Point2D,
    tolerance: number,
  ) => void;
  onPhysicalRouteVertexInsert: (
    segmentId: string,
    point: Point2D,
    tolerance: number,
  ) => void;
  onPhysicalRouteVertexMove: (
    segmentId: string,
    vertexIndex: number,
    point: Point2D,
    tolerance: number,
  ) => void;
  onRoutePoint: (point: Point2D, tolerance: number, equipmentId?: string) => void;
  onRoutePreview: (point: Point2D | null, tolerance: number | null) => void;
  onSectionLinkHover: (linkId: string | null) => void;
  onSectionLinkPoint: (point: Point2D) => void;
  onSectionLinkPreview: (point: Point2D | null) => void;
  onSectionLinkSide: (side: SectionViewSide) => void;
  onSectionLinkOpen: (sectionBaseId: string) => void;
  onSectionRegistrationPoint: (point: Point2D) => void;
  onSectionRegistrationPreview: (point: Point2D | null) => void;
  onSectionRegistrationSide: (side: SectionViewSide) => void;
  onSectionRouteHeightTargetSelect?: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
  onSourcePoint: (point: Point2D) => void;
  onViewChange: (baseId: string, view: PdfViewTransform | null) => void;
  highlightedSectionLinkId: string | null;
  hoveredSectionLinkId: string | null;
  showEquipment: boolean;
  showRoute: boolean;
};

type PanState = {
  pointerId: number;
  point: Point2D;
};

type RectDraft = {
  pointerId: number;
  start: Point2D;
  current: Point2D;
};

type ConstraintDragState =
  | {
      pointerId: number;
      kind: "move";
      constraintId: string;
      previous: Point2D;
    }
  | {
      pointerId: number;
      kind: "vertex";
      constraintId: string;
      vertexIndex: number;
    };

const ROUTE_POINTER_TOLERANCE_PX = 14;
const ROUTE_EQUIPMENT_HITBOX_RADIUS_PX = 22;
const VIEW_REPORT_DEBOUNCE_MS = 120;

export function PdfViewer({
  activePage,
  baseId,
  constraintDraft,
  constraints,
  constraintToolMode,
  documentProxy,
  fitBounds,
  fitNonce,
  isPointSelectionActive,
  overlay,
  equipment,
  equipmentDraft,
  equipmentPlacementMode,
  hoveredEquipmentId,
  highlightedRouteSegmentIds,
  invalidRouteSegmentIds,
  isRouteEditing,
  routeProposal,
  routeProposalOutdated,
  routeDraft,
  routeIntentConnections,
  routeIntentDraft,
  routeNetwork,
  routeToolMode,
  savedView,
  selectedEquipmentId,
  selectedConstraintId,
  sectionLinkDraft,
  sectionLinkMode,
  sectionLinks,
  sectionNames,
  sectionRegistrationDraft,
  sectionRegistrationMode,
  sectionRegistrationSaved,
  sectionRouteProjection,
  selectedSectionRouteHeightTarget,
  selectedRouteEdit,
  showConstraints,
  onConstraintCreateRectangle,
  onConstraintDraftPoint,
  onConstraintMove,
  onConstraintMoveVertex,
  onConstraintPreviewPoint,
  onConstraintSelect,
  onCursorChange,
  onEquipmentHover,
  onEquipmentPoint,
  onEquipmentPreview,
  onEquipmentSelect,
  onPhysicalRouteElementSelect,
  onPhysicalRouteNodeMove,
  onPhysicalRouteVertexInsert,
  onPhysicalRouteVertexMove,
  onRoutePoint,
  onRoutePreview,
  onSectionLinkHover,
  onSectionLinkPoint,
  onSectionLinkPreview,
  onSectionLinkSide,
  onSectionLinkOpen,
  onSectionRegistrationPoint,
  onSectionRegistrationPreview,
  onSectionRegistrationSide,
  onSectionRouteHeightTargetSelect,
  onSourcePoint,
  onViewChange,
  highlightedSectionLinkId,
  hoveredSectionLinkId,
  showEquipment,
  showRoute,
}: PdfViewerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panStateRef = useRef<PanState | null>(null);
  const constraintDragRef = useRef<ConstraintDragState | null>(null);
  const previousBaseIdRef = useRef<string | null>(null);
  const previousFitBoundsKeyRef = useRef<string | null>(null);
  const previousFitNonceRef = useRef(fitNonce);
  const [rectDraft, setRectDraft] = useState<RectDraft | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<PdfViewTransform | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const viewRef = useRef<PdfViewTransform | null>(null);
  const lastReportedViewRef = useRef<{
    baseId: string;
    view: PdfViewTransform | null;
  } | null>(null);
  const pendingReportedViewRef = useRef<{
    baseId: string;
    view: PdfViewTransform | null;
  } | null>(null);
  const viewReportTimerRef = useRef<number | null>(null);

  const overlayDraft = useMemo(() => {
    if (!rectDraft) {
      return constraintDraft;
    }

    return {
      source: "pdf" as const,
      pageNumber: activePage?.pageNumber ?? null,
      type: "hard_obstacle" as const,
      shape: "rectangle" as const,
      points: createRectanglePolygon(rectDraft.start, rectDraft.current),
      previewPoint: null,
    };
  }, [activePage?.pageNumber, constraintDraft, rectDraft]);

  const pageSize = useMemo(() => {
    if (!activePage) {
      return null;
    }

    return {
      width: activePage.width,
      height: activePage.height,
    };
  }, [activePage]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const rect = entry.contentRect;
      setSize({
        width: Math.max(Math.floor(rect.width), 1),
        height: Math.max(Math.floor(rect.height), 1),
      });
    });

    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pageSize || size.width <= 0 || size.height <= 0) {
      commitLocalView(null, true);
      previousBaseIdRef.current = baseId;
      previousFitBoundsKeyRef.current = null;
      previousFitNonceRef.current = fitNonce;
      return;
    }

    const targetFitBoundsKey = fitBounds ? boundsKey(fitBounds) : null;
    const shouldRefit =
      previousBaseIdRef.current === baseId &&
      (previousFitNonceRef.current !== fitNonce ||
        previousFitBoundsKeyRef.current !== targetFitBoundsKey);
    const nextView =
      savedView && !shouldRefit
        ? savedView
        : fitBounds
          ? createPdfBoundsFitTransform(fitBounds, size, 36)
          : createPdfFitTransform(pageSize, size, 36);

    commitLocalView(nextView, !savedView || shouldRefit);
    previousBaseIdRef.current = baseId;
    previousFitBoundsKeyRef.current = targetFitBoundsKey;
    previousFitNonceRef.current = fitNonce;
  }, [baseId, fitBounds, fitNonce, pageSize, savedView, size.height, size.width]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    return () => {
      if (viewReportTimerRef.current !== null) {
        window.clearTimeout(viewReportTimerRef.current);
      }
    };
  }, []);

  function commitLocalView(
    nextView: PdfViewTransform | null,
    shouldNotify: boolean,
  ) {
    const viewChanged = !pdfViewTransformsEqual(viewRef.current, nextView);

    viewRef.current = nextView;

    if (viewChanged) {
      setView(nextView);
    }

    if (shouldNotify) {
      scheduleViewChangeReport(baseId, nextView);
    }
  }

  function scheduleViewChangeReport(
    ownerBaseId: string,
    nextView: PdfViewTransform | null,
  ) {
    pendingReportedViewRef.current = {
      baseId: ownerBaseId,
      view: nextView ? { ...nextView } : null,
    };

    if (viewReportTimerRef.current !== null) {
      window.clearTimeout(viewReportTimerRef.current);
    }

    viewReportTimerRef.current = window.setTimeout(() => {
      flushViewChangeReport();
    }, VIEW_REPORT_DEBOUNCE_MS);
  }

  function flushViewChangeReport() {
    const pending = pendingReportedViewRef.current;

    if (!pending) {
      return;
    }

    if (viewReportTimerRef.current !== null) {
      window.clearTimeout(viewReportTimerRef.current);
      viewReportTimerRef.current = null;
    }

    pendingReportedViewRef.current = null;
    reportViewChange(pending.baseId, pending.view);
  }

  function reportViewChange(
    ownerBaseId: string,
    nextView: PdfViewTransform | null,
  ) {
    const lastReported = lastReportedViewRef.current;

    if (
      lastReported?.baseId === ownerBaseId &&
      pdfViewTransformsEqual(lastReported.view, nextView)
    ) {
      return;
    }

    lastReportedViewRef.current = {
      baseId: ownerBaseId,
      view: nextView ? { ...nextView } : null,
    };
    onViewChange(ownerBaseId, nextView);
  }

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!documentProxy || !activePage || !view || !canvas) {
      return;
    }

    const pageNumber = activePage.pageNumber;
    const currentCanvas = canvas;
    const currentDocument = documentProxy;
    const currentView = view;
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    async function renderPage() {
      try {
        setRenderError(null);
        const page = await currentDocument.getPage(pageNumber);

        if (cancelled) {
          return;
        }

        const outputScale = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: currentView.scale * outputScale });
        const context = currentCanvas.getContext("2d");

        if (!context) {
          throw new Error("No se pudo obtener el contexto canvas.");
        }

        currentCanvas.width = Math.max(Math.floor(viewport.width), 1);
        currentCanvas.height = Math.max(Math.floor(viewport.height), 1);

        renderTask = page.render({
          canvas: currentCanvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled) {
          setRenderError(
            error instanceof Error
              ? error.message
              : "No se pudo renderizar la pagina PDF.",
          );
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [activePage, documentProxy, view]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const currentView = viewRef.current;

    if (!currentView) {
      return;
    }

    const point = eventPoint(event);

    if (equipmentPlacementMode === "placing") {
      onEquipmentPoint(pdfScreenToSource(point, currentView));
      return;
    }

    if (routeToolMode !== "inactive") {
      onRoutePoint(
        pdfScreenToSource(point, currentView),
        ROUTE_POINTER_TOLERANCE_PX / currentView.scale,
      );
      return;
    }

    if (sectionRegistrationMode !== "inactive") {
      if (
        sectionRegistrationMode === "start" ||
        sectionRegistrationMode === "end"
      ) {
        onSectionRegistrationPoint(pdfScreenToSource(point, currentView));
      }

      return;
    }

    if (sectionLinkMode !== "inactive") {
      if (sectionLinkMode === "start" || sectionLinkMode === "end") {
        onSectionLinkPoint(pdfScreenToSource(point, currentView));
      }

      return;
    }

    if (isPointSelectionActive) {
      onSourcePoint(pdfScreenToSource(point, currentView));
      return;
    }

    if (handleConstraintPointerDown(event, point, currentView)) {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      point,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const point = eventPoint(event);
    const currentView = viewRef.current;

    if (equipmentPlacementMode === "placing") {
      if (currentView) {
        const sourcePoint = pdfScreenToSource(point, currentView);
        onCursorChange(sourcePoint);
        onEquipmentPreview(sourcePoint);
      }

      return;
    }

    if (routeToolMode !== "inactive") {
      if (currentView) {
        const sourcePoint = pdfScreenToSource(point, currentView);
        onCursorChange(sourcePoint);
        onRoutePreview(
          sourcePoint,
          ROUTE_POINTER_TOLERANCE_PX / currentView.scale,
        );
      }

      return;
    }

    if (sectionRegistrationMode !== "inactive") {
      if (currentView) {
        const sourcePoint = pdfScreenToSource(point, currentView);
        onCursorChange(sourcePoint);

        if (sectionRegistrationMode === "end") {
          onSectionRegistrationPreview(sourcePoint);
        }
      }

      return;
    }

    if (sectionLinkMode !== "inactive") {
      if (currentView) {
        const sourcePoint = pdfScreenToSource(point, currentView);
        onCursorChange(sourcePoint);

        if (sectionLinkMode === "end") {
          onSectionLinkPreview(sourcePoint);
        }
      }

      return;
    }

    if (handleConstraintPointerMove(point, currentView)) {
      return;
    }

    if (panStateRef.current) {
      const previous = panStateRef.current.point;
      const delta = {
        x: point.x - previous.x,
        y: point.y - previous.y,
      };

      const next = currentView ? panPdfTransform(currentView, delta) : currentView;
      commitLocalView(next, true);
      panStateRef.current = {
        ...panStateRef.current,
        point,
      };
      return;
    }

    if (currentView) {
      onCursorChange(pdfScreenToSource(point, currentView));
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (handleConstraintPointerUp(event, viewRef.current)) {
      return;
    }

    if (panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      flushViewChangeReport();
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const currentView = viewRef.current;

    if (!currentView) {
      return;
    }

    const point = eventPoint(event);
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    commitLocalView(zoomPdfTransformAt(currentView, point, factor), true);
  }

  function handleConstraintPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    point: Point2D,
    currentView: PdfViewTransform,
  ) {
    if (constraintToolMode === "none") {
      return false;
    }

    const sourcePoint = pdfScreenToSource(point, currentView);

    if (constraintToolMode === "draw_hard_rect") {
      setRectDraft({
        pointerId: event.pointerId,
        start: sourcePoint,
        current: sourcePoint,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return true;
    }

    if (
      constraintToolMode === "draw_hard_polygon" ||
      constraintToolMode === "draw_avoid_polygon"
    ) {
      onConstraintDraftPoint(sourcePoint);
      return true;
    }

    const tolerance = 10 / currentView.scale;
    const vertexHit = findNearestConstraintVertex(
      sourcePoint,
      constraints,
      tolerance,
    );

    if (vertexHit) {
      onConstraintSelect(vertexHit.constraintId);
      constraintDragRef.current = {
        pointerId: event.pointerId,
        kind: "vertex",
        constraintId: vertexHit.constraintId,
        vertexIndex: vertexHit.vertexIndex,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return true;
    }

    const constraintHit = findConstraintAtPoint(sourcePoint, constraints);

    if (constraintHit) {
      onConstraintSelect(constraintHit.constraintId);
      constraintDragRef.current = {
        pointerId: event.pointerId,
        kind: "move",
        constraintId: constraintHit.constraintId,
        previous: sourcePoint,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return true;
    }

    onConstraintSelect(null);
    return true;
  }

  function handleConstraintPointerMove(
    point: Point2D,
    currentView: PdfViewTransform | null,
  ) {
    if (!currentView) {
      return false;
    }

    const sourcePoint = pdfScreenToSource(point, currentView);

    if (constraintDragRef.current) {
      const drag = constraintDragRef.current;

      if (drag.kind === "move") {
        const delta = {
          x: sourcePoint.x - drag.previous.x,
          y: sourcePoint.y - drag.previous.y,
        };
        onConstraintMove(drag.constraintId, delta);
        constraintDragRef.current = {
          ...drag,
          previous: sourcePoint,
        };
        return true;
      }

      onConstraintMoveVertex(
        drag.constraintId,
        drag.vertexIndex,
        sourcePoint,
      );
      return true;
    }

    if (rectDraft) {
      setRectDraft((current) =>
        current
          ? {
              ...current,
              current: sourcePoint,
            }
          : current,
      );
      return true;
    }

    if (
      constraintToolMode === "draw_hard_polygon" ||
      constraintToolMode === "draw_avoid_polygon"
    ) {
      onConstraintPreviewPoint(sourcePoint);
      return true;
    }

    return constraintToolMode !== "none";
  }

  function handleConstraintPointerUp(
    event: React.PointerEvent<HTMLDivElement>,
    currentView: PdfViewTransform | null,
  ) {
    if (rectDraft?.pointerId === event.pointerId) {
      onConstraintCreateRectangle(rectDraft.start, rectDraft.current);
      setRectDraft(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return true;
    }

    if (constraintDragRef.current?.pointerId === event.pointerId) {
      constraintDragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      return true;
    }

    return constraintToolMode !== "none" && Boolean(currentView);
  }

  const canvasStyle = activePage && view
    ? {
        height: activePage.height * view.scale,
        left: view.offsetX,
        top: view.offsetY,
        width: activePage.width * view.scale,
      }
    : undefined;

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#eef0ec] p-3">
      <div
        ref={viewportRef}
        className="relative h-full w-full touch-none overflow-hidden border border-[var(--line)] bg-white"
        style={{
          cursor:
            equipmentPlacementMode === "placing" || routeToolMode !== "inactive"
              ? "crosshair"
              : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => {
          onCursorChange(null);
          onEquipmentPreview(null);
          onRoutePreview(null, null);
          onSectionLinkPreview(null);
          onSectionRegistrationPreview(null);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        {!documentProxy || !activePage || !view ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
            Seleccione un PDF
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="absolute block"
              style={canvasStyle}
            />
            <svg
              className="absolute inset-0"
              viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
            >
              <ConstraintsOverlay
                constraints={constraints}
                draft={overlayDraft}
                selectedConstraintId={selectedConstraintId}
                showConstraints={showConstraints}
                sourceToScreen={(point) => pdfSourceToScreen(point, view)}
              />
              <SourceOverlay
                calibrationPoints={overlay.calibrationPoints}
                measurementPoints={overlay.measurementPoints}
                sourceToScreen={(point) => pdfSourceToScreen(point, view)}
              />
              <SectionLinksOverlay
                draft={sectionLinkDraft}
                highlightedLinkId={highlightedSectionLinkId}
                hoveredLinkId={hoveredSectionLinkId}
                links={sectionLinks}
                sectionNames={sectionNames}
                sourceToScreen={(point) => pdfSourceToScreen(point, view)}
                onChooseDraftSide={onSectionLinkSide}
                onHoverLink={onSectionLinkHover}
                onOpenSection={onSectionLinkOpen}
              />
              <SectionRegistrationOverlay
                draft={sectionRegistrationDraft}
                saved={sectionRegistrationSaved}
                sourceToScreen={(point) => pdfSourceToScreen(point, view)}
                onChooseDraftSide={onSectionRegistrationSide}
              />
              <SectionRouteProjectionOverlay
                detailsVisible={Boolean(selectedSectionRouteHeightTarget)}
                projection={sectionRouteProjection}
                selectedHeightTarget={selectedSectionRouteHeightTarget}
                sourceToScreen={(point) => pdfSourceToScreen(point, view)}
                onHeightTargetSelect={onSectionRouteHeightTargetSelect}
              />
              <RouteOverlay
                draft={routeDraft}
                equipment={equipment}
                highlightedSegmentIds={highlightedRouteSegmentIds}
                invalidSegmentIds={invalidRouteSegmentIds}
                isEditingEnabled={
                  isRouteEditing &&
                  routeToolMode === "inactive" &&
                  equipmentPlacementMode === "inactive" &&
                  constraintToolMode === "none" &&
                  sectionLinkMode === "inactive" &&
                  sectionRegistrationMode === "inactive" &&
                  !isPointSelectionActive
                }
                intentConnections={routeIntentConnections}
                intentDraft={routeIntentDraft}
                network={routeNetwork}
                proposal={routeProposal}
                proposalOutdated={routeProposalOutdated}
                routeEditTolerance={ROUTE_POINTER_TOLERANCE_PX / view.scale}
                screenToSource={(point) => pdfScreenToSource(point, view)}
                selectedEdit={selectedRouteEdit}
                showRoute={showRoute}
                sourceToScreen={(point) => pdfSourceToScreen(point, view)}
                onElementSelect={onPhysicalRouteElementSelect}
                onNodeMove={onPhysicalRouteNodeMove}
                onVertexInsert={onPhysicalRouteVertexInsert}
                onVertexMove={onPhysicalRouteVertexMove}
              />
              <EquipmentOverlay
                draft={equipmentDraft}
                equipment={equipment}
                hoveredEquipmentId={hoveredEquipmentId}
                isInteractionDisabled={routeToolMode !== "inactive"}
                routeDraft={routeDraft}
                routeIntentDraft={routeIntentDraft}
                routeHitTolerance={ROUTE_EQUIPMENT_HITBOX_RADIUS_PX / view.scale}
                selectedEquipmentId={selectedEquipmentId}
                showEquipment={showEquipment}
                sourceToScreen={(point) => pdfSourceToScreen(point, view)}
                onHoverEquipment={onEquipmentHover}
                onRouteEquipmentPoint={onRoutePoint}
                onSelectEquipment={onEquipmentSelect}
              />
            </svg>
          </>
        )}

        {renderError ? (
          <div className="absolute left-3 top-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {renderError}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function eventPoint(
  event: React.PointerEvent<HTMLDivElement> | React.WheelEvent<HTMLDivElement>,
): Point2D {
  const rect = event.currentTarget.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function pdfViewTransformsEqual(
  first: PdfViewTransform | null,
  second: PdfViewTransform | null,
) {
  if (!first || !second) {
    return first === second;
  }

  return (
    first.width === second.width &&
    first.height === second.height &&
    first.scale === second.scale &&
    first.offsetX === second.offsetX &&
    first.offsetY === second.offsetY
  );
}

function createPdfBoundsFitTransform(
  bounds: Bounds,
  size: { width: number; height: number },
  padding = 32,
): PdfViewTransform {
  const boundsWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const boundsHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const availableWidth = Math.max(size.width - padding * 2, 1);
  const availableHeight = Math.max(size.height - padding * 2, 1);
  const scale = Math.min(
    availableWidth / boundsWidth,
    availableHeight / boundsHeight,
  );
  const fittedWidth = boundsWidth * scale;
  const fittedHeight = boundsHeight * scale;

  return {
    ...size,
    scale,
    offsetX: (size.width - fittedWidth) / 2 - bounds.minX * scale,
    offsetY: (size.height - fittedHeight) / 2 - bounds.minY * scale,
  };
}

function boundsKey(bounds: Bounds) {
  return [
    bounds.minX,
    bounds.minY,
    bounds.maxX,
    bounds.maxY,
  ]
    .map((value) => value.toFixed(3))
    .join(":");
}
