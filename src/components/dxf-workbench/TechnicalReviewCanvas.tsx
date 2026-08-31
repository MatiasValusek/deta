import type {
  TechnicalAxonometricAccessory,
  TechnicalAxonometricNode,
  TechnicalAxonometricSegment,
  TechnicalAxonometricView,
} from "@/lib/calculation/technicalAxonometric";
import type { Point2D } from "@/lib/geometry/types";
import {
  sectionRouteHeightTargetKey,
  sectionRouteHeightTargetsEqual,
  type SectionRouteHeightTarget,
} from "@/lib/sections/routeHeightEditing";
import type {
  StandardTechnicalReviewViewId,
  StandardTechnicalSectionView,
} from "@/lib/sections/standardTechnicalViews";
import { SectionRouteProjectionOverlay } from "./SectionRouteProjectionOverlay";

type TechnicalReviewCanvasProps = {
  axonometricView: TechnicalAxonometricView | null;
  sectionView: StandardTechnicalSectionView | null;
  selectedHeightTarget: SectionRouteHeightTarget | null;
  viewId: Exclude<StandardTechnicalReviewViewId, "plan">;
  onHeightTargetSelect: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
};

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 560;
const CANVAS_PADDING = 58;
const DEFAULT_SECTION_BOUNDS = {
  maxX: 1,
  maxY: 1,
  minX: 0,
  minY: -1,
};

export function TechnicalReviewCanvas({
  axonometricView,
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
              selectedHeightTarget={selectedHeightTarget}
              view={axonometricView}
              onHeightTargetSelect={onHeightTargetSelect}
            />
          ) : (
            <CanvasNotice text="Axonometrica pendiente" />
          )
        ) : sectionView ? (
          <SectionCanvas
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
  selectedHeightTarget,
  view,
  onHeightTargetSelect,
}: {
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
        y="34"
      >
        {view.title}
      </text>
      <line
        stroke="#9ca3af"
        strokeDasharray="8 6"
        strokeWidth="1.6"
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
        <SectionRouteProjectionOverlay
          detailsVisible={Boolean(selectedHeightTarget)}
          projection={view.projection}
          selectedHeightTarget={selectedHeightTarget}
          sourceToScreen={transform}
          onHeightTargetSelect={onHeightTargetSelect}
        />
      ) : (
        <CanvasNotice text="Sin geometria de recorrido para proyectar" />
      )}
    </g>
  );
}

function AxonometricCanvas({
  selectedHeightTarget,
  view,
  onHeightTargetSelect,
}: {
  selectedHeightTarget: SectionRouteHeightTarget | null;
  view: TechnicalAxonometricView;
  onHeightTargetSelect: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
}) {
  const transform = createAxonometricCanvasTransform(view);
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
        y="34"
      >
        Axo
      </text>
      {hasGeometry ? (
        <g>
          {view.segments.map((segment) => (
            <AxonometricSegmentLine
              key={segment.id}
              segment={segment}
              transform={transform}
            />
          ))}
          {view.accessories.map((accessory) => (
            <AxonometricAccessoryMarker
              accessory={accessory}
              key={accessory.id}
              transform={transform}
            />
          ))}
          {view.nodes.map((node) => (
            <AxonometricNodeMarker
              key={node.id}
              node={node}
              selectedHeightTarget={selectedHeightTarget}
              transform={transform}
              onHeightTargetSelect={onHeightTargetSelect}
            />
          ))}
        </g>
      ) : (
        <CanvasNotice text="Axonometrica pendiente" />
      )}
    </g>
  );
}

function AxonometricSegmentLine({
  segment,
  transform,
}: {
  segment: TechnicalAxonometricSegment;
  transform: (point: Point2D) => Point2D;
}) {
  if (!segment.fromProjected || !segment.toProjected) {
    return null;
  }

  const from = transform(segment.fromProjected);
  const to = transform(segment.toProjected);
  const labelPosition = segment.labelPosition
    ? transform(segment.labelPosition)
    : midpoint(from, to);

  return (
    <g>
      <line
        stroke={axonometricSegmentStroke(segment)}
        strokeDasharray={segment.status === "pending" ? "7 5" : undefined}
        strokeLinecap="round"
        strokeWidth={axonometricSegmentStrokeWidth(segment)}
        x1={from.x}
        x2={to.x}
        y1={from.y}
        y2={to.y}
      />
      <text
        fill="#263238"
        fontSize="11"
        fontWeight="700"
        paintOrder="stroke"
        stroke="#ffffff"
        strokeLinejoin="round"
        strokeWidth="3"
        textAnchor="middle"
        x={labelPosition.x}
        y={labelPosition.y - 8}
      >
        {axonometricSegmentLabel(segment)}
      </text>
    </g>
  );
}

function AxonometricAccessoryMarker({
  accessory,
  transform,
}: {
  accessory: TechnicalAxonometricAccessory;
  transform: (point: Point2D) => Point2D;
}) {
  if (!accessory.projected) {
    return null;
  }

  const point = transform(accessory.projected);

  return (
    <g pointerEvents="none">
      <path
        d={`M ${point.x - 7} ${point.y} L ${point.x} ${point.y - 7} L ${
          point.x + 7
        } ${point.y} L ${point.x} ${point.y + 7} Z`}
        fill={accessory.status === "resolved" ? "#fff7ed" : "#fffaf0"}
        stroke={accessory.status === "resolved" ? "#c2410c" : "#b45309"}
        strokeWidth="1.6"
      />
      <text
        fill="#7c2d12"
        fontSize="10"
        fontWeight="700"
        paintOrder="stroke"
        stroke="#ffffff"
        strokeWidth="3"
        textAnchor="middle"
        x={point.x}
        y={point.y + 22}
      >
        {accessory.label}
      </text>
    </g>
  );
}

