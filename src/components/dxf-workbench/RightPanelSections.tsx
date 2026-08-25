import type { ReactNode } from "react";

export type RightPanelSectionId =
  | "geometry"
  | "equipment"
  | "route"
  | "calculation"
  | "obstacles"
  | "scale";

export type RightPanelSection = {
  id: RightPanelSectionId;
  title: string;
  summary: string;
  content: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  hasActiveTool?: boolean;
};

type RightPanelSectionsProps = {
  activeSectionId: RightPanelSectionId;
  sections: RightPanelSection[];
  onActiveSectionChange: (sectionId: RightPanelSectionId) => void;
};

export function RightPanelSections({
  activeSectionId,
  sections,
  onActiveSectionChange,
}: RightPanelSectionsProps) {
  const visibleActiveSection =
    sections.find(
      (section) => section.id === activeSectionId && !section.disabled,
    ) ??
    sections.find((section) => !section.disabled) ??
    sections[0];
  const visibleActiveSectionId = visibleActiveSection?.id ?? activeSectionId;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-white"
      data-right-panel-sections="true"
    >
      <div className="shrink-0 space-y-1 border-b border-[var(--line)] p-2">
        {sections.map((section) => {
          const isActive = section.id === visibleActiveSectionId;
          const buttonId = `right-panel-tab-${section.id}`;
          const panelId = `right-panel-content-${section.id}`;

          return (
            <button
              aria-controls={panelId}
              aria-expanded={isActive}
              className={`w-full rounded border px-3 py-2 text-left text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                isActive
                  ? "border-[var(--accent)] bg-[#f0f7ff]"
                  : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
              } disabled:cursor-not-allowed disabled:bg-[#f5f6f7] disabled:text-[var(--muted)]`}
              disabled={section.disabled}
              data-right-panel-section-id={section.id}
              data-right-panel-section-title={section.title}
              id={buttonId}
              key={section.id}
              type="button"
              onClick={() => onActiveSectionChange(section.id)}
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {section.title}
                </span>
                {section.hasActiveTool ? (
                  <span className="shrink-0 rounded border border-[#f1d28a] bg-[#fffaf0] px-1.5 py-0.5 text-[10px] font-medium text-[var(--warning)]">
                    Activo
                  </span>
                ) : null}
                <span className="shrink-0 font-mono" aria-hidden="true">
                  {isActive ? "-" : "+"}
                </span>
              </span>
              <span className="mt-1 block truncate text-[11px] text-[var(--muted)]">
                {section.disabled ? section.disabledReason ?? section.summary : section.summary}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto"
        data-right-panel-active-content="true"
      >
        {sections.map((section) => (
          <div
            aria-labelledby={`right-panel-tab-${section.id}`}
            hidden={section.id !== visibleActiveSectionId}
            id={`right-panel-content-${section.id}`}
            key={section.id}
            role="region"
          >
            {section.id === visibleActiveSectionId ? section.content : null}
          </div>
        ))}
      </div>
    </div>
  );
}
