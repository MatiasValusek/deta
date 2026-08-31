"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createConfirmedCalibration, createPointPair } from "@/lib/calibration/calibration";
import type { CalibrationUnit } from "@/lib/calibration/types";
import {
  buildStructuralConstraintIndex,
  constraintBelongsToSource,
  createRectanglePolygon,
  isValidPolygon,
  moveConstraintVertex,
  pointInPolygon,
  summarizeConstraints,
  translateConstraint,
} from "@/lib/constraints/geometry";
import type {
  ConstraintDraft,
  ConstraintToolMode,
  ConstraintType,
  ManualConstraint,
} from "@/lib/constraints/types";
import { importDxf } from "@/lib/dxf/importDxf";
import {
  accessoryCatalogSelectionFromCandidate,
  type AccessoryProposalTechnicalReview,
} from "@/lib/calculation/accessoryCatalogCandidates";
import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import {
  confirmDiameterTransitionProposal,
  detectDiameterTransitionProposals,
  reconcileDiameterTransitionDecisions,
  rejectDiameterTransitionProposal,
  upsertDiameterTransitionDecision,
  withDiameterTransitionTechnicalReview,
  type DiameterTransitionDecision,
  type DiameterTransitionProposal,
  type DiameterTransitionTechnicalReview,
} from "@/lib/calculation/diameterTransitionProposals";
import {
  calculateTechnicalTree,
  formatTechnicalFlow,
  technicalCalculationStatusLabel,
} from "@/lib/calculation/technicalTree";
import {
  resolveTechnicalRouteTransitions,
  type TechnicalRouteTransitionResolution,
} from "@/lib/calculation/technicalRouteTransitions";
import {
  resolveCompoundTurnTransitionPreview,
} from "@/lib/calculation/compoundTurnTransitionResolution";
import {
  createTechnicalAdoptedDiameterValidation,
} from "@/lib/calculation/technicalAdoptedDiameterValidation";
import {
  createTechnicalEquivalentAccessoryVerification,
} from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import {
  createTechnicalPhysicalAccessoryInventory,
} from "@/lib/calculation/technicalPhysicalAccessories";
import { DEFAULT_PROJECT_GAS_CONFIG } from "@/lib/calculation/projectGas";
import {
  removeAdoptedDiameterDecision,
  upsertAdoptedDiameterDecision,
  type AdoptedDiameterDecision,
} from "@/lib/calculation/professionalDiameterAdoption";
import { SIGAS_PIPE_SYSTEM } from "@/lib/calculation/pipeSystems/sigas";
import {
  getSigasAccessoryCatalogCandidates,
  getSigasCompoundTurnTransitionDirectCatalogCandidates,
  getSigasDiameterTransitionCatalogCandidates,
  matchSigasAccessoryProposal,
} from "@/lib/calculation/pipeSystems/sigas/sigasAccessoryProposal";
import {
  equipmentDefinitionForType,
  equipmentTypeLabel,
  hasPendingDemand,
  type DemandUnit,
  type EquipmentDraft,
  type EquipmentPlacementMode,
  type EquipmentTerminalConfig,
  type EquipmentTerminalOutletSide,
  type EquipmentType,
  type EquipmentWallAnchor,
  type EquipmentWallPlacementAlternative,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import {
  confirmEquipmentTerminalConfig,
  createEquipmentTerminalConfigFromHeight,
  createSuggestedEquipmentTerminalConfig,
  parseTerminalLateralOffsetInput,
  terminalEndHeightMeters,
} from "@/lib/equipment/terminalConfig";
import {
  DEFAULT_WALL_SNAP_TOLERANCE_SOURCE,
  resolveEquipmentPhysicalPlacement,
  resolveEquipmentPhysicalPlacementAlternatives,
  withEquipmentWallAnchorZ,
  type EquipmentPhysicalPlacement,
} from "@/lib/equipment/wallAnchoring";
import type { Bounds, DrawingPrimitive, NormalizedDrawing, Point2D } from "@/lib/geometry/types";
import { pointZMeters, withPointZ } from "@/lib/geometry/height";
import { worldToScreen, type ViewTransform } from "@/lib/geometry/viewport";
import { importPdfDocument, type ImportedPdfDocument } from "@/lib/pdf/importPdf";
import type { PdfDocumentModel } from "@/lib/pdf/types";
import { pdfSourceToScreen, type PdfViewTransform } from "@/lib/pdf/pdfViewport";
import {
  pointAlmostEqual,
  pointOnSegment,
  projectPointToSegment,
  segmentIntersectsPolygon,
  segmentsIntersect,
} from "@/lib/routing/geometry";
import {
  buildEquipmentIndex,
  createEmptyRouteNetwork,
  detectRouteCycle,
  distanceBetween as routeDistanceBetween,
  EMPTY_ROUTE_NETWORK,
  applianceNodesAreTerminal,
  findTerminalStartNodeByEquipment,
  findRouteNodeByEquipment,
  getConnectedApplianceEquipmentIds,
  getDerivationNodeIds,
  getRouteNodeDegree,
  getRoutePath,
  hasDuplicateSegments,
  hasDuplicateNodeIds,
  hasDuplicateSegmentIds,
  hasRouteCrossingsWithoutNode,
  hasRoutePath,
  hasSegmentsWithMissingEndpoints,
  hasZeroLengthSegments,
  isEquipmentTerminalSegment,
  pruneOrphanRouteNodes,
  projectPointToRouteSegmentPath,
  removeApplianceBranch,
  resolveRouteNodePosition,
  resolveRouteSegments,
  routeEquipmentTerminalSegmentId,
  routeEquipmentTerminalStartNodeId,
  routeSegmentPlanLegs,
  routeEquipmentNodeId,
  resolveTerminalApplianceBranchOrigin,
  segmentIdsForNodePath,
  splitRouteSegmentAtPoint,
  totalRouteLengthSource,
} from "@/lib/routing/network";
import { generateAutomaticRouteProposal } from "@/lib/routing/autoProposal";
import { routeProposalCanBeAccepted } from "@/lib/routing/proposalAcceptance";
import {
  buildProposalFromIntent,
  routeIntentConnectionKey,
  routeIntentConnectionReferencesEquipment,
  routeIntentConnectionsEqual,
  routeIntentEndpointKey,
} from "@/lib/routing/intentProposal";
import {
  DEFAULT_PHYSICAL_ROUTE_SNAP_OPTIONS,
  insertPhysicalRouteVertex,
  movePhysicalRouteNode,
  movePhysicalRouteVertex,
  relatedRouteSegmentIds,
  removePhysicalRouteVertex,
  snapPhysicalRouteEditPoint,
  type PhysicalRouteEditSelection,
  type PhysicalRouteSnapOptions,
} from "@/lib/routing/physicalRouteEditing";
import { applyConfirmedEquipmentTerminalConnection } from "@/lib/routing/terminalConnection";
import {
  confirmRouteAccessoryProposal,
  detectRouteAccessoryProposals,
  reconcileRouteAccessoryProposalState,
  rejectRouteAccessoryProposal,
  resolveAccessoryProposalTechnicalOwner,
  routeAccessoryProposalHasManualAccessory,
  upsertAccessoryProposalDecision,
  withAccessoryProposalSystemMatch,
  type AccessoryProposalDecision,
  type AccessoryProposalDiameterReference,
} from "@/lib/routing/routeAccessoryProposals";
import type {
  AutomaticRouteProposal,
  AutomaticRouteRestriction,
  ManualRouteNetwork,
  ResolvedRouteSegment,
  RouteDraft,
  RouteIntentConnection,
  RouteIntentDraft,
  RouteIntentEndpoint,
  RouteNode,
  RouteSegment,
  RouteToolMode,
} from "@/lib/routing/types";
import {
  SECTION_LENGTH_TOLERANCE_RATIO,
  isValidSectionRegistrationSegment,
  lengthDifferenceRatio,
  type SectionRegistration,
  type SectionRegistrationSide,
} from "@/lib/sections/registration";
import {
  createSectionRouteProjection,
} from "@/lib/sections/routeProjection";
import {
  applySectionRouteHeightEdit,
  type SectionRouteHeightTarget,
} from "@/lib/sections/routeHeightEditing";
import {
  createStandardTechnicalAxonometricView,
  createStandardTechnicalSectionView,
  type StandardTechnicalReviewViewId,
} from "@/lib/sections/standardTechnicalViews";
import {
  buildClassificationIndex,
  createClassificationFromProposal,
  createManualClassification,
} from "@/lib/semantic/classification";
import { inspectDrawingSemantics } from "@/lib/semantic/inspection";
import {
  generateClassificationProposals,
  nextSemanticCategory,
} from "@/lib/semantic/suggestions";
import type {
  ClassificationIndex,
  ClassificationProposal,
  ConfirmedClassification,
  ManualSelectionMode,
  SemanticCategory,
  SemanticInspection,
  SemanticViewMode,
} from "@/lib/semantic/types";
import {
  clearPersistedWorkbenchProject,
  createPersistedWorkbenchProject,
  loadPersistedWorkbenchProject,
  savePersistedWorkbenchProject,
  type PersistedSourceCalibrationState,
  type PersistedWorkbenchBase,
  type PersistedWorkbenchProject,
} from "@/lib/workbench/persistence";
import {
  createPlanStageReadiness,
  type PlanStageReadiness,
} from "@/lib/workbench/planStageFlow";
import { createRouteReviewState } from "@/lib/workbench/reviewStage";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { DxfViewer } from "./DxfViewer";
import { EquipmentPanel } from "./EquipmentPanel";
import { GeometryPreparationPanel } from "./GeometryPreparationPanel";
import { ObstaclesPanel } from "./ObstaclesPanel";
import {
  CalibrationPanel,
  type CalibrationToolMode,
  type SourceCalibrationState,
} from "./CalibrationPanel";
import { CalculationPanel } from "./CalculationPanel";
import { LayerPanel } from "./LayerPanel";
import { PdfDiagnosticsPanel } from "./PdfDiagnosticsPanel";
import { PdfPanel } from "./PdfPanel";
import { PdfViewer } from "./PdfViewer";
import { RouteContextCard } from "./RouteContextCard";
import { RouteIntentContextCard } from "./RouteIntentContextCard";
import { RoutePanel } from "./RoutePanel";
import { ReviewPanel, type ReviewTechnicalViewItem } from "./ReviewPanel";
import {
  RightPanelSections,
  type RightPanelSection,
  type RightPanelSectionId,
} from "./RightPanelSections";
import type {
  SectionLinkDraftOverlay,
  SectionLinkToolMode,
  SectionPlanLink,
  SectionViewSide,
} from "./SectionLinksOverlay";
import type {
  SectionRegistrationDraftOverlay,
  SectionRegistrationSavedOverlay,
  SectionRegistrationToolMode,
} from "./SectionRegistrationOverlay";
import { TechnicalReviewCanvas } from "./TechnicalReviewCanvas";
import type { SourceOverlayData } from "./SourceOverlay";

export type LayerVisibility = Record<string, boolean>;

type WorkbenchSource = "dxf" | "pdf";
type WorkbenchBaseType = "plan" | "section";
type BaseFilePurpose = WorkbenchBaseType | "replace-active";
type MainWorkflowStageId =
  | "plan"
  | "equipment"
  | "route"
  | "review"
  | "calculate"
  | "deliver";

type SectionLinkDraft = {
  editingLinkId: string | null;
  pdfPageNumber?: number;
  planBaseId: string;
  planEnd: Point2D | null;
  planStart: Point2D | null;
  previewPoint: Point2D | null;
  sectionBaseId: string;
  step: Exclude<SectionLinkToolMode, "inactive">;
  viewSide: SectionViewSide | null;
};

type SectionRegistrationDraft = {
  editingLinkId: string;
  planBaseId: string;
  positiveZSide: SectionRegistrationSide | null;
  previewPoint: Point2D | null;
  referenceElevationInput: string;
  sectionBaseId: string;
  sectionEnd: Point2D | null;
  sectionPdfPageNumber?: number;
  sectionStart: Point2D | null;
  step: Exclude<SectionRegistrationToolMode, "inactive">;
};

type SectionRegistrationSummary = {
  lengthLabel: string | null;
  status: string;
};

type BaseVisualState = {
  activePdfPageNumber: number;
  dxfFitNonce: number;
  dxfView: ViewTransform | null;
  pdfFitNonce: number;
  pdfView: PdfViewTransform | null;
};

type PersistenceNotice = {
  message: string;
  tone: "error" | "info" | "warning";
};

type SectionRouteHeightEditorState = {
  error: string | null;
  heightInput: string;
  heightMeters: number;
  target: SectionRouteHeightTarget;
};

type WorkbenchBase = {
  id: string;
  type: WorkbenchBaseType;
  name: string;
  sourceType: WorkbenchSource;
  originalFileName: string;
  createdAt: number;
  drawing: NormalizedDrawing | null;
  pdfDocument: ImportedPdfDocument | null;
  pdfModel: PdfDocumentModel | null;
  visibleLayers: LayerVisibility;
  error: string | null;
  semanticViewMode: SemanticViewMode;
  selectionMode: ManualSelectionMode;
  selectedEntityIds: string[];
  semanticInspection: SemanticInspection | null;
  proposals: ClassificationProposal[];
  semanticAssignments: ConfirmedClassification[];
  constraints: ManualConstraint[];
  constraintDraft: ConstraintDraft | null;
  constraintToolMode: ConstraintToolMode;
  selectedConstraintId: string | null;
  showConstraints: boolean;
  equipment: WorkbenchEquipment[];
  selectedEquipmentId: string | null;
  showEquipment: boolean;
  routeIntentConnections: RouteIntentConnection[];
  adoptedDiameterDecisions: AdoptedDiameterDecision[];
  diameterTransitionDecisions: DiameterTransitionDecision[];
  routeAccessoryProposalDecisions: AccessoryProposalDecision[];
  routeNetwork: ManualRouteNetwork;
  showRoute: boolean;
  calibration: SourceCalibrationState;
  visual: BaseVisualState;
};

const BASE_FILE_ACCEPT =
  ".dxf,.pdf,application/dxf,application/x-dxf,application/pdf";
const MIN_SECTION_LINK_LENGTH = 0.0001;
const DEFAULT_REFERENCE_ELEVATION_INPUT = "0,00";
const DEFAULT_DEMAND_UNIT: DemandUnit = "kcal_h";
const DEFAULT_ROUTE_PROPOSAL_MARGIN_INPUT = "0,10";
const MAIN_WORKFLOW_STAGES: Array<{
  id: MainWorkflowStageId;
  label: string;
}> = [
  { id: "plan", label: "Plano" },
  { id: "equipment", label: "Artefactos" },
  { id: "route", label: "Recorrido" },
  { id: "review", label: "Revisar" },
  { id: "calculate", label: "Calcular" },
  { id: "deliver", label: "Entregar" },
];
const MAIN_WORKFLOW_PANEL_SECTIONS: Record<
  MainWorkflowStageId,
  RightPanelSectionId[]
> = {
  calculate: ["calculation"],
  deliver: ["calculation"],
  equipment: ["equipment"],
  plan: ["scale"],
  review: ["review"],
  route: ["route"],
};
const MAIN_WORKFLOW_DEFAULT_PANEL: Record<
  MainWorkflowStageId,
  RightPanelSectionId
> = {
  calculate: "calculation",
  deliver: "calculation",
  equipment: "equipment",
  plan: "geometry",
  review: "review",
  route: "route",
};

export function DxfWorkbench() {
  const [bases, setBases] = useState<WorkbenchBase[]>([]);
  const [activeBaseId, setActiveBaseId] = useState<string | null>(null);
  const [nextSectionNumber, setNextSectionNumber] = useState(1);
  const [sectionPlanLinks, setSectionPlanLinks] = useState<SectionPlanLink[]>([]);
  const [sectionLinkDraft, setSectionLinkDraft] =
    useState<SectionLinkDraft | null>(null);
  const [sectionRegistrationDraft, setSectionRegistrationDraft] =
    useState<SectionRegistrationDraft | null>(null);
  const [sectionRouteHeightEditor, setSectionRouteHeightEditor] =
    useState<SectionRouteHeightEditorState | null>(null);
  const [equipmentDraft, setEquipmentDraft] =
    useState<EquipmentDraft | null>(null);
  const [routeDraft, setRouteDraft] = useState<RouteDraft | null>(null);
  const [routeIntentDraft, setRouteIntentDraft] =
    useState<RouteIntentDraft | null>(null);
  const [routeProposal, setRouteProposal] =
    useState<AutomaticRouteProposal | null>(null);
  const [routeProposalMode, setRouteProposalMode] =
    useState<"automatic" | "intent" | null>(null);
  const [isRouteEditing, setIsRouteEditing] = useState(false);
  const [isRouteProposalGenerating, setIsRouteProposalGenerating] =
    useState(false);
  const [routeProposalMarginInput, setRouteProposalMarginInput] =
    useState(DEFAULT_ROUTE_PROPOSAL_MARGIN_INPUT);
  const [selectedRouteEdit, setSelectedRouteEdit] =
    useState<PhysicalRouteEditSelection | null>(null);
  const [routeSnapOptions, setRouteSnapOptions] =
    useState<PhysicalRouteSnapOptions>(DEFAULT_PHYSICAL_ROUTE_SNAP_OPTIONS);
  const [activeRightPanelSection, setActiveRightPanelSection] =
    useState<RightPanelSectionId>("geometry");
  const [activeMainStage, setActiveMainStage] =
    useState<MainWorkflowStageId>("plan");
  const [activeReviewViewId, setActiveReviewViewId] =
    useState<StandardTechnicalReviewViewId>("plan");
  const [highlightedSectionLinkId, setHighlightedSectionLinkId] =
    useState<string | null>(null);
  const [highlightedRegistrationLinkId, setHighlightedRegistrationLinkId] =
    useState<string | null>(null);
  const [hoveredSectionLinkId, setHoveredSectionLinkId] =
    useState<string | null>(null);
  const [hoveredEquipmentId, setHoveredEquipmentId] =
    useState<string | null>(null);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Point2D | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [persistenceNotice, setPersistenceNotice] =
    useState<PersistenceNotice | null>(null);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const planInputRef = useRef<HTMLInputElement | null>(null);
  const sectionInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const basesRef = useRef(bases);
  const highlightTimerRef = useRef<number | null>(null);
  const registrationHighlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    basesRef.current = bases;
  }, [bases]);

  useEffect(() => {
    return () => {
      for (const base of basesRef.current) {
        cleanupBaseDocument(base);
      }

      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }

      if (registrationHighlightTimerRef.current !== null) {
        window.clearTimeout(registrationHighlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const result = loadPersistedWorkbenchProject();

    if (result.status === "loaded") {
      const restoredProject = restorePersistedWorkbenchProject(result.project);

      setBases(restoredProject.bases);
      setActiveBaseId(restoredProject.activeBaseId);
      setNextSectionNumber(result.project.nextSectionNumber);
      setSectionPlanLinks(result.project.sectionPlanLinks);
      setRouteProposal(restoredProject.routeProposal);
      setRouteProposalMode(
        restoredProject.routeProposal ? result.project.routeProposalMode : null,
      );
      setRouteProposalMarginInput(result.project.routeProposalMarginInput);

      if (restoredProject.hasPdfPlaceholders) {
        setPersistenceNotice({
          message:
            "Los PDF locales quedan como referencia y deben volver a cargarse para ver la pagina original.",
          tone: "warning",
        });
      }
    } else if (result.status === "invalid") {
      clearPersistedWorkbenchProject();
      setPersistenceNotice({
        message:
          "El proyecto local guardado no se pudo leer. Se inicio un proyecto vacio.",
        tone: "warning",
      });
    } else if (result.status === "unavailable") {
      setPersistenceNotice({
        message: "El guardado local no esta disponible en este navegador.",
        tone: "warning",
      });
    }

    setIsPersistenceReady(true);
  }, []);

  useEffect(() => {
    if (!isPersistenceReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      const result = savePersistedWorkbenchProject(
        createPersistedWorkbenchProject({
          activeBaseId,
          bases,
          nextSectionNumber,
          routeProposal,
          routeProposalMarginInput,
          routeProposalMode,
          sectionPlanLinks,
        }),
      );

      if (!result.ok) {
        setPersistenceNotice({
          message: `No se pudo guardar el proyecto local. ${result.error}`,
          tone: "error",
        });
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    activeBaseId,
    bases,
    isPersistenceReady,
    nextSectionNumber,
    routeProposal,
    routeProposalMarginInput,
    routeProposalMode,
    sectionPlanLinks,
  ]);

  useEffect(() => {
    if (persistenceNotice?.message !== "Proyecto local restablecido.") {
      return;
    }

    const timer = window.setTimeout(() => {
      setPersistenceNotice((current) =>
        current?.message === "Proyecto local restablecido." ? null : current,
      );
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [persistenceNotice]);

  const activeBase = useMemo(
    () => bases.find((base) => base.id === activeBaseId) ?? null,
    [activeBaseId, bases],
  );
  const hasAnyBase = bases.length > 0;
  const orderedBases = useMemo(
    () =>
      [...bases].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "plan" ? -1 : 1;
        }

        return a.createdAt - b.createdAt;
      }),
    [bases],
  );
  const planBase = useMemo(
    () => bases.find((base) => base.type === "plan") ?? null,
    [bases],
  );
  const activeView = activeBase?.sourceType ?? "dxf";
  const drawing = activeView === "dxf" ? activeBase?.drawing ?? null : null;
  const pdfDocument = activeView === "pdf" ? activeBase?.pdfDocument ?? null : null;
  const pdfModel =
    activeView === "pdf"
      ? activeBase?.pdfDocument?.model ?? activeBase?.pdfModel ?? null
      : null;
  const activePdfPageNumber = activeBase?.visual.activePdfPageNumber ?? 1;

  const layerEntityCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const entity of drawing?.entities ?? []) {
      counts[entity.layer] = (counts[entity.layer] ?? 0) + 1;
    }

    return counts;
  }, [drawing]);
  const classificationIndex = useMemo(
    () => buildClassificationIndex(activeBase?.semanticAssignments ?? []),
    [activeBase?.semanticAssignments],
  );
  const planClassificationIndex = useMemo(
    () => buildClassificationIndex(planBase?.semanticAssignments ?? []),
    [planBase?.semanticAssignments],
  );
  const structuralConstraintIndex = useMemo(
    () => buildStructuralConstraintIndex(classificationIndex),
    [classificationIndex],
  );
  const constraintSummary = useMemo(
    () =>
      summarizeConstraints({
        constraints: activeBase?.constraints ?? [],
        structuralIndex: structuralConstraintIndex,
      }),
    [activeBase?.constraints, structuralConstraintIndex],
  );
  const pendingEntityIds = useMemo(
    () =>
      (activeBase?.proposals ?? [])
        .filter(
          (proposal) =>
            proposal.status === "pending" || proposal.status === "modified",
        )
        .flatMap((proposal) => proposal.entityIds),
    [activeBase?.proposals],
  );

  const activeConstraintSource = useMemo(
    () =>
      activeView === "dxf"
        ? { source: "dxf" as const, pageNumber: null }
        : { source: "pdf" as const, pageNumber: activePdfPageNumber },
    [activePdfPageNumber, activeView],
  );
  const activeConstraints = useMemo(
    () =>
      (activeBase?.constraints ?? []).filter((constraint) =>
        constraintBelongsToSource(
          constraint,
          activeConstraintSource.source,
          activeConstraintSource.pageNumber,
        ),
      ),
    [activeBase?.constraints, activeConstraintSource],
  );
  const activeConstraintDraft = useMemo(() => {
    const draft = activeBase?.constraintDraft;

    if (
      draft &&
      draft.source === activeConstraintSource.source &&
      draft.pageNumber === activeConstraintSource.pageNumber
    ) {
      return draft;
    }

    return null;
  }, [activeBase?.constraintDraft, activeConstraintSource]);
  const selectedConstraint = useMemo(
    () =>
      activeConstraints.find(
        (constraint) => constraint.id === activeBase?.selectedConstraintId,
      ) ?? null,
    [activeBase?.selectedConstraintId, activeConstraints],
  );
  const planEquipment = planBase?.equipment ?? [];
  const visibleEquipment = useMemo(() => {
    if (!activeBase || activeBase.type !== "plan") {
      return [];
    }

    return activeBase.equipment.filter((item) =>
      equipmentBelongsToActivePlanPage(item, activeBase),
    );
  }, [activeBase, activePdfPageNumber]);
  const selectedEquipment = useMemo(() => {
    if (!activeBase || activeBase.type !== "plan") {
      return null;
    }

    return (
      activeBase.equipment.find(
        (item) => item.id === activeBase.selectedEquipmentId,
      ) ?? null
    );
  }, [activeBase]);
  const supplyCount = planEquipment.filter((item) => item.role === "supply").length;
  const pendingDemandCount = planEquipment.filter(hasPendingDemand).length;
  const applianceCount = planEquipment.filter(
    (item) => item.role === "appliance",
  ).length;
  const isEquipmentTraceReady =
    supplyCount === 1 && applianceCount > 0 && pendingDemandCount === 0;
  const activeEquipmentDraftOverlay = useMemo(() => {
    if (!activeBase || activeBase.id !== equipmentDraft?.planBaseId) {
      return null;
    }

    if (
      activeBase.sourceType === "pdf" &&
      equipmentDraft.pdfPageNumber !== activePdfPageNumber
    ) {
      return null;
    }

    return equipmentDraft;
  }, [activeBase, activePdfPageNumber, equipmentDraft]);
  const equipmentPlacementMode: EquipmentPlacementMode =
    activeEquipmentDraftOverlay?.step === "placing" ? "placing" : "inactive";
  const canSaveEquipmentDraft = Boolean(
    equipmentDraft?.name.trim() &&
      equipmentDraft.connectionPoint &&
      parseConnectionHeightInput(equipmentDraft.connectionHeightInput).ok &&
      (equipmentDraft.role !== "appliance" ||
        draftHasConfirmedWallSupport(equipmentDraft)) &&
      (equipmentDraft.role !== "appliance" ||
        parseTerminalLateralOffsetInput(
          equipmentDraft.terminalLateralOffsetInput,
        ).ok),
  );
  const applianceEquipment = planEquipment.filter(
    (item) => item.role === "appliance",
  );
  const routeNetwork = planBase?.routeNetwork ?? EMPTY_ROUTE_NETWORK;
  const planScaleMetersPerSourceUnit = useMemo(
    () => (planBase ? calibrationScaleMetersPerSourceUnit(planBase) : null),
    [planBase?.calibration.calibration, planBase?.id],
  );
  const activeRouteNetwork = useMemo(() => {
    if (!activeBase || activeBase.type !== "plan") {
      return EMPTY_ROUTE_NETWORK;
    }

    return routeNetworkForActivePage(activeBase);
  }, [
    activeBase?.equipment,
    activeBase?.id,
    activeBase?.routeNetwork,
    activeBase?.sourceType,
    activeBase?.type,
    activeBase?.visual.activePdfPageNumber,
  ]);
  const routeInvalidSegmentIds = useMemo(
    () =>
      planBase
        ? findInvalidRouteSegmentIds(
            planBase,
            planBase.routeNetwork,
            planClassificationIndex,
          )
        : new Set<string>(),
    [
      planBase?.constraints,
      planBase?.id,
      planBase?.sourceType,
      planBase?.visual.activePdfPageNumber,
      planClassificationIndex,
      planEquipment,
      routeNetwork,
    ],
  );
  const connectedApplianceIds = useMemo(
    () =>
      planBase
        ? getConnectedApplianceEquipmentIds(routeNetwork, planEquipment)
        : new Set<string>(),
    [planBase?.id, planEquipment, routeNetwork],
  );
  const routeCycleDetected = useMemo(
    () => (planBase ? detectRouteCycle(routeNetwork) : false),
    [planBase?.id, routeNetwork],
  );
  const routeCrossingDetected = useMemo(
    () =>
      planBase
        ? hasRouteCrossingsWithoutNode(routeNetwork, planEquipment)
        : false,
    [planBase?.id, planEquipment, routeNetwork],
  );
  const routeApplianceStatuses = useMemo(() => {
    if (!planBase) {
      return [];
    }

    const supply = planEquipment.find((item) => item.role === "supply") ?? null;
    const supplyNode = supply
      ? findRouteNodeByEquipment(routeNetwork, supply.id)
      : null;

    return applianceEquipment.map((equipment) => {
      const applianceNode = findRouteNodeByEquipment(
        routeNetwork,
        equipment.id,
      );
      const isConnected = connectedApplianceIds.has(equipment.id);
      const path =
        isConnected && supplyNode && applianceNode
          ? getRoutePath(routeNetwork, supplyNode.id, applianceNode.id)
          : [];
      const segmentIds = segmentIdsForNodePath(routeNetwork, path);

      return {
        equipment,
        isConnected,
        isInvalid: segmentIds.some((id) => routeInvalidSegmentIds.has(id)),
      };
    });
  }, [
    applianceEquipment,
    connectedApplianceIds,
    planBase?.id,
    planEquipment,
    routeNetwork,
    routeInvalidSegmentIds,
  ]);
  const routeRestrictionCount = useMemo(
    () =>
      routeInvalidSegmentIds.size +
      (routeCycleDetected ? 1 : 0) +
      (routeCrossingDetected ? 1 : 0) +
      (hasDuplicateNodeIds(routeNetwork) || hasDuplicateSegmentIds(routeNetwork)
        ? 1
        : 0) +
      (hasSegmentsWithMissingEndpoints(routeNetwork) ? 1 : 0) +
      (!applianceNodesAreTerminal(routeNetwork) ? 1 : 0) +
      (hasDuplicateSegments(routeNetwork) ? 1 : 0) +
      (hasZeroLengthSegments(routeNetwork, planEquipment, MIN_SECTION_LINK_LENGTH)
        ? 1
        : 0),
    [
      planEquipment,
      routeCrossingDetected,
      routeCycleDetected,
      routeInvalidSegmentIds,
      routeNetwork,
    ],
  );
  const routeLengthLabel = useMemo(() => {
    if (!planBase || planScaleMetersPerSourceUnit === null) {
      return "Escala pendiente";
    }

    return formatMeters(
      totalRouteLengthSource(routeNetwork, planEquipment) *
        planScaleMetersPerSourceUnit,
    );
  }, [planBase?.id, planEquipment, planScaleMetersPerSourceUnit, routeNetwork]);
  const isRouteComplete =
    supplyCount === 1 &&
    applianceEquipment.length > 0 &&
    connectedApplianceIds.size === applianceEquipment.length &&
    routeRestrictionCount === 0 &&
    !routeCycleDetected;
  const routeReviewState = useMemo(
    () =>
      createRouteReviewState({
        equipment: planEquipment,
        hasActiveProposal: Boolean(routeProposal),
        hasRouteCycle: routeCycleDetected,
        network: routeNetwork,
        routeRestrictionCount,
      }),
    [
      planEquipment,
      routeCycleDetected,
      routeNetwork,
      routeProposal,
      routeRestrictionCount,
    ],
  );
  const canOpenReviewStage = routeReviewState.canOpenReview;
  const activeRouteDraftOverlay = useMemo(() => {
    if (!activeBase || activeBase.id !== routeDraft?.planBaseId) {
      return null;
    }

    if (
      activeBase.sourceType === "pdf" &&
      routeDraft.pdfPageNumber !== activePdfPageNumber
    ) {
      return null;
    }

    return routeDraft;
  }, [activeBase, activePdfPageNumber, routeDraft]);
  const activeRouteIntentDraftOverlay = useMemo(() => {
    if (!activeBase || activeBase.id !== routeIntentDraft?.planBaseId) {
      return null;
    }

    if (
      activeBase.sourceType === "pdf" &&
      routeIntentDraft.pdfPageNumber !== activePdfPageNumber
    ) {
      return null;
    }

    return routeIntentDraft;
  }, [activeBase, activePdfPageNumber, routeIntentDraft]);
  const activeRouteIntentConnections = useMemo(() => {
    if (!activeBase || activeBase.type !== "plan") {
      return [];
    }

    return routeIntentConnectionsForActivePage(activeBase);
  }, [
    activeBase?.id,
    activeBase?.routeIntentConnections,
    activeBase?.sourceType,
    activeBase?.type,
    activeBase?.visual.activePdfPageNumber,
  ]);
  const routeDraftTarget = useMemo(() => {
    if (!activeRouteDraftOverlay?.targetEquipmentId) {
      return null;
    }

    return (
      planEquipment.find(
        (equipment) =>
          equipment.id === activeRouteDraftOverlay.targetEquipmentId,
      ) ?? null
    );
  }, [activeRouteDraftOverlay?.targetEquipmentId, planEquipment]);
  const routeToolMode: RouteToolMode =
    activeRouteIntentDraftOverlay &&
    activeRouteIntentDraftOverlay.step !== "review"
      ? "drawing"
      : activeRouteDraftOverlay?.step === "origin"
      ? "origin"
      : activeRouteDraftOverlay?.step === "drawing"
        ? "drawing"
        : "inactive";
  const routeProposalMarginMeters = useMemo(
    () => parseRouteProposalMargin(routeProposalMarginInput),
    [routeProposalMarginInput],
  );
  const routeProposalFingerprint = useMemo(
    () =>
      planBase && routeProposalMarginMeters !== null
        ? createRouteProposalFingerprint(
            planBase,
            planClassificationIndex,
            routeProposalMarginMeters,
          )
        : null,
    [
      planBase?.calibration.calibration,
      planBase?.constraints,
      planBase?.id,
      planBase?.sourceType,
      planBase?.visual.activePdfPageNumber,
      planEquipment,
      planClassificationIndex,
      routeProposalMarginMeters,
    ],
  );
  const routeIntentProposalFingerprint = useMemo(
    () =>
      planBase && routeProposalMarginMeters !== null
        ? createRouteIntentProposalFingerprint(
            planBase,
            planClassificationIndex,
            routeProposalMarginMeters,
          )
        : null,
    [
      planBase?.calibration.calibration,
      planBase?.constraints,
      planBase?.id,
      planBase?.routeIntentConnections,
      planBase?.sourceType,
      planBase?.visual.activePdfPageNumber,
      planEquipment,
      planClassificationIndex,
      routeNetwork,
      routeProposalMarginMeters,
    ],
  );
  const expectedRouteProposalFingerprint =
    routeProposalMode === "intent"
      ? routeIntentProposalFingerprint
      : routeProposalFingerprint;
  const activeRouteProposalOverlay = useMemo(() => {
    if (!activeBase || activeBase.id !== routeProposal?.baseId) {
      return null;
    }

    if (
      activeBase.sourceType === "pdf" &&
      routeProposal.pdfPageNumber !== activePdfPageNumber
    ) {
      return null;
    }

    return routeProposal;
  }, [activeBase?.id, activeBase?.sourceType, activePdfPageNumber, routeProposal]);
  const isRouteProposalOutdated = Boolean(
    routeProposal &&
      (!expectedRouteProposalFingerprint ||
        routeProposal.params.fingerprint !== expectedRouteProposalFingerprint),
  );
  const visibleRouteProposalOverlay = isRouteEditing
    ? null
    : activeRouteProposalOverlay;
  const routePhysicalEditingEnabled =
    isRouteEditing || activeMainStage === "review";
  const routeProposalRequiresScale = Boolean(
    planBase && !planBase.calibration.calibration,
  );
  const technicalCalculationResult = useMemo(
    () =>
      planBase
        ? calculateTechnicalTree({
            diameterTransitionDecisions: planBase.diameterTransitionDecisions,
            equipment: planEquipment,
            minSegmentLengthSource: MIN_SECTION_LINK_LENGTH,
            network: routeNetwork,
            pipeSystem: SIGAS_PIPE_SYSTEM,
            projectGas: DEFAULT_PROJECT_GAS_CONFIG,
            scaleMetersPerSourceUnit: planScaleMetersPerSourceUnit,
          })
        : null,
    [
      planBase?.diameterTransitionDecisions,
      planBase?.id,
      planEquipment,
      planScaleMetersPerSourceUnit,
      routeNetwork,
    ],
  );
  const finalDiameterBySegmentId = useMemo(() => {
    const finalDiameters =
      technicalCalculationResult?.transitionAwareNetworkSizing?.status ===
      "resolved"
        ? technicalCalculationResult.transitionAwareNetworkSizing
            .finalDiameterBySegmentId
        : technicalCalculationResult?.networkSizing?.finalDiameterBySegmentId ??
          {};

    return new Map<string, PipeDiameterReference>(
      Object.entries(finalDiameters),
    );
  }, [technicalCalculationResult]);
  const accessoryProposalDiameterBySegmentId =
    finalDiameterBySegmentId as Map<string, AccessoryProposalDiameterReference>;
  const routeAccessoryProposals = useMemo(() => {
    if (!planBase) {
      return [];
    }

    return detectRouteAccessoryProposals({
      decisions: planBase.routeAccessoryProposalDecisions,
      diameterBySegmentId: accessoryProposalDiameterBySegmentId,
      equipment: planEquipment,
      network: routeNetwork,
    }).map((proposal) =>
      withAccessoryProposalSystemMatch(
        proposal,
        matchSigasAccessoryProposal(proposal),
      ),
    );
  }, [
    accessoryProposalDiameterBySegmentId,
    planBase?.id,
    planBase?.routeAccessoryProposalDecisions,
    planEquipment,
    routeNetwork,
  ]);
  const routeAccessoryProposalReviews = useMemo(() => {
    if (!planBase) {
      return [];
    }

    return routeAccessoryProposals.map((proposal): AccessoryProposalTechnicalReview => {
      const ownerResolution = resolveAccessoryProposalTechnicalOwner({
        diameterBySegmentId: accessoryProposalDiameterBySegmentId,
        network: routeNetwork,
        proposal,
      });
      const hasManualAccessory = routeAccessoryProposalHasManualAccessory({
        network: routeNetwork,
        proposal,
        type: proposal.domainAccessory?.type,
      });
      const candidates = getSigasAccessoryCatalogCandidates({
        diameterBySegmentId: accessoryProposalDiameterBySegmentId,
        hasManualAccessory,
        ownerResolution,
        proposal,
      });
      const selectedDiameter =
        ownerResolution.status === "unambiguous"
          ? accessoryProposalDiameterBySegmentId.get(
              ownerResolution.ownerSegmentId,
            ) ?? null
          : null;
      const compatibleCandidates = candidates.filter(
        (candidate) => candidate.status === "compatible",
      );
      const reason =
        hasManualAccessory
          ? "Ya existe un accesorio manual compatible en un tramo incidente."
          : ownerResolution.status !== "unambiguous"
            ? ownerResolution.reason
            : candidates.length === 0
              ? "No hay candidatos tecnicos compatibles con esta propuesta."
              : compatibleCandidates.length === 0
                ? candidates[0]?.reason ?? null
                : null;

      return {
        candidates,
        incidentSegments: proposal.incidentSegmentIds.map((segmentId) => ({
          diameter: accessoryProposalDiameterBySegmentId.get(segmentId) ?? null,
          segmentId,
        })),
        ownerResolution,
        proposalId: proposal.id,
        reason,
        selectedDiameter,
        status:
          compatibleCandidates.length > 0 && !hasManualAccessory
            ? "compatible"
            : candidates.some((candidate) => candidate.status === "incompatible")
              ? "incompatible"
              : "requires_more_information",
      };
    });
  }, [
    accessoryProposalDiameterBySegmentId,
    planBase?.id,
    routeAccessoryProposals,
    routeNetwork,
  ]);
  const rawDiameterTransitionProposals = useMemo(() => {
    if (!planBase) {
      return [];
    }

    return detectDiameterTransitionProposals({
      decisions: planBase.diameterTransitionDecisions,
      diameterBySegmentId: finalDiameterBySegmentId,
      equipment: planEquipment,
      network: routeNetwork,
    });
  }, [
    finalDiameterBySegmentId,
    planBase?.diameterTransitionDecisions,
    planBase?.id,
    planEquipment,
    routeNetwork,
  ]);
  const diameterTransitionProposalReviews = useMemo(
    () =>
      rawDiameterTransitionProposals.map(
        (proposal): DiameterTransitionTechnicalReview => {
          const candidates =
            getSigasDiameterTransitionCatalogCandidates(proposal);
          const directCompoundCandidates =
            getSigasCompoundTurnTransitionDirectCatalogCandidates(proposal);
          const compoundPreview =
            proposal.kind === "compound_turn_transition" && planBase
              ? resolveCompoundTurnTransitionPreview({
                  diameterBySegmentId: finalDiameterBySegmentId,
                  directCandidates: directCompoundCandidates,
                  network: routeNetwork,
                  pipeSystem: SIGAS_PIPE_SYSTEM,
                  proposal,
                })
              : null;
          const selectedCandidate = proposal.selectedCatalogFamilyId
            ? candidates.find(
                (candidate) =>
                  candidate.familyId === proposal.selectedCatalogFamilyId &&
                  (!proposal.decision?.pipeSystemId ||
                    candidate.pipeSystem.id === proposal.decision.pipeSystemId),
              ) ?? null
            : null;
          const compatibleCandidates = candidates.filter(
            (candidate) => candidate.status === "compatible",
          );

          return {
            candidates,
            downstreamDiameters: proposal.downstreamDiameters.map((item) => ({
              diameter: item.diameter,
              segmentId: item.segmentId,
            })),
            reason: diameterTransitionReviewReason({
              candidates,
              compoundPreview,
              compatibleCandidates,
              proposal,
              selectedCandidate,
            }),
            selectedCandidate,
            status:
              selectedCandidate?.status ??
              (compatibleCandidates.length > 0
                ? "compatible"
                : candidates.some(
                    (candidate) => candidate.status === "incompatible",
                  )
                  ? "incompatible"
                  : "requires_more_information"),
            transitionId: proposal.id,
            upstreamDiameter: proposal.upstreamDiameter?.diameter ?? null,
          };
        },
      ),
    [
      finalDiameterBySegmentId,
      planBase?.id,
      rawDiameterTransitionProposals,
      routeNetwork,
    ],
  );
  const diameterTransitionProposals = useMemo(() => {
    const reviewById = new Map(
      diameterTransitionProposalReviews.map((review) => [
        review.transitionId,
        review,
      ]),
    );

    return rawDiameterTransitionProposals.map((proposal) => {
      const review = reviewById.get(proposal.id);

      return review
        ? withDiameterTransitionTechnicalReview(proposal, review)
        : proposal;
    });
  }, [diameterTransitionProposalReviews, rawDiameterTransitionProposals]);
  const routeTransitionResolutions = useMemo(() => {
    if (!technicalCalculationResult) {
      return {};
    }

    if (
      technicalCalculationResult.transitionAwareNetworkSizing?.status ===
      "resolved"
    ) {
      return technicalCalculationResult.transitionAwareNetworkSizing
        .routeTransitionResolutions;
    }

    const routeAccessoryResolutions =
      technicalCalculationResult.routeAccessoryResolutions;

    return Object.fromEntries(
      technicalCalculationResult.technicalRoutes.map((route) => [
        route.id,
        resolveTechnicalRouteTransitions({
          diameterBySegmentId: finalDiameterBySegmentId,
          equipment: planBase?.equipment ?? [],
          governingRouteAccessoryEquivalentLengthMeters:
            routeAccessoryResolutions[route.id]
              ?.governingRouteAccessoryEquivalentLengthMeters ?? null,
          includeBranchTransitions: true,
          network: planBase ? routeNetwork : undefined,
          pipeSystem: SIGAS_PIPE_SYSTEM,
          route,
          transitions: diameterTransitionProposals,
        }),
      ]),
    ) as Record<string, TechnicalRouteTransitionResolution>;
  }, [
    diameterTransitionProposals,
    finalDiameterBySegmentId,
    planBase?.id,
    planEquipment,
    routeNetwork,
    technicalCalculationResult,
  ]);
  const technicalPhysicalAccessoryInventory = useMemo(
    () =>
      createTechnicalPhysicalAccessoryInventory({
        accessoryProposals: routeAccessoryProposals,
        diameterTransitionProposals,
        result: technicalCalculationResult,
        routeTransitionResolutions,
      }),
    [
      diameterTransitionProposals,
      routeAccessoryProposals,
      routeTransitionResolutions,
      technicalCalculationResult,
    ],
  );
  const technicalEquivalentAccessoryVerificationBySegmentId = useMemo(
    () =>
      createTechnicalEquivalentAccessoryVerification({
        inventory: technicalPhysicalAccessoryInventory,
        pipeSystem: SIGAS_PIPE_SYSTEM,
        result: technicalCalculationResult,
      }),
    [technicalPhysicalAccessoryInventory, technicalCalculationResult],
  );
  const technicalAdoptedDiameterValidation = useMemo(
    () =>
      createTechnicalAdoptedDiameterValidation({
        decisions: planBase?.adoptedDiameterDecisions ?? [],
        equivalentVerificationBySegmentId:
          technicalEquivalentAccessoryVerificationBySegmentId,
        pipeSystem: SIGAS_PIPE_SYSTEM,
        result: technicalCalculationResult,
      }),
    [
      planBase?.adoptedDiameterDecisions,
      technicalCalculationResult,
      technicalEquivalentAccessoryVerificationBySegmentId,
    ],
  );
  const highlightedRouteSegmentIds = useMemo(
    () =>
      planBase
        ? relatedRouteSegmentIds({
            equipment: planEquipment,
            network: routeNetwork,
            result: technicalCalculationResult,
            selectedEquipmentId: planBase.selectedEquipmentId,
            selection: selectedRouteEdit,
          })
        : new Set<string>(),
    [
      planBase?.id,
      planBase?.selectedEquipmentId,
      planEquipment,
      routeNetwork,
      selectedRouteEdit,
      technicalCalculationResult,
    ],
  );

  useEffect(() => {
    if (!planBase) {
      return;
    }

    const reconciled = reconcileRouteAccessoryProposalState({
      decisions: planBase.routeAccessoryProposalDecisions,
      network: planBase.routeNetwork,
      proposals: routeAccessoryProposals,
    });

    if (
      reconciled.network === planBase.routeNetwork &&
      accessoryProposalDecisionsEqual(
        reconciled.decisions,
        planBase.routeAccessoryProposalDecisions,
      )
    ) {
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      routeAccessoryProposalDecisions: reconciled.decisions,
      routeNetwork: reconciled.network,
    }));
  }, [
    planBase?.id,
    planBase?.routeAccessoryProposalDecisions,
    routeAccessoryProposals,
    routeNetwork,
  ]);

  useEffect(() => {
    if (!planBase) {
      return;
    }

    const decisions = reconcileDiameterTransitionDecisions({
      decisions: planBase.diameterTransitionDecisions,
      proposals: rawDiameterTransitionProposals,
    });

    if (
      diameterTransitionDecisionsEqual(
        decisions,
        planBase.diameterTransitionDecisions,
      )
    ) {
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      diameterTransitionDecisions: decisions,
    }));
  }, [
    planBase?.diameterTransitionDecisions,
    planBase?.id,
    rawDiameterTransitionProposals,
  ]);

  const activePdfPage = useMemo(() => {
    return (
      pdfModel?.pages.find(
        (page) => page.pageNumber === activePdfPageNumber,
      ) ?? null
    );
  }, [activePdfPageNumber, pdfModel]);

  const activeCalibration = activeBase?.calibration ?? createInitialCalibrationState();
  const activeOverlay = useMemo(
    () => createOverlayData(activeCalibration),
    [activeCalibration],
  );
  const sectionNames = useMemo(
    () =>
      Object.fromEntries(
        bases
          .filter((base) => base.type === "section")
          .map((base) => [base.id, base.name]),
      ),
    [bases],
  );
  const planStageReadiness = useMemo(
    () =>
      createPlanStageReadiness({
        bases,
        sectionPlanLinks,
      }),
    [bases, sectionPlanLinks],
  );
  const activeSectionLink = useMemo(() => {
    if (activeBase?.type !== "section") {
      return null;
    }

    return (
      sectionPlanLinks.find((link) => link.sectionBaseId === activeBase.id) ??
      null
    );
  }, [activeBase, sectionPlanLinks]);
  const activeRegistrationSummary = useMemo(() => {
    if (!activeSectionLink || activeBase?.type !== "section") {
      return null;
    }

    return createSectionRegistrationSummary(activeSectionLink, planBase, activeBase);
  }, [activeBase, activeSectionLink, planBase]);
  const activeSectionScaleMetersPerSourceUnit = useMemo(
    () =>
      activeBase?.type === "section"
        ? calibrationScaleMetersPerSourceUnit(activeBase)
        : null,
    [activeBase?.calibration.calibration, activeBase?.id, activeBase?.type],
  );
  const activeSectionRouteProjection = useMemo(() => {
    if (!activeBase || activeBase.type !== "section" || !planBase) {
      return null;
    }

    if (activeBase.showRoute === false) {
      return null;
    }

    if (
      activeBase.sourceType === "pdf" &&
      activeSectionLink?.registration?.sectionPdfPageNumber &&
      activeSectionLink.registration.sectionPdfPageNumber !== activePdfPageNumber
    ) {
      return null;
    }

    return createSectionRouteProjection({
      adoptedDiameterValidation: technicalAdoptedDiameterValidation,
      equipment: planEquipment,
      inventory: technicalPhysicalAccessoryInventory,
      link: activeSectionLink,
      network: routeNetwork,
      result: technicalCalculationResult,
      sectionScaleMetersPerSourceUnit: activeSectionScaleMetersPerSourceUnit,
      toleranceSource: MIN_SECTION_LINK_LENGTH,
    });
  }, [
    activeBase?.id,
    activeBase?.showRoute,
    activeBase?.sourceType,
    activeBase?.type,
    activePdfPageNumber,
    activeSectionLink,
    activeSectionScaleMetersPerSourceUnit,
    planBase?.id,
    routeNetwork,
    technicalAdoptedDiameterValidation,
    technicalCalculationResult,
    technicalPhysicalAccessoryInventory,
  ]);
  const standardTechnicalSectionViews = useMemo(
    () => ({
      "section-aa": createStandardTechnicalSectionView({
        adoptedDiameterValidation: technicalAdoptedDiameterValidation,
        axis: "x",
        equipment: planEquipment,
        id: "section-aa",
        inventory: technicalPhysicalAccessoryInventory,
        network: routeNetwork,
        result: technicalCalculationResult,
        scaleMetersPerSourceUnit: planScaleMetersPerSourceUnit,
        title: "Corte A-A",
      }),
      "section-bb": createStandardTechnicalSectionView({
        adoptedDiameterValidation: technicalAdoptedDiameterValidation,
        axis: "y",
        equipment: planEquipment,
        id: "section-bb",
        inventory: technicalPhysicalAccessoryInventory,
        network: routeNetwork,
        result: technicalCalculationResult,
        scaleMetersPerSourceUnit: planScaleMetersPerSourceUnit,
        title: "Corte B-B",
      }),
    }),
    [
      planEquipment,
      planScaleMetersPerSourceUnit,
      routeNetwork,
      technicalAdoptedDiameterValidation,
      technicalCalculationResult,
      technicalPhysicalAccessoryInventory,
    ],
  );
  const standardTechnicalAxonometricView = useMemo(
    () =>
      createStandardTechnicalAxonometricView({
        adoptedDiameterValidation: technicalAdoptedDiameterValidation,
        equipment: planEquipment,
        inventory: technicalPhysicalAccessoryInventory,
        network: routeNetwork,
        result: technicalCalculationResult,
        scaleMetersPerSourceUnit: planScaleMetersPerSourceUnit,
      }),
    [
      planEquipment,
      planScaleMetersPerSourceUnit,
      routeNetwork,
      technicalAdoptedDiameterValidation,
      technicalCalculationResult,
      technicalPhysicalAccessoryInventory,
    ],
  );
  const selectedSectionRouteHeightTarget =
    activeMainStage === "review" || activeBase?.type === "section"
      ? sectionRouteHeightEditor?.target ?? null
      : null;
  const visiblePlanLinks = useMemo(() => {
    if (activeBase?.type !== "plan") {
      return [];
    }

    return sectionPlanLinks.filter((link) => {
      if (link.planBaseId !== activeBase.id) {
        return false;
      }

      if (activeBase.sourceType !== "pdf") {
        return true;
      }

      return link.pdfPageNumber === activePdfPageNumber;
    });
  }, [activeBase, activePdfPageNumber, sectionPlanLinks]);
  const sectionLinkMode: SectionLinkToolMode =
    sectionLinkDraft && activeBase?.id === sectionLinkDraft.planBaseId
      ? sectionLinkDraft.step
      : "inactive";
  const sectionRegistrationMode: SectionRegistrationToolMode =
    sectionRegistrationDraft &&
    activeBase?.id === sectionRegistrationDraft.sectionBaseId
      ? sectionRegistrationDraft.step
      : "inactive";
  const activeSectionRegistrationSavedOverlay =
    useMemo<SectionRegistrationSavedOverlay | null>(() => {
      if (
        !activeBase ||
        activeBase.type !== "section" ||
        !activeSectionLink?.registration
      ) {
        return null;
      }

      if (sectionRegistrationDraft?.editingLinkId === activeSectionLink.id) {
        return null;
      }

      if (
        activeBase.sourceType === "pdf" &&
        activeSectionLink.registration.sectionPdfPageNumber &&
        activeSectionLink.registration.sectionPdfPageNumber !== activePdfPageNumber
      ) {
        return null;
      }

      return {
        isHighlighted: activeSectionLink.id === highlightedRegistrationLinkId,
        linkId: activeSectionLink.id,
        registration: activeSectionLink.registration,
      };
    }, [
      activeBase,
      activePdfPageNumber,
      activeSectionLink,
      highlightedRegistrationLinkId,
      sectionRegistrationDraft?.editingLinkId,
    ]);
  const activeSectionLinkDraftOverlay = useMemo<SectionLinkDraftOverlay | null>(
    () => {
      if (!activeBase || activeBase.id !== sectionLinkDraft?.planBaseId) {
        return null;
      }

      if (
        activeBase.sourceType === "pdf" &&
        sectionLinkDraft.pdfPageNumber !== activePdfPageNumber
      ) {
        return null;
      }

      return {
        planStart: sectionLinkDraft.planStart,
        planEnd: sectionLinkDraft.planEnd,
        previewPoint: sectionLinkDraft.previewPoint,
        sectionName: sectionNames[sectionLinkDraft.sectionBaseId] ?? "Corte",
        viewSide: sectionLinkDraft.viewSide,
      };
    },
    [activeBase, activePdfPageNumber, sectionLinkDraft, sectionNames],
  );
  const activeSectionRegistrationDraftOverlay =
    useMemo<SectionRegistrationDraftOverlay | null>(() => {
      if (!activeBase || activeBase.id !== sectionRegistrationDraft?.sectionBaseId) {
        return null;
      }

      if (
        activeBase.sourceType === "pdf" &&
        sectionRegistrationDraft.sectionPdfPageNumber !== activePdfPageNumber
      ) {
        return null;
      }

      return {
        positiveZSide: sectionRegistrationDraft.positiveZSide,
        previewPoint: sectionRegistrationDraft.previewPoint,
        referenceElevationMeters:
          parseElevationInput(sectionRegistrationDraft.referenceElevationInput) ?? 0,
        sectionEnd: sectionRegistrationDraft.sectionEnd,
        sectionStart: sectionRegistrationDraft.sectionStart,
      };
    }, [activeBase, activePdfPageNumber, sectionRegistrationDraft]);

  useEffect(() => {
    const isInvalidForActiveBase =
      !activeBase ||
      (activeBase.type === "section" &&
        (activeRightPanelSection === "equipment" ||
          activeRightPanelSection === "route"));

    if (isInvalidForActiveBase && activeRightPanelSection !== "geometry") {
      setActiveRightPanelSection("geometry");
    }
  }, [activeBase, activeRightPanelSection]);

  useEffect(() => {
    if ((routeDraft || routeIntentDraft) && activeRightPanelSection !== "route") {
      setActiveRightPanelSection("route");
    }
  }, [activeRightPanelSection, routeDraft, routeIntentDraft]);

  useEffect(() => {
    if (activeMainStage === "review" && !canOpenReviewStage) {
      setActiveMainStage("route");
      setActiveRightPanelSection("route");
      setActiveReviewViewId("plan");
    }
  }, [activeMainStage, canOpenReviewStage]);

  useEffect(() => {
    if (activeMainStage !== "review" && activeReviewViewId !== "plan") {
      setActiveReviewViewId("plan");
    }
  }, [activeMainStage, activeReviewViewId]);

  useEffect(() => {
    if (
      activeMainStage === "review" &&
      planBase &&
      activeBase?.id !== planBase.id
    ) {
      setActiveBaseId(planBase.id);
    }
  }, [activeBase?.id, activeMainStage, planBase?.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "Escape" && routeDraft) {
        event.preventDefault();
        handleCancelRouteDraft();
        return;
      }

      if (event.key === "Escape" && routeIntentDraft) {
        event.preventDefault();
        handleCancelRouteIntentDraft();
        return;
      }

      if (event.key === "Backspace" && routeDraft) {
        event.preventDefault();

        if (routeDraft.step === "drawing") {
          handleUndoRoutePoint();
        }

        return;
      }

      if (event.key === "Escape" && equipmentDraft) {
        event.preventDefault();
        handleCancelEquipmentDraft();
        return;
      }

      if (event.key === "Escape" && sectionRegistrationDraft) {
        event.preventDefault();
        handleCancelSectionRegistrationDraft();
        return;
      }

      if (event.key === "Escape" && sectionLinkDraft) {
        event.preventDefault();
        handleCancelSectionLinkDraft();
        return;
      }

      if (event.key === "Escape" && activeBase?.constraintDraft) {
        event.preventDefault();
        handleCancelConstraintDraft();
      }

      if (event.key === "Enter" && activeBase?.constraintDraft) {
        event.preventDefault();
        handleFinishConstraintDraft();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeBase?.constraintDraft,
    equipmentDraft,
    routeDraft,
    routeIntentDraft,
    sectionLinkDraft,
    sectionRegistrationDraft,
  ]);

  async function handleBaseFileInput(
    event: React.ChangeEvent<HTMLInputElement>,
    purpose: BaseFilePurpose,
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      input.value = "";
      return;
    }

    input.value = "";
    await importFileAsBase(file, purpose);
  }

  async function importFileAsBase(file: File, purpose: BaseFilePurpose) {
    const sourceType = sourceTypeFromFile(file);

    if (!sourceType) {
      setSessionError("Seleccione un archivo .dxf o .pdf.");
      return;
    }

    const target = resolveBaseImportTarget(purpose);

    if (!target) {
      return;
    }

    if (target.confirmMessage && !window.confirm(target.confirmMessage)) {
      return;
    }

    setIsImporting(true);
    setSessionError(null);

    try {
      const nextBase = await createBaseFromFile({
        createdAt: target.createdAt,
        file,
        id: target.id,
        name: target.name,
        sourceType,
        type: target.type,
      });

      if (target.replaceBase) {
        cleanupBaseDocument(target.replaceBase);
      }

      setBases((current) => {
        if (!target.replaceBase) {
          return [...current, nextBase];
        }

        return current.map((base) =>
          base.id === target.replaceBase?.id ? nextBase : base,
        );
      });

      if (target.replaceBase?.type === "plan") {
        setSectionPlanLinks((current) =>
          current.filter((link) => link.planBaseId !== target.replaceBase?.id),
        );
        setSectionLinkDraft(null);
        setSectionRegistrationDraft(null);
        setEquipmentDraft(null);
        setRouteDraft(null);
        setRouteIntentDraft(null);
        setRouteProposal(null);
        setRouteProposalMode(null);
        setHighlightedSectionLinkId(null);
        setHighlightedRegistrationLinkId(null);
        setHoveredSectionLinkId(null);
        setHoveredEquipmentId(null);
        setEquipmentError(null);
        setRouteError(null);
      }

      if (target.replaceBase?.type === "section") {
        setSectionPlanLinks((current) =>
          current.map((link) =>
            link.sectionBaseId === target.replaceBase?.id
              ? { ...link, registration: undefined }
              : link,
          ),
        );
        setSectionRegistrationDraft((current) =>
          current?.sectionBaseId === target.replaceBase?.id ? null : current,
        );
        setHighlightedRegistrationLinkId(null);
      }

      setActiveBaseId(nextBase.id);
      setActiveMainStage("plan");
      setActiveRightPanelSection("geometry");
      setCursor(null);

      if (purpose === "section") {
        setNextSectionNumber((value) => value + 1);
      }
    } catch (caught) {
      setSessionError(
        caught instanceof Error
          ? caught.message
          : "No se pudo importar el archivo seleccionado.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  function resolveBaseImportTarget(purpose: BaseFilePurpose) {
    if (purpose === "replace-active") {
      if (!activeBase) {
        return null;
      }

      return {
        createdAt: activeBase.createdAt,
        confirmMessage: replacementConfirmationForBase(
          activeBase,
          sectionPlanLinks,
        ),
        id: activeBase.id,
        name: activeBase.name,
        replaceBase: activeBase,
        type: activeBase.type,
      };
    }

    if (purpose === "plan") {
      if (planBase) {
        return {
          createdAt: planBase.createdAt,
          confirmMessage: replacementConfirmationForBase(
            planBase,
            sectionPlanLinks,
          ),
          id: planBase.id,
          name: "Planta",
          replaceBase: planBase,
          type: "plan" as const,
        };
      }

      return {
        createdAt: Date.now(),
        confirmMessage: null,
        id: createBaseId("plan"),
        name: "Planta",
        replaceBase: null,
        type: "plan" as const,
      };
    }

    return {
      createdAt: Date.now(),
      confirmMessage: null,
      id: createBaseId("section"),
      name: `Corte ${nextSectionNumber}`,
      replaceBase: null,
      type: "section" as const,
    };
  }

  function handleActivateBase(baseId: string) {
    if (baseId === activeBaseId) {
      return;
    }

    setBases((current) =>
      current.map((base) =>
        base.id === activeBaseId || base.id === baseId
          ? cancelTransientState(base)
          : base,
      ),
    );
    setSectionLinkDraft(null);
    setSectionRegistrationDraft(null);
    setEquipmentDraft(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setIsRouteEditing(false);
    setSelectedRouteEdit(null);
    setEquipmentError(null);
    setRouteError(null);
    setHoveredEquipmentId(null);
    setActiveBaseId(baseId);
    setCursor(null);
  }

  function handleMainWorkflowStageChange(stage: MainWorkflowStageId) {
    if (!canOpenWorkflowStage(stage)) {
      const fallbackStage = fallbackWorkflowStage();

      setActiveMainStage(fallbackStage);
      setActiveRightPanelSection(MAIN_WORKFLOW_DEFAULT_PANEL[fallbackStage]);
      if (stage === "review") {
        setRouteError("Confirma un recorrido valido antes de revisar.");
      }
      return;
    }

    if (stage !== "review") {
      setSectionRouteHeightEditor(null);
      setActiveReviewViewId("plan");
    }

    if (stage !== "route") {
      setIsRouteEditing(false);
    }

    if (stage === "review") {
      setActiveReviewViewId("plan");
    }

    setActiveMainStage(stage);
    setActiveRightPanelSection(MAIN_WORKFLOW_DEFAULT_PANEL[stage]);

    if (stage !== "plan" && planBase) {
      handleActivateBase(planBase.id);
      if (stage === "review") {
        updateBase(planBase.id, (base) =>
          base.showEquipment && base.showRoute
            ? base
            : {
                ...base,
                showEquipment: true,
                showRoute: true,
              },
        );
      }
    }
  }

  function handleReviewViewOpen(viewId: StandardTechnicalReviewViewId) {
    if (!planBase) {
      return;
    }

    setActiveMainStage("review");
    setActiveRightPanelSection("review");
    setActiveReviewViewId(viewId);
    setSectionRouteHeightEditor(null);
    handleActivateBase(planBase.id);
    updateBase(planBase.id, (base) =>
      base.showEquipment && base.showRoute
        ? base
        : {
            ...base,
            showEquipment: true,
            showRoute: true,
          },
    );
  }

  function handleContinueToCalculateFromReview() {
    if (!canOpenReviewStage) {
      setActiveMainStage("route");
      setActiveRightPanelSection("route");
      setRouteError("Confirma un recorrido valido antes de calcular.");
      return;
    }

    handleMainWorkflowStageChange("calculate");
  }

  function handleOpenPlanStageScale(baseId: string | null, startCalibration = true) {
    if (!baseId) {
      return;
    }

    setActiveMainStage("plan");
    setActiveRightPanelSection("scale");
    handleActivateBase(baseId);
    if (!startCalibration) {
      return;
    }

    setSectionRegistrationDraft(null);
    setEquipmentDraft(null);
    setEquipmentError(null);
    setRouteDraft(null);
    setRouteProposal(null);
    setRouteError(null);
    updateBase(baseId, (base) =>
      updateCalibrationForBase(base, (state) => ({
        ...state,
        toolMode: "calibrate",
        draft: {
          ...state.draft,
          points: [],
        },
        measurementPoints: [],
        error: null,
      })),
    );
  }

  function handlePlanStageSectionAction(sectionBaseId: string | null) {
    if (!sectionBaseId) {
      return;
    }

    const section = bases.find(
      (base) => base.id === sectionBaseId && base.type === "section",
    );

    if (!section) {
      return;
    }

    if (!calibrationScaleMetersPerSourceUnit(section)) {
      handleOpenPlanStageScale(section.id);
      return;
    }

    const link =
      sectionPlanLinks.find((item) => item.sectionBaseId === section.id) ??
      null;

    if (!link || !link.registration) {
      if (!link) {
        handleStartSectionLink(section.id);
        return;
      }

      handleStartSectionRegistration(link);
      return;
    }

    handleStartSectionRegistration(link, true);
  }

  function handlePlanStageContinue() {
    handleMainWorkflowStageChange("equipment");
  }

  function handleRemoveActiveBase() {
    if (!activeBase) {
      return;
    }

    const confirmMessage = removalConfirmationForBase(
      activeBase,
      sectionPlanLinks,
    );

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    cleanupBaseDocument(activeBase);

    const remainingBases = bases.filter((base) => base.id !== activeBase.id);
    setBases(remainingBases);
    setSectionPlanLinks((current) =>
      current.filter(
        (link) =>
          link.planBaseId !== activeBase.id &&
          link.sectionBaseId !== activeBase.id,
      ),
    );
    setSectionLinkDraft((current) =>
      current?.planBaseId === activeBase.id ||
      current?.sectionBaseId === activeBase.id
        ? null
        : current,
    );
    setSectionRegistrationDraft((current) =>
      current?.planBaseId === activeBase.id ||
      current?.sectionBaseId === activeBase.id
        ? null
        : current,
    );
    setEquipmentDraft((current) =>
      current?.planBaseId === activeBase.id ? null : current,
    );
    setRouteDraft((current) =>
      current?.planBaseId === activeBase.id ? null : current,
    );
    setRouteIntentDraft((current) =>
      current?.planBaseId === activeBase.id ? null : current,
    );
    setRouteProposal((current) =>
      current?.baseId === activeBase.id ? null : current,
    );
    setSelectedRouteEdit(null);
    if (routeProposal?.baseId === activeBase.id) {
      setRouteProposalMode(null);
    }
    setIsRouteEditing(false);
    setHighlightedSectionLinkId(null);
    setHighlightedRegistrationLinkId(null);
    setHoveredSectionLinkId(null);
    setHoveredEquipmentId(null);
    setEquipmentError(null);
    setRouteError(null);
    setActiveBaseId(
      remainingBases.find((base) => base.type === "plan")?.id ??
        remainingBases[0]?.id ??
        null,
    );
    setActiveRightPanelSection("geometry");
    setCursor(null);
  }

  function handleResetLocalProject() {
    if (
      (bases.length > 0 || sectionPlanLinks.length > 0 || routeProposal) &&
      !window.confirm(
        "Borrar el proyecto local guardado y volver al estado inicial?",
      )
    ) {
      return;
    }

    for (const base of basesRef.current) {
      cleanupBaseDocument(base);
    }

    const result = clearPersistedWorkbenchProject();

    setBases([]);
    setActiveBaseId(null);
    setNextSectionNumber(1);
    setSectionPlanLinks([]);
    setSectionLinkDraft(null);
    setSectionRegistrationDraft(null);
    setEquipmentDraft(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setIsRouteEditing(false);
    setRouteProposalMarginInput(DEFAULT_ROUTE_PROPOSAL_MARGIN_INPUT);
    setActiveMainStage("plan");
    setActiveRightPanelSection("geometry");
    setHighlightedSectionLinkId(null);
    setHighlightedRegistrationLinkId(null);
    setHoveredSectionLinkId(null);
    setHoveredEquipmentId(null);
    setEquipmentError(null);
    setRouteError(null);
    setCursor(null);
    setSessionError(null);
    setPersistenceNotice(
      result.ok
        ? {
            message: "Proyecto local restablecido.",
            tone: "info",
          }
        : {
            message: `No se pudo borrar el proyecto local. ${result.error}`,
            tone: "error",
          },
    );
  }

  function updateActiveBase(
    updater: (base: WorkbenchBase) => WorkbenchBase,
  ) {
    if (!activeBaseId) {
      return;
    }

    updateBase(activeBaseId, updater);
  }

  function updateBase(
    baseId: string,
    updater: (base: WorkbenchBase) => WorkbenchBase,
  ) {
    setBases((current) => {
      let didChange = false;
      const nextBases = current.map((base) => {
        if (base.id !== baseId) {
          return base;
        }

        const nextBase = updater(base);
        didChange = didChange || nextBase !== base;
        return nextBase;
      });

      return didChange ? nextBases : current;
    });
  }

  function handleStartSectionLink(sectionBaseId: string, edit = false) {
    setActiveRightPanelSection("geometry");

    if (!planBase) {
      setSessionError("Agregue una Planta antes de vincular un Corte.");
      return;
    }

    const section = bases.find(
      (base) => base.id === sectionBaseId && base.type === "section",
    );

    if (!section) {
      return;
    }

    const existingLink =
      sectionPlanLinks.find((link) => link.sectionBaseId === sectionBaseId) ??
      null;
    const pdfPageNumber =
      planBase.sourceType === "pdf"
        ? existingLink?.pdfPageNumber ?? planBase.visual.activePdfPageNumber
        : undefined;

    setBases((current) =>
      current.map((base) => {
        const cancelled = cancelTransientState(base);

        if (
          cancelled.id === planBase.id &&
          cancelled.sourceType === "pdf" &&
          pdfPageNumber
        ) {
          return {
            ...cancelled,
            visual: {
              ...cancelled.visual,
              activePdfPageNumber: pdfPageNumber,
            },
          };
        }

        return cancelled;
      }),
    );
    setSectionLinkDraft({
      editingLinkId: edit ? existingLink?.id ?? null : null,
      pdfPageNumber,
      planBaseId: planBase.id,
      planEnd: null,
      planStart: null,
      previewPoint: null,
      sectionBaseId,
      step: "start",
      viewSide: null,
    });
    setSectionRegistrationDraft(null);
    setSectionRouteHeightEditor(null);
    setEquipmentDraft(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setEquipmentError(null);
    setRouteError(null);
    setActiveBaseId(planBase.id);
    setHighlightedSectionLinkId(existingLink?.id ?? null);
    setHoveredSectionLinkId(null);
    setSessionError(null);
    setCursor(null);
  }

  function handleCancelSectionLinkDraft() {
    setSectionLinkDraft(null);
    setHighlightedSectionLinkId(null);
    setCursor(null);
  }

  function handleSectionLinkPoint(point: Point2D) {
    setSectionLinkDraft((current) => {
      if (!current) {
        return current;
      }

      if (current.step === "start") {
        return {
          ...current,
          planStart: point,
          planEnd: null,
          previewPoint: point,
          step: "end",
          viewSide: null,
        };
      }

      if (current.step === "end" && current.planStart) {
        if (!isValidSectionLinkLine(current.planStart, point)) {
          setSessionError("La linea de corte necesita dos puntos separados.");
          return current;
        }

        setSessionError(null);
        return {
          ...current,
          planEnd: point,
          previewPoint: null,
          step: "side",
          viewSide: null,
        };
      }

      return current;
    });
  }

  function handleSectionLinkPreview(point: Point2D | null) {
    setSectionLinkDraft((current) =>
      current?.step === "end"
        ? {
            ...current,
            previewPoint: point,
          }
        : current,
    );
  }

  function handleSectionLinkSide(side: SectionViewSide) {
    setSectionLinkDraft((current) =>
      current?.step === "side"
        ? {
            ...current,
            viewSide: side,
          }
        : current,
    );
  }

  function handleSaveSectionLink() {
    if (
      !sectionLinkDraft?.planStart ||
      !sectionLinkDraft.planEnd ||
      !sectionLinkDraft.viewSide ||
      !isValidSectionLinkLine(sectionLinkDraft.planStart, sectionLinkDraft.planEnd)
    ) {
      setSessionError("Complete la linea y el sentido antes de guardar.");
      return;
    }

    const linkId =
      sectionLinkDraft.editingLinkId ??
      `section-link:${sectionLinkDraft.sectionBaseId}:${Date.now()}`;
    const existingLink =
      sectionPlanLinks.find((link) => link.id === linkId) ??
      sectionPlanLinks.find(
        (link) => link.sectionBaseId === sectionLinkDraft.sectionBaseId,
      ) ??
      null;
    const planEndpointsChanged =
      existingLink &&
      !sectionLinkPlanEndpointsEqual(existingLink, {
        planStart: sectionLinkDraft.planStart,
        planEnd: sectionLinkDraft.planEnd,
      });

    if (existingLink?.registration && planEndpointsChanged) {
      const shouldInvalidate = window.confirm(
        "Cambiar los extremos A/B del vinculo invalida la correspondencia del Corte. Continuar?",
      );

      if (!shouldInvalidate) {
        return;
      }
    }

    const nextLink: SectionPlanLink = {
      id: linkId,
      planBaseId: sectionLinkDraft.planBaseId,
      sectionBaseId: sectionLinkDraft.sectionBaseId,
      planStart: sectionLinkDraft.planStart,
      planEnd: sectionLinkDraft.planEnd,
      viewSide: sectionLinkDraft.viewSide,
      pdfPageNumber: sectionLinkDraft.pdfPageNumber,
      registration: planEndpointsChanged
        ? undefined
        : existingLink?.registration,
    };

    setSectionPlanLinks((current) => [
      ...current.filter(
        (link) =>
          link.id !== linkId &&
          link.sectionBaseId !== sectionLinkDraft.sectionBaseId,
      ),
      nextLink,
    ]);
    setSectionLinkDraft(null);
    setSectionRegistrationDraft(null);
    setSessionError(null);
    highlightSectionLink(linkId);
  }

  function handleViewSectionLinkInPlan(link: SectionPlanLink) {
    const plan = bases.find((base) => base.id === link.planBaseId);

    if (!plan) {
      return;
    }

    setBases((current) =>
      current.map((base) => {
        const cancelled =
          base.id === activeBaseId || base.id === plan.id
            ? cancelTransientState(base)
            : base;

        if (cancelled.id !== plan.id) {
          return cancelled;
        }

        return focusPlanLinkIfNeeded(cancelled, link);
      }),
    );
    setActiveBaseId(plan.id);
    setSectionLinkDraft(null);
    setSectionRegistrationDraft(null);
    setEquipmentDraft(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setEquipmentError(null);
    setRouteError(null);
    setCursor(null);
    highlightSectionLink(link.id);
  }

  function handleUnlinkSection(sectionBaseId: string) {
    const link = sectionPlanLinks.find(
      (item) => item.sectionBaseId === sectionBaseId,
    );

    if (!link) {
      return;
    }

    if (!window.confirm("Desvincular este Corte de la Planta?")) {
      return;
    }

    setSectionPlanLinks((current) =>
      current.filter((item) => item.sectionBaseId !== sectionBaseId),
    );
    setSectionLinkDraft((current) =>
      current?.sectionBaseId === sectionBaseId ? null : current,
    );
    setSectionRegistrationDraft((current) =>
      current?.sectionBaseId === sectionBaseId ? null : current,
    );
    setEquipmentDraft(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setEquipmentError(null);
    setRouteError(null);
    setHighlightedSectionLinkId(null);
    setHighlightedRegistrationLinkId(null);
    setHoveredSectionLinkId(null);
  }

  function handleOpenSectionFromLink(sectionBaseId: string) {
    handleActivateBase(sectionBaseId);
  }

  function handleStartSectionRegistration(link: SectionPlanLink, edit = false) {
    setActiveRightPanelSection("geometry");

    const section = bases.find(
      (base) => base.id === link.sectionBaseId && base.type === "section",
    );

    if (!section) {
      return;
    }

    const registration = edit ? link.registration ?? null : null;
    const sectionPdfPageNumber =
      section.sourceType === "pdf"
        ? registration?.sectionPdfPageNumber ?? section.visual.activePdfPageNumber
        : undefined;

    setBases((current) =>
      current.map((base) => {
        const cancelled = cancelTransientState(base);

        if (
          cancelled.id === section.id &&
          cancelled.sourceType === "pdf" &&
          sectionPdfPageNumber
        ) {
          return {
            ...cancelled,
            visual: {
              ...cancelled.visual,
              activePdfPageNumber: sectionPdfPageNumber,
            },
          };
        }

        return cancelled;
      }),
    );
    setSectionRegistrationDraft({
      editingLinkId: link.id,
      planBaseId: link.planBaseId,
      positiveZSide: registration?.positiveZSide ?? null,
      previewPoint: null,
      referenceElevationInput: formatElevationInputForEdit(
        registration?.referenceElevationMeters ?? 0,
      ),
      sectionBaseId: link.sectionBaseId,
      sectionEnd: registration?.sectionEnd ?? null,
      sectionPdfPageNumber,
      sectionStart: registration?.sectionStart ?? null,
      step: "start",
    });
    setSectionLinkDraft(null);
    setSectionRouteHeightEditor(null);
    setEquipmentDraft(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setEquipmentError(null);
    setRouteError(null);
    setActiveBaseId(section.id);
    setHighlightedRegistrationLinkId(registration ? link.id : null);
    setSessionError(null);
    setCursor(null);
  }

  function handleCancelSectionRegistrationDraft() {
    setSectionRegistrationDraft(null);
    setHighlightedRegistrationLinkId(null);
    setCursor(null);
  }

  function handleSectionRegistrationPoint(point: Point2D) {
    const current = sectionRegistrationDraft;

    if (!current) {
      return;
    }

    if (current.step === "start") {
      setSectionRegistrationDraft({
        ...current,
        positiveZSide: null,
        previewPoint: point,
        sectionEnd: null,
        sectionStart: point,
        step: "end",
      });
      setSessionError(null);
      return;
    }

    if (current.step === "end" && current.sectionStart) {
      if (!isValidSectionRegistrationSegment(current.sectionStart, point)) {
        setSessionError("La correspondencia necesita dos puntos separados.");
        return;
      }

      setSectionRegistrationDraft({
        ...current,
        positiveZSide: null,
        previewPoint: null,
        sectionEnd: point,
        step: "side",
      });
      setSessionError(null);
    }
  }

  function handleSectionRegistrationPreview(point: Point2D | null) {
    setSectionRegistrationDraft((current) =>
      current?.step === "end"
        ? {
            ...current,
            previewPoint: point,
          }
        : current,
    );
  }

  function handleSectionRegistrationSide(side: SectionViewSide) {
    setSectionRegistrationDraft((current) =>
      current?.sectionStart && current.sectionEnd
        ? {
            ...current,
            positiveZSide: side,
            step: "elevation",
          }
        : current,
    );
  }

  function handleReferenceElevationChange(value: string) {
    setSectionRegistrationDraft((current) =>
      current
        ? {
            ...current,
            referenceElevationInput: value,
          }
        : current,
    );
  }

  function handleSaveSectionRegistration() {
    if (
      !sectionRegistrationDraft?.sectionStart ||
      !sectionRegistrationDraft.sectionEnd ||
      !sectionRegistrationDraft.positiveZSide ||
      !isValidSectionRegistrationSegment(
        sectionRegistrationDraft.sectionStart,
        sectionRegistrationDraft.sectionEnd,
      )
    ) {
      setSessionError("Complete A, B y +Z antes de guardar.");
      return;
    }

    const referenceElevationMeters = parseElevationInput(
      sectionRegistrationDraft.referenceElevationInput,
    );

    if (referenceElevationMeters === null) {
      setSessionError("Ingrese una cota de referencia valida.");
      return;
    }

    const registration: SectionRegistration = {
      positiveZSide: sectionRegistrationDraft.positiveZSide,
      referenceElevationMeters,
      sectionEnd: sectionRegistrationDraft.sectionEnd,
      sectionPdfPageNumber: sectionRegistrationDraft.sectionPdfPageNumber,
      sectionStart: sectionRegistrationDraft.sectionStart,
    };

    setSectionPlanLinks((current) =>
      current.map((link) =>
        link.id === sectionRegistrationDraft.editingLinkId
          ? {
              ...link,
              registration,
            }
          : link,
      ),
    );
    setSectionRegistrationDraft(null);
    setSessionError(null);
    highlightRegistration(sectionRegistrationDraft.editingLinkId);
  }

  function handleSectionRouteHeightTargetSelect(
    target: SectionRouteHeightTarget,
    currentHeightMeters: number,
  ) {
    const canEditHeight =
      activeMainStage === "review" &&
      (activeReviewViewId !== "plan" || activeBase?.type === "section");

    if (!canEditHeight) {
      return;
    }

    setActiveRightPanelSection("review");
    setSectionRouteHeightEditor({
      error: null,
      heightInput: formatElevationInputForEdit(currentHeightMeters),
      heightMeters: currentHeightMeters,
      target,
    });
    setSectionLinkDraft(null);
    setSectionRegistrationDraft(null);
    setEquipmentDraft(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setEquipmentError(null);
    setRouteError(null);
    setSessionError(null);
  }

  function handleSectionRouteHeightInputChange(value: string) {
    setSectionRouteHeightEditor((current) => {
      if (!current) {
        return current;
      }

      const parsed = parseElevationInput(value);

      return {
        ...current,
        error: null,
        heightInput: value,
        heightMeters: parsed ?? current.heightMeters,
      };
    });
  }

  function handleCancelSectionRouteHeightEdit() {
    setSectionRouteHeightEditor(null);
  }

  function handleSaveSectionRouteHeightEdit() {
    const current = sectionRouteHeightEditor;

    if (!current) {
      return;
    }

    if (!planBase) {
      setSectionRouteHeightEditor({
        ...current,
        error: "Falta planta confirmada para editar la cota.",
      });
      return;
    }

    const heightMeters = parseElevationInput(current.heightInput);

    if (heightMeters === null) {
      setSectionRouteHeightEditor({
        ...current,
        error: "Ingrese una cota valida en metros.",
      });
      return;
    }

    const result = applySectionRouteHeightEdit({
      equipment: planBase.equipment,
      heightMeters,
      network: planBase.routeNetwork,
      scaleMetersPerSourceUnit: calibrationScaleMetersPerSourceUnit(planBase),
      target: current.target,
    });

    if (!result.ok) {
      setSectionRouteHeightEditor({
        ...current,
        error: result.message,
      });
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      equipment: result.equipment,
      routeNetwork: result.network,
      showEquipment: true,
      showRoute: true,
    }));
    setSectionRouteHeightEditor({
      error: null,
      heightInput: formatElevationInputForEdit(heightMeters),
      heightMeters,
      target: current.target,
    });
    setRouteProposal(null);
    setRouteProposalMode(null);
    setRouteError(null);
  }

  function handleGoToPlanForEquipment() {
    setActiveRightPanelSection("equipment");

    if (!planBase) {
      return;
    }

    handleActivateBase(planBase.id);
  }

  function handleGoToEquipmentFromCalculation() {
    setActiveMainStage("equipment");
    setActiveRightPanelSection("equipment");

    if (!planBase) {
      return;
    }

    handleActivateBase(planBase.id);
  }

  function handleShowEquipmentChange(show: boolean) {
    if (!planBase) {
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      showEquipment: show,
    }));
  }

  function handleStartSupplyPlacement() {
    setActiveRightPanelSection("equipment");

    if (!planBase) {
      setEquipmentError("Agregue una Planta antes de colocar equipos.");
      return;
    }

    if (activeBase?.type !== "plan") {
      setEquipmentError("Los equipos se colocan en la Planta");
      return;
    }

    const existingSupply =
      planBase.equipment.find((item) => item.role === "supply") ?? null;

    if (existingSupply) {
      selectEquipmentOnPlan(existingSupply.id);
      setEquipmentError("Ya existe un punto de alimentación");
      return;
    }

    startEquipmentDraft({
      editingEquipmentId: null,
      planBaseId: planBase.id,
      pdfPageNumber:
        planBase.sourceType === "pdf"
          ? planBase.visual.activePdfPageNumber
          : undefined,
      role: "supply",
      type: "meter_regulator",
      name: "Medidor/regulador",
      bodyPoint: null,
      connectionPoint: null,
      connectionHeightInput: "0",
      previewPoint: null,
      terminalConfig: null,
      terminalLateralOffsetInput: "0",
      wallAnchor: null,
      demandValueInput: "",
      demandUnit: DEFAULT_DEMAND_UNIT,
      notes: "",
      step: "placing",
      error: null,
    });
  }

  function handleStartApplianceDraft() {
    setActiveRightPanelSection("equipment");

    if (!planBase) {
      setEquipmentError("Agregue una Planta antes de colocar equipos.");
      return;
    }

    if (activeBase?.type !== "plan") {
      setEquipmentError("Los equipos se colocan en la Planta");
      return;
    }

    const type: EquipmentType = "stove";
    const terminalConfig = createSuggestedEquipmentTerminalConfig(type);
    startEquipmentDraft({
      editingEquipmentId: null,
      planBaseId: planBase.id,
      pdfPageNumber:
        planBase.sourceType === "pdf"
          ? planBase.visual.activePdfPageNumber
          : undefined,
      role: "appliance",
      type,
      name: suggestEquipmentName(type, planBase.equipment),
      bodyPoint: null,
      connectionPoint: null,
      connectionHeightInput: formatHeightInput(
        terminalConfig.connectionHeightMeters ?? 0,
      ),
      previewPoint: null,
      terminalConfig,
      terminalLateralOffsetInput: formatHeightInput(
        terminalConfig.lateralOffsetMeters,
      ),
      wallAnchor: null,
      demandValueInput: "",
      demandUnit: DEFAULT_DEMAND_UNIT,
      notes: "",
      step: "details",
      error: null,
    });
  }

  function startEquipmentDraft(draft: EquipmentDraft) {
    setActiveRightPanelSection("equipment");
    setBases((current) =>
      current.map((base) =>
        base.id === draft.planBaseId
          ? {
              ...cancelTransientState(base),
              selectedEquipmentId: draft.editingEquipmentId,
              showEquipment: true,
            }
          : base,
      ),
    );
    setSectionLinkDraft(null);
    setSectionRegistrationDraft(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setEquipmentDraft(draft);
    setSectionRouteHeightEditor(null);
    setEquipmentError(null);
    setRouteError(null);
    setSessionError(null);
    setHoveredEquipmentId(null);
    setActiveBaseId(draft.planBaseId);
    setCursor(null);
  }

  function handleCancelEquipmentDraft() {
    setEquipmentDraft(null);
    setEquipmentError(null);
    setCursor(null);
  }

  function handleEquipmentDraftNameChange(value: string) {
    updateEquipmentDraft({ name: value, error: null });
  }

  function handleEquipmentDraftDemandValueChange(value: string) {
    updateEquipmentDraft({ demandValueInput: value, error: null });
  }

  function handleEquipmentDraftDemandUnitChange(unit: DemandUnit) {
    updateEquipmentDraft({ demandUnit: unit, error: null });
  }

  function handleEquipmentDraftConnectionHeightChange(value: string) {
    setEquipmentDraft((current) => {
      if (!current) {
        return current;
      }

      const parsedHeight = parseConnectionHeightInput(value);
      const patch = {
        connectionHeightInput: value,
        error: null,
      };

      if (!parsedHeight.ok) {
        return {
          ...current,
          ...patch,
        };
      }

      const terminalConfig =
        current.role === "appliance"
          ? {
              ...draftTerminalConfig(current),
              connectionHeightMeters: parsedHeight.heightMeters,
              heightStatus: "suggested" as const,
            }
          : null;
      const pointHeightMeters =
        terminalConfig
          ? terminalEndHeightMeters(terminalConfig) ?? parsedHeight.heightMeters
          : parsedHeight.heightMeters;

      return {
        ...current,
        ...patch,
        connectionPoint: current.connectionPoint
          ? withPointZ(current.connectionPoint, pointHeightMeters)
          : null,
        bodyPoint: current.bodyPoint
          ? withPointZ(current.bodyPoint, pointHeightMeters)
          : null,
        previewPoint: current.previewPoint
          ? withPointZ(current.previewPoint, pointHeightMeters)
          : null,
        terminalConfig,
        wallAnchor: withEquipmentWallAnchorZ(
          current.wallAnchor,
          pointHeightMeters,
        ),
      };
    });
  }

  function handleEquipmentDraftTerminalOutletSideChange(
    outletSide: EquipmentTerminalOutletSide,
  ) {
    setEquipmentDraft((current) =>
      current?.role === "appliance"
        ? {
            ...current,
            terminalConfig: {
              ...draftTerminalConfig(current),
              outletSide,
            },
            error: null,
          }
        : current,
    );
  }

  function handleEquipmentDraftTerminalLateralOffsetChange(value: string) {
    setEquipmentDraft((current) => {
      if (!current || current.role !== "appliance") {
        return current;
      }

      const parsedOffset = parseTerminalLateralOffsetInput(value);

      return {
        ...current,
        terminalLateralOffsetInput: value,
        terminalConfig: parsedOffset.ok
          ? {
              ...draftTerminalConfig(current),
              lateralOffsetMeters: parsedOffset.offsetMeters,
            }
          : current.terminalConfig,
        error: null,
      };
    });
  }

  function handleConfirmEquipmentDraftTerminalConfig() {
    setEquipmentDraft((current) => {
      if (!current || current.role !== "appliance") {
        return current;
      }

      const parsedHeight = parseConnectionHeightInput(
        current.connectionHeightInput,
      );

      if (!parsedHeight.ok) {
        return {
          ...current,
          error: parsedHeight.message,
        };
      }

      const parsedOffset = parseTerminalLateralOffsetInput(
        current.terminalLateralOffsetInput,
      );

      if (!parsedOffset.ok) {
        return {
          ...current,
          error: parsedOffset.message,
        };
      }

      return {
        ...current,
        terminalConfig: confirmEquipmentTerminalConfig({
          ...draftTerminalConfig(current),
          connectionHeightMeters: parsedHeight.heightMeters,
          lateralOffsetMeters: parsedOffset.offsetMeters,
        }),
        error: null,
      };
    });
  }

  function handleEquipmentDraftNotesChange(value: string) {
    updateEquipmentDraft({ notes: value, error: null });
  }

  function handleEquipmentDraftTypeChange(type: EquipmentType) {
    setEquipmentDraft((current) => {
      if (!current || current.editingEquipmentId || current.role !== "appliance") {
        return current;
      }

      const previousSuggestion = suggestEquipmentName(
        current.type,
        planEquipment,
      );
      const shouldReplaceName =
        current.name.trim().length === 0 || current.name === previousSuggestion;
      const terminalConfig = createSuggestedEquipmentTerminalConfig(type);
      const heightMeters =
        terminalEndHeightMeters(terminalConfig) ??
        terminalConfig.connectionHeightMeters ??
        0;

      return {
        ...current,
        type,
        name: shouldReplaceName
          ? suggestEquipmentName(type, planEquipment)
          : current.name,
        connectionHeightInput: formatHeightInput(heightMeters),
        connectionPoint: current.connectionPoint
          ? withPointZ(current.connectionPoint, heightMeters)
          : null,
        bodyPoint: current.bodyPoint
          ? withPointZ(current.bodyPoint, heightMeters)
          : null,
        previewPoint: current.previewPoint
          ? withPointZ(current.previewPoint, heightMeters)
          : null,
        terminalConfig,
        terminalLateralOffsetInput: formatHeightInput(
          terminalConfig.lateralOffsetMeters,
        ),
        wallAnchor: withEquipmentWallAnchorZ(current.wallAnchor, heightMeters),
        wallAlternatives: current.wallAlternatives?.map((alternative) =>
          withWallPlacementAlternativeZ(alternative, heightMeters),
        ),
        error: null,
      };
    });
  }

  function updateEquipmentDraft(patch: Partial<EquipmentDraft>) {
    setEquipmentDraft((current) =>
      current
        ? {
            ...current,
            ...patch,
          }
        : current,
    );
  }

  function handleBeginEquipmentPlacement() {
    setActiveRightPanelSection("equipment");

    if (!equipmentDraft) {
      return;
    }

    const plan = bases.find((base) => base.id === equipmentDraft.planBaseId);

    if (!plan || plan.type !== "plan") {
      setEquipmentDraft((current) =>
        current
          ? {
              ...current,
              error: "Agregue una Planta antes de colocar equipos.",
            }
          : current,
      );
      return;
    }

    setBases((current) =>
      current.map((base) =>
        base.id === plan.id
          ? {
              ...cancelTransientState(base),
              selectedEquipmentId: equipmentDraft.editingEquipmentId,
              showEquipment: true,
            }
          : base,
      ),
    );
    setSectionLinkDraft(null);
    setSectionRegistrationDraft(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setEquipmentDraft((current) =>
      current
        ? {
            ...current,
            step: "placing",
            bodyPoint:
              current.bodyPoint ?? current.connectionPoint ?? current.previewPoint,
            connectionPoint: null,
            previewPoint: current.connectionPoint ?? current.previewPoint,
            error: null,
          }
        : current,
    );
    setEquipmentError(null);
    setRouteError(null);
    setActiveBaseId(plan.id);
    setCursor(null);
  }

  function handleEquipmentPreview(point: Point2D | null) {
    setEquipmentDraft((current) =>
      current?.step === "placing"
        ? {
            ...current,
            ...(point
              ? equipmentDraftPlacementPatch(current, point)
              : {
                  bodyPoint: null,
                  connectionPoint: null,
                  previewPoint: null,
                  wallAnchor: null,
                  wallAlternatives: undefined,
                  selectedWallAlternativeIndex: undefined,
                }),
          }
        : current,
    );
  }

  function handleEquipmentPoint(point: Point2D) {
    setEquipmentDraft((current) => {
      if (current?.step !== "placing") {
        return current;
      }

      const patch = equipmentDraftPlacementPatch(current, point, true);

      return {
        ...current,
        ...patch,
        step: patch.connectionPoint ? "review" : "placing",
        error:
          patch.connectionPoint || current.role === "supply"
            ? null
            : "No encontre una pared valida cerca del click.",
      };
    });
    setEquipmentError(null);
  }

  function equipmentDraftPlacementPatch(
    draft: EquipmentDraft,
    point: Point2D,
    commitConnection = false,
  ): Pick<
    EquipmentDraft,
    | "bodyPoint"
    | "connectionPoint"
    | "previewPoint"
    | "selectedWallAlternativeIndex"
    | "terminalConfig"
    | "terminalLateralOffsetInput"
    | "wallAlternatives"
    | "wallAnchor"
  > {
    const plan =
      bases.find((base) => base.id === draft.planBaseId && base.type === "plan") ??
      null;

    if (draft.role === "appliance") {
      const alternatives = resolveDraftEquipmentWallAlternatives(draft, point, plan);
      const [placement] = alternatives;

      if (!placement) {
        return {
          bodyPoint: null,
          connectionPoint: null,
          previewPoint: null,
          selectedWallAlternativeIndex: undefined,
          terminalConfig: draft.terminalConfig,
          terminalLateralOffsetInput: draft.terminalLateralOffsetInput,
          wallAlternatives: undefined,
          wallAnchor: null,
        };
      }

      const terminalConfig = withAutomaticTerminalSide(
        draftTerminalConfig(draft),
        placement,
        point,
        plan,
      );

      return {
        bodyPoint: placement.bodyPoint,
        connectionPoint: commitConnection ? placement.connectionPoint : null,
        previewPoint: placement.connectionPoint,
        selectedWallAlternativeIndex: 0,
        terminalConfig,
        terminalLateralOffsetInput: formatHeightInput(
          terminalConfig.lateralOffsetMeters,
        ),
        wallAlternatives: alternatives,
        wallAnchor: placement.wallAnchor,
      };
    }

    const placement = resolveDraftEquipmentPhysicalPlacement(draft, point, plan);

    return {
      bodyPoint: placement.bodyPoint,
      connectionPoint: commitConnection ? placement.connectionPoint : null,
      previewPoint: placement.connectionPoint,
      selectedWallAlternativeIndex: undefined,
      terminalConfig: draft.terminalConfig,
      terminalLateralOffsetInput: draft.terminalLateralOffsetInput,
      wallAlternatives: undefined,
      wallAnchor: placement.wallAnchor,
    };
  }

  function handleEquipmentDraftWallAlternativeSelect(index: number) {
    setEquipmentDraft((current) => {
      if (!current || current.role !== "appliance") {
        return current;
      }

      const alternative = current.wallAlternatives?.[index];

      if (!alternative) {
        return current;
      }

      const plan =
        bases.find(
          (base) => base.id === current.planBaseId && base.type === "plan",
        ) ?? null;
      const terminalConfig = withAutomaticTerminalSide(
        draftTerminalConfig(current),
        alternative,
        current.previewPoint ?? alternative.connectionPoint,
        plan,
      );

      return {
        ...current,
        bodyPoint: alternative.bodyPoint,
        connectionPoint: current.connectionPoint
          ? alternative.connectionPoint
          : current.connectionPoint,
        previewPoint: alternative.connectionPoint,
        selectedWallAlternativeIndex: index,
        terminalConfig,
        terminalLateralOffsetInput: formatHeightInput(
          terminalConfig.lateralOffsetMeters,
        ),
        wallAnchor: alternative.wallAnchor,
        error: null,
      };
    });
  }

  function handleInvertEquipmentDraftTerminalSide() {
    setEquipmentDraft((current) => {
      if (!current || current.role !== "appliance") {
        return current;
      }

      const config = draftTerminalConfig(current);
      const outletSide =
        config.outletSide === "left"
          ? "right"
          : config.outletSide === "right"
            ? "left"
            : config.lateralOffsetMeters > 0
              ? "left"
              : "direct";

      return {
        ...current,
        terminalConfig: {
          ...config,
          outletSide,
        },
        error: null,
      };
    });
  }

  function handleSaveEquipmentDraft() {
    const current = equipmentDraft;

    if (!current) {
      return;
    }

    const plan = bases.find(
      (base) => base.id === current.planBaseId && base.type === "plan",
    );

    if (!plan) {
      setEquipmentDraft({
        ...current,
        error: "Agregue una Planta antes de colocar equipos.",
      });
      return;
    }

    const validation = validateEquipmentDraft(current, plan);

    if (!validation.ok) {
      setEquipmentDraft({
        ...current,
        error: validation.message,
      });
      return;
    }

    const equipmentId =
      current.editingEquipmentId ??
      `equipment:${current.planBaseId}:${Date.now().toString(36)}`;
    const nextEquipment: WorkbenchEquipment = {
      id: equipmentId,
      planBaseId: current.planBaseId,
      pdfPageNumber: current.pdfPageNumber,
      role: current.role,
      type: current.type,
      name: current.name.trim(),
      bodyPoint: validation.bodyPoint,
      connectionPoint: validation.connectionPoint,
      terminalConfig: validation.terminalConfig,
      wallAnchor: validation.wallAnchor,
      demandValue: validation.demandValue,
      demandUnit: validation.demandUnit,
      notes: current.notes.trim() ? current.notes.trim() : undefined,
      source: "manual",
    };
    const previousEquipment =
      plan.equipment.find((item) => item.id === equipmentId) ?? null;
    const locationChanged =
      previousEquipment &&
      !pointAlmostEqual(
        previousEquipment.connectionPoint,
        nextEquipment.connectionPoint,
        MIN_SECTION_LINK_LENGTH,
      );
    let nextRouteNetwork = plan.routeNetwork;

    if (
      previousEquipment &&
      locationChanged &&
      previousEquipment.role === "supply" &&
      plan.routeNetwork.segments.length > 0
    ) {
      if (
        !window.confirm(
          "Reubicar la alimentación eliminará la red completa. Continuar?",
        )
      ) {
        return;
      }

      nextRouteNetwork = createEmptyRouteNetwork();
    }

    if (
      previousEquipment &&
      locationChanged &&
      previousEquipment.role === "appliance" &&
      connectedApplianceIds.has(previousEquipment.id)
    ) {
      if (
        !window.confirm(
          `Reubicar ${previousEquipment.name} eliminará su conexión. Continuar?`,
        )
      ) {
        return;
      }

      nextRouteNetwork = removeApplianceBranch(
        nextRouteNetwork,
        previousEquipment.id,
      );
    }

    const nextEquipmentList = [
      ...plan.equipment.filter((item) => item.id !== equipmentId),
      nextEquipment,
    ].sort(compareEquipment);
    const terminalRoutes = ensureEquipmentTerminalRoutes(
      plan,
      nextEquipmentList,
      nextRouteNetwork,
    );

    if (!terminalRoutes.ok) {
      setEquipmentDraft({
        ...current,
        error: terminalRoutes.message,
      });
      setEquipmentError(terminalRoutes.message);
      return;
    }

    nextRouteNetwork = terminalRoutes.network;

    updateBase(plan.id, (base) => {
      return {
        ...base,
        equipment: nextEquipmentList,
        routeNetwork: nextRouteNetwork,
        selectedEquipmentId: equipmentId,
        showEquipment: true,
        showRoute: true,
      };
    });
    setEquipmentDraft(null);
    setEquipmentError(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setSelectedRouteEdit(null);
    setRouteError(null);
    setHoveredEquipmentId(null);
    setCursor(null);
  }

  function handleSelectEquipment(equipmentId: string) {
    setActiveRightPanelSection("equipment");
    selectEquipmentOnPlan(equipmentId);
  }

  function selectEquipmentOnPlan(equipmentId: string) {
    if (!planBase) {
      return;
    }

    setEquipmentDraft(null);
    setEquipmentError(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteError(null);
    setSectionRouteHeightEditor(null);
    setSelectedRouteEdit(null);
    updateBase(planBase.id, (base) => ({
      ...base,
      selectedEquipmentId: equipmentId,
      showEquipment: true,
    }));

    if (activeBaseId !== planBase.id) {
      setActiveBaseId(planBase.id);
      setSectionLinkDraft(null);
      setSectionRegistrationDraft(null);
      setCursor(null);
    }
  }

  function handleEditSelectedEquipment() {
    if (!selectedEquipment || !planBase) {
      return;
    }

    startEquipmentDraft(createDraftFromEquipment(selectedEquipment, "details"));
  }

  function handleRelocateSelectedEquipment() {
    if (!selectedEquipment || !planBase) {
      return;
    }

    startEquipmentDraft({
      ...createDraftFromEquipment(selectedEquipment, "placing"),
      bodyPoint: selectedEquipment.bodyPoint ?? selectedEquipment.connectionPoint,
      connectionPoint: null,
      previewPoint: selectedEquipment.connectionPoint,
      wallAnchor: selectedEquipment.wallAnchor ?? null,
    });
  }

  function handleDeleteSelectedEquipment() {
    setActiveRightPanelSection("equipment");

    if (!selectedEquipment || !planBase) {
      return;
    }

    const message =
      selectedEquipment.role === "supply"
        ? planBase.routeNetwork.segments.length > 0
          ? `Eliminar ${selectedEquipment.name}? El proyecto quedara sin punto de alimentacion y se eliminara la red completa`
          : `Eliminar ${selectedEquipment.name}? El proyecto quedara sin punto de alimentacion`
        : `Eliminar ${selectedEquipment.name}?`;

    if (!window.confirm(message)) {
      return;
    }

    const nextEquipmentList = planBase.equipment.filter(
      (item) => item.id !== selectedEquipment.id,
    );
    const routeNetwork =
      selectedEquipment.role === "supply"
        ? createRouteNetworkWithEquipmentTerminals(planBase, nextEquipmentList)
        : {
            network: removeApplianceBranch(
              planBase.routeNetwork,
              selectedEquipment.id,
            ),
            ok: true as const,
          };

    if (!routeNetwork.ok) {
      setEquipmentError(routeNetwork.message);
      return;
    }

    updateBase(planBase.id, (base) => {
      return {
        ...base,
        equipment: nextEquipmentList,
        routeIntentConnections: base.routeIntentConnections.filter(
          (connection) =>
            !routeIntentConnectionReferencesEquipment(
              connection,
              selectedEquipment.id,
            ),
        ),
        routeNetwork: routeNetwork.network,
        selectedEquipmentId: null,
        showRoute: true,
      };
    });
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setSelectedRouteEdit(null);
    setEquipmentError(null);
    setRouteError(null);
  }

  function handleGoToPlanForRoute() {
    setActiveRightPanelSection("route");

    if (!planBase) {
      return;
    }

    handleActivateBase(planBase.id);
  }

  function handleEnterRouteEditing() {
    setActiveRightPanelSection("route");
    setIsRouteEditing(true);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setSelectedRouteEdit(null);
    setRouteError(null);

    if (planBase) {
      updateBase(planBase.id, (base) =>
        base.showRoute
          ? base
          : {
              ...base,
              showRoute: true,
            },
      );
    }
  }

  function handleExitRouteEditing() {
    setIsRouteEditing(false);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setSelectedRouteEdit(null);
    setRouteError(null);
    setCursor(null);

    if (planBase) {
      updateBase(planBase.id, (base) =>
        base.showRoute
          ? base
          : {
              ...base,
              showRoute: true,
            },
      );
    }
  }

  function handleShowRouteChange(show: boolean) {
    if (!planBase) {
      return;
    }

    if (!show) {
      setSelectedRouteEdit(null);
    }

    updateBase(planBase.id, (base) =>
      base.showRoute === show
        ? base
        : {
            ...base,
            showRoute: show,
          },
    );
  }

  function handleSelectPhysicalRouteElement(selection: PhysicalRouteEditSelection) {
    setActiveRightPanelSection(activeMainStage === "review" ? "review" : "route");
    setSelectedRouteEdit(selection);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setSectionRouteHeightEditor(null);
    setRouteError(null);

    if (!planBase) {
      return;
    }

    updateBase(planBase.id, (base) => {
      const selectedEquipmentId =
        selection.kind === "terminal" ? selection.equipmentId : null;

      if (base.selectedEquipmentId === selectedEquipmentId && base.showRoute) {
        return base;
      }

      return {
        ...base,
        selectedEquipmentId,
        showRoute: true,
      };
    });
  }

  function handleClearPhysicalRouteSelection() {
    setSelectedRouteEdit(null);
    setRouteError(null);
  }

  function handleRouteSnapOptionChange(
    option: keyof PhysicalRouteSnapOptions,
    enabled: boolean,
  ) {
    setRouteSnapOptions((current) =>
      current[option] === enabled
        ? current
        : {
            ...current,
            [option]: enabled,
          },
    );
  }

  function handleMovePhysicalRouteNode(
    nodeId: string,
    point: Point2D,
    tolerance: number,
  ) {
    const selection: PhysicalRouteEditSelection = {
      kind: "node",
      nodeId,
    };
    const plan = planBase;

    if (!plan || activeBase?.type !== "plan") {
      return;
    }

    const snapped = snapPhysicalRoutePoint(plan, selection, point, tolerance);
    const result = movePhysicalRouteNode({
      equipment: plan.equipment,
      network: plan.routeNetwork,
      nodeId,
      point: snapped,
      tolerance,
    });

    commitPhysicalRouteEdit(plan, result, selection);
  }

  function handleMovePhysicalRouteVertex(
    segmentId: string,
    vertexIndex: number,
    point: Point2D,
    tolerance: number,
  ) {
    const selection: PhysicalRouteEditSelection = {
      kind: "vertex",
      segmentId,
      vertexIndex,
    };
    const plan = planBase;

    if (!plan || activeBase?.type !== "plan") {
      return;
    }

    const snapped = snapPhysicalRoutePoint(plan, selection, point, tolerance);
    const result = movePhysicalRouteVertex({
      network: plan.routeNetwork,
      point: snapped,
      segmentId,
      vertexIndex,
    });

    commitPhysicalRouteEdit(plan, result, selection);
  }

  function handleInsertPhysicalRouteVertex(
    segmentId: string,
    point: Point2D,
    tolerance: number,
  ) {
    const selection: PhysicalRouteEditSelection = {
      kind: "segment",
      segmentId,
    };
    const plan = planBase;

    if (!plan || activeBase?.type !== "plan") {
      return;
    }

    const snapped = snapPhysicalRoutePoint(plan, selection, point, tolerance);
    const result = insertPhysicalRouteVertex({
      equipment: plan.equipment,
      network: plan.routeNetwork,
      point: snapped,
      segmentId,
      tolerance,
    });

    commitPhysicalRouteEdit(
      plan,
      result,
      result.ok
        ? {
            kind: "vertex",
            segmentId,
            vertexIndex: result.vertexIndex ?? 0,
          }
        : selection,
    );
  }

  function handleDeleteSelectedPhysicalRouteVertex() {
    if (!planBase || selectedRouteEdit?.kind !== "vertex") {
      return;
    }

    const result = removePhysicalRouteVertex({
      network: planBase.routeNetwork,
      segmentId: selectedRouteEdit.segmentId,
      vertexIndex: selectedRouteEdit.vertexIndex,
    });

    commitPhysicalRouteEdit(planBase, result, {
      kind: "segment",
      segmentId: selectedRouteEdit.segmentId,
    });
  }

  function snapPhysicalRoutePoint(
    plan: WorkbenchBase,
    selection: PhysicalRouteEditSelection,
    point: Point2D,
    tolerance: number,
  ) {
    return snapPhysicalRouteEditPoint({
      constraints: activeBase?.type === "plan" ? activeConstraints : [],
      equipment: plan.equipment,
      movingSelection: selection,
      network: plan.routeNetwork,
      options: routeSnapOptions,
      point,
      tolerance,
    });
  }

  function commitPhysicalRouteEdit(
    plan: WorkbenchBase,
    result: ReturnType<typeof movePhysicalRouteNode>,
    selection: PhysicalRouteEditSelection,
  ) {
    setActiveRightPanelSection(activeMainStage === "review" ? "review" : "route");
    setSelectedRouteEdit(selection);

    if (!result.ok) {
      setRouteError(result.message);
      return;
    }

    const validation = validatePhysicalRouteEdit(
      plan,
      result.network,
      planClassificationIndex,
    );

    if (!validation.ok) {
      setRouteError(validation.message);
      return;
    }

    updateBase(plan.id, (base) => ({
      ...base,
      routeNetwork: result.network,
      showRoute: true,
    }));
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setSectionRouteHeightEditor(null);
    setRouteError(null);
  }

  function handleStartRouteConnection() {
    setActiveRightPanelSection("route");
    setIsRouteEditing(true);

    if (!planBase) {
      setRouteError("Agregue una Planta antes de trazar la red.");
      return;
    }

    if (activeBase?.type !== "plan") {
      setRouteError("El trazado se edita en la Planta");
      return;
    }

    if (supplyCount !== 1) {
      setRouteError("Coloque un unico medidor/regulador antes de trazar.");
      return;
    }

    if (applianceEquipment.length === 0) {
      setRouteError("Coloque al menos un artefacto antes de trazar.");
      return;
    }

    setBases((current) =>
      current.map((base) =>
        base.id === planBase.id
          ? {
              ...cancelTransientState(base),
              selectedEquipmentId: null,
              showEquipment: true,
              showRoute: true,
            }
          : base,
      ),
    );
    setSectionLinkDraft(null);
    setSectionRegistrationDraft(null);
    setSectionRouteHeightEditor(null);
    setEquipmentDraft(null);
    setRouteDraft(null);
    setEquipmentError(null);
    setSelectedRouteEdit(null);
    setRouteIntentDraft({
      planBaseId: planBase.id,
      pdfPageNumber:
        planBase.sourceType === "pdf"
          ? planBase.visual.activePdfPageNumber
          : undefined,
      from: null,
      previewPoint: null,
      step: "from",
      to: null,
      error: null,
    });
    setRouteError(null);
    setActiveBaseId(planBase.id);
    setCursor(null);
  }

  function handleSelectRouteDraftTarget(equipmentId: string) {
    setActiveRightPanelSection("route");

    const current = routeDraft;

    if (!current || !planBase) {
      return;
    }

    const equipment = planBase.equipment.find(
      (item) => item.id === equipmentId && item.role === "appliance",
    );

    if (!equipment) {
      return;
    }

    const connected = getConnectedApplianceEquipmentIds(
      planBase.routeNetwork,
      planBase.equipment,
    );

    if (connected.has(equipment.id)) {
      setRouteDraft({ ...current, error: "Ese artefacto ya esta conectado." });
      setRouteError("Ese artefacto ya esta conectado.");
      return;
    }

    const supply = planBase.equipment.find((item) => item.role === "supply");

    if (
      planBase.sourceType === "pdf" &&
      supply?.pdfPageNumber &&
      equipment.pdfPageNumber &&
      supply.pdfPageNumber !== equipment.pdfPageNumber
    ) {
      const message =
        "La alimentacion y el artefacto deben estar en la misma pagina PDF.";
      setRouteDraft({ ...current, error: message });
      setRouteError(message);
      return;
    }

    if (planBase.sourceType === "pdf" && equipment.pdfPageNumber) {
      updateBase(planBase.id, (base) => ({
        ...base,
        visual: {
          ...base.visual,
          activePdfPageNumber: equipment.pdfPageNumber ?? base.visual.activePdfPageNumber,
          pdfFitNonce: base.visual.pdfFitNonce + 1,
        },
      }));
    }

    setRouteDraft({
      ...current,
      targetEquipmentId: equipment.id,
      pdfPageNumber:
        planBase.sourceType === "pdf" ? equipment.pdfPageNumber : undefined,
      originNodeId: null,
      originPoint: null,
      originIntentEquipmentId: null,
      originSplitSegmentId: null,
      routePoints: [],
      previewPoint: null,
      step: "origin",
      error: null,
    });
    setRouteError(null);
  }

  function handleCancelRouteDraft() {
    setRouteDraft(null);
    setRouteError(null);
    setSelectedRouteEdit(null);
    setCursor(null);
  }

  function handleUndoRoutePoint() {
    setRouteDraft((current) =>
      current?.step === "drawing"
        ? {
            ...current,
            routePoints: current.routePoints.slice(0, -1),
            previewPoint: null,
            error: null,
          }
        : current,
    );
    setRouteError(null);
  }

  function handleBackRouteDraft() {
    setRouteDraft((current) =>
      current?.step === "review"
        ? {
            ...current,
            previewPoint: null,
            step: "drawing",
            error: null,
          }
        : current,
    );
    setRouteError(null);
  }

  function handleRouteIntentPreview(point: Point2D | null) {
    setRouteIntentDraft((current) =>
      current?.step === "to"
        ? {
            ...current,
            previewPoint: point,
          }
        : current,
    );
  }

  function handleRouteIntentPoint(
    point: Point2D,
    tolerance: number,
    equipmentId?: string,
  ) {
    const current = routeIntentDraft;

    if (!current) {
      return;
    }

    const plan = bases.find(
      (base) => base.id === current.planBaseId && base.type === "plan",
    );

    if (!plan) {
      setRouteIntentDraft({
        ...current,
        error: "Agregue una Planta antes de conectar.",
      });
      setRouteError("Agregue una Planta antes de conectar.");
      return;
    }

    const endpoint = findRouteIntentEndpointAtPoint(
      plan,
      point,
      tolerance,
      equipmentId,
    );

    if (!endpoint) {
      const message = "Elegi la alimentacion o un artefacto.";
      setRouteIntentDraft({
        ...current,
        error: message,
      });
      setRouteError(message);
      return;
    }

    if (current.step === "from") {
      setRouteIntentDraft({
        ...current,
        error: null,
        from: endpoint,
        previewPoint: null,
        step: "to",
        to: null,
      });
      setRouteError(null);
      return;
    }

    if (current.step !== "to" || !current.from) {
      return;
    }

    const validation = validateRouteIntentEndpoints(
      plan,
      current.from,
      endpoint,
    );

    if (!validation.ok) {
      setRouteIntentDraft({
        ...current,
        error: validation.message,
        previewPoint: null,
      });
      setRouteError(validation.message);
      return;
    }

    setRouteIntentDraft({
      ...current,
      error: null,
      previewPoint: null,
      step: "review",
      to: endpoint,
    });
    setRouteError(null);
  }

  function handleCancelRouteIntentDraft() {
    setRouteIntentDraft(null);
    setRouteError(null);
    setCursor(null);
  }

  function handleSaveRouteIntentDraft() {
    const current = routeIntentDraft;

    if (!current || current.step !== "review" || !current.from || !current.to) {
      return;
    }

    const plan = bases.find(
      (base) => base.id === current.planBaseId && base.type === "plan",
    );

    if (!plan) {
      setRouteError("Agregue una Planta antes de conectar.");
      return;
    }

    const validation = validateRouteIntentEndpoints(plan, current.from, current.to);

    if (!validation.ok) {
      setRouteIntentDraft({
        ...current,
        error: validation.message,
      });
      setRouteError(validation.message);
      return;
    }

    const intentId = createRouteIntentConnectionId(plan.id);
    const nextConnection: RouteIntentConnection = {
      createdAt: Date.now(),
      from: current.from,
      id: intentId,
      origin: "manual",
      pdfPageNumber: current.pdfPageNumber,
      planBaseId: plan.id,
      to: current.to,
    };

    updateBase(plan.id, (base) => ({
      ...base,
      routeIntentConnections: [
        ...base.routeIntentConnections,
        nextConnection,
      ],
      showRoute: true,
    }));
    setRouteIntentDraft(null);
    setRouteError(null);
    setCursor(null);
  }

  function handleRoutePreview(point: Point2D | null, tolerance: number | null) {
    if (routeIntentDraft) {
      handleRouteIntentPreview(point);
      return;
    }

    const current = routeDraft;

    if (!current || current.step !== "drawing") {
      return;
    }

    if (!point || tolerance === null) {
      setRouteDraft({
        ...current,
        previewPoint: null,
      });
      return;
    }

    const plan = bases.find(
      (base) => base.id === current.planBaseId && base.type === "plan",
    );
    const from = lastRouteDraftPoint(current);

    if (!plan || !from) {
      return;
    }

    const targetPoint = findRouteTargetAtPoint(plan, current, point, tolerance);
    const to = targetPoint ?? point;

    if (pointAlmostEqual(from, to, tolerance)) {
      setRouteDraft({
        ...current,
        previewPoint: null,
        error: null,
      });
      setRouteError(null);
      return;
    }

    const validation = validateDraftSegment(
      plan,
      planClassificationIndex,
      current,
      from,
      to,
      tolerance,
      Boolean(targetPoint),
    );

    setRouteDraft({
      ...current,
      previewPoint: to,
      error: validation.ok ? null : validation.message,
    });
    setRouteError(validation.ok ? null : validation.message);
  }

  function handleRoutePoint(
    point: Point2D,
    tolerance: number,
    equipmentId?: string,
  ) {
    if (routeIntentDraft) {
      handleRouteIntentPoint(point, tolerance, equipmentId);
      return;
    }

    const current = routeDraft;

    if (!current) {
      return;
    }

    const plan = bases.find(
      (base) => base.id === current.planBaseId && base.type === "plan",
    );

    if (!plan) {
      setRouteDraft({
        ...current,
        error: "Agregue una Planta antes de trazar la red.",
      });
      setRouteError("Agregue una Planta antes de trazar la red.");
      return;
    }

    if (current.step === "origin") {
      const originResult = findRouteOriginAtPoint(plan, point, tolerance);

      if (!originResult.ok) {
        setRouteDraft({
          ...current,
          error: originResult.message,
        });
        setRouteError(originResult.message);
        return;
      }

      const origin = originResult.hit;
      setRouteDraft({
        ...current,
        originNodeId: origin.nodeId,
        originPoint: origin.point,
        originIntentEquipmentId: origin.intentEquipmentId,
        originSplitSegmentId: origin.splitSegmentId,
        routePoints: [],
        previewPoint: null,
        step: "drawing",
        error: null,
      });
      setRouteError(null);
      return;
    }

    if (current.step !== "drawing") {
      return;
    }

    const from = lastRouteDraftPoint(current);

    if (!from) {
      return;
    }

    const targetPoint = findRouteTargetAtPoint(plan, current, point, tolerance);

    if (targetPoint) {
      if (pointAlmostEqual(from, targetPoint, tolerance)) {
        const message =
          "El destino coincide con el ultimo punto del recorrido.";
        setRouteDraft({
          ...current,
          previewPoint: targetPoint,
          error: message,
        });
        setRouteError(message);
        return;
      }

      const validation = validateDraftSegment(
        plan,
        planClassificationIndex,
        current,
        from,
        targetPoint,
        tolerance,
        true,
      );

      if (!validation.ok) {
        setRouteDraft({
          ...current,
          previewPoint: targetPoint,
          error: validation.message,
        });
        setRouteError(validation.message);
        return;
      }

      setRouteDraft({
        ...current,
        previewPoint: null,
        step: "review",
        error: null,
      });
      setRouteError(null);
      return;
    }

    if (pointAlmostEqual(from, point, tolerance)) {
      setRouteDraft({
        ...current,
        previewPoint: null,
        error: null,
      });
      setRouteError(null);
      return;
    }

    const validation = validateDraftSegment(
      plan,
      planClassificationIndex,
      current,
      from,
      point,
      tolerance,
      false,
    );

    if (!validation.ok) {
      setRouteDraft({
        ...current,
        previewPoint: point,
        error: validation.message,
      });
      setRouteError(validation.message);
      return;
    }

    setRouteDraft({
      ...current,
      routePoints: [...current.routePoints, point],
      previewPoint: point,
      error: null,
    });
    setRouteError(null);
  }

  function handleSaveRouteDraft() {
    const current = routeDraft;

    if (!current || current.step !== "review") {
      return;
    }

    if (current.error) {
      setRouteError(current.error);
      return;
    }

    const plan = bases.find(
      (base) => base.id === current.planBaseId && base.type === "plan",
    );

    if (!plan) {
      setRouteError("Agregue una Planta antes de trazar la red.");
      return;
    }

    const pathValidation = validateRouteDraftForSave(
      plan,
      planClassificationIndex,
      current,
    );

    if (!pathValidation.ok) {
      setRouteDraft({
        ...current,
        error: pathValidation.message,
      });
      setRouteError(pathValidation.message);
      return;
    }

    const result = appendRouteDraftToNetwork(plan, current);

    if (!result.ok) {
      setRouteDraft({
        ...current,
        error: result.message,
      });
      setRouteError(result.message);
      return;
    }

    updateBase(plan.id, (base) => ({
      ...base,
      routeNetwork: result.network,
      selectedEquipmentId: current.targetEquipmentId,
      showRoute: true,
    }));
    setRouteDraft(null);
    setRouteError(null);
    setCursor(null);
  }

  function handleDisconnectRouteAppliance(equipmentId: string) {
    setActiveRightPanelSection("route");

    if (!planBase) {
      return;
    }

    const terminalRoutes = ensureEquipmentTerminalRoutes(
      planBase,
      planBase.equipment,
      removeApplianceBranch(planBase.routeNetwork, equipmentId),
    );

    if (!terminalRoutes.ok) {
      setRouteError(terminalRoutes.message);
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      routeNetwork: terminalRoutes.network,
      selectedEquipmentId:
        base.selectedEquipmentId === equipmentId ? null : base.selectedEquipmentId,
      showRoute: true,
    }));
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setSelectedRouteEdit(null);
    setRouteError(null);
  }

  function handleClearRouteNetwork() {
    setActiveRightPanelSection("route");

    if (!planBase || planBase.routeNetwork.segments.length === 0) {
      return;
    }

    if (!window.confirm("Borrar toda la red de trazado?")) {
      return;
    }

    const terminalRoutes = createRouteNetworkWithEquipmentTerminals(
      planBase,
      planBase.equipment,
    );

    if (!terminalRoutes.ok) {
      setRouteError(terminalRoutes.message);
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      routeNetwork: terminalRoutes.network,
      showRoute: true,
    }));
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setSelectedRouteEdit(null);
    setRouteError(null);
  }

  function handleDeleteRouteIntentConnection(connectionId: string) {
    setActiveRightPanelSection("route");

    if (!planBase) {
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      routeIntentConnections: base.routeIntentConnections.filter(
        (connection) => connection.id !== connectionId,
      ),
      showRoute: true,
    }));
    setRouteIntentDraft(null);
    setRouteError(null);
  }

  function handleClearRouteIntentConnections() {
    setActiveRightPanelSection("route");

    if (!planBase || planBase.routeIntentConnections.length === 0) {
      return;
    }

    if (!window.confirm("Borrar todas las conexiones manuales?")) {
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      routeIntentConnections: [],
      showRoute: true,
    }));
    setRouteIntentDraft(null);
    setRouteError(null);
  }

  function handleRouteProposalMarginChange(value: string) {
    setRouteProposalMarginInput(value);
  }

  function handleGoToScaleForRouteProposal() {
    setActiveRightPanelSection("scale");
    setIsRouteEditing(false);

    if (planBase && activeBaseId !== planBase.id) {
      handleActivateBase(planBase.id);
    }
  }

  function handleInterpretRouteIntentConnections() {
    setActiveRightPanelSection("route");

    if (isRouteProposalGenerating) {
      return;
    }

    if (!planBase) {
      setRouteError("Agregue una Planta antes de interpretar el trazado.");
      return;
    }

    if (activeBase?.type !== "plan") {
      setRouteError("La interpretacion se genera en la Planta.");
      return;
    }

    if (planBase.routeIntentConnections.length === 0) {
      setRouteError("Dibuja al menos una conexion manual para interpretar.");
      return;
    }

    if (supplyCount !== 1) {
      setRouteError("Coloque un unico medidor/regulador antes de interpretar.");
      return;
    }

    if (applianceEquipment.length === 0) {
      setRouteError("Coloque al menos un artefacto antes de interpretar.");
      return;
    }

    if (!planBase.calibration.calibration) {
      setRouteError("Podes dibujar conexiones. Confirma la escala para interpretar el trazado.");
      return;
    }

    if (routeProposalMarginMeters === null || !routeIntentProposalFingerprint) {
      setRouteError("El margen geometrico debe ser un numero mayor o igual a cero.");
      return;
    }

    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteError(null);
    setIsRouteEditing(false);
    setIsRouteProposalGenerating(true);
    updateBase(planBase.id, (base) =>
      base.showRoute
        ? base
        : {
            ...base,
            showRoute: true,
          },
    );

    window.setTimeout(() => {
      const plan = basesRef.current.find(
        (base) => base.id === planBase.id && base.type === "plan",
      );

      if (!plan || !plan.calibration.calibration) {
        setRouteError("Confirma la escala de la Planta.");
        setIsRouteProposalGenerating(false);
        return;
      }

      const terminalRoutes = ensureEquipmentTerminalRoutes(
        plan,
        plan.equipment,
        plan.routeNetwork,
      );

      if (!terminalRoutes.ok) {
        setRouteError(terminalRoutes.message);
        setIsRouteProposalGenerating(false);
        return;
      }

      const proposalPageNumber = routeProposalPdfPageNumber(plan);
      const proposal = buildProposalFromIntent({
        baseNetwork: terminalRoutes.network,
        bounds: routeSourceBounds(plan),
        equipment: plan.equipment,
        fingerprint: createRouteIntentProposalFingerprint(
          plan,
          planClassificationIndex,
          routeProposalMarginMeters,
        ),
        intentConnections: plan.routeIntentConnections,
        marginMeters: routeProposalMarginMeters,
        minSegmentLengthSource: MIN_SECTION_LINK_LENGTH,
        pdfPageNumber: proposalPageNumber,
        planBaseId: plan.id,
        restrictions: createAutomaticRouteRestrictions(
          plan,
          planClassificationIndex,
          proposalPageNumber,
        ),
        scaleMetersPerSourceUnit: calibrationScaleMetersPerSourceUnit(plan) ?? 0,
      });

      setRouteProposal(proposal);
      setRouteProposalMode("intent");
      setRouteError(
        proposal.unreachedEquipmentIds.length > 0
          ? "No se encontro un recorrido sin atravesar restricciones."
          : null,
      );
      setIsRouteProposalGenerating(false);
    }, 0);
  }

  function handleGenerateRouteProposal() {
    setActiveRightPanelSection("route");

    if (isRouteProposalGenerating) {
      return;
    }

    if (!planBase) {
      setRouteError("Agregue una Planta antes de generar una propuesta.");
      return;
    }

    if (activeBase?.type !== "plan") {
      setRouteError("La propuesta se genera en la Planta.");
      return;
    }

    if (supplyCount !== 1) {
      setRouteError("Coloque un unico medidor/regulador antes de generar.");
      return;
    }

    if (applianceEquipment.length === 0) {
      setRouteError("Coloque al menos un artefacto antes de generar.");
      return;
    }

    if (!planBase.calibration.calibration) {
      setRouteError("Confirma la escala de la Planta.");
      return;
    }

    if (routeProposalMarginMeters === null || !routeProposalFingerprint) {
      setRouteError("El margen geometrico debe ser un numero mayor o igual a cero.");
      return;
    }

    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteError(null);
    setIsRouteEditing(false);
    setIsRouteProposalGenerating(true);
    updateBase(planBase.id, (base) =>
      base.showRoute
        ? base
        : {
            ...base,
            showRoute: true,
          },
    );

    window.setTimeout(() => {
      const plan = basesRef.current.find(
        (base) => base.id === planBase.id && base.type === "plan",
      );

      if (!plan || !plan.calibration.calibration) {
        setRouteError("Confirma la escala de la Planta.");
        setIsRouteProposalGenerating(false);
        return;
      }

      const terminalRoutes = ensureEquipmentTerminalRoutes(
        plan,
        plan.equipment,
        plan.routeNetwork,
      );

      if (!terminalRoutes.ok) {
        setRouteError(terminalRoutes.message);
        setIsRouteProposalGenerating(false);
        return;
      }

      const proposalPageNumber = routeProposalPdfPageNumber(plan);
      const proposal = generateAutomaticRouteProposal({
        baseNetwork: terminalRoutes.network,
        bounds: routeSourceBounds(plan),
        equipment: plan.equipment,
        fingerprint: createRouteProposalFingerprint(
          plan,
          planClassificationIndex,
          routeProposalMarginMeters,
        ),
        marginMeters: routeProposalMarginMeters,
        minSegmentLengthSource: MIN_SECTION_LINK_LENGTH,
        pdfPageNumber: proposalPageNumber,
        planBaseId: plan.id,
        restrictions: createAutomaticRouteRestrictions(
          plan,
          planClassificationIndex,
          proposalPageNumber,
        ),
        scaleMetersPerSourceUnit: calibrationScaleMetersPerSourceUnit(plan) ?? 0,
      });

      setRouteProposal(proposal);
      setRouteProposalMode("automatic");
      setRouteError(
        proposal.unreachedEquipmentIds.length > 0
          ? "No se encontro un recorrido sin atravesar restricciones."
          : null,
      );
      setIsRouteProposalGenerating(false);
    }, 0);
  }

  function handleDiscardRouteProposal() {
    setRouteProposal(null);
    setRouteProposalMode(null);
    setIsRouteEditing(false);
    setRouteError(null);
  }

  function handleRegenerateRouteProposal() {
    if (routeProposalMode === "intent") {
      handleInterpretRouteIntentConnections();
      return;
    }

    handleGenerateRouteProposal();
  }

  function handleContinueToReviewFromRoute() {
    if (!canOpenReviewStage) {
      setActiveRightPanelSection("route");
      setRouteError("Confirma un recorrido valido antes de revisar.");
      return;
    }

    handleMainWorkflowStageChange("review");
  }

  function handleEditConfirmedRoute() {
    handleEnterRouteEditing();

    setRouteProposal(null);
    setRouteProposalMode(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setSelectedRouteEdit(null);
    setRouteError(null);
  }

  function handleEditRouteProposal() {
    handleEnterRouteEditing();
  }

  function handleAcceptRouteProposal() {
    setActiveRightPanelSection("route");
    setIsRouteEditing(false);

    if (!planBase || !routeProposal) {
      return;
    }

    if (
      !planBase.calibration.calibration ||
      !expectedRouteProposalFingerprint ||
      routeProposal.params.fingerprint !== expectedRouteProposalFingerprint
    ) {
      setRouteError("La propuesta esta desactualizada. Regenerala antes de aceptar.");
      return;
    }

    const requiredApplianceCount = planBase.equipment.filter(
      (equipment) => equipment.role === "appliance",
    ).length;

    if (!routeProposalCanBeAccepted(routeProposal, requiredApplianceCount)) {
      setRouteError("La propuesta aun no cumple las condiciones para aceptarse.");
      return;
    }

    if (
      routeNetworkHasInstallation(planBase.routeNetwork, planBase.equipment) &&
      !window.confirm("Aceptar la propuesta reemplazara la red actual. Continuar?")
    ) {
      return;
    }

    const nextNetwork: ManualRouteNetwork = {
      nodes: routeProposal.nodes,
      segments: routeProposal.segments,
    };
    const validation = validateRouteNetworkForAcceptance(
      planBase,
      nextNetwork,
      planClassificationIndex,
    );

    if (!validation.ok) {
      setRouteError(validation.message);
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      routeNetwork: nextNetwork,
      showRoute: true,
    }));
    setRouteProposal(null);
    setRouteProposalMode(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setSelectedRouteEdit(null);
    setRouteError(null);
  }

  function handleConfirmAccessoryProposal(
    proposalId: string,
    candidateId: string,
  ) {
    setActiveRightPanelSection("calculation");

    if (!planBase) {
      return;
    }

    const proposal = routeAccessoryProposals.find(
      (item) => item.id === proposalId,
    );

    if (!proposal) {
      setRouteError("La propuesta de accesorio ya no existe en la red.");
      return;
    }

    const review = routeAccessoryProposalReviews.find(
      (item) => item.proposalId === proposalId,
    );
    const candidate = review?.candidates.find((item) => item.id === candidateId);

    if (!review || !candidate) {
      setRouteError("Selecciona una familia tecnica compatible.");
      return;
    }

    if (candidate.status !== "compatible") {
      setRouteError(candidate.reason);
      return;
    }

    const result = confirmRouteAccessoryProposal({
      decidedAt: Date.now(),
      network: planBase.routeNetwork,
      origin: "user_confirmed",
      ownerResolution: review.ownerResolution,
      proposal,
      selection: accessoryCatalogSelectionFromCandidate(candidate),
    });

    if (!result.ok) {
      setRouteError(result.message);
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      routeAccessoryProposalDecisions: upsertAccessoryProposalDecision(
        base.routeAccessoryProposalDecisions,
        result.decision,
      ),
      routeNetwork: result.network,
      showRoute: true,
    }));
    setRouteError(null);
  }

  function handleRejectAccessoryProposal(proposalId: string) {
    setActiveRightPanelSection("calculation");

    if (!planBase) {
      return;
    }

    const proposal = routeAccessoryProposals.find(
      (item) => item.id === proposalId,
    );

    if (!proposal) {
      setRouteError("La propuesta de accesorio ya no existe en la red.");
      return;
    }

    const result = rejectRouteAccessoryProposal({
      decidedAt: Date.now(),
      network: planBase.routeNetwork,
      proposal,
    });

    updateBase(planBase.id, (base) => ({
      ...base,
      routeAccessoryProposalDecisions: upsertAccessoryProposalDecision(
        base.routeAccessoryProposalDecisions,
        result.decision,
      ),
      routeNetwork: result.network,
      showRoute: true,
    }));
    setRouteError(null);
  }

  function handleConfirmDiameterTransition(
    transitionId: string,
    candidateId: string,
  ) {
    setActiveRightPanelSection("calculation");

    if (!planBase) {
      return;
    }

    const proposal = diameterTransitionProposals.find(
      (item) => item.id === transitionId,
    );

    if (!proposal) {
      setRouteError("La transicion de diametro ya no existe en la red.");
      return;
    }

    const review = diameterTransitionProposalReviews.find(
      (item) => item.transitionId === transitionId,
    );
    const candidate = review?.candidates.find((item) => item.id === candidateId);

    if (!review || !candidate) {
      setRouteError("Selecciona una familia tecnica compatible.");
      return;
    }

    const result = confirmDiameterTransitionProposal({
      candidate,
      decidedAt: Date.now(),
      origin: "user_confirmed",
      proposal,
    });

    if (!result.ok) {
      setRouteError(result.message);
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      diameterTransitionDecisions: upsertDiameterTransitionDecision(
        base.diameterTransitionDecisions,
        result.decision,
      ),
      showRoute: true,
    }));
    setRouteError(null);
  }

  function handleRejectDiameterTransition(transitionId: string) {
    setActiveRightPanelSection("calculation");

    if (!planBase) {
      return;
    }

    const proposal = diameterTransitionProposals.find(
      (item) => item.id === transitionId,
    );

    if (!proposal) {
      setRouteError("La transicion de diametro ya no existe en la red.");
      return;
    }

    const decision = rejectDiameterTransitionProposal({
      decidedAt: Date.now(),
      proposal,
    });

    updateBase(planBase.id, (base) => ({
      ...base,
      diameterTransitionDecisions: upsertDiameterTransitionDecision(
        base.diameterTransitionDecisions,
        decision,
      ),
      showRoute: true,
    }));
    setRouteError(null);
  }

  function handleAdoptSegmentDiameter(
    segmentId: string,
    diameterId: string | null,
  ) {
    setActiveRightPanelSection("calculation");

    if (!planBase) {
      return;
    }

    if (!diameterId) {
      updateBase(planBase.id, (base) => ({
        ...base,
        adoptedDiameterDecisions: removeAdoptedDiameterDecision(
          base.adoptedDiameterDecisions,
          segmentId,
        ),
        showRoute: true,
      }));
      setRouteError(null);
      return;
    }

    const availableDiametersResolution = SIGAS_PIPE_SYSTEM.getAvailableDiameters();
    const allowedDiameterIds = new Set(
      availableDiametersResolution.status === "resolved"
        ? availableDiametersResolution.value.map((diameter) => diameter.id)
        : [],
    );

    if (!allowedDiameterIds.has(diameterId)) {
      setRouteError(
        "El diametro adoptado debe pertenecer al catalogo SIGAS.",
      );
      return;
    }

    updateBase(planBase.id, (base) => ({
      ...base,
      adoptedDiameterDecisions: upsertAdoptedDiameterDecision(
        base.adoptedDiameterDecisions,
        {
          decidedAt: Date.now(),
          diameterId,
          origin: "user_adopted",
          segmentId,
        },
      ),
      showRoute: true,
    }));
    setRouteError(null);
  }

  function handleViewSectionRegistration(link: SectionPlanLink) {
    if (!link.registration) {
      return;
    }

    const section = bases.find((base) => base.id === link.sectionBaseId);

    if (!section) {
      return;
    }

    setBases((current) =>
      current.map((base) => {
        const cancelled =
          base.id === activeBaseId || base.id === section.id
            ? cancelTransientState(base)
            : base;

        if (cancelled.id !== section.id || !link.registration) {
          return cancelled;
        }

        return focusSectionRegistrationIfNeeded(cancelled, link.registration);
      }),
    );
    setActiveBaseId(section.id);
    setSectionLinkDraft(null);
    setSectionRegistrationDraft(null);
    setRouteDraft(null);
    setRouteError(null);
    setCursor(null);
    highlightRegistration(link.id);
  }

  function handleRemoveSectionRegistration(link: SectionPlanLink) {
    if (!link.registration) {
      return;
    }

    if (!window.confirm("Quitar solo la correspondencia de este Corte?")) {
      return;
    }

    setSectionPlanLinks((current) =>
      current.map((item) =>
        item.id === link.id ? { ...item, registration: undefined } : item,
      ),
    );
    setSectionRegistrationDraft((current) =>
      current?.editingLinkId === link.id ? null : current,
    );
    setHighlightedRegistrationLinkId(null);
  }

  function highlightSectionLink(linkId: string) {
    setHighlightedSectionLinkId(linkId);

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedSectionLinkId((current) =>
        current === linkId ? null : current,
      );
      highlightTimerRef.current = null;
    }, 1800);
  }

  function highlightRegistration(linkId: string) {
    setHighlightedRegistrationLinkId(linkId);

    if (registrationHighlightTimerRef.current !== null) {
      window.clearTimeout(registrationHighlightTimerRef.current);
    }

    registrationHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedRegistrationLinkId((current) =>
        current === linkId ? null : current,
      );
      registrationHighlightTimerRef.current = null;
    }, 1800);
  }

  function handleConstraintToolModeChange(mode: ConstraintToolMode) {
    setActiveRightPanelSection("obstacles");
    setSectionRegistrationDraft(null);
    setEquipmentDraft(null);
    setEquipmentError(null);
    setRouteDraft(null);
    setRouteIntentDraft(null);
    setRouteProposal(null);
    setRouteProposalMode(null);
    setRouteError(null);
    updateActiveBase((base) => ({
      ...base,
      constraintDraft: null,
      constraintToolMode: mode,
      selectionMode: mode !== "none" ? "pan" : base.selectionMode,
    }));
  }

  function handleConstraintCreateRectangle(start: Point2D, end: Point2D) {
    const polygon = createRectanglePolygon(start, end);

    if (!isValidPolygon(polygon)) {
      return;
    }

    addManualConstraint({
      type: "hard_obstacle",
      polygon,
    });
  }

  function handleConstraintDraftPoint(point: Point2D) {
    const type = constraintTypeForTool(activeBase?.constraintToolMode ?? "none");

    if (!type) {
      return;
    }

    updateActiveBase((base) => {
      if (
        base.constraintDraft &&
        base.constraintDraft.source === activeConstraintSource.source &&
        base.constraintDraft.pageNumber === activeConstraintSource.pageNumber &&
        base.constraintDraft.type === type &&
        base.constraintDraft.shape === "polygon"
      ) {
        return {
          ...base,
          constraintDraft: {
            ...base.constraintDraft,
            points: [...base.constraintDraft.points, point],
            previewPoint: point,
          },
        };
      }

      return {
        ...base,
        constraintDraft: {
          source: activeConstraintSource.source,
          pageNumber: activeConstraintSource.pageNumber,
          type,
          shape: "polygon",
          points: [point],
          previewPoint: point,
        },
      };
    });
  }

  function handleConstraintPreviewPoint(point: Point2D | null) {
    updateActiveBase((base) =>
      base.constraintDraft
        ? {
            ...base,
            constraintDraft: {
              ...base.constraintDraft,
              previewPoint: point,
            },
          }
        : base,
    );
  }

  function handleFinishConstraintDraft() {
    setActiveRightPanelSection("obstacles");
    updateActiveBase((base) => {
      if (!base.constraintDraft || !isValidPolygon(base.constraintDraft.points)) {
        return base;
      }

      return addManualConstraintToBase(base, {
        polygon: base.constraintDraft.points,
        type: base.constraintDraft.type,
      });
    });
  }

  function handleCancelConstraintDraft() {
    setActiveRightPanelSection("obstacles");
    updateActiveBase((base) => ({
      ...base,
      constraintDraft: null,
    }));
  }

  function handleSelectConstraint(constraintId: string | null) {
    setActiveRightPanelSection("obstacles");
    updateActiveBase((base) => ({
      ...base,
      selectedConstraintId: constraintId,
    }));
  }

  function handleConstraintMove(constraintId: string, delta: Point2D) {
    updateActiveBase((base) => ({
      ...base,
      constraints: base.constraints.map((constraint) =>
        constraint.id === constraintId
          ? translateConstraint(constraint, delta)
          : constraint,
      ),
    }));
  }

  function handleConstraintMoveVertex(
    constraintId: string,
    vertexIndex: number,
    point: Point2D,
  ) {
    updateActiveBase((base) => ({
      ...base,
      constraints: base.constraints.map((constraint) =>
        constraint.id === constraintId
          ? moveConstraintVertex(constraint, vertexIndex, point)
          : constraint,
      ),
    }));
  }

  function handleToggleSelectedConstraintActive() {
    updateActiveBase((base) => {
      if (!base.selectedConstraintId) {
        return base;
      }

      return {
        ...base,
        constraints: base.constraints.map((constraint) =>
          constraint.id === base.selectedConstraintId
            ? {
                ...constraint,
                active: !constraint.active,
              }
            : constraint,
        ),
      };
    });
  }

  function handleDeleteSelectedConstraint() {
    updateActiveBase((base) => {
      if (!base.selectedConstraintId) {
        return base;
      }

      return {
        ...base,
        constraints: base.constraints.filter(
          (constraint) => constraint.id !== base.selectedConstraintId,
        ),
        selectedConstraintId: null,
      };
    });
  }

  function addManualConstraint(params: {
    type: ConstraintType;
    polygon: Point2D[];
  }) {
    updateActiveBase((base) => addManualConstraintToBase(base, params));
  }

  function handleAnalyzeDrawing() {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) => {
      if (!base.drawing) {
        return base;
      }

      return {
        ...base,
        semanticInspection: inspectDrawingSemantics(base.drawing),
        proposals: generateClassificationProposals(base.drawing),
        semanticViewMode: "prepared",
      };
    });
  }

  function handleConfirmProposal(proposalId: string) {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) => {
      const proposal = base.proposals.find((item) => item.id === proposalId);

      if (!proposal || proposal.status === "discarded") {
        return base;
      }

      return {
        ...base,
        semanticAssignments: replaceAssignmentsForEntities(
          base.semanticAssignments,
          proposal.entityIds,
          createClassificationFromProposal(proposal),
        ),
        proposals: base.proposals.map((item) =>
          item.id === proposalId
            ? {
                ...item,
                status: item.status === "modified" ? "modified" : "confirmed",
              }
            : item,
        ),
      };
    });
  }

  function handleChangeProposal(proposalId: string) {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) => ({
      ...base,
      proposals: base.proposals.map((proposal) =>
        proposal.id === proposalId && proposal.status !== "discarded"
          ? {
              ...proposal,
              category: nextSemanticCategory(proposal.category),
              status: "modified",
              explanation: `Categoria ajustada manualmente para ${proposal.id.replace("layer:", "capa ")}.`,
            }
          : proposal,
      ),
    }));
  }

  function handleDiscardProposal(proposalId: string) {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) => ({
      ...base,
      proposals: base.proposals.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              status: "discarded",
            }
          : proposal,
      ),
      semanticAssignments: base.semanticAssignments.filter(
        (assignment) => assignment.id !== `proposal:${proposalId}`,
      ),
    }));
  }

  function handleEntityToggle(entityId: string) {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) => ({
      ...base,
      selectedEntityIds: base.selectedEntityIds.includes(entityId)
        ? base.selectedEntityIds.filter((id) => id !== entityId)
        : [...base.selectedEntityIds, entityId],
    }));
  }

  function handleRectangleSelect(entityIds: string[]) {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) => ({
      ...base,
      selectedEntityIds: uniqueIds([...base.selectedEntityIds, ...entityIds]),
    }));
  }

  function handleSelectLayer(layer: string) {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) => {
      if (!base.drawing) {
        return base;
      }

      return {
        ...base,
        selectedEntityIds: uniqueIds([
          ...base.selectedEntityIds,
          ...base.drawing.entities
            .filter((entity) => entity.layer === layer)
            .map((entity) => entity.id),
        ]),
      };
    });
  }

  function handleSelectColor(color: string) {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) => {
      if (!base.drawing) {
        return base;
      }

      return {
        ...base,
        selectedEntityIds: uniqueIds([
          ...base.selectedEntityIds,
          ...base.drawing.entities
            .filter(
              (entity) =>
                (entity.visual.resolvedColor ?? "sin color resuelto") === color,
            )
            .map((entity) => entity.id),
        ]),
      };
    });
  }

  function handleAssignSelection(category: SemanticCategory) {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) => {
      if (base.selectedEntityIds.length === 0) {
        return base;
      }

      const entityIds = uniqueIds(base.selectedEntityIds);

      return {
        ...base,
        semanticAssignments: replaceAssignmentsForEntities(
          base.semanticAssignments,
          entityIds,
          createManualClassification({
            assignmentId: `manual:${base.id}:${Date.now()}`,
            category,
            entityIds,
            rule: `manual:${base.selectionMode}`,
          }),
        ),
      };
    });
  }

  function handleSelectionModeChange(mode: ManualSelectionMode) {
    setActiveRightPanelSection("geometry");
    setEquipmentDraft(null);
    setEquipmentError(null);
    setRouteDraft(null);
    setRouteProposal(null);
    setRouteError(null);
    updateActiveBase((base) => ({
      ...base,
      selectionMode: mode,
      constraintToolMode: "none",
      constraintDraft: null,
    }));
  }

  function toggleLayer(layerName: string) {
    updateActiveBase((base) => ({
      ...base,
      visibleLayers: {
        ...base.visibleLayers,
        [layerName]: !(base.visibleLayers[layerName] ?? true),
      },
    }));
  }

  function setEveryLayer(visible: boolean) {
    updateActiveBase((base) => {
      if (!base.drawing) {
        return base;
      }

      return {
        ...base,
        visibleLayers: Object.fromEntries(
          base.drawing.layers.map((layer) => [layer.name, visible]),
        ),
      };
    });
  }

  function handleFitActiveView() {
    updateActiveBase((base) => ({
      ...base,
      visual:
        base.sourceType === "dxf"
          ? {
              ...base.visual,
              dxfFitNonce: base.visual.dxfFitNonce + 1,
            }
          : {
              ...base.visual,
              pdfFitNonce: base.visual.pdfFitNonce + 1,
            },
    }));
  }

  function handleSourcePoint(source: WorkbenchSource, point: Point2D) {
    setActiveRightPanelSection("scale");
    updateActiveBase((base) => {
      if (base.sourceType !== source) {
        return base;
      }

      return updateCalibrationForBase(base, (state) => {
        if (state.toolMode === "calibrate") {
          return {
            ...state,
            draft: {
              ...state.draft,
              points:
                state.draft.points.length >= 2
                  ? [point]
                  : [...state.draft.points, point],
            },
            error: null,
          };
        }

        if (state.toolMode === "measure") {
          if (!state.calibration) {
            return {
              ...state,
              error: "Confirme una escala antes de medir.",
            };
          }

          return {
            ...state,
            measurementPoints:
              state.measurementPoints.length >= 2
                ? [point]
                : [...state.measurementPoints, point],
            error: null,
          };
        }

        return state;
      });
    });
  }

  function handleCalibrationMode(mode: CalibrationToolMode) {
    setActiveRightPanelSection("scale");
    setSectionRegistrationDraft(null);
    setEquipmentDraft(null);
    setEquipmentError(null);
    setRouteDraft(null);
    setRouteProposal(null);
    setRouteError(null);
    updateActiveBase((base) =>
      updateCalibrationForBase(base, (state) => {
        if (mode === "measure" && !state.calibration) {
          return {
            ...state,
            error: "Confirme una escala antes de medir.",
          };
        }

        return {
          ...state,
          toolMode: mode,
          draft:
            mode === "calibrate"
              ? { ...state.draft, points: [] }
              : state.draft,
          measurementPoints: mode === "measure" ? [] : state.measurementPoints,
          error: null,
        };
      }),
    );
  }

  function handleCancelCalibrationTool() {
    setActiveRightPanelSection("geometry");
    updateActiveBase((base) =>
      updateCalibrationForBase(base, (state) => ({
        ...state,
        toolMode: "idle",
        draft: { ...state.draft, points: [] },
        measurementPoints: [],
        error: null,
      })),
    );
  }

  function handleDistanceChange(value: string) {
    updateActiveBase((base) =>
      updateCalibrationForBase(base, (state) => ({
        ...state,
        draft: {
          ...state.draft,
          distanceOriginal: value,
        },
        error: null,
      })),
    );
  }

  function handleUnitChange(unit: CalibrationUnit) {
    updateActiveBase((base) =>
      updateCalibrationForBase(base, (state) => ({
        ...state,
        draft: {
          ...state.draft,
          unit,
        },
        error: null,
      })),
    );
  }

  function handleConfirmCalibration() {
    const activePoints = createPointPair(activeCalibration.draft.points);
    const activeDistance = parsePositiveDistance(
      activeCalibration.draft.distanceOriginal,
    );
    let shouldReturnToPlanSummary = false;

    if (activePoints && activeDistance !== null) {
      try {
        createConfirmedCalibration({
          distanceOriginal: activeDistance,
          points: activePoints,
          unit: activeCalibration.draft.unit,
        });
        shouldReturnToPlanSummary = true;
      } catch {
        shouldReturnToPlanSummary = false;
      }
    }

    setActiveRightPanelSection(
      shouldReturnToPlanSummary ? "geometry" : "scale",
    );
    updateActiveBase((base) =>
      updateCalibrationForBase(base, (state) => {
        const points = createPointPair(state.draft.points);

        if (!points) {
          return {
            ...state,
            error: "Seleccione dos puntos para calibrar.",
          };
        }

        const distanceOriginal = parsePositiveDistance(state.draft.distanceOriginal);

        if (distanceOriginal === null) {
          return {
            ...state,
            error: "La distancia real debe ser positiva.",
          };
        }

        try {
          const calibration = createConfirmedCalibration({
            points,
            distanceOriginal,
            unit: state.draft.unit,
          });

          return {
            ...state,
            toolMode: "idle",
            calibration,
            draft: {
              ...state.draft,
              points: [],
            },
            measurementPoints: [],
            error: null,
          };
        } catch (caught) {
          return {
            ...state,
            error:
              caught instanceof Error
                ? caught.message
                : "No se pudo confirmar la escala.",
          };
        }
      }),
    );
  }

  function handlePdfPageChange(pageNumber: number) {
    if (sectionLinkDraft && activeBase?.id === sectionLinkDraft.planBaseId) {
      handleCancelSectionLinkDraft();
    }

    if (
      sectionRegistrationDraft &&
      activeBase?.id === sectionRegistrationDraft.sectionBaseId
    ) {
      handleCancelSectionRegistrationDraft();
    }

    if (routeDraft && activeBase?.id === routeDraft.planBaseId) {
      handleCancelRouteDraft();
    }

    if (routeProposal && activeBase?.id === routeProposal.baseId) {
      setRouteProposal(null);
    }

    setSelectedRouteEdit(null);
    updateActiveBase((base) => ({
      ...base,
      constraintDraft: null,
      selectedConstraintId: null,
      visual: {
        ...base.visual,
        activePdfPageNumber: pageNumber,
        pdfFitNonce: base.visual.pdfFitNonce + 1,
      },
    }));
    setCursor(null);
  }

  function handleDxfViewChange(baseId: string, view: ViewTransform | null) {
    updateBase(baseId, (base) => {
      if (viewTransformsEqual(base.visual.dxfView, view)) {
        return base;
      }

      return {
        ...base,
        visual: {
          ...base.visual,
          dxfView: view,
        },
      };
    });
  }

  function handlePdfViewChange(baseId: string, view: PdfViewTransform | null) {
    updateBase(baseId, (base) => {
      if (pdfViewTransformsEqual(base.visual.pdfView, view)) {
        return base;
      }

      return {
        ...base,
        visual: {
          ...base.visual,
          pdfView: view,
        },
      };
    });
  }

  const canSaveSectionLink =
    Boolean(sectionLinkDraft?.planStart) &&
    Boolean(sectionLinkDraft?.planEnd) &&
    Boolean(sectionLinkDraft?.viewSide);
  const canSaveSectionRegistration =
    Boolean(sectionRegistrationDraft?.sectionStart) &&
    Boolean(sectionRegistrationDraft?.sectionEnd) &&
    Boolean(sectionRegistrationDraft?.positiveZSide) &&
    parseElevationInput(sectionRegistrationDraft?.referenceElevationInput ?? "") !==
      null;
  const constraintsSourceReady =
    activeView === "dxf" ? Boolean(drawing) : Boolean(activePdfPage);
  const constraintsSourceLabel = activeBase
    ? activeView === "dxf"
      ? `${activeBase.name} - DXF`
      : `${activeBase.name} - PDF pagina ${activePdfPageNumber}`
    : "Sin base activa";
  const geometryPendingCount = (activeBase?.proposals ?? []).filter(
    (proposal) =>
      proposal.status === "pending" || proposal.status === "modified",
  ).length;
  const geometrySummary = !activeBase
    ? "Sin base cargada"
    : activeView === "dxf"
      ? drawing
        ? `${drawing.entities.length} primitivas - ${geometryPendingCount} pendientes`
        : "Sin dibujo"
      : pdfModel
        ? `PDF - ${pdfModel.pageCount} paginas`
        : "Sin documento";
  const equipmentSummary = planBase
    ? `${supplyCount} alimentacion - ${applianceCount} artefactos - ${pendingDemandCount} pendientes`
    : "Sin Planta";
  const routeSummaryText = planBase
    ? supplyCount !== 1
      ? "Falta alimentacion"
      : routeProposal
        ? `Propuesta ${routeProposal.reachedEquipmentIds.length} de ${applianceEquipment.length}`
        : isRouteComplete
          ? "Recorrido confirmado"
          : `${connectedApplianceIds.size} de ${applianceEquipment.length} conectados`
    : "Sin Planta";
  const calculationSummaryText = technicalCalculationResult
    ? technicalCalculationResult.status === "valid"
      ? `${technicalCalculationResult.totals.segmentCount} tramos - ${formatTechnicalFlow(
          technicalCalculationResult.totals.accumulatedFlow,
          technicalCalculationResult.totals.accumulatedFlowUnit,
        )}`
      : technicalCalculationStatusLabel(technicalCalculationResult.status)
    : "Sin Planta";
  const manualZoneCount =
    constraintSummary.manualObstacleCount + constraintSummary.avoidZoneCount;
  const obstaclesSummaryText = activeBase
    ? `${manualZoneCount} ${manualZoneCount === 1 ? "zona" : "zonas"} - ${constraintSummary.activeRestrictionCount} ${constraintSummary.activeRestrictionCount === 1 ? "restriccion activa" : "restricciones activas"}`
    : "Sin base activa";
  const scaleSummaryText = activeBase
    ? activeCalibration.calibration
      ? "Confirmada"
      : "Pendiente"
    : "Sin base activa";
  const canOpenEquipmentStage = planStageReadiness.canContinueToEquipment;
  const canOpenRouteStage =
    canOpenEquipmentStage && supplyCount === 1 && applianceEquipment.length > 0;
  const canOpenCalculateStage = canOpenReviewStage;
  const canOpenDeliverStage = technicalCalculationResult?.status === "valid";

  function canOpenWorkflowStage(stage: MainWorkflowStageId) {
    if (stage === "plan") {
      return true;
    }

    if (stage === "equipment") {
      return canOpenEquipmentStage;
    }

    if (stage === "route") {
      return canOpenRouteStage;
    }

    if (stage === "review") {
      return canOpenReviewStage;
    }

    if (stage === "calculate") {
      return canOpenCalculateStage;
    }

    return canOpenDeliverStage;
  }

  function fallbackWorkflowStage() {
    return canOpenEquipmentStage ? "equipment" : "plan";
  }

  const activeWorkflowStage =
    canOpenWorkflowStage(activeMainStage)
      ? activeMainStage
      : fallbackWorkflowStage();
  const isReviewStage = activeWorkflowStage === "review";
  const reviewSummaryText = !planBase
    ? "Sin Planta"
    : canOpenReviewStage
      ? "Listo para calcular"
      : "Falta recorrido confirmado";
  const reviewTechnicalViewItems: ReviewTechnicalViewItem[] = useMemo(
    () => [
      {
        id: "plan",
        label: "Planta",
        summary: planBase?.name ?? "Sin planta",
      },
      {
        id: "section-aa",
        label: "Corte A-A",
        summary: "Vista tecnica",
      },
      {
        id: "section-bb",
        label: "Corte B-B",
        summary: "Vista tecnica",
      },
      {
        id: "axo",
        label: "Axo",
        summary: "Vista tecnica",
      },
    ],
    [planBase?.name],
  );
  const activeStandardTechnicalSectionView =
    activeReviewViewId === "section-aa"
      ? standardTechnicalSectionViews["section-aa"]
      : activeReviewViewId === "section-bb"
        ? standardTechnicalSectionViews["section-bb"]
        : null;
  const isTechnicalReviewCanvasVisible =
    isReviewStage && activeReviewViewId !== "plan";
  const planOnlyDisabledReason =
    activeBase?.type === "section" ? "Solo en Planta" : "Sin Planta";
  const isPlanSectionAvailable = activeBase?.type === "plan";
  const geometryHasActiveTool =
    Boolean(activeSectionLinkDraftOverlay) ||
    Boolean(activeSectionRegistrationDraftOverlay) ||
    (activeBase?.selectionMode ?? "pan") !== "pan";
  const rightPanelSections: RightPanelSection[] = [
    {
      id: "geometry",
      title: "Plano",
      summary: geometrySummary,
      hasActiveTool: geometryHasActiveTool,
      content: activeBase ? (
        <div className="divide-y divide-[var(--line)]">
          {activeView === "dxf" ? (
            <>
              <DiagnosticsPanel drawing={drawing} isSectionContent />
              <GeometryPreparationPanel
                classificationIndex={classificationIndex}
                drawing={drawing}
                inspection={activeBase.semanticInspection}
                isSectionContent
                proposals={activeBase.proposals}
                selectedEntityIds={activeBase.selectedEntityIds}
                selectionMode={activeBase.selectionMode}
                semanticViewMode={activeBase.semanticViewMode}
                onAnalyze={handleAnalyzeDrawing}
                onAssignSelection={handleAssignSelection}
                onChangeProposal={handleChangeProposal}
                onClearSelection={() => {
                  setActiveRightPanelSection("geometry");
                  updateActiveBase((base) => ({
                    ...base,
                    selectedEntityIds: [],
                  }));
                }}
                onConfirmProposal={handleConfirmProposal}
                onDiscardProposal={handleDiscardProposal}
                onSelectColor={handleSelectColor}
                onSelectLayer={handleSelectLayer}
                onSelectionModeChange={handleSelectionModeChange}
                onSemanticViewModeChange={(mode) => {
                  setActiveRightPanelSection("geometry");
                  updateActiveBase((base) => ({
                    ...base,
                    semanticViewMode: mode,
                  }));
                }}
              />
            </>
          ) : (
            <PdfDiagnosticsPanel
              activePage={activePdfPage}
              isSectionContent
              pdf={pdfModel}
            />
          )}
        </div>
      ) : (
        <div className="px-4 py-3 text-sm text-[var(--muted)]">
          Carga la Planta para comenzar.
        </div>
      ),
    },
    {
      id: "equipment",
      title: "Artefactos",
      summary: equipmentSummary,
      disabled: !isPlanSectionAvailable,
      disabledReason: planOnlyDisabledReason,
      hasActiveTool: Boolean(equipmentDraft),
      content: (
        <EquipmentPanel
          canSaveDraft={canSaveEquipmentDraft}
          draft={equipmentDraft}
          equipment={planEquipment}
          error={equipmentError}
          isPlanActive={activeBase?.type === "plan"}
          isSectionContent
          planReady={Boolean(planBase)}
          projectGas={DEFAULT_PROJECT_GAS_CONFIG}
          selectedEquipment={selectedEquipment}
          onAddAppliance={handleStartApplianceDraft}
          onAddSupply={handleStartSupplyPlacement}
          onBeginPlacement={handleBeginEquipmentPlacement}
          onCancelDraft={handleCancelEquipmentDraft}
          onDeleteSelected={handleDeleteSelectedEquipment}
          onDraftDemandUnitChange={handleEquipmentDraftDemandUnitChange}
          onDraftDemandValueChange={handleEquipmentDraftDemandValueChange}
          onDraftNameChange={handleEquipmentDraftNameChange}
          onDraftTypeChange={handleEquipmentDraftTypeChange}
          onDraftWallAlternativeSelect={
            handleEquipmentDraftWallAlternativeSelect
          }
          onEditSelected={handleEditSelectedEquipment}
          onGoToPlan={handleGoToPlanForEquipment}
          onInvertDraftTerminalSide={handleInvertEquipmentDraftTerminalSide}
          onRelocateSelected={handleRelocateSelectedEquipment}
          onSaveDraft={handleSaveEquipmentDraft}
          onSelectEquipment={handleSelectEquipment}
        />
      ),
    },
    {
      id: "route",
      title: "Recorrido",
      summary: routeSummaryText,
      disabled: !isPlanSectionAvailable,
      disabledReason: planOnlyDisabledReason,
      hasActiveTool: isRouteEditing || Boolean(routeDraft || routeIntentDraft),
      content: activeBase?.type === "section" ? (
        <RouteSectionPreviewPanel onGoToPlan={handleGoToPlanForRoute} />
      ) : (
        <RoutePanel
          applianceStatuses={routeApplianceStatuses}
          connectedCount={connectedApplianceIds.size}
          derivationCount={getDerivationNodeIds(routeNetwork).length}
          draft={routeDraft}
          error={routeError}
          equipment={planEquipment}
          hasAppliances={applianceEquipment.length > 0}
          hasSupply={supplyCount === 1}
          isGeneratingProposal={isRouteProposalGenerating}
          isComplete={canOpenReviewStage}
          isEditingRoute={isRouteEditing}
          isPlanActive={activeBase?.type === "plan"}
          isSectionContent
          lengthLabel={routeLengthLabel}
          pendingDemandCount={pendingDemandCount}
          planReady={Boolean(planBase)}
          proposal={routeProposal}
          proposalMarginInput={routeProposalMarginInput}
          proposalOutdated={isRouteProposalOutdated}
          proposalRequiresScale={routeProposalRequiresScale}
          restrictionCount={routeRestrictionCount}
          selectedEdit={selectedRouteEdit}
          snapOptions={routeSnapOptions}
          intentConnections={planBase?.routeIntentConnections ?? []}
          intentDraft={routeIntentDraft}
          segmentCount={routeNetwork.segments.length}
          showRoute={planBase?.showRoute ?? true}
          onAcceptProposal={handleAcceptRouteProposal}
          onCancelIntentDraft={handleCancelRouteIntentDraft}
          onClearNetwork={handleClearRouteNetwork}
          onClearIntentConnections={handleClearRouteIntentConnections}
          onConnectAppliance={handleStartRouteConnection}
          onClearRouteSelection={handleClearPhysicalRouteSelection}
          onDeleteSelectedVertex={handleDeleteSelectedPhysicalRouteVertex}
          onDeleteIntentConnection={handleDeleteRouteIntentConnection}
          onDiscardProposal={handleDiscardRouteProposal}
          onDisconnectAppliance={handleDisconnectRouteAppliance}
          onContinueToReview={handleContinueToReviewFromRoute}
          onEditInstallation={handleEditConfirmedRoute}
          onEditProposal={handleEditRouteProposal}
          onExitEditRoute={handleExitRouteEditing}
          onGenerateProposal={handleGenerateRouteProposal}
          onGoToPlan={handleGoToPlanForRoute}
          onGoToScale={handleGoToScaleForRouteProposal}
          onInterpretIntentConnections={handleInterpretRouteIntentConnections}
          onProposalMarginChange={handleRouteProposalMarginChange}
          onRegenerateProposal={handleRegenerateRouteProposal}
          onSelectDraftTarget={handleSelectRouteDraftTarget}
          onShowRouteChange={handleShowRouteChange}
          onSnapOptionChange={handleRouteSnapOptionChange}
        />
      ),
    },
    {
      id: "review",
      title: "Revisar",
      summary: reviewSummaryText,
      disabled: !canOpenReviewStage,
      disabledReason: planBase
        ? "Falta recorrido confirmado"
        : "Sin Planta",
      hasActiveTool: Boolean(selectedRouteEdit || sectionRouteHeightEditor),
      content: (
        <ReviewPanel
          activeViewId={activeReviewViewId}
          connectedApplianceCount={routeReviewState.connectedApplianceCount}
          hasValidRoute={canOpenReviewStage}
          routeRestrictionCount={routeRestrictionCount}
          totalApplianceCount={routeReviewState.totalApplianceCount}
          views={reviewTechnicalViewItems}
          onContinueToCalculate={handleContinueToCalculateFromReview}
          onOpenView={handleReviewViewOpen}
        />
      ),
    },
    {
      id: "calculation",
      title: "Calcular",
      summary: calculationSummaryText,
      disabled: !isPlanSectionAvailable,
      disabledReason: planOnlyDisabledReason,
      content: (
        <CalculationPanel
          adoptedDiameterDecisions={planBase?.adoptedDiameterDecisions ?? []}
          accessoryProposals={routeAccessoryProposals}
          accessoryProposalReviews={routeAccessoryProposalReviews}
          diameterTransitionProposals={diameterTransitionProposals}
          diameterTransitionReviews={diameterTransitionProposalReviews}
          equipment={planEquipment}
          hasPendingProposal={Boolean(routeProposal)}
          isPlanActive={activeBase?.type === "plan"}
          mode={activeWorkflowStage === "deliver" ? "deliver" : "calculate"}
          pipeSystem={SIGAS_PIPE_SYSTEM}
          planReady={Boolean(planBase)}
          result={technicalCalculationResult}
          routeNetwork={planBase?.routeNetwork ?? createEmptyRouteNetwork()}
          scaleMetersPerSourceUnit={calibrationScaleMetersPerSourceUnit(planBase)}
          routeTransitionResolutions={routeTransitionResolutions}
          onAdoptSegmentDiameter={handleAdoptSegmentDiameter}
          onConfirmAccessoryProposal={handleConfirmAccessoryProposal}
          onConfirmDiameterTransition={handleConfirmDiameterTransition}
          onGoToEquipment={handleGoToEquipmentFromCalculation}
          onGoToPlan={handleGoToPlanForRoute}
          onRejectAccessoryProposal={handleRejectAccessoryProposal}
          onRejectDiameterTransition={handleRejectDiameterTransition}
        />
      ),
    },
    {
      id: "obstacles",
      title: "Revisar",
      summary: obstaclesSummaryText,
      disabled: !activeBase,
      disabledReason: "Sin base activa",
      hasActiveTool:
        Boolean(activeConstraintDraft) ||
        (activeBase?.constraintToolMode ?? "none") !== "none",
      content: (
        <ObstaclesPanel
          activeConstraints={activeConstraints}
          draft={activeConstraintDraft}
          isSectionContent
          selectedConstraint={selectedConstraint}
          showConstraints={activeBase?.showConstraints ?? true}
          sourceLabel={constraintsSourceLabel}
          sourceReady={constraintsSourceReady}
          summary={constraintSummary}
          toolMode={activeBase?.constraintToolMode ?? "none"}
          onCancelDraft={handleCancelConstraintDraft}
          onDeleteSelected={handleDeleteSelectedConstraint}
          onFinishDraft={handleFinishConstraintDraft}
          onSelectConstraint={handleSelectConstraint}
          onShowConstraintsChange={(show) =>
            updateActiveBase((base) => ({
              ...base,
              showConstraints: show,
            }))
          }
          onToggleSelectedActive={handleToggleSelectedConstraintActive}
          onToolModeChange={handleConstraintToolModeChange}
        />
      ),
    },
    {
      id: "scale",
      title: "Escala",
      summary: scaleSummaryText,
      disabled: !activeBase,
      disabledReason: "Sin base activa",
      hasActiveTool: activeCalibration.toolMode !== "idle",
      content: (
        <CalibrationPanel
          sourceReady={Boolean(activeBase)}
          state={activeCalibration}
          onCancel={handleCancelCalibrationTool}
          onConfirm={handleConfirmCalibration}
          onDistanceChange={handleDistanceChange}
          onModeChange={handleCalibrationMode}
          onUnitChange={handleUnitChange}
        />
      ),
    },
  ];
  const activeStagePanelSections = rightPanelSections.filter((section) =>
    MAIN_WORKFLOW_PANEL_SECTIONS[activeWorkflowStage].includes(section.id),
  );

  return (
    <main className="flex h-screen overflow-hidden flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="shrink-0 border-b border-[var(--line)] bg-white px-5 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <h1 className="min-w-0 text-xl font-semibold tracking-normal">DETA</h1>
          <nav
            aria-label="Flujo principal"
            className="flex min-w-0 flex-wrap items-center justify-center gap-1"
          >
            {MAIN_WORKFLOW_STAGES.map((stage) => {
              const isActive = stage.id === activeWorkflowStage;
              const isLocked = !canOpenWorkflowStage(stage.id);

              return (
                <button
                  aria-current={isActive ? "step" : undefined}
                  className={`rounded border px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
                  } disabled:cursor-not-allowed disabled:bg-[#f5f6f7] disabled:text-[var(--muted)]`}
                  disabled={isLocked}
                  key={stage.id}
                  type="button"
                  onClick={() => handleMainWorkflowStageChange(stage.id)}
                >
                  {stage.label}
                </button>
              );
            })}
          </nav>
          <div className="flex justify-end">
            <button
              className="rounded border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium hover:border-[var(--accent)]"
              type="button"
              onClick={handleResetLocalProject}
            >
              Restablecer
            </button>
          </div>
        </div>
      </header>

      <input
        ref={planInputRef}
        className="sr-only"
        id="plan-base-file"
        name="plan-base-file"
        type="file"
        accept={BASE_FILE_ACCEPT}
        onChange={(event) => handleBaseFileInput(event, "plan")}
      />
      <input
        ref={sectionInputRef}
        className="sr-only"
        id="section-base-file"
        name="section-base-file"
        type="file"
        accept={BASE_FILE_ACCEPT}
        onChange={(event) => handleBaseFileInput(event, "section")}
      />
      <input
        ref={replaceInputRef}
        className="sr-only"
        id="replace-active-base-file"
        name="replace-active-base-file"
        type="file"
        accept={BASE_FILE_ACCEPT}
        onChange={(event) => handleBaseFileInput(event, "replace-active")}
      />

      <section
        className={`grid min-h-0 flex-1 gap-0 overflow-hidden ${
          hasAnyBase ? "grid-cols-[280px_minmax(0,1fr)_340px]" : "grid-cols-1"
        }`}
      >
        {hasAnyBase ? (
          <aside className="min-h-0 overflow-hidden border-r border-[var(--line)] bg-white">
            {activeBase ? (
              activeView === "dxf" ? (
                <LayerPanel
                  counts={layerEntityCounts}
                  layers={drawing?.layers ?? []}
                  visibility={activeBase.visibleLayers}
                  onSetAll={setEveryLayer}
                  onToggle={toggleLayer}
                />
              ) : (
                <PdfPanel
                  activePageNumber={activePdfPageNumber}
                  pdf={pdfModel}
                  onPageChange={handlePdfPageChange}
                />
              )
            ) : null}
          </aside>
        ) : null}

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {hasAnyBase ? (
          <div className="shrink-0 border-b border-[var(--line)] bg-white px-3 py-2">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                {orderedBases.map((base) => (
                  <button
                    className={`shrink-0 rounded border px-3 py-1.5 text-left text-xs font-medium ${base.id === activeBaseId ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-white hover:border-[var(--accent)]"}`}
                    key={base.id}
                    type="button"
                    onClick={() => handleActivateBase(base.id)}
                  >
                    <span className="block max-w-48 truncate">{base.name}</span>
                  </button>
                ))}
                {!planBase ? (
                  <button
                    className="shrink-0 rounded border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium hover:border-[var(--accent)]"
                    disabled={isImporting}
                    type="button"
                    onClick={() => planInputRef.current?.click()}
                  >
                    + Planta
                  </button>
                ) : null}
                <button
                  className="shrink-0 rounded border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium hover:border-[var(--accent)]"
                  disabled={isImporting}
                  type="button"
                  onClick={() => sectionInputRef.current?.click()}
                >
                  + Corte
                </button>
              </div>
          </div>
          ) : null}

          {sessionError ? (
            <div className="m-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {sessionError}
            </div>
          ) : null}
          {persistenceNotice ? (
            <div
              className={`m-4 rounded border px-4 py-3 text-sm ${persistenceNoticeClassName(
                persistenceNotice.tone,
              )}`}
            >
              {persistenceNotice.message}
            </div>
          ) : null}
          {activeBase?.error ? (
            <div className="m-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {activeBase.error}
            </div>
          ) : null}
          {isImporting ? (
            <div className="m-4 rounded border border-[var(--line)] bg-white px-4 py-3 text-sm">
              Importando base...
            </div>
          ) : null}
          <div className="relative min-h-0 flex-1">
          {!hasAnyBase ? (
            <EmptyPlanStart
              isImporting={isImporting}
              onAddPlan={() => planInputRef.current?.click()}
              onAddSection={() => sectionInputRef.current?.click()}
            />
          ) : (
          <>
          {activeRouteDraftOverlay ? (
            <RouteContextCard
              draft={activeRouteDraftOverlay}
              target={routeDraftTarget}
                onBackDraft={handleBackRouteDraft}
                onCancelDraft={handleCancelRouteDraft}
                onSaveDraft={handleSaveRouteDraft}
              onUndoDraftPoint={handleUndoRoutePoint}
            />
          ) : null}
          {activeRouteIntentDraftOverlay ? (
            <RouteIntentContextCard
              draft={activeRouteIntentDraftOverlay}
              equipment={visibleEquipment}
              onCancelDraft={handleCancelRouteIntentDraft}
              onSaveDraft={handleSaveRouteIntentDraft}
            />
          ) : null}
          {isReviewStage && sectionRouteHeightEditor ? (
            <div className="absolute left-4 top-4 z-10 w-[280px] rounded border border-[var(--line)] bg-white/95 px-3 py-2 text-xs shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">Cota de instalacion</div>
                  <div className="mt-1 text-[var(--muted)]">
                    Actual {formatMeters(sectionRouteHeightEditor.heightMeters)}
                  </div>
                </div>
                <button
                  className="rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)]"
                  type="button"
                  onClick={handleCancelSectionRouteHeightEdit}
                >
                  Cancelar
                </button>
              </div>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <label className="min-w-0 text-[var(--muted)]">
                  <span className="block">Nueva cota</span>
                  <span className="mt-1 flex items-center gap-1">
                    <input
                      className="min-w-0 rounded border border-[var(--line)] px-2 py-1 text-[var(--foreground)]"
                      inputMode="decimal"
                      name="section-route-height"
                      type="text"
                      value={sectionRouteHeightEditor.heightInput}
                      onChange={(event) =>
                        handleSectionRouteHeightInputChange(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleSaveSectionRouteHeightEdit();
                        }
                      }}
                    />
                    <span>m</span>
                  </span>
                </label>
                <button
                  className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)]"
                  type="button"
                  onClick={handleSaveSectionRouteHeightEdit}
                >
                  Guardar
                </button>
              </div>
              {sectionRouteHeightEditor.error ? (
                <div className="mt-2 text-red-700">
                  {sectionRouteHeightEditor.error}
                </div>
              ) : null}
            </div>
          ) : null}
            {sectionLinkDraft && activeBase?.id === sectionLinkDraft.planBaseId ? (
              <div className="absolute left-4 top-4 z-10 max-w-[360px] rounded border border-[var(--line)] bg-white/95 px-3 py-2 text-xs shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      Ubicar corte: {sectionNames[sectionLinkDraft.sectionBaseId] ?? "Corte"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[var(--muted)]">
                      <span className={sectionLinkDraft.step === "start" ? "font-semibold text-[var(--foreground)]" : undefined}>
                        1. Marca el inicio
                      </span>
                      <span className={sectionLinkDraft.step === "end" ? "font-semibold text-[var(--foreground)]" : undefined}>
                        2. Marca el final
                      </span>
                      <span className={sectionLinkDraft.step === "side" ? "font-semibold text-[var(--foreground)]" : undefined}>
                        3. Elegí la flecha que indica el sentido de observación
                      </span>
                    </div>
                  </div>
                  <button
                    className="rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)]"
                    type="button"
                    onClick={handleCancelSectionLinkDraft}
                  >
                    Cancelar
                  </button>
                </div>
                {sectionLinkDraft.step === "side" ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[var(--muted)]">
                      {sectionLinkDraft.viewSide ? "Flecha seleccionada" : "Elegí una flecha"}
                    </span>
                    <button
                      className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:bg-white disabled:text-[var(--muted)]"
                      disabled={!canSaveSectionLink}
                      type="button"
                      onClick={handleSaveSectionLink}
                    >
                      Guardar vinculo
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {sectionRegistrationDraft &&
            activeBase?.id === sectionRegistrationDraft.sectionBaseId ? (
              <div className="absolute left-4 top-4 z-10 max-w-[420px] rounded border border-[var(--line)] bg-white/95 px-3 py-2 text-xs shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      Correspondencia: {sectionNames[sectionRegistrationDraft.sectionBaseId] ?? "Corte"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[var(--muted)]">
                      <span className={sectionRegistrationDraft.step === "start" ? "font-semibold text-[var(--foreground)]" : undefined}>
                        1. Marcá en el Corte el punto correspondiente a A
                      </span>
                      <span className={sectionRegistrationDraft.step === "end" ? "font-semibold text-[var(--foreground)]" : undefined}>
                        2. Marcá en el Corte el punto correspondiente a B
                      </span>
                      <span className={sectionRegistrationDraft.step === "side" ? "font-semibold text-[var(--foreground)]" : undefined}>
                        3. Elegí la flecha que representa la altura positiva +Z
                      </span>
                      <span className={sectionRegistrationDraft.step === "elevation" ? "font-semibold text-[var(--foreground)]" : undefined}>
                        4. Cota del nivel de referencia
                      </span>
                    </div>
                  </div>
                  <button
                    className="rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)]"
                    type="button"
                    onClick={handleCancelSectionRegistrationDraft}
                  >
                    Cancelar
                  </button>
                </div>
                {sectionRegistrationDraft.sectionStart &&
                sectionRegistrationDraft.sectionEnd &&
                sectionRegistrationDraft.positiveZSide ? (
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                    <label className="min-w-0 text-[var(--muted)]">
                      <span className="block">Cota del nivel de referencia</span>
                      <span className="mt-1 flex items-center gap-1">
                        <input
                          className="min-w-0 rounded border border-[var(--line)] px-2 py-1 text-[var(--foreground)]"
                          inputMode="decimal"
                          name="section-reference-elevation"
                          placeholder={DEFAULT_REFERENCE_ELEVATION_INPUT}
                          type="text"
                          value={sectionRegistrationDraft.referenceElevationInput}
                          onChange={(event) =>
                            handleReferenceElevationChange(event.target.value)
                          }
                        />
                        <span>m</span>
                      </span>
                    </label>
                    <button
                      className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:bg-white disabled:text-[var(--muted)]"
                      disabled={!canSaveSectionRegistration}
                      type="button"
                      onClick={handleSaveSectionRegistration}
                    >
                      Guardar correspondencia
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 text-[var(--muted)]">
                    {sectionRegistrationDraft.positiveZSide
                      ? "Flecha +Z seleccionada"
                      : "Elegí la flecha +Z despues de marcar A y B"}
                  </div>
                )}
              </div>
            ) : null}
            {isTechnicalReviewCanvasVisible ? (
              <TechnicalReviewCanvas
                axonometricView={standardTechnicalAxonometricView}
                sectionView={activeStandardTechnicalSectionView}
                selectedHeightTarget={selectedSectionRouteHeightTarget}
                viewId={activeReviewViewId}
                onHeightTargetSelect={handleSectionRouteHeightTargetSelect}
              />
            ) : (
              <>
            <div
              className={`absolute inset-0 ${activeView === "dxf" ? "visible" : "invisible pointer-events-none"}`}
            >
              <DxfViewer
                baseId={activeBase?.id ?? "empty"}
                classificationIndex={classificationIndex}
                constraintDraft={activeConstraintDraft}
                constraints={activeConstraints}
                constraintToolMode={activeBase?.constraintToolMode ?? "none"}
                drawing={drawing}
                equipment={visibleEquipment}
                equipmentDraft={activeEquipmentDraftOverlay}
                equipmentPlacementMode={equipmentPlacementMode}
                fitNonce={activeBase?.visual.dxfFitNonce ?? 0}
                hoveredEquipmentId={hoveredEquipmentId}
                highlightedRouteSegmentIds={highlightedRouteSegmentIds}
                invalidRouteSegmentIds={routeInvalidSegmentIds}
                isRouteEditing={routePhysicalEditingEnabled}
                isPointSelectionActive={
                  activeBase ? activeBase.calibration.toolMode !== "idle" : false
                }
                overlay={activeOverlay}
                pendingEntityIds={pendingEntityIds}
                routeDraft={activeRouteDraftOverlay}
                routeIntentConnections={activeRouteIntentConnections}
                routeIntentDraft={activeRouteIntentDraftOverlay}
                routeNetwork={activeRouteNetwork}
                routeProposal={visibleRouteProposalOverlay}
                routeProposalOutdated={isRouteProposalOutdated}
                routeToolMode={routeToolMode}
                savedView={activeBase?.visual.dxfView ?? null}
                selectedConstraintId={activeBase?.selectedConstraintId ?? null}
                selectedEquipmentId={activeBase?.selectedEquipmentId ?? null}
                selectedEntityIds={activeBase?.selectedEntityIds ?? []}
                selectedRouteEdit={selectedRouteEdit}
                sectionLinkDraft={activeSectionLinkDraftOverlay}
                sectionLinkMode={sectionLinkMode}
                sectionLinks={visiblePlanLinks}
                sectionNames={sectionNames}
                sectionRegistrationDraft={activeSectionRegistrationDraftOverlay}
                sectionRegistrationMode={sectionRegistrationMode}
                sectionRegistrationSaved={activeSectionRegistrationSavedOverlay}
                sectionRouteProjection={activeSectionRouteProjection}
                selectedSectionRouteHeightTarget={
                  isReviewStage ? selectedSectionRouteHeightTarget : null
                }
                selectionMode={activeBase?.selectionMode ?? "pan"}
                semanticViewMode={activeBase?.semanticViewMode ?? "original"}
                showConstraints={activeBase?.showConstraints ?? true}
                showEquipment={activeBase?.showEquipment ?? true}
                showRoute={activeBase?.showRoute ?? true}
                visibleLayers={activeBase?.visibleLayers ?? {}}
                onConstraintCreateRectangle={handleConstraintCreateRectangle}
                onConstraintDraftPoint={handleConstraintDraftPoint}
                onConstraintMove={handleConstraintMove}
                onConstraintMoveVertex={handleConstraintMoveVertex}
                onConstraintPreviewPoint={handleConstraintPreviewPoint}
                onConstraintSelect={handleSelectConstraint}
                onCursorChange={setCursor}
                onEntityToggle={handleEntityToggle}
                onEquipmentHover={setHoveredEquipmentId}
                onEquipmentPoint={handleEquipmentPoint}
                onEquipmentPreview={handleEquipmentPreview}
                onEquipmentSelect={handleSelectEquipment}
                onPhysicalRouteElementSelect={handleSelectPhysicalRouteElement}
                onPhysicalRouteNodeMove={handleMovePhysicalRouteNode}
                onPhysicalRouteVertexInsert={handleInsertPhysicalRouteVertex}
                onPhysicalRouteVertexMove={handleMovePhysicalRouteVertex}
                onRectangleSelect={handleRectangleSelect}
                onRoutePoint={handleRoutePoint}
                onRoutePreview={handleRoutePreview}
                onSectionLinkHover={setHoveredSectionLinkId}
                onSectionLinkPoint={handleSectionLinkPoint}
                onSectionLinkPreview={handleSectionLinkPreview}
                onSectionLinkSide={handleSectionLinkSide}
                onSectionLinkOpen={handleOpenSectionFromLink}
                onSectionRegistrationPoint={handleSectionRegistrationPoint}
                onSectionRegistrationPreview={handleSectionRegistrationPreview}
                onSectionRegistrationSide={handleSectionRegistrationSide}
                onSectionRouteHeightTargetSelect={
                  isReviewStage ? handleSectionRouteHeightTargetSelect : undefined
                }
                onSourcePoint={(point) => handleSourcePoint("dxf", point)}
                onViewChange={handleDxfViewChange}
                highlightedSectionLinkId={highlightedSectionLinkId}
                hoveredSectionLinkId={hoveredSectionLinkId}
              />
            </div>
            <div
              className={`absolute inset-0 ${activeView === "pdf" ? "visible" : "invisible pointer-events-none"}`}
            >
              <PdfViewer
                activePage={activePdfPage}
                baseId={activeBase?.id ?? "empty"}
                constraintDraft={activeConstraintDraft}
                constraints={activeConstraints}
                constraintToolMode={activeBase?.constraintToolMode ?? "none"}
                documentProxy={pdfDocument?.proxy ?? null}
                equipment={visibleEquipment}
                equipmentDraft={activeEquipmentDraftOverlay}
                equipmentPlacementMode={equipmentPlacementMode}
                fitNonce={activeBase?.visual.pdfFitNonce ?? 0}
                hoveredEquipmentId={hoveredEquipmentId}
                highlightedRouteSegmentIds={highlightedRouteSegmentIds}
                invalidRouteSegmentIds={routeInvalidSegmentIds}
                isRouteEditing={routePhysicalEditingEnabled}
                isPointSelectionActive={
                  activeBase ? activeBase.calibration.toolMode !== "idle" : false
                }
                overlay={activeOverlay}
                routeDraft={activeRouteDraftOverlay}
                routeIntentConnections={activeRouteIntentConnections}
                routeIntentDraft={activeRouteIntentDraftOverlay}
                routeNetwork={activeRouteNetwork}
                routeProposal={visibleRouteProposalOverlay}
                routeProposalOutdated={isRouteProposalOutdated}
                routeToolMode={routeToolMode}
                savedView={activeBase?.visual.pdfView ?? null}
                selectedConstraintId={activeBase?.selectedConstraintId ?? null}
                selectedEquipmentId={activeBase?.selectedEquipmentId ?? null}
                selectedRouteEdit={selectedRouteEdit}
                sectionLinkDraft={activeSectionLinkDraftOverlay}
                sectionLinkMode={sectionLinkMode}
                sectionLinks={visiblePlanLinks}
                sectionNames={sectionNames}
                sectionRegistrationDraft={activeSectionRegistrationDraftOverlay}
                sectionRegistrationMode={sectionRegistrationMode}
                sectionRegistrationSaved={activeSectionRegistrationSavedOverlay}
                sectionRouteProjection={activeSectionRouteProjection}
                selectedSectionRouteHeightTarget={
                  isReviewStage ? selectedSectionRouteHeightTarget : null
                }
                showConstraints={activeBase?.showConstraints ?? true}
                showEquipment={activeBase?.showEquipment ?? true}
                showRoute={activeBase?.showRoute ?? true}
                onConstraintCreateRectangle={handleConstraintCreateRectangle}
                onConstraintDraftPoint={handleConstraintDraftPoint}
                onConstraintMove={handleConstraintMove}
                onConstraintMoveVertex={handleConstraintMoveVertex}
                onConstraintPreviewPoint={handleConstraintPreviewPoint}
                onConstraintSelect={handleSelectConstraint}
                onCursorChange={setCursor}
                onEquipmentHover={setHoveredEquipmentId}
                onEquipmentPoint={handleEquipmentPoint}
                onEquipmentPreview={handleEquipmentPreview}
                onEquipmentSelect={handleSelectEquipment}
                onPhysicalRouteElementSelect={handleSelectPhysicalRouteElement}
                onPhysicalRouteNodeMove={handleMovePhysicalRouteNode}
                onPhysicalRouteVertexInsert={handleInsertPhysicalRouteVertex}
                onPhysicalRouteVertexMove={handleMovePhysicalRouteVertex}
                onRoutePoint={handleRoutePoint}
                onRoutePreview={handleRoutePreview}
                onSectionLinkHover={setHoveredSectionLinkId}
                onSectionLinkPoint={handleSectionLinkPoint}
                onSectionLinkPreview={handleSectionLinkPreview}
                onSectionLinkSide={handleSectionLinkSide}
                onSectionLinkOpen={handleOpenSectionFromLink}
                onSectionRegistrationPoint={handleSectionRegistrationPoint}
                onSectionRegistrationPreview={handleSectionRegistrationPreview}
                onSectionRegistrationSide={handleSectionRegistrationSide}
                onSectionRouteHeightTargetSelect={
                  isReviewStage ? handleSectionRouteHeightTargetSelect : undefined
                }
                onSourcePoint={(point) => handleSourcePoint("pdf", point)}
                onViewChange={handlePdfViewChange}
                highlightedSectionLinkId={highlightedSectionLinkId}
                hoveredSectionLinkId={hoveredSectionLinkId}
              />
            </div>
              </>
            )}
          </>
          )}
          </div>
        </section>

        {hasAnyBase ? (
        <aside className="flex min-h-0 flex-col overflow-hidden border-l border-[var(--line)] bg-white">
          {activeWorkflowStage === "plan" && activeRightPanelSection !== "scale" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <PlanStagePanel
              isImporting={isImporting}
              planBase={planBase}
              readiness={planStageReadiness}
              sectionBases={orderedBases.filter((base) => base.type === "section")}
              sectionPlanLinks={sectionPlanLinks}
              onAddPlan={() => planInputRef.current?.click()}
              onAddSection={() => sectionInputRef.current?.click()}
              onContinue={handlePlanStageContinue}
              onOpenScale={handleOpenPlanStageScale}
              onSectionAction={handlePlanStageSectionAction}
            />
            {activeBase ? (
              <PlanContextPanel
                activeBase={activeBase}
                activeRegistrationSummary={activeRegistrationSummary}
                activeSectionLink={activeSectionLink}
                hasSectionLinkDraft={Boolean(sectionLinkDraft)}
                hasSectionRegistrationDraft={Boolean(sectionRegistrationDraft)}
                isImporting={isImporting}
                planReady={Boolean(planBase)}
                onFitActiveView={handleFitActiveView}
                onOpenScale={handleOpenPlanStageScale}
                onRemoveActiveBase={handleRemoveActiveBase}
                onRemoveSectionRegistration={handleRemoveSectionRegistration}
                onReplaceActiveBase={() => replaceInputRef.current?.click()}
                onStartSectionLink={handleStartSectionLink}
                onStartSectionRegistration={handleStartSectionRegistration}
                onUnlinkSection={handleUnlinkSection}
                onViewSectionLinkInPlan={handleViewSectionLinkInPlan}
                onViewSectionRegistration={handleViewSectionRegistration}
              />
            ) : null}
          </div>
          ) : null}
          {activeWorkflowStage === "plan" && activeRightPanelSection === "scale" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            {rightPanelSections.find((section) => section.id === "scale")?.content}
          </div>
          ) : activeWorkflowStage !== "plan" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <RightPanelSections
              activeSectionId={activeRightPanelSection}
              sections={activeStagePanelSections}
              onActiveSectionChange={setActiveRightPanelSection}
            />
          </div>
          ) : null}
        </aside>
        ) : null}
      </section>
    </main>
  );
}

