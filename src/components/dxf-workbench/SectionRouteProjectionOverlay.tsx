import type { Point2D } from "@/lib/geometry/types";
import type {
  SectionRouteProjectedAccessory,
  SectionRouteProjectedEquipment,
  SectionRouteProjectedPoint,
  SectionRouteProjectedSegment,
  SectionRouteProjection,
} from "@/lib/sections/routeProjection";
import {
  sectionRouteHeightTargetKey,
  sectionRouteHeightTargetsEqual,
  type SectionRouteHeightTarget,
} from "@/lib/sections/routeHeightEditing";

type SectionRouteProjectionOverlayProps = {
  detailsVisible?: boolean;
  selectedHeightTarget?: SectionRouteHeightTarget | null;
  projection: SectionRouteProjection | null;
  sourceToScreen: (point: Point2D) => Point2D;
  onHeightTargetSelect?: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
};

export function SectionRouteProjectionOverlay({
  detailsVisible = false,
  selectedHeightTarget,
  projection,
  sourceToScreen,
  onHeightTargetSelect,
}: SectionRouteProjectionOverlayProps) {
  if (!projection) {
    return null;
  }

  return (
    <g className="section-route-projection-overlay">
      {projection.status === "pending" &&
      projection.segments.length === 0 &&
      projection.pendingItems.length > 0 ? (
        <ProjectionBlockedNotice reason={projection.pendingItems[0]?.reason} />
      ) : null}
      {projection.segments.map((segment) => (
        <ProjectedSegment
          key={segment.id}
          detailsVisible={detailsVisible}
          selectedHeightTarget={selectedHeightTarget}
          segment={segment}
          sourceToScreen={sourceToScreen}
          onHeightTargetSelect={onHeightTargetSelect}
        />
      ))}
      {projection.accessories.map((accessory) => (
        <ProjectedAccessory
          accessory={accessory}
          detailsVisible={detailsVisible}
          key={accessory.id}
          sourceToScreen={sourceToScreen}
        />
      ))}
      {projection.equipment.map((equipment) => (
        <ProjectedEquipment
          equipment={equipment}
          key={equipment.nodeId}
          selectedHeightTarget={selectedHeightTarget}
          sourceToScreen={sourceToScreen}
          onHeightTargetSelect={onHeightTargetSelect}
        />
      ))}
    </g>
  );
}

function ProjectionBlockedNotice({ reason }: { reason: string | undefined }) {
  return (
    <g
      data-section-route-projection-blocked="true"
      pointerEvents="none"
      transform="translate(18 28)"
    >
      <rect
        fill="#fffbeb"
        height="42"
        rx="4"
        stroke="#d97706"
        strokeWidth="1.5"
        width="300"
      />
      <text fill="#92400e" fontSize="11" fontWeight="700" x="10" y="17">
        Proyeccion fisica bloqueada
      </text>
      <text fill="#92400e" fontSize="10" x="10" y="32">
        {clipLabel(reason ?? "Falta escala o correspondencia del corte.", 48)}
      </text>
    </g>
  );
}

