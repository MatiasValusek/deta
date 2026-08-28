import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import {
  SIGAS_PIPE_SYSTEM,
} from "@/lib/calculation/pipeSystems/sigas";
import {
  SIGAS_DIAMETERS,
} from "@/lib/calculation/pipeSystems/sigas/sigasData";
import type { TechnicalCalculationResult } from "./technicalTree";
import type { AdoptedDiameterDecision } from "./professionalDiameterAdoption";
import {
  createTechnicalAdoptedDiameterValidation,
} from "./technicalAdoptedDiameterValidation";
import type {
  TechnicalEquivalentAccessorySegmentVerification,
} from "./technicalEquivalentAccessoryVerification";

export type TechnicalAdoptedDiameterValidationVerificationResult = {
  name: string;
  status: "passed";
};

export function runTechnicalAdoptedDiameterValidationVerifications() {
  const results: TechnicalAdoptedDiameterValidationVerificationResult[] = [];

  verify(results, "requerido 20 -> adoptado 25 es valido", () => {
    const validation = validate({
      adoptedDiameter: diameter(25),
      requiredDiameter: diameter(20),
    });

    assertEqual(validation.status, "valid");
    assertEqual(segment(validation).adoptedDiameter?.id, diameter(25).id);
  });

  verify(results, "requerido 25 -> adoptado 20 es invalido", () => {
    const validation = validate({
      adoptedDiameter: diameter(20),
      requiredDiameter: diameter(25),
    });

    assertEqual(validation.status, "invalid");
    assertEqual(segment(validation).status, "invalid");
  });

  verify(
    results,
    "requerido cambia 20 -> 25 y adoptado 20 queda invalido",
    () => {
      const previous = validate({
        adoptedDiameter: diameter(20),
        requiredDiameter: diameter(20),
      });
      const next = validate({
        adoptedDiameter: diameter(20),
        requiredDiameter: diameter(25),
      });

      assertEqual(previous.status, "valid");
      assertEqual(next.status, "invalid");
      assertEqual(segment(next).reason?.includes("debajo"), true);
    },
  );

  verify(results, "sin decision adopta requerido por defecto", () => {
    const validation = validate({
      requiredDiameter: diameter(25),
    });

    assertEqual(validation.status, "valid");
    assertEqual(segment(validation).source, "required_default");
    assertEqual(segment(validation).adoptedDiameter?.id, diameter(25).id);
  });

  return results;
}

function validate(params: {
  adoptedDiameter?: PipeDiameterReference;
  requiredDiameter: PipeDiameterReference;
}) {
  const segmentId = "s1";

  return createTechnicalAdoptedDiameterValidation({
    decisions: params.adoptedDiameter
      ? [adopted(segmentId, params.adoptedDiameter.id)]
      : [],
    equivalentVerificationBySegmentId: {
      [segmentId]: equivalentVerification(segmentId, params.requiredDiameter),
    },
    pipeSystem: SIGAS_PIPE_SYSTEM,
    result: calculationResult(segmentId, diameter(20)),
  });
}

function equivalentVerification(
  segmentId: string,
  requiredDiameter: PipeDiameterReference,
): TechnicalEquivalentAccessorySegmentVerification {
  return {
    calculationLengthMeters: 10,
    equivalentAccessoryLengthMeters: 1,
    explanation: "fixture",
    governingRouteId: "route:s1",
    reason: null,
    requiredDiameter,
    segmentId,
    sizingResult: {
      explanation: "fixture",
      selectedDiameter: requiredDiameter,
    },
    status: "resolved",
    tabulatedCapacityM3h: 1,
    tabulatedLengthMeters: 12,
    totalCalculationLengthMeters: 11,
    uses: [],
  };
}

function calculationResult(
  segmentId: string,
  provisionalDiameter: PipeDiameterReference,
): TechnicalCalculationResult {
  return {
    segments: [
      {
        provisionalDiameter,
        segmentId,
      },
    ],
  } as unknown as TechnicalCalculationResult;
}

function adopted(
  segmentId: string,
  diameterId: string,
): AdoptedDiameterDecision {
  return {
    decidedAt: 1,
    diameterId,
    origin: "user_adopted",
    segmentId,
  };
}

function diameter(externalDiameterMillimeters: number): PipeDiameterReference {
  const value = SIGAS_DIAMETERS.find(
    (item) => item.externalDiameterMillimeters === externalDiameterMillimeters,
  );

  assert(value, `No existe diametro SIGAS ${externalDiameterMillimeters}.`);
  return value;
}

function segment(
  validation: ReturnType<typeof createTechnicalAdoptedDiameterValidation>,
) {
  const item = validation.segments[0] ?? null;

  assert(item, "Falta segmento de validacion.");
  return item;
}

function verify(
  results: TechnicalAdoptedDiameterValidationVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown, message?: string) {
  assert(
    actual === expected,
    message ?? `Expected ${String(expected)}, got ${String(actual)}`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  const results = runTechnicalAdoptedDiameterValidationVerifications();
  console.log(JSON.stringify(results, null, 2));
}