function EmptyPlanStart({
  isImporting,
  onAddPlan,
  onAddSection,
}: {
  isImporting: boolean;
  onAddPlan: () => void;
  onAddSection: () => void;
}) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center bg-[#eef0ec] px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <h2 className="text-2xl font-semibold tracking-normal">
          Comenzá cargando la Planta
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">DXF o PDF</p>
        <button
          className="mt-6 w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
          disabled={isImporting}
          type="button"
          onClick={onAddPlan}
        >
          Cargar Planta
        </button>
        <button
          className="mt-2 w-full rounded border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:bg-[#f5f6f7]"
          disabled={isImporting}
          type="button"
          onClick={onAddSection}
        >
          Agregar Corte (opcional)
        </button>
      </div>
    </div>
  );
}

function RouteSectionPreviewPanel({ onGoToPlan }: { onGoToPlan: () => void }) {
  return (
    <section className="bg-white px-4 py-3 text-sm">
      <h2 className="sr-only">Recorrido</h2>
      <div className="rounded border border-[var(--line)] px-3 py-2 text-xs">
        <div className="font-semibold">Corte en preview</div>
        <p className="mt-1 text-[var(--muted)]">
          El recorrido se genera y edita desde la Planta.
        </p>
        <button
          className="mt-2 rounded border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--accent)]"
          type="button"
          onClick={onGoToPlan}
        >
          Ir a Planta
        </button>
      </div>
    </section>
  );
}

