"use client";

import { useState } from "react";
import { downloadTechnicalWorkbook } from "@/lib/calculation/technicalExcelDownload";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";

/**
 * Opción secundaria de Revisar y descargar: la tabla de cálculo y la lista de materiales
 * en Excel, para pasarla al corralón o seguir trabajando en la planilla.
 */
export function ExportarExcel(props: {
  calculationSheet: TechnicalCalculationSheet;
  materialTakeoff: TechnicalMaterialTakeoff;
  nombreArchivo: string;
}) {
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hayTramos = props.calculationSheet.rows.length > 0;

  const exportar = async () => {
    setError(null);
    setExportando(true);
    try {
      await downloadTechnicalWorkbook({
        calculationSheet: props.calculationSheet,
        fileName: props.nombreArchivo,
        materialTakeoff: props.materialTakeoff,
      });
    } catch {
      setError("No se pudo armar el Excel. Volvé a intentar.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <button
        className="rounded border border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-medium hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--muted)]"
        disabled={!hayTramos || exportando}
        type="button"
        onClick={exportar}
      >
        <span className="text-[13px]">{exportando ? "Preparando…" : "Exportar materiales (Excel)"}</span>
      </button>
      <span className="text-xs text-[var(--muted)]">
        {hayTramos
          ? "Cálculo por tramo y lista de materiales, para editar o pedir al corralón."
          : "Sale cuando la cañería tenga tramos calculados."}
      </span>
      {error ? (
        <p className="w-full text-xs text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
