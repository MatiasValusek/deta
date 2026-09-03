import type {
  TechnicalAxonometricAccessory,
  TechnicalAxonometricNode,
  TechnicalAxonometricSegment,
  TechnicalAxonometricView,
} from "@/lib/calculation/technicalAxonometric";
import {
  equipmentCode,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import {
  sectionRouteHeightTargetKey,
  sectionRouteHeightTargetsEqual,
  type SectionRouteHeightTarget,
} from "@/lib/sections/routeHeightEditing";
import type {
  SectionRouteProjectedAccessory,
  SectionRouteProjectedEquipment,
  SectionRouteProjectedSegment,
} from "@/lib/sections/routeProjection";
import type {
  StandardTechnicalReviewGeometryPendingItem,
  StandardTechnicalReviewViewId,
  StandardTechnicalSectionView,
} from "@/lib/sections/standardTechnicalViews";

type TechnicalReviewCanvasProps = {
  axonometricView: TechnicalAxonometricView | null;
  equipment: WorkbenchEquipment[];
  focusedItem: StandardTechnicalReviewGeometryPendingItem | null;
  sectionView: StandardTechnicalSectionView | null;
  selectedHeightTarget: SectionRouteHeightTarget | null;
  viewId: Exclude<StandardTechnicalReviewViewId, "plan">;
  onHeightTargetSelect: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
};

type SectionHeightHandlePoint = {
  currentHeightMeters: number;
  key: string;
  point: Point2D;
  target: SectionRouteHeightTarget;
};

type CanvasBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

type CanvasTransformOptions = {
  minPadding: number;
  paddingXRatio: number;
  paddingYRatio: number;
};

type LabelOffset = {
  anchor: "end" | "middle" | "start";
  x: number;
  y: number;
};

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 560;
const CANVAS_PADDING = 46;
const DEFAULT_SECTION_BOUNDS = {
  maxX: 1,
  maxY: 1,
  minX: 0,
  minY: -1,
};

export function TechnicalReviewCanvas({
  axonometricView,
  equipment,
  focusedItem,
  sectionView,
  selectedHeightTarget,
  viewId,
  onHeightTargetSelect,
}: TechnicalReviewCanvasProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden bg-[#eef0ec] p-3">
      <svg
        aria-label={technicalReviewCanvasLabel(viewId)}
        className="block h-full min-h-0 w-full border border-[var(--line)] bg-white"
        data-technical-review-view={viewId}
        role="img"
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      >
        <rect fill="#ffffff" height={CANVAS_HEIGHT} width={CANVAS_WIDTH} />
        {viewId === "axo" ? (
          axonometricView ? (
            <AxonometricCanvas
              focusedItem={focusedItem}
              selectedHeightTarget={selectedHeightTarget}
              view={axonometricView}
              onHeightTargetSelect={onHeightTargetSelect}
            />
          ) : (
            <CanvasNotice text="Axonometrica pendiente" />
          )
        ) : sectionView ? (
          <SectionCanvas
            equipment={equipment}
            focusedItem={focusedItem}
            selectedHeightTarget={selectedHeightTarget}
            view={sectionView}
            onHeightTargetSelect={onHeightTargetSelect}
          />
        ) : (
          <CanvasNotice text="Corte pendiente" />
        )}
      </svg>
    </div>
  );
}

function SectionCanvas({
  equipment,
  focusedItem,
  selectedHeightTarget,
  view,
  onHeightTargetSelect,
}: {
  equipment: WorkbenchEquipment[];
  focusedItem: StandardTechnicalReviewGeometryPendingItem | null;
  selectedHeightTarget: SectionRouteHeightTarget | null;
  view: StandardTechnicalSectionView;
  onHeightTargetSelect: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
}) {
  const transform = createSectionCanvasTransform(view);
  const baselineStart = transform(view.baseline.start);
  const baselineEnd = transform(view.baseline.end);
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const heightHandles = collectSectionHeightHandles(view.projection.segments);
  const pendingReason = firstSectionPendingReason(view);
  const hasGeometry =
    view.projection.segments.some((segment) => segment.points.length > 0) ||
    view.projection.equipment.length > 0 ||
    view.projection.accessories.some((accessory) => accessory.sectionPoint);

  return (
    <g>
      <text
        fill="#111827"
        fontSize="18"
        fontWeight="700"
        x={CANVAS_PADDING}
        y="32"
      >
        {view.title}
      </text>
      <line
        stroke="#9ca3af"
        strokeDasharray="8 6"
        strokeWidth="1.5"
        x1={baselineStart.x}
        x2={baselineEnd.x}
        y1={baselineStart.y}
        y2={baselineEnd.y}
      />
      <text
        fill="#4b5563"
        fontSize="11"
        fontWeight="700"
        x={baselineStart.x}
        y={baselineStart.y - 10}
      >
        Nivel 0,00
      </text>
      {hasGeometry ? (
        <g>
          {view.projection.segments.map((segment) => (
            <SectionSegmentPath
              focused={focusedItemMatchesSegment(
                focusedItem,
                segment.segmentId,
              )}
              key={segment.id}
              segment={segment}
              transform={transform}
            />
          ))}
          {view.projection.accessories.map((accessory) => (
            <SectionAccessoryMarker
              accessory={accessory}
              focused={focusedItemMatchesSectionAccessory(
                focusedItem,
                accessory,
              )}
              key={accessory.id}
              transform={transform}
            />
          ))}
          {heightHandles.map((handle) => (
            <HeightHandle
              currentHeightMeters={handle.currentHeightMeters}
              key={handle.key}
              point={transform(handle.point)}
              selected={sectionRouteHeightTargetsEqual(
                selectedHeightTarget,
                handle.target,
              )}
              target={handle.target}
              onHeightTargetSelect={onHeightTargetSelect}
            />
          ))}
          {view.projection.equipment.map((item, index) => (
            <SectionEquipmentMarker
              equipment={item}
              focused={focusedItemMatchesNode(focusedItem, item.nodeId)}
              index={index}
              key={item.nodeId}
              selectedHeightTarget={selectedHeightTarget}
              sourceEquipment={equipmentById.get(item.equipmentId) ?? null}
              totalEquipment={view.projection.equipment.length}
              transform={transform}
              onHeightTargetSelect={onHeightTargetSelect}
            />
          ))}
          {pendingReason ? <TechnicalViewWarning text={pendingReason} /> : null}
        </g>
      ) : (
        <CanvasNotice text="Sin geometria de recorrido para proyectar" />
      )}
    </g>
  );
}

function SectionSegmentPath({
  focused,
  segment,
  transform,
}: {
  focused: boolean;
  segment: SectionRouteProjectedSegment;
  transform: (point: Point2D) => Point2D;
}) {
  const path = svgPath(
    segment.points.map((point) => transform(point.sectionPoint)),
  );

  if (!path) {
    return null;
  }

  return (
    <path
      d={path}
      data-section-route-segment-id={segment.segmentId}
      data-section-route-segment-status={segment.status}
      fill="none"
      pointerEvents="none"
      stroke={
        focused
          ? "#be123c"
          : segment.status === "pending"
            ? "#d97706"
            : "#0f766e"
      }
      strokeDasharray={segment.status === "pending" ? "7 5" : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={focused ? "4.4" : "3.2"}
    />
  );
}

function SectionAccessoryMarker({
  accessory,
  focused,
  transform,
}: {
  accessory: SectionRouteProjectedAccessory;
  focused: boolean;
  transform: (point: Point2D) => Point2D;
}) {
  if (!accessory.sectionPoint) {
    return null;
  }

  const point = transform(accessory.sectionPoint);
  const stroke = focused
    ? "#be123c"
    : accessory.status === "pending"
      ? "#d97706"
      : "#6d28d9";

  return (
    <g pointerEvents="none" transform={`translate(${point.x} ${point.y})`}>
      {focused ? (
        <circle
          fill="none"
          r="9"
          stroke="#be123c"
          strokeWidth="2"
        />
      ) : null}
      {accessory.kind === "valve" ? (
        <path
          d="M -8 0 L -2 -5 L 2 5 L 8 0"
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      ) : (
        <circle
          fill="#ffffff"
          r={accessory.kind === "rh_elbow" ? 4.5 : 3.8}
          stroke={stroke}
          strokeWidth="1.7"
        />
      )}
    </g>
  );
}

function SectionEquipmentMarker({
  equipment,
  focused,
  index,
  selectedHeightTarget,
  sourceEquipment,
  totalEquipment,
  transform,
  onHeightTargetSelect,
}: {
  equipment: SectionRouteProjectedEquipment;
  focused: boolean;
  index: number;
  selectedHeightTarget: SectionRouteHeightTarget | null;
  sourceEquipment: WorkbenchEquipment | null;
  totalEquipment: number;
  transform: (point: Point2D) => Point2D;
  onHeightTargetSelect: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
}) {
  const connectionPoint = transform(equipment.sectionPoint);
  const bodyPoint = transform(
    equipment.bodySectionPoint ?? equipment.sectionPoint,
  );
  const isSupply = equipment.role === "supply";
  const stroke = isSupply
    ? "#111827"
    : equipment.anchorStatus === "pending"
      ? "#d97706"
      : "#2563eb";
  const connectorVisible =
    Math.hypot(bodyPoint.x - connectionPoint.x, bodyPoint.y - connectionPoint.y) >
    0.5;
  const selected = sectionRouteHeightTargetsEqual(
    selectedHeightTarget,
    equipment.heightTarget,
  );
  const isFocused = focused || selected;
  const offset = sectionEquipmentLabelOffset(index, totalEquipment, isSupply);
  const labelPoint = offsetPoint(bodyPoint, offset.x, offset.y);
  const label = `${equipmentShortCode(equipment, sourceEquipment)} ${formatSignedMeters(
    equipment.zMeters,
  )}`;

  return (
    <g>
      {connectorVisible ? (
        <line
          pointerEvents="none"
          stroke={stroke}
          strokeDasharray={equipment.anchorStatus === "pending" ? "4 3" : undefined}
          strokeLinecap="round"
          strokeWidth="1.5"
          x1={bodyPoint.x}
          x2={connectionPoint.x}
          y1={bodyPoint.y}
          y2={connectionPoint.y}
        />
      ) : null}
      {isSupply ? (
        <circle
          cx={bodyPoint.x}
          cy={bodyPoint.y}
          fill="#ffffff"
          pointerEvents="none"
          r="7"
          stroke={stroke}
          strokeWidth="2"
        />
      ) : (
        <rect
          fill="#ffffff"
          height="12"
          pointerEvents="none"
          stroke={stroke}
          strokeWidth="2"
          width="16"
          x={bodyPoint.x - 8}
          y={bodyPoint.y - 6}
        />
      )}
      <circle
        cx={connectionPoint.x}
        cy={connectionPoint.y}
        fill={isFocused ? "#fff1f2" : "#ffffff"}
        pointerEvents="none"
        r="3.4"
        stroke={isFocused ? "#be123c" : stroke}
        strokeWidth={isFocused ? 2.3 : 1.8}
      />
      <HeightHandle
        currentHeightMeters={equipment.zMeters}
        point={connectionPoint}
        selected={selected}
        target={equipment.heightTarget}
        onHeightTargetSelect={onHeightTargetSelect}
      />
      <text
        fill={stroke}
        fontSize="11"
        fontWeight="700"
        paintOrder="stroke"
        stroke="#ffffff"
        strokeLinejoin="round"
        strokeWidth="3"
        textAnchor={offset.anchor}
        x={labelPoint.x}
        y={labelPoint.y}
      >
        {label}
      </text>
    </g>
  );
}

function AxonometricCanvas({
  focusedItem,
  selectedHeightTarget,
  view,
  onHeightTargetSelect,
}: {
  focusedItem: StandardTechnicalReviewGeometryPendingItem | null;
  selectedHeightTarget: SectionRouteHeightTarget | null;
  view: TechnicalAxonometricView;
  onHeightTargetSelect: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
}) {
  const transform = createAxonometricCanvasTransform(view);
  const labeledNodeIds = view.nodes
    .filter(shouldLabelAxonometricNode)
    .map((node) => node.id);
  const hasGeometry =
    view.nodes.some((node) => node.projected) ||
    view.segments.some(
      (segment) => segment.fromProjected && segment.toProjected,
    );

  return (
    <g>
      <text
        fill="#111827"
        fontSize="18"
        fontWeight="700"
        x={CANVAS_PADDING}
        y="32"
      >
        Axo
      </text>
      {hasGeometry ? (
        <g>
          {view.segments.map((segment) => (
            <AxonometricSegmentLine
              focused={focusedItemMatchesSegment(focusedItem, segment.id)}
              key={segment.id}
              segment={segment}
              transform={transform}
            />
          ))}
          {view.accessories.map((accessory) => (
            <AxonometricAccessoryMarker
              accessory={accessory}
              focused={focusedItemMatchesAxonometricAccessory(
                focusedItem,
                accessory,
              )}
              key={accessory.id}
              transform={transform}
            />
          ))}
          {view.nodes.map((node) => (
            <AxonometricNodeMarker
              key={node.id}
              labelIndex={labeledNodeIds.indexOf(node.id)}
              focused={focusedItemMatchesNode(focusedItem, node.id)}
              node={node}
              selectedHeightTarget={selectedHeightTarget}
              transform={transform}
              onHeightTargetSelect={onHeightTargetSelect}
            />
          ))}
          {view.pendingItems.length > 0 ? (
            <TechnicalViewWarning
              text={view.pendingItems[0]?.message ?? "Vista pendiente"}
            />
          ) : null}
        </g>
      ) : (
        <CanvasNotice text="Axonometrica pendiente" />
      )}
    </g>
  );
}

function AxonometricSegmentLine({
  focused,
  segment,
  transform,
}: {
  focused: boolean;
  segment: TechnicalAxonometricSegment;
  transform: (point: Point2D) => Point2D;
}) {
  const segmentPath = svgPath(
    segment.path
      .map((point) => point.projected)
      .filter((point): point is Point2D => point !== null)
      .map(transform),
  );

  if (!segmentPath) {
    return null;
  }

  return (
    <path
      data-axonometric-segment-status={segment.status}
      d={segmentPath}
      fill="none"
      pointerEvents="none"
      stroke={
        focused
          ? "#be123c"
          : segment.status === "pending"
            ? "#d97706"
            : "#263238"
      }
      strokeDasharray={segment.status === "pending" ? "7 5" : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={focused ? "4.4" : "3.1"}
    />
  );
}

function AxonometricAccessoryMarker({
  accessory,
  focused,
  transform,
}: {
  accessory: TechnicalAxonometricAccessory;
  focused: boolean;
  transform: (point: Point2D) => Point2D;
}) {
  if (!accessory.projected) {
    return null;
  }

  const point = transform(accessory.projected);
  const stroke = focused
    ? "#be123c"
    : accessory.status === "resolved"
      ? "#6d28d9"
      : "#d97706";

  return (
    <g pointerEvents="none" transform={`translate(${point.x} ${point.y})`}>
      {focused ? (
        <circle
          fill="none"
          r="9"
          stroke="#be123c"
          strokeWidth="2"
        />
      ) : null}
      <path
        d="M -5 0 L 0 -5 L 5 0 L 0 5 Z"
        fill="#ffffff"
        stroke={stroke}
        strokeWidth="1.6"
      />
    </g>
  );
}

function AxonometricNodeMarker({
  focused,
  labelIndex,
  node,
  selectedHeightTarget,
  transform,
  onHeightTargetSelect,
}: {
  focused: boolean;
  labelIndex: number;
  node: TechnicalAxonometricNode;
  selectedHeightTarget: SectionRouteHeightTarget | null;
  transform: (point: Point2D) => Point2D;
  onHeightTargetSelect: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
}) {
  if (!node.projected) {
    return null;
  }

  const point = transform(node.projected);
  const zMeters = node.point?.zMeters ?? null;
  const heightTarget: SectionRouteHeightTarget = {
    kind: "node",
    nodeId: node.id,
  };
  const isSelected = sectionRouteHeightTargetsEqual(
    selectedHeightTarget,
    heightTarget,
  );
  const isFocused = focused || isSelected;
  const label = axonometricNodeLabel(node, zMeters);
  const labelOffset = axonometricNodeLabelOffset(labelIndex);
  const labelPoint = offsetPoint(point, labelOffset.x, labelOffset.y);
  const marker = axonometricNodeMarkerStyle(node);

  return (
    <g
      data-section-route-height-target={sectionRouteHeightTargetKey(heightTarget)}
      pointerEvents={zMeters === null ? "none" : "all"}
      onClick={(event) => {
        if (zMeters === null) {
          return;
        }

        event.stopPropagation();
        onHeightTargetSelect(heightTarget, zMeters);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      {node.kind === "derivation" ? (
        <rect
          fill={isFocused ? "#fff1f2" : marker.fill}
          height="11"
          stroke={isFocused ? "#be123c" : marker.stroke}
          strokeWidth={isFocused ? 2.3 : 1.7}
          width="11"
          x={point.x - 5.5}
          y={point.y - 5.5}
        />
      ) : (
        <circle
          cx={point.x}
          cy={point.y}
          fill={isFocused ? "#fff1f2" : marker.fill}
          r={marker.radius}
          stroke={isFocused ? "#be123c" : marker.stroke}
          strokeWidth={isFocused ? 2.3 : 1.7}
        />
      )}
      {label ? (
        <>
          <line
            pointerEvents="none"
            stroke="#9ca3af"
            strokeWidth="1"
            x1={point.x}
            x2={labelPoint.x}
            y1={point.y}
            y2={labelPoint.y - 4}
          />
          <text
            fill={node.kind === "supply" ? "#111827" : "#263238"}
            fontSize="11"
            fontWeight="700"
            paintOrder="stroke"
            stroke="#ffffff"
            strokeLinejoin="round"
            strokeWidth="3"
            textAnchor={labelOffset.anchor}
            x={labelPoint.x}
            y={labelPoint.y}
          >
            {label}
          </text>
        </>
      ) : null}
      {isSelected && zMeters !== null && !label ? (
        <text
          fill="#be123c"
          fontSize="10"
          fontWeight="700"
          paintOrder="stroke"
          stroke="#ffffff"
          strokeWidth="3"
          textAnchor="middle"
          x={point.x}
          y={point.y - 14}
        >
          {formatSignedMeters(zMeters)}
        </text>
      ) : null}
      {zMeters !== null ? (
        <title>{`Editar cota ${formatSignedMeters(zMeters)}`}</title>
      ) : null}
    </g>
  );
}

function focusedItemMatchesSegment(
  item: StandardTechnicalReviewGeometryPendingItem | null,
  segmentId: string,
) {
  return Boolean(
    item &&
      (item.routeSegmentIds.includes(segmentId) ||
        item.focusSourceId === segmentId ||
        item.sourceId === segmentId),
  );
}

function focusedItemMatchesSectionAccessory(
  item: StandardTechnicalReviewGeometryPendingItem | null,
  accessory: SectionRouteProjectedAccessory,
) {
  if (!item || item.sourceType !== "accessory") {
    return false;
  }

  return (
    item.focusSourceId === accessory.id ||
    item.sourceId === accessory.id ||
    accessory.sourceIds.includes(item.focusSourceId) ||
    accessory.sourceIds.includes(item.sourceId)
  );
}

function focusedItemMatchesAxonometricAccessory(
  item: StandardTechnicalReviewGeometryPendingItem | null,
  accessory: TechnicalAxonometricAccessory,
) {
  if (!item || item.sourceType !== "accessory") {
    return false;
  }

  return (
    item.focusSourceId === accessory.id ||
    item.sourceId === accessory.id ||
    (item.routeNodeId !== null && item.routeNodeId === accessory.nodeId)
  );
}

function focusedItemMatchesNode(
  item: StandardTechnicalReviewGeometryPendingItem | null,
  nodeId: string,
) {
  return Boolean(
    item &&
      (item.routeNodeId === nodeId ||
        item.focusSourceId === nodeId ||
        item.sourceId === nodeId),
  );
}

function HeightHandle({
  currentHeightMeters,
  point,
  selected,
  target,
  onHeightTargetSelect,
}: {
  currentHeightMeters: number;
  point: Point2D;
  selected: boolean;
  target: SectionRouteHeightTarget | null;
  onHeightTargetSelect: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
}) {
  if (!target) {
    return null;
  }

  const stroke = selected ? "#be123c" : "#0f766e";

  return (
    <g
      data-section-route-height-target={sectionRouteHeightTargetKey(target)}
      pointerEvents="all"
      transform={`translate(${point.x} ${point.y})`}
      onClick={(event) => {
        event.stopPropagation();
        onHeightTargetSelect(target, currentHeightMeters);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <circle
        fill={selected ? "#fff1f2" : "#ecfeff"}
        r={selected ? 6.5 : 4.2}
        stroke={stroke}
        strokeWidth={selected ? 2.3 : 1.5}
      />
      {selected ? (
        <text
          fill={stroke}
          fontSize="10"
          fontWeight="700"
          paintOrder="stroke"
          stroke="#ffffff"
          strokeWidth="3"
          textAnchor="middle"
          x="0"
          y="-14"
        >
          {formatSignedMeters(currentHeightMeters)}
        </text>
      ) : null}
      <title>{`Editar cota ${formatSignedMeters(currentHeightMeters)}`}</title>
    </g>
  );
}

function CanvasNotice({ text }: { text: string }) {
  return (
    <text
      fill="#66736b"
      fontSize="14"
      textAnchor="middle"
      x={CANVAS_WIDTH / 2}
      y={CANVAS_HEIGHT / 2}
    >
      {text}
    </text>
  );
}

function TechnicalViewWarning({ text }: { text: string }) {
  return (
    <g
      pointerEvents="none"
      transform={`translate(${CANVAS_PADDING} ${CANVAS_HEIGHT - 42})`}
    >
      <rect
        fill="#fffbeb"
        height="26"
        rx="4"
        stroke="#d97706"
        strokeWidth="1.2"
        width="430"
      />
      <text fill="#92400e" fontSize="11" fontWeight="700" x="10" y="17">
        {clipLabel(text, 62)}
      </text>
    </g>
  );
}

function createSectionCanvasTransform(view: StandardTechnicalSectionView) {
  return createCanvasTransform(sectionSourceBounds(view), {
    minPadding: 0.4,
    paddingXRatio: 0.05,
    paddingYRatio: 0.12,
  });
}

function createAxonometricCanvasTransform(view: TechnicalAxonometricView) {
  return createCanvasTransform(axonometricSourceBounds(view), {
    minPadding: 0.3,
    paddingXRatio: 0.04,
    paddingYRatio: 0.08,
  });
}

function createCanvasTransform(
  sourceBounds: CanvasBounds,
  options: CanvasTransformOptions,
) {
  const bounds = expandFlatBounds(sourceBounds, options);
  const scale = Math.min(
    (CANVAS_WIDTH - CANVAS_PADDING * 2) / (bounds.maxX - bounds.minX),
    (CANVAS_HEIGHT - CANVAS_PADDING * 2) / (bounds.maxY - bounds.minY),
  );
  const contentWidth = (bounds.maxX - bounds.minX) * scale;
  const contentHeight = (bounds.maxY - bounds.minY) * scale;
  const offsetX = (CANVAS_WIDTH - contentWidth) / 2;
  const offsetY = (CANVAS_HEIGHT - contentHeight) / 2;

  return (point: Point2D): Point2D => ({
    x: roundCanvas(offsetX + (point.x - bounds.minX) * scale),
    y: roundCanvas(offsetY + (point.y - bounds.minY) * scale),
  });
}

function sectionSourceBounds(view: StandardTechnicalSectionView) {
  const points: Point2D[] = [view.baseline.start, view.baseline.end];

  for (const segment of view.projection.segments) {
    points.push(...segment.points.map((point) => point.sectionPoint));
  }

  for (const equipment of view.projection.equipment) {
    points.push(equipment.sectionPoint);

    if (equipment.bodySectionPoint) {
      points.push(equipment.bodySectionPoint);
    }
  }

  for (const accessory of view.projection.accessories) {
    if (accessory.sectionPoint) {
      points.push(accessory.sectionPoint);
    }
  }

  return boundsForPoints(points) ?? DEFAULT_SECTION_BOUNDS;
}

function axonometricSourceBounds(view: TechnicalAxonometricView) {
  const points: Point2D[] = [];

  for (const segment of view.segments) {
    for (const point of segment.path) {
      if (point.projected) {
        points.push(point.projected);
      }
    }
  }

  for (const node of view.nodes) {
    if (node.projected) {
      points.push(node.projected);
    }
  }

  for (const accessory of view.accessories) {
    if (accessory.projected) {
      points.push(accessory.projected);
    }
  }

  return (
    boundsForPoints(points) ?? {
      maxX: view.viewBox.minX + view.viewBox.width,
      maxY: view.viewBox.minY + view.viewBox.height,
      minX: view.viewBox.minX,
      minY: view.viewBox.minY,
    }
  );
}

function boundsForPoints(points: Point2D[]) {
  const finitePoints = points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );

  if (finitePoints.length === 0) {
    return null;
  }

  return finitePoints.reduce(
    (bounds, point) => ({
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
    }),
    {
      maxX: finitePoints[0]?.x ?? 0,
      maxY: finitePoints[0]?.y ?? 0,
      minX: finitePoints[0]?.x ?? 0,
      minY: finitePoints[0]?.y ?? 0,
    },
  );
}

function expandFlatBounds(
  bounds: CanvasBounds,
  options: CanvasTransformOptions,
) {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const paddingX = Math.max(width * options.paddingXRatio, options.minPadding);
  const paddingY = Math.max(height * options.paddingYRatio, options.minPadding);

  return {
    maxX: bounds.maxX + paddingX,
    maxY: bounds.maxY + paddingY,
    minX: bounds.minX - paddingX,
    minY: bounds.minY - paddingY,
  };
}

function collectSectionHeightHandles(
  segments: SectionRouteProjectedSegment[],
): SectionHeightHandlePoint[] {
  const byKey = new Map<string, SectionHeightHandlePoint>();

  for (const segment of segments) {
    for (const point of segment.points) {
      if (!point.heightTarget || point.source === "connection") {
        continue;
      }

      const key = sectionRouteHeightTargetKey(point.heightTarget);

      if (!byKey.has(key)) {
        byKey.set(key, {
          currentHeightMeters: point.elevationMeters,
          key,
          point: point.sectionPoint,
          target: point.heightTarget,
        });
      }
    }
  }

  return [...byKey.values()];
}

function firstSectionPendingReason(view: StandardTechnicalSectionView) {
  return (
    view.projection.pendingItems[0]?.reason ??
    view.projection.segments.find((segment) => segment.pendingReason)
      ?.pendingReason ??
    view.projection.accessories.find((accessory) => accessory.pendingReason)
      ?.pendingReason ??
    null
  );
}

function sectionEquipmentLabelOffset(
  index: number,
  total: number,
  isSupply: boolean,
): LabelOffset {
  if (isSupply) {
    return { anchor: "middle", x: 0, y: -16 };
  }

  if (total <= 3) {
    return { anchor: "middle", x: 0, y: 20 };
  }

  const slots: LabelOffset[] = [
    { anchor: "start", x: 12, y: 20 },
    { anchor: "end", x: -12, y: 20 },
    { anchor: "start", x: 12, y: -14 },
    { anchor: "end", x: -12, y: -14 },
  ];

  return slots[index % slots.length] ?? slots[0];
}

function equipmentShortCode(
  equipment: SectionRouteProjectedEquipment,
  sourceEquipment: WorkbenchEquipment | null,
) {
  if (equipment.role === "supply") {
    return "M";
  }

  return sourceEquipment ? equipmentCode(sourceEquipment.type) : initials(equipment.label);
}

function shouldLabelAxonometricNode(node: TechnicalAxonometricNode) {
  return node.kind === "supply" || node.kind === "appliance";
}

function axonometricNodeLabel(
  node: TechnicalAxonometricNode,
  zMeters: number | null,
) {
  if (node.kind === "supply") {
    return zMeters !== null && Math.abs(zMeters) > 0.000001
      ? `${node.label} ${formatSignedMeters(zMeters)}`
      : node.label;
  }

  if (node.kind === "appliance") {
    return zMeters !== null
      ? `${node.label} ${formatSignedMeters(zMeters)}`
      : node.label;
  }

  return null;
}

function axonometricNodeLabelOffset(
  index: number,
): LabelOffset {
  const slots: LabelOffset[] = [
    { anchor: "middle", x: 0, y: -17 },
    { anchor: "start", x: 18, y: 18 },
    { anchor: "end", x: -18, y: 18 },
    { anchor: "start", x: 20, y: -8 },
    { anchor: "end", x: -20, y: -8 },
  ];

  return slots[Math.max(index, 0) % slots.length] ?? slots[0];
}

function axonometricNodeMarkerStyle(node: TechnicalAxonometricNode) {
  if (node.kind === "supply") {
    return { fill: "#111827", radius: 6.5, stroke: "#111827" };
  }

  if (node.kind === "appliance") {
    return { fill: "#ffffff", radius: 5.8, stroke: "#2563eb" };
  }

  if (node.kind === "derivation") {
    return { fill: "#e8f5f2", radius: 5.5, stroke: "#0f766e" };
  }

  return { fill: "#ffffff", radius: 4.4, stroke: "#455a64" };
}

function svgPath(points: Point2D[]) {
  const [first, ...rest] = points;

  if (!first || rest.length === 0) {
    return null;
  }

  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((point) => `L ${point.x} ${point.y}`),
  ].join(" ");
}

function offsetPoint(point: Point2D, x: number, y: number): Point2D {
  return {
    x: point.x + x,
    y: point.y + y,
  };
}

function initials(value: string) {
  const letters = value
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();

  return letters.slice(0, 3) || "A";
}

function technicalReviewCanvasLabel(
  viewId: Exclude<StandardTechnicalReviewViewId, "plan">,
) {
  if (viewId === "section-aa") {
    return "Corte A-A";
  }

  if (viewId === "section-bb") {
    return "Corte B-B";
  }

  return "Axo";
}

function formatSignedMeters(value: number) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${value.toFixed(2)} m`;
}

function clipLabel(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 3))}...`
    : value;
}

function roundCanvas(value: number) {
  return Math.round(value * 1000) / 1000;
}
