import writeXlsxFile from "write-excel-file/browser";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalMaterialTakeoff } from "@/lib/calculation/technicalMaterialTakeoff";
import {
  createTechnicalWorkbookFileName,
  createTechnicalWorkbookSheets,
} from "@/lib/calculation/technicalExcelWorkbook";

export async function downloadTechnicalWorkbook(params: {
  calculationSheet: TechnicalCalculationSheet;
  fileName?: string;
  materialTakeoff: TechnicalMaterialTakeoff;
}) {
  await writeXlsxFile(
    createTechnicalWorkbookSheets({
      calculationSheet: params.calculationSheet,
      materialTakeoff: params.materialTakeoff,
    }),
  ).toFile(params.fileName ?? createTechnicalWorkbookFileName());
}
