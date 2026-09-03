import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type WorkbenchEquipment } from "@/lib/equipment/types";
import type {
  PipeDiameterReference,
  PipeSystem,
} from "@/lib/calculation/pipeSystem";
import {
  createDemandNormalizationIndex,
  formatEquipmentDemandWithNormalization,
  type EquipmentDemandNormalization,
} from "@/lib/calculation/demandNormalization";
import {
  equivalentLengthSourceLabel,
  formatCalculationMeters,
  formatTechnicalFlow,
  routeAccessoryTypeLabel,
  technicalCalculationStatusLabel,
  type TechnicalCalculationIssue,
  type TechnicalCalculationResult,
  type TechnicalTransitionAwareNetworkSizingSegmentResult,
  type TechnicalRouteAccessoryContribution,
  type TechnicalRouteAccessoryResolution,
  type TechnicalSegmentAccessoryResult,
  type TechnicalSegmentResult,
} from "@/lib/calculation/technicalTree";
import {
  type AccessoryCatalogCandidate,
  type AccessoryProposalTechnicalReview,
} from "@/lib/calculation/accessoryCatalogCandidates";
import {
  type AccessoryProposal,
} from "@/lib/routing/routeAccessoryProposals";
import type {
  DiameterTransitionProposal,
  DiameterTransitionTechnicalReview,
} from "@/lib/calculation/diameterTransitionProposals";
import type {
  AdoptedDiameterDecision,
} from "@/lib/calculation/professionalDiameterAdoption";
import type { ManualRouteNetwork } from "@/lib/routing/types";
import type {
  CompoundTurnTransitionPreview as CompoundTurnTransitionPreviewModel,
} from "@/lib/calculation/compoundTurnTransitionResolution";
import {
  formatCompoundTurnTransitionLabel,
} from "@/lib/calculation/compoundTurnTransitionResolution";
import type {
  TechnicalRouteTransitionContribution,
  TechnicalRouteTransitionResolution,
} from "@/lib/calculation/technicalRouteTransitions";
import {
  createTechnicalMaterialTakeoff,
  type TechnicalMaterialTakeoff,
} from "@/lib/calculation/technicalMaterialTakeoff";
import {
  createTechnicalPhysicalAccessoryInventory,
  technicalPhysicalAccessoryKindLabel,
  type TechnicalPhysicalAccessory,
  type TechnicalPhysicalAccessoryInventory,
  type TechnicalPhysicalAccessoryRouteUse,
} from "@/lib/calculation/technicalPhysicalAccessories";
import {
  createTechnicalEquivalentAccessoryVerification,
  type TechnicalEquivalentAccessorySegmentVerification,
} from "@/lib/calculation/technicalEquivalentAccessoryVerification";
import {
  createTechnicalAdoptedDiameterValidation,
  type TechnicalAdoptedDiameterSegmentValidation,
  type TechnicalAdoptedDiameterValidation,
} from "@/lib/calculation/technicalAdoptedDiameterValidation";
import {
  createTechnicalAxonometricView,
  type TechnicalAxonometricAccessory,
  type TechnicalAxonometricNode,
  type TechnicalAxonometricSegment,
  type TechnicalAxonometricView,
} from "@/lib/calculation/technicalAxonometric";
import {
  createTechnicalCalculationSheet,
  type TechnicalCalculationSheet,
  type TechnicalCalculationSheetRow,
} from "@/lib/calculation/technicalCalculationSheet";
import {
  downloadTechnicalWorkbook,
} from "@/lib/calculation/technicalExcelDownload";
import {
  downloadTechnicalPdf,
} from "@/lib/calculation/technicalPdfDownload";

type CalculationPanelMode = "calculate" | "deliver";

type CalculationPanelProps = {
  adoptedDiameterDecisions: AdoptedDiameterDecision[];
  accessoryProposals: AccessoryProposal[];
  accessoryProposalReviews: AccessoryProposalTechnicalReview[];
  diameterTransitionProposals: DiameterTransitionProposal[];
  diameterTransitionReviews: DiameterTransitionTechnicalReview[];
  equipment: WorkbenchEquipment[];
  hasPendingProposal: boolean;
  isPlanActive: boolean;
  mode?: CalculationPanelMode;
  pipeSystem: PipeSystem;
  planReady: boolean;
  result: TechnicalCalculationResult | null;
  routeNetwork: ManualRouteNetwork;
  scaleMetersPerSourceUnit: number | null;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  onAdoptSegmentDiameter: (segmentId: string, diameterId: string | null) => void;
  onConfirmAccessoryProposal: (proposalId: string, candidateId: string) => void;
  onConfirmDiameterTransition: (transitionId: string, candidateId: string) => void;
  onGoToEquipment: () => void;
  onGoToPlan: () => void;
  onRejectAccessoryProposal: (proposalId: string) => void;
  onRejectDiameterTransition: (transitionId: string) => void;
};

type CalculationPendingSummary = {
  decisionCount: number;
  deliveryBlockingCount: number;
  total: number;
};

type PendingAccessoryDecision = {
  proposal: AccessoryProposal;
  review: AccessoryProposalTechnicalReview | null;
};

type PendingTransitionDecision = {
  proposal: DiameterTransitionProposal;
  review: DiameterTransitionTechnicalReview | null;
};

type PendingAdoptedDiameterDecision = {
  segment: TechnicalSegmentResult;
  validation: TechnicalAdoptedDiameterSegmentValidation;
};

type PendingTechnicalDecision = {
  issue: TechnicalCalculationIssue;
};

type PendingCombinedDecision = {
  accessory: PendingAccessoryDecision;
  sharedCandidates: SharedDecisionCandidate[];
  transition: PendingTransitionDecision;
};

type PendingCalculationDecision =
  | {
      id: string;
      kind: "accessory";
      decision: PendingAccessoryDecision;
    }
  | {
      id: string;
      kind: "adopted_diameter";
      decision: PendingAdoptedDiameterDecision;
    }
  | {
      id: string;
      kind: "combined";
      decision: PendingCombinedDecision;
    }
  | {
      id: string;
      kind: "technical";
      decision: PendingTechnicalDecision;
    }
  | {
      id: string;
      kind: "transition";
      decision: PendingTransitionDecision;
    };

type SharedDecisionCandidate = {
  accessoryCandidateId: string;
  id: string;
  label: string;
  reason: string;
  transitionCandidateId: string;
};

