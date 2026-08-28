import type {
  PipeDiameterReference,
  PipeSystem,
  PipeSystemResolutionStatus,
} from "@/lib/calculation/pipeSystem";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { AdoptedDiameterDecision } from "./professionalDiameterAdoption";
import type {
  TechnicalEquivalentAccessorySegmentVerification,
} from "./technicalEquivalentAccessoryVerification";

export type TechnicalAdoptedDiameterSource =
  | "required_default"
  | "user_adopted";

export type TechnicalAdoptedDiameterSegmentStatus =
  | "invalid"
  | "unresolved"
  | "unsupported"
  | "valid";

export type TechnicalAdoptedDiameterSegmentValidation = {
  adoptedDiameter: PipeDiameterReference | null;
  availableDiameters: PipeDiameterReference[];
  decision: AdoptedDiameterDecision | null;
  explanation: string | null;
  provisionalDiameter: PipeDiameterReference | null;
  reason: string | null;
  requiredDiameter: PipeDiameterReference | null;
  selectableDiameters: PipeDiameterReference[];
  segmentId: string;
  source: TechnicalAdoptedDiameterSource;
  status: TechnicalAdoptedDiameterSegmentStatus;
};

export type TechnicalAdoptedDiameterValidation = {
  invalidSegmentCount: number;
  segments: TechnicalAdoptedDiameterSegmentValidation[];
  status: TechnicalAdoptedDiameterSegmentStatus;
  unresolvedSegmentCount: number;
};

type DiameterCatalog = {
  byId: Map<string, { diameter: PipeDiameterReference; index: number }>;
  diameters: PipeDiameterReference[];
};

export function createTechnicalAdoptedDiameterValidation(params: {
  decisions?: AdoptedDiameterDecision[];
  equivalentVerificationBySegmentId: Record<
    string,
    TechnicalEquivalentAccessorySegmentVerification
  >;
  pipeSystem: PipeSystem;
  result: TechnicalCalculationResult | null;
}): TechnicalAdoptedDiameterValidation {
  if (!params.result) {
    return {
      invalidSegmentCount: 0,
      segments: [],
      status: "unresolved",
      unresolvedSegmentCount: 0,
    };
  }

  const availableDiametersResolution = params.pipeSystem.getAvailableDiameters();
  const catalog =
    availableDiametersResolution.status === "resolved"
      ? createDiameterCatalog(availableDiametersResolution.value)
      : null;
  const decisionBySegmentId = new Map(
    (params.decisions ?? []).map((decision) => [
      decision.segmentId,
      decision,
    ]),
  );
  const segments = params.result.segments.map((segment) =>
    validateSegmentAdoptedDiameter({
      availableFailure:
        availableDiametersResolution.status === "resolved"
          ? null
          : availableDiametersResolution,
      catalog,
      decision: decisionBySegmentId.get(segment.segmentId) ?? null,
      equivalentVerification:
        params.equivalentVerificationBySegmentId[segment.segmentId] ?? null,
      provisionalDiameter: segment.provisionalDiameter ?? null,
      segmentId: segment.segmentId,
    }),
  );
  const invalidSegmentCount = segments.filter(
    (segment) => segment.status === "invalid" || segment.status === "unsupported",
  ).length;
  const unresolvedSegmentCount = segments.filter(
    (segment) => segment.status === "unresolved",
  ).length;

  return {
    invalidSegmentCount,
    segments,
    status:
      invalidSegmentCount > 0
        ? "invalid"
        : unresolvedSegmentCount > 0
          ? "unresolved"
          : "valid",
    unresolvedSegmentCount,
  };
}

