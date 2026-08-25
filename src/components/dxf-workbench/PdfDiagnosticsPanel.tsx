import type { PdfDocumentModel, PdfPageModel } from "@/lib/pdf/types";

type PdfDiagnosticsPanelProps = {
  activePage: PdfPageModel | null;
  isSectionContent?: boolean;
  pdf: PdfDocumentModel | null;
};

export function PdfDiagnosticsPanel({
  activePage,
  isSectionContent = false,
  pdf,
}: PdfDiagnosticsPanelProps) {
  if (!pdf) {
    return (
      <div className={isSectionContent ? "px-4 py-3 text-sm" : "px-4 py-3"}>
        <h2 className="text-sm font-semibold">Diagnostico PDF</h2>
        <p className="mt-3 text-sm text-[var(--muted)]">Sin PDF importado.</p>
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
        <h2 className="text-sm font-semibold">Diagnostico PDF</h2>
      </div>

      <div
        className={
          isSectionContent
            ? "px-4 pb-4 text-sm"
            : "min-h-0 flex-1 overflow-auto px-4 py-4 text-sm"
        }
      >
        <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="text-[var(--muted)]">Nombre</dt>
          <dd className="truncate">{pdf.fileName}</dd>
          <dt className="text-[var(--muted)]">Tamano</dt>
          <dd>{formatBytes(pdf.fileSize)}</dd>
          <dt className="text-[var(--muted)]">Paginas</dt>
          <dd>{pdf.pageCount}</dd>
          <dt className="text-[var(--muted)]">Pagina activa</dt>
          <dd>{activePage?.pageNumber ?? "-"}</dd>
          <dt className="text-[var(--muted)]">Ancho pagina</dt>
          <dd>{activePage ? formatNumber(activePage.width) : "-"}</dd>
          <dt className="text-[var(--muted)]">Alto pagina</dt>
          <dd>{activePage ? formatNumber(activePage.height) : "-"}</dd>
          <dt className="text-[var(--muted)]">Rotacion</dt>
          <dd>{activePage ? `${activePage.rotation} deg` : "-"}</dd>
        </dl>
      </div>
    </div>
  );
}

function formatBytes(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 3,
  }).format(value);
}
