import { useEffect, useState } from "react";
import {
  demandUnitLabel,
  hasPendingDemand,
  type WorkbenchEquipment,
} from "@/lib/equipment/types";
import {
  equivalentLengthSourceLabel,
  formatCalculationMeters,
  formatTechnicalFlow,
  routeAccessoryTypeLabel,
  technicalCalculationStatusLabel,
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
  TechnicalRouteTransitionContribution,
  TechnicalRouteTransitionResolution,
} from "@/lib/calculation/technicalRouteTransitions";

type CalculationPanelProps = {
  accessoryProposals: AccessoryProposal[];
  accessoryProposalReviews: AccessoryProposalTechnicalReview[];
  diameterTransitionProposals: DiameterTransitionProposal[];
  diameterTransitionReviews: DiameterTransitionTechnicalReview[];
  equipment: WorkbenchEquipment[];
  hasPendingProposal: boolean;
  isPlanActive: boolean;
  planReady: boolean;
  result: TechnicalCalculationResult | null;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  onConfirmAccessoryProposal: (proposalId: string, candidateId: string) => void;
  onConfirmDiameterTransition: (transitionId: string, candidateId: string) => void;
  onGoToPlan: () => void;
  onRejectAccessoryProposal: (proposalId: string) => void;
  onRejectDiameterTransition: (transitionId: string) => void;
};

