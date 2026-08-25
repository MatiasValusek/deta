import type { ConfirmedCalibration, PendingCalibration } from "@/lib/calibration/types";
import type { ManualConstraint } from "@/lib/constraints/types";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import type { NormalizedDrawing, Point2D } from "@/lib/geometry/types";
import type { PdfDocumentModel } from "@/lib/pdf/types";
import type {
  AutomaticRouteProposal,
  ManualRouteNetwork,
  RouteIntentConnection,
} from "@/lib/routing/types";
import type { SectionRegistration } from "@/lib/sections/registration";
import type {
  ClassificationProposal,
  ConfirmedClassification,
  SemanticInspection,
  SemanticViewMode,
} from "@/lib/semantic/types";

export const WORKBENCH_PROJECT_STORAGE_KEY = "deta.workbench.project";
export const WORKBENCH_PROJECT_VERSION = 1;

export type PersistedWorkbenchSource = "dxf" | "pdf";
export type PersistedWorkbenchBaseType = "plan" | "section";
export type PersistedRouteProposalMode = "automatic" | "intent" | null;
export type PersistedSectionViewSide = "left" | "right";

export type PersistedSourceCalibrationState = {
  calibration: ConfirmedCalibration | null;
  draft: PendingCalibration;
};

export type PersistedBaseVisualState = {
  activePdfPageNumber: number;
};

export type PersistedWorkbenchBase = {
  id: string;
  type: PersistedWorkbenchBaseType;
  name: string;
  sourceType: PersistedWorkbenchSource;
  originalFileName: string;
  createdAt: number;
  drawing: NormalizedDrawing | null;
  pdfModel: PdfDocumentModel | null;
  visibleLayers: Record<string, boolean>;
  semanticViewMode: SemanticViewMode;
  semanticInspection: SemanticInspection | null;
  proposals: ClassificationProposal[];
  semanticAssignments: ConfirmedClassification[];
  constraints: ManualConstraint[];
  showConstraints: boolean;
  equipment: WorkbenchEquipment[];
  showEquipment: boolean;
  routeIntentConnections: RouteIntentConnection[];
  routeNetwork: ManualRouteNetwork;
  showRoute: boolean;
  calibration: PersistedSourceCalibrationState;
  visual: PersistedBaseVisualState;
};

export type PersistedSectionPlanLink = {
  id: string;
  planBaseId: string;
  sectionBaseId: string;
  planStart: Point2D;
  planEnd: Point2D;
  viewSide: PersistedSectionViewSide;
  pdfPageNumber?: number;
  registration?: SectionRegistration;
};

export type PersistedWorkbenchProject = {
  version: typeof WORKBENCH_PROJECT_VERSION;
  activeBaseId: string | null;
  bases: PersistedWorkbenchBase[];
  nextSectionNumber: number;
  routeProposal: AutomaticRouteProposal | null;
  routeProposalMarginInput: string;
  routeProposalMode: PersistedRouteProposalMode;
  sectionPlanLinks: PersistedSectionPlanLink[];
};

export type PersistableWorkbenchBase = Omit<
  PersistedWorkbenchBase,
  "calibration" | "drawing" | "pdfModel" | "visual"
> & {
  calibration: {
    calibration: ConfirmedCalibration | null;
    draft: PendingCalibration;
  };
  drawing: NormalizedDrawing | null;
  pdfDocument?: { model: PdfDocumentModel } | null;
  pdfModel?: PdfDocumentModel | null;
  visual: {
    activePdfPageNumber: number;
  };
};

export type WorkbenchPersistenceLoadResult =
  | {
      status: "loaded";
      project: PersistedWorkbenchProject;
    }
  | {
      status: "invalid";
      reason: string;
    }
  | {
      status: "missing" | "unavailable";
    };

export type WorkbenchPersistenceWriteResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const EMPTY_CALIBRATION_DRAFT: PendingCalibration = {
  status: "pending",
  points: [],
  distanceOriginal: "",
  unit: "mm",
};