function PlanContextPanel({
  activeBase,
  activeRegistrationSummary,
  activeSectionLink,
  hasSectionLinkDraft,
  hasSectionRegistrationDraft,
  isImporting,
  planReady,
  onFitActiveView,
  onOpenScale,
  onRemoveActiveBase,
  onRemoveSectionRegistration,
  onReplaceActiveBase,
  onStartSectionLink,
  onStartSectionRegistration,
  onUnlinkSection,
  onViewSectionLinkInPlan,
  onViewSectionRegistration,
}: {
  activeBase: WorkbenchBase;
  activeRegistrationSummary: SectionRegistrationSummary | null;
  activeSectionLink: SectionPlanLink | null;
  hasSectionLinkDraft: boolean;
  hasSectionRegistrationDraft: boolean;
  isImporting: boolean;
  planReady: boolean;
  onFitActiveView: () => void;
  onOpenScale: (baseId: string | null, startCalibration?: boolean) => void;
  onRemoveActiveBase: () => void;
  onRemoveSectionRegistration: (link: SectionPlanLink) => void;
  onReplaceActiveBase: () => void;
  onStartSectionLink: (sectionBaseId: string, edit?: boolean) => void;
  onStartSectionRegistration: (link: SectionPlanLink, edit?: boolean) => void;
  onUnlinkSection: (sectionBaseId: string) => void;
  onViewSectionLinkInPlan: (link: SectionPlanLink) => void;
  onViewSectionRegistration: (link: SectionPlanLink) => void;
}) {
  const isSection = activeBase.type === "section";
  const sectionStatus =
    activeRegistrationSummary?.status ??
    (activeSectionLink ? "Vinculado · Sin correspondencia" : "Sin vincular");
  const hasCalibration = Boolean(activeBase.calibration.calibration);

  return (
    <section className="border-b border-[var(--line)] bg-white p-3 text-xs">
      <details>
        <summary className="cursor-pointer text-[var(--muted)] hover:text-[var(--foreground)]">
          Opciones de {activeBase.name}
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className="col-span-2 rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)]"
            type="button"
            onClick={onFitActiveView}
          >
            Ajustar a pantalla
          </button>
          {hasCalibration ? (
            <button
              className="col-span-2 rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)]"
              type="button"
              onClick={() => onOpenScale(activeBase.id)}
            >
              Volver a calibrar
            </button>
          ) : null}
          <button
            className="rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[#f5f6f7] disabled:text-[var(--muted)]"
            disabled={isImporting}
            type="button"
            onClick={onReplaceActiveBase}
          >
            Reemplazar
          </button>
          <button
            className="rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[#f5f6f7] disabled:text-[var(--muted)]"
            disabled={isImporting}
            type="button"
            onClick={onRemoveActiveBase}
          >
            Quitar
          </button>
        </div>

        {isSection ? (
          <div className="mt-4 border-t border-[var(--line)] pt-3">
          <h3 className="font-semibold">Vinculación Planta-Corte</h3>
          <p className="mt-1 text-[var(--muted)]">{sectionStatus}</p>

          {activeRegistrationSummary?.lengthLabel ? (
            <div className="mt-3 rounded border border-[var(--line)] px-3 py-2">
              <div className="font-medium">Comparación de medidas</div>
              <div className="mt-1 text-[var(--muted)]">
                {activeRegistrationSummary.lengthLabel}
              </div>
            </div>
          ) : null}

          <div className="mt-3 grid gap-2">
            {activeSectionLink ? (
              <>
                <button
                  className="rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)]"
                  type="button"
                  onClick={() => onViewSectionLinkInPlan(activeSectionLink)}
                >
                  Ver en planta
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)]"
                    type="button"
                    onClick={() => onStartSectionLink(activeBase.id, true)}
                  >
                    Editar vínculo
                  </button>
                  <button
                    className="rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)]"
                    type="button"
                    onClick={() => onUnlinkSection(activeBase.id)}
                  >
                    Desvincular
                  </button>
                </div>
                {activeSectionLink.registration ? (
                  <>
                    <button
                      className="rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)]"
                      type="button"
                      onClick={() => onViewSectionRegistration(activeSectionLink)}
                    >
                      Ver referencias
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)]"
                        type="button"
                        onClick={() =>
                          onStartSectionRegistration(activeSectionLink, true)
                        }
                      >
                        Editar correspondencia
                      </button>
                      <button
                        className="rounded border border-[var(--line)] bg-white px-2 py-1 font-medium hover:border-[var(--accent)]"
                        type="button"
                        onClick={() =>
                          onRemoveSectionRegistration(activeSectionLink)
                        }
                      >
                        Quitar correspondencia
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
                    disabled={hasSectionRegistrationDraft}
                    type="button"
                    onClick={() => onStartSectionRegistration(activeSectionLink)}
                  >
                    Definir correspondencia
                  </button>
                )}
              </>
            ) : (
              <button
                className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
                disabled={!planReady || hasSectionLinkDraft}
                type="button"
                onClick={() => onStartSectionLink(activeBase.id)}
              >
                Vincular con Planta
              </button>
            )}
          </div>
          </div>
        ) : null}
      </details>
    </section>
  );
}

