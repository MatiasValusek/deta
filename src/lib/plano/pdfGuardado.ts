import { importPdfDocument, type ImportedPdfDocument } from "@/lib/pdf/importPdf";

/*
 * El PDF del plano queda guardado en el navegador (IndexedDB: el guardado común es chico para
 * un PDF). Así, al volver a abrir la app, el plano se ve sin tener que subirlo otra vez.
 */

const BASE_DE_DATOS = "deta-planos";
const ALMACEN = "pdf";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE_DE_DATOS, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN);
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

async function conAlmacen<T>(
  modo: IDBTransactionMode,
  accion: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const pedido = accion(db.transaction(ALMACEN, modo).objectStore(ALMACEN));
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error);
    });
  } finally {
    db.close();
  }
}

/** Guarda el PDF de un plano. Si el navegador no deja, no frena: solo habrá que volver a subirlo. */
export async function guardarPdfDelPlano(baseId: string, archivo: File) {
  try {
    const datos = await archivo.arrayBuffer();
    await conAlmacen("readwrite", (almacen) => almacen.put({ datos, nombre: archivo.name }, baseId));
  } catch {
    // Sin guardado: al recargar se pide volver a subir el PDF.
  }
}

/** Vuelve a abrir el PDF guardado de un plano, o null si no está. */
export async function abrirPdfGuardado(baseId: string): Promise<ImportedPdfDocument | null> {
  try {
    const guardado = await conAlmacen<{ datos: ArrayBuffer; nombre: string } | undefined>(
      "readonly",
      (almacen) => almacen.get(baseId),
    );
    if (!guardado) return null;
    return await importPdfDocument(new File([guardado.datos], guardado.nombre, { type: "application/pdf" }));
  } catch {
    return null;
  }
}

/** "Nueva obra": borra los PDF guardados. */
export async function borrarPdfsGuardados() {
  try {
    await conAlmacen("readwrite", (almacen) => almacen.clear());
  } catch {
    // Nada que borrar.
  }
}

/** Reabre los PDF guardados de varios planos. Devuelve cada uno o null si no está. */
export async function reabrirPdfsGuardados(baseIds: string[]) {
  return new Map(await Promise.all(baseIds.map(async (id) => [id, await abrirPdfGuardado(id)] as const)));
}

export const AVISO_PDF_NO_GUARDADO =
  "El PDF del plano no quedó guardado en este navegador. Volvé a subirlo con «Cambiar el plano» y marcá la escala.";
