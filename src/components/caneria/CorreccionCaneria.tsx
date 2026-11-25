"use client";

import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { Boton } from "./PasoCaneria";
import type { useCorreccionCaneria } from "./useCorreccionCaneria";

/** Lo que se puede hacer con lo que se tocó: un quiebre, un tramo del caño o una bajada. */
export function CorreccionCaneria(props: {
  correccion: ReturnType<typeof useCorreccionCaneria>;
  equipment: WorkbenchEquipment[];
}) {
  const { correccion: c } = props;
  const nombre = (id: string) => props.equipment.find((e) => e.id === id)?.name ?? "el artefacto";

  if (c.espera?.tipo === "moverTramo") {
    return (
      <Caja titulo="Mover este tramo en paralelo">
        <p>Tocá en el plano por dónde tiene que pasar.</p>
        <Boton onClick={c.cancelar}>Cancelar</Boton>
      </Caja>
    );
  }

  if (c.espera?.tipo === "bajada") {
    return (
      <Caja titulo={`Bajada a ${nombre(c.espera.equipmentId)}, a mano`}>
        <p>
          Tocá dónde dobla, desde el caño principal hacia el artefacto. El último codo lo pone la app.
          {c.espera.quiebres.length > 0 ? ` (${c.espera.quiebres.length} marcados)` : ""}
        </p>
        <div className="flex gap-2">
          <Boton principal onClick={c.terminarBajada}>
            Listo
          </Boton>
          <Boton onClick={c.cancelar}>Cancelar</Boton>
        </div>
      </Caja>
    );
  }

  const s = c.seleccion;
  return (
    <div className="space-y-2">
      {c.aviso ? (
        <p className="rounded border border-[#f1d28a] bg-[#fffaf0] px-3 py-2 text-[#7a4b00]">{c.aviso}</p>
      ) : null}
      {!s ? (
        <ul className="list-disc space-y-1 pl-4 text-xs text-[var(--muted)]">
          <li>Arrastrá una esquina o la punta del caño para moverla.</li>
          <li>Arrastrá el punto de donde sale una bajada para correrlo por el caño.</li>
          <li>Tocá un tramo del caño o una bajada para ver más opciones.</li>
        </ul>
      ) : s.tipo === "quiebre" ? (
        <Caja titulo="Quiebre del caño principal">
          <p>Arrastralo para moverlo. Los tramos de al lado lo acompañan.</p>
          <Boton onClick={c.sacarQuiebre}>Sacar este quiebre</Boton>
        </Caja>
      ) : s.tipo === "derivacion" ? (
        <Caja titulo="Salida de una bajada">
          <p>Arrastrala por el caño principal para cambiar de dónde sale.</p>
        </Caja>
      ) : s.tipo === "tramo" ? (
        <Caja titulo="Tramo del caño principal">
          <div className="flex flex-wrap gap-2">
            <Boton onClick={c.agregarQuiebreAca}>Agregar quiebre acá</Boton>
            <Boton onClick={c.moverTramo}>Mover este tramo en paralelo</Boton>
          </div>
        </Caja>
      ) : (
        <Caja titulo={`Bajada a ${nombre(s.equipmentId)}`}>
          <p>Si tiene que esquivar una pared, trazala a mano.</p>
          <div className="flex flex-wrap gap-2">
            <Boton onClick={c.trazarBajadaAMano}>Trazar a mano esta bajada</Boton>
            {s.aMano ? <Boton onClick={c.volverABajadaAutomatica}>Que la ponga la app</Boton> : null}
          </div>
        </Caja>
      )}
    </div>
  );
}

function Caja(props: { children: React.ReactNode; titulo: string }) {
  return (
    <section className="rounded border border-[var(--accent)] bg-[#eef6f5] px-3 py-3 text-xs">
      <h3 className="mb-1 text-sm font-semibold">{props.titulo}</h3>
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}
