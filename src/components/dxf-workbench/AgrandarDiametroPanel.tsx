"use client";

import { useMemo } from "react";
import type { PipeDiameterReference, PipeSystem } from "@/lib/calculation/pipeSystem";
import type { AdoptedDiameterDecision } from "@/lib/calculation/professionalDiameterAdoption";
import type { TechnicalCalculationSheet } from "@/lib/calculation/technicalCalculationSheet";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import { numerarDesdeResultado } from "@/lib/laminas/numeracionPlano";
import type { ManualRouteNetwork } from "@/lib/routing/types";

/**
 * La app adopta el diámetro mínimo por tabla. Acá el gasista puede agrandar un tramo
 * (por ejemplo, para dejar prevista una ampliación). Nunca se ofrece menos que la tabla.
 */
export function AgrandarDiametroPanel({
  adoptedDiameterDecisions,
  calculationSheet,
  network,
  pipeSystem,
  result,
  onAdoptSegmentDiameter,
}: {
  adoptedDiameterDecisions: AdoptedDiameterDecision[];
  calculationSheet: TechnicalCalculationSheet;
  network: ManualRouteNetwork;
  pipeSystem: PipeSystem;
  result: TechnicalCalculationResult | null;
  onAdoptSegmentDiameter: (segmentId: string, diameterId: string | null) => void;
}) {
  const medidas = useMemo(() => {
    const disponibles = pipeSystem.getAvailableDiameters();
    return disponibles.status === "resolved"
      ? [...disponibles.value].sort((a, b) => mm(a) - mm(b))
      : [];
  }, [pipeSystem]);
  const numeracion = useMemo(() => numerarDesdeResultado(network, result), [network, result]);
  const elegidoPorTramo = new Map(
    adoptedDiameterDecisions.map((decision) => [decision.segmentId, decision.diameterId]),
  );
  const filas = calculationSheet.rows
    .filter((fila) => fila.calculatedDiameter)
    .map((fila) => ({
      fila,
      tramo: numeracion.tramos.get(fila.segmentId) ?? fila.tramo,
    }))
    .sort((a, b) => a.tramo.localeCompare(b.tramo, "es", { numeric: true }));

  if (filas.length === 0 || medidas.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded border border-[var(--line)] bg-[#f8f9f6] px-3 py-3">
      <h3 className="text-xs font-semibold">Agrandar para ampliación futura</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        La app usa el diámetro mínimo por tabla. Si querés dejar prevista una ampliación,
        elegí un diámetro mayor en el tramo.
      </p>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--muted)]">
            <th className="py-1 font-medium">Tramo</th>
            <th className="py-1 font-medium">Por tabla</th>
            <th className="py-1 font-medium">Diámetro adoptado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ fila, tramo }) => {
            const porTabla = fila.calculatedDiameter as PipeDiameterReference;
            const mayores = medidas.filter((medida) => mm(medida) > mm(porTabla));
            const elegido = elegidoPorTramo.get(fila.segmentId);

            return (
              <tr className="border-t border-[var(--line)]" key={fila.segmentId}>
                <td className="py-1">{tramo}</td>
                <td className="py-1">{mm(porTabla)} mm</td>
                <td className="py-1">
                  <select
                    aria-label={`Diámetro adoptado del tramo ${tramo}`}
                    className="rounded border border-[var(--line)] bg-white px-1 py-0.5"
                    disabled={mayores.length === 0}
                    value={elegido && mayores.some((m) => m.id === elegido) ? elegido : ""}
                    onChange={(evento) =>
                      onAdoptSegmentDiameter(fila.segmentId, evento.target.value || null)
                    }
                  >
                    <option value="">{mm(porTabla)} mm (por tabla)</option>
                    {mayores.map((medida) => (
                      <option key={medida.id} value={medida.id}>
                        {mm(medida)} mm (agrandado)
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function mm(diametro: PipeDiameterReference) {
  return diametro.externalDiameterMillimeters ?? 0;
}
