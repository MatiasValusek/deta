import type { Point2D } from "@/lib/geometry/types";
import type {
  SectionRouteProjectedAccessory,
  SectionRouteProjectedEquipment,
  SectionRouteProjectedPoint,
  SectionRouteProjectedSegment,
  SectionRouteProjection,
} from "@/lib/sections/routeProjection";

type SectionRouteProjectionOverlayProps = {
  projection: SectionRouteProjection | null;
  sourceToScreen: (point: Point2D) => Point2D;
};

export function SectionRouteProjectionOverlay({
  projection,
  sourceToScreen,
}: SectionRouteProjectionOverlayProps) {
  if (!projection) {
    return null;
  }

  return (
    <g className="section-route-projection-overlay" pointerEvents="none">
      {projection.segments.map((segment) => (
        <ProjectedSegment
          key={segment.id}
          segment={segment}
          sourceToScreen={sourceToScreen}
        />
      ))}
      {projection.accessories.map((accessory) => (
        <ProjectedAccessory
          accessory={accessory}
          key={accessory.id}
          sourceToScreen={sourceToScreen}
        />
      ))}
      {projection.equipment.map((equipment) => (
        <ProjectedEquipment
          equipment={equipment}
          key={equipment.nodeId}
          sourceToScreen={sourceToScreen}
        />
      ))}
    </g>
  );
}

function ProjectedSegment({
  segment,
  sourceToScreen,
}: {
  segment: SectionRouteProjectedSegment;
  sourceToScreen: (point: Point2D) => Point2D;
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
      />
      <path
        d={path}
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
      {labelPoint ? (
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
    </g>
  );
}

function ProjectedAccessory({
  accessory,
  sourceToScreen,
}: {
  accessory: SectionRouteProjectedAccessory;
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
      <ProjectionLabel
        fill={stroke}
        point={{ x: 0, y: -12 }}
        text={accessory.label}
      />
    </g>
  );
}

function ProjectedEquipment({
  equipment,
  sourceToScreen,
}: {
  equipment: SectionRouteProjectedEquipment;
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const point = sourceToScreen(equipment.sectionPoint);
  const isSupply = equipment.role === "supply";

  return (
    <g
      data-section-route-equipment-id={equipment.equipmentId}
      data-section-route-node-id={equipment.nodeId}
      transform={`translate(${point.x} ${point.y})`}
    >
      <circle
        fill="#ffffff"
        r={isSupply ? 6 : 5}
        stroke={isSupply ? "#92400e" : "#6d28d9"}
        strokeWidth="2"
      />
      <ProjectionLabel
        fill={isSupply ? "#92400e" : "#5b21b6"}
        point={{ x: 0, y: 16 }}
        text={equipment.label}
      />
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