export function createPersistedWorkbenchProject(params: {
  activeBaseId: string | null;
  bases: PersistableWorkbenchBase[];
  nextSectionNumber: number;
  routeProposal: AutomaticRouteProposal | null;
  routeProposalMarginInput: string;
  routeProposalMode: PersistedRouteProposalMode;
  sectionPlanLinks: PersistedSectionPlanLink[];
}): PersistedWorkbenchProject {
  const baseIds = new Set(params.bases.map((base) => base.id));

  return {
    version: WORKBENCH_PROJECT_VERSION,
    activeBaseId:
      params.activeBaseId && baseIds.has(params.activeBaseId)
        ? params.activeBaseId
        : params.bases[0]?.id ?? null,
    bases: params.bases.map(createPersistedWorkbenchBase),
    nextSectionNumber: Math.max(1, Math.trunc(params.nextSectionNumber)),
    routeProposal: params.routeProposal,
    routeProposalMarginInput: params.routeProposalMarginInput,
    routeProposalMode: params.routeProposalMode,
    sectionPlanLinks: params.sectionPlanLinks,
  };
}

export function hasPersistedWorkbenchContent(project: PersistedWorkbenchProject) {
  return (
    project.bases.length > 0 ||
    project.sectionPlanLinks.length > 0 ||
    project.routeProposal !== null
  );
}

export function loadPersistedWorkbenchProject(
  storage: StorageLike | null = browserStorage(),
): WorkbenchPersistenceLoadResult {
  if (!storage) {
    return { status: "unavailable" };
  }

  try {
    const raw = storage.getItem(WORKBENCH_PROJECT_STORAGE_KEY);

    if (!raw) {
      return { status: "missing" };
    }

    return parsePersistedWorkbenchProject(raw);
  } catch (error) {
    return {
      status: "invalid",
      reason:
        error instanceof Error
          ? error.message
          : "No se pudo leer el proyecto local.",
    };
  }
}

export function savePersistedWorkbenchProject(
  project: PersistedWorkbenchProject,
  storage: StorageLike | null = browserStorage(),
): WorkbenchPersistenceWriteResult {
  if (!storage) {
    return { ok: false, error: "El almacenamiento local no esta disponible." };
  }

  try {
    if (!hasPersistedWorkbenchContent(project)) {
      storage.removeItem(WORKBENCH_PROJECT_STORAGE_KEY);
      return { ok: true };
    }

    storage.setItem(WORKBENCH_PROJECT_STORAGE_KEY, JSON.stringify(project));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar el proyecto local.",
    };
  }
}

export function clearPersistedWorkbenchProject(
  storage: StorageLike | null = browserStorage(),
): WorkbenchPersistenceWriteResult {
  if (!storage) {
    return { ok: false, error: "El almacenamiento local no esta disponible." };
  }

  try {
    storage.removeItem(WORKBENCH_PROJECT_STORAGE_KEY);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo borrar el proyecto local.",
    };
  }
}

export function parsePersistedWorkbenchProject(
  raw: string,
): WorkbenchPersistenceLoadResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid", reason: "El proyecto local no es JSON valido." };
  }

  if (!isRecord(parsed)) {
    return { status: "invalid", reason: "El proyecto local no es un objeto." };
  }

  if (parsed.version !== WORKBENCH_PROJECT_VERSION) {
    return {
      status: "invalid",
      reason: "La version del proyecto local no esta soportada.",
    };
  }

  const project = parseProjectRecord(parsed);

  if (!project) {
    return {
      status: "invalid",
      reason: "El proyecto local no coincide con el formato esperado.",
    };
  }

  return { status: "loaded", project };
}

function createPersistedWorkbenchBase(
  base: PersistableWorkbenchBase,
): PersistedWorkbenchBase {
  return {
    id: base.id,
    type: base.type,
    name: base.name,
    sourceType: base.sourceType,
    originalFileName: base.originalFileName,
    createdAt: base.createdAt,
    drawing: base.sourceType === "dxf" ? base.drawing : null,
    pdfModel:
      base.sourceType === "pdf"
        ? base.pdfModel ?? base.pdfDocument?.model ?? null
        : null,
    visibleLayers: base.visibleLayers,
    semanticViewMode: base.semanticViewMode,
    semanticInspection: base.semanticInspection,
    proposals: base.proposals,
    semanticAssignments: base.semanticAssignments,
    constraints: base.constraints,
    showConstraints: base.showConstraints,
    equipment: base.equipment,
    showEquipment: base.showEquipment,
    routeIntentConnections: base.routeIntentConnections,
    routeNetwork: base.routeNetwork,
    showRoute: base.showRoute,
    calibration: {
      calibration: base.calibration.calibration,
      draft: {
        ...base.calibration.draft,
        points: [],
      },
    },
    visual: {
      activePdfPageNumber: Math.max(
        1,
        Math.trunc(base.visual.activePdfPageNumber),
      ),
    },
  };
}

