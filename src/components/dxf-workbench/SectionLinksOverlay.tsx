import { useState } from "react";
import type { Point2D } from "@/lib/geometry/types";
import type { SectionRegistration } from "@/lib/sections/registration";

export type SectionViewSide = "left" | "right";
export type SectionLinkToolMode = "inactive" | "start" | "end" | "side";

export type SectionPlanLink = {
  id: string;
  planBaseId: string;
  sectionBaseId: string;
  planStart: Point2D;
  planEnd: Point2D;
  viewSide: SectionViewSide;
  pdfPageNumber?: number;
  registration?: SectionRegistration;
};

export type SectionLinkDraftOverlay = {
  planStart: Point2D | null;
  planEnd: Point2D | null;
  previewPoint: Point2D | null;
  sectionName: string;
  viewSide: SectionViewSide | null;
};

type SectionLinksOverlayProps = {
  draft: SectionLinkDraftOverlay | null;
  highlightedLinkId: string | null;
  hoveredLinkId: string | null;
  links: SectionPlanLink[];
  sectionNames: Record<string, string>;
  sourceToScreen: (point: Point2D) => Point2D;
  onChooseDraftSide: (side: SectionViewSide) => void;
  onHoverLink: (linkId: string | null) => void;
  onOpenSection: (sectionBaseId: string) => void;
};

const MIN_SCREEN_ARROW_LENGTH = 22;
const ARROW_HITBOX_SIZE = 44;

export function SectionLinksOverlay({
  draft,
  highlightedLinkId,
  hoveredLinkId,
  links,
  sectionNames,
  sourceToScreen,
  onChooseDraftSide,
  onHoverLink,
  onOpenSection,
}: SectionLinksOverlayProps) {
  const visibleDraftEnd = draft?.planEnd ?? draft?.previewPoint ?? null;
  const visibleDraftLine =
    draft?.planStart && visibleDraftEnd
      ? {
          start: draft.planStart,
          end: visibleDraftEnd,
        }
      : null;

  return (
    <g className="section-links-overlay">
      {links.map((link) => (
        <SectionLinkMark
          key={link.id}
          isHighlighted={link.id === highlightedLinkId}
          isHovered={link.id === hoveredLinkId}
          label={sectionNames[link.sectionBaseId] ?? "Corte"}
          link={link}
          sourceToScreen={sourceToScreen}
          onHoverLink={onHoverLink}
          onOpenSection={onOpenSection}
        />
      ))}

      {draft?.planStart ? (
        <DraftMark
          draft={draft}
          line={visibleDraftLine}
          sourceToScreen={sourceToScreen}
          onChooseDraftSide={onChooseDraftSide}
        />
      ) : null}
    </g>
  );
}

function SectionLinkMark({
  isHighlighted,
  isHovered,
  label,
  link,
  sourceToScreen,
  onHoverLink,
  onOpenSection,
}: {
  isHighlighted: boolean;
  isHovered: boolean;
  label: string;
  link: SectionPlanLink;
  sourceToScreen: (point: Point2D) => Point2D;
  onHoverLink: (linkId: string | null) => void;
  onOpenSection: (sectionBaseId: string) => void;
}) {
  const geometry = createScreenGeometry(
    sourceToScreen(link.planStart),
    sourceToScreen(link.planEnd),
    link.viewSide,
  );
  const emphasized = isHighlighted || isHovered;

  return (
    <g
      data-section-link-id={link.id}
      data-plan-end={`${link.planEnd.x},${link.planEnd.y}`}
      data-plan-start={`${link.planStart.x},${link.planStart.y}`}
      opacity={emphasized ? 1 : 0.86}
      onPointerEnter={() => onHoverLink(link.id)}
      onPointerLeave={() => onHoverLink(null)}
    >
      <line
        pointerEvents="none"
        stroke={emphasized ? "#0f766e" : "#17877f"}
        strokeLinecap="round"
        strokeWidth={emphasized ? 3.2 : 2.4}
        x1={geometry.start.x}
        x2={geometry.end.x}
        y1={geometry.start.y}
        y2={geometry.end.y}
      />
      <circle
        cx={geometry.start.x}
        cy={geometry.start.y}
        fill="#ffffff"
        pointerEvents="none"
        r={4.5}
        stroke="#0f766e"
        strokeWidth="2"
      />
      <PlanEndpointBadge label="A" point={geometry.start} />
      <circle
        cx={geometry.end.x}
        cy={geometry.end.y}
        fill="#ffffff"
        pointerEvents="none"
        r={4.5}
        stroke="#0f766e"
        strokeWidth="2"
      />
      <PlanEndpointBadge label="B" point={geometry.end} />
      <ArrowLine geometry={geometry} tone="solid" />
      <g
        className="cursor-pointer"
        pointerEvents="all"
        transform={`translate(${geometry.label.x} ${geometry.label.y})`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenSection(link.sectionBaseId);
        }}
      >
        <rect
          fill="#ffffff"
          height="22"
          rx="4"
          stroke={emphasized ? "#0f766e" : "#99c7c2"}
          width={Math.max(label.length * 7.2 + 18, 68)}
          x="0"
          y="-16"
        />
        <text
          fill="#0f4f4a"
          fontSize="12"
          fontWeight="600"
          pointerEvents="none"
          x="9"
          y="-1"
        >
          {label}
        </text>
      </g>
    </g>
  );
}

