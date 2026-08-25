import type { Point2D } from "@/lib/geometry/types";

export type SourceOverlayData = {
  calibrationPoints: Point2D[];
  measurementPoints: Point2D[];
};

type SourceOverlayProps = SourceOverlayData & {
  sourceToScreen: (point: Point2D) => Point2D;
};

export function SourceOverlay({
  calibrationPoints,
  measurementPoints,
  sourceToScreen,
}: SourceOverlayProps) {
  return (
    <g>
      <PointSeries
        color="#0f766e"
        points={calibrationPoints}
        sourceToScreen={sourceToScreen}
      />
      <PointSeries
        color="#b45309"
        points={measurementPoints}
        sourceToScreen={sourceToScreen}
      />
    </g>
  );
}

function PointSeries({
  color,
  points,
  sourceToScreen,
}: {
  color: string;
  points: Point2D[];
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const screenPoints = points.map(sourceToScreen);
  const [start, end] = screenPoints;

  return (
    <g>
      {start && end ? (
        <line
          stroke={color}
          strokeDasharray="6 4"
          strokeLinecap="round"
          strokeWidth="2"
          x1={start.x}
          x2={end.x}
          y1={start.y}
          y2={end.y}
        />
      ) : null}

      {screenPoints.map((point, index) => (
        <g key={`${color}-${index}`}>
          <circle
            cx={point.x}
            cy={point.y}
            fill="#ffffff"
            r="6"
            stroke={color}
            strokeWidth="2"
          />
          <circle cx={point.x} cy={point.y} fill={color} r="2" />
        </g>
      ))}
    </g>
  );
}