function validateSegmentAdoptedDiameter(params: {
  availableFailure: {
    reason: string;
    status: Exclude<PipeSystemResolutionStatus, "resolved">;
  } | null;
  catalog: DiameterCatalog | null;
  decision: AdoptedDiameterDecision | null;
  equivalentVerification: TechnicalEquivalentAccessorySegmentVerification | null;
  provisionalDiameter: PipeDiameterReference | null;
  segmentId: string;
}): TechnicalAdoptedDiameterSegmentValidation {
  if (params.availableFailure || !params.catalog) {
    return createSegmentValidation({
      adoptedDiameter: null,
      availableDiameters: [],
      decision: params.decision,
      provisionalDiameter: params.provisionalDiameter,
      reason:
        params.availableFailure?.reason ??
        "No se pudo leer el catalogo de diametros.",
      requiredDiameter: null,
      segmentId: params.segmentId,
      status: params.availableFailure?.status ?? "unresolved",
    });
  }

  const requiredDiameter = params.equivalentVerification?.requiredDiameter ?? null;
  const requiredIndex = requiredDiameter
    ? params.catalog.byId.get(requiredDiameter.id)?.index
    : undefined;
  const adoptedDiameter = params.decision
    ? params.catalog.byId.get(params.decision.diameterId)?.diameter ?? null
    : requiredDiameter;
  const adoptedIndex = adoptedDiameter
    ? params.catalog.byId.get(adoptedDiameter.id)?.index
    : undefined;
  const selectableDiameters = selectAdoptableDiameters({
    adoptedDiameter,
    catalog: params.catalog,
    requiredIndex,
  });

  if (!requiredDiameter || requiredIndex === undefined) {
    return createSegmentValidation({
      adoptedDiameter,
      availableDiameters: params.catalog.diameters,
      decision: params.decision,
      explanation: params.equivalentVerification?.explanation ?? null,
      provisionalDiameter: params.provisionalDiameter,
      reason:
        params.equivalentVerification?.reason ??
        "Falta diametro requerido por SIGAS para adoptar.",
      requiredDiameter,
      selectableDiameters,
      segmentId: params.segmentId,
      status:
        params.equivalentVerification?.status === "unsupported"
          ? "unsupported"
          : "unresolved",
    });
  }

  if (params.decision && !adoptedDiameter) {
    return createSegmentValidation({
      adoptedDiameter: null,
      availableDiameters: params.catalog.diameters,
      decision: params.decision,
      provisionalDiameter: params.provisionalDiameter,
      reason: "El diametro adoptado no pertenece al catalogo SIGAS.",
      requiredDiameter,
      selectableDiameters,
      segmentId: params.segmentId,
      status: "unsupported",
    });
  }

  if (adoptedIndex !== undefined && adoptedIndex < requiredIndex) {
    return createSegmentValidation({
      adoptedDiameter,
      availableDiameters: params.catalog.diameters,
      decision: params.decision,
      provisionalDiameter: params.provisionalDiameter,
      reason:
        "El diametro adoptado quedo por debajo del requerido por SIGAS.",
      requiredDiameter,
      selectableDiameters,
      segmentId: params.segmentId,
      status: "invalid",
    });
  }

  return createSegmentValidation({
    adoptedDiameter,
    availableDiameters: params.catalog.diameters,
    decision: params.decision,
    explanation:
      params.decision &&
      adoptedDiameter !== null &&
      adoptedDiameter.id !== requiredDiameter.id
        ? "Adopcion manual mayor al requerido por SIGAS."
        : "Adopta automaticamente el diametro requerido por SIGAS.",
    provisionalDiameter: params.provisionalDiameter,
    requiredDiameter,
    selectableDiameters,
    segmentId: params.segmentId,
    source: params.decision ? "user_adopted" : "required_default",
    status: "valid",
  });
}

function createSegmentValidation(params: {
  adoptedDiameter: PipeDiameterReference | null;
  availableDiameters?: PipeDiameterReference[];
  decision: AdoptedDiameterDecision | null;
  explanation?: string | null;
  provisionalDiameter: PipeDiameterReference | null;
  reason?: string | null;
  requiredDiameter: PipeDiameterReference | null;
  selectableDiameters?: PipeDiameterReference[];
  segmentId: string;
  source?: TechnicalAdoptedDiameterSource;
  status: TechnicalAdoptedDiameterSegmentStatus;
}): TechnicalAdoptedDiameterSegmentValidation {
  return {
    adoptedDiameter: params.adoptedDiameter,
    availableDiameters: params.availableDiameters ?? [],
    decision: params.decision,
    explanation: params.explanation ?? null,
    provisionalDiameter: params.provisionalDiameter,
    reason: params.reason ?? null,
    requiredDiameter: params.requiredDiameter,
    selectableDiameters: params.selectableDiameters ?? [],
    segmentId: params.segmentId,
    source: params.source ?? (params.decision ? "user_adopted" : "required_default"),
    status: params.status,
  };
}

function selectAdoptableDiameters(params: {
  adoptedDiameter: PipeDiameterReference | null;
  catalog: DiameterCatalog;
  requiredIndex: number | undefined;
}) {
  const selectable =
    params.requiredIndex === undefined
      ? [...params.catalog.diameters]
      : params.catalog.diameters.slice(params.requiredIndex);

  if (
    params.adoptedDiameter &&
    !selectable.some((diameter) => diameter.id === params.adoptedDiameter?.id)
  ) {
    selectable.push(params.adoptedDiameter);
    selectable.sort(
      (first, second) =>
        (params.catalog.byId.get(first.id)?.index ?? 0) -
        (params.catalog.byId.get(second.id)?.index ?? 0),
    );
  }

  return selectable;
}

function createDiameterCatalog(diameters: PipeDiameterReference[]): DiameterCatalog {
  const sortedDiameters = [...diameters].sort(
    (first, second) => diameterSortValue(first) - diameterSortValue(second),
  );
  const byId = new Map<string, { diameter: PipeDiameterReference; index: number }>();

  sortedDiameters.forEach((diameter, index) => {
    byId.set(diameter.id, { diameter, index });
  });

  return {
    byId,
    diameters: sortedDiameters,
  };
}

function diameterSortValue(diameter: PipeDiameterReference) {
  return (
    diameter.externalDiameterMillimeters ??
    diameter.internalDiameterMillimeters ??
    Number.MAX_SAFE_INTEGER
  );
}