function ProjectedSegment({
  detailsVisible,
  selectedHeightTarget,
  segment,
  sourceToScreen,
  onHeightTargetSelect,
}: {
  detailsVisible: boolean;
  selectedHeightTarget?: SectionRouteHeightTarget | null;
  segment: SectionRouteProjectedSegment;
  sourceToScreen: (point: Point2D) => Point2D;
  onHeightTargetSelect?: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
}) {
  const screenPoints = segment.points.map((point) =>
    sourceToScreen(point.sectionPoint),
  );
  const path = svgPath(screenPoints);
  const labelPoint = pathMidpoint(screenPoints);

  if (!path) {
    return null;
  }

  return (
    <g
      data-section-route-segment-id={segment.segmentId}
      data-section-route-segment-status={segment.status}
    >
      <path
        d={path}
        fill="none"
        stroke={segment.status === "pending" ? "#d97706" : "#0f766e"}
        strokeDasharray={segment.status === "pending" ? "7 5" : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
        pointerEvents="none"
      />
      <path
        d={path}
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.55"
        strokeWidth="1.2"
        pointerEvents="none"
      />
      {detailsVisible && labelPoint ? (
        <ProjectionLabel
          fill={segment.status === "pending" ? "#92400e" : "#134e4a"}
          point={labelPoint}
          text={segment.adoptedDiameterLabel}
        />
      ) : null}
      {segment.points
        .filter(
          (point) =>
            point.source === "vertical" || point.source === "connection",
        )
        .map((point, index) => (
          <ProjectionLabel
            fill="#374151"
            key={`${segment.segmentId}:z:${index}`}
            point={offsetPoint(sourceToScreen(point.sectionPoint), 0, -14)}
            text={formatElevation(point.elevationMeters)}
          />
        ))}
      {segment.points.map((point, index) => (
        <ProjectedHeightHandle
          currentHeightMeters={point.elevationMeters}
          key={`${segment.segmentId}:height:${index}`}
          point={sourceToScreen(point.sectionPoint)}
          selected={sectionRouteHeightTargetsEqual(
            selectedHeightTarget,
            point.heightTarget,
          )}
          target={point.heightTarget}
          onHeightTargetSelect={onHeightTargetSelect}
        />
      ))}
    </g>
  );
}

function ProjectedAccessory({
  accessory,
  detailsVisible,
  sourceToScreen,
}: {
  accessory: SectionRouteProjectedAccessory;
  detailsVisible: boolean;
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  if (!accessory.sectionPoint) {
    return null;
  }

  const point = sourceToScreen(accessory.sectionPoint);
  const stroke = accessory.status === "pending" ? "#d97706" : "#7c3aed";

  return (
    <g
      data-section-route-accessory-id={accessory.id}
      data-section-route-accessory-kind={accessory.kind}
      data-section-route-accessory-status={accessory.status}
      pointerEvents="none"
      transform={`translate(${point.x} ${point.y})`}
    >
      {accessory.kind === "valve" ? (
        <ValveGlyph stroke={stroke} />
      ) : accessory.kind === "rh_elbow" ? (
        <RhGlyph stroke={stroke} />
      ) : (
        <circle
          fill="#ffffff"
          r="6"
          stroke={stroke}
          strokeWidth="2"
        />
      )}
      {detailsVisible ? (
        <ProjectionLabel
          fill={stroke}
          point={{ x: 0, y: -12 }}
          text={accessory.label}
        />
      ) : null}
    </g>
  );
}

function ProjectedEquipment({
  equipment,
  selectedHeightTarget,
  sourceToScreen,
  onHeightTargetSelect,
}: {
  equipment: SectionRouteProjectedEquipment;
  selectedHeightTarget?: SectionRouteHeightTarget | null;
  sourceToScreen: (point: Point2D) => Point2D;
  onHeightTargetSelect?: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
}) {
  const connectionPoint = sourceToScreen(equipment.sectionPoint);
  const bodyPoint = sourceToScreen(
    equipment.bodySectionPoint ?? equipment.sectionPoint,
  );
  const isSupply = equipment.role === "supply";
  const stroke = isSupply
    ? "#92400e"
    : equipment.anchorStatus === "pending"
      ? "#d97706"
      : "#6d28d9";
  const connectorVisible =
    Math.hypot(bodyPoint.x - connectionPoint.x, bodyPoint.y - connectionPoint.y) >
    0.5;
  const selected = sectionRouteHeightTargetsEqual(
    selectedHeightTarget,
    equipment.heightTarget,
  );

  return (
    <g
      data-section-route-equipment-anchor-status={equipment.anchorStatus ?? "none"}
      data-section-route-equipment-id={equipment.equipmentId}
      data-section-route-node-id={equipment.nodeId}
    >
      {connectorVisible ? (
        <line
          pointerEvents="none"
          stroke={stroke}
          strokeDasharray={equipment.anchorStatus === "pending" ? "4 3" : undefined}
          strokeLinecap="round"
          strokeWidth="1.6"
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
          r="6"
          stroke={stroke}
          strokeWidth="2"
          pointerEvents="none"
        />
      ) : (
        <rect
          fill="#ffffff"
          height="12"
          pointerEvents="none"
          stroke={stroke}
          strokeDasharray={equipment.anchorStatus === "pending" ? "4 3" : undefined}
          strokeWidth="2"
          width="16"
          x={bodyPoint.x - 8}
          y={bodyPoint.y - 6}
        />
      )}
      <circle
        cx={connectionPoint.x}
        cy={connectionPoint.y}
        fill={selected ? "#fff1f2" : "#ffffff"}
        r="3.5"
        stroke={selected ? "#be123c" : stroke}
        strokeWidth="1.8"
        pointerEvents="none"
      />
      <ProjectedHeightHandle
        currentHeightMeters={equipment.zMeters}
        point={connectionPoint}
        selected={selected}
        target={equipment.heightTarget}
        onHeightTargetSelect={onHeightTargetSelect}
      />
      <ProjectionLabel
        fill={stroke}
        point={offsetPoint(bodyPoint, 0, 17)}
        text={`${equipment.label} ${formatElevation(equipment.zMeters)}`}
      />
    </g>
  );
}

function ProjectedHeightHandle({
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
  onHeightTargetSelect?: (
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) => void;
}) {
  if (!target || !onHeightTargetSelect) {
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
        r={selected ? 7 : 5}
        stroke={stroke}
        strokeWidth={selected ? 2.4 : 1.8}
      />
      {selected ? (
        <ProjectionLabel
          fill={stroke}
          point={{ x: 0, y: -18 }}
          text={formatElevation(currentHeightMeters)}
        />
      ) : null}
      <title>{`Editar cota ${formatElevation(currentHeightMeters)}`}</title>
    </g>
  );
}

function ValveGlyph({ stroke }: { stroke: string }) {
  return (
    <>
      <line stroke={stroke} strokeLinecap="round" strokeWidth="2" x1="-9" x2="-4" y1="0" y2="0" />
      <line stroke={stroke} strokeLinecap="round" strokeWidth="2" x1="4" x2="9" y1="0" y2="0" />
      <rect
        fill="#ffffff"
        height="9"
        stroke={stroke}
        strokeWidth="2"
        transform="rotate(45)"
        width="9"
        x="-4.5"
        y="-4.5"
      />
      <line stroke={stroke} strokeLinecap="round" strokeWidth="2" x1="-4" x2="4" y1="-7" y2="-7" />
    </>
  );
}

function RhGlyph({ stroke }: { stroke: string }) {
  return (
    <>
      <path
        d="M -7 4 L -7 -4 Q -7 -8 -3 -8 L 6 -8"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <circle fill="#ffffff" r="3.3" stroke={stroke} strokeWidth="1.8" />
    </>
  );
}

function ProjectionLabel({
  fill,
  point,
  text,
}: {
  fill: string;
  point: Point2D;
  text: string;
}) {
  return (
    <text
      fill={fill}
      fontSize="11"
      fontWeight="700"
      paintOrder="stroke"
      stroke="#ffffff"
      strokeLinejoin="round"
      strokeWidth="3"
      textAnchor="middle"
      x={point.x}
      y={point.y}
    >
      {text}
    </text>
  );
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

function pathMidpoint(points: Point2D[]) {
  if (points.length === 0) {
    return null;
  }

  return points[Math.floor(points.length / 2)] ?? null;
}

function offsetPoint(point: Point2D, x: number, y: number): Point2D {
  return {
    x: point.x + x,
    y: point.y + y,
  };
}

function formatElevation(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} m`;
}

function clipLabel(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 3))}...`
    : value;
}
