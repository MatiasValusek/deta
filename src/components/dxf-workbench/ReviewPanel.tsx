import type { StandardTechnicalReviewViewId } from "@/lib/sections/standardTechnicalViews";

export type ReviewTechnicalViewItem = {
  id: StandardTechnicalReviewViewId;
  label: string;
};

type ReviewPanelProps = {
  calculationObservation: {
    actionLabel: string;
    message: string;
    sourceLabel: string;
    viewLabel: string;
  } | null;
  calculationBlockReason: string | null;
  connectedApplianceCount: number;
  hasValidRoute: boolean;
  routeRestrictionCount: number;
  totalApplianceCount: number;
  onOpenCalculationObservation: () => void;
  onContinueToCalculate: () => void;
};

export function ReviewPanel({
  calculationObservation,
  calculationBlockReason,
  connectedApplianceCount,
  hasValidRoute,
  routeRestrictionCount,
  totalApplianceCount,
  onOpenCalculationObservation,
  onContinueToCalculate,
}: ReviewPanelProps) {
  const generalStatus = hasValidRoute
    ? "Instalacion lista para calcular"
    : routeRestrictionCount > 0
      ? "Falta resolver observaciones tecnicas"
    : "Falta confirmar un recorrido valido";

  return (
    <section className="bg-white px-4 py-3 text-sm">
      <h2 className="text-sm font-semibold">Validacion tecnica</h2>

      <section className="mt-3 rounded border border-[var(--line)] px-3 py-2 text-xs">
        <div className="font-semibold">Estado general</div>
        <p className="mt-1 text-[var(--muted)]">{generalStatus}</p>
        <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_64px] gap-x-2 gap-y-1">
          <dt>Artefactos</dt>
          <dd className="text-right font-mono">
            {connectedApplianceCount}/{totalApplianceCount}
          </dd>
          <dt>Observaciones</dt>
          <dd className="text-right font-mono">{routeRestrictionCount}</dd>
        </dl>
        {!hasValidRoute && calculationBlockReason ? (
          <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-1 text-[var(--warning)]">
            {calculationBlockReason}
          </div>
        ) : null}
        {!hasValidRoute && calculationObservation ? (
          <div className="mt-2 rounded border border-[#f1d28a] bg-[#fffaf0] px-2 py-2 text-[var(--warning)]">
            <div className="font-semibold">
              {calculationObservation.sourceLabel} -{" "}
              {calculationObservation.viewLabel}
            </div>
            <p className="mt-1">{calculationObservation.message}</p>
            <button
              className="mt-2 rounded border border-[#d97706] bg-white px-2 py-1 font-medium hover:bg-[#fffbeb]"
              type="button"
              onClick={onOpenCalculationObservation}
            >
              {calculationObservation.actionLabel}
            </button>
          </div>
        ) : null}
      </section>

      <button
        className="mt-3 w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-2 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:border-[var(--line)] disabled:bg-white disabled:text-[var(--muted)]"
        disabled={!hasValidRoute}
        type="button"
        onClick={onContinueToCalculate}
      >
        Continuar a Calcular
      </button>
    </section>
  );
}
