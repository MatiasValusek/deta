"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createFitTransform,
  panTransform,
  screenToWorld,
  worldToScreen,
  zoomTransformAt,
  type ViewTransform,
} from "@/lib/geometry/viewport";
import type {
  ArcPrimitive,
  DrawingLayer,
  DrawingPrimitive,
  NormalizedDrawing,
  Point2D,
} from "@/lib/geometry/types";
import {
  addEntityToBounds,
  createEmptyBounds,
  isValidBounds,
  normalizePositive,
} from "@/lib/geometry/bounds";
import type {
  ClassificationIndex,
  ManualSelectionMode,
  SemanticViewMode,
} from "@/lib/semantic/types";
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
import type { LayerVisibility } from "./DxfWorkbench";
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

type DxfViewerProps = {
  baseId: string;
  drawing: NormalizedDrawing | null;
  visibleLayers: LayerVisibility;
  classificationIndex: ClassificationIndex;
  constraintDraft: ConstraintDraft | null;
  constraints: ManualConstraint[];
  constraintToolMode: ConstraintToolMode;
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
  pendingEntityIds: string[];
  routeProposal: AutomaticRouteProposal | null;
  routeProposalOutdated: boolean;
  routeDraft: RouteDraft | null;
  routeIntentConnections: RouteIntentConnection[];
  routeIntentDraft: RouteIntentDraft | null;
  routeNetwork: ManualRouteNetwork;
  routeToolMode: RouteToolMode;
  savedView: ViewTransform | null;
  selectedEquipmentId: string | null;
  selectedEntityIds: string[];
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
  selectionMode: ManualSelectionMode;
  semanticViewMode: SemanticViewMode;
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
  onEntityToggle: (entityId: string) => void;
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
  onRectangleSelect: (entityIds: string[]) => void;
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
  onViewChange: (baseId: string, view: ViewTransform | null) => void;
  highlightedSectionLinkId: string | null;
  hoveredSectionLinkId: string | null;
  showEquipment: boolean;
  showRoute: boolean;
};

type PanState = {
  pointerId: number;
  point: Point2D;
};