export function CalculationPanel({
  adoptedDiameterDecisions,
  accessoryProposals,
  accessoryProposalReviews,
  diameterTransitionProposals,
  diameterTransitionReviews,
  equipment,
  hasPendingProposal,
  isPlanActive,
  mode = "calculate",
  pipeSystem,
  planReady,
  result,
  routeNetwork,
  scaleMetersPerSourceUnit,
  routeTransitionResolutions,
  onAdoptSegmentDiameter,
  onConfirmAccessoryProposal,
  onConfirmDiameterTransition,
  onGoToEquipment,
  onGoToPlan,
  onRejectAccessoryProposal,
  onRejectDiameterTransition,
}: CalculationPanelProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [excelExportError, setExcelExportError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExportError, setPdfExportError] = useState<string | null>(null);
  const calculationSheet = useMemo(
    () =>
      createTechnicalCalculationSheet({
        equipment,
        result,
        routeTransitionResolutions,
      }),
    [equipment, result, routeTransitionResolutions],
  );
  const physicalAccessoryInventory = useMemo(
    () =>
      createTechnicalPhysicalAccessoryInventory({
        accessoryProposals,
        diameterTransitionProposals,
        equipment,
        network: routeNetwork,
        result,
        routeTransitionResolutions,
      }),
    [
      accessoryProposals,
      diameterTransitionProposals,
      equipment,
      result,
      routeNetwork,
      routeTransitionResolutions,
    ],
  );
  const equivalentAccessoryVerificationBySegmentId = useMemo(
    () =>
      createTechnicalEquivalentAccessoryVerification({
        inventory: physicalAccessoryInventory,
        pipeSystem,
        result,
      }),
    [physicalAccessoryInventory, pipeSystem, result],
  );
  const adoptedDiameterValidation = useMemo(
    () =>
      createTechnicalAdoptedDiameterValidation({
        decisions: adoptedDiameterDecisions,
        equivalentVerificationBySegmentId:
          equivalentAccessoryVerificationBySegmentId,
        pipeSystem,
        result,
      }),
    [
      adoptedDiameterDecisions,
      equivalentAccessoryVerificationBySegmentId,
      pipeSystem,
      result,
    ],
  );
  const adoptedDiameterValidationBySegmentId = useMemo<
    Record<string, TechnicalAdoptedDiameterSegmentValidation>
  >(
    () =>
      Object.fromEntries(
        adoptedDiameterValidation.segments.map((segment) => [
          segment.segmentId,
          segment,
        ]),
      ),
    [adoptedDiameterValidation],
  );
  const materialTakeoff = useMemo(
    () =>
      createTechnicalMaterialTakeoff({
        accessoryProposals,
        adoptedDiameterValidation,
        diameterTransitionProposals,
        physicalAccessoryInventory,
        result,
        routeTransitionResolutions,
      }),
    [
      accessoryProposals,
      adoptedDiameterValidation,
      diameterTransitionProposals,
      physicalAccessoryInventory,
      result,
      routeTransitionResolutions,
    ],
  );
  const axonometricView = useMemo(
    () =>
      createTechnicalAxonometricView({
        adoptedDiameterValidation,
        equipment,
        inventory: physicalAccessoryInventory,
        network: routeNetwork,
        result,
        scaleMetersPerSourceUnit,
      }),
    [
      adoptedDiameterValidation,
      equipment,
      physicalAccessoryInventory,
      result,
      routeNetwork,
      scaleMetersPerSourceUnit,
    ],
  );
  const selectedSegment =
    result?.segments.find((segment) => segment.segmentId === selectedSegmentId) ??
    result?.segments[0] ??
    null;
  const pendingDecisions = useMemo(
    () =>
      createPendingCalculationDecisions({
        accessoryProposalReviews,
        accessoryProposals,
        adoptedDiameterValidation,
        diameterTransitionProposals,
        diameterTransitionReviews,
        result,
      }),
    [
      accessoryProposalReviews,
      accessoryProposals,
      adoptedDiameterValidation,
      diameterTransitionProposals,
      diameterTransitionReviews,
      result,
    ],
  );
  const pendingSummary = useMemo(
    () =>
      createCalculationPendingSummary({
        decisions: pendingDecisions,
        materialTakeoff,
        result,
      }),
    [pendingDecisions, materialTakeoff, result],
  );
  const isDeliverMode = mode === "deliver";
  const isCalculationComplete =
    result?.status === "valid" && pendingSummary.decisionCount === 0;
  const canExportDocuments =
    isDeliverMode &&
    isCalculationComplete &&
    result !== null &&
    calculationSheet.rows.length > 0 &&
    pendingSummary.deliveryBlockingCount === 0;

  const handleExportExcel = async () => {
    if (!canExportDocuments || isExportingExcel) {
      return;
    }

    setExcelExportError(null);
    setIsExportingExcel(true);

    try {
      await downloadTechnicalWorkbook({
        calculationSheet,
        materialTakeoff,
      });
    } catch (error) {
      setExcelExportError(
        error instanceof Error
          ? error.message
          : "No se pudo generar el Excel.",
      );
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (!canExportDocuments || isExportingPdf) {
      return;
    }

    setPdfExportError(null);
    setIsExportingPdf(true);

    try {
      await downloadTechnicalPdf({
        calculationSheet,
        materialTakeoff,
        result,
      });
    } catch (error) {
      setPdfExportError(
        error instanceof Error
          ? error.message
          : "No se pudo generar el PDF.",
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  useEffect(() => {
    if (!result?.segments.some((segment) => segment.segmentId === selectedSegmentId)) {
      setSelectedSegmentId(result?.segments[0]?.segmentId ?? null);
    }
  }, [result, selectedSegmentId]);

  return (
    <section className="bg-white px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            {isDeliverMode ? "Entregar" : "Calcular"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {isDeliverMode && result ? (
            <button
              className="rounded border border-[var(--line)] bg-white px-2 py-1 text-xs hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canExportDocuments || isExportingExcel}
              type="button"
              onClick={handleExportExcel}
            >
              {isExportingExcel ? "Exportando..." : "Exportar Excel"}
            </button>
          ) : null}
          {isDeliverMode && result ? (
            <button
              className="rounded border border-[var(--line)] bg-white px-2 py-1 text-xs hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canExportDocuments || isExportingPdf}
              type="button"
              onClick={handleExportPdf}
            >
              {isExportingPdf ? "Exportando..." : "Exportar PDF"}
            </button>
          ) : null}
          {!isPlanActive && planReady ? (
            <button
              className="rounded border border-[var(--line)] bg-white px-2 py-1 text-xs hover:border-[var(--accent)]"
              type="button"
              onClick={onGoToPlan}
            >
              Ir a Planta
            </button>
          ) : null}
        </div>
      </div>

      {!planReady ? (
        <div className="mt-3 rounded border border-[#ecd5ad] bg-[#fff9ec] px-3 py-2 text-xs text-[var(--warning)]">
          Agregá una Planta para calcular.
        </div>
      ) : null}

      {hasPendingProposal ? (
        <div className="mt-3 rounded border border-[#dbeafe] bg-[#eff6ff] px-3 py-2 text-xs text-[#1d4ed8]">
          Hay una propuesta pendiente. El cálculo usa solo la red confirmada.
        </div>
      ) : null}

      {excelExportError ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {excelExportError}
        </div>
      ) : null}

      {pdfExportError ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {pdfExportError}
        </div>
      ) : null}

      {result ? (
        <>
          <CalculationSummary
            pendingSummary={pendingSummary}
            result={result}
          />
          {isDeliverMode ? (
            <DeliverReadinessGate
              pendingSummary={pendingSummary}
              result={result}
            />
          ) : null}
          <PendingDecisionList
            decisions={pendingDecisions}
            equipment={equipment}
            result={result}
            onAdoptSegmentDiameter={onAdoptSegmentDiameter}
            onConfirmAccessoryProposal={onConfirmAccessoryProposal}
            onConfirmDiameterTransition={onConfirmDiameterTransition}
            onGoToEquipment={onGoToEquipment}
            onGoToPlan={onGoToPlan}
            onRejectAccessoryProposal={onRejectAccessoryProposal}
            onRejectDiameterTransition={onRejectDiameterTransition}
          />
          {isDeliverMode ? (
            <>
              <MaterialTakeoffSection
                result={result}
                takeoff={materialTakeoff}
              />
              <CalculationSheetSection
                adoptedDiameterValidationBySegmentId={
                  adoptedDiameterValidationBySegmentId
                }
                sheet={calculationSheet}
              />
            </>
          ) : (
            <>
              <SegmentList
                adoptedDiameterValidationBySegmentId={
                  adoptedDiameterValidationBySegmentId
                }
                equipment={equipment}
                result={result}
                selectedSegmentId={selectedSegment?.segmentId ?? null}
                onSelectSegment={setSelectedSegmentId}
              />
              <MaterialTakeoffCompactSummary
                isCalculationOpen={!isCalculationComplete}
                pendingDecisionCount={pendingSummary.decisionCount}
                takeoff={materialTakeoff}
              />
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

function PendingDecisionList({
  decisions,
  equipment,
  result,
  onAdoptSegmentDiameter,
  onConfirmAccessoryProposal,
  onConfirmDiameterTransition,
  onGoToEquipment,
  onGoToPlan,
  onRejectAccessoryProposal,
  onRejectDiameterTransition,
}: {
  decisions: PendingCalculationDecision[];
  equipment: WorkbenchEquipment[];
  result: TechnicalCalculationResult;
  onAdoptSegmentDiameter: (segmentId: string, diameterId: string | null) => void;
  onConfirmAccessoryProposal: (proposalId: string, candidateId: string) => void;
  onConfirmDiameterTransition: (transitionId: string, candidateId: string) => void;
  onGoToEquipment: () => void;
  onGoToPlan: () => void;
  onRejectAccessoryProposal: (proposalId: string) => void;
  onRejectDiameterTransition: (transitionId: string) => void;
}) {
  const [selectedAccessoryCandidateById, setSelectedAccessoryCandidateById] =
    useState<Record<string, string>>({});
  const [selectedTransitionCandidateById, setSelectedTransitionCandidateById] =
    useState<Record<string, string>>({});
  const [selectedSharedCandidateById, setSelectedSharedCandidateById] =
    useState<Record<string, string>>({});
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));

  if (decisions.length === 0) {
    return null;
  }

  return (
    <section className="mt-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">
          Decisiones pendientes
        </h3>
        <div className="text-[10px] text-[var(--muted)]">
          {formatDecisionCount(decisions.length)}
        </div>
      </div>
      <div className="space-y-2">
        {decisions.map((item) => {
          if (item.kind === "combined") {
            return (
              <CombinedDecisionCard
                decision={item.decision}
                equipmentById={equipmentById}
                key={item.id}
                result={result}
                selectedCandidateId={selectedSharedCandidateById[item.id] ?? ""}
                onConfirm={(candidate) => {
                  onConfirmAccessoryProposal(
                    item.decision.accessory.proposal.id,
                    candidate.accessoryCandidateId,
                  );
                  onConfirmDiameterTransition(
                    item.decision.transition.proposal.id,
                    candidate.transitionCandidateId,
                  );
                }}
                onRejectAccessoryProposal={onRejectAccessoryProposal}
                onRejectDiameterTransition={onRejectDiameterTransition}
                onSelect={(candidateId) =>
                  setSelectedSharedCandidateById((current) => ({
                    ...current,
                    [item.id]: candidateId,
                  }))
                }
              />
            );
          }

          if (item.kind === "accessory") {
            const proposal = item.decision.proposal;

            return (
              <AccessoryDecisionCard
                decision={item.decision}
                equipmentById={equipmentById}
                key={item.id}
                result={result}
                selectedCandidateId={
                  selectedAccessoryCandidateById[proposal.id] ?? ""
                }
                onConfirm={onConfirmAccessoryProposal}
                onReject={onRejectAccessoryProposal}
                onSelect={(candidateId) =>
                  setSelectedAccessoryCandidateById((current) => ({
                    ...current,
                    [proposal.id]: candidateId,
                  }))
                }
              />
            );
          }

          if (item.kind === "transition") {
            const proposal = item.decision.proposal;

            return (
              <TransitionDecisionCard
                decision={item.decision}
                equipmentById={equipmentById}
                key={item.id}
                result={result}
                selectedCandidateId={
                  selectedTransitionCandidateById[proposal.id] ??
                  item.decision.review?.selectedCandidate?.id ??
                  ""
                }
                onConfirm={onConfirmDiameterTransition}
                onReject={onRejectDiameterTransition}
                onSelect={(candidateId) =>
                  setSelectedTransitionCandidateById((current) => ({
                    ...current,
                    [proposal.id]: candidateId,
                  }))
                }
              />
            );
          }

          if (item.kind === "adopted_diameter") {
            return (
              <AdoptedDiameterDecisionCard
                decision={item.decision}
                equipmentById={equipmentById}
                key={item.id}
                result={result}
                onAdoptSegmentDiameter={onAdoptSegmentDiameter}
              />
            );
          }

          return (
            <TechnicalDecisionCard
              decision={item.decision}
              equipmentById={equipmentById}
              key={item.id}
              result={result}
              onGoToEquipment={onGoToEquipment}
              onGoToPlan={onGoToPlan}
            />
          );
        })}
      </div>
    </section>
  );
}

function AccessoryDecisionCard({
  decision,
  equipmentById,
  result,
  selectedCandidateId,
  onConfirm,
  onReject,
  onSelect,
}: {
  decision: PendingAccessoryDecision;
  equipmentById: Map<string, WorkbenchEquipment>;
  result: TechnicalCalculationResult;
  selectedCandidateId: string;
  onConfirm: (proposalId: string, candidateId: string) => void;
  onReject: (proposalId: string) => void;
  onSelect: (candidateId: string) => void;
}) {
  const proposal = decision.proposal;
  const review = decision.review;
  const selectedCandidate =
    review?.candidates.find((item) => item.id === selectedCandidateId) ?? null;
  const canConfirm = selectedCandidate?.status === "compatible";

  return (
    <DecisionCard
      primaryAction={
        <button
          className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-[11px] text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canConfirm}
          type="button"
          onClick={() => onConfirm(proposal.id, selectedCandidateId)}
        >
          Confirmar accesorio
        </button>
      }
      secondaryAction={
        <button
          className="rounded border border-transparent px-2 py-1 text-[11px] text-[var(--muted)] hover:border-[var(--line)]"
          type="button"
          onClick={() => onReject(proposal.id)}
        >
          Rechazar
        </button>
      }
      title={`Confirmar ${accessoryProposalKindLabel(proposal.kind).toLowerCase()}`}
    >
      <DecisionContext
        diameters={formatAccessoryProposalDiameters(review)}
        equipmentById={equipmentById}
        result={result}
        segmentIds={proposal.incidentSegmentIds}
      />
      <div className="mt-1 text-[10px] text-[var(--warning)]">
        {formatAccessoryProposalProblem(proposal, review)}
      </div>
      {review ? (
        <CandidateSelector
          proposal={proposal}
          review={review}
          selectedCandidateId={selectedCandidateId}
          onSelect={onSelect}
        />
      ) : null}
    </DecisionCard>
  );
}

function TransitionDecisionCard({
  decision,
  equipmentById,
  result,
  selectedCandidateId,
  onConfirm,
  onReject,
  onSelect,
}: {
  decision: PendingTransitionDecision;
  equipmentById: Map<string, WorkbenchEquipment>;
  result: TechnicalCalculationResult;
  selectedCandidateId: string;
  onConfirm: (transitionId: string, candidateId: string) => void;
  onReject: (transitionId: string) => void;
  onSelect: (candidateId: string) => void;
}) {
  const proposal = decision.proposal;
  const review = decision.review;
  const selectedCandidate =
    review?.candidates.find((item) => item.id === selectedCandidateId) ?? null;
  const selectedCandidateAlreadyConfirmed =
    proposal.decision?.status === "confirmed" &&
    selectedCandidate !== null &&
    proposal.decision.catalogFamilyId === selectedCandidate.familyId &&
    (!proposal.decision.pipeSystemId ||
      proposal.decision.pipeSystemId === selectedCandidate.pipeSystem.id);
  const canConfirm =
    selectedCandidate?.status === "compatible" &&
    !selectedCandidateAlreadyConfirmed;

  return (
    <DecisionCard
      primaryAction={
        <button
          className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-[11px] text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canConfirm}
          type="button"
          onClick={() => onConfirm(proposal.id, selectedCandidateId)}
        >
          Resolver transición
        </button>
      }
      secondaryAction={
        <button
          className="rounded border border-transparent px-2 py-1 text-[11px] text-[var(--muted)] hover:border-[var(--line)]"
          type="button"
          onClick={() => onReject(proposal.id)}
        >
          Rechazar
        </button>
      }
      title={diameterTransitionKindLabel(proposal.kind)}
    >
      <DecisionContext
        diameters={diameterTransitionMainLabel(proposal)}
        equipmentById={equipmentById}
        result={result}
        segmentIds={diameterTransitionSegmentIds(proposal)}
      />
      <div className="mt-1 text-[10px] text-[var(--warning)]">
        {formatDiameterTransitionProblem(proposal, review)}
      </div>
      {review ? (
        <DiameterTransitionCandidateSelector
          proposal={proposal}
          review={review}
          selectedCandidateId={selectedCandidateId}
          onSelect={onSelect}
        />
      ) : null}
    </DecisionCard>
  );
}

function CombinedDecisionCard({
  decision,
  equipmentById,
  result,
  selectedCandidateId,
  onConfirm,
  onRejectAccessoryProposal,
  onRejectDiameterTransition,
  onSelect,
}: {
  decision: PendingCombinedDecision;
  equipmentById: Map<string, WorkbenchEquipment>;
  result: TechnicalCalculationResult;
  selectedCandidateId: string;
  onConfirm: (candidate: SharedDecisionCandidate) => void;
  onRejectAccessoryProposal: (proposalId: string) => void;
  onRejectDiameterTransition: (transitionId: string) => void;
  onSelect: (candidateId: string) => void;
}) {
  const selectedCandidate =
    decision.sharedCandidates.find((item) => item.id === selectedCandidateId) ??
    null;
  const segmentIds = [
    ...new Set([
      ...decision.accessory.proposal.incidentSegmentIds,
      ...diameterTransitionSegmentIds(decision.transition.proposal),
    ]),
  ];

  return (
    <DecisionCard
      primaryAction={
        <button
          className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-[11px] text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!selectedCandidate}
          type="button"
          onClick={() => {
            if (selectedCandidate) {
              onConfirm(selectedCandidate);
            }
          }}
        >
          Confirmar familia
        </button>
      }
      secondaryAction={
        <div className="flex flex-wrap gap-1">
          <button
            className="rounded border border-transparent px-2 py-1 text-[11px] text-[var(--muted)] hover:border-[var(--line)]"
            type="button"
            onClick={() =>
              onRejectAccessoryProposal(decision.accessory.proposal.id)
            }
          >
            Rechazar accesorio
          </button>
          <button
            className="rounded border border-transparent px-2 py-1 text-[11px] text-[var(--muted)] hover:border-[var(--line)]"
            type="button"
            onClick={() =>
              onRejectDiameterTransition(decision.transition.proposal.id)
            }
          >
            Rechazar transición
          </button>
        </div>
      }
      title="Confirmar familia técnica"
    >
      <DecisionContext
        diameters={diameterTransitionMainLabel(decision.transition.proposal)}
        equipmentById={equipmentById}
        result={result}
        segmentIds={segmentIds}
      />
      <label className="mt-2 block">
        <span className="text-[10px] font-semibold uppercase text-[var(--muted)]">
          Familia
        </span>
        <select
          className="mt-1 w-full rounded border border-[var(--line)] bg-white px-2 py-1 text-xs"
          value={selectedCandidateId}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="">Seleccionar familia</option>
          {decision.sharedCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-1 text-[10px] text-[var(--muted)]">
        {selectedCandidate
          ? selectedCandidate.reason
          : "Una seleccion compatible resuelve accesorio y transicion."}
      </div>
    </DecisionCard>
  );
}

function AdoptedDiameterDecisionCard({
  decision,
  equipmentById,
  result,
  onAdoptSegmentDiameter,
}: {
  decision: PendingAdoptedDiameterDecision;
  equipmentById: Map<string, WorkbenchEquipment>;
  result: TechnicalCalculationResult;
  onAdoptSegmentDiameter: (segmentId: string, diameterId: string | null) => void;
}) {
  return (
    <DecisionCard title="Ajustar diámetro adoptado">
      <DecisionContext
        diameters={`${formatDiameterSymbol(
          decision.validation.adoptedDiameter,
        )} adoptado / ${formatDiameterSymbol(
          decision.validation.requiredDiameter,
        )} requerido`}
        equipmentById={equipmentById}
        result={result}
        segmentIds={[decision.segment.segmentId]}
      />
      <div className="mt-1 text-[10px] text-[var(--warning)]">
        {decision.validation.reason ??
          "El diámetro adoptado requiere revisión profesional."}
      </div>
      <div className="mt-2">
        <SegmentAdoptedDiameterControl
          validation={decision.validation}
          onAdoptSegmentDiameter={onAdoptSegmentDiameter}
        />
      </div>
    </DecisionCard>
  );
}

function TechnicalDecisionCard({
  decision,
  equipmentById,
  result,
  onGoToEquipment,
  onGoToPlan,
}: {
  decision: PendingTechnicalDecision;
  equipmentById: Map<string, WorkbenchEquipment>;
  result: TechnicalCalculationResult;
  onGoToEquipment: () => void;
  onGoToPlan: () => void;
}) {
  const targetsEquipment = technicalIssueTargetsEquipment(decision.issue);

  return (
    <DecisionCard
      primaryAction={
        <button
          className="rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-[11px] text-white"
          type="button"
          onClick={targetsEquipment ? onGoToEquipment : onGoToPlan}
        >
          Revisar {targetsEquipment ? "artefactos" : "planta"}
        </button>
      }
      title={targetsEquipment ? "Completar artefacto" : "Completar trazado"}
    >
      <div className="text-[10px] text-[var(--muted)]">
        {technicalIssueLocation(decision.issue, result, equipmentById) ??
          "Instalacion"}
      </div>
      <div className="mt-1 text-[10px] text-[var(--warning)]">
        {technicalIssueAction(decision.issue)}
      </div>
    </DecisionCard>
  );
}

function DecisionCard({
  children,
  primaryAction,
  secondaryAction,
  title,
}: {
  children: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded border border-[var(--line)] px-3 py-2 text-xs">
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {children}
      </div>
      {primaryAction || secondaryAction ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {primaryAction}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

function DecisionContext({
  diameters,
  equipmentById,
  result,
  segmentIds,
}: {
  diameters: string;
  equipmentById: Map<string, WorkbenchEquipment>;
  result: TechnicalCalculationResult;
  segmentIds: string[];
}) {
  return (
    <dl className="mt-1 grid gap-y-0.5 text-[10px]">
      <div>
        <dt className="text-[var(--muted)]">Tramo</dt>
        <dd>{formatDecisionSegmentSummary(segmentIds, result, equipmentById)}</dd>
      </div>
      <div>
        <dt className="text-[var(--muted)]">Alimenta</dt>
        <dd>{formatDecisionApplianceSummary(segmentIds, result, equipmentById)}</dd>
      </div>
      <div>
        <dt className="text-[var(--muted)]">Diámetros</dt>
        <dd>{diameters}</dd>
      </div>
    </dl>
  );
}

function DiameterTransitionCandidateSelector({
  proposal,
  review,
  selectedCandidateId,
  onSelect,
}: {
  proposal: DiameterTransitionProposal;
  review: DiameterTransitionTechnicalReview;
  selectedCandidateId: string;
  onSelect: (candidateId: string) => void;
}) {
  if (review.candidates.length === 0) {
    return (
      <div className="mt-1 text-[10px] text-[var(--warning)]">
        {review.reason ?? "No hay familias tecnicas compatibles."}
      </div>
    );
  }

  const selectedCandidate =
    review.candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    null;

  return (
    <div className="mt-2 space-y-1">
      <label className="block text-[10px] font-semibold uppercase text-[var(--muted)]">
        {proposal.kind === "compound_turn_transition"
          ? "Familia de reduccion"
          : "Familia de transicion"}
      </label>
      <select
        className="w-full rounded border border-[var(--line)] bg-white px-2 py-1 text-xs"
        value={selectedCandidateId}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="">Seleccionar familia</option>
        {review.candidates.map((candidate) => (
          <option
            disabled={candidate.status !== "compatible"}
            key={candidate.id}
            value={candidate.id}
          >
            {candidateOptionLabel(candidate)}
          </option>
        ))}
      </select>
      <div className="text-[10px] text-[var(--muted)]">
        {selectedCandidate
          ? selectedCandidate.reason
          : review.reason ?? "Seleccion pendiente."}
      </div>
    </div>
  );
}

function DiameterTransitionPreview({
  contributions,
  isTransitionAwareResolved,
  proposal,
  review,
}: {
  contributions: TechnicalRouteTransitionContribution[];
  isTransitionAwareResolved: boolean;
  proposal: DiameterTransitionProposal;
  review: DiameterTransitionTechnicalReview | null;
}) {
  const contribution = contributions[0] ?? null;
  const familyLabel =
    review?.selectedCandidate?.label ??
    review?.candidates.find(
      (candidate) => candidate.familyId === proposal.selectedCatalogFamilyId,
    )?.label ??
    proposal.selectedCatalogFamilyId ??
    null;

  if (!familyLabel && contributions.length === 0) {
    if (proposal.kind !== "compound_turn_transition" || !review?.compoundPreview) {
      return null;
    }
  }

  if (proposal.kind === "compound_turn_transition" && review?.compoundPreview) {
    return (
      <CompoundTurnTransitionPreview
        isTransitionAwareResolved={isTransitionAwareResolved}
        preview={review.compoundPreview}
      />
    );
  }

  if (proposal.kind === "branch_transition") {
    return (
      <div className="mt-1 text-[10px] text-[var(--muted)]">
        <div>
          {isTransitionAwareResolved
            ? "Tee reductora por recorrido"
            : "Preview tee reductora por recorrido"}
        </div>
        {familyLabel ? <div>Familia: {familyLabel}</div> : null}
        {contributions.length > 0 ? (
          <ul className="mt-0.5 space-y-0.5">
            {contributions.map((item, index) => (
              <li key={`${item.routeId}:${item.transitionId}:${index}`}>
                {item.routeId} - {transitionTraversalKindLabel(item.traversalKind)} -{" "}
                {item.variant?.label ?? item.reason ?? "Pendiente"} -{" "}
                {formatCalculationMeters(
                  item.equivalentLengthMeters,
                  "Pendiente",
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div>Pendiente por recorrido</div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1 text-[10px] text-[var(--muted)]">
      {familyLabel ? <div>Familia: {familyLabel}</div> : null}
      {contribution ? (
        <>
          <div>
            Variante:{" "}
            {contribution.variant?.label ??
              contribution.reason ??
              "Pendiente"}
          </div>
          <div>
            Equivalencia:{" "}
            {formatCalculationMeters(
              contribution.equivalentLengthMeters,
              "Pendiente",
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CompoundTurnTransitionPreview({
  isTransitionAwareResolved,
  preview,
}: {
  isTransitionAwareResolved: boolean;
  preview: CompoundTurnTransitionPreviewModel;
}) {
  const participatesInSolver =
    isTransitionAwareResolved && preview.status === "resolved";

  return (
    <div className="mt-1 space-y-0.5 text-[10px] text-[var(--muted)]">
      <div className="font-medium text-[#1d4ed8]">
        {participatesInSolver
          ? "Forma parte de la longitud final del solver global."
          : "Preview: todavia no participa del solver global."}
      </div>
      <div>Solucion tecnica: {preview.solutionLabel}</div>
      <div>{compoundDirectCandidateLabel(preview)}</div>
      {preview.contributions.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5">
          {preview.contributions.map((contribution) => (
            <li key={`${contribution.role}:${contribution.segmentId ?? ""}`}>
              {compoundContributionRoleLabel(contribution.role)} -{" "}
              {contribution.variantLabel ?? contribution.reason ?? "Pendiente"} -{" "}
              Familia: {contribution.catalogFamilyId ?? "pendiente"} - Equiv.:{" "}
              {formatCalculationMeters(
                contribution.equivalentLengthMeters,
                "Pendiente",
              )}{" "}
              - {compoundContributionStatusLabel(contribution.status)}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        {participatesInSolver ? "Total compound" : "Total preview"}:{" "}
        {formatCalculationMeters(preview.totalEquivalentLengthMeters, "Pendiente")}
      </div>
      <div>Estado: {compoundConfirmationStateLabel(preview.confirmationState)}</div>
    </div>
  );
}

function ProposalTechnicalContext({
  review,
}: {
  review: AccessoryProposalTechnicalReview;
}) {
  const diameters = review.incidentSegments
    .map(
      (segment) =>
        `${segment.segmentId}: ${
          segment.diameter ? formatDiameterReference(segment.diameter) : "Pendiente"
        }`,
    )
    .join(" - ");
  const owner =
    review.ownerResolution.status === "unambiguous"
      ? `Owner ${review.ownerResolution.ownerSegmentId}`
      : review.ownerResolution.reason;

  return (
    <div className="mt-0.5 text-[10px] text-[var(--muted)]">
      {diameters}
      {diameters ? " - " : ""}
      {owner}
    </div>
  );
}

function CandidateSelector({
  proposal,
  review,
  selectedCandidateId,
  onSelect,
}: {
  proposal: AccessoryProposal;
  review: AccessoryProposalTechnicalReview;
  selectedCandidateId: string;
  onSelect: (candidateId: string) => void;
}) {
  if (review.candidates.length === 0) {
    return (
      <div className="mt-1 text-[10px] text-[var(--warning)]">
        {review.reason ?? "No hay familias tecnicas compatibles."}
      </div>
    );
  }

  const selectedCandidate =
    review.candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    null;

  return (
    <div className="mt-2 space-y-1">
      <label className="block text-[10px] font-semibold uppercase text-[var(--muted)]">
        Tipo de accesorio
      </label>
      <select
        className="w-full rounded border border-[var(--line)] bg-white px-2 py-1 text-xs"
        value={selectedCandidateId}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="">Seleccionar familia</option>
        {review.candidates.map((candidate) => (
          <option
            disabled={candidate.status !== "compatible"}
            key={candidate.id}
            value={candidate.id}
          >
            {candidateOptionLabel(candidate)}
          </option>
        ))}
      </select>
      <div className="text-[10px] text-[var(--muted)]">
        {selectedCandidate
          ? selectedCandidate.reason
          : review.reason ?? proposal.reason}
      </div>
    </div>
  );
}

function candidateOptionLabel(candidate: AccessoryCatalogCandidate) {
  const suffix =
    candidate.status === "compatible"
      ? ""
      : candidate.status === "incompatible"
        ? " - incompatible"
        : " - requiere datos";

  return `${candidate.label}${suffix}`;
}

function previewContributionsForTransition(
  transitionId: string,
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>,
) {
  return Object.values(routeTransitionResolutions)
    .flatMap((resolution) => resolution.contributions)
    .filter((contribution) => contribution.transitionId === transitionId)
    .sort(
      (first, second) =>
        first.order - second.order ||
        first.routeId.localeCompare(second.routeId),
    );
}

function diameterTransitionMainLabel(proposal: DiameterTransitionProposal) {
  if (proposal.kind === "compound_turn_transition") {
    return formatCompoundTurnTransitionLabel(proposal);
  }

  const upstream = proposal.upstreamDiameter?.diameter ?? null;
  const downstream = proposal.downstreamDiameters.map((item) => item.diameter);

  if (downstream.length === 0) {
    return `Aguas arriba ${formatCompactDiameterReference(upstream)}`;
  }

  return `${formatCompactDiameterReference(upstream)} -> ${downstream
    .map(formatCompactDiameterReference)
    .join(" / ")}`;
}

function compoundDirectCandidateLabel(preview: CompoundTurnTransitionPreviewModel) {
  if (preview.directCandidates.length === 0) {
    return "Pieza unica SIGAS: no encontrada en Tabla No 3 cargada.";
  }

  if (preview.directCandidates.length === 1) {
    return `Pieza unica SIGAS: ${preview.directCandidates[0]?.label ?? "pendiente"}.`;
  }

  return `Pieza unica SIGAS: ${preview.directCandidates.length} alternativas requieren decision.`;
}

function compoundContributionRoleLabel(
  role: CompoundTurnTransitionPreviewModel["contributions"][number]["role"],
) {
  switch (role) {
    case "turn":
      return "Giro";
    case "diameter_change":
      return "Cambio de diametro";
  }
}

function compoundContributionStatusLabel(
  status: CompoundTurnTransitionPreviewModel["contributions"][number]["status"],
) {
  switch (status) {
    case "resolved":
      return "resuelta";
    case "needs_review":
      return "requiere confirmacion";
    case "unsupported":
      return "no soportada";
    case "unresolved":
      return "pendiente";
  }
}

function compoundConfirmationStateLabel(
  state: CompoundTurnTransitionPreviewModel["confirmationState"],
) {
  switch (state) {
    case "confirmed":
      return "codo y reduccion confirmados";
    case "needs_elbow_confirmation":
      return "falta confirmar el codo";
    case "needs_reduction_confirmation":
      return "falta confirmar la reduccion";
    case "needs_compatible_decisions":
      return "requiere decisiones compatibles";
    case "unsupported":
      return "no soportado";
  }
}

function diameterTransitionOrientationLabel(
  proposal: DiameterTransitionProposal,
) {
  const upstream = proposal.upstreamSegmentId ?? "pendiente";
  const downstream =
    proposal.downstreamSegmentIds.length > 0
      ? proposal.downstreamSegmentIds.join(", ")
      : "pendiente";

  return `Upstream ${upstream} - downstream ${downstream} - ${diameterTransitionDirectionLabel(proposal.direction)}`;
}

function diameterTransitionBranchLabel(proposal: DiameterTransitionProposal) {
  return proposal.downstreamDiameters
    .map(
      (item) =>
        `${item.segmentId}: ${formatCompactDiameterReference(item.diameter)}`,
    )
    .join(" - ");
}

function diameterTransitionKindLabel(kind: DiameterTransitionProposal["kind"]) {
  switch (kind) {
    case "simple_reduction":
      return "Reduccion en tramo recto";
    case "simple_transition":
      return "Transicion simple";
    case "compound_turn_transition":
      return "Codo con cambio de diametro";
    case "branch_transition":
      return "Tee multidiametro";
    case "not_required":
      return "Sin transicion activa";
    case "unsupported":
      return "Configuracion no soportada";
    case "unresolved":
      return "Transicion pendiente";
  }
}

function diameterTransitionStateLabel(
  proposal: DiameterTransitionProposal,
) {
  switch (proposal.state) {
    case "confirmed":
      return "confirmada";
    case "rejected":
      return "rechazada";
    case "needs_review":
      return "requiere revision";
    case "not_required":
      return "no requerida";
    case "transition_required":
      return "requiere seleccion";
    case "unsupported":
      return "no soportada";
    case "unresolved":
      return "pendiente";
  }
}

function diameterTransitionStateSymbol(
  state: DiameterTransitionProposal["state"],
) {
  switch (state) {
    case "confirmed":
      return "OK";
    case "rejected":
      return "x";
    case "needs_review":
    case "unsupported":
    case "unresolved":
      return "?";
    case "not_required":
      return "-";
    case "transition_required":
      return "+";
  }
}

function diameterTransitionDirectionLabel(
  direction: DiameterTransitionProposal["direction"],
) {
  switch (direction) {
    case "reducing":
      return "reduccion";
    case "expanding":
      return "expansion";
    case "mixed":
      return "mixta";
    case "unknown":
      return "orientacion pendiente";
  }
}

function accessoryProposalKindLabel(kind: AccessoryProposal["kind"]) {
  switch (kind) {
    case "elbow":
      return "Codo";
    case "tee":
      return "Tee";
    case "straight":
      return "Paso recto";
    case "terminal":
      return "Terminal";
    case "unsupported":
      return "Revision";
  }
}

function accessoryProposalStateLabel(proposal: AccessoryProposal) {
  if (proposal.state === "confirmed") {
    return "confirmado";
  }

  if (proposal.state === "rejected") {
    return "rechazado";
  }

  if (proposal.state === "needs_review") {
    return proposal.kind === "unsupported" ? "no soportado" : "requiere revision";
  }

  return "propuesto";
}

function proposalStateSymbol(state: AccessoryProposal["state"]) {
  switch (state) {
    case "confirmed":
      return "OK";
    case "rejected":
      return "x";
    case "needs_review":
      return "?";
    case "proposed":
      return "+";
  }
}

function proposalEvidenceLabel(proposal: AccessoryProposal) {
  const segments = proposal.incidentSegmentIds.join(", ");
  const angle =
    proposal.evidence.angleDegrees === undefined
      ? null
      : `${proposal.evidence.angleDegrees.toLocaleString("es-AR", {
          maximumFractionDigits: 1,
        })} deg`;

  return [
    `grado ${proposal.evidence.degree}`,
    angle,
    segments ? `tramos ${segments}` : null,
    proposal.suggestedCatalogCode
      ? `SIGAS ${proposal.suggestedCatalogCode}`
      : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

function proposalReviewReason(proposal: AccessoryProposal) {
  if (proposal.state === "confirmed" || proposal.state === "rejected") {
    return null;
  }

  if (proposal.systemMatch?.status === "needs_review") {
    return proposal.systemMatch.reason;
  }

  if (proposal.systemMatch?.status === "unsupported") {
    return proposal.systemMatch.reason;
  }

  if (proposal.ownerResolution.status === "ambiguous") {
    return proposal.ownerResolution.reason;
  }

  return proposal.reason;
}

function isActionableAccessoryProposal(proposal: AccessoryProposal) {
  return (
    proposal.state !== "confirmed" &&
    proposal.state !== "rejected" &&
    proposal.kind !== "straight" &&
    proposal.kind !== "terminal"
  );
}

function isActionableDiameterTransitionProposal(
  proposal: DiameterTransitionProposal,
) {
  return (
    proposal.state !== "confirmed" &&
    proposal.state !== "rejected" &&
    proposal.state !== "not_required"
  );
}

function formatAccessoryProposalTitle(
  proposal: AccessoryProposal,
  result: TechnicalCalculationResult,
) {
  return `${accessoryProposalKindLabel(proposal.kind)} en ${formatNodeReference(
    proposal.nodeId,
    result,
  )}`;
}

function formatAccessoryProposalDiameters(
  review: AccessoryProposalTechnicalReview | null,
) {
  if (!review || review.incidentSegments.length === 0) {
    return "Diametros pendientes";
  }

  const diameters = [
    ...new Set(
      review.incidentSegments.map((segment) =>
        formatCompactDiameterReference(segment.diameter),
      ),
    ),
  ].filter((label) => label !== "Diam. pendiente");

  return diameters.length > 0 ? diameters.join(" / ") : "Diametros pendientes";
}

function formatAccessoryProposalProblem(
  proposal: AccessoryProposal,
  review: AccessoryProposalTechnicalReview | null,
) {
  return (
    review?.reason ??
    proposalReviewReason(proposal) ??
    "Elegir una familia compatible o rechazar la propuesta."
  );
}

function formatDiameterTransitionContext(
  proposal: DiameterTransitionProposal,
  result: TechnicalCalculationResult,
) {
  return `en ${formatNodeReference(proposal.nodeId, result)}`;
}

function formatDiameterTransitionProblem(
  proposal: DiameterTransitionProposal,
  review: DiameterTransitionTechnicalReview | null,
) {
  return (
    review?.reason ??
    proposal.reason ??
    "Elegir una familia compatible o rechazar la transicion."
  );
}

function formatNodeReference(
  nodeId: string,
  result: TechnicalCalculationResult,
) {
  return readableNodeLabel(result.nodeLabels[nodeId]);
}

function CalculationSummary({
  pendingSummary,
  result,
}: {
  pendingSummary: CalculationPendingSummary;
  result: TechnicalCalculationResult;
}) {
  const totalFlow = formatTechnicalFlow(
    result.totals.accumulatedFlow,
    result.totals.accumulatedFlowUnit,
  );
  const calculationLength = formatTotalCalculationLength(result);
  const status =
    result.status === "valid" && pendingSummary.decisionCount === 0
      ? "Cálculo completo"
      : `Requiere revisión · ${formatDecisionCount(
          pendingSummary.decisionCount,
        )}`;

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <div className="font-semibold">{status}</div>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <dt className="text-[10px] uppercase text-[var(--muted)]">Tramos</dt>
          <dd className="font-mono">{result.totals.segmentCount}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-[var(--muted)]">
            Artefactos
          </dt>
          <dd className="font-mono">{result.totals.applianceCount}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-[var(--muted)]">Caudal</dt>
          <dd>{totalFlow}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-[var(--muted)]">
            Longitud cálculo
          </dt>
          <dd>{calculationLength}</dd>
        </div>
      </dl>
    </section>
  );
}

function DeliverReadinessGate({
  pendingSummary,
  result,
}: {
  pendingSummary: CalculationPendingSummary;
  result: TechnicalCalculationResult;
}) {
  const isReady =
    result.status === "valid" && pendingSummary.deliveryBlockingCount === 0;

  if (isReady) {
    return (
      <div className="mt-3 rounded border border-[#badbcc] bg-[#f1faf4] px-3 py-2 text-xs text-[#1f6b45]">
        <div className="font-semibold">Entrega lista</div>
        <div className="mt-0.5">
          Materiales, planilla tecnica y exportes disponibles.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded border border-[#f1d28a] bg-[#fffaf0] px-3 py-2 text-xs text-[var(--warning)]">
      <div className="font-semibold">Entrega bloqueada</div>
      <div className="mt-0.5">
        {pendingSummary.decisionCount > 0
          ? `Resolver ${formatDecisionCount(
              pendingSummary.decisionCount,
            )} antes de exportar.`
          : "Completar cálculo y materiales antes de exportar."}
      </div>
    </div>
  );
}

function MaterialTakeoffSection({
  result,
  takeoff,
}: {
  result: TechnicalCalculationResult;
  takeoff: TechnicalMaterialTakeoff;
}) {
  const hasMaterials =
    takeoff.pipeItems.length > 0 || takeoff.accessoryItems.length > 0;

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
        Materiales
      </h3>
      {hasMaterials ? (
        <>
          {takeoff.pipeItems.length > 0 ? (
            <div>
              <div className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                Caneria neta
              </div>
              <ul className="mt-1 space-y-1">
                {takeoff.pipeItems.map((item) => (
                  <li
                    className="flex items-baseline justify-between gap-2"
                    key={item.diameterKey}
                  >
                    <span>{item.label}</span>
                    <span className="text-right font-mono">
                      {formatCalculationMeters(item.physicalLengthMeters)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {takeoff.accessoryItems.length > 0 ? (
            <div className={takeoff.pipeItems.length > 0 ? "mt-2" : ""}>
              <div className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                Accesorios fisicos
              </div>
              <ul className="mt-1 space-y-1">
                {takeoff.accessoryItems.map((item) => (
                  <li
                    className="flex items-baseline justify-between gap-2"
                    key={`${item.source}:${item.familyId}:${item.configurationKey}`}
                  >
                    <span>{item.label}</span>
                    <span className="text-right font-mono">
                      {formatMaterialQuantity(item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-[var(--muted)]">
          Sin materiales computables.
        </div>
      )}
      <dl className="mt-2 border-t border-[var(--line)] pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <dt>Total neto caneria</dt>
          <dd className="text-right font-mono">
            {formatCalculationMeters(
              takeoff.physicalMaterialQuantities.pipeLengthMeters,
            )}
          </dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <dt>Total accesorios</dt>
          <dd className="text-right font-mono">
            {formatMaterialQuantity(
              takeoff.physicalMaterialQuantities.accessoryQuantity,
            )}
          </dd>
        </div>
      </dl>
      {takeoff.pendingSummary.total > 0 ? (
        <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1 text-[var(--warning)]">
          {formatMaterialPendingSummary(takeoff)}
        </div>
      ) : null}
      {takeoff.pendingItems.length > 0 ? (
        <ul className="mt-1 space-y-1 text-[10px] text-[var(--muted)]">
          {takeoff.pendingItems.map((item) => (
            <li key={`${item.code}:${item.sourceId ?? item.segmentId ?? ""}`}>
              {formatMaterialPendingItem(item, result)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MaterialTakeoffCompactSummary({
  isCalculationOpen,
  pendingDecisionCount,
  takeoff,
}: {
  isCalculationOpen: boolean;
  pendingDecisionCount: number;
  takeoff: TechnicalMaterialTakeoff;
}) {
  const hasMaterials =
    takeoff.pipeItems.length > 0 || takeoff.accessoryItems.length > 0;
  const openMessage =
    pendingDecisionCount > 0
      ? "Materiales incompletos · se completarán al resolver las decisiones pendientes."
      : "Materiales incompletos · se completarán al cerrar el cálculo.";

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">
          Materiales
        </h3>
        <div className="text-[10px] text-[var(--muted)]">
          {hasMaterials && !isCalculationOpen ? "Precomputo" : "Secundario"}
        </div>
      </div>
      {isCalculationOpen ? (
        <div className="text-[var(--muted)]">{openMessage}</div>
      ) : (
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-[10px] uppercase text-[var(--muted)]">
              Caneria
            </dt>
            <dd className="font-mono">
              {formatCalculationMeters(
                takeoff.physicalMaterialQuantities.pipeLengthMeters,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-[var(--muted)]">
              Accesorios
            </dt>
            <dd className="font-mono">
              {formatMaterialQuantity(
                takeoff.physicalMaterialQuantities.accessoryQuantity,
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function TechnicalAxonometricSection({
  view,
}: {
  view: TechnicalAxonometricView;
}) {
  const hasGeometry =
    view.nodes.some((node) => node.projected) ||
    view.segments.some(
      (segment) => segment.fromProjected && segment.toProjected,
    );

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">
          Axonometrica tecnica
        </h3>
        <div className="text-[10px] text-[var(--muted)]">
          {technicalAxonometricStatusLabel(view)}
        </div>
      </div>
      {hasGeometry ? (
        <div className="overflow-hidden rounded border border-[var(--line)] bg-[#fbfcfd]">
          <svg
            aria-label="Axonometrica tecnica"
            className="h-[320px] w-full"
            preserveAspectRatio="xMidYMid meet"
            viewBox={`${view.viewBox.minX} ${view.viewBox.minY} ${view.viewBox.width} ${view.viewBox.height}`}
          >
            <g>
              {view.segments.map((segment) => (
                <TechnicalAxonometricSegmentLine
                  key={segment.id}
                  segment={segment}
                />
              ))}
              {view.accessories.map((accessory) => (
                <TechnicalAxonometricAccessoryMarker
                  accessory={accessory}
                  key={accessory.id}
                />
              ))}
              {view.nodes.map((node) => (
                <TechnicalAxonometricNodeMarker
                  key={node.id}
                  node={node}
                />
              ))}
            </g>
          </svg>
        </div>
      ) : (
        <div className="rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-2 text-[var(--warning)]">
          Axonometrica pendiente.
        </div>
      )}
      {view.pendingItems.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[10px] text-[var(--muted)]">
          {view.pendingItems.slice(0, 5).map((item) => (
            <li key={item.id}>
              {item.sourceLabel ?? "Observacion"}: {item.message}
            </li>
          ))}
          {view.pendingItems.length > 5 ? (
            <li>+ {view.pendingItems.length - 5} pendientes</li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

function TechnicalAxonometricSegmentLine({
  segment,
}: {
  segment: TechnicalAxonometricSegment;
}) {
  if (!segment.fromProjected || !segment.toProjected) {
    return null;
  }

  const label = technicalAxonometricSegmentLabel(segment);

  return (
    <g>
      <line
        stroke={technicalAxonometricSegmentStroke(segment)}
        strokeDasharray={segment.status === "pending" ? "5 4" : undefined}
        strokeLinecap="round"
        strokeWidth={technicalAxonometricSegmentStrokeWidth(segment)}
        x1={segment.fromProjected.x}
        x2={segment.toProjected.x}
        y1={segment.fromProjected.y}
        y2={segment.toProjected.y}
      />
      {segment.labelPosition ? (
        <text
          fill="#263238"
          fontSize="7.5"
          stroke="#fbfcfd"
          strokeWidth="2.5"
          textAnchor="middle"
          x={segment.labelPosition.x}
          y={segment.labelPosition.y}
        >
          {label}
        </text>
      ) : null}
      {segment.labelPosition ? (
        <text
          fill="#263238"
          fontSize="7.5"
          textAnchor="middle"
          x={segment.labelPosition.x}
          y={segment.labelPosition.y}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

function TechnicalAxonometricNodeMarker({
  node,
}: {
  node: TechnicalAxonometricNode;
}) {
  if (!node.projected) {
    return null;
  }

  const fill =
    node.kind === "supply"
      ? "#111827"
      : node.kind === "appliance"
        ? "#ffffff"
        : node.kind === "derivation"
          ? "#e8f5f2"
          : "#ffffff";
  const stroke =
    node.kind === "supply"
      ? "#111827"
      : node.kind === "appliance"
        ? "#3b5bdb"
        : "#0f766e";

  return (
    <g>
      {node.kind === "derivation" ? (
        <rect
          fill={fill}
          height="8"
          stroke={stroke}
          strokeWidth="1.4"
          width="8"
          x={node.projected.x - 4}
          y={node.projected.y - 4}
        />
      ) : (
        <circle
          cx={node.projected.x}
          cy={node.projected.y}
          fill={fill}
          r={node.kind === "supply" ? 4.5 : 4}
          stroke={stroke}
          strokeWidth="1.4"
        />
      )}
      <text
        fill={node.kind === "supply" ? "#111827" : "#263238"}
        fontSize="8"
        fontWeight={node.kind === "supply" ? "700" : "600"}
        textAnchor="middle"
        x={node.projected.x}
        y={node.projected.y - 8}
      >
        {node.label}
      </text>
      {node.point?.zMeters !== null && node.point?.zMeters !== undefined ? (
        <text
          fill="#607d8b"
          fontSize="6.5"
          textAnchor="middle"
          x={node.projected.x}
          y={node.projected.y + 13}
        >
          z {formatSignedMeters(node.point.zMeters)}
        </text>
      ) : null}
    </g>
  );
}

function TechnicalAxonometricAccessoryMarker({
  accessory,
}: {
  accessory: TechnicalAxonometricAccessory;
}) {
  if (!accessory.projected) {
    return null;
  }

  return (
    <g>
      <path
        d={`M ${accessory.projected.x - 4} ${accessory.projected.y} L ${
          accessory.projected.x
        } ${accessory.projected.y - 4} L ${accessory.projected.x + 4} ${
          accessory.projected.y
        } L ${accessory.projected.x} ${accessory.projected.y + 4} Z`}
        fill={accessory.status === "resolved" ? "#fff7ed" : "#fffaf0"}
        stroke={accessory.status === "resolved" ? "#c2410c" : "#b45309"}
        strokeWidth="1.2"
      />
      <text
        fill="#7c2d12"
        fontSize="6.5"
        textAnchor="middle"
        x={accessory.projected.x}
        y={accessory.projected.y + 13}
      >
        {accessory.label}
      </text>
    </g>
  );
}

function PhysicalAccessoryInventorySection({
  inventory,
  result,
}: {
  inventory: TechnicalPhysicalAccessoryInventory;
  result: TechnicalCalculationResult;
}) {
  const hasItems = inventory.items.length > 0;

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">
          Accesorios fisicos
        </h3>
        <div className="text-[10px] text-[var(--muted)]">
          {inventoryStatusLabel(inventory)}
        </div>
      </div>
      {hasItems ? (
        <ul className="space-y-1">
          {inventory.items.map((item) => (
            <li key={item.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span>{formatPhysicalAccessorySummary(item, result)}</span>
                <span className="shrink-0 text-right font-mono">
                  {item.routeUses.length}{" "}
                  {item.routeUses.length === 1 ? "recorrido" : "recorridos"}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                {formatPhysicalAccessorySegments(item, result)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-[var(--muted)]">
          Sin accesorios fisicos resueltos.
        </div>
      )}
      {inventory.pendingItems.length > 0 ? (
        <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1 text-[var(--warning)]">
          {inventory.pendingItems.length}{" "}
          {inventory.pendingItems.length === 1
            ? "accesorio fisico pendiente"
            : "accesorios fisicos pendientes"}
        </div>
      ) : null}
    </section>
  );
}

function CalculationSheetSection({
  adoptedDiameterValidationBySegmentId,
  sheet,
}: {
  adoptedDiameterValidationBySegmentId: Record<
    string,
    TechnicalAdoptedDiameterSegmentValidation
  >;
  sheet: TechnicalCalculationSheet;
}) {
  if (sheet.rows.length === 0) {
    return (
      <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
        Planilla de calculo pendiente.
      </section>
    );
  }

  return (
    <section className="mt-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">
          Planilla de calculo
        </h3>
        <div className="text-[10px] text-[var(--muted)]">
          {sheet.rows.length} {sheet.rows.length === 1 ? "tramo" : "tramos"}
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-[var(--line)]">
        <table className="min-w-[1040px] table-fixed border-collapse text-[10px]">
          <thead className="bg-[#f8fafc] text-[var(--muted)]">
            <tr>
              <th className="w-28 border-b border-[var(--line)] px-2 py-1 text-left font-semibold">
                Tramo
              </th>
              <th className="w-36 border-b border-[var(--line)] px-2 py-1 text-left font-semibold">
                Artefactos aguas abajo
              </th>
              <th className="w-20 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Caudal
              </th>
              <th className="w-20 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Long. fisica tramo
              </th>
              <th className="w-20 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Long. fisica recorrido
              </th>
              <th className="w-20 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Accesorios
              </th>
              <th className="w-20 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Transiciones
              </th>
              <th className="w-20 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Long. calculo
              </th>
              <th className="w-24 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Diam. provisional
              </th>
              <th className="w-24 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Diam. requerido
              </th>
              <th className="w-24 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Diam. adoptado
              </th>
              <th className="w-20 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                SIGAS
              </th>
              <th className="w-20 border-b border-[var(--line)] px-2 py-1 text-right font-semibold">
                Capacidad
              </th>
              <th className="w-32 border-b border-[var(--line)] px-2 py-1 text-left font-semibold">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => (
              <CalculationSheetRowView
                adoptedDiameterValidation={
                  adoptedDiameterValidationBySegmentId[row.segmentId] ?? null
                }
                key={row.segmentId}
                row={row}
              />
            ))}
          </tbody>
        </table>
      </div>
      {sheet.pendingRowCount > 0 ? (
        <div className="mt-1 text-[10px] text-[var(--warning)]">
          {sheet.pendingRowCount}{" "}
          {sheet.pendingRowCount === 1 ? "fila pendiente" : "filas pendientes"}
          {sheet.unsupportedRowCount > 0
            ? `, ${sheet.unsupportedRowCount} incompatibles`
            : ""}
        </div>
      ) : null}
    </section>
  );
}

function CalculationSheetRowView({
  adoptedDiameterValidation,
  row,
}: {
  adoptedDiameterValidation: TechnicalAdoptedDiameterSegmentValidation | null;
  row: TechnicalCalculationSheetRow;
}) {
  const hasInvalidAdoption =
    adoptedDiameterValidation?.status === "invalid" ||
    adoptedDiameterValidation?.status === "unsupported";
  const status = hasInvalidAdoption
    ? "Adopcion invalida"
    : calculationSheetRowStatusLabel(row);
  const requiredDiameter =
    adoptedDiameterValidation?.requiredDiameter ?? row.effectiveDiameter;
  const adoptedDiameter =
    adoptedDiameterValidation?.adoptedDiameter ?? row.adoptedDiameter;
  const statusTone = hasInvalidAdoption
    ? "text-red-800"
    : calculationSheetStatusTone(row.status);

  return (
    <tr className="border-t border-[var(--line)] align-top first:border-t-0">
      <td className="px-2 py-1 font-medium">{row.tramo}</td>
      <td className="px-2 py-1">{formatSheetAppliances(row)}</td>
      <td className="px-2 py-1 text-right font-mono">
        {formatSheetFlow(row.flowM3h)}
      </td>
      <td className="px-2 py-1 text-right font-mono">
        {formatCalculationMeters(row.physicalLengthMeters, "Pendiente")}
      </td>
      <td className="px-2 py-1 text-right font-mono">
        {formatCalculationMeters(row.initialRouteLengthMeters, "Pendiente")}
      </td>
      <td className="px-2 py-1 text-right font-mono">
        {formatCalculationMeters(row.accessoryEquivalentLengthMeters, "Pendiente")}
      </td>
      <td className="px-2 py-1 text-right font-mono">
        {formatCalculationMeters(row.transitionEquivalentLengthMeters, "Pendiente")}
      </td>
      <td className="px-2 py-1 text-right font-mono">
        {formatCalculationMeters(row.finalCalculationLengthMeters, "Pendiente")}
      </td>
      <td className="px-2 py-1 text-right">
        {formatSheetDiameter(row.calculatedDiameter)}
      </td>
      <td className="px-2 py-1 text-right">
        {formatDiameterReference(requiredDiameter)}
      </td>
      <td className="px-2 py-1 text-right">
        {adoptedDiameter
          ? formatCompactDiameterReference(adoptedDiameter)
          : "Pendiente"}
      </td>
      <td className="px-2 py-1 text-right font-mono">
        {formatCalculationMeters(row.tabulatedLengthMeters, "Pendiente")}
      </td>
      <td className="px-2 py-1 text-right font-mono">
        {formatSheetFlow(row.capacityM3h)}
      </td>
      <td className="px-2 py-1">
        <div className={statusTone}>{status}</div>
        {adoptedDiameterValidation?.reason ? (
          <div className="mt-0.5 line-clamp-2 text-[9px] text-red-800">
            {adoptedDiameterValidation.reason}
          </div>
        ) : row.observations[0] ? (
          <div className="mt-0.5 line-clamp-2 text-[9px] text-[var(--muted)]">
            {row.observations[0]}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function SegmentList({
  adoptedDiameterValidationBySegmentId,
  equipment,
  result,
  selectedSegmentId,
  onSelectSegment,
}: {
  adoptedDiameterValidationBySegmentId: Record<
    string,
    TechnicalAdoptedDiameterSegmentValidation
  >;
  equipment: WorkbenchEquipment[];
  result: TechnicalCalculationResult;
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string) => void;
}) {
  if (result.segments.length === 0) {
    return (
      <div className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
        Primero aceptá un trazado para calcular.
      </div>
    );
  }

  const equipmentById = new Map(equipment.map((item) => [item.id, item]));

  return (
    <section className="mt-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">
          Tramos
        </h3>
        <div className="text-[10px] text-[var(--muted)]">
          {result.segments.length}{" "}
          {result.segments.length === 1 ? "tramo" : "tramos"}
        </div>
      </div>
      <div className="space-y-2">
        {result.segments.map((segment) => {
          const validation =
            adoptedDiameterValidationBySegmentId[segment.segmentId] ?? null;
          const isSelected = segment.segmentId === selectedSegmentId;

          return (
            <SegmentCalculationRow
              equipmentById={equipmentById}
              isSelected={isSelected}
              key={segment.segmentId}
              result={result}
              segment={segment}
              validation={validation}
              onSelectSegment={onSelectSegment}
            />
          );
        })}
      </div>
    </section>
  );
}

function SegmentCalculationRow({
  equipmentById,
  isSelected,
  result,
  segment,
  validation,
  onSelectSegment,
}: {
  equipmentById: Map<string, WorkbenchEquipment>;
  isSelected: boolean;
  result: TechnicalCalculationResult;
  segment: TechnicalSegmentResult;
  validation: TechnicalAdoptedDiameterSegmentValidation | null;
  onSelectSegment: (segmentId: string) => void;
}) {
  const adoptedDiameter = validation?.adoptedDiameter ?? segment.calculatedDiameter;
  const status = validation
    ? adoptedDiameterValidationStatusLabel(validation.status)
    : technicalCalculationStatusLabel(result.status);
  const rowTone = isSelected
    ? "border-[var(--accent)] bg-[#f0f7ff]"
    : "border-[var(--line)]";

  return (
    <button
      className={`w-full rounded border px-3 py-2 text-left text-xs hover:border-[var(--accent)] ${rowTone}`}
      type="button"
      onClick={() => onSelectSegment(segment.segmentId)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">
            {formatProfessionalSegmentLabel(segment, result, equipmentById)}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--muted)]">
            {segmentLabel(segment, result.nodeLabels)}
          </div>
        </div>
        <div className={`shrink-0 text-right text-[10px] ${segmentStatusTone(validation?.status ?? "valid")}`}>
          {status}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div>
          <dt className="text-[var(--muted)]">Alimenta</dt>
          <dd>{formatSegmentApplianceSummary(segment, equipmentById)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Caudal</dt>
          <dd>{formatSegmentConsumption(segment)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Longitud física</dt>
          <dd>{formatCalculationMeters(segment.segmentPhysicalLengthMeters)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Equivalentes</dt>
          <dd>
            {formatCalculationMeters(
              segment.accessoryEquivalentLengthMeters,
              "Pendiente",
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Longitud cálculo</dt>
          <dd>{formatSegmentCalculationLength(segment)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Diámetro adoptado</dt>
          <dd>{formatDiameterReference(adoptedDiameter)}</dd>
        </div>
      </dl>
    </button>
  );
}

function SegmentAdoptedDiameterControl({
  validation,
  onAdoptSegmentDiameter,
}: {
  validation: TechnicalAdoptedDiameterSegmentValidation;
  onAdoptSegmentDiameter: (segmentId: string, diameterId: string | null) => void;
}) {
  const selectedDiameterId =
    validation.decision && validation.adoptedDiameter
      ? validation.adoptedDiameter.id
      : "";
  const canSelect = validation.selectableDiameters.length > 0;

  return (
    <div className="space-y-1">
      <select
        className="w-full rounded border border-[var(--line)] bg-white px-2 py-1 text-[10px]"
        disabled={!canSelect}
        value={selectedDiameterId}
        onChange={(event) =>
          onAdoptSegmentDiameter(
            validation.segmentId,
            event.target.value || null,
          )
        }
      >
        <option value="">Usar requerido</option>
        {validation.selectableDiameters.map((diameter) => (
          <option key={diameter.id} value={diameter.id}>
            {formatDiameterSymbol(diameter)}
            {diameterIsBelowRequired(diameter, validation)
              ? " (menor al requerido)"
              : ""}
          </option>
        ))}
      </select>
      {validation.decision ? (
        <button
          className="rounded border border-[var(--line)] bg-white px-2 py-0.5 text-[10px] hover:border-[var(--accent)]"
          type="button"
          onClick={() => onAdoptSegmentDiameter(validation.segmentId, null)}
        >
          Requerido
        </button>
      ) : null}
    </div>
  );
}

function SegmentDetail({
  adoptedDiameterValidation,
  equivalentAccessoryVerification,
  equipment,
  physicalAccessoryInventory,
  result,
  routeTransitionResolutions,
  segment,
  onAdoptSegmentDiameter,
}: {
  adoptedDiameterValidation: TechnicalAdoptedDiameterSegmentValidation | null;
  equivalentAccessoryVerification: TechnicalEquivalentAccessorySegmentVerification | null;
  equipment: WorkbenchEquipment[];
  physicalAccessoryInventory: TechnicalPhysicalAccessoryInventory;
  result: TechnicalCalculationResult;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  segment: TechnicalSegmentResult;
  onAdoptSegmentDiameter: (segmentId: string, diameterId: string | null) => void;
}) {
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const demandNormalizationByEquipmentId = createDemandNormalizationIndex(
    result.demandNormalizations,
  );

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <h3 className="font-semibold">Tramo {segmentLabel(segment, result.nodeLabels)}</h3>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>Longitud dibujada</dt>
        <dd className="text-right">{formatDrawingLength(segment.drawingLength)}</dd>
        <dt>Longitud fisica tramo</dt>
        <dd className="text-right">
          {formatCalculationMeters(segment.segmentPhysicalLengthMeters)}
        </dd>
        <dt>Equiv. accesorios tramo</dt>
        <dd className="text-right">
          {formatCalculationMeters(segment.accessoryEquivalentLengthMeters, "Pendiente")}
        </dd>
        <dt>Longitud calculo recorrido</dt>
        <dd className="text-right">{formatSegmentCalculationLength(segment)}</dd>
        <dt>Consumo tecnico</dt>
        <dd className="text-right">
          {formatSegmentConsumption(segment)}
        </dd>
        <dt>Diametro provisional SIGAS</dt>
        <dd className="text-right">
          {formatProvisionalSegmentDiameter(segment)}
        </dd>
      </dl>
      {segment.provisionalDiameterExplanation ? (
        <div className="mt-1 text-[10px] text-[var(--muted)]">
          {segment.provisionalDiameterExplanation}
        </div>
      ) : null}

      <RouteBasisDetail
        equipmentById={equipmentById}
        result={result}
        routeTransitionResolutions={routeTransitionResolutions}
        segment={segment}
      />
      <SegmentPhysicalAccessoryInventory
        inventory={physicalAccessoryInventory}
        result={result}
        segment={segment}
      />
      <EquivalentAccessoryVerificationDetail
        verification={equivalentAccessoryVerification}
      />
      <AccessoryList accessories={segment.accessories} />
      <NetworkSegmentSizing result={result} segment={segment} />
      <AdoptedDiameterValidationControl
        validation={adoptedDiameterValidation}
        onAdoptSegmentDiameter={onAdoptSegmentDiameter}
      />

      <div className="mt-2">
        <div className="font-semibold text-[var(--muted)]">Alimenta</div>
        {segment.downstreamApplianceIds.length === 0 ? (
          <div className="mt-1 text-[var(--muted)]">Sin artefactos aguas abajo.</div>
        ) : (
          <ul className="mt-1 space-y-1">
            {segment.downstreamApplianceIds.map((equipmentId) => {
              const item = equipmentById.get(equipmentId);

              return (
                <li key={equipmentId}>
                  {item?.name ?? equipmentId} -{" "}
                  {equipmentDemandLabel(item, demandNormalizationByEquipmentId)}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function EquivalentAccessoryVerificationDetail({
  verification,
}: {
  verification: TechnicalEquivalentAccessorySegmentVerification | null;
}) {
  if (!verification) {
    return null;
  }

  const tone =
    verification.status === "resolved"
      ? "border-[#badbcc] bg-[#f1faf4] text-[#1f6b45]"
      : verification.status === "unsupported"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-[#f1d28a] bg-[#fffaf0] text-[var(--warning)]";
  const explanation =
    verification.status === "resolved"
      ? verification.explanation ??
        "Segunda consulta SIGAS con accesorios fisicos del recorrido."
      : verification.reason ?? "Segunda verificacion pendiente.";

  return (
    <div className={`mt-2 rounded border px-2 py-2 ${tone}`}>
      <div className="font-semibold">Segunda verificacion SIGAS</div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>Longitud inicial</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            verification.calculationLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Accesorios equivalentes</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            verification.equivalentAccessoryLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Longitud total</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            verification.totalCalculationLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>{"\u00d8"} requerido SIGAS</dt>
        <dd className="text-right">
          {formatDiameterReference(verification.requiredDiameter)}
        </dd>
      </dl>
      <div className="mt-1 text-[10px]">{explanation}</div>
    </div>
  );
}

function RouteBasisDetail({
  equipmentById,
  result,
  routeTransitionResolutions,
  segment,
}: {
  equipmentById: Map<string, WorkbenchEquipment>;
  result: TechnicalCalculationResult;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  segment: TechnicalSegmentResult;
}) {
  const resolution = segment.governingRouteResolution;

  if (resolution.status !== "resolved") {
    return (
      <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-2">
        <div className="font-semibold text-[var(--muted)]">
          Recorrido de calculo
        </div>
        <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
          <dt>Extremo desfavorable</dt>
          <dd className="text-right">Pendiente</dd>
          <dt>Longitud fisica recorrido</dt>
          <dd className="text-right">Pendiente</dd>
        </dl>
        <div className="mt-1 text-[var(--warning)]">
          {resolution.status === "unsupported"
            ? `No soportado: ${resolution.reason}`
            : resolution.reason}
        </div>
      </div>
    );
  }

  const route = resolution.value;
  const terminal = equipmentById.get(route.terminalEquipmentId);
  const professionalAdoption = result.professionalDiameterAdoption;
  const useAdoptedEvaluation =
    professionalAdoption && professionalAdoption.decisions.length > 0;
  const routeAccessoryResolution =
    (useAdoptedEvaluation
      ? professionalAdoption.routeAccessoryResolutions[route.routeId]
      : result.routeAccessoryResolutions[route.routeId]) ?? null;
  const routeTransitionResolution =
    routeTransitionResolutions[route.routeId] ?? null;
  const routeSizingReasons = segment.routeSizingBasis.reasons;

  return (
    <div className="mt-2 rounded border border-[var(--line)] px-2 py-2">
      <div className="font-semibold text-[var(--muted)]">
        Recorrido de calculo
      </div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>Extremo desfavorable</dt>
        <dd className="text-right">{terminal?.name ?? route.terminalEquipmentId}</dd>
        <dt>Longitud fisica recorrido</dt>
        <dd className="text-right">
          {formatCalculationMeters(route.physicalLengthMeters)}
        </dd>
        <dt>Equiv. accesorios recorrido</dt>
        <dd className="text-right">
          {formatRouteAccessoryEquivalentLength(segment)}
        </dd>
        <dt>Longitud calculo recorrido</dt>
        <dd className="text-right">
          {formatRouteSizingLength(segment)}
        </dd>
      </dl>
      <div className="mt-1">
        <div className="text-[var(--muted)]">Recorrido de calculo</div>
        <div className="break-words font-mono text-[11px]">
          {formatTechnicalRoutePath(route.nodeIds, result.nodeLabels)}
        </div>
      </div>
      <RouteAccessoryContributionList
        resolution={routeAccessoryResolution}
        result={result}
      />
      <RouteTransitionPreviewDetail
        result={result}
        resolution={routeTransitionResolution}
        segment={segment}
      />
      {segment.routeSizingBasis.status !== "resolved" &&
      routeSizingReasons.length > 0 ? (
        <div className="mt-1 text-[var(--warning)]">
          {routeSizingReasons.join(" ")}
        </div>
      ) : null}
      {route.tiedRouteIds.length > 1 ? (
        <div className="mt-1 text-[10px] text-[var(--muted)]">
          Empate resuelto por id de terminal.
        </div>
      ) : null}
    </div>
  );
}

function NetworkSegmentSizing({
  result,
  segment,
}: {
  result: TechnicalCalculationResult;
  segment: TechnicalSegmentResult;
}) {
  const transitionAwareResult = result.transitionAwareNetworkSizing;
  const transitionAwareSegment = getTransitionAwareSizingSegment(
    result,
    segment.segmentId,
  );

  if (
    transitionAwareResult?.status === "resolved" &&
    transitionAwareSegment?.status === "resolved" &&
    transitionAwareSegment.finalDiameter
  ) {
    return (
      <>
        <TransitionAwareNetworkSegmentSizing
          result={result}
          sizing={transitionAwareSegment}
        />
        <BaselineNetworkSegmentSizing
          result={result}
          segment={segment}
          title="Dimensionado base sin transiciones"
        />
      </>
    );
  }

  if (transitionAwareResult && transitionAwareResult.status !== "resolved") {
    return (
      <>
        <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-2">
          <div className="font-semibold text-[var(--muted)]">
            Dimensionado completo pendiente
          </div>
          <div className="mt-1 text-[var(--warning)]">
            {transitionAwareSegment?.issues[0]?.message ??
              transitionAwareResult.issues[0]?.message ??
              "Dimensionado con transiciones pendiente."}
          </div>
        </div>
        <BaselineNetworkSegmentSizing
          result={result}
          segment={segment}
          title="Dimensionado base sin transiciones"
        />
      </>
    );
  }

  return (
    <BaselineNetworkSegmentSizing
      result={result}
      segment={segment}
      title="Dimensionado global"
    />
  );
}

function AdoptedDiameterValidationControl({
  validation,
  onAdoptSegmentDiameter,
}: {
  validation: TechnicalAdoptedDiameterSegmentValidation | null;
  onAdoptSegmentDiameter: (segmentId: string, diameterId: string | null) => void;
}) {
  if (!validation) {
    return null;
  }

  const selectedDiameterId =
    validation.decision && validation.adoptedDiameter
      ? validation.adoptedDiameter.id
      : "";
  const canSelect = validation.selectableDiameters.length > 0;
  const message =
    validation.reason ??
    validation.explanation ??
    "Adopcion automatica del diametro requerido por SIGAS.";

  return (
    <div
      className={`mt-2 rounded border px-2 py-2 ${adoptedDiameterValidationTone(
        validation.status,
      )}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-[var(--muted)]">
          Diametro adoptado
        </div>
        <div className="text-right text-[10px] font-semibold uppercase">
          {adoptedDiameterValidationStatusLabel(validation.status)}
        </div>
      </div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>{"\u00d8"} provisional</dt>
        <dd className="text-right">
          {formatDiameterSymbol(validation.provisionalDiameter)}
        </dd>
        <dt>{"\u00d8"} requerido SIGAS</dt>
        <dd className="text-right">
          {formatDiameterSymbol(validation.requiredDiameter)}
        </dd>
        <dt>{"\u00d8"} adoptado</dt>
        <dd className="text-right">
          {formatDiameterSymbol(validation.adoptedDiameter)}
        </dd>
      </dl>
      <label className="mt-2 block">
        <span className="text-[var(--muted)]">Seleccion manual</span>
        <select
          className="mt-1 w-full rounded border border-[var(--line)] bg-white px-2 py-1 text-xs"
          disabled={!canSelect}
          value={selectedDiameterId}
          onChange={(event) =>
            onAdoptSegmentDiameter(
              validation.segmentId,
              event.target.value || null,
            )
          }
        >
          <option value="">Por defecto: requerido</option>
          {validation.selectableDiameters.map((diameter) => (
            <option key={diameter.id} value={diameter.id}>
              {formatDiameterSymbol(diameter)}
              {diameterIsBelowRequired(diameter, validation)
                ? " (menor al requerido)"
                : ""}
            </option>
          ))}
        </select>
      </label>
      {validation.decision ? (
        <button
          className="mt-2 rounded border border-[var(--line)] bg-white px-2 py-1 text-xs hover:border-[var(--accent)]"
          type="button"
          onClick={() => onAdoptSegmentDiameter(validation.segmentId, null)}
        >
          Usar requerido
        </button>
      ) : null}
      <div className="mt-1 text-[10px]">{message}</div>
    </div>
  );
}

function BaselineNetworkSegmentSizing({
  result,
  segment,
  title,
}: {
  result: TechnicalCalculationResult;
  segment: TechnicalSegmentResult;
  title: string;
}) {
  const sizing = getNetworkSizingSegment(result, segment.segmentId);
  const issues = sizing?.issues ?? [];

  if (!sizing || sizing.status !== "resolved" || !sizing.calculatedDiameter) {
    return (
      <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-2">
        <div className="font-semibold text-[var(--muted)]">
          {title}
        </div>
        <div className="mt-1 text-[var(--warning)]">
          {issues[0]?.message ??
            "Dimensionado global pendiente para este tramo."}
        </div>
      </div>
    );
  }

  const requiredDiameter = sizing.requiredDiameter;
  const showRequiredDiameter =
    requiredDiameter !== null &&
    requiredDiameter.id !== sizing.calculatedDiameter.id;

  return (
    <div className="mt-2 rounded border border-[var(--line)] px-2 py-2">
      <div className="font-semibold text-[var(--muted)]">
        {title}
      </div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>Consumo tecnico</dt>
        <dd className="text-right">
          {formatSegmentConsumption(segment)}
        </dd>
        <dt>Longitud fisica tramo</dt>
        <dd className="text-right">
          {formatCalculationMeters(segment.segmentPhysicalLengthMeters)}
        </dd>
        <dt>Recorrido gobernante</dt>
        <dd className="text-right">
          {sizing.governingTerminalEquipmentId ?? sizing.governingRouteId ?? "Pendiente"}
        </dd>
        <dt>Longitud fisica recorrido</dt>
        <dd className="text-right">
          {formatCalculationMeters(sizing.governingRoutePhysicalLengthMeters)}
        </dd>
        <dt>Equiv. accesorios recorrido</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            sizing.governingRouteAccessoryEquivalentLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Longitud calculo recorrido</dt>
        <dd className="text-right">
          {formatCalculationMeters(sizing.sizingLengthMeters, "Pendiente")}
        </dd>
        <dt>Diametro provisional SIGAS</dt>
        <dd className="text-right">
          {formatProvisionalSegmentDiameter(segment)}
        </dd>
        {showRequiredDiameter ? (
          <>
            <dt>Requerido final</dt>
            <dd className="text-right">
              {formatDiameterReference(requiredDiameter)}
            </dd>
          </>
        ) : null}
        <dt>Diametro interior</dt>
        <dd className="text-right">{formatInternalDiameter(sizing)}</dd>
        <dt>Longitud tabulada</dt>
        <dd className="text-right">
          {formatCalculationMeters(sizing.tabulatedLengthMeters, "Pendiente")}
        </dd>
        <dt>Capacidad tabulada</dt>
        <dd className="text-right">{formatTabulatedCapacity(sizing)}</dd>
        <dt>Sistema</dt>
        <dd className="text-right">{formatPipeSystemLabel(result)}</dd>
      </dl>
      {sizing.explanation ? (
        <div className="mt-1 text-[10px] text-[var(--muted)]">
          {sizing.explanation}
        </div>
      ) : null}
    </div>
  );
}

function RouteAccessoryContributionList({
  resolution,
  result,
}: {
  resolution: TechnicalRouteAccessoryResolution | null;
  result: TechnicalCalculationResult;
}) {
  if (!resolution) {
    return (
      <div className="mt-2 text-[var(--warning)]">
        Accesorios del recorrido pendientes.
      </div>
    );
  }

  if (resolution.contributions.length === 0) {
    return (
      <div className="mt-2 text-[var(--muted)]">
        Sin accesorios en el recorrido.
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="font-semibold text-[var(--muted)]">
        Accesorios del recorrido
      </div>
      <ul className="mt-1 space-y-1">
        {resolution.contributions.map((contribution, index) => (
          <RouteAccessoryContributionItem
            contribution={contribution}
            key={`${contribution.ownerSegmentId}:${contribution.accessoryId}:${index}`}
            result={result}
          />
        ))}
      </ul>
      {resolution.status !== "resolved" && resolution.reasons.length > 0 ? (
        <div className="mt-1 text-[var(--warning)]">
          {resolution.reasons.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

function SegmentPhysicalAccessoryInventory({
  inventory,
  result,
  segment,
}: {
  inventory: TechnicalPhysicalAccessoryInventory;
  result: TechnicalCalculationResult;
  segment: TechnicalSegmentResult;
}) {
  const routeId =
    segment.governingRouteResolution.status === "resolved"
      ? segment.governingRouteResolution.value.routeId
      : null;
  const segmentItems = physicalAccessoryItemsByIds(
    inventory,
    inventory.accessoryIdsBySegmentId[segment.segmentId] ?? [],
  );
  const routeItems = routeId
    ? physicalAccessoryItemsByIds(
        inventory,
        inventory.accessoryIdsByRouteId[routeId] ?? [],
      )
    : [];
  const pendingItems = inventory.pendingItems.filter(
    (item) =>
      item.segmentIds.includes(segment.segmentId) ||
      (routeId !== null && item.routeId === routeId),
  );

  if (
    segmentItems.length === 0 &&
    routeItems.length === 0 &&
    pendingItems.length === 0
  ) {
    return (
      <div className="mt-2 text-[var(--muted)]">
        Sin inventario fisico para este tramo.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded border border-[var(--line)] px-2 py-2">
      <div className="font-semibold text-[var(--muted)]">
        Inventario fisico
      </div>
      <PhysicalAccessoryMiniList
        items={segmentItems}
        label="Tramo"
        result={result}
      />
      <PhysicalAccessoryMiniList
        items={routeItems}
        label="Recorrido"
        result={result}
        routeId={routeId}
      />
      {pendingItems.length > 0 ? (
        <ul className="mt-1 space-y-1 text-[10px] text-[var(--warning)]">
          {pendingItems.map((item) => (
            <li key={item.id}>
              Pendiente - {item.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PhysicalAccessoryMiniList({
  items,
  label,
  result,
  routeId,
}: {
  items: TechnicalPhysicalAccessory[];
  label: string;
  result: TechnicalCalculationResult;
  routeId?: string | null;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-1">
      <div className="text-[10px] font-semibold text-[var(--muted)]">
        {label}
      </div>
      <ul className="mt-0.5 space-y-1">
        {items.map((item) => (
          <li key={`${label}:${item.id}`}>
            <div>{formatPhysicalAccessorySummary(item, result)}</div>
            {routeId ? (
              <ul className="mt-0.5 space-y-0.5 text-[10px] text-[var(--muted)]">
                {item.routeUses
                  .filter((routeUse) => routeUse.routeId === routeId)
                  .map((routeUse) => (
                    <li key={physicalAccessoryRouteUseKey(routeUse)}>
                      {formatPhysicalAccessoryRouteUse(routeUse, result)}
                    </li>
                  ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransitionAwareNetworkSegmentSizing({
  result,
  sizing,
}: {
  result: TechnicalCalculationResult;
  sizing: TechnicalTransitionAwareNetworkSizingSegmentResult;
}) {
  const showBaseline =
    sizing.baselineDiameter !== null &&
    sizing.finalDiameter !== null &&
    sizing.baselineDiameter.id !== sizing.finalDiameter.id;

  return (
    <div className="mt-2 rounded border border-[#badbcc] bg-[#f1faf4] px-2 py-2">
      <div className="font-semibold text-[#1f6b45]">
        Dimensionado con transiciones
      </div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>Consumo tecnico</dt>
        <dd className="text-right">
          {formatTechnicalFlow(sizing.accumulatedFlow, sizing.accumulatedFlowUnit)}
        </dd>
        {showBaseline ? (
          <>
            <dt>Diametro base</dt>
            <dd className="text-right">
              {formatDiameterReference(sizing.baselineDiameter)}
            </dd>
          </>
        ) : null}
        <dt>Diametro final con transiciones</dt>
        <dd className="text-right">
          {formatDiameterReference(sizing.finalDiameter)}
        </dd>
        <dt>Diametro requerido</dt>
        <dd className="text-right">
          {formatDiameterReference(sizing.requiredDiameter)}
        </dd>
        <dt>Longitud fisica recorrido</dt>
        <dd className="text-right">
          {formatCalculationMeters(sizing.governingRoutePhysicalLengthMeters)}
        </dd>
        <dt>Accesorios</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            sizing.governingRouteAccessoryEquivalentLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Reducciones</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            sizing.governingRouteSimpleTransitionEquivalentLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Tees reductoras</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            sizing.governingRouteBranchTransitionEquivalentLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Compounds</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            sizing.governingRouteCompoundTransitionEquivalentLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Longitud calculo final</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            sizing.transitionAwareSizingLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Diametro interior</dt>
        <dd className="text-right">{formatInternalDiameter(sizing)}</dd>
        <dt>Longitud tabulada</dt>
        <dd className="text-right">
          {formatCalculationMeters(sizing.tabulatedLengthMeters, "Pendiente")}
        </dd>
        <dt>Capacidad tabulada</dt>
        <dd className="text-right">{formatTabulatedCapacity(sizing)}</dd>
        <dt>Sistema</dt>
        <dd className="text-right">{formatPipeSystemLabel(result)}</dd>
      </dl>
      {sizing.explanation ? (
        <div className="mt-1 text-[10px] text-[var(--muted)]">
          {sizing.explanation}
        </div>
      ) : null}
    </div>
  );
}

function RouteTransitionPreviewDetail({
  result,
  resolution,
  segment,
}: {
  result: TechnicalCalculationResult;
  resolution: TechnicalRouteTransitionResolution | null;
  segment: TechnicalSegmentResult;
}) {
  const isTransitionAwareResolved =
    result.transitionAwareNetworkSizing?.status === "resolved";
  const transitionAwareSegment = getTransitionAwareSizingSegment(
    result,
    segment.segmentId,
  );
  const solverSizingLength = isTransitionAwareResolved
    ? transitionAwareSegment?.transitionAwareSizingLengthMeters ?? null
    : segment.routeSizingBasis.sizingLengthMeters;

  return (
    <div className="mt-2 rounded border border-[#dbeafe] bg-[#eff6ff] px-2 py-2">
      <div className="font-semibold text-[#1d4ed8]">
        {isTransitionAwareResolved
          ? "Transiciones del recorrido"
          : "Preview transiciones"}
      </div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>
          {isTransitionAwareResolved
            ? "Longitud final usada por solver"
            : "Longitud actual usada por solver"}
        </dt>
        <dd className="text-right">
          {formatCalculationMeters(solverSizingLength, "Pendiente")}
        </dd>
        <dt>{isTransitionAwareResolved ? "Reducciones" : "Reducciones preview"}</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            resolution?.simpleTransitionEquivalentLengthMeters ?? null,
            "Pendiente",
          )}
        </dd>
        <dt>
          {isTransitionAwareResolved
            ? "Compounds"
            : "Compounds preview"}
        </dt>
        <dd className="text-right">
          {formatCalculationMeters(
            resolution?.compoundTransitionEquivalentLengthMeters ?? null,
            "Pendiente",
          )}
        </dd>
        <dt>
          {isTransitionAwareResolved
            ? "Tees reductoras"
            : "Tees reductoras preview"}
        </dt>
        <dd className="text-right">
          {formatCalculationMeters(
            resolution?.branchTransitionEquivalentLengthMeters ?? null,
            "Pendiente",
          )}
        </dd>
        <dt>
          {isTransitionAwareResolved
            ? "Longitud con transiciones"
            : "Longitud proyectada con transiciones"}
        </dt>
        <dd className="text-right">
          {formatCalculationMeters(
            resolution?.projectedSizingLengthMeters ?? null,
            "Pendiente",
          )}
        </dd>
      </dl>
      {!isTransitionAwareResolved ? (
        <div className="mt-1 text-[10px] text-[#1d4ed8]">
          Preview: las transiciones todavia no modifican el dimensionado global.
        </div>
      ) : null}
      {resolution && resolution.contributions.length > 0 ? (
        <ul className="mt-1 space-y-1 text-[10px] text-[var(--muted)]">
          {resolution.contributions.map((contribution, index) => (
            <li key={`${contribution.transitionId}:${index}`}>
              <div>{formatTransitionContribution(contribution)}</div>
              {contribution.reason &&
              contribution.status !== "resolved" &&
              contribution.status !== "inactive" ? (
                <div className="text-[var(--warning)]">
                  {contribution.reason}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-1 text-[10px] text-[var(--muted)]">
          Sin transiciones atravesadas por este recorrido.
        </div>
      )}
      {resolution && resolution.status !== "resolved" && resolution.reasons.length > 0 ? (
        <div className="mt-1 text-[10px] text-[var(--warning)]">
          {resolution.reasons.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

function RouteAccessoryContributionItem({
  contribution,
  result,
}: {
  contribution: TechnicalRouteAccessoryContribution;
  result: TechnicalCalculationResult;
}) {
  const ownerSegment = result.segments.find(
    (segment) => segment.segmentId === contribution.ownerSegmentId,
  );

  return (
    <li>
      <div className="break-words">
        <span className="font-mono">
          {ownerSegment
            ? segmentLabel(ownerSegment, result.nodeLabels)
            : "Tramo pendiente"}
        </span>
        {" - "}
        {formatContributionDiameter(contribution)}
        {" - "}
        {formatContributionName(contribution)}
        {" x "}
        {formatAccessoryQuantity(contribution.quantity)}
        {" - "}
        {formatCalculationMeters(
          contribution.totalEquivalentLengthMeters,
          "Pendiente",
        )}
      </div>
      {contribution.status !== "resolved" && contribution.reason ? (
        <div className="mt-0.5 text-[10px] text-[var(--warning)]">
          {contribution.reason}
        </div>
      ) : null}
    </li>
  );
}

function AccessoryList({
  accessories,
}: {
  accessories: TechnicalSegmentAccessoryResult[];
}) {
  if (accessories.length === 0) {
    return (
      <div className="mt-2 text-[var(--muted)]">Sin accesorios asociados.</div>
    );
  }

  const summaries = accessorySummariesByType(accessories);

  return (
    <div className="mt-2">
      <div className="font-semibold text-[var(--muted)]">Accesorios del tramo</div>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        {summaries.map((summary) => (
          <AccessorySummaryRow key={summary.type} summary={summary} />
        ))}
      </dl>
    </div>
  );
}

function AccessorySummaryRow({
  summary,
}: {
  summary: AccessoryTypeSummary;
}) {
  return (
    <>
      <dt>
        {routeAccessoryTypeLabel(summary.type)} x {formatAccessoryQuantity(summary.quantity)}
        <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
          {summary.sourceLabels.join(", ")}
        </span>
        {summary.reasonLabels.length > 0 ? (
          <span className="mt-0.5 block text-[10px] text-[var(--warning)]">
            {summary.reasonLabels.join(", ")}
          </span>
        ) : null}
      </dt>
      <dd className="text-right">
        {formatCalculationMeters(summary.totalEquivalentLengthMeters, "Pendiente")}
      </dd>
    </>
  );
}

function createPendingCalculationDecisions({
  accessoryProposalReviews,
  accessoryProposals,
  adoptedDiameterValidation,
  diameterTransitionProposals,
  diameterTransitionReviews,
  result,
}: {
  accessoryProposalReviews: AccessoryProposalTechnicalReview[];
  accessoryProposals: AccessoryProposal[];
  adoptedDiameterValidation: TechnicalAdoptedDiameterValidation;
  diameterTransitionProposals: DiameterTransitionProposal[];
  diameterTransitionReviews: DiameterTransitionTechnicalReview[];
  result: TechnicalCalculationResult | null;
}): PendingCalculationDecision[] {
  const accessoryReviewById = new Map(
    accessoryProposalReviews.map((review) => [review.proposalId, review]),
  );
  const transitionReviewById = new Map(
    diameterTransitionReviews.map((review) => [review.transitionId, review]),
  );
  const accessoryDecisions = accessoryProposals
    .filter(isActionableAccessoryProposal)
    .map((proposal): PendingAccessoryDecision => ({
      proposal,
      review: accessoryReviewById.get(proposal.id) ?? null,
    }))
    .sort((first, second) =>
      first.proposal.nodeId.localeCompare(second.proposal.nodeId),
    );
  const transitionDecisions = diameterTransitionProposals
    .filter(isActionableDiameterTransitionProposal)
    .map((proposal): PendingTransitionDecision => ({
      proposal,
      review: transitionReviewById.get(proposal.id) ?? null,
    }))
    .sort((first, second) =>
      first.proposal.nodeId.localeCompare(second.proposal.nodeId),
    );
  const usedTransitionIds = new Set<string>();
  const decisions: PendingCalculationDecision[] = [];

  for (const accessory of accessoryDecisions) {
    const combinedTransition = transitionDecisions.find((transition) => {
      if (
        usedTransitionIds.has(transition.proposal.id) ||
        transition.proposal.nodeId !== accessory.proposal.nodeId
      ) {
        return false;
      }

      return sharedCandidatesForDecisions(accessory, transition).length > 0;
    });

    if (combinedTransition) {
      usedTransitionIds.add(combinedTransition.proposal.id);
      decisions.push({
        decision: {
          accessory,
          sharedCandidates: sharedCandidatesForDecisions(
            accessory,
            combinedTransition,
          ),
          transition: combinedTransition,
        },
        id: `combined:${accessory.proposal.id}:${combinedTransition.proposal.id}`,
        kind: "combined",
      });
      continue;
    }

    decisions.push({
      decision: accessory,
      id: `accessory:${accessory.proposal.id}`,
      kind: "accessory",
    });
  }

  for (const transition of transitionDecisions) {
    if (usedTransitionIds.has(transition.proposal.id)) {
      continue;
    }

    decisions.push({
      decision: transition,
      id: `transition:${transition.proposal.id}`,
      kind: "transition",
    });
  }

  if (result) {
    const segmentById = new Map(
      result.segments.map((segment) => [segment.segmentId, segment]),
    );

    for (const validation of adoptedDiameterValidation.segments) {
      const segment = segmentById.get(validation.segmentId);

      if (!segment || !isActionableAdoptedDiameterDecision(validation)) {
        continue;
      }

      decisions.push({
        decision: {
          segment,
          validation,
        },
        id: `adopted-diameter:${validation.segmentId}`,
        kind: "adopted_diameter",
      });
    }

    const seenTechnical = new Set<string>();

    for (const issue of result.issues.filter(isActionableTechnicalDecisionIssue)) {
      const key = technicalDecisionKey(issue);

      if (seenTechnical.has(key)) {
        continue;
      }

      seenTechnical.add(key);
      decisions.push({
        decision: { issue },
        id: `technical:${key}`,
        kind: "technical",
      });
    }

  }

  return decisions;
}

function createCalculationPendingSummary({
  decisions,
  materialTakeoff,
  result,
}: {
  decisions: PendingCalculationDecision[];
  materialTakeoff: TechnicalMaterialTakeoff;
  result: TechnicalCalculationResult | null;
}): CalculationPendingSummary {
  const decisionCount = decisions.length;
  const materialBlockingCount = materialTakeoff.pendingItems.filter(
    isMaterialOnlyPendingItem,
  ).length;
  const unresolvedCalculationCount =
    result && result.status !== "valid" && decisionCount === 0 ? 1 : 0;
  const deliveryBlockingCount =
    decisionCount + materialBlockingCount + unresolvedCalculationCount;

  return {
    decisionCount,
    deliveryBlockingCount,
    total: decisionCount,
  };
}

function sharedCandidatesForDecisions(
  accessory: PendingAccessoryDecision,
  transition: PendingTransitionDecision,
): SharedDecisionCandidate[] {
  if (!accessory.review || !transition.review) {
    return [];
  }

  const transitionCandidatesByKey = new Map(
    transition.review.candidates
      .filter((candidate) => candidate.status === "compatible")
      .map((candidate) => [sharedCandidateKey(candidate), candidate]),
  );

  return accessory.review.candidates
    .filter((candidate) => candidate.status === "compatible")
    .map((accessoryCandidate) => {
      const transitionCandidate = transitionCandidatesByKey.get(
        sharedCandidateKey(accessoryCandidate),
      );

      if (!transitionCandidate) {
        return null;
      }

      return {
        accessoryCandidateId: accessoryCandidate.id,
        id: sharedCandidateKey(accessoryCandidate),
        label: accessoryCandidate.label,
        reason: accessoryCandidate.reason,
        transitionCandidateId: transitionCandidate.id,
      };
    })
    .filter(
      (candidate): candidate is SharedDecisionCandidate => candidate !== null,
    );
}

function sharedCandidateKey(candidate: AccessoryCatalogCandidate) {
  return `${candidate.pipeSystem.id}:${candidate.familyId}`;
}

function isActionableAdoptedDiameterDecision(
  validation: TechnicalAdoptedDiameterSegmentValidation,
) {
  return (
    validation.decision !== null &&
    (validation.status === "invalid" || validation.status === "unsupported")
  );
}

function isActionableTechnicalDecisionIssue(issue: TechnicalCalculationIssue) {
  return (
    issue.code !== "pending_equivalent_length" &&
    issue.code !== "pending_diameter_sizing" &&
    issue.code !== "pending_route_sizing_length" &&
    isVisibleTechnicalIssue(issue)
  );
}

function technicalDecisionKey(issue: TechnicalCalculationIssue) {
  return [
    issue.code,
    issue.equipmentId ?? "",
    issue.nodeId ?? "",
    issue.segmentId ?? "",
    issue.accessoryId ?? "",
  ].join("|");
}

function isVisibleTechnicalIssue(issue: TechnicalCalculationIssue) {
  return (
    issue.code !== "pending_adopted_diameter_validation" &&
    issue.code !== "incompatible_adopted_diameter" &&
    issue.code !== "unresolved_adopted_diameter"
  );
}

function isMaterialOnlyPendingItem(
  item: TechnicalMaterialTakeoff["pendingItems"][number],
) {
  return (
    item.code !== "accessory_confirmation_pending" &&
    item.code !== "diameter_effective_validation_pending" &&
    item.code !== "diameter_transition_pending" &&
    item.code !== "branch_transition_pending" &&
    item.code !== "compound_transition_pending"
  );
}

function technicalIssueTargetsEquipment(issue: TechnicalCalculationIssue) {
  return (
    issue.equipmentId !== undefined ||
    issue.code === "missing_demand" ||
    issue.code === "unresolved_demand_normalization" ||
    issue.code === "mixed_demand_units" ||
    issue.code === "appliance_not_connected" ||
    issue.code === "appliance_not_terminal" ||
    issue.code === "appliance_unreachable"
  );
}

function formatTechnicalIssueAction(
  issue: TechnicalCalculationIssue,
  result: TechnicalCalculationResult,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  const location = technicalIssueLocation(issue, result, equipmentById);
  const action = technicalIssueAction(issue);

  return location ? `${location}: ${action}` : action;
}

function technicalIssueLocation(
  issue: TechnicalCalculationIssue,
  result: TechnicalCalculationResult,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  if (issue.equipmentId) {
    return equipmentById.get(issue.equipmentId)?.name ?? "Artefacto";
  }

  if (issue.segmentId) {
    return formatSegmentReference(issue.segmentId, result);
  }

  if (issue.nodeId) {
    return formatNodeReference(issue.nodeId, result);
  }

  return null;
}

function technicalIssueAction(issue: TechnicalCalculationIssue) {
  switch (issue.code) {
    case "missing_scale":
      return "definir la escala de planta.";
    case "missing_supply":
    case "missing_supply_node":
      return "marcar una alimentacion valida.";
    case "multiple_supply":
      return "dejar una sola alimentacion activa.";
    case "missing_endpoints":
    case "missing_node_position":
    case "zero_length_segment":
    case "duplicate_segments":
    case "cycle":
    case "disconnected_component":
      return "corregir el trazado confirmado.";
    case "appliance_not_connected":
    case "appliance_unreachable":
      return "conectar el artefacto al recorrido confirmado.";
    case "appliance_not_terminal":
      return "ubicar el artefacto como extremo de recorrido.";
    case "missing_demand":
    case "unresolved_demand_normalization":
    case "mixed_demand_units":
      return "completar y normalizar el consumo.";
    case "pending_equivalent_length":
      return "resolver equivalencias de accesorios.";
    case "pending_diameter_sizing":
      return "completar datos para dimensionar diametro.";
    case "pending_route_sizing_length":
      return "resolver el recorrido gobernante.";
    case "duplicate_ids":
      return "corregir elementos duplicados del trazado.";
    default:
      return "revisar el dato tecnico indicado.";
  }
}

function formatMaterialPendingItem(
  item: TechnicalMaterialTakeoff["pendingItems"][number],
  result: TechnicalCalculationResult,
) {
  const location = item.segmentId
    ? formatSegmentReference(item.segmentId, result)
    : null;
  const action = materialPendingAction(item);
  const reason = item.reason ? ` ${item.reason}` : "";

  return location ? `${location}: ${action}.${reason}` : `${action}.${reason}`;
}

function materialPendingAction(
  item: TechnicalMaterialTakeoff["pendingItems"][number],
) {
  if (item.category === "pipe") {
    return "completar longitud fisica para computar caneria";
  }

  if (item.category === "accessory") {
    return "resolver accesorio fisico para computo final";
  }

  if (item.category === "transition") {
    return "resolver transicion fisica para computo final";
  }

  return "validar diametro adoptado para computo final";
}

function formatDecisionCount(count: number) {
  return count === 1 ? "1 decisión pendiente" : `${count} decisiones pendientes`;
}

function diameterTransitionSegmentIds(proposal: DiameterTransitionProposal) {
  return [
    ...new Set(
      [
        proposal.upstreamSegmentId,
        ...proposal.downstreamSegmentIds,
        ...proposal.incidentSegments.map((segment) => segment.segmentId),
      ].filter((segmentId): segmentId is string => Boolean(segmentId)),
    ),
  ];
}

function formatDecisionSegmentSummary(
  segmentIds: string[],
  result: TechnicalCalculationResult,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  const segments = segmentsByIds(segmentIds, result);

  if (segments.length === 0) {
    return "Tramo por ubicar";
  }

  const labels = segments
    .slice(0, 2)
    .map((segment) =>
      formatProfessionalSegmentLabel(segment, result, equipmentById),
    );
  const remainingCount = segments.length - labels.length;

  return remainingCount > 0
    ? `${labels.join(" / ")} +${remainingCount}`
    : labels.join(" / ");
}

function formatDecisionApplianceSummary(
  segmentIds: string[],
  result: TechnicalCalculationResult,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  const names = [
    ...new Set(
      segmentsByIds(segmentIds, result).flatMap((segment) =>
        segment.downstreamApplianceIds.map(
          (equipmentId) => equipmentById.get(equipmentId)?.name ?? null,
        ),
      ),
    ),
  ].filter((name): name is string => Boolean(name));

  if (names.length === 0) {
    return "Sin artefactos asociados";
  }

  const visibleNames = names.slice(0, 2).join(", ");
  const remainingCount = names.length - 2;

  return remainingCount > 0
    ? `${visibleNames} +${remainingCount}`
    : visibleNames;
}

function segmentsByIds(
  segmentIds: string[],
  result: TechnicalCalculationResult,
) {
  const segmentById = new Map(
    result.segments.map((segment) => [segment.segmentId, segment]),
  );

  return [...new Set(segmentIds)]
    .map((segmentId) => segmentById.get(segmentId) ?? null)
    .filter((segment): segment is TechnicalSegmentResult => segment !== null);
}

function formatProfessionalSegmentLabel(
  segment: TechnicalSegmentResult,
  result: TechnicalCalculationResult,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  const applianceSummary = formatSegmentApplianceSummary(segment, equipmentById);

  if (applianceSummary !== "Sin artefactos") {
    return `Hacia ${applianceSummary}`;
  }

  return segmentLabel(segment, result.nodeLabels);
}

function formatSegmentApplianceSummary(
  segment: TechnicalSegmentResult,
  equipmentById: Map<string, WorkbenchEquipment>,
) {
  if (segment.downstreamApplianceIds.length === 0) {
    return "Sin artefactos";
  }

  const names = segment.downstreamApplianceIds.map(
    (equipmentId) => equipmentById.get(equipmentId)?.name ?? "Artefacto",
  );
  const visibleNames = names.slice(0, 2).join(", ");
  const remainingCount = names.length - 2;

  return remainingCount > 0
    ? `${visibleNames} +${remainingCount}`
    : visibleNames;
}

function segmentStatusTone(
  status: TechnicalAdoptedDiameterSegmentValidation["status"],
) {
  if (status === "valid") {
    return "text-[#1f6b45]";
  }

  if (status === "invalid" || status === "unsupported") {
    return "text-red-800";
  }

  return "text-[var(--warning)]";
}

function segmentLabel(
  segment: TechnicalSegmentResult,
  labels: Record<string, string>,
) {
  return `${readableNodeLabel(labels[segment.fromNodeId])} -> ${
    readableNodeLabel(labels[segment.toNodeId])
  }`;
}

function readableNodeLabel(label: string | undefined) {
  if (!label) {
    return "Nodo";
  }

  if (label === "M") {
    return "Alimentación";
  }

  if (/^N\d+$/u.test(label)) {
    return "Derivación";
  }

  return label;
}

function inventoryStatusLabel(inventory: TechnicalPhysicalAccessoryInventory) {
  if (inventory.status === "resolved") {
    return "Validado";
  }

  if (inventory.status === "pending") {
    return "Pendiente";
  }

  return "No disponible";
}

function formatPhysicalAccessorySummary(
  item: TechnicalPhysicalAccessory,
  result: TechnicalCalculationResult,
) {
  const nodeLabel = item.nodeId
    ? readableNodeLabel(result.nodeLabels[item.nodeId])
    : "nodo pendiente";

  return `${technicalPhysicalAccessoryKindLabel(item.kind)} - ${nodeLabel} - ${formatPhysicalAccessoryDiameters(item)}`;
}

function formatPhysicalAccessoryDiameters(
  item: TechnicalPhysicalAccessory,
) {
  const labels = [
    ...new Set(
      item.diameters.map((entry) =>
        formatCompactDiameterReference(entry.diameter),
      ),
    ),
  ].filter((label) => label !== "Diam. pendiente");

  return labels.length > 0 ? labels.join(" / ") : "Diam. pendiente";
}

function formatPhysicalAccessorySegments(
  item: TechnicalPhysicalAccessory,
  result: TechnicalCalculationResult,
) {
  if (item.segmentIds.length === 0) {
    return "Tramo pendiente";
  }

  return item.segmentIds
    .map((segmentId) => formatSegmentReference(segmentId, result))
    .join(", ");
}

function formatPhysicalAccessoryRouteUse(
  routeUse: TechnicalPhysicalAccessoryRouteUse,
  result: TechnicalCalculationResult,
) {
  const traversal = routeUse.traversalKind
    ? ` - ${routeUse.traversalKind}`
    : "";
  const variant = routeUse.variantLabel ? ` - ${routeUse.variantLabel}` : "";
  const segments =
    routeUse.segmentIds.length > 0
      ? routeUse.segmentIds
          .map((segmentId) => formatSegmentReference(segmentId, result))
          .join(", ")
      : "tramos pendientes";

  return `Recorrido${traversal} - ${segments}${variant}`;
}

function physicalAccessoryRouteUseKey(
  routeUse: TechnicalPhysicalAccessoryRouteUse,
) {
  return [
    routeUse.routeId,
    routeUse.segmentIds.join(","),
    routeUse.traversalKind ?? "",
    routeUse.variantLabel ?? "",
  ].join("|");
}

function formatSegmentReference(
  segmentId: string,
  result: TechnicalCalculationResult,
) {
  const segment =
    result.segments.find((item) => item.segmentId === segmentId) ?? null;

  return segment ? segmentLabel(segment, result.nodeLabels) : "Tramo pendiente";
}

function physicalAccessoryItemsByIds(
  inventory: TechnicalPhysicalAccessoryInventory,
  ids: string[],
) {
  const byId = new Map(inventory.items.map((item) => [item.id, item]));

  return [...new Set(ids)]
    .map((id) => byId.get(id) ?? null)
    .filter((item): item is TechnicalPhysicalAccessory => item !== null);
}

type AccessoryTypeSummary = {
  quantity: number;
  reasonLabels: string[];
  sourceLabels: string[];
  totalEquivalentLengthMeters: number | null;
  type: TechnicalSegmentAccessoryResult["type"];
};

function accessorySummariesByType(
  accessories: TechnicalSegmentAccessoryResult[],
): AccessoryTypeSummary[] {
  const byType = new Map<
    TechnicalSegmentAccessoryResult["type"],
    AccessoryTypeSummary
  >();

  for (const accessory of accessories) {
    const current = byType.get(accessory.type) ?? {
      quantity: 0,
      reasonLabels: [],
      sourceLabels: [],
      totalEquivalentLengthMeters: 0,
      type: accessory.type,
    };
    const sourceLabel = equivalentLengthSourceLabel(
      accessory.equivalentLengthSource,
    );

    current.quantity += accessory.quantity;

    if (!current.sourceLabels.includes(sourceLabel)) {
      current.sourceLabels.push(sourceLabel);
      current.sourceLabels.sort();
    }

    if (accessory.equivalentLengthResolution.status !== "resolved") {
      const reasonLabel =
        accessory.equivalentLengthResolution.status === "unsupported"
          ? `No soportado: ${accessory.equivalentLengthResolution.reason}`
          : accessory.equivalentLengthResolution.reason;

      if (!current.reasonLabels.includes(reasonLabel)) {
        current.reasonLabels.push(reasonLabel);
        current.reasonLabels.sort();
      }
    }

    current.totalEquivalentLengthMeters =
      current.totalEquivalentLengthMeters === null ||
      accessory.totalEquivalentLengthMeters === null
        ? null
        : current.totalEquivalentLengthMeters +
          accessory.totalEquivalentLengthMeters;

    byType.set(accessory.type, current);
  }

  return [...byType.values()].sort((first, second) =>
    routeAccessoryTypeLabel(first.type).localeCompare(
      routeAccessoryTypeLabel(second.type),
    ),
  );
}

function technicalAxonometricStatusLabel(view: TechnicalAxonometricView) {
  if (view.status === "resolved") {
    return `${view.segments.length} tramos`;
  }

  if (view.status === "pending") {
    return `${view.pendingItems.length} pendientes`;
  }

  return "Pendiente";
}

function technicalAxonometricSegmentLabel(
  segment: TechnicalAxonometricSegment,
) {
  const parts = [
    segment.adoptedDiameterLabel,
    formatCalculationMeters(segment.physicalLengthMeters, "long. pendiente"),
  ];

  if (
    segment.zDeltaMeters !== null &&
    Math.abs(segment.zDeltaMeters) > 0.000001
  ) {
    parts.push(`dz ${formatSignedMeters(segment.zDeltaMeters)}`);
  }

  return parts.join(" - ");
}

function technicalAxonometricSegmentStroke(
  segment: TechnicalAxonometricSegment,
) {
  if (segment.status === "pending") {
    return "#9aa6b2";
  }

  const external = segment.adoptedDiameter?.externalDiameterMillimeters ?? 0;

  if (external >= 32) {
    return "#0f766e";
  }

  if (external >= 25) {
    return "#2563eb";
  }

  return "#455a64";
}

function technicalAxonometricSegmentStrokeWidth(
  segment: TechnicalAxonometricSegment,
) {
  const external = segment.adoptedDiameter?.externalDiameterMillimeters ?? 20;

  if (external >= 32) {
    return 4.2;
  }

  if (external >= 25) {
    return 3.2;
  }

  return 2.4;
}

function formatSignedMeters(value: number) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${formatOptionalNumber(value) ?? value.toFixed(2)} m`;
}

function formatTotalCalculationLength(result: TechnicalCalculationResult) {
  if (result.totals.calculationLengthMeters !== null) {
    return formatCalculationMeters(result.totals.calculationLengthMeters);
  }

  if (result.totals.physicalLengthMeters === null) {
    return "Escala pendiente";
  }

  if (result.totals.accessoryEquivalentLengthMeters === null) {
    return "Equiv. pendiente";
  }

  return "Pendiente";
}

function formatTransitionAwareSizingStatus(result: TechnicalCalculationResult) {
  const sizing = result.transitionAwareNetworkSizing;

  if (!sizing) {
    return "No disponible";
  }

  if (sizing.status === "resolved") {
    return `Resuelto +${sizing.additionalDiameterStepCost ?? 0}`;
  }

  if (result.networkSizing?.status === "resolved") {
    return "Dimensionado completo pendiente";
  }

  return "Base pendiente";
}

function formatStateCount(value: number) {
  if (!Number.isFinite(value)) {
    return ">";
  }

  return value.toLocaleString("es-AR");
}

function formatSegmentCalculationLength(segment: TechnicalSegmentResult) {
  if (segment.calculationLengthMeters !== null) {
    return formatCalculationMeters(segment.calculationLengthMeters);
  }

  if (segment.routeSizingBasis.governingRoutePhysicalLengthMeters === null) {
    return "Recorrido pendiente";
  }

  if (
    segment.routeSizingBasis.governingRouteAccessoryEquivalentLengthMeters ===
    null
  ) {
    return "Equiv. recorrido pendiente";
  }

  return "Pendiente";
}

function formatGoverningRouteLength(segment: TechnicalSegmentResult) {
  if (segment.governingRoutePhysicalLengthMeters !== null) {
    return `Long. inicial ${formatCalculationMeters(
      segment.governingRoutePhysicalLengthMeters,
    )}`;
  }

  return "Long. inicial pendiente";
}

function formatRouteAccessoryEquivalentLength(
  segment: TechnicalSegmentResult,
) {
  return formatCalculationMeters(
    segment.routeSizingBasis.governingRouteAccessoryEquivalentLengthMeters,
    "Pendiente",
  );
}

function formatRouteSizingLength(
  segment: TechnicalSegmentResult,
) {
  return formatCalculationMeters(
    segment.routeSizingBasis.sizingLengthMeters,
    "Pendiente",
  );
}

function formatSegmentConsumption(segment: TechnicalSegmentResult) {
  const consumptionM3h =
    segment.consumptionM3h ??
    (segment.accumulatedFlowUnit === "m3_h" ? segment.accumulatedFlow : null);

  return formatTechnicalFlow(consumptionM3h, consumptionM3h === null ? null : "m3_h");
}

function formatProvisionalSegmentDiameter(segment: TechnicalSegmentResult) {
  return formatDiameterReference(segment.provisionalDiameter ?? null);
}

function formatSheetAppliances(row: TechnicalCalculationSheetRow) {
  if (row.downstreamAppliances.length === 0) {
    return "Sin artefactos";
  }

  return row.downstreamAppliances.join(", ");
}

function formatSheetFlow(value: number | null) {
  const formatted = formatOptionalNumber(value ?? undefined);

  return formatted ? `${formatted} m3/h` : "Pendiente";
}

function formatSheetDiameter(
  diameter: TechnicalCalculationSheetRow["calculatedDiameter"],
) {
  return diameter ? formatCompactDiameterReference(diameter) : "Pendiente";
}

function calculationSheetRowStatusLabel(row: TechnicalCalculationSheetRow) {
  if (row.status === "resolved") {
    return "Validado";
  }

  if (row.status === "unsupported") {
    return "Incompatible";
  }

  return "Pendiente";
}

function calculationSheetStatusTone(
  status: TechnicalCalculationSheetRow["status"],
) {
  if (status === "resolved") {
    return "text-[#1f6b45]";
  }

  if (status === "unsupported") {
    return "text-red-800";
  }

  return "text-[var(--warning)]";
}

function formatTechnicalRoutePath(
  nodeIds: string[],
  labels: Record<string, string>,
) {
  return nodeIds.map((nodeId) => readableNodeLabel(labels[nodeId])).join(" -> ");
}

function formatContributionDiameter(
  contribution: TechnicalRouteAccessoryContribution,
) {
  if (contribution.equivalentLengthSource === "manual") {
    return contribution.diameter
      ? formatCompactDiameterReference(contribution.diameter)
      : "Manual";
  }

  return contribution.diameter
    ? formatCompactDiameterReference(contribution.diameter)
    : "Diam. pendiente";
}

function formatContributionName(
  contribution: TechnicalRouteAccessoryContribution,
) {
  const tableLabel = recordStringValue(
    contribution.equivalentLengthResolution.data,
    "tableLabel",
  );

  return (
    tableLabel ??
    contribution.catalogCode ??
    routeAccessoryTypeLabel(contribution.type)
  );
}

function formatTransitionContribution(
  contribution: TechnicalRouteTransitionContribution,
) {
  const length =
    contribution.status === "inactive"
      ? "0 m"
      : formatCalculationMeters(contribution.equivalentLengthMeters, "Pendiente");
  const variant =
    contribution.variantLabel ??
    contribution.variant?.label ??
    contribution.catalogFamilyId ??
    diameterTransitionKindLabel(contribution.transitionKind);
  const compoundComponent =
    contribution.transitionKind === "compound_turn_transition" &&
    contribution.compoundComponent
      ? `${compoundContributionRoleLabel(contribution.compoundComponent)} - `
      : "";
  const traversal =
    contribution.transitionKind === "branch_transition"
      ? `${transitionTraversalKindLabel(contribution.traversalKind)} - `
      : "";

  return `${formatCompactDiameterReference(
    contribution.upstreamDiameter,
  )} -> ${formatCompactDiameterReference(
    contribution.downstreamDiameter,
  )} - ${compoundComponent}${traversal}${variant} - ${length}`;
}

function transitionTraversalKindLabel(
  traversalKind: TechnicalRouteTransitionContribution["traversalKind"],
) {
  if (traversalKind === "through") {
    return "through";
  }

  if (traversalKind === "turn_90") {
    return "90°";
  }

  return "recorrido pendiente";
}

function getNetworkSizingSegment(
  result: TechnicalCalculationResult,
  segmentId: string,
) {
  return (
    result.networkSizing?.segments.find(
      (segment) => segment.segmentId === segmentId,
    ) ?? null
  );
}

function getTransitionAwareSizingSegment(
  result: TechnicalCalculationResult,
  segmentId: string,
) {
  return (
    result.transitionAwareNetworkSizing?.segments.find(
      (segment) => segment.segmentId === segmentId,
    ) ?? null
  );
}

function adoptedDiameterValidationStatusLabel(
  status: TechnicalAdoptedDiameterSegmentValidation["status"],
) {
  if (status === "valid") {
    return "Validada";
  }

  if (status === "invalid" || status === "unsupported") {
    return "Invalida";
  }

  return "Pendiente";
}

function adoptedDiameterValidationTone(
  status: TechnicalAdoptedDiameterSegmentValidation["status"],
) {
  if (status === "valid") {
    return "border-[#badbcc] bg-[#f1faf4] text-[#1f6b45]";
  }

  if (status === "invalid" || status === "unsupported") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-[#f1d28a] bg-[#fffaf0] text-[var(--warning)]";
}

function diameterIsBelowRequired(
  diameter: TechnicalAdoptedDiameterSegmentValidation["adoptedDiameter"],
  validation: TechnicalAdoptedDiameterSegmentValidation,
) {
  const required = validation.requiredDiameter;

  if (!diameter || !required) {
    return false;
  }

  return diameterSortValue(diameter) < diameterSortValue(required);
}

function formatDiameterSymbol(
  diameter: PipeDiameterReference | null,
) {
  if (!diameter) {
    return "Pendiente";
  }

  const external = formatOptionalNumber(diameter.externalDiameterMillimeters);

  return external ? `Ø${external}` : diameter.label;
}

function diameterSortValue(diameter: {
  externalDiameterMillimeters?: number;
  internalDiameterMillimeters?: number;
}) {
  return (
    diameter.externalDiameterMillimeters ??
    diameter.internalDiameterMillimeters ??
    Number.MAX_SAFE_INTEGER
  );
}

function formatInternalDiameter(sizing: {
  internalDiameterMillimeters: number | null;
}) {
  const value = formatOptionalNumber(sizing.internalDiameterMillimeters ?? undefined);

  return value ? `DI ${value} mm` : "Pendiente";
}

function formatTabulatedCapacity(sizing: {
  tabulatedCapacityM3h: number | null;
}) {
  const value = formatOptionalNumber(sizing.tabulatedCapacityM3h ?? undefined);

  return value ? `${value} m3/h` : "Pendiente";
}

function formatDiameterReference(
  diameter: TechnicalSegmentResult["calculatedDiameter"],
) {
  if (!diameter) {
    return "Pendiente";
  }

  const external = formatOptionalNumber(diameter.externalDiameterMillimeters);
  const internal = formatOptionalNumber(diameter.internalDiameterMillimeters);

  if (external && internal) {
    return `DE ${external} mm / DI ${internal} mm`;
  }

  if (external) {
    return `DE ${external} mm`;
  }

  return diameter.label;
}

function formatCompactDiameterReference(
  diameter: TechnicalRouteAccessoryContribution["diameter"],
) {
  if (!diameter) {
    return "Diam. pendiente";
  }

  const external = formatOptionalNumber(diameter.externalDiameterMillimeters);

  return external ? `DE ${external} mm` : diameter.label;
}

function formatRecordMeters(data: Record<string, unknown>, key: string) {
  const value = finiteRecordNumber(data, key);

  return value === null ? "Pendiente" : formatCalculationMeters(value);
}

function formatRecordFlow(data: Record<string, unknown>, key: string) {
  const value = finiteRecordNumber(data, key);

  return value === null
    ? "Pendiente"
    : `${formatOptionalNumber(value)} m3/h`;
}

function formatRecordSource(data: Record<string, unknown>) {
  const sourceTable = recordStringValue(data, "sourceTable");
  const sourceFile = recordStringValue(data, "sourceFile");

  return [sourceTable, sourceFile].filter(Boolean).join(" - ") || "Pendiente";
}

function finiteRecordNumber(data: Record<string, unknown>, key: string) {
  const value = data[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordStringValue(
  data: Record<string, unknown> | undefined,
  key: string,
) {
  const value = data?.[key];

  return typeof value === "string" ? value : null;
}

function formatOptionalNumber(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function formatMaterialQuantity(value: number) {
  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

function formatMaterialPendingSummary(takeoff: TechnicalMaterialTakeoff) {
  const parts = [
    formatMaterialPendingCount(
      takeoff.pendingSummary.accessoryCount,
      "accesorio",
      "accesorios",
    ),
    formatMaterialPendingCount(
      takeoff.pendingSummary.transitionCount,
      "transición",
      "transiciones",
    ),
    formatMaterialPendingCount(
      takeoff.pendingSummary.adoptionCount,
      "diámetro efectivo",
      "diámetros efectivos",
    ),
    formatMaterialPendingCount(
      takeoff.pendingSummary.pipeCount,
      "longitud física",
      "longitudes físicas",
    ),
  ].filter(Boolean);

  return `Pendientes: ${parts.join(", ")} requieren confirmación`;
}

function formatMaterialPendingCount(
  count: number,
  singular: string,
  plural: string,
) {
  if (count <= 0) {
    return null;
  }

  return `${count.toLocaleString("es-AR")} ${
    count === 1 ? singular : plural
  }`;
}

function formatDrawingLength(value: number) {
  return `${value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} u`;
}

function formatAccessoryQuantity(value: number) {
  return value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
  });
}

function formatPipeSystemLabel(result: TechnicalCalculationResult) {
  return result.pipeSystem.version
    ? `${result.pipeSystem.name} ${result.pipeSystem.version}`
    : result.pipeSystem.name;
}

function equipmentDemandLabel(
  equipment: WorkbenchEquipment | undefined,
  demandNormalizationByEquipmentId: Map<string, EquipmentDemandNormalization>,
) {
  if (!equipment) {
    return "Pendiente";
  }

  return formatEquipmentDemandWithNormalization(
    demandNormalizationByEquipmentId.get(equipment.id),
  );
}
