import { useState } from "react";
import type { Point2D } from "@/lib/geometry/types";
import {
  equipmentCode,
  hasPendingDemand,
  type EquipmentDraft,
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
  connectionPoint,
  equipment,
  isHovered,
  interaction,
  isSelected,
  routeHitTolerance,
  onHoverEquipment,
  onRouteEquipmentPoint,
  onSelectEquipment,
}: {
  bodyPoint: Point2D;
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
      <MarkerSymbol
        code={equipmentCode(equipment.type)}
        highlighted={highlighted}
        pending={pending}
        role={equipment.role}
      />
      {equipment.role === "appliance" ? (
        <GasConnectionMarker
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
      <circle
        fill="#ffffff"
        r="20"
        stroke={draft.role === "supply" ? "#b45309" : "#6d28d9"}
        strokeDasharray="4 3"
        strokeWidth="1.7"
      />
      <MarkerSymbol
        code={equipmentCode(draft.type)}
        highlighted
        pending={pending}
        role={draft.role}
      />
      {draft.role === "appliance" ? (
        <GasConnectionMarker
          highlighted
          offset={connectionOffset}
          pending={hasPendingAnchor}
        />
      ) : null}
    </g>
  );
}

function GasConnectionMarker({
  highlighted,
  offset,
  pending,
}: {
  highlighted: boolean;
  offset: Point2D;
  pending: boolean;
}) {
  const color = pending ? "#f59e0b" : "#111827";
  const isSeparate = Math.hypot(offset.x, offset.y) > 0.5;

  return (
    <g data-equipment-connection-point="true" pointerEvents="all">
      {isSeparate ? (
        <line
          stroke={pending ? "#f59e0b" : "#6d28d9"}
          strokeDasharray={pending ? "4 3" : "2 3"}
          strokeLinecap="round"
          strokeWidth={highlighted ? "1.8" : "1.3"}
          x1="0"
          x2={offset.x}
          y1="0"
          y2={offset.y}
        />
      ) : null}
      <circle
        cx={offset.x}
        cy={offset.y}
        fill="#ffffff"
        r={highlighted ? "5" : "4"}
        stroke={color}
        strokeDasharray={pending ? "3 2" : undefined}
        strokeWidth="1.8"
      />
      <circle cx={offset.x} cy={offset.y} fill={color} r="1.7" />
    </g>
  );
}

function MarkerSymbol({
  code,
  highlighted,
  pending,
  role,
}: {
  code: string;
  highlighted: boolean;
  pending: boolean;
  role: "supply" | "appliance";
}) {
  const stroke = role === "supply" ? "#b45309" : "#6d28d9";
  const fill = role === "supply" ? "#fff7ed" : "#f5f3ff";
  const warning = pending ? "#f59e0b" : stroke;
  const symbolStroke = highlighted ? 2.6 : 2;

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
        <circle
          fill={fill}
          r="17"
          stroke={warning}
          strokeDasharray={pending ? "4 3" : undefined}
          strokeWidth={symbolStroke}
        />
      )}
      <line
        stroke="#111827"
        strokeLinecap="round"
        strokeWidth="1.4"
        x1="-5"
        x2="5"
        y1="0"
        y2="0"
      />
      <line
        stroke="#111827"
        strokeLinecap="round"
        strokeWidth="1.4"
        x1="0"
        x2="0"
        y1="-5"
        y2="5"
      />
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
        y="-21"
      >
        {code}
      </text>
    </>
  );
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
