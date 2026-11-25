"use client";

import { useEffect, useRef, useState } from "react";
import { cargarPdfjs } from "@/lib/pdf/importPdf";

/** Primera página de una hoja PDF, dibujada chica para reconocerla de un vistazo. */
export function MiniaturaHoja({ bytes, titulo }: { bytes: Uint8Array; titulo: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let destruir: (() => void) | null = null;

    (async () => {
      try {
        const pdfjs = await cargarPdfjs();
        // pdf.js se queda con el buffer: se le pasa una copia.
        const tarea = pdfjs.getDocument({ data: bytes.slice() });
        destruir = () => void tarea.destroy();
        const documento = await tarea.promise;
        const pagina = await documento.getPage(1);
        const canvas = lienzo.current;
        if (cancelado || !canvas) return;
        // Entra entera en el marco, sea A3 apaisada o A4 parada.
        const ancho = (marco.current?.clientWidth || 336) - 16;
        const alto = (marco.current?.clientHeight || 242) - 16;
        const base = pagina.getViewport({ scale: 1 });
        const ajuste = Math.min(ancho / base.width, alto / base.height);
        canvas.style.width = `${base.width * ajuste}px`;
        canvas.style.height = `${base.height * ajuste}px`;
        const escala = ajuste * (window.devicePixelRatio || 1);
        const vista = pagina.getViewport({ scale: escala });
        canvas.width = vista.width;
        canvas.height = vista.height;
        const contexto = canvas.getContext("2d");
        if (!contexto) return;
        await pagina.render({ canvas, canvasContext: contexto, viewport: vista }).promise;
      } catch {
        if (!cancelado) setFallo(true);
      }
    })();

    return () => {
      cancelado = true;
      destruir?.();
    };
  }, [bytes]);

  if (fallo) {
    return (
      <div className="flex aspect-[1.414] w-full items-center justify-center bg-white text-xs text-[var(--muted)]">
        No se pudo mostrar la vista previa.
      </div>
    );
  }

  return (
    <div className="flex aspect-[1.414] w-full items-center justify-center bg-[#e9ebe6] p-2" ref={marco}>
      <canvas
        aria-label={`Vista previa: ${titulo}`}
        className="bg-white shadow"
        ref={lienzo}
        role="img"
      />
    </div>
  );
}
