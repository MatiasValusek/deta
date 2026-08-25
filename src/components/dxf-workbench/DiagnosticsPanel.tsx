import type {
  Bounds,
  EntityCountMap,
  IgnoredEntity,
  NormalizedDrawing,
} from "@/lib/geometry/types";

type DiagnosticsPanelProps = {
  drawing: NormalizedDrawing | null;
  isSectionContent?: boolean;
};

export function DiagnosticsPanel({
  drawing,
  isSectionContent = false,
}: DiagnosticsPanelProps) {
  if (!drawing) {
    return (
      <div className={isSectionContent ? "px-4 py-3 text-sm" : "px-4 py-3"}>
        <h2 className="text-sm font-semibold">Diagnostico</h2>
        <p className="mt-3 text-sm text-[var(--muted)]">Sin datos importados.</p>
      </div>
    );
  }

  return (
    <div className={isSectionContent ? "text-sm" : "flex h-full flex-col"}>
      <div
        className={
          isSectionContent
            ? "px-4 py-3"
            : "border-b border-[var(--line)] px-4 py-3"
        }
      >
        <h2 className="text-sm font-semibold">Diagnostico</h2>
      </div>

      <div
        className={
          isSectionContent
            ? "space-y-5 px-4 pb-4 text-sm"
            : "min-h-0 flex-1 space-y-5 overflow-auto px-4 py-4 text-sm"
        }
      >
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
            Archivo
          </h3>
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-[var(--muted)]">Unidades</dt>
            <dd>{formatUnits(drawing)}</dd>
            <dt className="text-[var(--muted)]">Capas</dt>
            <dd>{drawing.layers.length}</dd>
            <dt className="text-[var(--muted)]">Primitivas</dt>
            <dd>{drawing.entities.length}</dd>
            <dt className="text-[var(--muted)]">Lineales</dt>
            <dd>{linearPrimitiveCount(drawing.normalizedCounts)}</dd>
            <dt className="text-[var(--muted)]">Areas HATCH</dt>
            <dd>{drawing.normalizedCounts.hatch ?? 0}</dd>
            <dt className="text-[var(--muted)]">HATCH no sop.</dt>
            <dd>{unsupportedHatchCount(drawing.ignoredEntities)}</dd>
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
            Extension
          </h3>
          <BoundsBlock bounds={drawing.bounds} title="Normalizada" />
          <div className="mt-3">
            <BoundsBlock bounds={drawing.headerBounds} title="Header $EXTMIN/$EXTMAX" />
          </div>
        </section>

        <CountSection counts={drawing.rawEntityCounts.ENTITIES} title="Entidades DXF" />
        <CountSection counts={drawing.rawEntityCounts.BLOCKS} title="Entidades en bloques" />
        <CountSection counts={drawing.normalizedCounts} title="Primitivas internas" />

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
            Soportadas
          </h3>
          <p className="font-mono text-xs">
            {drawing.supportedSourceTypes.join(", ")}
          </p>
        </section>

        <IgnoredSection ignored={drawing.ignoredEntities} />

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
            Advertencias
          </h3>
          {drawing.warnings.length === 0 ? (
            <p className="text-[var(--muted)]">Sin advertencias.</p>
          ) : (
            <ul className="space-y-2">
              {drawing.warnings.map((warning, index) => (
                <li
                  className="rounded border border-[#ecd5ad] bg-[#fff9ec] px-3 py-2 text-[var(--warning)]"
                  key={`${warning.entityType ?? "warning"}-${index}`}
                >
                  {warning.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function BoundsBlock({ bounds, title }: { bounds: Bounds | null; title: string }) {
  return (
    <div>
      <div className="mb-1 text-[var(--muted)]">{title}</div>
      {bounds ? (
        <dl className="grid grid-cols-[70px_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-xs">
          <dt>Min X</dt>
          <dd>{formatNumber(bounds.minX)}</dd>
          <dt>Min Y</dt>
          <dd>{formatNumber(bounds.minY)}</dd>
          <dt>Max X</dt>
          <dd>{formatNumber(bounds.maxX)}</dd>
          <dt>Max Y</dt>
          <dd>{formatNumber(bounds.maxY)}</dd>
        </dl>
      ) : (
        <p className="text-[var(--muted)]">No disponible.</p>
      )}
    </div>
  );
}

function CountSection({ counts, title }: { counts: EntityCountMap; title: string }) {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="text-[var(--muted)]">Sin entidades.</p>
      ) : (
        <dl className="grid grid-cols-[minmax(0,1fr)_70px] gap-x-3 gap-y-1">
          {entries.map(([type, count]) => (
            <div className="contents" key={type}>
              <dt className="truncate font-mono text-xs">{type}</dt>
              <dd className="text-right font-mono text-xs">{count}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function IgnoredSection({ ignored }: { ignored: IgnoredEntity[] }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
        Ignoradas
      </h3>
      {ignored.length === 0 ? (
        <p className="text-[var(--muted)]">Ninguna.</p>
      ) : (
        <dl className="grid grid-cols-[minmax(0,1fr)_70px] gap-x-3 gap-y-1">
          {ignored.map((entry) => (
            <div className="contents" key={`${entry.location}-${entry.type}`}>
              <dt className="truncate font-mono text-xs">
                {entry.type} / {entry.location}
              </dt>
              <dd className="text-right font-mono text-xs">{entry.count}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function linearPrimitiveCount(counts: EntityCountMap) {
  return (counts.line ?? 0) + (counts.polyline ?? 0) + (counts.arc ?? 0);
}

function unsupportedHatchCount(ignored: IgnoredEntity[]) {
  return ignored
    .filter((entry) => entry.type === "HATCH")
    .reduce((count, entry) => count + entry.count, 0);
}

function formatUnits(drawing: NormalizedDrawing) {
  if (drawing.units.code === null) {
    return "No informadas";
  }

  return drawing.units.label
    ? `${drawing.units.label} (${drawing.units.code})`
    : `Codigo ${drawing.units.code}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 3,
  }).format(value);
}