function PlanStagePanel({
  isImporting,
  planBase,
  readiness,
  sectionBases,
  sectionPlanLinks,
  onAddPlan,
  onAddSection,
  onContinue,
  onOpenScale,
  onSectionAction,
}: {
  isImporting: boolean;
  planBase: WorkbenchBase | null;
  readiness: PlanStageReadiness;
  sectionBases: WorkbenchBase[];
  sectionPlanLinks: SectionPlanLink[];
  onAddPlan: () => void;
  onAddSection: () => void;
  onContinue: () => void;
  onOpenScale: (baseId: string | null, startCalibration?: boolean) => void;
  onSectionAction: (baseId: string | null) => void;
}) {
  const planLoaded = Boolean(planBase);
  const planScaleReference = calibrationReferenceLabel(planBase);
  const pendingSection =
    readiness.sections.find((section) => section.status !== "ready") ??
    null;
  const primaryAction = !planLoaded
    ? {
        disabled: isImporting,
        label: "Cargar Planta",
        onClick: onAddPlan,
      }
    : readiness.plan.status !== "ready"
      ? {
          disabled: isImporting,
          label: "Calibrar escala",
          onClick: () => onOpenScale(readiness.plan.baseId),
        }
      : pendingSection
        ? {
            disabled: isImporting,
            label: planSectionActionLabel(pendingSection.reason),
            onClick: () => onSectionAction(pendingSection.baseId),
          }
        : readiness.canContinueToEquipment
          ? {
              disabled: false,
              label: "Continuar a Artefactos",
              onClick: onContinue,
            }
          : null;
  const statusLines: PlanStatusLine[] = [
    planLoaded
      ? { complete: true, key: "plan", text: "Planta" }
      : { key: "plan", text: "Planta pendiente", warning: true },
    ...(planLoaded
      ? [
          planScaleReference
            ? {
                complete: true,
                key: "plan-scale",
                text: `Escala · ${planScaleReference}`,
              }
            : {
                key: "plan-scale",
                text: "Escala pendiente",
                warning: true,
              },
        ]
      : []),
    ...(sectionBases.length > 0
      ? sectionBases.flatMap((sectionBase) =>
          sectionStatusLines({
            link:
              sectionPlanLinks.find(
                (link) => link.sectionBaseId === sectionBase.id,
              ) ?? null,
            planBase,
            readiness:
              readiness.sections.find(
                (section) => section.baseId === sectionBase.id,
              ) ?? null,
            sectionBase,
          }),
        )
      : [{ key: "section-optional", muted: true, text: "Corte opcional" }]),
  ];

  return (
    <section
      className="shrink-0 border-b border-[var(--line)] bg-white p-3 text-xs"
      data-plan-stage-flow="true"
    >
      <h2 className="text-sm font-semibold">Plano</h2>

      <div className="mt-3 space-y-1.5">
        {statusLines.map((line) => (
          <PlanStatusRow key={line.key} line={line} />
        ))}
      </div>

      {primaryAction ? (
        <button
          className="mt-3 w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 font-semibold text-white hover:bg-[var(--accent-strong)]"
          disabled={primaryAction.disabled}
          type="button"
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </button>
      ) : null}

      {planLoaded && sectionBases.length === 0 ? (
        <button
          className="mt-2 w-full rounded border border-[var(--line)] bg-white px-3 py-2 font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:bg-[#f5f6f7]"
          disabled={isImporting}
          type="button"
          onClick={onAddSection}
        >
          Agregar Corte
        </button>
      ) : null}
    </section>
  );
}

