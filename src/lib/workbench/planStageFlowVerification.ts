import {
  createPlanStageReadiness,
  type PlanStageBase,
  type PlanStageSectionLink,
} from "./planStageFlow";

export type PlanStageFlowVerificationResult = {
  name: string;
  status: "passed";
};

export function runPlanStageFlowVerifications() {
  const results: PlanStageFlowVerificationResult[] = [];

  verify(results, "10.8A flujo vacio planta corte continuar", () => {
    const empty = createPlanStageReadiness({
      bases: [],
      sectionPlanLinks: [],
    });

    assertEqual(empty.plan.status, "missing");
    assertEqual(empty.sectionsStatus, "missing");
    assertEqual(empty.canContinueToEquipment, false);

    const planReady = createPlanStageReadiness({
      bases: [planBase()],
      sectionPlanLinks: [],
    });

    assertEqual(planReady.plan.status, "ready");
    assertEqual(planReady.sectionsStatus, "missing");
    assertEqual(planReady.canContinueToEquipment, true);
    assertEqual(planReady.nextAction, "Continuar a Artefactos");

    const sectionPending = createPlanStageReadiness({
      bases: [planBase(), sectionBase()],
      sectionPlanLinks: [],
    });

    assertEqual(sectionPending.sectionsStatus, "pending");
    assertEqual(sectionPending.sections[0]?.reason, "Vincular con Planta");
    assertEqual(sectionPending.canContinueToEquipment, false);

    const sectionReady = createPlanStageReadiness({
      bases: [planBase(), sectionBase()],
      sectionPlanLinks: [alignedLink()],
    });

    assertEqual(sectionReady.plan.status, "ready");
    assertEqual(sectionReady.sectionsStatus, "ready");
    assertEqual(sectionReady.sections[0]?.status, "ready");
    assertEqual(sectionReady.canContinueToEquipment, true);
    assertEqual(sectionReady.nextAction, "Continuar a Artefactos");
  });

  return results;
}

function planBase(): PlanStageBase {
  return {
    calibration: {
      calibration: {
        millimetersPerSourceUnit: 1000,
      },
    },
    id: "plan",
    name: "Planta",
    type: "plan",
  };
}

function sectionBase(): PlanStageBase {
  return {
    calibration: {
      calibration: {
        millimetersPerSourceUnit: 1000,
      },
    },
    id: "section",
    name: "Corte 1",
    type: "section",
  };
}

function alignedLink(): PlanStageSectionLink {
  return {
    id: "link",
    planBaseId: "plan",
    planEnd: { x: 4, y: 0 },
    planStart: { x: 0, y: 0 },
    registration: {
      positiveZSide: "left",
      referenceElevationMeters: 0,
      sectionEnd: { x: 4, y: 0 },
      sectionStart: { x: 0, y: 0 },
    },
    sectionBaseId: "section",
  };
}

function verify(
  results: PlanStageFlowVerificationResult[],
  name: string,
  run: () => void,
) {
  run();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

if (require.main === module) {
  console.log(JSON.stringify(runPlanStageFlowVerifications(), null, 2));
}
