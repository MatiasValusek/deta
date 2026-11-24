import { PDFDocument, StandardFonts } from "pdf-lib";
import type { TechnicalAxonometricView } from "@/lib/calculation/technicalAxonometric";
import { armarPlanoInstalacion } from "./planoInstalacionArmado";
import { medidasGabinete } from "./gabinetePdf";
import {
  diametrosPorTramo,
  dibujarIsometricaPdf,
  recorridosIsometrica,
} from "./isometricaPdf";
import type { NumeracionPlano } from "./numeracionPlano";

export type IsometricaVerificationResult = {
  name: string;
  status: "passed";
};

type Punto = { x: number; y: number };

const nodo = (
  id: string,
  kind: TechnicalAxonometricView["nodes"][number]["kind"],
  projected: Punto | null,
): TechnicalAxonometricView["nodes"][number] => ({
  degree: kind === "derivation" ? 3 : 1,
  equipmentId: null,
  id,
  kind,
  label: id,
  pendingReasons: [],
  point: null,
  projected,
});

const tramo = (
  id: string,
  desde: string,
  hasta: string,
  puntos: Punto[],
): TechnicalAxonometricView["segments"][number] => ({
  adoptedDiameter: null,
  adoptedDiameterLabel: "",
  fromNodeId: desde,
  fromProjected: puntos[0],
  id,
  labelPosition: null,
  path: puntos.map((projected) => ({
    elevationMeters: 0,
    elevationStatus: "resolved",
    planPoint: projected,
    projected,
    source: "node",
  })) as unknown as TechnicalAxonometricView["segments"][number]["path"],
  pendingReasons: [],
  physicalLengthMeters: null,
  status: "resolved",
  toNodeId: hasta,
  toProjected: puntos[puntos.length - 1],
  zDeltaMeters: null,
});

/** Isométrica de ejemplo: medidor, una derivación y dos artefactos, uno con subida. */
export const VISTA_EJEMPLO: TechnicalAxonometricView = {
  accessories: [],
  nodes: [
    nodo("m", "supply", { x: 0, y: 100 }),
    nodo("a", "derivation", { x: 60, y: 60 }),
    nodo("x", "appliance", { x: 60, y: 30 }),
    nodo("y", "appliance", { x: 120, y: 40 }),
  ],
  pendingItems: [],
  scaleStatus: "resolved",
  segments: [
    tramo("s1", "m", "a", [{ x: 0, y: 100 }, { x: 60, y: 60 }]),
    tramo("s2", "a", "x", [{ x: 60, y: 60 }, { x: 60, y: 30 }]),
    tramo("s3", "a", "y", [{ x: 60, y: 60 }, { x: 60, y: 60 }, { x: 100, y: 60 }, { x: 120, y: 40 }]),
  ],
  status: "resolved",
  viewBox: { height: 160, minX: 0, minY: 0, width: 180 },
};

export const NUMERACION_EJEMPLO: NumeracionPlano = {
  nodos: new Map([["m", "M"], ["a", "A"], ["x", "2"], ["y", "1"]]),
  tramos: new Map([["s1", "A-M"], ["s2", "2-A"], ["s3", "1-A"]]),
};

export async function runIsometricaVerifications() {
  const results: IsometricaVerificationResult[] = [];
  const check = (name: string, condition: () => boolean) => {
    if (!condition()) {
      throw new Error(`No se cumple: ${name}`);
    }
    results.push({ name, status: "passed" });
  };

  const diametros = diametrosPorTramo(NUMERACION_EJEMPLO, [
    ["1-A", "10,75", "—", "—", "—", "20", "25"],
    ["2-A", "10,75", "—", "—", "—", "20", "—"],
    ["A-M", "10,75", "—", "—", "—", "25", "32"],
  ]);

  check("el diámetro de cada tramo sale de la columna Diámetro adoptado", () =>
    diametros.get("s3") === "25" &&
    diametros.get("s1") === "32" &&
    !diametros.has("s2"),
  );

  check("los tramos se dibujan sin puntos repetidos", () => {
    const recorridos = recorridosIsometrica(VISTA_EJEMPLO);
    return recorridos.length === 3 && recorridos[2].puntos.length === 3;
  });

  check("sin tramos con posición no se dibuja la isométrica", () =>
    recorridosIsometrica({
      ...VISTA_EJEMPLO,
      segments: VISTA_EJEMPLO.segments.map((s) => ({
        ...s,
        fromProjected: null,
        path: [],
        toProjected: null,
      })),
    }).length === 0,
  );

  const doc = await PDFDocument.create();
  const page = doc.addPage([1190.55, 841.89]);
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const zonas = armarPlanoInstalacion();
  const zonaIsometrica = zonas.find((zona) => zona.id === "isometrica");
  const zonaGabinete = zonas.find((zona) => zona.id === "gabinete");

  check("la isométrica se dibuja en su zona", () =>
    Boolean(zonaIsometrica) &&
    dibujarIsometricaPdf({
      datos: { diametros, numeracion: NUMERACION_EJEMPLO, vista: VISTA_EJEMPLO },
      fuente,
      page,
      zona: zonaIsometrica!,
    }),
  );

  check("el gabinete entra en su zona y deja lugar al título", () => {
    if (!zonaGabinete) return false;
    const m = medidasGabinete(zonaGabinete);
    return (
      m.x1 - 14 >= zonaGabinete.x1 &&
      m.x2 + 14 <= zonaGabinete.x2 &&
      m.arriba - 5 >= zonaGabinete.y1 &&
      m.suelo < zonaGabinete.tituloY &&
      Math.abs(m.x2 - m.x1 - 20) < 1e-9 &&
      Math.abs(m.pisoGabinete - m.arriba - 25) < 1e-9
    );
  });

  return results;
}
