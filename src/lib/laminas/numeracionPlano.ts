import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type { ManualRouteNetwork } from "@/lib/routing/types";

export type TramoNumerable = {
  segmentId: string;
  fromNodeId: string;
  toNodeId: string;
  physicalLengthMeters: number | null;
};

export type NumeracionPlano = {
  nodos: Map<string, string>;
  tramos: Map<string, string>;
};

/**
 * Numera como en los planos presentados: M = medidor, artefactos 1, 2, 3… y
 * derivaciones A, B, C…, empezando por lo más lejano al medidor.
 * El tramo se nombra desde el extremo lejano: "1-A", "A-M".
 */
export function numerarPlano(
  network: ManualRouteNetwork,
  tramos: TramoNumerable[],
): NumeracionPlano {
  const distancias = distanciasDesdeMedidor(network, tramos);
  const porLejania = [...network.nodes].sort(
    (a, b) =>
      (distancias.get(b.id) ?? -1) - (distancias.get(a.id) ?? -1) ||
      a.id.localeCompare(b.id, "es", { numeric: true }),
  );
  const nodos = new Map<string, string>();
  let artefacto = 0;
  let derivacion = 0;

  for (const nodo of porLejania) {
    if (nodo.kind === "supply") {
      nodos.set(nodo.id, "M");
    } else if (nodo.kind === "appliance") {
      artefacto += 1;
      nodos.set(nodo.id, String(artefacto));
    } else {
      nodos.set(nodo.id, letra(derivacion));
      derivacion += 1;
    }
  }

  return {
    nodos,
    tramos: new Map(
      tramos.map((tramo) => {
        const desde = distancias.get(tramo.fromNodeId) ?? 0;
        const hasta = distancias.get(tramo.toNodeId) ?? 0;
        const [lejano, cercano] =
          desde >= hasta
            ? [tramo.fromNodeId, tramo.toNodeId]
            : [tramo.toNodeId, tramo.fromNodeId];

        return [
          tramo.segmentId,
          `${nodos.get(lejano) ?? "?"}-${nodos.get(cercano) ?? "?"}`,
        ];
      }),
    ),
  };
}

function distanciasDesdeMedidor(
  network: ManualRouteNetwork,
  tramos: TramoNumerable[],
) {
  const vecinos = new Map<string, Array<[string, number]>>();
  const agregar = (desde: string, hasta: string, largo: number) =>
    vecinos.set(desde, [...(vecinos.get(desde) ?? []), [hasta, largo]]);

  for (const tramo of tramos) {
    const largo = tramo.physicalLengthMeters ?? 0;
    agregar(tramo.fromNodeId, tramo.toNodeId, largo);
    agregar(tramo.toNodeId, tramo.fromNodeId, largo);
  }

  const distancias = new Map<string, number>();
  const pendientes = network.nodes
    .filter((nodo) => nodo.kind === "supply")
    .map((nodo) => [nodo.id, 0] as [string, number]);

  while (pendientes.length > 0) {
    const [id, distancia] = pendientes.pop() as [string, number];

    if (distancias.has(id)) {
      continue;
    }

    distancias.set(id, distancia);
    for (const [vecino, largo] of vecinos.get(id) ?? []) {
      pendientes.push([vecino, distancia + largo]);
    }
  }

  return distancias;
}

function letra(indice: number): string {
  const actual = String.fromCharCode(65 + (indice % 26));
  return indice < 26 ? actual : `${letra(Math.floor(indice / 26) - 1)}${actual}`;
}

/** Numeración de la lámina a partir del resultado del cálculo (la misma en todas las hojas). */
export function numerarDesdeResultado(
  network: ManualRouteNetwork,
  result: TechnicalCalculationResult | null,
): NumeracionPlano {
  return numerarPlano(
    network,
    (result?.segments ?? []).map((tramo) => ({
      segmentId: tramo.segmentId,
      fromNodeId: tramo.fromNodeId,
      toNodeId: tramo.toNodeId,
      physicalLengthMeters: tramo.segmentPhysicalLengthMeters,
    })),
  );
}
