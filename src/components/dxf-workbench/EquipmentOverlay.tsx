import { useState } from "react";
import type { Point2D } from "@/lib/geometry/types";
import {
  equipmentCode,
  hasPendingDemand,
  type EquipmentDraft,
  type EquipmentWallAnchor,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import type { RouteDraft, RouteIntentDraft } from "@/lib/routing/types";

type EquipmentOverlayProps = {
  draft: EquipmentDraft | null;
  equipment: WorkbenchEquipment[];
  hoveredEquipmentId: string | null;
  isInteractionDisabled?: boolean;
  routeDraft?: RouteDraft | null;
  routeIntentDraft?: RouteIntentDraft | null;
  routeHitTolerance?: number;
  selectedEquipmentId: string | null;
  showEquipment: boolean;
  sourceToScreen: (point: Point2D) => Point2D;
  onHoverEquipment: (equipmentId: string | null) => void;
  onRouteEquipmentPoint?: (
    point: Point2D,
    tolerance: number,
    equipmentId?: string,
  ) => void;
  onSelectEquipment: (equipmentId: string) => void;
};

const EQUIPMENT_HITBOX_SIZE = 44;

export function EquipmentOverlay({
  draft,
  equipment,
  hoveredEquipmentId,
  isInteractionDisabled = false,
  routeDraft = null,
  routeIntentDraft = null,
  routeHitTolerance = 0,
  selectedEquipmentId,
  showEquipment,
  sourceToScreen,
  onHoverEquipment,
  onRouteEquipmentPoint,
  onSelectEquipment,
}: EquipmentOverlayProps) {
  return (
    <g className="equipment-overlay">
      {showEquipment
        ? equipment.map((item) => {
            const bodyPoint =
              item.role === "appliance"
                ? item.bodyPoint ?? item.connectionPoint
                : item.connectionPoint;

            return (
              <EquipmentMarker
                bodyPoint={sourceToScreen(bodyPoint)}
                bodyNormal={equipmentBodyNormalOffset({
                  anchor: item.wallAnchor,
                  sourcePoint: bodyPoint,
                  sourceToScreen,
                })}
                connectionPoint={sourceToScreen(item.connectionPoint)}
                equipment={item}
                isHovered={item.id === hoveredEquipmentId}
                interaction={equipmentInteractionForRoute(
                  item,
                  routeDraft,
                  routeIntentDraft,
                  {
                    isInteractionDisabled,
                    isPlacingEquipment: draft?.step === "placing",
                  },
                )}
                isSelected={item.id === selectedEquipmentId}
                key={item.id}
                routeHitTolerance={routeHitTolerance}
                wallReference={equipmentWallReferenceOffset({
                  anchor: item.wallAnchor,
                  bodyScreenPoint: sourceToScreen(bodyPoint),
                  sourceToScreen,
                })}
                onHoverEquipment={onHoverEquipment}
                onRouteEquipmentPoint={onRouteEquipmentPoint}
                onSelectEquipment={onSelectEquipment}
              />
            );
          })
        : null}
      {draft ? (
        <DraftEquipmentMarker draft={draft} sourceToScreen={sourceToScreen} />
      ) : null}
    </g>
  );
}

function EquipmentMarker({
  bodyPoint,
  bodyNormal,
  connectionPoint,
  equipment,
  isHovered,
  interaction,
  isSelected,
  routeHitTolerance,
  onHoverEquipment,
  onRouteEquipmentPoint,
  onSelectEquipment,
  wallReference,
}: {
  bodyPoint: Point2D;
  bodyNormal: Point2D | null;
  connectionPoint: Point2D;
  equipment: WorkbenchEquipment;
  isHovered: boolean;
  interaction: EquipmentMarkerInteraction;
  isSelected: boolean;
  routeHitTolerance: number;
  onHoverEquipment: (equipmentId: string | null) => void;
  onRouteEquipmentPoint?: (
    point: Point2D,
    tolerance: number,
    equipmentId?: string,
  ) => void;
  onSelectEquipment: (equipmentId: string) => void;
  wallReference: EquipmentWallReferenceOffset | null;
}) {
  const [isLocalHovered, setIsLocalHovered] = useState(false);
  const highlighted = isHovered || isSelected || isLocalHovered;
  const hasPendingAnchor = equipmentAnchorIsPending(equipment);
  const pending = hasPendingDemand(equipment) || hasPendingAnchor;
  const isInteractive = interaction !== "none";
  const connectionOffset = {
    x: connectionPoint.x - bodyPoint.x,
    y: connectionPoint.y - bodyPoint.y,
  };

  return (
    <g
      className="cursor-pointer"
      cursor="pointer"
      data-equipment-id={equipment.id}
      data-equipment-interaction={interaction}
      data-equipment-role={equipment.role}
      data-equipment-type={equipment.type}
      data-wall-anchor-status={
        equipment.role === "appliance"
          ? equipment.wallAnchor?.status ?? "pending"
          : undefined
      }
      opacity={highlighted ? 1 : 0.88}
      pointerEvents={isInteractive ? "all" : "none"}
      transform={`translate(${bodyPoint.x} ${bodyPoint.y})`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();

        if (interaction === "route") {
          onRouteEquipmentPoint?.(
            equipment.connectionPoint,
            routeHitTolerance,
            equipment.id,
          );
          return;
        }

        onSelectEquipment(equipment.id);
      }}
      onPointerEnter={() => {
        setIsLocalHovered(true);
        onHoverEquipment(equipment.id);
      }}
      onPointerLeave={() => {
        setIsLocalHovered(false);
        onHoverEquipment(null);
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <title>
        {equipment.name}
        {equipment.role === "appliance"
          ? hasPendingAnchor
            ? " - anclaje pendiente"
            : " - anclado a pared"
          : ""}
      </title>
      <circle
        data-equipment-hitbox={EQUIPMENT_HITBOX_SIZE}
        fill="#000000"
        fillOpacity="0"
        pointerEvents={isInteractive ? "all" : "none"}
        r={EQUIPMENT_HITBOX_SIZE / 2}
      />
      <WallReferenceMarker reference={wallReference} />
      <MarkerSymbol
        bodyNormal={bodyNormal}
        code={equipmentCode(equipment.type)}
        connectionOffset={connectionOffset}
        highlighted={highlighted}
        pending={pending}
        role={equipment.role}
      />
      {equipment.role === "appliance" ? (
        <GasConnectionMarker
          bodyNormal={bodyNormal}
          highlighted={highlighted}
          offset={connectionOffset}
          pending={hasPendingAnchor}
        />
      ) : null}
      {highlighted ? <MarkerLabel name={equipment.name} role={equipment.role} /> : null}
    </g>
  );
}

type EquipmentMarkerInteraction = "none" | "route" | "select";

function equipmentInteractionForRoute(
  equipment: WorkbenchEquipment,
  routeDraft: RouteDraft | null,
  routeIntentDraft: RouteIntentDraft | null,
  params: {
    isInteractionDisabled: boolean;
    isPlacingEquipment: boolean;
  },
): EquipmentMarkerInteraction {
  if (routeIntentDraft?.step === "from" || routeIntentDraft?.step === "to") {
    return "route";
  }

  if (routeIntentDraft) {
    return "none";
  }

  if (routeDraft?.step === "origin") {
    return "route";
  }

  if (routeDraft?.step === "drawing") {
    return equipment.id === routeDraft.targetEquipmentId ? "route" : "none";
  }

  if (params.isInteractionDisabled || params.isPlacingEquipment) {
    return "none";
  }

  return "select";
}

function DraftEquipmentMarker({
  draft,
  sourceToScreen,
}: {
  draft: EquipmentDraft;
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const sourcePoint = draft.bodyPoint ?? draft.connectionPoint ?? draft.previewPoint;
  const sourceConnectionPoint =
    draft.connectionPoint ?? draft.previewPoint ?? draft.bodyPoint;

  if (!sourcePoint || !sourceConnectionPoint) {
    return null;
  }

  const point = sourceToScreen(sourcePoint);
  const connectionPoint = sourceToScreen(sourceConnectionPoint);
  const hasPendingAnchor = draftAnchorIsPending(draft);
  const pending =
    draft.role === "appliance" &&
    (draft.demandValueInput.trim().length === 0 || hasPendingAnchor);
  const connectionOffset = {
    x: connectionPoint.x - point.x,
    y: connectionPoint.y - point.y,
  };

  return (
    <g
      data-equipment-draft="true"
      data-wall-anchor-status={
        draft.role === "appliance"
          ? draft.wallAnchor?.status ?? "pending"
          : undefined
      }
      opacity="0.82"
      pointerEvents="none"
      transform={`translate(${point.x} ${point.y})`}
    >
      {draft.role === "supply" ? (
        <circle
          fill="#ffffff"
          r="20"
          stroke="#b45309"
          strokeDasharray="4 3"
          strokeWidth="1.7"
        />
      ) : (
        <rect
          fill="#ffffff"
          height="32"
          rx="3"
          stroke="#6d28d9"
          strokeDasharray="4 3"
          strokeWidth="1.7"
          width="40"
          x="-20"
          y="-16"
        />
      )}
      <WallReferenceMarker
        reference={equipmentWallReferenceOffset({
          anchor: draft.wallAnchor,
          bodyScreenPoint: point,
          sourceToScreen,
        })}
      />
      <MarkerSymbol
        bodyNormal={equipmentBodyNormalOffset({
          anchor: draft.wallAnchor,
          sourcePoint,
          sourceToScreen,
        })}
        code={equipmentCode(draft.type)}
        connectionOffset={connectionOffset}
        highlighted
        pending={pending}
        role={draft.role}
      />
      {draft.role === "appliance" ? (
        <GasConnectionMarker
          bodyNormal={equipmentBodyNormalOffset({
            anchor: draft.wallAnchor,
            sourcePoint,
            sourceToScreen,
          })}
          highlighted
          offset={connectionOffset}
          pending={hasPendingAnchor}
        />
      ) : null}
    </g>
  );
}

function WallReferenceMarker({
  reference,
}: {
  reference: EquipmentWallReferenceOffset | null;
}) {
  if (!reference) {
    return null;
  }

  return (
    <g data-equipment-wall-reference="true" pointerEvents="none">
      <line
        stroke="#0f766e"
        strokeLinecap="round"
        strokeOpacity="0.85"
        strokeWidth="3"
        x1={reference.from.x}
        x2={reference.to.x}
        y1={reference.from.y}
        y2={reference.to.y}
      />
      <line
        stroke="#ffffff"
        strokeLinecap="round"
        strokeOpacity="0.8"
        strokeWidth="1"
        x1={reference.from.x}
        x2={reference.to.x}
        y1={reference.from.y}
        y2={reference.to.y}
      />
    </g>
  );
}

function GasConnectionMarker({
  bodyNormal,
  highlighted,
  offset,
  pending,
}: {
  bodyNormal: Point2D | null;
  highlighted: boolean;
  offset: Point2D;
  pending: boolean;
}) {
  const color = pending ? "#f59e0b" : "#111827";
  const isSeparate = Math.hypot(offset.x, offset.y) > 0.5;
  const arrivalVector = bodyNormal ?? applianceBodyNormal(null, offset);
  const arrivalStart = scalePoint(arrivalVector, 18);

  return (
    <g data-equipment-connection-point="true" pointerEvents="all">
      {isSeparate ? (
        <line
          data-equipment-terminal-arrival="true"
          stroke={pending ? "#f59e0b" : "#6d28d9"}
          strokeDasharray={pending ? "4 3" : undefined}
          strokeLinecap="round"
          strokeWidth={highlighted ? "2.2" : "1.6"}
          x1="0"
          x2={offset.x}
          y1="0"
          y2={offset.y}
        />
      ) : (
        <line
          data-equipment-terminal-arrival="true"
          stroke={pending ? "#f59e0b" : "#6d28d9"}
          strokeDasharray={pending ? "4 3" : undefined}
          strokeLinecap="round"
          strokeWidth={highlighted ? "2" : "1.5"}
          x1={arrivalStart.x}
          x2="0"
          y1={arrivalStart.y}
          y2="0"
        />
      )}
      <rect
        fill="#ffffff"
        height={highlighted ? "9" : "7"}
        stroke={color}
        strokeDasharray={pending ? "3 2" : undefined}
        strokeWidth="1.8"
        transform={`translate(${offset.x} ${offset.y}) rotate(45)`}
        width={highlighted ? "9" : "7"}
        x={highlighted ? "-4.5" : "-3.5"}
        y={highlighted ? "-4.5" : "-3.5"}
      />
      <circle cx={offset.x} cy={offset.y} fill={color} r="1.6" />
    </g>
  );
}

function MarkerSymbol({
  bodyNormal,
  code,
  connectionOffset,
  highlighted,
  pending,
  role,
}: {
  bodyNormal: Point2D | null;
  code: string;
  connectionOffset: Point2D;
  highlighted: boolean;
  pending: boolean;
  role: "supply" | "appliance";
}) {
  const stroke = role === "supply" ? "#b45309" : "#6d28d9";
  const fill = role === "supply" ? "#fff7ed" : "#f5f3ff";
  const warning = pending ? "#f59e0b" : stroke;
  const symbolStroke = highlighted ? 2.6 : 2;
  const normal = applianceBodyNormal(bodyNormal, connectionOffset);
  const tangent = {
    x: -normal.y,
    y: normal.x,
  };
  const bodyWidth = 34;
  const bodyDepth = 24;
  const wallLeft = scalePoint(tangent, -bodyWidth / 2);
  const wallRight = scalePoint(tangent, bodyWidth / 2);
  const frontRight = addPoints(wallRight, scalePoint(normal, bodyDepth));
  const frontLeft = addPoints(wallLeft, scalePoint(normal, bodyDepth));
  const firstRib = addPoints(scalePoint(normal, bodyDepth * 0.35), scalePoint(tangent, -11));
  const secondRib = addPoints(scalePoint(normal, bodyDepth * 0.7), scalePoint(tangent, -11));

  return (
    <>
      {role === "supply" ? (
        <rect
          fill={fill}
          height="27"
          rx="5"
          stroke={stroke}
          strokeWidth={symbolStroke}
          transform="rotate(45)"
          width="27"
          x="-13.5"
          y="-13.5"
        />
      ) : (
        <g>
          <polygon
            points={polygonPoints([wallLeft, wallRight, frontRight, frontLeft])}
            fill={fill}
            stroke={warning}
            strokeDasharray={pending ? "4 3" : undefined}
            strokeWidth={symbolStroke}
          />
          <line
            stroke="#111827"
            strokeLinecap="round"
            strokeWidth="1.2"
            x1={firstRib.x}
            x2={firstRib.x + tangent.x * 22}
            y1={firstRib.y}
            y2={firstRib.y + tangent.y * 22}
          />
          <line
            stroke="#111827"
            strokeLinecap="round"
            strokeWidth="1.2"
            x1={secondRib.x}
            x2={secondRib.x + tangent.x * 22}
            y1={secondRib.y}
            y2={secondRib.y + tangent.y * 22}
          />
        </g>
      )}
      <circle
        data-equipment-body-point="true"
        fill="#111827"
        pointerEvents="none"
        r="1.8"
      />
      <text
        fill="#111827"
        fontSize={code.length > 2 ? "8.5" : "10"}
        fontWeight="800"
        pointerEvents="none"
        textAnchor="middle"
        y={role === "appliance" ? normal.y * (bodyDepth + 10) - 2 : -21}
        x={role === "appliance" ? normal.x * (bodyDepth + 10) : 0}
      >
        {code}
      </text>
    </>
  );
}

type EquipmentWallReferenceOffset = {
  from: Point2D;
  to: Point2D;
};

function equipmentBodyNormalOffset(params: {
  anchor: EquipmentWallAnchor | null | undefined;
  sourcePoint: Point2D | null | undefined;
  sourceToScreen: (point: Point2D) => Point2D;
}): Point2D | null {
  if (
    params.anchor?.status !== "anchored" ||
    !params.anchor.normal ||
    !params.sourcePoint
  ) {
    return null;
  }

  const origin = params.sourceToScreen(params.sourcePoint);
  const normalPoint = params.sourceToScreen({
    x: params.sourcePoint.x + params.anchor.normal.x,
    y: params.sourcePoint.y + params.anchor.normal.y,
  });

  return normalizePoint({
    x: normalPoint.x - origin.x,
    y: normalPoint.y - origin.y,
  });
}

function applianceBodyNormal(
  bodyNormal: Point2D | null,
  connectionOffset: Point2D,
) {
  if (bodyNormal) {
    return bodyNormal;
  }

  if (Math.hypot(connectionOffset.x, connectionOffset.y) > 0.5) {
    return normalizePoint({
      x: -connectionOffset.x,
      y: -connectionOffset.y,
    });
  }

  return { x: 0, y: -1 };
}

function normalizePoint(point: Point2D): Point2D {
  const length = Math.hypot(point.x, point.y);

  return length > Number.EPSILON
    ? {
        x: point.x / length,
        y: point.y / length,
      }
    : { x: 0, y: -1 };
}

function addPoints(first: Point2D, second: Point2D): Point2D {
  return {
    x: first.x + second.x,
    y: first.y + second.y,
  };
}

function scalePoint(point: Point2D, scale: number): Point2D {
  return {
    x: point.x * scale,
    y: point.y * scale,
  };
}

function polygonPoints(points: Point2D[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function equipmentWallReferenceOffset(params: {
  anchor: EquipmentWallAnchor | null | undefined;
  bodyScreenPoint: Point2D;
  sourceToScreen: (point: Point2D) => Point2D;
}): EquipmentWallReferenceOffset | null {
  if (
    params.anchor?.status !== "anchored" ||
    !params.anchor.wallPoint ||
    params.anchor.orientationRadians === null ||
    params.anchor.orientationRadians === undefined ||
    !Number.isFinite(params.anchor.orientationRadians)
  ) {
    return null;
  }

  const halfLengthSource = Math.max(params.anchor.distanceSource ?? 0, 0.35);
  const tangent = {
    x: Math.cos(params.anchor.orientationRadians),
    y: Math.sin(params.anchor.orientationRadians),
  };
  const wallPoint = params.anchor.wallPoint;
  const from = params.sourceToScreen({
    x: wallPoint.x - tangent.x * halfLengthSource,
    y: wallPoint.y - tangent.y * halfLengthSource,
  });
  const to = params.sourceToScreen({
    x: wallPoint.x + tangent.x * halfLengthSource,
    y: wallPoint.y + tangent.y * halfLengthSource,
  });

  return {
    from: {
      x: from.x - params.bodyScreenPoint.x,
      y: from.y - params.bodyScreenPoint.y,
    },
    to: {
      x: to.x - params.bodyScreenPoint.x,
      y: to.y - params.bodyScreenPoint.y,
    },
  };
}

function equipmentAnchorIsPending(equipment: WorkbenchEquipment) {
  return (
    equipment.role === "appliance" && equipment.wallAnchor?.status !== "anchored"
  );
}

function draftAnchorIsPending(draft: EquipmentDraft) {
  return draft.role === "appliance" && draft.wallAnchor?.status !== "anchored";
}

function MarkerLabel({
  name,
  role,
}: {
  name: string;
  role: "supply" | "appliance";
}) {
  const stroke = role === "supply" ? "#b45309" : "#6d28d9";
  const width = Math.min(Math.max(name.length * 6.8 + 18, 72), 190);

  return (
    <g transform="translate(20 -22)">
      <rect
        fill="#ffffff"
        height="22"
        rx="4"
        stroke={stroke}
        strokeWidth="1.5"
        width={width}
      />
      <text
        fill="#111827"
        fontSize="11"
        fontWeight="600"
        pointerEvents="none"
        x="8"
        y="15"
      >
        {name.length > 24 ? `${name.slice(0, 23)}...` : name}
      </text>
    </g>
  );
}