function DraftMark({
  draft,
  line,
  sourceToScreen,
  onChooseDraftSide,
}: {
  draft: SectionLinkDraftOverlay;
  line: { start: Point2D; end: Point2D } | null;
  sourceToScreen: (point: Point2D) => Point2D;
  onChooseDraftSide: (side: SectionViewSide) => void;
}) {
  const start = sourceToScreen(draft.planStart as Point2D);

  if (!line) {
    return (
      <circle
        cx={start.x}
        cy={start.y}
        fill="#0f766e"
        pointerEvents="none"
        r="5"
        stroke="#ffffff"
        strokeWidth="2"
      />
    );
  }

  const geometry = createScreenGeometry(
    sourceToScreen(line.start),
    sourceToScreen(line.end),
    draft.viewSide ?? "left",
  );
  const leftGeometry = createScreenGeometry(
    sourceToScreen(line.start),
    sourceToScreen(line.end),
    "left",
  );
  const rightGeometry = createScreenGeometry(
    sourceToScreen(line.start),
    sourceToScreen(line.end),
    "right",
  );

  return (
    <g>
      <line
        pointerEvents="none"
        stroke="#0f766e"
        strokeDasharray={draft.planEnd ? undefined : "6 5"}
        strokeLinecap="round"
        strokeWidth="2.6"
        x1={geometry.start.x}
        x2={geometry.end.x}
        y1={geometry.start.y}
        y2={geometry.end.y}
      />
      <circle
        cx={geometry.start.x}
        cy={geometry.start.y}
        fill="#0f766e"
        pointerEvents="none"
        r="5"
        stroke="#ffffff"
        strokeWidth="2"
      />
      <PlanEndpointBadge label="A" point={geometry.start} />
      <circle
        cx={geometry.end.x}
        cy={geometry.end.y}
        fill="#ffffff"
        pointerEvents="none"
        r="5"
        stroke="#0f766e"
        strokeWidth="2"
      />
      <PlanEndpointBadge label="B" point={geometry.end} />
      {draft.planEnd ? (
        <>
          <ChoiceArrow
            geometry={leftGeometry}
            isSelected={draft.viewSide === "left"}
            side="left"
            onChooseDraftSide={onChooseDraftSide}
          />
          <ChoiceArrow
            geometry={rightGeometry}
            isSelected={draft.viewSide === "right"}
            side="right"
            onChooseDraftSide={onChooseDraftSide}
          />
        </>
      ) : null}
      <text
        fill="#0f4f4a"
        fontSize="12"
        fontWeight="600"
        pointerEvents="none"
        textAnchor="middle"
        x={geometry.mid.x}
        y={geometry.mid.y - 10}
      >
        {draft.sectionName}
      </text>
    </g>
  );
}

function ChoiceArrow({
  geometry,
  isSelected,
  side,
  onChooseDraftSide,
}: {
  geometry: ScreenGeometry;
  isSelected: boolean;
  side: SectionViewSide;
  onChooseDraftSide: (side: SectionViewSide) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const tone = isSelected || isHovered ? "selected" : "choice";

  return (
    <g
      className="cursor-pointer"
      cursor="pointer"
      data-section-side={side}
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
      <title>{isSelected ? "Flecha seleccionada" : "Elegir esta flecha"}</title>
      <ArrowHitTarget geometry={geometry} />
      <ArrowLine geometry={geometry} tone={tone} />
    </g>
  );
}

function ArrowHitTarget({ geometry }: { geometry: ScreenGeometry }) {
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

function PlanEndpointBadge({
  label,
  point,
}: {
  label: "A" | "B";
  point: Point2D;
}) {
  return (
    <g pointerEvents="none" transform={`translate(${point.x} ${point.y})`}>
      <circle
        fill="#ffffff"
        r="7.5"
        stroke="#0f766e"
        strokeWidth="1.7"
      />
      <text
        fill="#0f4f4a"
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

function ArrowLine({
  geometry,
  tone,
}: {
  geometry: ScreenGeometry;
  tone: "choice" | "selected" | "solid";
}) {
  const color =
    tone === "selected" ? "#0f766e" : tone === "choice" ? "#9ca3af" : "#0f766e";

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
        points={arrowHeadPoints(geometry.arrowEnd, geometry.normal)}
      />
    </g>
  );
}

type ScreenGeometry = {
  arrowEnd: Point2D;
  arrowStart: Point2D;
  end: Point2D;
  label: Point2D;
  mid: Point2D;
  normal: Point2D;
  start: Point2D;
};

function createScreenGeometry(
  start: Point2D,
  end: Point2D,
  side: SectionViewSide,
): ScreenGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const unit = {
    x: dx / length,
    y: dy / length,
  };
  const sideSign = side === "left" ? 1 : -1;
  const normal = {
    x: -unit.y * sideSign,
    y: unit.x * sideSign,
  };
  const arrowLength = Math.max(Math.min(length * 0.32, 54), MIN_SCREEN_ARROW_LENGTH);
  const mid = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  const arrowStart = {
    x: mid.x,
    y: mid.y,
  };
  const arrowEnd = {
    x: mid.x + normal.x * arrowLength,
    y: mid.y + normal.y * arrowLength,
  };

  return {
    arrowEnd,
    arrowStart,
    end,
    label: {
      x: arrowEnd.x + normal.x * 8 + unit.x * 8,
      y: arrowEnd.y + normal.y * 8,
    },
    mid,
    normal,
    start,
  };
}

function arrowHeadPoints(point: Point2D, normal: Point2D) {
  const tangent = {
    x: -normal.y,
    y: normal.x,
  };
  const back = {
    x: point.x - normal.x * 9,
    y: point.y - normal.y * 9,
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
