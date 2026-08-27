import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import {
  createTechnicalPdfBytes,
  createTechnicalPdfFileName,
} from "@/lib/calculation/technicalPdfDocument";

export async function downloadTechnicalPdf(params: {
  calculationSheet: TechnicalCalculationSheet;
  fileName?: string;
  materialTakeoff: TechnicalMaterialTakeoff;
  result: TechnicalCalculationResult | null;
}) {
  const bytes = await createTechnicalPdfBytes({
    calculationSheet: params.calculationSheet,
    materialTakeoff: params.materialTakeoff,
    result: params.result,
  });
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  try {
    link.href = url;
    link.download = params.fileName ?? createTechnicalPdfFileName();
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
