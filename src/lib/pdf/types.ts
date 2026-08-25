export type PdfPageModel = {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
};

export type PdfDocumentModel = {
  fileName: string;
  fileSize: number;
  pageCount: number;
  pages: PdfPageModel[];
};

export type PdfPageSize = {
  width: number;
  height: number;
};
