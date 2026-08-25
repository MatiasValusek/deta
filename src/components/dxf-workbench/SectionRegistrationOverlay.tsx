import { useState } from "react";
import type { Point2D } from "@/lib/geometry/types";
import type {
  SectionRegistration,
  SectionRegistrationSide,
} from "@/lib/sections/registration";

export type SectionRegistrationToolMode =
  | "inactive"
  | "start"
  | "end"
  | "side"
  | "elevation";

export type SectionRegistrationDraftOverlay = {
  positiveZSide: SectionRegistrationSide | null;
  previewPoint: Point2D | null;
  referenceElevationMeters: number;
  sectionEnd: Point2D | null;
  sectionStart: Point2D | null;
};

export type SectionRegistrationSavedOverlay = {
  isHighlighted: boolean;
  linkId: string;
  registration: SectionRegistration;
};

type SectionRegistrationOverlayProps = {
  draft: SectionRegistrationDraftOverlay | null;
  saved: SectionRegistrationSavedOverlay | null;
  sourceToScreen: (point: Point2D) => Point2D;
  onChooseDraftSide: (side: SectionRegistrationSide) => void;
};

const MIN_SCREEN_ARROW_LENGTH = 22;
const ARROW_HITBOX_SIZE = 44;

export function SectionRegistrationOverlay({
  draft,
  saved,
  sourceToScreen,
  onChooseDraftSide,
}: SectionRegistrationOverlayProps) {
  const visibleDraftEnd = draft?.sectionEnd ?? draft?.previewPoint ?? null;

  return (
    <g className="section-registration-overlay">
      {saved ? (
        <SavedRegistrationMark
          saved={saved}
          sourceToScreen={sourceToScreen}
        />
      ) : null}
      {draft?.sectionStart ? (
        <DraftRegistrationMark
          draft={draft}
          visibleEnd={visibleDraftEnd}
          sourceToScreen={sourceToScreen}
          onChooseDraftSide={onChooseDraftSide}
        />
      ) : null}
    </g>
  );
}

function SavedRegistrationMark({
  saved,
  sourceToScreen,
}: {
  saved: SectionRegistrationSavedOverlay;
  sourceToScreen: (point: Point2D) => Point2D;
}) {
  const geometry = createRegistrationGeometry(
    saved.registration.sectionStart,
    saved.registration.sectionEnd,
    saved.registration.positiveZSide,
    sourceToScreen,
  );
  const tone = saved.isHighlighted ? "selected" : "solid";

  return (
    <g
      data-positive-z-side={saved.registration.positiveZSide}
      data-section-end={`${saved.registration.sectionEnd.x},${saved.registration.sectionEnd.y}`}
      data-section-registration-link-id={saved.linkId}
      data-section-start={`${saved.registration.sectionStart.x},${saved.registration.sectionStart.y}`}
      opacity={saved.isHighlighted ? 1 : 0.86}
    >
      <AxisLine geometry={geometry} tone={tone} />
      <EndpointBadge label="A" point={geometry.start} />
      <EndpointBadge label="B" point={geometry.end} />
      <ArrowLine geometry={geometry} label="+Z" tone={tone} />
      <LevelLabel
        geometry={geometry}
        value={saved.registration.referenceElevationMeters}
      />
    </g>
  );
}

function DraftRegistrationMark({
  draft,
  visibleEnd,
  sourceToScreen,
  onChooseDraftSide,
}: {
  draft: SectionRegistrationDraftOverlay;
  visibleEnd: Point2D | null;
  sourceToScreen: (point: Point2D) => Point2D;
  onChooseDraftSide: (side: SectionRegistrationSide) => void;
}) {
  const start = sourceToScreen(draft.sectionStart as Point2D);

  if (!visibleEnd) {
    return <EndpointBadge label="A" point={start} tone="draft" />;
  }

  const axisGeometry = createRegistrationGeometry(
    draft.sectionStart as Point2D,
    visibleEnd,
    draft.positiveZSide ?? "left",
    sourceToScreen,
  );
  const leftGeometry = createRegistrationGeometry(
    draft.sectionStart as Point2D,
    visibleEnd,
    "left",
    sourceToScreen,
  );
  const rightGeometry = createRegistrationGeometry(
    draft.sectionStart as Point2D,
    visibleEnd,
    "right",
    sourceToScreen,
  );

  return (
    <g>
      <AxisLine
        geometry={axisGeometry}
        tone={draft.sectionEnd ? "selected" : "draft"}
      />
      <EndpointBadge label="A" point={axisGeometry.start} tone="draft" />
      <EndpointBadge label="B" point={axisGeometry.end} tone="draft" />
      {draft.sectionEnd ? (
        <>
          <ChoiceArrow
            geometry={leftGeometry}
            isSelected={draft.positiveZSide === "left"}
            side="left"
            onChooseDraftSide={onChooseDraftSide}
          />
          <ChoiceArrow
            geometry={rightGeometry}
            isSelected={draft.positiveZSide === "right"}
            side="right"
            onChooseDraftSide={onChooseDraftSide}
          />
        </>
      ) : null}
      {draft.positiveZSide ? (
        <LevelLabel
          geometry={axisGeometry}
          value={draft.referenceElevationMeters}
        />
      ) : null}
    </g>
  );
}

