export type MainWorkflowStageId =
  | "plan"
  | "equipment"
  | "route"
  | "calculate"
  | "deliver";

export type MainWorkflowPanelSectionId =
  | "geometry"
  | "equipment"
  | "route"
  | "calculation"
  | "obstacles"
  | "scale";

const PANEL_SECTIONS: Record<
  MainWorkflowStageId,
  MainWorkflowPanelSectionId[]
> = {
  calculate: ["calculation"],
  deliver: ["calculation"],
  equipment: ["equipment"],
  plan: ["scale"],
  route: ["route"],
};

const DEFAULT_PANEL: Record<
  MainWorkflowStageId,
  MainWorkflowPanelSectionId
> = {
  calculate: "calculation",
  deliver: "calculation",
  equipment: "equipment",
  plan: "geometry",
  route: "route",
};

export function mainWorkflowPanelSections(
  stage: MainWorkflowStageId,
  options?: { routeAccessoryReviewAvailable?: boolean },
) {
  if (stage === "route" && options?.routeAccessoryReviewAvailable) {
    return ["route", "calculation"] satisfies MainWorkflowPanelSectionId[];
  }

  return PANEL_SECTIONS[stage];
}

export function mainWorkflowDefaultPanel(stage: MainWorkflowStageId) {
  return DEFAULT_PANEL[stage];
}
