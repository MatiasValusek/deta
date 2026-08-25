import type { PdfDocumentModel } from "@/lib/pdf/types";

type PdfPanelProps = {
  activePageNumber: number;
  pdf: PdfDocumentModel | null;
  onPageChange: (pageNumber: number) => void;
};

export function PdfPanel({
  activePageNumber,
  pdf,
  onPageChange,
}: PdfPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold">PDF</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 text-sm">
        {!pdf ? (
          <p className="text-[var(--muted)]">Seleccione un PDF.</p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt className="text-[var(--muted)]">Archivo</dt>
              <dd className="truncate">{pdf.fileName}</dd>
              <dt className="text-[var(--muted)]">Paginas</dt>
              <dd>{pdf.pageCount}</dd>
            </dl>

            {pdf.pageCount > 1 ? (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-[var(--muted)]">
                  Pagina
                </span>
                <select
                  className="w-full rounded border border-[var(--line)] px-2 py-1"
                  value={activePageNumber}
                  onChange={(event) => onPageChange(Number(event.target.value))}
                >
                  {pdf.pages.map((page) => (
                    <option key={page.pageNumber} value={page.pageNumber}>
                      {page.pageNumber}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