function ChoiceArrow({
  geometry,
  isSelected,
  side,
  onChooseDraftSide,
}: {
  geometry: RegistrationGeometry;
  isSelected: boolean;
  side: SectionRegistrationSide;
  onChooseDraftSide: (side: SectionRegistrationSide) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const tone = isSelected || isHovered ? "selected" : "choice";

  return (
    <g
      className="cursor-pointer"
      cursor="pointer"
      data-registration-z-side={side}
      opacity={isSelected || isHovered ? 1 : 0.78}
      pointerEvents="all"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onChooseDraftSide(side);
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      <title>{isSelected ? "Flecha +Z seleccionada" : "Elegir esta flecha +Z"}</title>
      <ArrowHitTarget geometry={geometry} />
      <ArrowLine geometry={geometry} label="+Z" tone={tone} />
    </g>
  );
}

function ArrowHitTarget({ geometry }: { geometry: RegistrationGeometry }) {
  return (
    <line
      data-arrow-hitbox={ARROW_HITBOX_SIZE}
      pointerEvents="stroke"
      stroke="#000000"
      strokeLinecap="round"
      strokeOpacity="0"
      strokeWidth={ARROW_HITBOX_SIZE}
      x1={geometry.arrowStart.x}
      x2={geometry.arrowEnd.x}
      y1={geometry.arrowStart.y}
      y2={geometry.arrowEnd.y}
    />
  );
}

function AxisLine({
  geometry,
  tone,
}: {
  geometry: RegistrationGeometry;
  tone: "choice" | "draft" | "selected" | "solid";
}) {
  const color =
    tone === "choice" ? "#9ca3af" : tone === "draft" ? "#2563eb" : "#1d4ed8";

  return (
    <line
      pointerEvents="none"
      stroke={color}
      strokeDasharray={tone === "draft" ? "6 5" : undefined}
      strokeLinecap="round"
      strokeWidth={tone === "solid" ? 2.4 : 2.8}
      x1={geometry.start.x}
      x2={geometry.end.x}
      y1={geometry.start.y}
      y2={geometry.end.y}
    />
  );
}

function ArrowLine({
  geometry,
  label,
  tone,
}: {
  geometry: RegistrationGeometry;
  label: string;
  tone: "choice" | "selected" | "solid";
}) {
  const color =
    tone === "selected" ? "#1d4ed8" : tone === "choice" ? "#9ca3af" : "#1d4ed8";

  return (
    <g pointerEvents="none">
      <line
        stroke={color}
        strokeLinecap="round"
        strokeWidth={tone === "choice" ? 1.8 : 2.4}
        x1={geometry.arrowStart.x}
        x2={geometry.arrowEnd.x}
        y1={geometry.arrowStart.y}
        y2={geometry.arrowEnd.y}
      />
      <polygon
        fill={color}
        points={arrowHeadPoints(geometry.arrowEnd, geometry.arrowUnit)}
      />
      <text
        fill={color}
        fontSize="11"
        fontWeight="700"
        pointerEvents="none"
        textAnchor="middle"
        x={geometry.arrowEnd.x + geometry.arrowUnit.x * 12}
        y={geometry.arrowEnd.y + geometry.arrowUnit.y * 12 + 4}
      >
        {label}
      </text>
    </g>
  );
}

function EndpointBadge({
  label,
  point,
  tone = "solid",
}: {
  label: "A" | "B";
  point: Point2D;
  tone?: "draft" | "solid";
}) {
  const stroke = tone === "draft" ? "#2563eb" : "#1d4ed8";

  return (
    <g pointerEvents="none" transform={`translate(${point.x} ${point.y})`}>
      <circle fill="#ffffff" r="8" stroke={stroke} strokeWidth="1.8" />
      <text
        fill={stroke}
        fontSize="10"
        fontWeight="700"
        textAnchor="middle"
        y="3.5"
      >
        {label}
      </text>
    </g>
  );
}

function LevelLabel({
  geometry,
  value,
}: {
  geometry: RegistrationGeometry;
  value: number;
}) {
  return (
    <g
      pointerEvents="none"
      transform={`translate(${geometry.label.x} ${geometry.label.y})`}
    >
      <rect
        fill="#ffffff"
        height="22"
        rx="4"
        stroke="#bfdbfe"
        width="96"
        x="-48"
        y="-16"
      />
      <text
        fill="#1d4ed8"
        fontSize="11"
        fontWeight="650"
        textAnchor="middle"
        y="-1"
      >
        Nivel {formatElevationMeters(value)}
      </text>
    </g>
  );
}

type RegistrationGeometry = {
  arrowEnd: Point2D;
  arrowStart: Point2D;
  arrowUnit: Point2D;
  end: Point2D;
  label: Point2D;
  start: Point2D;
};

function createRegistrationGeometry(
  sourceStart: Point2D,
  sourceEnd: Point2D,
  side: SectionRegistrationSide,
  sourceToScreen: (point: Point2D) => Point2D,
): RegistrationGeometry {
  const sourceVector = {
    x: sourceEnd.x - sourceStart.x,
    y: sourceEnd.y - sourceStart.y,
  };
  const sourceLength = Math.hypot(sourceVector.x, sourceVector.y) || 1;
  const unit = {
    x: sourceVector.x / sourceLength,
    y: sourceVector.y / sourceLength,
  };
  const sideSign = side === "left" ? 1 : -1;
  const normal = {
    x: -unit.y * sideSign,
    y: unit.x * sideSign,
  };
  const midSource = {
    x: (sourceStart.x + sourceEnd.x) / 2,
    y: (sourceStart.y + sourceEnd.y) / 2,
  };
  const arrowStart = sourceToScreen(midSource);
  const rawArrowEnd = sourceToScreen({
    x: midSource.x + normal.x * Math.max(sourceLength * 0.28, 1),
    y: midSource.y + normal.y * Math.max(sourceLength * 0.28, 1),
  });
  const rawArrow = {
    x: rawArrowEnd.x - arrowStart.x,
    y: rawArrowEnd.y - arrowStart.y,
  };
  const rawArrowLength = Math.hypot(rawArrow.x, rawArrow.y) || 1;
  const arrowUnit = {
    x: rawArrow.x / rawArrowLength,
    y: rawArrow.y / rawArrowLength,
  };
  const screenStart = sourceToScreen(sourceStart);
  const screenEnd = sourceToScreen(sourceEnd);
  const screenLength = Math.hypot(
    screenEnd.x - screenStart.x,
    screenEnd.y - screenStart.y,
  );
  const arrowLength = Math.max(
    Math.min(screenLength * 0.32, 56),
    MIN_SCREEN_ARROW_LENGTH,
  );
  const arrowEnd = {
    x: arrowStart.x + arrowUnit.x * arrowLength,
    y: arrowStart.y + arrowUnit.y * arrowLength,
  };

  return {
    arrowEnd,
    arrowStart,
    arrowUnit,
    end: screenEnd,
    label: {
      x: arrowEnd.x + arrowUnit.x * 12,
      y: arrowEnd.y + arrowUnit.y * 12,
    },
    start: screenStart,
  };
}

function arrowHeadPoints(point: Point2D, unit: Point2D) {
  const tangent = {
    x: -unit.y,
    y: unit.x,
  };
  const back = {
    x: point.x - unit.x * 9,
    y: point.y - unit.y * 9,
  };
  const left = {
    x: back.x + tangent.x * 5,
    y: back.y + tangent.y * 5,
  };
  const right = {
    x: back.x - tangent.x * 5,
    y: back.y - tangent.y * 5,
  };

  return `${point.x},${point.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

function formatElevationMeters(value: number) {
  return `${value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} m`;
}
