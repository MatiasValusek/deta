import type { StandardTechnicalReviewViewId } from "@/lib/sections/standardTechnicalViews";

export type ReviewTechnicalViewItem = {
  id: StandardTechnicalReviewViewId;
  label: string;
};

type ReviewPanelProps = {
  calculationBlockReason: string | null;
  connectedApplianceCount: number;
  hasValidRoute: boolean;
  routeRestrictionCount: number;
  totalApplianceCount: number;
  onContinueToCalculate: () => void;
};

export function ReviewPanel({
  calculationBlockReason,
  connectedApplianceCount,
  hasValidRoute,
  routeRestrictionCount,
  totalApplianceCount,
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