type PlanStatusLine = {
  complete?: boolean;
  key: string;
  muted?: boolean;
  text: string;
  warning?: boolean;
};

function PlanStatusRow({ line }: { line: PlanStatusLine }) {
  const textClassName = line.muted
    ? "text-[var(--muted)]"
    : line.warning
      ? "text-[var(--warning)]"
      : "text-[var(--foreground)]";

  return (
    <div className={`flex min-h-6 items-center gap-2 ${textClassName}`}>
      <span
        aria-hidden="true"
        className={`w-4 shrink-0 text-center ${
          line.complete ? "text-[#24713a]" : "text-[var(--muted)]"
        }`}
      >
        {line.complete ? "✓" : "·"}
      </span>
      <span className="min-w-0 truncate">{line.text}</span>
    </div>
  );
}

function sectionStatusLines({
  link,
  planBase,
  readiness,
  sectionBase,
}: {
  link: SectionPlanLink | null;
  planBase: WorkbenchBase | null;
  readiness: PlanStageReadiness["sections"][number] | null;
  sectionBase: WorkbenchBase;
}): PlanStatusLine[] {
  if (!calibrationScaleMetersPerSourceUnit(sectionBase)) {
    return [
      {
        key: `${sectionBase.id}:scale`,
        text: `${sectionBase.name} · escala pendiente`,
        warning: true,
      },
    ];
  }

  if (!link || !planBase || link.planBaseId !== planBase.id) {
    return [
      { complete: true, key: `${sectionBase.id}:base`, text: sectionBase.name },
      {
        key: `${sectionBase.id}:link`,
        text: "Vinculación pendiente",
        warning: true,
      },
    ];
  }

  if (!link.registration) {
    return [
      { complete: true, key: `${sectionBase.id}:base`, text: sectionBase.name },
      {
        key: `${sectionBase.id}:registration`,
        text: "Correspondencia pendiente",
        warning: true,
      },
    ];
  }

  if (readiness?.status === "ready") {
    return [
      {
        complete: true,
        key: `${sectionBase.id}:ready`,
        text: `${sectionBase.name} · vinculado`,
      },
    ];
  }

  return [
    {
      key: `${sectionBase.id}:alignment`,
      text: `${sectionBase.name} · revisar alineación`,
      warning: true,
    },
  ];
}