export function CalculationPanel({
  accessoryProposals,
  accessoryProposalReviews,
  diameterTransitionProposals,
  diameterTransitionReviews,
  equipment,
  hasPendingProposal,
  isPlanActive,
  planReady,
  result,
  routeTransitionResolutions,
  onConfirmAccessoryProposal,
  onConfirmDiameterTransition,
  onGoToPlan,
  onRejectAccessoryProposal,
  onRejectDiameterTransition,
}: CalculationPanelProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const selectedSegment =
    result?.segments.find((segment) => segment.segmentId === selectedSegmentId) ??
    result?.segments[0] ??
    null;

  useEffect(() => {
    if (!result?.segments.some((segment) => segment.segmentId === selectedSegmentId)) {
      setSelectedSegmentId(result?.segments[0]?.segmentId ?? null);
    }
  }, [result, selectedSegmentId]);

  return (
    <section className="bg-white px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="sr-only">Cálculo</h2>
          <p className="text-xs text-[var(--muted)]">
            {result ? technicalCalculationStatusLabel(result.status) : "Sin Planta"}
          </p>
        </div>
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

      {result ? (
        <>
          <CalculationSummary result={result} />
          <CalculationIssues result={result} />
          <AccessoryProposalList
            proposals={accessoryProposals}
            reviews={accessoryProposalReviews}
            onConfirm={onConfirmAccessoryProposal}
            onReject={onRejectAccessoryProposal}
          />
          <DiameterTransitionProposalList
            nodeLabels={result.nodeLabels}
            proposals={diameterTransitionProposals}
            routeTransitionResolutions={routeTransitionResolutions}
            reviews={diameterTransitionReviews}
            onConfirm={onConfirmDiameterTransition}
            onReject={onRejectDiameterTransition}
          />
          <SegmentList
            result={result}
            selectedSegmentId={selectedSegment?.segmentId ?? null}
            onSelectSegment={setSelectedSegmentId}
          />
          {selectedSegment ? (
            <SegmentDetail
              equipment={equipment}
              result={result}
              routeTransitionResolutions={routeTransitionResolutions}
              segment={selectedSegment}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AccessoryProposalList({
  proposals,
  reviews,
  onConfirm,
  onReject,
}: {
  proposals: AccessoryProposal[];
  reviews: AccessoryProposalTechnicalReview[];
  onConfirm: (proposalId: string, candidateId: string) => void;
  onReject: (proposalId: string) => void;
}) {
  const [selectedCandidateByProposalId, setSelectedCandidateByProposalId] =
    useState<Record<string, string>>({});

  if (proposals.length === 0) {
    return (
      <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
        Sin accesorios geometricos detectados.
      </section>
    );
  }

  return (
    <section className="mt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
        Accesorios detectados
      </h3>
      <div className="space-y-1">
        {proposals.map((proposal) => {
          const review =
            reviews.find((item) => item.proposalId === proposal.id) ?? null;
          const selectedCandidateId =
            selectedCandidateByProposalId[proposal.id] ?? "";
          const selectedCandidate =
            review?.candidates.find((item) => item.id === selectedCandidateId) ??
            null;
          const canConfirm =
            proposal.state !== "confirmed" &&
            proposal.state !== "rejected" &&
            selectedCandidate?.status === "compatible";
          const canReject =
            proposal.state !== "confirmed" && proposal.state !== "rejected";

          return (
            <div
              className="rounded border border-[var(--line)] px-2 py-2 text-xs"
              key={proposal.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">
                    {proposalStateSymbol(proposal.state)}{" "}
                    {accessoryProposalKindLabel(proposal.kind)} - nodo{" "}
                    <span className="font-mono">{proposal.nodeId}</span> -{" "}
                    {accessoryProposalStateLabel(proposal)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {proposalEvidenceLabel(proposal)}
                  </div>
                  {review ? <ProposalTechnicalContext review={review} /> : null}
                  {proposalReviewReason(proposal) ? (
                    <div className="mt-0.5 text-[10px] text-[var(--warning)]">
                      {proposalReviewReason(proposal)}
                    </div>
                  ) : null}
                  {review && proposal.state !== "confirmed" && proposal.state !== "rejected" ? (
                    <CandidateSelector
                      proposal={proposal}
                      review={review}
                      selectedCandidateId={selectedCandidateId}
                      onSelect={(candidateId) =>
                        setSelectedCandidateByProposalId((current) => ({
                          ...current,
                          [proposal.id]: candidateId,
                        }))
                      }
                    />
                  ) : null}
                </div>
                {canConfirm || canReject ? (
                  <div className="flex shrink-0 gap-1">
                    {canConfirm ? (
                      <button
                        className="rounded border border-[var(--line)] bg-white px-2 py-1 text-[11px] hover:border-[var(--accent)]"
                        type="button"
                        onClick={() => onConfirm(proposal.id, selectedCandidateId)}
                      >
                        Confirmar
                      </button>
                    ) : null}
                    {canReject ? (
                      <button
                        className="rounded border border-[var(--line)] bg-white px-2 py-1 text-[11px] hover:border-[var(--accent)]"
                        type="button"
                        onClick={() => onReject(proposal.id)}
                      >
                        Rechazar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DiameterTransitionProposalList({
  nodeLabels,
  proposals,
  routeTransitionResolutions,
  reviews,
  onConfirm,
  onReject,
}: {
  nodeLabels: Record<string, string>;
  proposals: DiameterTransitionProposal[];
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  reviews: DiameterTransitionTechnicalReview[];
  onConfirm: (transitionId: string, candidateId: string) => void;
  onReject: (transitionId: string) => void;
}) {
  const [selectedCandidateByTransitionId, setSelectedCandidateByTransitionId] =
    useState<Record<string, string>>({});
  const visibleProposals = proposals.filter(
    (proposal) => proposal.state !== "not_required" || proposal.decision,
  );

  return (
    <section className="mt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
        Transiciones de diametro
      </h3>
      <div className="mb-2 rounded border border-[#dbeafe] bg-[#eff6ff] px-3 py-2 text-xs text-[#1d4ed8]">
        Preview: incluye fisica, accesorios, transiciones simples y tees
        reductoras por recorrido; las tees todavia no modifican sizeSegment.
      </div>
      {visibleProposals.length === 0 ? (
        <div className="rounded border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
          Sin transiciones de diametro activas.
        </div>
      ) : (
        <div className="space-y-1">
          {visibleProposals.map((proposal) => {
            const review =
              reviews.find((item) => item.transitionId === proposal.id) ?? null;
            const selectedCandidateId =
              selectedCandidateByTransitionId[proposal.id] ??
              review?.selectedCandidate?.id ??
              "";
            const selectedCandidate =
              review?.candidates.find((item) => item.id === selectedCandidateId) ??
              null;
            const canConfirm =
              proposal.state !== "confirmed" &&
              proposal.state !== "rejected" &&
              proposal.state !== "not_required" &&
              selectedCandidate?.status === "compatible";
            const canReject =
              proposal.state !== "confirmed" &&
              proposal.state !== "rejected" &&
              proposal.state !== "not_required";

            return (
              <div
                className="rounded border border-[var(--line)] px-2 py-2 text-xs"
                key={proposal.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {diameterTransitionStateSymbol(proposal.state)}{" "}
                      {nodeLabels[proposal.nodeId] ?? proposal.nodeId} -{" "}
                      {diameterTransitionMainLabel(proposal)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                      {diameterTransitionKindLabel(proposal.kind)} -{" "}
                      {diameterTransitionStateLabel(proposal)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                      {diameterTransitionOrientationLabel(proposal)}
                    </div>
                    {proposal.downstreamDiameters.length > 1 ? (
                      <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                        Ramas: {diameterTransitionBranchLabel(proposal)}
                      </div>
                    ) : null}
                    {review?.reason ? (
                      <div className="mt-0.5 text-[10px] text-[var(--warning)]">
                        {review.reason}
                      </div>
                    ) : null}
                    <DiameterTransitionPreview
                      contributions={previewContributionsForTransition(
                        proposal.id,
                        routeTransitionResolutions,
                      )}
                      proposal={proposal}
                      review={review}
                    />
                    {review &&
                    proposal.state !== "confirmed" &&
                    proposal.state !== "rejected" &&
                    proposal.state !== "not_required" ? (
                      <DiameterTransitionCandidateSelector
                        review={review}
                        selectedCandidateId={selectedCandidateId}
                        onSelect={(candidateId) =>
                          setSelectedCandidateByTransitionId((current) => ({
                            ...current,
                            [proposal.id]: candidateId,
                          }))
                        }
                      />
                    ) : null}
                  </div>
                  {canConfirm || canReject ? (
                    <div className="flex shrink-0 gap-1">
                      {canConfirm ? (
                        <button
                          className="rounded border border-[var(--line)] bg-white px-2 py-1 text-[11px] hover:border-[var(--accent)]"
                          type="button"
                          onClick={() => onConfirm(proposal.id, selectedCandidateId)}
                        >
                          Confirmar
                        </button>
                      ) : null}
                      {canReject ? (
                        <button
                          className="rounded border border-[var(--line)] bg-white px-2 py-1 text-[11px] hover:border-[var(--accent)]"
                          type="button"
                          onClick={() => onReject(proposal.id)}
                        >
                          Rechazar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DiameterTransitionCandidateSelector({
  review,
  selectedCandidateId,
  onSelect,
}: {
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
        Familia de transicion
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
  proposal,
  review,
}: {
  contributions: TechnicalRouteTransitionContribution[];
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
    return null;
  }

  if (proposal.kind === "branch_transition") {
    return (
      <div className="mt-1 text-[10px] text-[var(--muted)]">
        <div>Preview tee reductora por recorrido</div>
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
  const upstream = proposal.upstreamDiameter?.diameter ?? null;
  const downstream = proposal.downstreamDiameters.map((item) => item.diameter);

  if (downstream.length === 0) {
    return `Aguas arriba ${formatCompactDiameterReference(upstream)}`;
  }

  return `${formatCompactDiameterReference(upstream)} -> ${downstream
    .map(formatCompactDiameterReference)
    .join(" / ")}`;
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

function CalculationSummary({ result }: { result: TechnicalCalculationResult }) {
  const totalFlow = formatTechnicalFlow(
    result.totals.accumulatedFlow,
    result.totals.accumulatedFlowUnit,
  );
  const globalResolvedSegmentCount =
    result.networkSizing?.segments.filter((segment) => segment.status === "resolved")
      .length ?? null;
  const physicalLength = formatCalculationMeters(result.totals.physicalLengthMeters);
  const equivalentLength = formatCalculationMeters(
    result.totals.accessoryEquivalentLengthMeters,
    "Pendiente",
  );
  const calculationLength = formatTotalCalculationLength(result);
  const transitionAwareSizing = result.transitionAwareNetworkSizing;

  return (
    <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1 text-xs">
      <dt>Tramos</dt>
      <dd className="text-right font-mono">{result.totals.segmentCount}</dd>
      <dt>Dimensionados globales</dt>
      <dd className="text-right font-mono">
        {globalResolvedSegmentCount ?? result.totals.dimensionedSegmentCount}/
        {result.totals.segmentCount}
      </dd>
      <dt>Artefactos</dt>
      <dd className="text-right font-mono">{result.totals.applianceCount}</dd>
      <dt>Consumo total</dt>
      <dd className="text-right">{totalFlow}</dd>
      <dt>Sistema canerias</dt>
      <dd className="text-right">{formatPipeSystemLabel(result)}</dd>
      <dt>Longitud fisica</dt>
      <dd className="text-right">{physicalLength}</dd>
      <dt>Equiv. accesorios tramo</dt>
      <dd className="text-right">{equivalentLength}</dd>
      <dt>Long. calculo local</dt>
      <dd className="text-right">{calculationLength}</dd>
      <dt>Dimensionado completo</dt>
      <dd className="text-right">
        {formatTransitionAwareSizingStatus(result)}
      </dd>
      {transitionAwareSizing ? (
        <>
          <dt>Estados 09C2B</dt>
          <dd className="text-right font-mono">
            {transitionAwareSizing.evaluatedStateCount}/
            {formatStateCount(transitionAwareSizing.theoreticalStateCount)}
          </dd>
        </>
      ) : null}
    </dl>
  );
}

function CalculationIssues({ result }: { result: TechnicalCalculationResult }) {
  if (result.issues.length === 0) {
    return null;
  }

  const tone =
    result.status === "invalid"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-[#f1d28a] bg-[#fffaf0] text-[var(--warning)]";

  return (
    <div className={`mt-3 rounded border px-3 py-2 text-xs ${tone}`}>
      <div className="font-semibold">
        {result.status === "invalid" ? "Red no calculable" : "Datos pendientes"}
      </div>
      <ul className="mt-1 space-y-1">
        {result.issues.slice(0, 5).map((issue, index) => (
          <li key={`${issue.code}:${issue.accessoryId ?? ""}:${issue.segmentId ?? ""}:${issue.equipmentId ?? ""}:${index}`}>
            {issue.message}
          </li>
        ))}
      </ul>
      {result.issues.length > 5 ? (
        <div className="mt-1">+ {result.issues.length - 5} observaciones</div>
      ) : null}
    </div>
  );
}

function SegmentList({
  result,
  selectedSegmentId,
  onSelectSegment,
}: {
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

  return (
    <section className="mt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
        Tramos
      </h3>
      <div className="space-y-1">
        {result.segments.map((segment) => (
          <button
            className={`w-full rounded border px-2 py-1 text-left text-xs hover:border-[var(--accent)] ${
              segment.segmentId === selectedSegmentId
                ? "border-[var(--accent)] bg-[#f0f7ff]"
                : "border-[var(--line)]"
            }`}
            key={segment.segmentId}
            type="button"
            onClick={() => onSelectSegment(segment.segmentId)}
          >
            <div className="font-medium">
              {segmentLabel(segment, result.nodeLabels)}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--muted)]">
              {formatTechnicalFlow(segment.accumulatedFlow, segment.accumulatedFlowUnit)}
              {" - "}
              {formatGoverningRouteLength(segment)}
              {" - "}
              {formatSegmentDiameter(segment, result)}
              {" - "}
              {segment.downstreamApplianceIds.length}{" "}
              {segment.downstreamApplianceIds.length === 1 ? "artefacto" : "artefactos"}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function SegmentDetail({
  equipment,
  result,
  routeTransitionResolutions,
  segment,
}: {
  equipment: WorkbenchEquipment[];
  result: TechnicalCalculationResult;
  routeTransitionResolutions: Record<string, TechnicalRouteTransitionResolution>;
  segment: TechnicalSegmentResult;
}) {
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));

  return (
    <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
      <h3 className="font-semibold">Tramo {segmentLabel(segment, result.nodeLabels)}</h3>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1">
        <dt>Longitud dibujada</dt>
        <dd className="text-right">{formatDrawingLength(segment.drawingLength)}</dd>
        <dt>Longitud del tramo</dt>
        <dd className="text-right">
          {formatCalculationMeters(segment.segmentPhysicalLengthMeters)}
        </dd>
        <dt>Equiv. accesorios tramo</dt>
        <dd className="text-right">
          {formatCalculationMeters(segment.accessoryEquivalentLengthMeters, "Pendiente")}
        </dd>
        <dt>Long. prov. 08B2</dt>
        <dd className="text-right">{formatSegmentCalculationLength(segment)}</dd>
        <dt>Consumo acumulado</dt>
        <dd className="text-right">
          {formatTechnicalFlow(segment.accumulatedFlow, segment.accumulatedFlowUnit)}
        </dd>
      </dl>

      <RouteBasisDetail
        equipmentById={equipmentById}
        result={result}
        routeTransitionResolutions={routeTransitionResolutions}
        segment={segment}
      />
      <AccessoryList accessories={segment.accessories} />
      <NetworkSegmentSizing result={result} segment={segment} />

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
                  {item?.name ?? equipmentId} - {equipmentDemandLabel(item)}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
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
          <dt>Longitud inicial de calculo</dt>
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
  const routeAccessoryResolution =
    result.routeAccessoryResolutions[route.routeId] ?? null;
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
        <dt>Longitud inicial de calculo</dt>
        <dd className="text-right">
          {formatCalculationMeters(route.physicalLengthMeters)}
        </dd>
        <dt>Equiv. accesorios recorrido</dt>
        <dd className="text-right">
          {formatRouteAccessoryEquivalentLength(segment)}
        </dd>
        <dt>Longitud dimensionado</dt>
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
            Dimensionado completo
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
        <dt>Caudal</dt>
        <dd className="text-right">
          {formatTechnicalFlow(sizing.accumulatedFlow, sizing.accumulatedFlowUnit)}
        </dd>
        <dt>Longitud tramo</dt>
        <dd className="text-right">
          {formatCalculationMeters(segment.segmentPhysicalLengthMeters)}
        </dd>
        <dt>Recorrido gobernante</dt>
        <dd className="text-right">
          {sizing.governingTerminalEquipmentId ?? sizing.governingRouteId ?? "Pendiente"}
        </dd>
        <dt>Longitud inicial</dt>
        <dd className="text-right">
          {formatCalculationMeters(sizing.governingRoutePhysicalLengthMeters)}
        </dd>
        <dt>Equiv. recorrido</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            sizing.governingRouteAccessoryEquivalentLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Longitud dimensionado</dt>
        <dd className="text-right">
          {formatCalculationMeters(sizing.sizingLengthMeters, "Pendiente")}
        </dd>
        <dt>Diametro minimo calculado</dt>
        <dd className="text-right">
          {formatDiameterReference(sizing.calculatedDiameter)}
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
        <dt>Caudal</dt>
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
        <dt>Transiciones</dt>
        <dd className="text-right">
          {formatCalculationMeters(
            sizing.governingRouteTransitionEquivalentLengthMeters,
            "Pendiente",
          )}
        </dd>
        <dt>Longitud final dimensionado</dt>
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
        <dt>
          {isTransitionAwareResolved
            ? "Equiv. transiciones"
            : "Equiv. transiciones preview"}
        </dt>
        <dd className="text-right">
          {formatCalculationMeters(
            resolution?.equivalentLengthMeters ?? null,
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
            : contribution.ownerSegmentId}
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

function segmentLabel(
  segment: TechnicalSegmentResult,
  labels: Record<string, string>,
) {
  return `${labels[segment.fromNodeId] ?? segment.fromNodeId} -> ${labels[segment.toNodeId] ?? segment.toNodeId}`;
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
    return "Pendiente";
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

  if (segment.physicalLengthMeters === null) {
    return "Escala pendiente";
  }

  if (segment.accessoryEquivalentLengthMeters === null) {
    return "Equiv. pendiente";
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

function formatTechnicalRoutePath(
  nodeIds: string[],
  labels: Record<string, string>,
) {
  return nodeIds.map((nodeId) => labels[nodeId] ?? nodeId).join(" -> ");
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
    contribution.variant?.label ??
    contribution.catalogFamilyId ??
    diameterTransitionKindLabel(contribution.transitionKind);
  const traversal =
    contribution.transitionKind === "branch_transition"
      ? `${transitionTraversalKindLabel(contribution.traversalKind)} - `
      : "";

  return `${formatCompactDiameterReference(
    contribution.upstreamDiameter,
  )} -> ${formatCompactDiameterReference(
    contribution.downstreamDiameter,
  )} - ${traversal}${variant} - ${length}`;
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

function formatSegmentDiameter(
  segment: TechnicalSegmentResult,
  result: TechnicalCalculationResult,
) {
  const sizing = getNetworkSizingSegment(result, segment.segmentId);

  if (sizing?.status === "resolved" && sizing.calculatedDiameter) {
    return formatDiameterReference(sizing.calculatedDiameter);
  }

  if (sizing) {
    return sizing.status === "unsupported" ? "No soportado" : "Pendiente";
  }

  return segment.dimensioningResolution.status === "unsupported"
    ? "No soportado"
    : "Pendiente";
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

function equipmentDemandLabel(equipment: WorkbenchEquipment | undefined) {
  if (!equipment || hasPendingDemand(equipment)) {
    return "Pendiente";
  }

  return `${equipment.demandValue?.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${demandUnitLabel(equipment.demandUnit as NonNullable<typeof equipment.demandUnit>)}`;
}
