import type { StandardTechnicalReviewViewId } from "@/lib/sections/standardTechnicalViews";

export type ReviewTechnicalViewItem = {
  id: StandardTechnicalReviewViewId;
  label: string;
  summary: string;
};

type ReviewPanelProps = {
  activeViewId: StandardTechnicalReviewViewId;
  connectedApplianceCount: number;
  hasValidRoute: boolean;
  routeRestrictionCount: number;
  totalApplianceCount: number;
  views: ReviewTechnicalViewItem[];
  onContinueToCalculate: () => void;
  onOpenView: (viewId: StandardTechnicalReviewViewId) => void;
};

export function ReviewPanel({
  activeViewId,
  connectedApplianceCount,
  hasValidRoute,
  routeRestrictionCount,
  totalApplianceCount,
  views,
  onContinueToCalculate,
  onOpenView,
}: ReviewPanelProps) {
  const generalStatus = hasValidRoute
    ? "Instalacion lista para calcular"
    : "Falta confirmar un recorrido valido";

  return (
    <section className="bg-white px-4 py-3 text-sm">
      <h2 className="sr-only">Revisar</h2>

      <div className="grid grid-cols-2 gap-1">
        {views.map((view) => (
          <button
            className={`rounded border px-2 py-2 text-left text-xs ${
              activeViewId === view.id
                ? "border-[var(--accent)] bg-[#f0f7ff]"
                : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
            }`}
            data-review-view-id={view.id}
            key={view.id}
            type="button"
            onClick={() => onOpenView(view.id)}
          >
            <span className="block font-semibold">{view.label}</span>
            <span className="mt-1 block truncate text-[var(--muted)]">
              {view.summary}
            </span>
          </button>
        ))}
      </div>

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
