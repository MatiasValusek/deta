import { useState } from "react";
import type { Point2D } from "@/lib/geometry/types";
import { pointZMeters } from "@/lib/geometry/height";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  buildEquipmentIndex,
  findTerminalStartNodeByEquipment,
  getRouteNodeDegree,
  resolveRouteNodePosition,
  resolveRouteSegments,
  routeSegmentPlanLegs,
} from "@/lib/routing/network";
import type { PhysicalRouteEditSelection } from "@/lib/routing/physicalRouteEditing";
import type {
  AutomaticRouteProposal,
  ManualRouteNetwork,
  ResolvedRouteSegment,
  RouteDraft,
  RouteIntentConnection,
  RouteIntentDraft,
  RouteIntentEndpoint,
  RouteNode,
} from "@/lib/routing/types";

type RouteOverlayProps = {
  draft: RouteDraft | null;
  equipment: WorkbenchEquipment[];
  highlightedSegmentIds: Set<string>;
  invalidSegmentIds: Set<string>;
  isEditingEnabled: boolean;
  intentConnections: RouteIntentConnection[];
  intentDraft: RouteIntentDraft | null;
  network: ManualRouteNetwork;
  proposal: AutomaticRouteProposal | null;
  proposalOutdated: boolean;
  routeEditTolerance: number;
  screenToSource: (point: Point2D) => Point2D;
  selectedEdit: PhysicalRouteEditSelection | null;
  showRoute: boolean;
  sourceToScreen: (point: Point2D) => Point2D;
  onElementSelect: (selection: PhysicalRouteEditSelection) => void;
  onNodeMove: (nodeId: string, point: Point2D, tolerance: number) => void;
  onVertexInsert: (segmentId: string, point: Point2D, tolerance: number) => void;
  onVertexMove: (
    segmentId: string,
    vertexIndex: number,
    point: Point2D,
    tolerance: number,
  ) => void;
};

type RouteDragState = {
  pointerId: number;
  selection: Extract<
    PhysicalRouteEditSelection,
    { kind: "node" | "vertex" }
  >;
};

type RouteSegmentVisualRole = "derivation" | "pass" | "terminal" | "vertical";