function parseProjectRecord(
  value: Record<string, unknown>,
): PersistedWorkbenchProject | null {
  if (
    !isNullableString(value.activeBaseId) ||
    !Array.isArray(value.bases) ||
    !isFiniteNumber(value.nextSectionNumber) ||
    !isString(value.routeProposalMarginInput) ||
    !isRouteProposalMode(value.routeProposalMode) ||
    !Array.isArray(value.sectionPlanLinks)
  ) {
    return null;
  }

  const bases = value.bases.map(parseWorkbenchBase);
  const sectionPlanLinks = value.sectionPlanLinks.map(parseSectionPlanLink);

  if (bases.some((base) => base === null) || sectionPlanLinks.some((link) => link === null)) {
    return null;
  }

  if (value.routeProposal !== null && !isAutomaticRouteProposal(value.routeProposal)) {
    return null;
  }

  const baseIds = new Set(
    (bases as PersistedWorkbenchBase[]).map((base) => base.id),
  );
  const activeBaseId =
    value.activeBaseId && baseIds.has(value.activeBaseId)
      ? value.activeBaseId
      : (bases as PersistedWorkbenchBase[])[0]?.id ?? null;

  return {
    version: WORKBENCH_PROJECT_VERSION,
    activeBaseId,
    bases: bases as PersistedWorkbenchBase[],
    nextSectionNumber: Math.max(1, Math.trunc(value.nextSectionNumber)),
    routeProposal: value.routeProposal as AutomaticRouteProposal | null,
    routeProposalMarginInput: value.routeProposalMarginInput,
    routeProposalMode: value.routeProposalMode,
    sectionPlanLinks: sectionPlanLinks as PersistedSectionPlanLink[],
  };
}

function parseWorkbenchBase(value: unknown): PersistedWorkbenchBase | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isString(value.id) ||
    !isWorkbenchBaseType(value.type) ||
    !isString(value.name) ||
    !isWorkbenchSource(value.sourceType) ||
    !isString(value.originalFileName) ||
    !isFiniteNumber(value.createdAt) ||
    !isLayerVisibility(value.visibleLayers) ||
    !isSemanticViewMode(value.semanticViewMode) ||
    !isNullableSemanticInspection(value.semanticInspection) ||
    !isClassificationProposalArray(value.proposals) ||
    !isConfirmedClassificationArray(value.semanticAssignments) ||
    !isManualConstraintArray(value.constraints) ||
    !isBoolean(value.showConstraints) ||
    !isEquipmentArray(value.equipment) ||
    !isBoolean(value.showEquipment) ||
    !isRouteIntentConnectionArray(value.routeIntentConnections) ||
    !isRouteNetwork(value.routeNetwork) ||
    !isBoolean(value.showRoute)
  ) {
    return null;
  }

  const drawing = value.sourceType === "dxf" ? value.drawing : null;
  const pdfModel = value.sourceType === "pdf" ? value.pdfModel : null;

  if (
    (value.sourceType === "dxf" && !isNormalizedDrawing(drawing)) ||
    (value.sourceType === "pdf" && !isNullablePdfModel(pdfModel))
  ) {
    return null;
  }

  return {
    id: value.id,
    type: value.type,
    name: value.name,
    sourceType: value.sourceType,
    originalFileName: value.originalFileName,
    createdAt: value.createdAt,
    drawing: drawing as NormalizedDrawing | null,
    pdfModel: pdfModel as PdfDocumentModel | null,
    visibleLayers: value.visibleLayers,
    semanticViewMode: value.semanticViewMode,
    semanticInspection: value.semanticInspection as SemanticInspection | null,
    proposals: value.proposals,
    semanticAssignments: value.semanticAssignments,
    constraints: value.constraints,
    showConstraints: value.showConstraints,
    equipment: value.equipment,
    showEquipment: value.showEquipment,
    routeIntentConnections: value.routeIntentConnections,
    routeNetwork: value.routeNetwork,
    showRoute: value.showRoute,
    calibration: parseCalibrationState(value.calibration),
    visual: parseBaseVisualState(value.visual),
  };
}

function parseCalibrationState(value: unknown): PersistedSourceCalibrationState {
  if (!isRecord(value)) {
    return {
      calibration: null,
      draft: EMPTY_CALIBRATION_DRAFT,
    };
  }

  return {
    calibration: isConfirmedCalibration(value.calibration)
      ? value.calibration
      : null,
    draft: isPendingCalibration(value.draft)
      ? {
          ...value.draft,
          points: [],
        }
      : EMPTY_CALIBRATION_DRAFT,
  };
}

