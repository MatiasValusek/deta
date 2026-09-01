import type { Point2D } from "@/lib/geometry/types";
import {
  SECTION_LENGTH_TOLERANCE_RATIO,
  lengthDifferenceRatio,
  type SectionRegistration,
} from "@/lib/sections/registration";

export type PlanStageBaseType = "plan" | "section";
export type PlanStageBaseStatus = "missing" | "pending" | "ready";

export type PlanStageBase = {
  calibration: {
    calibration: {
      millimetersPerSourceUnit: number;
    } | null;
  };
  id: string;
  name: string;
  type: PlanStageBaseType;
};

export type PlanStageSectionLink = {
  id: string;
  planBaseId: string;
  planEnd: Point2D;
  planStart: Point2D;
  registration?: SectionRegistration;
  sectionBaseId: string;
};

export type PlanStageBaseReadiness = {
  baseId: string | null;
  reason: string;
  status: PlanStageBaseStatus;
  title: string;
  type: PlanStageBaseType;
};

export type PlanStageReadiness = {
  canContinueToEquipment: boolean;
  nextAction: string;
  plan: PlanStageBaseReadiness;
  sections: PlanStageBaseReadiness[];
  sectionsStatus: PlanStageBaseStatus;
};

export function createPlanStageReadiness(params: {
  bases: PlanStageBase[];
  sectionPlanLinks: PlanStageSectionLink[];
}): PlanStageReadiness {
  const planBase = params.bases.find((base) => base.type === "plan") ?? null;
  const sectionBases = params.bases.filter((base) => base.type === "section");
  const plan = createPlanReadiness(planBase);
  const sections = sectionBases.map((section) =>
    createSectionReadiness({
      planBase,
      section,
      sectionPlanLinks: params.sectionPlanLinks,
    }),
  );
  const sectionsStatus = sectionBases.length === 0
    ? "missing"
    : sections.every((section) => section.status === "ready")
      ? "ready"
      : "pending";
  const canContinueToEquipment = plan.status === "ready";

  return {
    canContinueToEquipment,
    nextAction: createNextAction({
      canContinueToEquipment,
      plan,
      sections,
      sectionsStatus,
    }),
    plan,
    sections,
    sectionsStatus,
  };
}

function createPlanReadiness(
  planBase: PlanStageBase | null,
): PlanStageBaseReadiness {
  if (!planBase) {
    return {
      baseId: null,
      reason: "Cargar Planta",
      status: "missing",
      title: "Planta",
      type: "plan",
    };
  }

  if (!baseScaleMetersPerSourceUnit(planBase)) {
    return {
      baseId: planBase.id,
      reason: "Calibrar escala",
      status: "pending",
      title: planBase.name,
      type: "plan",
    };
  }

  return {
    baseId: planBase.id,
    reason: "Lista",
    status: "ready",
    title: planBase.name,
    type: "plan",
  };
}

function createSectionReadiness(params: {
  planBase: PlanStageBase | null;
  section: PlanStageBase;
  sectionPlanLinks: PlanStageSectionLink[];
}): PlanStageBaseReadiness {
  const sectionScale = baseScaleMetersPerSourceUnit(params.section);

  if (!sectionScale) {
    return {
      baseId: params.section.id,
      reason: "Calibrar escala",
      status: "pending",
      title: params.section.name,
      type: "section",
    };
  }

  const link =
    params.sectionPlanLinks.find(
      (item) => item.sectionBaseId === params.section.id,
    ) ?? null;

  if (!link || !params.planBase || link.planBaseId !== params.planBase.id) {
    return {
      baseId: params.section.id,
      reason: "Vincular con Planta",
      status: "pending",
      title: params.section.name,
      type: "section",
    };
  }

  if (!link.registration) {
    return {
      baseId: params.section.id,
      reason: "Alinear planta-corte",
      status: "pending",
      title: params.section.name,
      type: "section",
    };
  }

  const planScale = baseScaleMetersPerSourceUnit(params.planBase);

  if (!planScale) {
    return {
      baseId: params.section.id,
      reason: "Escala de Planta pendiente",
      status: "pending",
      title: params.section.name,
      type: "section",
    };
  }

  const registeredLink = {
    ...link,
    registration: link.registration,
  };

  return sectionRegistrationIsAligned({
    link: registeredLink,
    planScaleMetersPerSourceUnit: planScale,
    sectionScaleMetersPerSourceUnit: sectionScale,
  })
    ? {
        baseId: params.section.id,
        reason: "Lista",
        status: "ready",
        title: params.section.name,
        type: "section",
      }
    : {
        baseId: params.section.id,
        reason: "Revisar alineacion",
        status: "pending",
        title: params.section.name,
        type: "section",
      };
}

function sectionRegistrationIsAligned(params: {
  link: PlanStageSectionLink & { registration: SectionRegistration };
  planScaleMetersPerSourceUnit: number;
  sectionScaleMetersPerSourceUnit: number;
}) {
  const planLengthMeters =
    distanceBetween(params.link.planStart, params.link.planEnd) *
    params.planScaleMetersPerSourceUnit;
  const sectionLengthMeters =
    distanceBetween(
      params.link.registration.sectionStart,
      params.link.registration.sectionEnd,
    ) * params.sectionScaleMetersPerSourceUnit;

  return (
    lengthDifferenceRatio(planLengthMeters, sectionLengthMeters) <=
    SECTION_LENGTH_TOLERANCE_RATIO
  );
}

function createNextAction(params: {
  canContinueToEquipment: boolean;
  plan: PlanStageBaseReadiness;
  sections: PlanStageBaseReadiness[];
  sectionsStatus: PlanStageBaseStatus;
}) {
  if (params.canContinueToEquipment) {
    return "Continuar a Artefactos";
  }

  if (params.plan.status !== "ready") {
    return params.plan.reason;
  }

  return params.sectionsStatus === "missing"
    ? "Agregar corte real opcional"
    : "Revisar Plano";
}

function baseScaleMetersPerSourceUnit(base: PlanStageBase) {
  const millimetersPerSourceUnit =
    base.calibration.calibration?.millimetersPerSourceUnit ?? null;

  return millimetersPerSourceUnit && millimetersPerSourceUnit > 0
    ? millimetersPerSourceUnit / 1000
    : null;
}

function distanceBetween(first: Point2D, second: Point2D) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}
