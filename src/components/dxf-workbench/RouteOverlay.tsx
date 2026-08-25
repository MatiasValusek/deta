import type { Point2D } from "@/lib/geometry/types";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import {
  buildEquipmentIndex,
  getRouteNodeDegree,
  resolveRouteNodePosition,
  resolveRouteSegments,
} from "@/lib/routing/network";
import type {
  AutomaticRouteProposal,
  ManualRouteNetwork,
  RouteDraft,
  RouteIntentConnection,
  RouteIntentDraft,
  RouteIntentEndpoint,
  RouteNode,
} from "@/lib/routing/types";

type RouteOverlayProps = {
  draft: RouteDraft | null;
  equipment: WorkbenchEquipment[];
  invalidSegmentIds: Set<string>;
  intentConnections: RouteIntentConnection[];
  intentDraft: RouteIntentDraft | null;
  network: ManualRouteNetwork;
  proposal: AutomaticRouteProposal | null;
  proposalOutdated: boolean;
  showRoute: boolean;
  sourceToScreen: (point: Point2D) => Point2D;
};

export function RouteOverlay({
  draft,
  equipment,
  invalidSegmentIds,
  intentConnections,
  intentDraft,
  network,
  proposal,
  proposalOutdated,
  showRoute,
  sourceToScreen,
}: RouteOverlayProps) {
  const equipmentById = buildEquipmentIndex(equipment);
  const resolvedSegments = resolveRouteSegments(network, equipment);
  const hasProposal = Boolean(proposal);

  return (
    <g className="route-overlay" pointerEvents="none">
      {showRoute
        ? resolvedSegments.map((segment) => (
            <RouteSegmentLine
              dimmed={hasProposal}
              from={sourceToScreen(segment.from)}
              isInvalid={invalidSegmentIds.has(segment.id)}
              key={segment.id}
              to={sourceToScreen(segment.to)}
            />
          ))
        : null}
      {showRoute
        ? network.nodes.map((node) => {
            const position = resolveRouteNodePosition(node, equipmentById);

            return position ? (
              <RouteNodeMarker
                dimmed={hasProposal}
                degree={getRouteNodeDegree(network, node.id)}
                key={node.id}
                node={node}
                point={sourceToScreen(position)}
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
          sourceToScreen={sourceToScreen}
        />
      ) : null}
    </g>
  );
}

function RouteSegmentLine({
  dimmed = false,
  from,
  isInvalid,
  to,
}: {
  dimmed?: boolean;
  from: Point2D;
  isInvalid: boolean;
  to: Point2D;
}) {
  return (
    <g>
      <line
        stroke={isInvalid ? "#dc2626" : "#a16207"}
        strokeDasharray={isInvalid ? "7 5" : undefined}
        strokeLinecap="round"
        strokeOpacity={dimmed ? 0.32 : 1}
        strokeWidth={isInvalid ? 3.2 : 3}
        x1={from.x}
        x2={to.x}
        y1={from.y}
        y2={to.y}
      />
      <line
        stroke="#ffffff"
        strokeLinecap="round"
        strokeOpacity={dimmed ? 0.22 : 0.55}
        strokeWidth="1"
        x1={from.x}
        x2={to.x}
        y1={from.y}
        y2={to.y}
      />
    </g>
  );
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
    <g data-route-intent-layer="true">
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
    <g data-route-intent-draft="true">
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
    <g data-route-proposal="true" opacity={opacity}>
      {resolveRouteSegments(network, equipment).map((segment) => (
        <g key={segment.id}>
          <line
            stroke="#2563eb"
            strokeDasharray="8 6"
            strokeLinecap="round"
            strokeWidth="3.4"
            x1={sourceToScreen(segment.from).x}
            x2={sourceToScreen(segment.to).x}
            y1={sourceToScreen(segment.from).y}
            y2={sourceToScreen(segment.to).y}
          />
          <line
            stroke="#ffffff"
            strokeDasharray="8 6"
            strokeLinecap="round"
            strokeOpacity="0.5"
            strokeWidth="1"
            x1={sourceToScreen(segment.from).x}
            x2={sourceToScreen(segment.to).x}
            y1={sourceToScreen(segment.from).y}
            y2={sourceToScreen(segment.to).y}
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

function RouteNodeMarker({
  dimmed = false,
  degree,
  node,
  point,
}: {
  dimmed?: boolean;
  degree: number;
  node: RouteNode;
  point: Point2D;
}) {
  const isDerivation = degree >= 3;
  const fill =
    node.kind === "supply" ? "#92400e" : node.kind === "appliance" ? "#6d28d9" : "#fef3c7";
  const stroke = isDerivation ? "#ca8a04" : "#78350f";

  return (
    <g opacity={dimmed ? 0.35 : 1} transform={`translate(${point.x} ${point.y})`}>
      {isDerivation ? (
        <rect
          fill="#fef3c7"
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
        <circle
          fill={fill}
          r={node.kind === "route" ? 4.8 : 5.8}
          stroke="#ffffff"
          strokeWidth="1.5"
        />
      )}
    </g>
  );
}

function RouteDraftPreview({
  draft,
  equipment,
  sourceToScreen,
}: {
  draft: RouteDraft;
  equipment: WorkbenchEquipment[];
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const points: Point2D[] = [];

  if (draft.originPoint) {
    points.push(draft.originPoint);
  }

  points.push(...draft.routePoints);

  const target =
    draft.step === "review" && draft.targetEquipmentId
      ? equipment.find((item) => item.id === draft.targetEquipmentId)
          ?.connectionPoint ?? null
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
    <g data-route-draft="true">
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
