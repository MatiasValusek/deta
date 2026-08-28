import type { Point2D } from "@/lib/geometry/types";

export type SectionRegistrationSide = "left" | "right";

export type SectionRegistration = {
  sectionStart: Point2D;
  sectionEnd: Point2D;
  positiveZSide: SectionRegistrationSide;
  referenceElevationMeters: number;
  sectionPdfPageNumber?: number;
};

export type SectionPointProjection = {
  elevationMeters: number | null;
  heightInSectionUnits: number;
  planPoint: Point2D;
  t: number;
};

export type PlanPointSectionProjection = {
  heightInSectionUnits: number;
  sectionPoint: Point2D;
  t: number;
};

export const MIN_SECTION_REGISTRATION_LENGTH = 0.0001;
export const SECTION_LENGTH_TOLERANCE_RATIO = 0.02;

export function isValidSectionRegistrationSegment(
  start: Point2D,
  end: Point2D,
) {
  return distanceBetween(start, end) > MIN_SECTION_REGISTRATION_LENGTH;
}

export function projectSectionPointToPlan(params: {
  planStart: Point2D;
  planEnd: Point2D;
  registration: SectionRegistration;
  sectionPoint: Point2D;
  sectionScaleMetersPerSourceUnit: number | null;
}): SectionPointProjection {
  const basis = createSectionRegistrationBasis(params.registration);
  const relativePoint = subtractPoints(
    params.sectionPoint,
    params.registration.sectionStart,
  );
  const t = dotProduct(relativePoint, basis.unit) / basis.length;
  const planVector = subtractPoints(params.planEnd, params.planStart);
  const heightInSectionUnits = dotProduct(relativePoint, basis.positiveZNormal);

  return {
    elevationMeters:
      params.sectionScaleMetersPerSourceUnit === null
        ? null
        : params.registration.referenceElevationMeters +
          heightInSectionUnits * params.sectionScaleMetersPerSourceUnit,
    heightInSectionUnits,
    planPoint: {
      x: params.planStart.x + planVector.x * t,
      y: params.planStart.y + planVector.y * t,
    },
    t,
  };
}

export function projectPlanPointToSection(params: {
  elevationMeters: number;
  planEnd: Point2D;
  planPoint: Point2D;
  planStart: Point2D;
  registration: SectionRegistration;
  sectionScaleMetersPerSourceUnit: number;
}): PlanPointSectionProjection {
  const basis = createSectionRegistrationBasis(params.registration);
  const planVector = subtractPoints(params.planEnd, params.planStart);
  const planLength = Math.hypot(planVector.x, planVector.y);

  if (planLength <= MIN_SECTION_REGISTRATION_LENGTH) {
    throw new Error("La linea de corte en planta necesita dos puntos separados.");
  }

  const planUnit = {
    x: planVector.x / planLength,
    y: planVector.y / planLength,
  };
  const relativePlanPoint = subtractPoints(params.planPoint, params.planStart);
  const t = dotProduct(relativePlanPoint, planUnit) / planLength;
  const heightInSectionUnits =
    (params.elevationMeters - params.registration.referenceElevationMeters) /
    params.sectionScaleMetersPerSourceUnit;
  const station = {
    x: params.registration.sectionStart.x + basis.unit.x * basis.length * t,
    y: params.registration.sectionStart.y + basis.unit.y * basis.length * t,
  };

  return {
    heightInSectionUnits,
    sectionPoint: {
      x: station.x + basis.positiveZNormal.x * heightInSectionUnits,
      y: station.y + basis.positiveZNormal.y * heightInSectionUnits,
    },
    t,
  };
}

export function createSectionRegistrationBasis(
  registration: SectionRegistration,
) {
  const vector = subtractPoints(registration.sectionEnd, registration.sectionStart);
  const length = Math.hypot(vector.x, vector.y);

  if (length <= MIN_SECTION_REGISTRATION_LENGTH) {
    throw new Error("La correspondencia necesita dos puntos separados.");
  }

  const unit = {
    x: vector.x / length,
    y: vector.y / length,
  };
  const sideSign = registration.positiveZSide === "left" ? 1 : -1;

  return {
    length,
    unit,
    positiveZNormal: {
      x: -unit.y * sideSign,
      y: unit.x * sideSign,
    },
  };
}

export function lengthDifferenceRatio(first: number, second: number) {
  const denominator = Math.max(Math.abs(first), Math.abs(second), 0.000001);

  return Math.abs(first - second) / denominator;
}

function subtractPoints(first: Point2D, second: Point2D): Point2D {
  return {
    x: first.x - second.x,
    y: first.y - second.y,
  };
}

function dotProduct(first: Point2D, second: Point2D) {
  return first.x * second.x + first.y * second.y;
}

function distanceBetween(start: Point2D, end: Point2D) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}