function planSectionActionLabel(reason: string) {
  if (reason === "Calibrar escala") {
    return "Calibrar escala";
  }

  if (reason === "Alinear planta-corte") {
    return "Definir correspondencia";
  }

  if (reason === "Revisar alineacion") {
    return "Editar correspondencia";
  }

  return reason;
}

function calibrationReferenceLabel(base: WorkbenchBase | null) {
  const calibration = base?.calibration.calibration;

  return calibration
    ? `${formatNumber(calibration.distanceOriginal)} ${calibration.unit}`
    : null;
}

async function createBaseFromFile(params: {
  createdAt: number;
  file: File;
  id: string;
  name: string;
  sourceType: WorkbenchSource;
  type: WorkbenchBaseType;
}): Promise<WorkbenchBase> {
  if (params.sourceType === "dxf") {
    const source = await params.file.text();
    const drawing = namespaceDrawingEntityIds(
      importDxf(params.file.name, source),
      params.id,
    );

    return createInitialBase({
      ...params,
      drawing,
      pdfDocument: null,
      pdfModel: null,
      visibleLayers: Object.fromEntries(
        drawing.layers.map((layer) => [layer.name, layer.visible]),
      ),
    });
  }

  const pdfDocument = await importPdfDocument(params.file);

  return createInitialBase({
    ...params,
    drawing: null,
    pdfDocument,
    pdfModel: pdfDocument.model,
    visibleLayers: {},
  });
}

function createInitialBase(params: {
  createdAt: number;
  drawing: NormalizedDrawing | null;
  file: File;
  id: string;
  name: string;
  pdfDocument: ImportedPdfDocument | null;
  pdfModel: PdfDocumentModel | null;
  sourceType: WorkbenchSource;
  type: WorkbenchBaseType;
  visibleLayers: LayerVisibility;
}): WorkbenchBase {
  return {
    id: params.id,
    type: params.type,
    name: params.name,
    sourceType: params.sourceType,
    originalFileName: params.file.name,
    createdAt: params.createdAt,
    drawing: params.drawing,
    pdfDocument: params.pdfDocument,
    pdfModel: params.pdfModel,
    visibleLayers: params.visibleLayers,
    error: null,
    semanticViewMode: "original",
    selectionMode: "pan",
    selectedEntityIds: [],
    semanticInspection: null,
    proposals: [],
    semanticAssignments: [],
    constraints: [],
    constraintDraft: null,
    constraintToolMode: "none",
    selectedConstraintId: null,
    showConstraints: true,
    equipment: [],
    selectedEquipmentId: null,
    showEquipment: true,
    routeIntentConnections: [],
    adoptedDiameterDecisions: [],
    diameterTransitionDecisions: [],
    routeAccessoryProposalDecisions: [],
    routeNetwork: createEmptyRouteNetwork(),
    showRoute: true,
    calibration: createInitialCalibrationState(),
    visual: {
      activePdfPageNumber: 1,
      dxfFitNonce: params.sourceType === "dxf" ? 1 : 0,
      dxfView: null,
      pdfFitNonce: params.sourceType === "pdf" ? 1 : 0,
      pdfView: null,
    },
  };
}

function restorePersistedWorkbenchProject(project: PersistedWorkbenchProject): {
  activeBaseId: string | null;
  bases: WorkbenchBase[];
  hasPdfPlaceholders: boolean;
  routeProposal: AutomaticRouteProposal | null;
} {
  const bases = project.bases.map(restorePersistedWorkbenchBase);
  const baseIds = new Set(bases.map((base) => base.id));
  const activeBaseId =
    project.activeBaseId && baseIds.has(project.activeBaseId)
      ? project.activeBaseId
      : bases[0]?.id ?? null;
  const routeProposal =
    project.routeProposal && baseIds.has(project.routeProposal.baseId)
      ? project.routeProposal
      : null;

  return {
    activeBaseId,
    bases,
    hasPdfPlaceholders: bases.some(
      (base) => base.sourceType === "pdf" && !base.pdfDocument,
    ),
    routeProposal,
  };
}

function restorePersistedWorkbenchBase(
  base: PersistedWorkbenchBase,
): WorkbenchBase {
  return {
    id: base.id,
    type: base.type,
    name: base.name,
    sourceType: base.sourceType,
    originalFileName: base.originalFileName,
    createdAt: base.createdAt,
    drawing: base.sourceType === "dxf" ? base.drawing : null,
    pdfDocument: null,
    pdfModel: base.sourceType === "pdf" ? base.pdfModel : null,
    visibleLayers: base.visibleLayers,
    error:
      base.sourceType === "pdf"
        ? "PDF restaurado desde el proyecto local. Vuelva a cargar el archivo si necesita ver la pagina original."
        : null,
    semanticViewMode: base.semanticViewMode,
    selectionMode: "pan",
    selectedEntityIds: [],
    semanticInspection: base.semanticInspection,
    proposals: base.proposals,
    semanticAssignments: base.semanticAssignments,
    constraints: base.constraints,
    constraintDraft: null,
    constraintToolMode: "none",
    selectedConstraintId: null,
    showConstraints: base.showConstraints,
    equipment: base.equipment,
    selectedEquipmentId: null,
    showEquipment: base.showEquipment,
    routeIntentConnections: base.routeIntentConnections,
    adoptedDiameterDecisions: base.adoptedDiameterDecisions,
    diameterTransitionDecisions: base.diameterTransitionDecisions,
    routeAccessoryProposalDecisions: base.routeAccessoryProposalDecisions,
    routeNetwork: base.routeNetwork,
    showRoute: base.showRoute,
    calibration: restorePersistedCalibrationState(base.calibration),
    visual: {
      activePdfPageNumber: base.visual.activePdfPageNumber,
      dxfFitNonce: base.sourceType === "dxf" ? 1 : 0,
      dxfView: null,
      pdfFitNonce: base.sourceType === "pdf" ? 1 : 0,
      pdfView: null,
    },
  };
}

function restorePersistedCalibrationState(
  state: PersistedSourceCalibrationState,
): SourceCalibrationState {
  return {
    toolMode: "idle",
    calibration: state.calibration,
    draft: state.draft,
    measurementPoints: [],
    error: null,
  };
}

function namespaceDrawingEntityIds(
  drawing: NormalizedDrawing,
  baseId: string,
): NormalizedDrawing {
  return {
    ...drawing,
    entities: drawing.entities.map((entity) => ({
      ...entity,
      id: `${baseId}::${entity.id}`,
    })) as DrawingPrimitive[],
  };
}

function addManualConstraintToBase(
  base: WorkbenchBase,
  params: {
    type: ConstraintType;
    polygon: Point2D[];
  },
): WorkbenchBase {
  const source = base.sourceType;
  const id = `manual:${base.id}:${Date.now()}`;
  const next: ManualConstraint = {
    id,
    source,
    pageNumber: source === "pdf" ? base.visual.activePdfPageNumber : null,
    type: params.type,
    polygon: params.polygon,
    origin: "manual",
    active: true,
  };

  return {
    ...base,
    constraints: [...base.constraints, next],
    constraintDraft: null,
    constraintToolMode: "select",
    selectedConstraintId: id,
  };
}

function validateEquipmentDraft(
  draft: EquipmentDraft,
  plan: WorkbenchBase,
):
  | {
      ok: true;
      bodyPoint?: Point2D;
      connectionPoint: Point2D;
      demandUnit?: DemandUnit;
      demandValue?: number;
      terminalConfig?: EquipmentTerminalConfig;
      wallAnchor?: EquipmentWallAnchor;
    }
  | { ok: false; message: string } {
  if (draft.name.trim().length === 0) {
    return { ok: false, message: "El nombre es obligatorio." };
  }

  if (!draft.connectionPoint) {
    return { ok: false, message: "Marcá el punto de conexión en la Planta." };
  }

  if (pointIsInsideActiveAvoidZone(plan, draft.connectionPoint, draft.pdfPageNumber)) {
    return {
      ok: false,
      message: "El punto de conexión está dentro de una zona prohibida",
    };
  }

  const height = parseConnectionHeightInput(draft.connectionHeightInput);

  if (!height.ok) {
    return height;
  }

  const demand = parseDemandInput(draft);

  if (!demand.ok) {
    return demand;
  }

  const terminal = validateDraftTerminalConfig(draft, height.heightMeters);

  if (!terminal.ok) {
    return terminal;
  }

  const terminalEndHeight =
    terminal.terminalConfig
      ? terminalEndHeightMeters(terminal.terminalConfig) ??
        height.heightMeters
      : height.heightMeters;
  const connectionPoint = withPointZ(
    draft.connectionPoint,
    terminalEndHeight,
  );
  const bodyPoint =
    draft.role === "appliance"
      ? withPointZ(draft.bodyPoint ?? draft.connectionPoint, terminalEndHeight)
      : undefined;
  const wallAnchor =
    draft.role === "appliance"
      ? withEquipmentWallAnchorZ(draft.wallAnchor, terminalEndHeight) ??
        undefined
      : undefined;

  if (
    draft.role === "appliance" &&
    !equipmentWallSupportIsConfirmed({
      bodyPoint,
      connectionPoint,
      wallAnchor,
    })
  ) {
    return {
      ok: false,
      message: "No encontre una pared valida cerca del click.",
    };
  }

  return {
    ok: true,
    bodyPoint,
    connectionPoint,
    demandUnit: demand.demandUnit,
    demandValue: demand.demandValue,
    terminalConfig: terminal.terminalConfig,
    wallAnchor,
  };
}

function draftHasConfirmedWallSupport(draft: EquipmentDraft) {
  if (!draft.connectionPoint || !draft.wallAnchor) {
    return false;
  }

  return equipmentWallSupportIsConfirmed({
    bodyPoint: draft.bodyPoint ?? draft.connectionPoint,
    connectionPoint: draft.connectionPoint,
    wallAnchor: draft.wallAnchor,
  });
}

function equipmentWallSupportIsConfirmed(params: {
  bodyPoint?: Point2D;
  connectionPoint: Point2D;
  wallAnchor?: EquipmentWallAnchor;
}) {
  const wallPoint =
    params.wallAnchor?.status === "anchored"
      ? params.wallAnchor.wallPoint
      : null;

  if (!params.bodyPoint || !wallPoint) {
    return false;
  }

  return (
    routeDistanceBetween(params.bodyPoint, wallPoint) <= 0.000001 &&
    routeDistanceBetween(params.connectionPoint, wallPoint) <= 0.000001
  );
}

function validateDraftTerminalConfig(
  draft: EquipmentDraft,
  connectionHeightMeters: number,
):
  | { ok: true; terminalConfig?: EquipmentTerminalConfig }
  | { ok: false; message: string } {
  if (draft.role !== "appliance") {
    return { ok: true };
  }

  const parsedOffset = parseTerminalLateralOffsetInput(
    draft.terminalLateralOffsetInput,
  );

  if (!parsedOffset.ok) {
    return parsedOffset;
  }

  const base = draftTerminalConfig(draft);

  return {
    ok: true,
    terminalConfig: confirmEquipmentTerminalConfig({
      ...base,
      connectionHeightMeters,
      lateralOffsetMeters: parsedOffset.offsetMeters,
    }),
  };
}

function draftTerminalConfig(draft: EquipmentDraft): EquipmentTerminalConfig {
  return (
    draft.terminalConfig ??
    createEquipmentTerminalConfigFromHeight(
      draft.type,
      draftConnectionHeightMeters(draft),
    )
  );
}

function resolveDraftEquipmentPhysicalPlacement(
  draft: EquipmentDraft,
  point: Point2D,
  plan: WorkbenchBase | null,
): EquipmentPhysicalPlacement {
  const heightMeters = draftConnectionHeightMeters(draft);

  if (!plan || plan.type !== "plan") {
    const freePoint = withPointZ(point, heightMeters);

    return {
      bodyPoint: freePoint,
      connectionPoint: freePoint,
      wallAnchor: null,
    };
  }

  return resolveEquipmentPhysicalPlacement({
    classificationIndex: buildClassificationIndex(plan.semanticAssignments),
    constraints: plan.constraints,
    drawing: plan.drawing,
    heightMeters,
    pageNumber:
      plan.sourceType === "pdf"
        ? draft.pdfPageNumber ?? plan.visual.activePdfPageNumber
        : null,
    point,
    role: draft.role,
    scaleMetersPerSourceUnit: calibrationScaleMetersPerSourceUnit(plan),
    snapToleranceSource: equipmentWallSnapToleranceSource(plan),
    source: plan.sourceType,
  });
}

function resolveDraftEquipmentWallAlternatives(
  draft: EquipmentDraft,
  point: Point2D,
  plan: WorkbenchBase | null,
): EquipmentWallPlacementAlternative[] {
  if (!plan || plan.type !== "plan") {
    return [];
  }

  return resolveEquipmentPhysicalPlacementAlternatives({
    classificationIndex: buildClassificationIndex(plan.semanticAssignments),
    constraints: plan.constraints,
    drawing: plan.drawing,
    heightMeters: draftConnectionHeightMeters(draft),
    pageNumber:
      plan.sourceType === "pdf"
        ? draft.pdfPageNumber ?? plan.visual.activePdfPageNumber
        : null,
    point,
    role: draft.role,
    scaleMetersPerSourceUnit: calibrationScaleMetersPerSourceUnit(plan),
    snapToleranceSource: equipmentWallSnapToleranceSource(plan),
    source: plan.sourceType,
  }).slice(0, 2);
}

function withAutomaticTerminalSide(
  config: EquipmentTerminalConfig,
  placement: EquipmentWallPlacementAlternative,
  clickedPoint: Point2D,
  plan: WorkbenchBase | null,
): EquipmentTerminalConfig {
  if (config.lateralOffsetMeters <= 0) {
    return {
      ...config,
      outletSide: "direct",
    };
  }

  return {
    ...config,
    outletSide: automaticTerminalOutletSide({
      clickedPoint,
      config,
      placement,
      plan,
    }),
  };
}

function automaticTerminalOutletSide(params: {
  clickedPoint: Point2D;
  config: EquipmentTerminalConfig;
  placement: EquipmentWallPlacementAlternative;
  plan: WorkbenchBase | null;
}): EquipmentTerminalOutletSide {
  const orientation = params.placement.wallAnchor.orientationRadians;
  const wallPoint = params.placement.wallAnchor.wallPoint;
  const scale = params.plan ? calibrationScaleMetersPerSourceUnit(params.plan) : null;

  if (
    orientation === null ||
    orientation === undefined ||
    !Number.isFinite(orientation) ||
    !wallPoint ||
    !scale ||
    scale <= 0
  ) {
    return params.config.outletSide === "left" ? "left" : "right";
  }

  const offsetSource = params.config.lateralOffsetMeters / scale;
  const tangent = {
    x: Math.cos(orientation),
    y: Math.sin(orientation),
  };
  const clickAlongWall =
    (params.clickedPoint.x - wallPoint.x) * tangent.x +
    (params.clickedPoint.y - wallPoint.y) * tangent.y;
  const bounds = params.plan ? routeSourceBounds(params.plan) : null;
  const rightPoint = {
    x: wallPoint.x + tangent.x * offsetSource,
    y: wallPoint.y + tangent.y * offsetSource,
  };
  const leftPoint = {
    x: wallPoint.x - tangent.x * offsetSource,
    y: wallPoint.y - tangent.y * offsetSource,
  };
  const rightScore = terminalSideSpaceScore(rightPoint, bounds, clickAlongWall);
  const leftScore = terminalSideSpaceScore(leftPoint, bounds, -clickAlongWall);

  return leftScore > rightScore ? "left" : "right";
}

function terminalSideSpaceScore(
  point: Point2D,
  bounds: Bounds | null,
  clickBias: number,
) {
  const bias = Math.max(clickBias, 0) * 0.01;

  if (!bounds) {
    return bias;
  }

  const inside =
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY;
  const clearance = inside
    ? Math.min(
        point.x - bounds.minX,
        bounds.maxX - point.x,
        point.y - bounds.minY,
        bounds.maxY - point.y,
      )
    : -Math.max(
        bounds.minX - point.x,
        point.x - bounds.maxX,
        bounds.minY - point.y,
        point.y - bounds.maxY,
        0,
      );

  return (inside ? 1000 : 0) + clearance + bias;
}

function withWallPlacementAlternativeZ(
  alternative: EquipmentWallPlacementAlternative,
  heightMeters: number,
): EquipmentWallPlacementAlternative {
  return {
    bodyPoint: withPointZ(alternative.bodyPoint, heightMeters),
    connectionPoint: withPointZ(alternative.connectionPoint, heightMeters),
    wallAnchor:
      withEquipmentWallAnchorZ(alternative.wallAnchor, heightMeters) ??
      alternative.wallAnchor,
  };
}

function equipmentWallSnapToleranceSource(plan: WorkbenchBase) {
  const scaleMetersPerSourceUnit = calibrationScaleMetersPerSourceUnit(plan);

  return scaleMetersPerSourceUnit && scaleMetersPerSourceUnit > 0
    ? 0.5 / scaleMetersPerSourceUnit
    : DEFAULT_WALL_SNAP_TOLERANCE_SOURCE;
}