type SelectionBox = {
  pointerId: number;
  start: Point2D;
  current: Point2D;
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

type PrimitiveStyle = {
  dash?: string;
  fill?: string;
  fillOpacity?: number;
  opacity: number;
  stroke: string;
  width: number;
};

const ROUTE_POINTER_TOLERANCE_PX = 14;
const ROUTE_EQUIPMENT_HITBOX_RADIUS_PX = 22;

export function DxfViewer({
  baseId,
  drawing,
  visibleLayers,
  classificationIndex,
  constraintDraft,
  constraints,
  constraintToolMode,
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
  pendingEntityIds,
  routeProposal,
  routeProposalOutdated,
  routeDraft,
  routeIntentConnections,
  routeIntentDraft,
  routeNetwork,
  routeToolMode,
  savedView,
  selectedEquipmentId,
  selectedEntityIds,
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
  selectionMode,
  semanticViewMode,
  showConstraints,
  onConstraintCreateRectangle,
  onConstraintDraftPoint,
  onConstraintMove,
  onConstraintMoveVertex,
  onConstraintPreviewPoint,
  onConstraintSelect,
  onCursorChange,
  onEntityToggle,
  onEquipmentHover,
  onEquipmentPoint,
  onEquipmentPreview,
  onEquipmentSelect,
  onPhysicalRouteElementSelect,
  onPhysicalRouteNodeMove,
  onPhysicalRouteVertexInsert,
  onPhysicalRouteVertexMove,
  onRectangleSelect,
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
}: DxfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<PanState | null>(null);
  const constraintDragRef = useRef<ConstraintDragState | null>(null);
  const previousBaseIdRef = useRef<string | null>(null);
  const previousFitNonceRef = useRef(fitNonce);
  const [rectDraft, setRectDraft] = useState<RectDraft | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform | null>(null);
  const viewRef = useRef<ViewTransform | null>(null);
  const lastReportedViewRef = useRef<{
    baseId: string;
    view: ViewTransform | null;
  } | null>(null);

  const layerColors = useMemo(
    () => createLayerColorMap(drawing?.layers ?? []),
    [drawing],
  );
  const pendingSet = useMemo(() => new Set(pendingEntityIds), [pendingEntityIds]);
  const selectedSet = useMemo(
    () => new Set(selectedEntityIds),
    [selectedEntityIds],
  );
  const overlayDraft = useMemo(() => {
    if (!rectDraft) {
      return constraintDraft;
    }

    return {
      source: "dxf" as const,
      pageNumber: null,
      type: "hard_obstacle" as const,
      shape: "rectangle" as const,
      points: createRectanglePolygon(rectDraft.start, rectDraft.current),
      previewPoint: null,
    };
  }, [constraintDraft, rectDraft]);

  const visibleEntities = useMemo(() => {
    if (!drawing) {
      return [];
    }

    return drawing.entities.filter(
      (entity) => visibleLayers[entity.layer] ?? true,
    );
  }, [drawing, visibleLayers]);
  const orderedVisibleEntities = useMemo(
    () => [
      ...visibleEntities.filter((entity) => entity.kind === "hatch"),
      ...visibleEntities.filter((entity) => entity.kind !== "hatch"),
    ],
    [visibleEntities],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
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

    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!drawing?.bounds || size.width <= 0 || size.height <= 0) {
      commitLocalView(null, true);
      previousBaseIdRef.current = baseId;
      previousFitNonceRef.current = fitNonce;
      return;
    }

    const shouldRefit =
      previousBaseIdRef.current === baseId &&
      previousFitNonceRef.current !== fitNonce;
    const nextView =
      savedView && !shouldRefit
        ? savedView
        : createFitTransform(drawing.bounds, size, 36);

    commitLocalView(nextView, !savedView || shouldRefit);
    previousBaseIdRef.current = baseId;
    previousFitNonceRef.current = fitNonce;
  }, [baseId, drawing, fitNonce, savedView, size.height, size.width]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  function commitLocalView(nextView: ViewTransform | null, shouldNotify: boolean) {
    const viewChanged = !viewTransformsEqual(viewRef.current, nextView);

    viewRef.current = nextView;

    if (viewChanged) {
      setView(nextView);
    }

    if (shouldNotify) {
      reportViewChange(baseId, nextView);
    }
  }

  function reportViewChange(
    ownerBaseId: string,
    nextView: ViewTransform | null,
  ) {
    const lastReported = lastReportedViewRef.current;

    if (
      lastReported?.baseId === ownerBaseId &&
      viewTransformsEqual(lastReported.view, nextView)
    ) {
      return;
    }

    lastReportedViewRef.current = {
      baseId: ownerBaseId,
      view: nextView ? { ...nextView } : null,
    };
    onViewChange(ownerBaseId, nextView);
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const currentView = viewRef.current;

    if (!currentView) {
      return;
    }

    const point = eventPoint(event);

    if (equipmentPlacementMode === "placing") {
      onEquipmentPoint(screenToWorld(point, currentView));
      return;
    }

    if (routeToolMode !== "inactive") {
      onRoutePoint(
        screenToWorld(point, currentView),
        ROUTE_POINTER_TOLERANCE_PX / currentView.scale,
      );
      return;
    }

    if (sectionRegistrationMode !== "inactive") {
      if (
        sectionRegistrationMode === "start" ||
        sectionRegistrationMode === "end"
      ) {
        onSectionRegistrationPoint(screenToWorld(point, currentView));
      }

      return;
    }

    if (sectionLinkMode !== "inactive") {
      if (sectionLinkMode === "start" || sectionLinkMode === "end") {
        onSectionLinkPoint(screenToWorld(point, currentView));
      }

      return;
    }

    if (isPointSelectionActive) {
      onSourcePoint(screenToWorld(point, currentView));
      return;
    }

    if (handleConstraintPointerDown(event, point, currentView)) {
      return;
    }

    if (selectionMode === "rectangle") {
      setSelectionBox({
        pointerId: event.pointerId,
        start: point,
        current: point,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (selectionMode !== "pan") {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      point,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const point = eventPoint(event);
    const currentView = viewRef.current;

    if (equipmentPlacementMode === "placing") {
      if (currentView) {
        const sourcePoint = screenToWorld(point, currentView);
        onCursorChange(sourcePoint);
        onEquipmentPreview(sourcePoint);
      }

      return;
    }

    if (routeToolMode !== "inactive") {
      if (currentView) {
        const sourcePoint = screenToWorld(point, currentView);
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
        const sourcePoint = screenToWorld(point, currentView);
        onCursorChange(sourcePoint);

        if (sectionRegistrationMode === "end") {
          onSectionRegistrationPreview(sourcePoint);
        }
      }

      return;
    }

    if (sectionLinkMode !== "inactive") {
      if (currentView) {
        const sourcePoint = screenToWorld(point, currentView);
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

      const next = currentView ? panTransform(currentView, delta) : currentView;
      commitLocalView(next, true);
      panStateRef.current = {
        ...panStateRef.current,
        point,
      };
      return;
    }

    if (selectionBox) {
      setSelectionBox((current) =>
        current
          ? {
              ...current,
              current: point,
            }
          : current,
      );
      return;
    }

    if (currentView) {
      onCursorChange(screenToWorld(point, currentView));
    }
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (handleConstraintPointerUp(event, viewRef.current)) {
      return;
    }

    if (selectionBox?.pointerId === event.pointerId) {
      if (view) {
        const rect = normalizeScreenRect(selectionBox.start, selectionBox.current);
        const entityIds = visibleEntities
          .filter((entity) => entityIntersectsRect(entity, view, rect))
          .map((entity) => entity.id);
        onRectangleSelect(entityIds);
      }

      setSelectionBox(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    if (panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    const currentView = viewRef.current;

    if (!currentView) {
      return;
    }

    const point = eventPoint(event);
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    commitLocalView(zoomTransformAt(currentView, point, factor), true);
  }

  function handleConstraintPointerDown(
    event: React.PointerEvent<SVGSVGElement>,
    point: Point2D,
    currentView: ViewTransform,
  ) {
    if (constraintToolMode === "none") {
      return false;
    }

    const sourcePoint = screenToWorld(point, currentView);

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
    currentView: ViewTransform | null,
  ) {
    if (!currentView) {
      return false;
    }

    const sourcePoint = screenToWorld(point, currentView);

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
    event: React.PointerEvent<SVGSVGElement>,
    currentView: ViewTransform | null,
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

  return (
    <div ref={containerRef} className="h-full min-h-0 overflow-hidden bg-[#eef0ec] p-3">
      <svg
        className="block h-full min-h-0 w-full touch-none border border-[var(--line)] bg-white"
        role="img"
        viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
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
        style={{
          cursor:
            equipmentPlacementMode === "placing" || routeToolMode !== "inactive"
              ? "crosshair"
              : undefined,
        }}
      >
        <rect
          fill="#ffffff"
          height={Math.max(size.height, 1)}
          width={Math.max(size.width, 1)}
          x="0"
          y="0"
        />

        {!drawing || !view ? (
          <text
            fill="#66736b"
            fontSize="14"
            textAnchor="middle"
            x={Math.max(size.width, 1) / 2}
            y={Math.max(size.height, 1) / 2}
          >
            Seleccione una base
          </text>
        ) : (
          <g>
            {orderedVisibleEntities.map((entity) => (
              <PrimitiveElement
                entity={entity}
                key={entity.id}
                layerColor={layerColors.get(entity.layer) ?? "#2b6f77"}
                primitiveStyle={styleForEntity(
                  entity,
                  layerColors.get(entity.layer) ?? "#2b6f77",
                  classificationIndex,
                  pendingSet,
                  semanticViewMode,
                )}
                view={view}
              />
            ))}
            {visibleEntities
              .filter((entity) => selectedSet.has(entity.id))
              .map((entity) => (
                <PrimitiveElement
                  entity={entity}
                  key={`selection-${entity.id}`}
                  layerColor="#e11d48"
                  pointerEvents="none"
                  primitiveStyle={{
                    opacity: 0.95,
                    stroke: "#e11d48",
                    width: 5,
                  }}
                  view={view}
                />
              ))}
            {selectionMode === "entity"
              ? visibleEntities.map((entity) => (
                  <PrimitiveHitElement
                    entity={entity}
                    key={`hit-${entity.id}`}
                    view={view}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onEntityToggle(entity.id);
                    }}
                  />
                ))
              : null}
            {selectionBox ? <SelectionRect selectionBox={selectionBox} /> : null}
            <ConstraintsOverlay
              constraints={constraints}
              draft={overlayDraft}
              selectedConstraintId={selectedConstraintId}
              showConstraints={showConstraints}
              sourceToScreen={(point) => worldToScreen(point, view)}
            />
            <SourceOverlay
              calibrationPoints={overlay.calibrationPoints}
              measurementPoints={overlay.measurementPoints}
              sourceToScreen={(point) => worldToScreen(point, view)}
            />
            <SectionLinksOverlay
              draft={sectionLinkDraft}
              highlightedLinkId={highlightedSectionLinkId}
              hoveredLinkId={hoveredSectionLinkId}
              links={sectionLinks}
              sectionNames={sectionNames}
              sourceToScreen={(point) => worldToScreen(point, view)}
              onChooseDraftSide={onSectionLinkSide}
              onHoverLink={onSectionLinkHover}
              onOpenSection={onSectionLinkOpen}
            />
            <SectionRegistrationOverlay
              draft={sectionRegistrationDraft}
              saved={sectionRegistrationSaved}
              sourceToScreen={(point) => worldToScreen(point, view)}
              onChooseDraftSide={onSectionRegistrationSide}
            />
            <SectionRouteProjectionOverlay
              detailsVisible={Boolean(selectedSectionRouteHeightTarget)}
              projection={sectionRouteProjection}
              selectedHeightTarget={selectedSectionRouteHeightTarget}
              sourceToScreen={(point) => worldToScreen(point, view)}
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
                !isPointSelectionActive &&
                selectionMode === "pan"
              }
              intentConnections={routeIntentConnections}
              intentDraft={routeIntentDraft}
              network={routeNetwork}
              proposal={routeProposal}
              proposalOutdated={routeProposalOutdated}
              routeEditTolerance={ROUTE_POINTER_TOLERANCE_PX / view.scale}
              screenToSource={(point) => screenToWorld(point, view)}
              selectedEdit={selectedRouteEdit}
              showRoute={showRoute}
              sourceToScreen={(point) => worldToScreen(point, view)}
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
              sourceToScreen={(point) => worldToScreen(point, view)}
              onHoverEquipment={onEquipmentHover}
              onRouteEquipmentPoint={onRoutePoint}
              onSelectEquipment={onEquipmentSelect}
            />
          </g>
        )}
      </svg>
    </div>
  );
}

function PrimitiveElement({
  entity,
  layerColor,
  onPointerDown,
  pointerEvents,
  primitiveStyle,
  view,
}: {
  entity: DrawingPrimitive;
  layerColor: string;
  onPointerDown?: (event: React.PointerEvent<SVGElement>) => void;
  pointerEvents?: string;
  primitiveStyle?: PrimitiveStyle;
  view: ViewTransform;
}) {
  const style = primitiveStyle ?? {
    fill: entity.kind === "hatch" ? readableStroke(entity.color ?? layerColor) : undefined,
    fillOpacity: entity.kind === "hatch" ? 0.32 : undefined,
    opacity: 1,
    stroke: readableStroke(entity.color ?? layerColor),
    width: 1.25,
  };

  if (entity.kind === "hatch") {
    return (
      <path
        data-entity-id={entity.id}
        d={hatchToPath(entity, view)}
        fill={style.fill ?? style.stroke}
        fillOpacity={style.fillOpacity ?? style.opacity}
        fillRule="evenodd"
        onPointerDown={onPointerDown}
        opacity={style.opacity}
        pointerEvents={pointerEvents}
        stroke={style.stroke}
        strokeLinejoin="round"
        strokeWidth={style.width}
      />
    );
  }

  if (entity.kind === "line") {
    const start = worldToScreen(entity.start, view);
    const end = worldToScreen(entity.end, view);

    return (
      <line
        data-entity-id={entity.id}
        onPointerDown={onPointerDown}
        opacity={style.opacity}
        pointerEvents={pointerEvents}
        stroke={style.stroke}
        strokeDasharray={style.dash}
        strokeLinecap="round"
        strokeWidth={style.width}
        x1={formatCoordinate(start.x)}
        x2={formatCoordinate(end.x)}
        y1={formatCoordinate(start.y)}
        y2={formatCoordinate(end.y)}
      />
    );
  }

  if (entity.kind === "polyline") {
    const points = entity.points
      .map((point) => worldToScreen(point, view))
      .map((point) => `${formatCoordinate(point.x)},${formatCoordinate(point.y)}`)
      .join(" ");

    if (entity.closed) {
      return (
        <polygon
          data-entity-id={entity.id}
          fill="none"
          onPointerDown={onPointerDown}
          pointerEvents={pointerEvents}
          points={points}
          opacity={style.opacity}
          stroke={style.stroke}
          strokeDasharray={style.dash}
          strokeLinejoin="round"
          strokeWidth={style.width}
        />
      );
    }

    return (
      <polyline
        data-entity-id={entity.id}
        fill="none"
        onPointerDown={onPointerDown}
        pointerEvents={pointerEvents}
        points={points}
        opacity={style.opacity}
        stroke={style.stroke}
        strokeDasharray={style.dash}
        strokeLinejoin="round"
        strokeWidth={style.width}
      />
    );
  }

  return (
    <path
      data-entity-id={entity.id}
      d={arcToPath(entity, view)}
      fill="none"
      onPointerDown={onPointerDown}
      opacity={style.opacity}
      pointerEvents={pointerEvents}
      stroke={style.stroke}
      strokeDasharray={style.dash}
      strokeLinecap="round"
      strokeWidth={style.width}
    />
  );
}

function PrimitiveHitElement({
  entity,
  onPointerDown,
  view,
}: {
  entity: DrawingPrimitive;
  onPointerDown: (event: React.PointerEvent<SVGElement>) => void;
  view: ViewTransform;
}) {
  const hitStyle: PrimitiveStyle = {
    fill: entity.kind === "hatch" ? "#000000" : undefined,
    fillOpacity: 0,
    opacity: 0,
    stroke: "#000000",
    width: entity.kind === "hatch" ? 0 : 14,
  };

  return (
    <PrimitiveElement
      entity={entity}
      layerColor="#000000"
      pointerEvents={entity.kind === "hatch" ? "all" : "stroke"}
      primitiveStyle={hitStyle}
      view={view}
      onPointerDown={onPointerDown}
    />
  );
}

function styleForEntity(
  entity: DrawingPrimitive,
  layerColor: string,
  classificationIndex: ClassificationIndex,
  pendingSet: Set<string>,
  semanticViewMode: SemanticViewMode,
): PrimitiveStyle {
  const isArea = entity.kind === "hatch";

  if (semanticViewMode === "original") {
    const stroke = readableStroke(entity.color ?? layerColor);

    return {
      fill: isArea ? stroke : undefined,
      fillOpacity: isArea ? 0.34 : undefined,
      opacity: 1,
      stroke,
      width: isArea ? 0.7 : 1.25,
    };
  }

  const classification = classificationIndex[entity.id];

  if (classification) {
    const stroke = semanticStrokeForCategory(classification.category);

    return {
      dash:
        !isArea && classification.category === "reference_wall"
          ? "7 4"
          : !isArea && classification.category === "unclassified"
            ? "2 5"
            : undefined,
      fill: isArea ? stroke : undefined,
      fillOpacity: isArea
        ? classification.category === "unclassified"
          ? 0.2
          : 0.45
        : undefined,
      opacity: classification.category === "unclassified" ? 0.55 : 0.95,
      stroke,
      width: isArea ? 0.8 : classification.category === "hard_structure" ? 2.4 : 1.9,
    };
  }

  if (pendingSet.has(entity.id)) {
    return {
      dash: isArea ? undefined : "5 4",
      fill: isArea ? "#d97706" : undefined,
      fillOpacity: isArea ? 0.28 : undefined,
      opacity: 0.78,
      stroke: "#d97706",
      width: isArea ? 0.7 : 1.6,
    };
  }

  return {
    dash: isArea ? undefined : "2 5",
    fill: isArea ? "#8a9690" : undefined,
    fillOpacity: isArea ? 0.16 : undefined,
    opacity: 0.42,
    stroke: "#8a9690",
    width: 1,
  };
}

function semanticStrokeForCategory(
  category: ClassificationIndex[string]["category"],
) {
  if (category === "hard_structure") {
    return "#111827";
  }

  if (category === "reference_wall") {
    return "#9ca3af";
  }

  if (category === "opening") {
    return "#0891b2";
  }

  return "#8a9690";
}

function SelectionRect({ selectionBox }: { selectionBox: SelectionBox }) {
  const rect = normalizeScreenRect(selectionBox.start, selectionBox.current);

  return (
    <rect
      fill="rgba(37, 99, 235, 0.08)"
      height={formatCoordinate(rect.height)}
      pointerEvents="none"
      stroke="#2563eb"
      strokeDasharray="4 3"
      strokeWidth="1"
      width={formatCoordinate(rect.width)}
      x={formatCoordinate(rect.x)}
      y={formatCoordinate(rect.y)}
    />
  );
}

function normalizeScreenRect(start: Point2D, current: Point2D) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);

  return {
    x,
    y,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function entityIntersectsRect(
  entity: DrawingPrimitive,
  view: ViewTransform,
  rect: { x: number; y: number; width: number; height: number },
) {
  if (rect.width < 3 && rect.height < 3) {
    return false;
  }

  const bounds = addEntityToBounds(createEmptyBounds(), entity);

  if (!isValidBounds(bounds)) {
    return false;
  }

  const topLeft = worldToScreen({ x: bounds.minX, y: bounds.maxY }, view);
  const bottomRight = worldToScreen({ x: bounds.maxX, y: bounds.minY }, view);
  const entityRect = normalizeScreenRect(topLeft, bottomRight);

  return rectanglesIntersect(rect, entityRect);
}

function rectanglesIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

function viewTransformsEqual(
  first: ViewTransform | null,
  second: ViewTransform | null,
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

function arcToPath(entity: ArcPrimitive, view: ViewTransform) {
  const start = worldToScreen(pointOnArc(entity, entity.startAngle), view);
  const end = worldToScreen(pointOnArc(entity, entity.endAngle), view);
  const radius = Math.max(entity.radius * view.scale, 0.001);
  const delta = normalizePositive(entity.endAngle - entity.startAngle);
  const largeArcFlag = delta > Math.PI ? 1 : 0;
  const sweepFlag = 0;

  return [
    `M ${formatCoordinate(start.x)} ${formatCoordinate(start.y)}`,
    `A ${formatCoordinate(radius)} ${formatCoordinate(radius)} 0 ${largeArcFlag} ${sweepFlag}`,
    `${formatCoordinate(end.x)} ${formatCoordinate(end.y)}`,
  ].join(" ");
}

function hatchToPath(
  entity: Extract<DrawingPrimitive, { kind: "hatch" }>,
  view: ViewTransform,
) {
  return entity.rings
    .filter((ring) => ring.length >= 3)
    .map((ring) => {
      const screenRing = ring.map((point) => worldToScreen(point, view));
      const first = screenRing[0];

      if (!first) {
        return "";
      }

      const rest = screenRing.slice(1);
      return [
        `M ${formatCoordinate(first.x)} ${formatCoordinate(first.y)}`,
        ...rest.map(
          (point) => `L ${formatCoordinate(point.x)} ${formatCoordinate(point.y)}`,
        ),
        "Z",
      ].join(" ");
    })
    .join(" ");
}

function pointOnArc(entity: ArcPrimitive, angle: number): Point2D {
  return {
    x: entity.center.x + Math.cos(angle) * entity.radius,
    y: entity.center.y + Math.sin(angle) * entity.radius,
  };
}

function createLayerColorMap(layers: DrawingLayer[]) {
  return new Map(
    layers.map((layer) => [
      layer.name,
      layer.trueColor ?? layer.color ?? fallbackLayerColor(layer.name),
    ]),
  );
}

function fallbackLayerColor(name: string) {
  const palette = [
    "#2b6f77",
    "#8a4f2d",
    "#5f6f2b",
    "#7c4f8a",
    "#37694a",
    "#9a3f50",
    "#365f9a",
  ];
  let hash = 0;

  for (const character of name) {
    hash = (hash + character.charCodeAt(0)) % palette.length;
  }

  return palette[hash];
}

function readableStroke(color: string) {
  return color.toLowerCase() === "#ffffff" ? "#59635d" : color;
}

function eventPoint(
  event: React.PointerEvent<SVGSVGElement> | React.WheelEvent<SVGSVGElement>,
): Point2D {
  const rect = event.currentTarget.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function formatCoordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "0";
}
