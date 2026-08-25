import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfDocumentModel } from "./types";

export type ImportedPdfDocument = {
  model: PdfDocumentModel;
  proxy: PDFDocumentProxy;
};

let workerConfigured = false;

export async function importPdfDocument(file: File): Promise<ImportedPdfDocument> {
  const pdfjs = await import("pdfjs-dist");
  ensurePdfWorker(pdfjs);

  const data = new Uint8Array(await file.arrayBuffer());

  try {
    const task = pdfjs.getDocument({ data });
    const proxy = await task.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= proxy.numPages; pageNumber += 1) {
      const page = await proxy.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });

      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
      });
    }

    return {
      proxy,
      model: {
        fileName: file.name,
        fileSize: file.size,
        pageCount: proxy.numPages,
        pages,
      },
    };
  } catch (error) {
    if (isPasswordException(error)) {
      throw new Error("El PDF esta cifrado y no puede abrirse en esta prueba.");
    }

    throw error;
  }
}

function ensurePdfWorker(pdfjs: typeof import("pdfjs-dist")) {
  if (workerConfigured || typeof window === "undefined") {
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  workerConfigured = true;
}

function isPasswordException(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "PasswordException"
  );
}