function parseConnectionHeightInput(
  value: string,
):
  | { ok: true; heightMeters: number }
  | { ok: false; message: string } {
  const normalized = value.trim().replace(",", ".");

  if (normalized.length === 0) {
    return { ok: true, heightMeters: 0 };
  }

  const heightMeters = Number(normalized);

  if (!Number.isFinite(heightMeters) || heightMeters < 0) {
    return {
      ok: false,
      message: "La altura de conexion debe ser un numero finito mayor o igual a cero.",
    };
  }

  return { ok: true, heightMeters };
}

function draftConnectionHeightMeters(draft: EquipmentDraft) {
  const parsedHeight = parseConnectionHeightInput(draft.connectionHeightInput);
  const topHeightMeters = parsedHeight.ok
    ? parsedHeight.heightMeters
    : pointZMeters(draft.connectionPoint ?? draft.previewPoint ?? draft.bodyPoint);

  if (draft.role !== "appliance") {
    return topHeightMeters;
  }

  return (
    terminalEndHeightMeters({
      ...(draft.terminalConfig ?? createSuggestedEquipmentTerminalConfig(draft.type)),
      connectionHeightMeters: topHeightMeters,
    }) ?? topHeightMeters
  );
}

function formatHeightInput(heightMeters: number) {
  return Number.isFinite(heightMeters) ? String(heightMeters) : "0";
}

function parseDemandInput(
  draft: EquipmentDraft,
):
  | { ok: true; demandUnit?: DemandUnit; demandValue?: number }
  | { ok: false; message: string } {
  if (draft.role !== "appliance") {
    return { ok: true };
  }

  const rawValue = draft.demandValueInput.trim();

  if (rawValue.length === 0) {
    return { ok: true };
  }

  const value = Number(rawValue.replace(",", "."));

  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      message: "El consumo debe ser un número finito mayor que cero.",
    };
  }

  return {
    ok: true,
    demandUnit: draft.demandUnit,
    demandValue: value,
  };
}

function pointIsInsideActiveAvoidZone(
  plan: WorkbenchBase,
  point: Point2D,
  pdfPageNumber: number | undefined,
) {
  const source = plan.sourceType;
  const pageNumber =
    source === "pdf" ? pdfPageNumber ?? plan.visual.activePdfPageNumber : null;

  return plan.constraints.some(
    (constraint) =>
      constraint.active &&
      constraint.type === "avoid_zone" &&
      constraintBelongsToSource(constraint, source, pageNumber) &&
      pointInPolygon(point, constraint.polygon),
  );
}

function createDraftFromEquipment(
  equipment: WorkbenchEquipment,
  step: EquipmentDraft["step"],
): EquipmentDraft {
  const terminalConfig =
    equipment.role === "appliance"
      ? equipment.terminalConfig ??
        createEquipmentTerminalConfigFromHeight(
          equipment.type,
          pointZMeters(equipment.connectionPoint),
        )
      : null;

  return {
    editingEquipmentId: equipment.id,
    planBaseId: equipment.planBaseId,
    pdfPageNumber: equipment.pdfPageNumber,
    role: equipment.role,
    type: equipment.type,
    name: equipment.name,
    bodyPoint: equipment.bodyPoint ?? equipment.connectionPoint,
    connectionPoint: equipment.connectionPoint,
    connectionHeightInput: formatHeightInput(
      terminalConfig?.connectionHeightMeters ??
        pointZMeters(equipment.connectionPoint),
    ),
    previewPoint: equipment.connectionPoint,
    terminalConfig,
    terminalLateralOffsetInput: formatHeightInput(
      terminalConfig?.lateralOffsetMeters ?? 0,
    ),
    wallAnchor: equipment.wallAnchor ?? null,
    demandValueInput:
      equipment.demandValue === undefined ? "" : String(equipment.demandValue),
    demandUnit: equipment.demandUnit ?? DEFAULT_DEMAND_UNIT,
    notes: equipment.notes ?? "",
    step,
    error: null,
  };
}

function suggestEquipmentName(
  type: EquipmentType,
  equipment: WorkbenchEquipment[],
) {
  const label = equipmentTypeLabel(type);
  const sameTypeCount = equipment.filter((item) => item.type === type).length;

  return `${label} ${sameTypeCount + 1}`;
}

function compareEquipment(first: WorkbenchEquipment, second: WorkbenchEquipment) {
  if (first.role !== second.role) {
    return first.role === "supply" ? -1 : 1;
  }

  return equipmentCodeForSort(first.type).localeCompare(
    equipmentCodeForSort(second.type),
  );
}

function equipmentCodeForSort(type: EquipmentType) {
  return equipmentDefinitionForType(type).code;
}

function equipmentBelongsToActivePlanPage(
  equipment: WorkbenchEquipment,
  plan: WorkbenchBase,
) {
  if (equipment.planBaseId !== plan.id) {
    return false;
  }

  if (plan.sourceType !== "pdf") {
    return true;
  }

  return equipment.pdfPageNumber === plan.visual.activePdfPageNumber;
}

type EquipmentTerminalRouteNetworkResult =
  | {
      network: ManualRouteNetwork;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

function ensureEquipmentTerminalRoutes(
  plan: WorkbenchBase,
  equipment: WorkbenchEquipment[],
  network: ManualRouteNetwork,
): EquipmentTerminalRouteNetworkResult {
  let nextNetwork = network;

  for (const item of equipment) {
    const result = ensureEquipmentTerminalRoute({
      equipment: item,
      equipmentList: equipment,
      network: nextNetwork,
      plan,
    });

    if (!result.ok) {
      return result;
    }

    nextNetwork = result.network;
  }

  return {
    network: nextNetwork,
    ok: true,
  };
}

function createRouteNetworkWithEquipmentTerminals(
  plan: WorkbenchBase,
  equipment: WorkbenchEquipment[],
): EquipmentTerminalRouteNetworkResult {
  return ensureEquipmentTerminalRoutes(plan, equipment, createEmptyRouteNetwork());
}

function ensureEquipmentTerminalRoute(params: {
  equipment: WorkbenchEquipment;
  equipmentList: WorkbenchEquipment[];
  network: ManualRouteNetwork;
  plan: WorkbenchBase;
}): EquipmentTerminalRouteNetworkResult {
  const equipment = params.equipment;

  if (
    equipment.role !== "appliance" ||
    equipment.terminalConfig?.heightStatus !== "confirmed" ||
    equipment.terminalConfig.connectionHeightMeters === null
  ) {
    return {
      network: params.network,
      ok: true,
    };
  }

  const applianceNode = findRouteNodeByEquipment(params.network, equipment.id);
  const terminalStartNodeId = routeEquipmentTerminalStartNodeId(
    params.plan.id,
    equipment.id,
  );
  const hasOwnedTerminalStart = params.network.nodes.some(
    (node) => node.id === terminalStartNodeId,
  );

  if (
    applianceNode &&
    !hasOwnedTerminalStart &&
    getRouteNodeDegree(params.network, applianceNode.id) > 0
  ) {
    const terminalUpdate = applyConfirmedEquipmentTerminalConnection({
      equipment: params.equipmentList,
      equipmentId: equipment.id,
      network: params.network,
      scaleMetersPerSourceUnit: calibrationScaleMetersPerSourceUnit(params.plan),
    });

    return terminalUpdate.ok
      ? {
          network: terminalUpdate.network,
          ok: true,
        }
      : terminalUpdate;
  }

  const terminalStartPoint = equipmentTerminalStartPoint(params.plan, equipment);

  if (!terminalStartPoint.ok) {
    return terminalStartPoint;
  }

  const applianceNodeId = routeEquipmentNodeId(params.plan.id, equipment.id);
  const terminalSegmentId = routeEquipmentTerminalSegmentId(
    params.plan.id,
    equipment.id,
  );
  const hasApplianceNode = params.network.nodes.some(
    (node) => node.id === applianceNodeId,
  );
  const hasTerminalStartNode = params.network.nodes.some(
    (node) => node.id === terminalStartNodeId,
  );
  const nodes = params.network.nodes.map((node) =>
    node.id === terminalStartNodeId
      ? {
          ...node,
          kind: "route" as const,
          origin: node.origin ?? "manual",
          pdfPageNumber: equipment.pdfPageNumber,
          position: terminalStartPoint.point,
        }
      : node,
  );

  if (!hasTerminalStartNode) {
    nodes.push({
      id: terminalStartNodeId,
      kind: "route",
      origin: "manual",
      pdfPageNumber: equipment.pdfPageNumber,
      position: terminalStartPoint.point,
    });
  }

  if (!hasApplianceNode) {
    nodes.push({
      equipmentId: equipment.id,
      id: applianceNodeId,
      kind: "appliance",
      origin: "manual",
      pdfPageNumber: equipment.pdfPageNumber,
    });
  }

  const hasTerminalSegment = params.network.segments.some(
    (segment) => segment.id === terminalSegmentId,
  );
  const segments = params.network.segments.map((segment) =>
    segment.id === terminalSegmentId
      ? {
          ...segment,
          fromNodeId: terminalStartNodeId,
          origin: segment.origin ?? "manual",
          toNodeId: applianceNodeId,
        }
      : segment,
  );

  if (!hasTerminalSegment) {
    segments.push({
      fromNodeId: terminalStartNodeId,
      id: terminalSegmentId,
      origin: "manual",
      toNodeId: applianceNodeId,
    });
  }

  const network = {
    nodes,
    segments,
  };
  const terminalUpdate = applyConfirmedEquipmentTerminalConnection({
    equipment: params.equipmentList,
    equipmentId: equipment.id,
    network,
    scaleMetersPerSourceUnit: calibrationScaleMetersPerSourceUnit(params.plan),
  });

  return terminalUpdate.ok
    ? {
        network: terminalUpdate.network,
        ok: true,
      }
    : terminalUpdate;
}

function equipmentTerminalStartPoint(
  plan: WorkbenchBase,
  equipment: WorkbenchEquipment,
):
  | {
      ok: true;
      point: Point2D;
    }
  | {
      message: string;
      ok: false;
    } {
  const config = equipment.terminalConfig;

  if (!config) {
    return {
      message: "El artefacto no tiene preset terminal.",
      ok: false,
    };
  }

  const scale = calibrationScaleMetersPerSourceUnit(plan);
  const lateralOffsetMeters = config.lateralOffsetMeters;

  if (lateralOffsetMeters > 0 && (!scale || scale <= 0)) {
    return {
      message:
        "Confirme la escala antes de aplicar el desplazamiento fisico del artefacto.",
      ok: false,
    };
  }

  const orientation = equipment.wallAnchor?.orientationRadians;
  const wallPoint = equipment.wallAnchor?.wallPoint ?? equipment.connectionPoint;
  const tangent =
    orientation !== null &&
    orientation !== undefined &&
    Number.isFinite(orientation)
      ? {
          x: Math.cos(orientation),
          y: Math.sin(orientation),
        }
      : { x: 1, y: 0 };
  const sideSign = terminalOutletSideSign(config.outletSide);
  const offsetSource =
    lateralOffsetMeters > 0 && scale ? lateralOffsetMeters / scale : 0;

  return {
    ok: true,
    point: withPointZ(
      {
        x: wallPoint.x + tangent.x * sideSign * offsetSource,
        y: wallPoint.y + tangent.y * sideSign * offsetSource,
      },
      0,
    ),
  };
}

function terminalOutletSideSign(side: EquipmentTerminalOutletSide) {
  return side === "left" ? -1 : side === "right" ? 1 : 0;
}

function routeTargetPointForEquipment(
  plan: WorkbenchBase,
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment,
) {
  const terminalStartNode = findTerminalStartNodeByEquipment(
    network,
    equipment.id,
  );
  const terminalStartPoint = terminalStartNode
    ? resolveRouteNodePosition(
        terminalStartNode,
        buildEquipmentIndex(plan.equipment),
      )
    : null;

  return terminalStartPoint ?? equipment.connectionPoint;
}

function routeTargetNodeIdForEquipment(
  plan: WorkbenchBase,
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment,
) {
  const terminalStartNode = findTerminalStartNodeByEquipment(
    network,
    equipment.id,
  );

  return terminalStartNode?.id ?? routeEquipmentNodeId(plan.id, equipment.id);
}

function routeIntentConnectionsForActivePage(plan: WorkbenchBase) {
  if (plan.sourceType !== "pdf") {
    return plan.routeIntentConnections;
  }

  return plan.routeIntentConnections.filter(
    (connection) => connection.pdfPageNumber === plan.visual.activePdfPageNumber,
  );
}

function findRouteIntentEndpointAtPoint(
  plan: WorkbenchBase,
  point: Point2D,
  tolerance: number,
  preferredEquipmentId?: string,
): RouteIntentEndpoint | null {
  const preferred = preferredEquipmentId
    ? plan.equipment.find(
        (equipment) =>
          equipment.id === preferredEquipmentId &&
          equipmentBelongsToActivePlanPage(equipment, plan),
      ) ?? null
    : null;

  if (preferred) {
    return {
      equipmentId: preferred.id,
      kind: "equipment",
    };
  }

  const candidates = plan.equipment
    .filter((equipment) => equipmentBelongsToActivePlanPage(equipment, plan))
    .map((equipment) => ({
      distance: routeDistanceBetween(equipment.connectionPoint, point),
      equipment,
    }))
    .filter((candidate) => candidate.distance <= tolerance)
    .sort(
      (first, second) =>
        first.distance - second.distance ||
        routeIntentEndpointRolePriority(first.equipment) -
          routeIntentEndpointRolePriority(second.equipment) ||
        first.equipment.id.localeCompare(second.equipment.id),
    );

  const nearest = candidates[0]?.equipment ?? null;

  return nearest
    ? {
        equipmentId: nearest.id,
        kind: "equipment",
      }
    : null;
}

function validateRouteIntentEndpoints(
  plan: WorkbenchBase,
  from: RouteIntentEndpoint,
  to: RouteIntentEndpoint,
): RouteValidationResult {
  const fromEquipment = plan.equipment.find(
    (equipment) => equipment.id === from.equipmentId,
  );
  const toEquipment = plan.equipment.find(
    (equipment) => equipment.id === to.equipmentId,
  );

  if (!fromEquipment || !toEquipment) {
    return {
      ok: false,
      message: "La conexion referencia equipos que ya no existen.",
    };
  }

  if (routeIntentEndpointKey(from) === routeIntentEndpointKey(to)) {
    return {
      ok: false,
      message: "La conexion necesita dos elementos distintos.",
    };
  }

  if (
    plan.routeIntentConnections.some((connection) =>
      routeIntentConnectionsEqual(connection, from, to),
    )
  ) {
    return {
      ok: false,
      message: "Esa conexion manual ya existe.",
    };
  }

  return { ok: true };
}

function routeIntentEndpointRolePriority(equipment: WorkbenchEquipment) {
  return equipment.role === "supply" ? 0 : 1;
}

type RouteOriginHit = {
  nodeId: string;
  intentEquipmentId: string | null;
  point: Point2D;
  splitSegmentId: string | null;
};

type RouteOriginResult =
  | {
      ok: true;
      hit: RouteOriginHit;
    }
  | {
      ok: false;
      message: string;
    };

type RouteSegmentHit = {
  distance: number;
  point: Point2D;
  segment: ResolvedRouteSegment;
  t: number;
};

type RouteValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

type AppendRouteResult =
  | {
      ok: true;
      network: ManualRouteNetwork;
    }
  | {
      ok: false;
      message: string;
    };

function routeNetworkForActivePage(plan: WorkbenchBase): ManualRouteNetwork {
  if (plan.sourceType !== "pdf") {
    return plan.routeNetwork;
  }

  const activePageNumber = plan.visual.activePdfPageNumber;
  const nodes = plan.routeNetwork.nodes.filter((node) =>
    routeNodeBelongsToPdfPage(node, plan, activePageNumber),
  );
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    segments: plan.routeNetwork.segments.filter(
      (segment) =>
        nodeIds.has(segment.fromNodeId) && nodeIds.has(segment.toNodeId),
    ),
  };
}

function routeNodeBelongsToPdfPage(
  node: RouteNode,
  plan: WorkbenchBase,
  pageNumber: number,
) {
  return routeNodePdfPageNumber(node, plan) === pageNumber;
}

function routeNodeBelongsToActiveSource(node: RouteNode, plan: WorkbenchBase) {
  if (plan.sourceType !== "pdf") {
    return true;
  }

  return routeNodeBelongsToPdfPage(node, plan, plan.visual.activePdfPageNumber);
}

function routeNodePdfPageNumber(node: RouteNode, plan: WorkbenchBase) {
  if (node.kind === "route") {
    return node.pdfPageNumber ?? null;
  }

  if (!node.equipmentId) {
    return null;
  }

  return (
    plan.equipment.find((equipment) => equipment.id === node.equipmentId)
      ?.pdfPageNumber ?? null
  );
}

function routeSegmentPdfPageNumber(
  plan: WorkbenchBase,
  network: ManualRouteNetwork,
  segment: RouteSegment,
) {
  if (plan.sourceType !== "pdf") {
    return null;
  }

  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const fromPage = nodeById.has(segment.fromNodeId)
    ? routeNodePdfPageNumber(nodeById.get(segment.fromNodeId) as RouteNode, plan)
    : null;
  const toPage = nodeById.has(segment.toNodeId)
    ? routeNodePdfPageNumber(nodeById.get(segment.toNodeId) as RouteNode, plan)
    : null;

  if (fromPage !== null && toPage !== null && fromPage === toPage) {
    return fromPage;
  }

  return fromPage ?? toPage;
}

function findInvalidRouteSegmentIds(
  plan: WorkbenchBase,
  network: ManualRouteNetwork,
  classificationIndex: ClassificationIndex,
) {
  const invalidSegmentIds = new Set<string>();

  for (const segment of resolveRouteSegments(network, plan.equipment)) {
    const sourceSegment =
      network.segments.find((item) => item.id === segment.id) ?? segment;
    const pdfPageNumber =
      plan.sourceType === "pdf"
        ? routeSegmentPdfPageNumber(plan, network, sourceSegment)
        : undefined;

    if (
      routeSegmentPlanLegs(segment).some((leg) =>
        segmentViolatesRouteRestrictions(
          plan,
          classificationIndex,
          leg.from,
          leg.to,
          pdfPageNumber,
        ),
      )
    ) {
      invalidSegmentIds.add(segment.id);
    }
  }

  return invalidSegmentIds;
}

function routeLengthLabelForBase(plan: WorkbenchBase) {
  const scale = calibrationScaleMetersPerSourceUnit(plan);

  if (scale === null) {
    return "Escala pendiente";
  }

  return formatMeters(totalRouteLengthSource(plan.routeNetwork, plan.equipment) * scale);
}

function findRouteOriginAtPoint(
  plan: WorkbenchBase,
  point: Point2D,
  tolerance: number,
): RouteOriginResult {
  const supply = plan.equipment.find(
    (equipment) =>
      equipment.role === "supply" &&
      equipmentBelongsToActivePlanPage(equipment, plan) &&
      routeDistanceBetween(equipment.connectionPoint, point) <= tolerance,
  );

  if (supply) {
    return {
      ok: true,
      hit: {
        nodeId: routeEquipmentNodeId(plan.id, supply.id),
        intentEquipmentId: null,
        point: supply.connectionPoint,
        splitSegmentId: null,
      },
    };
  }

  const nodeHit = findRouteNodeAtPoint(
    plan,
    plan.routeNetwork,
    point,
    tolerance,
    { includeAppliances: false },
  );

  if (nodeHit) {
    return {
      ok: true,
      hit: {
        nodeId: nodeHit.node.id,
        intentEquipmentId: null,
        point: nodeHit.point,
        splitSegmentId: null,
      },
    };
  }

  const applianceOrigin = findConnectedApplianceOriginAtPoint(
    plan,
    point,
    tolerance,
  );

  if (applianceOrigin) {
    return applianceOrigin;
  }

  const segmentHit = findRouteSegmentAtPoint(
    plan,
    plan.routeNetwork,
    point,
    tolerance,
  );

  if (!segmentHit) {
    return {
      ok: false,
      message: "Elegi el medidor, un nodo existente o un segmento de la red.",
    };
  }

  const nodeById = new Map(plan.routeNetwork.nodes.map((node) => [node.id, node]));
  const fromNode = nodeById.get(segmentHit.segment.fromNodeId) ?? null;
  const toNode = nodeById.get(segmentHit.segment.toNodeId) ?? null;
  const endpointHit = routeSegmentEndpointHit(
    segmentHit,
    point,
    tolerance,
    fromNode,
    toNode,
  );

  if (endpointHit?.node.kind === "appliance") {
    return {
      ok: false,
      message:
        "El extremo elegido pertenece a un artefacto conectado. Elegi un nodo de derivacion o un punto interior del tramo.",
    };
  }

  if (endpointHit) {
    return {
      ok: true,
      hit: {
        nodeId: endpointHit.node.id,
        intentEquipmentId: null,
        point: endpointHit.point,
        splitSegmentId: null,
      },
    };
  }

  return {
    ok: true,
    hit: {
      nodeId: createRouteNodeId(plan.id),
      intentEquipmentId: null,
      point: segmentHit.point,
      splitSegmentId: segmentHit.segment.id,
    },
  };
}

function findConnectedApplianceOriginAtPoint(
  plan: WorkbenchBase,
  point: Point2D,
  tolerance: number,
): RouteOriginResult | null {
  const connectedIds = getConnectedApplianceEquipmentIds(
    plan.routeNetwork,
    plan.equipment,
  );
  const candidates = plan.equipment
    .filter(
      (equipment) =>
        equipment.role === "appliance" &&
        connectedIds.has(equipment.id) &&
        equipmentBelongsToActivePlanPage(equipment, plan),
    )
    .map((equipment) => ({
      distance: routeDistanceBetween(equipment.connectionPoint, point),
      equipment,
    }))
    .filter((candidate) => candidate.distance <= tolerance)
    .sort(
      (first, second) =>
        first.distance - second.distance ||
        first.equipment.id.localeCompare(second.equipment.id),
    );

  if (candidates.length === 0) {
    return null;
  }

  for (const candidate of candidates) {
    const origin = resolveTerminalApplianceBranchOrigin({
      applianceEquipmentId: candidate.equipment.id,
      createSplitNodeId: () => createRouteNodeId(plan.id),
      equipment: plan.equipment,
      network: plan.routeNetwork,
      tolerance,
    });

    if (!origin.ok) {
      return {
        ok: false,
        message: origin.message,
      };
    }

    return {
      ok: true,
      hit: {
        nodeId: origin.nodeId,
        intentEquipmentId: candidate.equipment.id,
        point: origin.point,
        splitSegmentId: origin.splitSegmentId,
      },
    };
  }

  return null;
}

function findRouteTargetAtPoint(
  plan: WorkbenchBase,
  draft: RouteDraft,
  point: Point2D,
  tolerance: number,
) {
  if (!draft.targetEquipmentId) {
    return null;
  }

  const target =
    plan.equipment.find((equipment) => equipment.id === draft.targetEquipmentId) ??
    null;

  if (!target || target.role !== "appliance") {
    return null;
  }

  if (
    plan.sourceType === "pdf" &&
    target.pdfPageNumber !== (draft.pdfPageNumber ?? plan.visual.activePdfPageNumber)
  ) {
    return null;
  }

  const targetPoint = routeTargetPointForEquipment(
    plan,
    plan.routeNetwork,
    target,
  );

  return routeDistanceBetween(target.connectionPoint, point) <= tolerance ||
    routeDistanceBetween(targetPoint, point) <= tolerance
    ? targetPoint
    : null;
}

function findRouteNodeAtPoint(
  plan: WorkbenchBase,
  network: ManualRouteNetwork,
  point: Point2D,
  tolerance: number,
  options: { includeAppliances?: boolean } = {},
) {
  const equipmentById = buildEquipmentIndex(plan.equipment);
  const includeAppliances = options.includeAppliances ?? true;
  let nearest:
    | {
        distance: number;
        node: RouteNode;
        point: Point2D;
      }
    | null = null;

  for (const node of network.nodes) {
    if (!includeAppliances && node.kind === "appliance") {
      continue;
    }

    if (!routeNodeBelongsToActiveSource(node, plan)) {
      continue;
    }

    const position = resolveRouteNodePosition(node, equipmentById);

    if (!position) {
      continue;
    }

    const distance = routeDistanceBetween(position, point);

    if (distance <= tolerance && (!nearest || distance < nearest.distance)) {
      nearest = {
        distance,
        node,
        point: position,
      };
    }
  }

  return nearest;
}

function routeSegmentEndpointHit(
  segmentHit: RouteSegmentHit,
  clickedPoint: Point2D,
  tolerance: number,
  fromNode: RouteNode | null,
  toNode: RouteNode | null,
) {
  const candidates = [
    fromNode
      ? {
          node: fromNode,
          point: segmentHit.segment.from,
          distance: Math.min(
            routeDistanceBetween(segmentHit.point, segmentHit.segment.from),
            routeDistanceBetween(clickedPoint, segmentHit.segment.from),
          ),
        }
      : null,
    toNode
      ? {
          node: toNode,
          point: segmentHit.segment.to,
          distance: Math.min(
            routeDistanceBetween(segmentHit.point, segmentHit.segment.to),
            routeDistanceBetween(clickedPoint, segmentHit.segment.to),
          ),
        }
      : null,
  ]
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    )
    .filter((candidate) => candidate.distance <= tolerance)
    .sort((first, second) => first.distance - second.distance);

  return candidates[0] ?? null;
}

function findRouteSegmentAtPoint(
  plan: WorkbenchBase,
  network: ManualRouteNetwork,
  point: Point2D,
  tolerance: number,
): RouteSegmentHit | null {
  let nearest: RouteSegmentHit | null = null;

  for (const segment of resolveRouteSegments(network, plan.equipment)) {
    if (!routeSegmentBelongsToActiveSource(plan, plan.routeNetwork, segment)) {
      continue;
    }

    const projection = projectPointToRouteSegmentPath(point, segment);

    if (
      projection.distance <= tolerance &&
      (!nearest || projection.distance < nearest.distance)
    ) {
      nearest = {
        distance: projection.distance,
        point: projection.point,
        segment,
        t: projection.t,
      };
    }
  }

  return nearest;
}

function routeSegmentBelongsToActiveSource(
  plan: WorkbenchBase,
  network: ManualRouteNetwork,
  segment: RouteSegment,
) {
  if (plan.sourceType !== "pdf") {
    return true;
  }

  return (
    routeSegmentPdfPageNumber(plan, network, segment) ===
    plan.visual.activePdfPageNumber
  );
}

function lastRouteDraftPoint(draft: RouteDraft) {
  return draft.routePoints[draft.routePoints.length - 1] ?? draft.originPoint;
}

function validateRouteDraftForSave(
  plan: WorkbenchBase,
  classificationIndex: ClassificationIndex,
  draft: RouteDraft,
): RouteValidationResult {
  const points = routeDraftPolyline(plan, draft);

  if (points.length < 2) {
    return {
      ok: false,
      message: "El recorrido necesita origen y destino.",
    };
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const validation = validateDraftSegment(
      plan,
      classificationIndex,
      draft,
      points[index],
      points[index + 1],
      MIN_SECTION_LINK_LENGTH,
      index === points.length - 2,
    );

    if (!validation.ok) {
      return validation;
    }
  }

  return { ok: true };
}

function routeDraftPolyline(plan: WorkbenchBase, draft: RouteDraft) {
  const target = draft.targetEquipmentId
    ? plan.equipment.find((equipment) => equipment.id === draft.targetEquipmentId)
    : null;
  const points: Point2D[] = [];

  if (draft.originPoint) {
    points.push(draft.originPoint);
  }

  points.push(...draft.routePoints);

  if (target) {
    points.push(routeTargetPointForEquipment(plan, plan.routeNetwork, target));
  }

  return points;
}

function validateDraftSegment(
  plan: WorkbenchBase,
  classificationIndex: ClassificationIndex,
  draft: RouteDraft,
  from: Point2D,
  to: Point2D,
  tolerance: number,
  isFinal: boolean,
): RouteValidationResult {
  if (routeDistanceBetween(from, to) <= MIN_SECTION_LINK_LENGTH) {
    return {
      ok: false,
      message: "El tramo necesita dos puntos separados.",
    };
  }

  if (
    segmentViolatesRouteRestrictions(
      plan,
      classificationIndex,
      from,
      to,
      plan.sourceType === "pdf" ? draft.pdfPageNumber : undefined,
    )
  ) {
    return {
      ok: false,
      message: "El recorrido atraviesa una zona prohibida",
    };
  }

  if (segmentCrossesExistingRoute(plan, draft, from, to, tolerance)) {
    return {
      ok: false,
      message: "El recorrido cruza la red sin una derivacion",
    };
  }

  if (!isFinal) {
    const nodeHit = findRouteNodeAtPoint(plan, plan.routeNetwork, to, tolerance);

    if (nodeHit && nodeHit.node.id !== draft.originNodeId) {
      return {
        ok: false,
        message: "El recorrido crea un ciclo",
      };
    }
  }

  return { ok: true };
}

function segmentViolatesRouteRestrictions(
  plan: WorkbenchBase,
  classificationIndex: ClassificationIndex,
  from: Point2D,
  to: Point2D,
  pdfPageNumber: number | null | undefined,
  marginSource = 0,
) {
  return createAutomaticRouteRestrictions(
    plan,
    classificationIndex,
    pdfPageNumber,
  ).some((restriction) => {
    if (restriction.kind === "polygon") {
      if (segmentIntersectsPolygon(from, to, restriction.polygon)) {
        return true;
      }

      return (
        marginSource > 0 &&
        distanceFromSegmentToPolygon(from, to, restriction.polygon) <
          marginSource - MIN_SECTION_LINK_LENGTH
      );
    }

    if (segmentsIntersect(from, to, restriction.from, restriction.to)) {
      return true;
    }

    return (
      marginSource > 0 &&
      segmentToSegmentDistance(from, to, restriction.from, restriction.to) <
        marginSource - MIN_SECTION_LINK_LENGTH
    );
  });
}

function createAutomaticRouteRestrictions(
  plan: WorkbenchBase,
  classificationIndex: ClassificationIndex,
  pdfPageNumber: number | null | undefined,
): AutomaticRouteRestriction[] {
  const pageNumber =
    plan.sourceType === "pdf"
      ? pdfPageNumber ?? plan.visual.activePdfPageNumber
      : null;
  const manualRestrictions: AutomaticRouteRestriction[] = plan.constraints
    .filter(
      (constraint) =>
        constraint.active &&
        constraintBelongsToSource(constraint, plan.sourceType, pageNumber),
    )
    .map((constraint) => ({
      id: constraint.id,
      kind: "polygon" as const,
      polygon: constraint.polygon,
    }));

  if (!plan.drawing) {
    return manualRestrictions;
  }

  const hardStructureRestrictions = plan.drawing.entities.flatMap((entity) =>
    classificationIndex[entity.id]?.category === "hard_structure"
      ? routeRestrictionsForPrimitive(entity)
      : [],
  );

  return [...manualRestrictions, ...hardStructureRestrictions];
}

function routeRestrictionsForPrimitive(
  entity: DrawingPrimitive,
): AutomaticRouteRestriction[] {
  if (entity.kind === "line") {
    return routeDistanceBetween(entity.start, entity.end) <= MIN_SECTION_LINK_LENGTH
      ? []
      : [
          {
            from: entity.start,
            id: `hard-structure:${entity.id}:line`,
            kind: "segment",
            to: entity.end,
          },
        ];
  }

  if (entity.kind === "polyline") {
    const restrictions: AutomaticRouteRestriction[] = [];

    if (entity.closed && isValidPolygon(entity.points)) {
      restrictions.push({
        id: `hard-structure:${entity.id}:polygon`,
        kind: "polygon",
        polygon: entity.points,
      });
    }

    for (const [index, segment] of primitivePolylineSegments(entity.points, entity.closed).entries()) {
      restrictions.push({
        from: segment.from,
        id: `hard-structure:${entity.id}:segment:${index}`,
        kind: "segment",
        to: segment.to,
      });
    }

    return restrictions;
  }

  if (entity.kind === "hatch") {
    return isValidPolygon(entity.outerRing)
      ? [
          {
            id: `hard-structure:${entity.id}:hatch`,
            kind: "polygon",
            polygon: entity.outerRing,
          },
        ]
      : [];
  }

  if (entity.kind === "arc") {
    return primitivePolylineSegments(sampleArc(entity), false).map(
      (segment, index) => ({
        from: segment.from,
        id: `hard-structure:${entity.id}:arc:${index}`,
        kind: "segment" as const,
        to: segment.to,
      }),
    );
  }

  return [];
}

function primitivePolylineSegments(points: Point2D[], closed: boolean) {
  const segments: Array<{ from: Point2D; to: Point2D }> = [];
  const count = closed ? points.length : points.length - 1;

  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];

    if (from && to && routeDistanceBetween(from, to) > MIN_SECTION_LINK_LENGTH) {
      segments.push({ from, to });
    }
  }

  return segments;
}

function sampleArc(entity: Extract<DrawingPrimitive, { kind: "arc" }>) {
  const sweep = normalizeArcSweep(entity.startAngle, entity.endAngle);
  const segmentCount = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
  const points: Point2D[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const angle = entity.startAngle + (sweep * index) / segmentCount;
    points.push({
      x: entity.center.x + Math.cos(angle) * entity.radius,
      y: entity.center.y + Math.sin(angle) * entity.radius,
    });
  }

  return points;
}

function normalizeArcSweep(startAngle: number, endAngle: number) {
  let sweep = endAngle - startAngle;

  while (sweep <= 0) {
    sweep += Math.PI * 2;
  }

  return sweep;
}

function distanceFromSegmentToPolygon(
  from: Point2D,
  to: Point2D,
  polygon: Point2D[],
) {
  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    minDistance = Math.min(
      minDistance,
      segmentToSegmentDistance(from, to, current, next),
    );
  }

  return minDistance;
}

function segmentToSegmentDistance(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D,
) {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
    return 0;
  }

  return Math.min(
    projectPointToSegment(firstStart, secondStart, secondEnd).distance,
    projectPointToSegment(firstEnd, secondStart, secondEnd).distance,
    projectPointToSegment(secondStart, firstStart, firstEnd).distance,
    projectPointToSegment(secondEnd, firstStart, firstEnd).distance,
  );
}

function segmentCrossesExistingRoute(
  plan: WorkbenchBase,
  draft: RouteDraft,
  from: Point2D,
  to: Point2D,
  tolerance: number,
) {
  for (const segment of resolveRouteSegments(plan.routeNetwork, plan.equipment)) {
    if (!routeSegmentBelongsToDraftPage(plan, draft, segment)) {
      continue;
    }

    const crossingLeg = routeSegmentPlanLegs(segment).find((leg) =>
      segmentsIntersect(from, to, leg.from, leg.to),
    );

    if (!crossingLeg) {
      continue;
    }

    if (
      draft.originPoint &&
      pointAlmostEqual(from, draft.originPoint, tolerance) &&
      segmentsOnlyTouchAtAllowedPoint(
          from,
          to,
          crossingLeg.from,
          crossingLeg.to,
          draft.originPoint,
          tolerance,
        )
    ) {
      continue;
    }

    return true;
  }

  return false;
}

function routeSegmentBelongsToDraftPage(
  plan: WorkbenchBase,
  draft: RouteDraft,
  segment: RouteSegment,
) {
  if (plan.sourceType !== "pdf") {
    return true;
  }

  return (
    routeSegmentPdfPageNumber(plan, plan.routeNetwork, segment) ===
    (draft.pdfPageNumber ?? plan.visual.activePdfPageNumber)
  );
}

function segmentsOnlyTouchAtAllowedPoint(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D,
  allowedPoint: Point2D,
  tolerance: number,
) {
  if (
    !pointOnSegment(allowedPoint, firstStart, firstEnd) ||
    !pointOnSegment(allowedPoint, secondStart, secondEnd)
  ) {
    return false;
  }

  const firstEndTouchesSecond =
    pointOnSegment(firstEnd, secondStart, secondEnd) &&
    !pointAlmostEqual(firstEnd, allowedPoint, tolerance);
  const secondEndpointTouchesFirst =
    (pointOnSegment(secondStart, firstStart, firstEnd) &&
      !pointAlmostEqual(secondStart, allowedPoint, tolerance)) ||
    (pointOnSegment(secondEnd, firstStart, firstEnd) &&
      !pointAlmostEqual(secondEnd, allowedPoint, tolerance));

  return !firstEndTouchesSecond && !secondEndpointTouchesFirst;
}

