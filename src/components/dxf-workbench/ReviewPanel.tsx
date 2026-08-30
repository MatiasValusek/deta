export type ReviewSectionItem = {
  id: string;
  isActive: boolean;
  name: string;
  status: "pending" | "ready";
  summary: string;
};

type ReviewPanelProps = {
  activeBaseType: "plan" | "section" | null;
  connectedApplianceCount: number;
  hasValidRoute: boolean;
  isPlanActive: boolean;
  planName: string | null;
  routeRestrictionCount: number;
  sections: ReviewSectionItem[];
  totalApplianceCount: number;
  onContinueToCalculate: () => void;
  onOpenPlan: () => void;
  onOpenSection: (sectionId: string) => void;
};

export function ReviewPanel({
  activeBaseType,
  connectedApplianceCount,
  hasValidRoute,
  isPlanActive,
  planName,
  routeRestrictionCount,
  sections,
  totalApplianceCount,
  onContinueToCalculate,
  onOpenPlan,
  onOpenSection,
}: ReviewPanelProps) {
  const generalStatus = hasValidRoute
    ? "Instalacion lista para calcular"
    : "Falta confirmar un recorrido valido";

  return (
    <section className="bg-white px-4 py-3 text-sm">
      <h2 className="sr-only">Revisar</h2>

      <div className="grid grid-cols-2 gap-1">
        <button
          className={`rounded border px-2 py-2 text-left text-xs ${
            isPlanActive
              ? "border-[var(--accent)] bg-[#f0f7ff]"
              : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
          }`}
          disabled={!planName}
          type="button"
          onClick={onOpenPlan}
        >
          <span className="block font-semibold">Planta</span>
          <span className="mt-1 block truncate text-[var(--muted)]">
            {planName ?? "Sin planta"}
          </span>
        </button>
        {sections.length === 0 ? (
          <button
            className="rounded border border-[var(--line)] bg-[#f5f6f7] px-2 py-2 text-left text-xs text-[var(--muted)]"
            disabled
            type="button"
          >
            <span className="block font-semibold">Corte</span>
            <span className="mt-1 block">Sin corte vinculado</span>
          </button>
        ) : (
          <button
            className={`rounded border px-2 py-2 text-left text-xs ${
              activeBaseType === "section"
                ? "border-[var(--accent)] bg-[#f0f7ff]"
                : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
            }`}
            type="button"
            onClick={() => onOpenSection(sections[0]?.id ?? "")}
          >
            <span className="block font-semibold">Corte</span>
            <span className="mt-1 block truncate text-[var(--muted)]">
              {activeBaseType === "section"
                ? sections.find((section) => section.isActive)?.name ??
                  sections[0]?.name
                : sections[0]?.name}
            </span>
          </button>
        )}
      </div>

      {sections.length > 1 ? (
        <div className="mt-2 space-y-1">
          {sections.map((section) => (
            <button
              className={`w-full rounded border px-2 py-1 text-left text-xs ${
                section.isActive
                  ? "border-[var(--accent)] bg-[#f0f7ff]"
                  : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
              }`}
              key={section.id}
              type="button"
              onClick={() => onOpenSection(section.id)}
            >
              <span className="block truncate font-medium">{section.name}</span>
              <span className="block truncate text-[10px] text-[var(--muted)]">
                {section.summary}
              </span>
            </button>
          ))}
        </div>
      ) : null}

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