function parseBaseVisualState(value: unknown): PersistedBaseVisualState {
  if (!isRecord(value) || !isFiniteNumber(value.activePdfPageNumber)) {
    return { activePdfPageNumber: 1 };
  }

  return {
    activePdfPageNumber: Math.max(1, Math.trunc(value.activePdfPageNumber)),
  };
}

function parseSectionPlanLink(value: unknown): PersistedSectionPlanLink | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isString(value.id) ||
    !isString(value.planBaseId) ||
    !isString(value.sectionBaseId) ||
    !isPoint(value.planStart) ||
    !isPoint(value.planEnd) ||
    !isSectionViewSide(value.viewSide) ||
    !isOptionalFiniteNumber(value.pdfPageNumber) ||
    !isOptionalSectionRegistration(value.registration)
  ) {
    return null;
  }

  return {
    id: value.id,
    planBaseId: value.planBaseId,
    sectionBaseId: value.sectionBaseId,
    planStart: value.planStart,
    planEnd: value.planEnd,
    viewSide: value.viewSide,
    pdfPageNumber: value.pdfPageNumber,
    registration: value.registration,
  };
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function isPoint(value: unknown): value is Point2D {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isPointArray(value: unknown): value is Point2D[] {
  return Array.isArray(value) && value.every(isPoint);
}

function isWorkbenchSource(value: unknown): value is PersistedWorkbenchSource {
  return value === "dxf" || value === "pdf";
}

function isWorkbenchBaseType(value: unknown): value is PersistedWorkbenchBaseType {
  return value === "plan" || value === "section";
}

function isSemanticViewMode(value: unknown): value is SemanticViewMode {
  return value === "original" || value === "prepared";
}

function isSectionViewSide(value: unknown): value is PersistedSectionViewSide {
  return value === "left" || value === "right";
}

function isRouteProposalMode(value: unknown): value is PersistedRouteProposalMode {
  return value === "automatic" || value === "intent" || value === null;
}

function isLayerVisibility(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every(isBoolean);
}

function isNormalizedDrawing(value: unknown): value is NormalizedDrawing {
  return (
    isRecord(value) &&
    isString(value.fileName) &&
    Array.isArray(value.layers) &&
    value.layers.every(isDrawingLayer) &&
    Array.isArray(value.entities) &&
    value.entities.every(isDrawingPrimitive)
  );
}

function isDrawingLayer(value: unknown) {
  return isRecord(value) && isString(value.name) && isBoolean(value.visible);
}

function isDrawingPrimitive(value: unknown) {
  if (!isRecord(value) || !isString(value.id) || !isString(value.layer)) {
    return false;
  }

  if (!isDrawingVisualMetadata(value.visual)) {
    return false;
  }

  if (value.kind === "line") {
    return isPoint(value.start) && isPoint(value.end);
  }

  if (value.kind === "polyline") {
    return isPointArray(value.points) && isBoolean(value.closed);
  }

  if (value.kind === "arc") {
    return (
      isPoint(value.center) &&
      isFiniteNumber(value.radius) &&
      isFiniteNumber(value.startAngle) &&
      isFiniteNumber(value.endAngle)
    );
  }

  if (value.kind === "hatch") {
    return isPointArray(value.outerRing) && Array.isArray(value.rings);
  }

  return false;
}

function isDrawingVisualMetadata(value: unknown) {
  return (
    isRecord(value) &&
    (value.resolvedColor === null || isString(value.resolvedColor)) &&
    isString(value.sourceEntityType)
  );
}

function isNullablePdfModel(value: unknown): value is PdfDocumentModel | null {
  return value === null || isPdfModel(value);
}

function isPdfModel(value: unknown): value is PdfDocumentModel {
  return (
    isRecord(value) &&
    isString(value.fileName) &&
    isFiniteNumber(value.fileSize) &&
    isFiniteNumber(value.pageCount) &&
    Array.isArray(value.pages) &&
    value.pages.every(
      (page) =>
        isRecord(page) &&
        isFiniteNumber(page.pageNumber) &&
        isFiniteNumber(page.width) &&
        isFiniteNumber(page.height) &&
        isFiniteNumber(page.rotation),
    )
  );
}

function isConfirmedCalibration(
  value: unknown,
): value is ConfirmedCalibration {
  return (
    isRecord(value) &&
    value.status === "confirmed" &&
    isRecord(value.points) &&
    isPoint(value.points.start) &&
    isPoint(value.points.end) &&
    isFiniteNumber(value.distanceOriginal) &&
    isCalibrationUnit(value.unit) &&
    isFiniteNumber(value.distanceMillimeters) &&
    isFiniteNumber(value.sourceDistance) &&
    isFiniteNumber(value.millimetersPerSourceUnit)
  );
}

function isPendingCalibration(value: unknown): value is PendingCalibration {
  return (
    isRecord(value) &&
    value.status === "pending" &&
    isPointArray(value.points) &&
    isString(value.distanceOriginal) &&
    isCalibrationUnit(value.unit)
  );
}

function isCalibrationUnit(value: unknown) {
  return value === "mm" || value === "cm" || value === "m";
}

function isClassificationProposalArray(
  value: unknown,
): value is ClassificationProposal[] {
  return (
    Array.isArray(value) &&
    value.every(
      (proposal) =>
        isRecord(proposal) &&
        isString(proposal.id) &&
        Array.isArray(proposal.entityIds) &&
        proposal.entityIds.every(isString) &&
        isSemanticCategory(proposal.category) &&
        Array.isArray(proposal.signals) &&
        isFiniteNumber(proposal.confidence) &&
        isString(proposal.explanation) &&
        isSemanticStatus(proposal.status),
    )
  );
}

function isConfirmedClassificationArray(
  value: unknown,
): value is ConfirmedClassification[] {
  return (
    Array.isArray(value) &&
    value.every(
      (assignment) =>
        isRecord(assignment) &&
        isString(assignment.id) &&
        Array.isArray(assignment.entityIds) &&
        assignment.entityIds.every(isString) &&
        isSemanticCategory(assignment.category) &&
        (assignment.origin === "proposal" || assignment.origin === "manual") &&
        isString(assignment.rule) &&
        (assignment.status === "confirmed" || assignment.status === "modified"),
    )
  );
}

function isSemanticCategory(value: unknown) {
  return (
    value === "hard_structure" ||
    value === "reference_wall" ||
    value === "opening" ||
    value === "unclassified"
  );
}

function isSemanticStatus(value: unknown) {
  return (
    value === "pending" ||
    value === "confirmed" ||
    value === "modified" ||
    value === "discarded"
  );
}

function isNullableSemanticInspection(
  value: unknown,
): value is SemanticInspection | null {
  if (value === null) {
    return true;
  }

  return (
    isRecord(value) &&
    Array.isArray(value.layers) &&
    value.layers.every(
      (layer) =>
        isRecord(layer) &&
        isString(layer.name) &&
        isFiniteNumber(layer.entityCount) &&
        Array.isArray(layer.colors) &&
        layer.colors.every(isString) &&
        Array.isArray(layer.blocks) &&
        layer.blocks.every(isString),
    ) &&
    Array.isArray(value.colors) &&
    value.colors.every(
      (color) =>
        isRecord(color) &&
        isString(color.color) &&
        isFiniteNumber(color.entityCount) &&
        isRecord(color.sources),
    ) &&
    isFiniteNumber(value.explicitColorCount) &&
    isFiniteNumber(value.trueColorCount) &&
    isFiniteNumber(value.byLayerCount) &&
    isFiniteNumber(value.byBlockCount) &&
    Array.isArray(value.lineTypes) &&
    Array.isArray(value.lineweights) &&
    Array.isArray(value.blocks) &&
    isFiniteNumber(value.visuallyUndifferentiatedCount) &&
    isBoolean(value.allEntitiesShareColor)
  );
}

function isManualConstraintArray(value: unknown): value is ManualConstraint[] {
  return (
    Array.isArray(value) &&
    value.every(
      (constraint) =>
        isRecord(constraint) &&
        isString(constraint.id) &&
        (constraint.source === "dxf" || constraint.source === "pdf") &&
        (constraint.pageNumber === null || isFiniteNumber(constraint.pageNumber)) &&
        (constraint.type === "hard_obstacle" ||
          constraint.type === "avoid_zone") &&
        isPointArray(constraint.polygon) &&
        constraint.origin === "manual" &&
        isBoolean(constraint.active),
    )
  );
}

function isEquipmentArray(value: unknown): value is WorkbenchEquipment[] {
  return (
    Array.isArray(value) &&
    value.every(
      (equipment) =>
        isRecord(equipment) &&
        isString(equipment.id) &&
        isString(equipment.planBaseId) &&
        (equipment.pdfPageNumber === undefined ||
          isFiniteNumber(equipment.pdfPageNumber)) &&
        (equipment.role === "supply" || equipment.role === "appliance") &&
        isString(equipment.type) &&
        isString(equipment.name) &&
        isPoint(equipment.connectionPoint) &&
        (equipment.demandValue === undefined ||
          isFiniteNumber(equipment.demandValue)) &&
        (equipment.demandUnit === undefined ||
          equipment.demandUnit === "kcal_h" ||
          equipment.demandUnit === "m3_h") &&
        equipment.source === "manual",
    )
  );
}

function isRouteIntentConnectionArray(
  value: unknown,
): value is RouteIntentConnection[] {
  return (
    Array.isArray(value) &&
    value.every(
      (connection) =>
        isRecord(connection) &&
        isString(connection.id) &&
        isString(connection.planBaseId) &&
        isFiniteNumber(connection.createdAt) &&
        (connection.pdfPageNumber === undefined ||
          isFiniteNumber(connection.pdfPageNumber)) &&
        connection.origin === "manual" &&
        isRouteIntentEndpoint(connection.from) &&
        isRouteIntentEndpoint(connection.to),
    )
  );
}

function isRouteIntentEndpoint(value: unknown) {
  return (
    isRecord(value) && value.kind === "equipment" && isString(value.equipmentId)
  );
}

function isRouteNetwork(value: unknown): value is ManualRouteNetwork {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(
      (node) =>
        isRecord(node) &&
        isString(node.id) &&
        (node.kind === "supply" ||
          node.kind === "appliance" ||
          node.kind === "route") &&
        (node.equipmentId === undefined || isString(node.equipmentId)) &&
        (node.origin === undefined ||
          node.origin === "manual" ||
          node.origin === "automatic") &&
        (node.pdfPageNumber === undefined || isFiniteNumber(node.pdfPageNumber)) &&
        (node.position === undefined || isPoint(node.position)),
    ) &&
    Array.isArray(value.segments) &&
    value.segments.every(
      (segment) =>
        isRecord(segment) &&
        isString(segment.id) &&
        isString(segment.fromNodeId) &&
        isString(segment.toNodeId) &&
        (segment.origin === undefined ||
          segment.origin === "manual" ||
          segment.origin === "automatic") &&
        (segment.accessories === undefined ||
          isRouteAccessoryArray(segment.accessories)),
    )
  );
}

function isRouteAccessoryArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every(
      (accessory) =>
        isRecord(accessory) &&
        isString(accessory.id) &&
        isString(accessory.segmentId) &&
        (accessory.type === "elbow" ||
          accessory.type === "tee" ||
          accessory.type === "valve" ||
          accessory.type === "other") &&
        isFiniteNumber(accessory.quantity) &&
        (accessory.equivalentLengthMetersPerUnit === null ||
          isFiniteNumber(accessory.equivalentLengthMetersPerUnit)) &&
        (accessory.equivalentLengthSource === "manual" ||
          accessory.equivalentLengthSource === "pipe_system" ||
          accessory.equivalentLengthSource === "unresolved"),
    )
  );
}

function isAutomaticRouteProposal(value: unknown): value is AutomaticRouteProposal {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.baseId) &&
    isFiniteNumber(value.lengthMeters) &&
    isFiniteNumber(value.lengthSource) &&
    isRouteNetwork({
      nodes: value.nodes,
      segments: value.segments,
    }) &&
    Array.isArray(value.diagnostics) &&
    isRecord(value.params) &&
    isString(value.params.fingerprint) &&
    isFiniteNumber(value.params.marginMeters) &&
    isFiniteNumber(value.params.scaleMetersPerSourceUnit) &&
    isRecord(value.validation) &&
    (value.status === "ready" ||
      value.status === "partial" ||
      value.status === "invalid")
  );
}

function isOptionalSectionRegistration(
  value: unknown,
): value is SectionRegistration | undefined {
  if (value === undefined) {
    return true;
  }

  return (
    isRecord(value) &&
    isPoint(value.sectionStart) &&
    isPoint(value.sectionEnd) &&
    (value.positiveZSide === "left" || value.positiveZSide === "right") &&
    isFiniteNumber(value.referenceElevationMeters) &&
    (value.sectionPdfPageNumber === undefined ||
      isFiniteNumber(value.sectionPdfPageNumber))
  );
}