function appendRouteDraftToNetwork(
  plan: WorkbenchBase,
  draft: RouteDraft,
): AppendRouteResult {
  if (!draft.targetEquipmentId || !draft.originNodeId || !draft.originPoint) {
    return {
      ok: false,
      message: "El recorrido necesita origen y destino.",
    };
  }

  const target =
    plan.equipment.find((equipment) => equipment.id === draft.targetEquipmentId) ??
    null;
  const supply = plan.equipment.find((equipment) => equipment.role === "supply") ?? null;

  if (!target || target.role !== "appliance") {
    return {
      ok: false,
      message: "Elegí un artefacto valido.",
    };
  }

  if (!supply) {
    return {
      ok: false,
      message: "Coloque un medidor/regulador antes de trazar.",
    };
  }

  if (
    getConnectedApplianceEquipmentIds(plan.routeNetwork, plan.equipment).has(
      target.id,
    )
  ) {
    return {
      ok: false,
      message: "Ese artefacto ya esta conectado.",
    };
  }

  let nodes = [...plan.routeNetwork.nodes];
  let segments = [...plan.routeNetwork.segments];
  let originNodeId = draft.originNodeId;
  const supplyNodeId = routeEquipmentNodeId(plan.id, supply.id);

  if (!nodes.some((node) => node.id === supplyNodeId)) {
    nodes.push({
      id: supplyNodeId,
      kind: "supply",
      equipmentId: supply.id,
      origin: "manual",
      pdfPageNumber: supply.pdfPageNumber,
    });
  }

  if (draft.originSplitSegmentId) {
    const split = splitRouteSegmentAtPoint({
      createNode: (point) => ({
        id: originNodeId,
        kind: "route",
        origin: "manual",
        pdfPageNumber: draft.pdfPageNumber,
        position: point,
      }),
      createSegment: (fromNodeId, toNodeId, origin, vertices) =>
        createRouteSegment(
          plan.id,
          fromNodeId,
          toNodeId,
          origin ?? "manual",
          vertices,
        ),
      equipment: plan.equipment,
      network: {
        nodes,
        segments,
      },
      point: draft.originPoint,
      segmentId: draft.originSplitSegmentId,
      tolerance: MIN_SECTION_LINK_LENGTH,
    });

    if (!split.ok) {
      return {
        ok: false,
        message: split.message,
      }
    }

    nodes = split.network.nodes;
    segments = split.network.segments;
    originNodeId = split.nodeId;
  } else if (!nodes.some((node) => node.id === originNodeId)) {
    if (originNodeId !== supplyNodeId) {
      return {
        ok: false,
        message: "El origen elegido ya no existe.",
      };
    }
  }

  const targetNodeId = routeTargetNodeIdForEquipment(
    plan,
    {
      nodes,
      segments,
    },
    target,
  );

  if (
    targetNodeId === routeEquipmentNodeId(plan.id, target.id) &&
    !nodes.some((node) => node.id === targetNodeId)
  ) {
    nodes.push({
      id: targetNodeId,
      kind: "appliance",
      equipmentId: target.id,
      origin: "manual",
      pdfPageNumber: target.pdfPageNumber,
    });
  }

  segments.push(
    createRouteSegment(
      plan.id,
      originNodeId,
      targetNodeId,
      "manual",
      draft.routePoints,
    ),
  );

  let network = pruneOrphanRouteNodes({
    nodes,
    segments,
  });
  const terminalUpdate = applyConfirmedEquipmentTerminalConnection({
    equipment: plan.equipment,
    equipmentId: target.id,
    network,
    scaleMetersPerSourceUnit: calibrationScaleMetersPerSourceUnit(plan),
  });

  if (!terminalUpdate.ok) {
    return {
      ok: false,
      message: terminalUpdate.message,
    };
  }

  network = terminalUpdate.network;

  if (hasDuplicateNodeIds(network) || hasDuplicateSegmentIds(network)) {
    return {
      ok: false,
      message: "El recorrido genera IDs duplicados.",
    };
  }

  if (hasSegmentsWithMissingEndpoints(network)) {
    return {
      ok: false,
      message: "El recorrido contiene tramos con extremos inexistentes.",
    };
  }

  if (hasDuplicateSegments(network)) {
    return {
      ok: false,
      message: "El recorrido duplica un tramo existente.",
    };
  }

  if (hasZeroLengthSegments(network, plan.equipment, MIN_SECTION_LINK_LENGTH)) {
    return {
      ok: false,
      message: "El recorrido contiene un tramo sin longitud.",
    };
  }

  if (detectRouteCycle(network)) {
    return {
      ok: false,
      message: "El recorrido crea un ciclo",
    };
  }

  if (!routeNetworkConnectedToSupply(network, plan.equipment)) {
    return {
      ok: false,
      message: "La red debe quedar conectada al medidor.",
    };
  }

  if (!applianceNodesAreTerminal(network)) {
    return {
      ok: false,
      message: "Cada artefacto conectado debe quedar como terminal.",
    };
  }

  return {
    ok: true,
    network,
  };
}

function routeNetworkConnectedToSupply(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  const supply = equipment.find((item) => item.role === "supply") ?? null;
  const supplyNode = supply ? findRouteNodeByEquipment(network, supply.id) : null;

  if (!supplyNode) {
    return network.segments.length === 0;
  }

  return network.nodes.every(
    (node) =>
      getRouteNodeDegree(network, node.id) === 0 ||
      hasRoutePath(network, supplyNode.id, node.id) ||
      routeNodeIsStandaloneTerminal(network, node),
  );
}

function routeNetworkHasInstallation(
  network: ManualRouteNetwork,
  equipment: WorkbenchEquipment[],
) {
  return (
    getConnectedApplianceEquipmentIds(network, equipment).size > 0 ||
    network.segments.some((segment) => !isEquipmentTerminalSegment(segment))
  );
}

function routeNodeIsStandaloneTerminal(
  network: ManualRouteNetwork,
  node: RouteNode,
) {
  const incidentSegments = network.segments.filter(
    (segment) =>
      segment.fromNodeId === node.id || segment.toNodeId === node.id,
  );

  if (incidentSegments.length !== 1) {
    return false;
  }

  const incident = incidentSegments[0];
  const neighborId =
    incident.fromNodeId === node.id ? incident.toNodeId : incident.fromNodeId;
  const neighbor = network.nodes.find((candidate) => candidate.id === neighborId);

  return (
    Boolean(neighbor) &&
    getRouteNodeDegree(network, neighborId) === 1 &&
    ((node.kind === "appliance" && neighbor?.kind === "route") ||
      (node.kind === "route" && neighbor?.kind === "appliance"))
  );
}

function validatePhysicalRouteEdit(
  plan: WorkbenchBase,
  network: ManualRouteNetwork,
  classificationIndex: ClassificationIndex,
): RouteValidationResult {
  if (hasDuplicateNodeIds(network) || hasDuplicateSegmentIds(network)) {
    return {
      ok: false,
      message: "La red contiene IDs duplicados.",
    };
  }

  if (hasSegmentsWithMissingEndpoints(network)) {
    return {
      ok: false,
      message: "La red contiene tramos con extremos inexistentes.",
    };
  }

  if (findInvalidRouteSegmentIds(plan, network, classificationIndex).size > 0) {
    return {
      ok: false,
      message: "La edicion atraviesa una restriccion activa.",
    };
  }

  if (hasDuplicateSegments(network)) {
    return {
      ok: false,
      message: "La red duplica un tramo.",
    };
  }

  if (hasZeroLengthSegments(network, plan.equipment, MIN_SECTION_LINK_LENGTH)) {
    return {
      ok: false,
      message: "La edicion deja un tramo sin longitud.",
    };
  }

  if (detectRouteCycle(network)) {
    return {
      ok: false,
      message: "La edicion genera un ciclo.",
    };
  }

  if (hasRouteCrossingsWithoutNode(network, plan.equipment)) {
    return {
      ok: false,
      message: "La edicion cruza tramos sin nodo.",
    };
  }

  if (!routeNetworkConnectedToSupply(network, plan.equipment)) {
    return {
      ok: false,
      message: "Todos los tramos deben tener camino hasta la alimentacion.",
    };
  }

  if (!applianceNodesAreTerminal(network)) {
    return {
      ok: false,
      message: "Cada artefacto conectado debe quedar como terminal.",
    };
  }

  return { ok: true };
}

function validateRouteNetworkForAcceptance(
  plan: WorkbenchBase,
  network: ManualRouteNetwork,
  classificationIndex: ClassificationIndex,
): RouteValidationResult {
  if (hasDuplicateNodeIds(network) || hasDuplicateSegmentIds(network)) {
    return {
      ok: false,
      message: "La red contiene IDs duplicados.",
    };
  }

  if (hasSegmentsWithMissingEndpoints(network)) {
    return {
      ok: false,
      message: "La red contiene tramos con extremos inexistentes.",
    };
  }

  if (findInvalidRouteSegmentIds(plan, network, classificationIndex).size > 0) {
    return {
      ok: false,
      message: "La propuesta atraviesa una restriccion activa.",
    };
  }

  if (hasDuplicateSegments(network)) {
    return {
      ok: false,
      message: "La propuesta duplica un tramo.",
    };
  }

  if (hasZeroLengthSegments(network, plan.equipment, MIN_SECTION_LINK_LENGTH)) {
    return {
      ok: false,
      message: "La propuesta contiene un tramo sin longitud.",
    };
  }

  if (detectRouteCycle(network)) {
    return {
      ok: false,
      message: "La propuesta genera un ciclo.",
    };
  }

  if (hasRouteCrossingsWithoutNode(network, plan.equipment)) {
    return {
      ok: false,
      message: "La propuesta cruza tramos sin nodo.",
    };
  }

  if (!routeNetworkConnectedToSupply(network, plan.equipment)) {
    return {
      ok: false,
      message: "Todos los tramos deben tener camino hasta la alimentacion.",
    };
  }

  const applianceCount = plan.equipment.filter(
    (equipment) => equipment.role === "appliance",
  ).length;
  const connectedCount = getConnectedApplianceEquipmentIds(
    network,
    plan.equipment,
  ).size;

  if (connectedCount !== applianceCount) {
    return {
      ok: false,
      message: "Todos los artefactos deben quedar conectados.",
    };
  }

  if (!applianceNodesAreTerminal(network)) {
    return {
      ok: false,
      message: "Cada artefacto conectado debe quedar como terminal.",
    };
  }

  return { ok: true };
}

function parseRouteProposalMargin(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);

  return normalized.length > 0 && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : null;
}

function routeProposalPdfPageNumber(plan: WorkbenchBase) {
  if (plan.sourceType !== "pdf") {
    return undefined;
  }

  const supply = plan.equipment.find((equipment) => equipment.role === "supply");
  return supply?.pdfPageNumber ?? plan.visual.activePdfPageNumber;
}

function createRouteProposalFingerprint(
  plan: WorkbenchBase,
  classificationIndex: ClassificationIndex,
  marginMeters: number,
) {
  const pageNumber = routeProposalPdfPageNumber(plan);
  const scale = calibrationScaleMetersPerSourceUnit(plan) ?? 0;
  const equipmentSignature = plan.equipment
    .map((equipment) => {
      const terminalConfig = equipment.terminalConfig;
      const wallPoint = equipment.wallAnchor?.wallPoint ?? null;

      return [
        equipment.id,
        equipment.role,
        equipment.pdfPageNumber ?? "",
        formatFingerprintNumber(equipment.connectionPoint.x),
        formatFingerprintNumber(equipment.connectionPoint.y),
        formatFingerprintNumber(pointZMeters(equipment.connectionPoint)),
        terminalConfig?.heightStatus ?? "",
        formatFingerprintNumber(terminalConfig?.connectionHeightMeters ?? 0),
        formatFingerprintNumber(terminalConfig?.lateralOffsetMeters ?? 0),
        terminalConfig?.outletSide ?? "",
        formatFingerprintNumber(terminalConfig?.verticalDropMeters ?? 0),
        formatFingerprintNumber(equipment.wallAnchor?.orientationRadians ?? 0),
        wallPoint ? formatFingerprintNumber(wallPoint.x) : "",
        wallPoint ? formatFingerprintNumber(wallPoint.y) : "",
        wallPoint ? formatFingerprintNumber(pointZMeters(wallPoint)) : "",
      ].join(":");
    })
    .sort()
    .join("|");
  const constraintSignature = plan.constraints
    .filter(
      (constraint) =>
        constraint.active &&
        constraintBelongsToSource(
          constraint,
          plan.sourceType,
          plan.sourceType === "pdf" ? pageNumber ?? null : null,
        ),
    )
    .map(
      (constraint) =>
        [
          constraint.id,
          constraint.type,
          ...constraint.polygon.map(
            (point) =>
              `${formatFingerprintNumber(point.x)},${formatFingerprintNumber(point.y)}`,
          ),
        ].join(":"),
    )
    .sort()
    .join("|");
  const structureSignature = Object.entries(classificationIndex)
    .filter(([, classification]) => classification.category === "hard_structure")
    .map(([entityId]) => entityId)
    .sort()
    .join("|");

  return [
    plan.id,
    plan.sourceType,
    pageNumber ?? "",
    formatFingerprintNumber(scale),
    formatFingerprintNumber(marginMeters),
    equipmentSignature,
    constraintSignature,
    structureSignature,
  ].join("||");
}

function createRouteIntentProposalFingerprint(
  plan: WorkbenchBase,
  classificationIndex: ClassificationIndex,
  marginMeters: number,
) {
  return [
    createRouteProposalFingerprint(plan, classificationIndex, marginMeters),
    routeIntentSignature(plan.routeIntentConnections),
    routeNetworkSignature(plan.routeNetwork),
  ].join("||intent||");
}

function routeIntentSignature(connections: RouteIntentConnection[]) {
  return connections
    .map((connection, index) =>
      [
        index,
        connection.id,
        connection.pdfPageNumber ?? "",
        routeIntentConnectionKey(connection.from, connection.to),
      ].join(":"),
    )
    .join("|");
}

function routeNetworkSignature(network: ManualRouteNetwork) {
  const nodes = network.nodes
    .map((node) =>
      [
        node.id,
        node.kind,
        node.equipmentId ?? "",
        node.pdfPageNumber ?? "",
        node.position ? formatFingerprintNumber(node.position.x) : "",
        node.position ? formatFingerprintNumber(node.position.y) : "",
        node.position ? formatFingerprintNumber(pointZMeters(node.position)) : "",
      ].join(":"),
    )
    .sort()
    .join("|");
  const segments = network.segments
    .map((segment) =>
      [
        segment.id,
        segment.fromNodeId,
        segment.toNodeId,
        segment.origin ?? "",
        ...(segment.vertices ?? []).flatMap((point) => [
          formatFingerprintNumber(point.x),
          formatFingerprintNumber(point.y),
        ]),
      ].join(":"),
    )
    .sort()
    .join("|");

  return `${nodes}||${segments}`;
}

function accessoryProposalDecisionsEqual(
  first: AccessoryProposalDecision[],
  second: AccessoryProposalDecision[],
) {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((decision, index) => {
    const other = second[index];

    return (
      other !== undefined &&
      decision.proposalId === other.proposalId &&
      decision.geometryKey === other.geometryKey &&
      decision.status === other.status &&
      decision.ownerSegmentId === other.ownerSegmentId &&
      decision.accessoryId === other.accessoryId
    );
  });
}

function diameterTransitionReviewReason(params: {
  candidates: DiameterTransitionTechnicalReview["candidates"];
  compoundPreview?: DiameterTransitionTechnicalReview["compoundPreview"];
  compatibleCandidates: DiameterTransitionTechnicalReview["candidates"];
  proposal: DiameterTransitionProposal;
  selectedCandidate: DiameterTransitionTechnicalReview["selectedCandidate"];
}) {
  if (params.proposal.state === "not_required") {
    return "No hay cambio de diametro activo con los diametros actuales.";
  }

  if (
    params.proposal.state === "unresolved" ||
    params.proposal.state === "unsupported"
  ) {
    return params.proposal.reason;
  }

  if (params.selectedCandidate) {
    return params.selectedCandidate.status === "compatible"
      ? null
      : params.selectedCandidate.reason;
  }

  if (params.proposal.decision?.catalogFamilyId) {
    return "La familia confirmada no existe entre las familias SIGAS aplicables a la geometria actual.";
  }

  if (params.proposal.kind === "compound_turn_transition") {
    return (
      params.compoundPreview?.reason ??
      "No hay pieza unica SIGAS; requiere confirmar codo y reduccion compatibles."
    );
  }

  if (params.candidates.length === 0) {
    return params.proposal.reason;
  }

  if (params.compatibleCandidates.length === 0) {
    return params.candidates[0]?.reason ?? params.proposal.reason;
  }

  return null;
}

function diameterTransitionDecisionsEqual(
  first: DiameterTransitionDecision[],
  second: DiameterTransitionDecision[],
) {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((decision, index) => {
    const other = second[index];

    return (
      other !== undefined &&
      decision.transitionId === other.transitionId &&
      decision.geometryKey === other.geometryKey &&
      decision.status === other.status &&
      decision.catalogFamilyId === other.catalogFamilyId &&
      decision.pipeSystemId === other.pipeSystemId
    );
  });
}

function routeSourceBounds(plan: WorkbenchBase): Bounds | null {
  if (plan.sourceType === "dxf") {
    return plan.drawing?.bounds ?? boundsForRoutePoints(plan.equipment);
  }

  const pageNumber = routeProposalPdfPageNumber(plan);
  const page =
    (plan.pdfDocument?.model ?? plan.pdfModel)?.pages.find(
      (currentPage) => currentPage.pageNumber === pageNumber,
    ) ?? null;

  return page
    ? {
        maxX: page.width,
        maxY: page.height,
        minX: 0,
        minY: 0,
      }
    : boundsForRoutePoints(plan.equipment);
}

function boundsForRoutePoints(equipment: WorkbenchEquipment[]): Bounds | null {
  const points = equipment.map((item) => item.connectionPoint);

  if (points.length === 0) {
    return null;
  }

  return points.reduce(
    (bounds, point) => ({
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
    },
  );
}

function formatFingerprintNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function createRouteNodeId(planBaseId: string) {
  return `route-node:${planBaseId}:manual:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function createRouteIntentConnectionId(planBaseId: string) {
  return `route-intent:${planBaseId}:manual:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function createRouteSegment(
  planBaseId: string,
  fromNodeId: string,
  toNodeId: string,
  origin: RouteSegment["origin"] = "manual",
  vertices: Point2D[] = [],
): RouteSegment {
  return {
    id: `route-segment:${planBaseId}:manual:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    fromNodeId,
    origin,
    toNodeId,
    ...(vertices.length > 0
      ? {
          vertices: vertices.map((point) => ({
            x: point.x,
            y: point.y,
          })),
        }
      : {}),
  };
}

function updateCalibrationForBase(
  base: WorkbenchBase,
  updater: (state: SourceCalibrationState) => SourceCalibrationState,
): WorkbenchBase {
  return {
    ...base,
    calibration: updater(base.calibration),
  };
}

function cancelTransientState(base: WorkbenchBase): WorkbenchBase {
  return {
    ...base,
    selectionMode: "pan",
    selectedEntityIds: [],
    constraintDraft: null,
    constraintToolMode: "none",
    selectedConstraintId: null,
    calibration: {
      ...base.calibration,
      toolMode: "idle",
      draft: {
        ...base.calibration.draft,
        points: [],
      },
      measurementPoints: [],
      error: null,
    },
  };
}

function createInitialCalibrationState(): SourceCalibrationState {
  return {
    toolMode: "idle",
    calibration: null,
    draft: {
      status: "pending",
      points: [],
      distanceOriginal: "",
      unit: "mm",
    },
    measurementPoints: [],
    error: null,
  };
}

function createOverlayData(state: SourceCalibrationState): SourceOverlayData {
  const calibrationPoints =
    state.toolMode === "calibrate"
      ? state.draft.points
      : state.calibration
        ? [state.calibration.points.start, state.calibration.points.end]
        : [];

  return {
    calibrationPoints,
    measurementPoints: state.measurementPoints,
  };
}

function sourceTypeFromFile(file: File): WorkbenchSource | null {
  const name = file.name.toLowerCase();

  if (name.endsWith(".dxf")) {
    return "dxf";
  }

  if (name.endsWith(".pdf")) {
    return "pdf";
  }

  return null;
}

function createBaseId(type: WorkbenchBaseType) {
  return `base-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanupBaseDocument(base: WorkbenchBase) {
  void base.pdfDocument?.proxy.cleanup();
}

function baseHasUserWork(base: WorkbenchBase) {
  const hasLayerChanges = base.drawing
    ? base.drawing.layers.some(
      (layer) => (base.visibleLayers[layer.name] ?? layer.visible) !== layer.visible,
    )
    : false;

  return (
    hasLayerChanges ||
    base.semanticViewMode !== "original" ||
    base.semanticInspection !== null ||
    base.proposals.length > 0 ||
    base.semanticAssignments.length > 0 ||
    base.constraints.length > 0 ||
    base.equipment.length > 0 ||
    base.routeIntentConnections.length > 0 ||
    base.adoptedDiameterDecisions.length > 0 ||
    base.diameterTransitionDecisions.length > 0 ||
    base.routeAccessoryProposalDecisions.length > 0 ||
    base.routeNetwork.nodes.length > 0 ||
    base.routeNetwork.segments.length > 0 ||
    base.calibration.calibration !== null ||
    base.calibration.draft.points.length > 0 ||
    base.calibration.draft.distanceOriginal.trim().length > 0 ||
    base.calibration.measurementPoints.length > 0
  );
}

function replacementConfirmationForBase(
  base: WorkbenchBase,
  links: SectionPlanLink[],
) {
  const messages: string[] = [];
  const linkCount = countLinksForBase(base, links);
  const registrationCount = countRegistrationsForBase(base, links);
  const equipmentCount = base.type === "plan" ? base.equipment.length : 0;
  const routeIntentCount =
    base.type === "plan" ? base.routeIntentConnections.length : 0;
  const routeSegmentCount =
    base.type === "plan" ? base.routeNetwork.segments.length : 0;

  if (baseHasUserWork(base)) {
    messages.push(
      `Reemplazar ${base.name} perdera su preparacion, obstaculos y escala.`,
    );
  }

  if (base.type === "plan" && linkCount > 0) {
    messages.push(
      `${linkCount} vinculo${linkCount === 1 ? "" : "s"} con Cortes se eliminara${linkCount === 1 ? "" : "n"} junto con sus correspondencias.`,
    );
  }

  if (equipmentCount > 0) {
    messages.push(
      `${equipmentCount} equipo${equipmentCount === 1 ? "" : "s"} se eliminara${equipmentCount === 1 ? "" : "n"} porque sus coordenadas pertenecen al archivo actual.`,
    );
  }

  if (routeSegmentCount > 0) {
    messages.push(
      `${routeSegmentCount} tramo${routeSegmentCount === 1 ? "" : "s"} de trazado se eliminara${routeSegmentCount === 1 ? "" : "n"} porque sus coordenadas pertenecen al archivo actual.`,
    );
  }

  if (routeIntentCount > 0) {
    messages.push(
      `${routeIntentCount} conexion${routeIntentCount === 1 ? "" : "es"} manual${routeIntentCount === 1 ? "" : "es"} se eliminara${routeIntentCount === 1 ? "" : "n"} porque pertenece${routeIntentCount === 1 ? "" : "n"} al archivo actual.`,
    );
  }

  if (base.type === "section" && linkCount > 0) {
    messages.push("El vinculo con Planta se mantendra.");
  }

  if (base.type === "section" && registrationCount > 0) {
    messages.push(
      "La correspondencia se eliminara porque sus coordenadas pertenecen al archivo anterior.",
    );
  }

  return messages.length > 0 ? `${messages.join(" ")} Continuar?` : null;
}

function removalConfirmationForBase(
  base: WorkbenchBase,
  links: SectionPlanLink[],
) {
  const messages: string[] = [];
  const linkCount = countLinksForBase(base, links);
  const registrationCount = countRegistrationsForBase(base, links);
  const equipmentCount = base.type === "plan" ? base.equipment.length : 0;
  const routeIntentCount =
    base.type === "plan" ? base.routeIntentConnections.length : 0;
  const routeSegmentCount =
    base.type === "plan" ? base.routeNetwork.segments.length : 0;

  if (baseHasUserWork(base)) {
    messages.push(`Quitar ${base.name} perdera su estado.`);
  }

  if (base.type === "section" && linkCount > 0) {
    messages.push("Tambien desaparecera su marca en Planta.");
  }

  if (base.type === "section" && registrationCount > 0) {
    messages.push("Tambien desaparecera su correspondencia.");
  }

  if (base.type === "plan" && linkCount > 0) {
    messages.push(
      `${linkCount} vinculo${linkCount === 1 ? "" : "s"} se eliminara${linkCount === 1 ? "" : "n"} y los Cortes quedaran sin vincular.`,
    );
  }

  if (equipmentCount > 0) {
    messages.push(
      `${equipmentCount} equipo${equipmentCount === 1 ? "" : "s"} se eliminara${equipmentCount === 1 ? "" : "n"} junto con la Planta.`,
    );
  }

  if (routeSegmentCount > 0) {
    messages.push(
      `${routeSegmentCount} tramo${routeSegmentCount === 1 ? "" : "s"} de trazado se eliminara${routeSegmentCount === 1 ? "" : "n"} junto con la Planta.`,
    );
  }

  if (routeIntentCount > 0) {
    messages.push(
      `${routeIntentCount} conexion${routeIntentCount === 1 ? "" : "es"} manual${routeIntentCount === 1 ? "" : "es"} se eliminara${routeIntentCount === 1 ? "" : "n"} junto con la Planta.`,
    );
  }

  return messages.length > 0 ? `${messages.join(" ")} Continuar?` : null;
}

function countLinksForBase(base: WorkbenchBase, links: SectionPlanLink[]) {
  return links.filter((link) =>
    base.type === "plan"
      ? link.planBaseId === base.id
      : link.sectionBaseId === base.id,
  ).length;
}

function countRegistrationsForBase(base: WorkbenchBase, links: SectionPlanLink[]) {
  return links.filter((link) => {
    if (!link.registration) {
      return false;
    }

    return base.type === "plan"
      ? link.planBaseId === base.id
      : link.sectionBaseId === base.id;
  }).length;
}

function isValidSectionLinkLine(start: Point2D, end: Point2D) {
  return distanceBetween(start, end) > MIN_SECTION_LINK_LENGTH;
}

function sectionLinkPlanEndpointsEqual(
  link: SectionPlanLink,
  next: { planStart: Point2D; planEnd: Point2D },
) {
  return (
    pointsAlmostEqual(link.planStart, next.planStart) &&
    pointsAlmostEqual(link.planEnd, next.planEnd)
  );
}

function pointsAlmostEqual(first: Point2D, second: Point2D) {
  return distanceBetween(first, second) <= MIN_SECTION_LINK_LENGTH;
}

function createSectionRegistrationSummary(
  link: SectionPlanLink,
  plan: WorkbenchBase | null,
  section: WorkbenchBase,
): SectionRegistrationSummary {
  if (!link.registration) {
    return {
      lengthLabel: null,
      status: "Vinculado · Sin correspondencia",
    };
  }

  const planScale = calibrationScaleMetersPerSourceUnit(plan);
  const sectionScale = calibrationScaleMetersPerSourceUnit(section);

  if (planScale === null || sectionScale === null) {
    return {
      lengthLabel: null,
      status: "Correspondencia definida · Escala pendiente",
    };
  }

  const planLengthMeters = distanceBetween(link.planStart, link.planEnd) * planScale;
  const sectionLengthMeters =
    distanceBetween(
      link.registration.sectionStart,
      link.registration.sectionEnd,
    ) * sectionScale;
  const differenceRatio = lengthDifferenceRatio(
    planLengthMeters,
    sectionLengthMeters,
  );
  const status =
    differenceRatio <= SECTION_LENGTH_TOLERANCE_RATIO
      ? "Alineado"
      : "Revisar referencias o escalas";

  return {
    lengthLabel: `Planta ${formatMeters(planLengthMeters)} · Corte ${formatMeters(sectionLengthMeters)} · Δ ${formatPercentage(differenceRatio)}`,
    status,
  };
}

function calibrationScaleMetersPerSourceUnit(base: WorkbenchBase | null) {
  const calibration = base?.calibration.calibration;

  return calibration ? calibration.millimetersPerSourceUnit / 1000 : null;
}

function focusPlanLinkIfNeeded(
  plan: WorkbenchBase,
  link: SectionPlanLink,
): WorkbenchBase {
  const nextPlan =
    plan.sourceType === "pdf" && link.pdfPageNumber
      ? {
          ...plan,
          visual: {
            ...plan.visual,
            activePdfPageNumber: link.pdfPageNumber,
          },
        }
      : plan;

  if (isPlanLinkVisible(nextPlan, link)) {
    return nextPlan;
  }

  if (nextPlan.sourceType === "dxf") {
    const view = nextPlan.visual.dxfView;

    return {
      ...nextPlan,
      visual: view
        ? {
            ...nextPlan.visual,
            dxfView: createDxfLinkFocusTransform(link, view),
          }
        : {
            ...nextPlan.visual,
            dxfFitNonce: nextPlan.visual.dxfFitNonce + 1,
          },
    };
  }

  const view = nextPlan.visual.pdfView;

  return {
    ...nextPlan,
    visual: view
      ? {
          ...nextPlan.visual,
          pdfView: createPdfLinkFocusTransform(link, view),
        }
      : {
          ...nextPlan.visual,
          pdfFitNonce: nextPlan.visual.pdfFitNonce + 1,
        },
  };
}

function focusSectionRegistrationIfNeeded(
  section: WorkbenchBase,
  registration: SectionRegistration,
): WorkbenchBase {
  const nextSection =
    section.sourceType === "pdf" && registration.sectionPdfPageNumber
      ? {
          ...section,
          visual: {
            ...section.visual,
            activePdfPageNumber: registration.sectionPdfPageNumber,
          },
        }
      : section;

  if (isSectionRegistrationVisible(nextSection, registration)) {
    return nextSection;
  }

  if (nextSection.sourceType === "dxf") {
    const view = nextSection.visual.dxfView;

    return {
      ...nextSection,
      visual: view
        ? {
            ...nextSection.visual,
            dxfView: createDxfRegistrationFocusTransform(registration, view),
          }
        : {
            ...nextSection.visual,
            dxfFitNonce: nextSection.visual.dxfFitNonce + 1,
          },
    };
  }

  const view = nextSection.visual.pdfView;

  return {
    ...nextSection,
    visual: view
      ? {
          ...nextSection.visual,
          pdfView: createPdfRegistrationFocusTransform(registration, view),
        }
      : {
          ...nextSection.visual,
          pdfFitNonce: nextSection.visual.pdfFitNonce + 1,
        },
  };
}

function isPlanLinkVisible(plan: WorkbenchBase, link: SectionPlanLink) {
  const margin = 28;

  if (plan.sourceType === "dxf") {
    const view = plan.visual.dxfView;

    if (!view) {
      return false;
    }

    return pointsAreVisible(
      [worldToScreen(link.planStart, view), worldToScreen(link.planEnd, view)],
      view,
      margin,
    );
  }

  const view = plan.visual.pdfView;

  if (!view || link.pdfPageNumber !== plan.visual.activePdfPageNumber) {
    return false;
  }

  return pointsAreVisible(
    [
      pdfSourceToScreen(link.planStart, view),
      pdfSourceToScreen(link.planEnd, view),
    ],
    view,
    margin,
  );
}

function isSectionRegistrationVisible(
  section: WorkbenchBase,
  registration: SectionRegistration,
) {
  const margin = 28;

  if (section.sourceType === "dxf") {
    const view = section.visual.dxfView;

    if (!view) {
      return false;
    }

    return pointsAreVisible(
      [
        worldToScreen(registration.sectionStart, view),
        worldToScreen(registration.sectionEnd, view),
      ],
      view,
      margin,
    );
  }

  const view = section.visual.pdfView;

  if (
    !view ||
    (registration.sectionPdfPageNumber &&
      registration.sectionPdfPageNumber !== section.visual.activePdfPageNumber)
  ) {
    return false;
  }

  return pointsAreVisible(
    [
      pdfSourceToScreen(registration.sectionStart, view),
      pdfSourceToScreen(registration.sectionEnd, view),
    ],
    view,
    margin,
  );
}

function pointsAreVisible(
  points: Point2D[],
  size: { width: number; height: number },
  margin: number,
) {
  return points.every(
    (point) =>
      point.x >= margin &&
      point.y >= margin &&
      point.x <= size.width - margin &&
      point.y <= size.height - margin,
  );
}

function createDxfLinkFocusTransform(
  link: SectionPlanLink,
  currentView: ViewTransform,
): ViewTransform {
  const focus = createLinkFocus(link, currentView);

  return {
    ...currentView,
    scale: focus.scale,
    offsetX: currentView.width / 2 - focus.center.x * focus.scale,
    offsetY: currentView.height / 2 + focus.center.y * focus.scale,
  };
}

function createPdfLinkFocusTransform(
  link: SectionPlanLink,
  currentView: PdfViewTransform,
): PdfViewTransform {
  const focus = createLinkFocus(link, currentView);

  return {
    ...currentView,
    scale: focus.scale,
    offsetX: currentView.width / 2 - focus.center.x * focus.scale,
    offsetY: currentView.height / 2 - focus.center.y * focus.scale,
  };
}

function createDxfRegistrationFocusTransform(
  registration: SectionRegistration,
  currentView: ViewTransform,
): ViewTransform {
  const focus = createRegistrationFocus(registration, currentView);

  return {
    ...currentView,
    scale: focus.scale,
    offsetX: currentView.width / 2 - focus.center.x * focus.scale,
    offsetY: currentView.height / 2 + focus.center.y * focus.scale,
  };
}

function createPdfRegistrationFocusTransform(
  registration: SectionRegistration,
  currentView: PdfViewTransform,
): PdfViewTransform {
  const focus = createRegistrationFocus(registration, currentView);

  return {
    ...currentView,
    scale: focus.scale,
    offsetX: currentView.width / 2 - focus.center.x * focus.scale,
    offsetY: currentView.height / 2 - focus.center.y * focus.scale,
  };
}

function createLinkFocus(
  link: SectionPlanLink,
  size: { width: number; height: number },
) {
  const length = Math.max(distanceBetween(link.planStart, link.planEnd), 1);
  const sourceWidth = Math.max(Math.abs(link.planEnd.x - link.planStart.x), length * 0.35, 1);
  const sourceHeight = Math.max(Math.abs(link.planEnd.y - link.planStart.y), length * 0.35, 1);
  const padding = 90;
  const scale = Math.min(
    Math.max(size.width - padding * 2, 1) / sourceWidth,
    Math.max(size.height - padding * 2, 1) / sourceHeight,
  );

  return {
    center: {
      x: (link.planStart.x + link.planEnd.x) / 2,
      y: (link.planStart.y + link.planEnd.y) / 2,
    },
    scale,
  };
}

function createRegistrationFocus(
  registration: SectionRegistration,
  size: { width: number; height: number },
) {
  const length = Math.max(
    distanceBetween(registration.sectionStart, registration.sectionEnd),
    1,
  );
  const sourceWidth = Math.max(
    Math.abs(registration.sectionEnd.x - registration.sectionStart.x),
    length * 0.35,
    1,
  );
  const sourceHeight = Math.max(
    Math.abs(registration.sectionEnd.y - registration.sectionStart.y),
    length * 0.35,
    1,
  );
  const padding = 90;
  const scale = Math.min(
    Math.max(size.width - padding * 2, 1) / sourceWidth,
    Math.max(size.height - padding * 2, 1) / sourceHeight,
  );

  return {
    center: {
      x: (registration.sectionStart.x + registration.sectionEnd.x) / 2,
      y: (registration.sectionStart.y + registration.sectionEnd.y) / 2,
    },
    scale,
  };
}

function distanceBetween(start: Point2D, end: Point2D) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function viewTransformsEqual(
  first: ViewTransform | null,
  second: ViewTransform | null,
) {
  if (!first || !second) {
    return first === second;
  }

  return (
    first.width === second.width &&
    first.height === second.height &&
    first.scale === second.scale &&
    first.offsetX === second.offsetX &&
    first.offsetY === second.offsetY
  );
}

function pdfViewTransformsEqual(
  first: PdfViewTransform | null,
  second: PdfViewTransform | null,
) {
  if (!first || !second) {
    return first === second;
  }

  return (
    first.width === second.width &&
    first.height === second.height &&
    first.scale === second.scale &&
    first.offsetX === second.offsetX &&
    first.offsetY === second.offsetY
  );
}

function replaceAssignmentsForEntities(
  currentAssignments: ConfirmedClassification[],
  entityIds: string[],
  nextAssignment: ConfirmedClassification,
) {
  const replacingIds = new Set(entityIds);

  return [
    ...currentAssignments
      .map((assignment) => ({
        ...assignment,
        entityIds: assignment.entityIds.filter((id) => !replacingIds.has(id)),
      }))
      .filter((assignment) => assignment.entityIds.length > 0),
    nextAssignment,
  ];
}

function parsePositiveDistance(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseElevationInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);

  return normalized.length > 0 && Number.isFinite(parsed) ? parsed : null;
}

function formatElevationInputForEdit(value: number) {
  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatMeters(value: number) {
  return `${value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} m`;
}

function formatPercentage(value: number) {
  return `${(value * 100).toLocaleString("es-AR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

function constraintTypeForTool(
  toolMode: ConstraintToolMode,
): ConstraintType | null {
  if (
    toolMode === "draw_hard_rect" ||
    toolMode === "draw_hard_polygon"
  ) {
    return "hard_obstacle";
  }

  if (toolMode === "draw_avoid_polygon") {
    return "avoid_zone";
  }

  return null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 3,
  }).format(value);
}

function persistenceNoticeClassName(tone: PersistenceNotice["tone"]) {
  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (tone === "warning") {
    return "border-[#ecd5ad] bg-[#fff9ec] text-[var(--warning)]";
  }

  return "border-[#badbcc] bg-[#f1faf4] text-[#1f6b45]";
}