function AxonometricNodeMarker({
  node,
  selectedHeightTarget,
  transform,
  onHeightTargetSelect,
}: {
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
  const fill =
    node.kind === "supply"
      ? "#111827"
      : node.kind === "appliance"
        ? "#ffffff"
        : node.kind === "derivation"
          ? "#e8f5f2"
          : "#ffffff";
  const stroke =
    node.kind === "supply"
      ? "#111827"
      : node.kind === "appliance"
        ? "#3b5bdb"
        : "#0f766e";
  const heightTarget: SectionRouteHeightTarget = {
    kind: "node",
    nodeId: node.id,
  };
  const isSelected = sectionRouteHeightTargetsEqual(
    selectedHeightTarget,
    heightTarget,
  );
  const zMeters = node.point?.zMeters ?? null;

  return (
    <g
      data-axonometric-node-id={node.id}
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
          fill={isSelected ? "#fff1f2" : fill}
          height="13"
          stroke={isSelected ? "#be123c" : stroke}
          strokeWidth={isSelected ? 2.4 : 1.8}
          width="13"
          x={point.x - 6.5}
          y={point.y - 6.5}
        />
      ) : (
        <circle
          cx={point.x}
          cy={point.y}
          fill={isSelected ? "#fff1f2" : fill}
          r={node.kind === "supply" ? 7 : 6}
          stroke={isSelected ? "#be123c" : stroke}
          strokeWidth={isSelected ? 2.4 : 1.8}
        />
      )}
      <text
        fill={node.kind === "supply" ? "#111827" : "#263238"}
        fontSize="11"
        fontWeight="700"
        paintOrder="stroke"
        stroke="#ffffff"
        strokeLinejoin="round"
        strokeWidth="3"
        textAnchor="middle"
        x={point.x}
        y={point.y - 13}
      >
        {node.label}
      </text>
      {zMeters !== null ? (
        <text
          fill="#4b5563"
          fontSize="10"
          fontWeight="700"
          paintOrder="stroke"
          stroke="#ffffff"
          strokeWidth="3"
          textAnchor="middle"
          x={point.x}
          y={point.y + 21}
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

function createSectionCanvasTransform(view: StandardTechnicalSectionView) {
  const bounds = expandFlatBounds(sectionSourceBounds(view));
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

function createAxonometricCanvasTransform(view: TechnicalAxonometricView) {
  const bounds = expandFlatBounds({
    maxX: view.viewBox.minX + view.viewBox.width,
    maxY: view.viewBox.minY + view.viewBox.height,
    minX: view.viewBox.minX,
    minY: view.viewBox.minY,
  });
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

  if (points.length === 0) {
    return DEFAULT_SECTION_BOUNDS;
  }

  return points.reduce(
    (bounds, point) => ({
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
    }),
    {
      maxX: points[0]?.x ?? DEFAULT_SECTION_BOUNDS.maxX,
      maxY: points[0]?.y ?? DEFAULT_SECTION_BOUNDS.maxY,
      minX: points[0]?.x ?? DEFAULT_SECTION_BOUNDS.minX,
      minY: points[0]?.y ?? DEFAULT_SECTION_BOUNDS.minY,
    },
  );
}

function expandFlatBounds(bounds: {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}) {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const paddingX = Math.max(width * 0.06, 0.5);
  const paddingY = Math.max(height * 0.18, 0.5);

  return {
    maxX: bounds.maxX + paddingX,
    maxY: bounds.maxY + paddingY,
    minX: bounds.minX - paddingX,
    minY: bounds.minY - paddingY,
  };
}

function axonometricSegmentLabel(segment: TechnicalAxonometricSegment) {
  const parts = [segment.adoptedDiameterLabel];

  if (
    segment.zDeltaMeters !== null &&
    Math.abs(segment.zDeltaMeters) > 0.000001
  ) {
    parts.push(`dz ${formatSignedMeters(segment.zDeltaMeters)}`);
  }

  return parts.join(" - ");
}

function axonometricSegmentStroke(segment: TechnicalAxonometricSegment) {
  if (segment.status === "pending") {
    return "#9aa6b2";
  }

  const external = segment.adoptedDiameter?.externalDiameterMillimeters ?? 0;

  if (external >= 32) {
    return "#0f766e";
  }

  if (external >= 25) {
    return "#2563eb";
  }

  return "#455a64";
}

function axonometricSegmentStrokeWidth(segment: TechnicalAxonometricSegment) {
  const external = segment.adoptedDiameter?.externalDiameterMillimeters ?? 20;

  if (external >= 32) {
    return 4.2;
  }

  if (external >= 25) {
    return 3.2;
  }

  return 2.4;
}

function midpoint(first: Point2D, second: Point2D): Point2D {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
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

function roundCanvas(value: number) {
  return Math.round(value * 1000) / 1000;
}
