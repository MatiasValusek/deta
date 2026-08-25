import type { Point2D } from "@/lib/geometry/types";
import type {
  ConstraintDraft,
  ManualConstraint,
} from "@/lib/constraints/types";

type ConstraintsOverlayProps = {
  constraints: ManualConstraint[];
  draft: ConstraintDraft | null;
  selectedConstraintId: string | null;
  showConstraints: boolean;
  sourceToScreen: (point: Point2D) => Point2D;
};

export function ConstraintsOverlay({
  constraints,
  draft,
  selectedConstraintId,
  showConstraints,
  sourceToScreen,
}: ConstraintsOverlayProps) {
  if (!showConstraints) {
    return null;
  }

  return (
    <g pointerEvents="none">
      {constraints.map((constraint) => (
        <ConstraintPolygon
          constraint={constraint}
          isSelected={constraint.id === selectedConstraintId}
          key={constraint.id}
          sourceToScreen={sourceToScreen}
        />
      ))}
      {draft ? (
        <DraftPolygon draft={draft} sourceToScreen={sourceToScreen} />
      ) : null}
    </g>
  );
}

function ConstraintPolygon({
  constraint,
  isSelected,
  sourceToScreen,
}: {
  constraint: ManualConstraint;
  isSelected: boolean;
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const points = constraint.polygon.map(sourceToScreen);
  const style = styleForConstraint(constraint);

  return (
    <g data-constraint-id={constraint.id}>
      <polygon
        fill={style.fill}
        opacity={constraint.active ? 1 : 0.35}
        points={formatPoints(points)}
        stroke={isSelected ? "#e11d48" : style.stroke}
        strokeDasharray={constraint.active ? style.dash : "5 5"}
        strokeLinejoin="round"
        strokeWidth={isSelected ? 2.5 : 1.7}
      />
      {isSelected
        ? points.map((point, index) => (
            <circle
              cx={formatCoordinate(point.x)}
              cy={formatCoordinate(point.y)}
              data-constraint-vertex={`${constraint.id}:${index}`}
              fill="#ffffff"
              key={`${constraint.id}-${index}`}
              r="5"
              stroke="#e11d48"
              strokeWidth="2"
            />
          ))
        : null}
    </g>
  );
}

function DraftPolygon({
  draft,
  sourceToScreen,
}: {
  draft: ConstraintDraft;
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const points =
    draft.previewPoint && draft.shape === "polygon"
      ? [...draft.points, draft.previewPoint]
      : draft.points;

  if (points.length < 2) {
    return (
      <g>
        {points.map((point, index) => {
          const screenPoint = sourceToScreen(point);
          return (
            <circle
              cx={formatCoordinate(screenPoint.x)}
              cy={formatCoordinate(screenPoint.y)}
              fill="#ffffff"
              key={`${draft.source}-${index}`}
              r="4"
              stroke="#111827"
              strokeWidth="2"
            />
          );
        })}
      </g>
    );
  }

  const screenPoints = points.map(sourceToScreen);
  const style = styleForConstraintType(draft.type);
  const commonShapeProps = {
    fill: points.length >= 3 ? style.fill : "none",
    points: formatPoints(screenPoints),
    stroke: style.stroke,
    strokeDasharray: "6 4",
    strokeLinejoin: "round" as const,
    strokeWidth: "1.8",
  };

  return (
    <g>
      {points.length >= 3 ? (
        <polygon {...commonShapeProps} />
      ) : (
        <polyline {...commonShapeProps} />
      )}
      {screenPoints.map((point, index) => (
        <circle
          cx={formatCoordinate(point.x)}
          cy={formatCoordinate(point.y)}
          fill="#ffffff"
          key={`${draft.source}-${index}`}
          r="4"
          stroke={style.stroke}
          strokeWidth="2"
        />
      ))}
    </g>
  );
}

function styleForConstraint(constraint: ManualConstraint) {
  return styleForConstraintType(constraint.type);
}

function styleForConstraintType(type: ManualConstraint["type"]) {
  if (type === "hard_obstacle") {
    return {
      fill: "rgba(17, 24, 39, 0.13)",
      stroke: "#111827",
      dash: undefined,
    };
  }

  return {
    fill: "rgba(220, 38, 38, 0.12)",
    stroke: "#dc2626",
    dash: "8 4",
  };
}

function formatPoints(points: Point2D[]) {
  return points
    .map((point) => `${formatCoordinate(point.x)},${formatCoordinate(point.y)}`)
    .join(" ");
}

function formatCoordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "0";
}