export function RouteOverlay({
  draft,
  equipment,
  highlightedSegmentIds,
  invalidSegmentIds,
  isEditingEnabled,
  intentConnections,
  intentDraft,
  network,
  proposal,
  proposalOutdated,
  routeEditTolerance,
  screenToSource,
  selectedEdit,
  showRoute,
  sourceToScreen,
  onElementSelect,
  onNodeMove,
  onVertexInsert,
  onVertexMove,
}: RouteOverlayProps) {
  const [dragState, setDragState] = useState<RouteDragState | null>(null);
  const equipmentById = buildEquipmentIndex(equipment);
  const resolvedSegments = resolveRouteSegments(network, equipment);
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const hasProposal = Boolean(proposal);
  const canEdit =
    isEditingEnabled && showRoute && !draft && !intentDraft && !proposal;

  function handleStartDrag(
    event: React.PointerEvent<SVGGElement>,
    selection: RouteDragState["selection"],
  ) {
    if (!canEdit) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onElementSelect(selection);
    setDragState({
      pointerId: event.pointerId,
      selection,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDragMove(event: React.PointerEvent<SVGGElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = screenToSource(svgEventPoint(event));

    if (dragState.selection.kind === "node") {
      onNodeMove(dragState.selection.nodeId, point, routeEditTolerance);
      return;
    }

    onVertexMove(
      dragState.selection.segmentId,
      dragState.selection.vertexIndex,
      point,
      routeEditTolerance,
    );
  }

  function handleDragEnd(event: React.PointerEvent<SVGGElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragState(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <g className="route-overlay">
      {showRoute
        ? resolvedSegments.map((segment) => {
            const role = routeSegmentVisualRole(segment, nodeById, network);

            return (
              <RouteSegmentLine
                canEdit={canEdit}
                dimmed={hasProposal}
                isHighlighted={highlightedSegmentIds.has(segment.id)}
                isInvalid={invalidSegmentIds.has(segment.id)}
                isSelected={routeSelectionMatchesSegment(selectedEdit, segment.id)}
                key={segment.id}
                points={routeSegmentScreenPoints(segment, sourceToScreen)}
                role={role}
                zMarker={routeSegmentZMarker(segment, sourceToScreen)}
                onInsert={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onVertexInsert(
                    segment.id,
                    screenToSource(svgEventPoint(event)),
                    routeEditTolerance,
                  );
                }}
                onSelect={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onElementSelect({
                    kind: "segment",
                    segmentId: segment.id,
                  });
                }}
              />
            );
          })
        : null}
      {showRoute
        ? resolvedSegments.flatMap((segment) =>
            (segment.vertices ?? []).map((vertex, vertexIndex) => {
              const point = segment.path[vertexIndex + 1];

              return point ? (
                <RouteVertexHandle
                  canEdit={canEdit}
                  dimmed={hasProposal}
                  key={`${segment.id}:vertex:${vertexIndex}`}
                  point={sourceToScreen(point)}
                  selected={routeSelectionMatchesVertex(
                    selectedEdit,
                    segment.id,
                    vertexIndex,
                  )}
                  onPointerCancel={handleDragEnd}
                  onPointerDown={(event) =>
                    handleStartDrag(event, {
                      kind: "vertex",
                      segmentId: segment.id,
                      vertexIndex,
                    })
                  }
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                />
              ) : null;
            }),
          )
        : null}
      {showRoute
        ? network.nodes.map((node) => {
            const position = resolveRouteNodePosition(node, equipmentById);

            return position ? (
              <RouteNodeMarker
                canEdit={canEdit}
                dimmed={hasProposal}
                degree={getRouteNodeDegree(network, node.id)}
                key={node.id}
                node={node}
                point={sourceToScreen(position)}
                selected={routeSelectionMatchesNode(selectedEdit, node)}
                onPointerCancel={handleDragEnd}
                onPointerDown={(event) => {
                  if (node.kind === "route") {
                    handleStartDrag(event, {
                      kind: "node",
                      nodeId: node.id,
                    });
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  onElementSelect(routeNodeSelection(node));
                }}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
              />
            ) : null;
          })
        : null}
      {showRoute ? (
        <RouteIntentLayer
          connections={intentConnections}
          draft={intentDraft}
          equipment={equipment}
          sourceToScreen={sourceToScreen}
        />
      ) : null}
      {proposal ? (
        <RouteProposalPreview
          equipment={equipment}
          isOutdated={proposalOutdated}
          proposal={proposal}
          sourceToScreen={sourceToScreen}
        />
      ) : null}
      {draft ? (
        <RouteDraftPreview
          draft={draft}
          equipment={equipment}
          network={network}
          sourceToScreen={sourceToScreen}
        />
      ) : null}
    </g>
  );
}

function RouteSegmentLine({
  canEdit,
  dimmed = false,
  isHighlighted,
  isInvalid,
  isSelected,
  points,
  role,
  zMarker,
  onInsert,
  onSelect,
}: {
  canEdit: boolean;
  dimmed?: boolean;
  isHighlighted: boolean;
  isInvalid: boolean;
  isSelected: boolean;
  points: Point2D[];
  role: RouteSegmentVisualRole;
  zMarker: Point2D | null;
  onInsert: (event: React.MouseEvent<SVGPathElement>) => void;
  onSelect: (event: React.PointerEvent<SVGPathElement>) => void;
}) {
  const path = svgPath(points);

  if (!path) {
    return null;
  }

  const style = routeSegmentStyle({
    dimmed,
    isHighlighted,
    isInvalid,
    isSelected,
    role,
  });

  return (
    <g>
      <path
        d={path}
        fill="none"
        pointerEvents="none"
        stroke={style.stroke}
        strokeDasharray={style.dash}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={style.opacity}
        strokeWidth={style.width}
      />
      <path
        d={path}
        fill="none"
        pointerEvents="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={style.innerOpacity}
        strokeWidth="1"
      />
      {zMarker ? <RouteZMarker point={zMarker} /> : null}
      <path
        cursor={canEdit ? "pointer" : undefined}
        d={path}
        fill="none"
        pointerEvents={canEdit ? "stroke" : "none"}
        stroke="transparent"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="18"
        onDoubleClick={onInsert}
        onPointerDown={onSelect}
      />
    </g>
  );
}

function routeSegmentStyle({
  dimmed,
  isHighlighted,
  isInvalid,
  isSelected,
  role,
}: {
  dimmed: boolean;
  isHighlighted: boolean;
  isInvalid: boolean;
  isSelected: boolean;
  role: RouteSegmentVisualRole;
}) {
  if (isInvalid) {
    return {
      dash: "7 5",
      innerOpacity: dimmed ? 0.2 : 0.45,
      opacity: dimmed ? 0.32 : 1,
      stroke: "#dc2626",
      width: isSelected ? 5.2 : 3.6,
    };
  }

  if (isSelected) {
    return {
      dash: undefined,
      innerOpacity: 0.75,
      opacity: dimmed ? 0.42 : 1,
      stroke: "#e11d48",
      width: 5.2,
    };
  }

  if (isHighlighted) {
    return {
      dash: undefined,
      innerOpacity: 0.68,
      opacity: dimmed ? 0.38 : 1,
      stroke: "#0f766e",
      width: 4.6,
    };
  }

  const base = {
    derivation: {
      dash: "4 4",
      stroke: "#0891b2",
      width: 3.4,
    },
    pass: {
      dash: undefined,
      stroke: "#a16207",
      width: 3,
    },
    terminal: {
      dash: undefined,
      stroke: "#7c3aed",
      width: 3.3,
    },
    vertical: {
      dash: "2 4",
      stroke: "#2563eb",
      width: 3.4,
    },
  }[role];

  return {
    ...base,
    innerOpacity: dimmed ? 0.22 : 0.55,
    opacity: dimmed ? 0.32 : 1,
  };
}

function RouteZMarker({ point }: { point: Point2D }) {
  return (
    <g pointerEvents="none" transform={`translate(${point.x} ${point.y})`}>
      <rect
        fill="#eff6ff"
        height="14"
        rx="2"
        stroke="#2563eb"
        strokeWidth="1.4"
        width="14"
        x="-7"
        y="-7"
      />
      <text
        dominantBaseline="central"
        fill="#1d4ed8"
        fontSize="8"
        fontWeight="700"
        textAnchor="middle"
        x="0"
        y="0"
      >
        Z
      </text>
    </g>
  );
}

function routeSegmentScreenPoints(
  segment: ResolvedRouteSegment,
  sourceToScreen: (point: Point2D) => Point2D,
) {
  return routeSegmentPlanLegs(segment).flatMap((leg, index) =>
    index === 0
      ? [sourceToScreen(leg.from), sourceToScreen(leg.to)]
      : [sourceToScreen(leg.to)],
  );
}

function routeSegmentVisualRole(
  segment: ResolvedRouteSegment,
  nodeById: Map<string, RouteNode>,
  network: ManualRouteNetwork,
): RouteSegmentVisualRole {
  const fromNode = nodeById.get(segment.fromNodeId);
  const toNode = nodeById.get(segment.toNodeId);

  if (fromNode?.kind === "appliance" || toNode?.kind === "appliance") {
    return "terminal";
  }

  if (routeSegmentHasZChange(segment)) {
    return "vertical";
  }

  if (
    getRouteNodeDegree(network, segment.fromNodeId) >= 3 ||
    getRouteNodeDegree(network, segment.toNodeId) >= 3
  ) {
    return "derivation";
  }

  return "pass";
}

function routeSegmentHasZChange(segment: ResolvedRouteSegment) {
  const path = segment.path.length >= 2
    ? segment.path
    : [segment.from, segment.to];

  return path
    .slice(0, -1)
    .some(
      (point, index) =>
        Math.abs(pointZMeters(point) - pointZMeters(path[index + 1])) > 0.001,
    );
}

function routeSegmentZMarker(
  segment: ResolvedRouteSegment,
  sourceToScreen: (point: Point2D) => Point2D,
) {
  const path = segment.path.length >= 2
    ? segment.path
    : [segment.from, segment.to];
  const legIndex = path
    .slice(0, -1)
    .findIndex(
      (point, index) =>
        Math.abs(pointZMeters(point) - pointZMeters(path[index + 1])) > 0.001,
    );

  if (legIndex < 0) {
    return null;
  }

  const from = sourceToScreen(path[legIndex]);
  const to = sourceToScreen(path[legIndex + 1]);

  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
}

function routeSelectionMatchesSegment(
  selection: PhysicalRouteEditSelection | null,
  segmentId: string,
) {
  return (
    selection?.kind === "segment" &&
    selection.segmentId === segmentId
  );
}

function routeSelectionMatchesVertex(
  selection: PhysicalRouteEditSelection | null,
  segmentId: string,
  vertexIndex: number,
) {
  return (
    selection?.kind === "vertex" &&
    selection.segmentId === segmentId &&
    selection.vertexIndex === vertexIndex
  );
}

function routeSelectionMatchesNode(
  selection: PhysicalRouteEditSelection | null,
  node: RouteNode,
) {
  if (selection?.kind === "node") {
    return selection.nodeId === node.id;
  }

  return (
    selection?.kind === "terminal" &&
    selection.nodeId === node.id &&
    selection.equipmentId === node.equipmentId
  );
}

function routeNodeSelection(node: RouteNode): PhysicalRouteEditSelection {
  return node.kind === "appliance" && node.equipmentId
    ? {
        equipmentId: node.equipmentId,
        kind: "terminal",
        nodeId: node.id,
      }
    : {
        kind: "node",
        nodeId: node.id,
      };
}

function svgEventPoint(
  event: React.MouseEvent<SVGElement> | React.PointerEvent<SVGElement>,
): Point2D {
  const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();

  if (!rect) {
    return {
      x: 0,
      y: 0,
    };
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function RouteProposalSegmentLine({ points }: { points: Point2D[] }) {
  const path = svgPath(points);

  if (!path) {
    return null;
  }

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="#2563eb"
        strokeDasharray="8 6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.4"
      />
      <path
        d={path}
        fill="none"
        stroke="#ffffff"
        strokeDasharray="8 6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.5"
        strokeWidth="1"
      />
    </>
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

function RouteIntentLayer({
  connections,
  draft,
  equipment,
  sourceToScreen,
}: {
  connections: RouteIntentConnection[];
  draft: RouteIntentDraft | null;
  equipment: WorkbenchEquipment[];
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const equipmentById = buildEquipmentIndex(equipment);

  return (
    <g data-route-intent-layer="true" pointerEvents="none">
      {connections.map((connection) => {
        const from = routeIntentEndpointPoint(connection.from, equipmentById);
        const to = routeIntentEndpointPoint(connection.to, equipmentById);

        if (!from || !to) {
          return null;
        }

        return (
          <RouteIntentLine
            from={sourceToScreen(from)}
            key={connection.id}
            to={sourceToScreen(to)}
          />
        );
      })}
      {draft ? (
        <RouteIntentDraftPreview
          draft={draft}
          equipmentById={equipmentById}
          sourceToScreen={sourceToScreen}
        />
      ) : null}
    </g>
  );
}

function RouteIntentLine({ from, to }: { from: Point2D; to: Point2D }) {
  return (
    <g opacity="0.88">
      <line
        stroke="#475569"
        strokeDasharray="5 6"
        strokeLinecap="round"
        strokeWidth="2"
        x1={from.x}
        x2={to.x}
        y1={from.y}
        y2={to.y}
      />
      <circle cx={from.x} cy={from.y} fill="#ffffff" r="3.8" stroke="#475569" strokeWidth="1.4" />
      <circle cx={to.x} cy={to.y} fill="#ffffff" r="3.8" stroke="#475569" strokeWidth="1.4" />
    </g>
  );
}

function RouteIntentDraftPreview({
  draft,
  equipmentById,
  sourceToScreen,
}: {
  draft: RouteIntentDraft;
  equipmentById: Map<string, WorkbenchEquipment>;
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const from = draft.from
    ? routeIntentEndpointPoint(draft.from, equipmentById)
    : null;
  const to = draft.to
    ? routeIntentEndpointPoint(draft.to, equipmentById)
    : draft.previewPoint;

  if (!from) {
    return null;
  }

  const fromScreen = sourceToScreen(from);
  const toScreen = to ? sourceToScreen(to) : null;

  return (
    <g data-route-intent-draft="true" pointerEvents="none">
      {toScreen ? (
        <line
          stroke={draft.error ? "#dc2626" : "#475569"}
          strokeDasharray="4 5"
          strokeLinecap="round"
          strokeWidth="2.2"
          x1={fromScreen.x}
          x2={toScreen.x}
          y1={fromScreen.y}
          y2={toScreen.y}
        />
      ) : null}
      <circle
        cx={fromScreen.x}
        cy={fromScreen.y}
        fill="#ffffff"
        r="5"
        stroke="#475569"
        strokeWidth="1.8"
      />
      {toScreen ? (
        <circle
          cx={toScreen.x}
          cy={toScreen.y}
          fill="#ffffff"
          r="5"
          stroke={draft.error ? "#dc2626" : "#475569"}
          strokeWidth="1.8"
        />
      ) : null}
    </g>
  );
}

function routeIntentEndpointPoint(
  endpoint: RouteIntentEndpoint,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  return equipmentById.get(endpoint.equipmentId)?.connectionPoint ?? null;
}

function RouteProposalPreview({
  equipment,
  isOutdated,
  proposal,
  sourceToScreen,
}: {
  equipment: WorkbenchEquipment[];
  isOutdated: boolean;
  proposal: AutomaticRouteProposal;
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const network = {
    nodes: proposal.nodes,
    segments: proposal.segments,
  };
  const equipmentById = buildEquipmentIndex(equipment);
  const opacity = isOutdated ? 0.48 : 1;
  const unreached = new Set(proposal.unreachedEquipmentIds);

  return (
    <g data-route-proposal="true" opacity={opacity} pointerEvents="none">
      {resolveRouteSegments(network, equipment).map((segment) => (
        <g key={segment.id}>
          <RouteProposalSegmentLine
            points={routeSegmentPlanLegs(segment).flatMap((leg, index) =>
              index === 0
                ? [sourceToScreen(leg.from), sourceToScreen(leg.to)]
                : [sourceToScreen(leg.to)],
            )}
          />
        </g>
      ))}
      {proposal.nodes.map((node) => {
        const position = resolveRouteNodePosition(node, equipmentById);

        return position ? (
          <RouteProposalNodeMarker
            degree={getRouteNodeDegree(network, node.id)}
            key={node.id}
            node={node}
            point={sourceToScreen(position)}
          />
        ) : null;
      })}
      {equipment
        .filter((item) => unreached.has(item.id))
        .map((item) => {
          const point = sourceToScreen(item.connectionPoint);

          return (
            <circle
              cx={point.x}
              cy={point.y}
              fill="none"
              key={`unreached:${item.id}`}
              r="11"
              stroke="#dc2626"
              strokeDasharray="4 4"
              strokeWidth="2.2"
            />
          );
        })}
    </g>
  );
}

function RouteProposalNodeMarker({
  degree,
  node,
  point,
}: {
  degree: number;
  node: RouteNode;
  point: Point2D;
}) {
  const isDerivation = degree >= 3;

  return (
    <g transform={`translate(${point.x} ${point.y})`}>
      {isDerivation ? (
        <rect
          fill="#dbeafe"
          height="14"
          rx="2"
          stroke="#1d4ed8"
          strokeWidth="2"
          transform="rotate(45)"
          width="14"
          x="-7"
          y="-7"
        />
      ) : (
        <circle
          fill={node.kind === "appliance" ? "#93c5fd" : "#eff6ff"}
          r={node.kind === "route" ? 4.8 : 5.8}
          stroke="#1d4ed8"
          strokeWidth="1.7"
        />
      )}
    </g>
  );
}

function RouteVertexHandle({
  canEdit,
  dimmed = false,
  point,
  selected,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  canEdit: boolean;
  dimmed?: boolean;
  point: Point2D;
  selected: boolean;
  onPointerCancel: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGGElement>) => void;
}) {
  return (
    <g
      cursor={canEdit ? "move" : undefined}
      opacity={dimmed ? 0.35 : 1}
      pointerEvents={canEdit ? "all" : "none"}
      transform={`translate(${point.x} ${point.y})`}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <rect
        fill={selected ? "#e11d48" : "#ffffff"}
        height="10"
        rx="1.5"
        stroke={selected ? "#ffffff" : "#a16207"}
        strokeWidth="1.8"
        transform="rotate(45)"
        width="10"
        x="-5"
        y="-5"
      />
      <circle
        fill={selected ? "#ffffff" : "#a16207"}
        pointerEvents="none"
        r="1.7"
      />
    </g>
  );
}

function RouteNodeMarker({
  canEdit,
  dimmed = false,
  degree,
  node,
  point,
  selected,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  canEdit: boolean;
  dimmed?: boolean;
  degree: number;
  node: RouteNode;
  point: Point2D;
  selected: boolean;
  onPointerCancel: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGGElement>) => void;
}) {
  const isDerivation = node.kind === "route" && degree >= 3;
  const isTerminal = node.kind === "appliance";
  const fill =
    node.kind === "supply"
      ? "#92400e"
      : isTerminal
        ? "#ffffff"
        : "#fef3c7";
  const stroke = isDerivation
    ? "#0891b2"
    : isTerminal
      ? "#7c3aed"
      : "#78350f";

  return (
    <g
      cursor={canEdit ? (node.kind === "route" ? "move" : "pointer") : undefined}
      opacity={dimmed ? 0.35 : 1}
      pointerEvents={canEdit ? "all" : "none"}
      transform={`translate(${point.x} ${point.y})`}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {selected ? (
        <circle
          fill="none"
          pointerEvents="none"
          r={isTerminal ? 11.5 : 10.5}
          stroke="#e11d48"
          strokeWidth="2"
        />
      ) : null}
      {isDerivation ? (
        <rect
          fill="#ecfeff"
          height="13"
          rx="2"
          stroke={stroke}
          strokeWidth="2"
          transform="rotate(45)"
          width="13"
          x="-6.5"
          y="-6.5"
        />
      ) : (
        <>
          {node.kind === "supply" ? (
            <rect
              fill={fill}
              height="11"
              rx="1.5"
              stroke="#ffffff"
              strokeWidth="1.5"
              width="11"
              x="-5.5"
              y="-5.5"
            />
          ) : (
            <circle
              fill={fill}
              r={node.kind === "route" ? 4.8 : 6.2}
              stroke={stroke}
              strokeWidth="1.8"
            />
          )}
          {isTerminal ? (
            <circle
              fill="none"
              pointerEvents="none"
              r="8.2"
              stroke="#7c3aed"
              strokeWidth="1.4"
            />
          ) : null}
        </>
      )}
    </g>
  );
}

function RouteDraftPreview({
  draft,
  equipment,
  network,
  sourceToScreen,
}: {
  draft: RouteDraft;
  equipment: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const points: Point2D[] = [];

  if (draft.originPoint) {
    points.push(draft.originPoint);
  }

  points.push(...draft.routePoints);

  const target =
    draft.step === "review" && draft.targetEquipmentId
      ? routeDraftTargetPoint(draft.targetEquipmentId, equipment, network)
      : null;

  if (target) {
    points.push(target);
  } else if (draft.previewPoint && draft.step === "drawing") {
    points.push(draft.previewPoint);
  }

  if (points.length === 0) {
    return null;
  }

  const screenPoints = points.map(sourceToScreen);
  const isInvalid = Boolean(draft.error);

  return (
    <g data-route-draft="true" pointerEvents="none">
      {screenPoints.slice(0, -1).map((point, index) => {
        const next = screenPoints[index + 1];
        const isPreview = index === screenPoints.length - 2 && draft.step === "drawing";

        return (
          <line
            key={`${point.x}:${point.y}:${index}`}
            stroke={isInvalid && isPreview ? "#dc2626" : "#ca8a04"}
            strokeDasharray={isPreview || isInvalid ? "6 5" : undefined}
            strokeLinecap="round"
            strokeWidth={isPreview ? 2.6 : 3.2}
            x1={point.x}
            x2={next.x}
            y1={point.y}
            y2={next.y}
          />
        );
      })}
      {screenPoints.map((point, index) => (
        <circle
          cx={point.x}
          cy={point.y}
          fill="#ffffff"
          key={`${point.x}:${point.y}:node:${index}`}
          r={index === 0 ? 5.5 : 4.5}
          stroke={index === 0 ? "#92400e" : "#ca8a04"}
          strokeWidth="1.8"
        />
      ))}
    </g>
  );
}

function routeDraftTargetPoint(
  equipmentId: string,
  equipment: WorkbenchEquipment[],
  network: ManualRouteNetwork,
) {
  const target = equipment.find((item) => item.id === equipmentId) ?? null;
  const terminalStartNode = findTerminalStartNodeByEquipment(network, equipmentId);
  const terminalStartPoint = terminalStartNode
    ? resolveRouteNodePosition(terminalStartNode, buildEquipmentIndex(equipment))
    : null;

  return terminalStartPoint ?? target?.connectionPoint ?? null;
}
