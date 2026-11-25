import type { ManualConstraint } from "@/lib/constraints/types";
import {
  createSuggestedEquipmentTerminalConfig,
  terminalEndHeightMeters,
} from "@/lib/equipment/terminalConfig";
import type { EquipmentType, WorkbenchEquipment } from "@/lib/equipment/types";
import {
  DEFAULT_WALL_SNAP_TOLERANCE_SOURCE,
  resolveEquipmentPhysicalPlacementAlternatives,
  withEquipmentWallAnchorZ,
} from "@/lib/equipment/wallAnchoring";
import { DEFAULT_UNVERIFIED_ELEVATION, withPointZ } from "@/lib/geometry/height";
import type { NormalizedDrawing, Point2D } from "@/lib/geometry/types";
import { buildClassificationIndex } from "@/lib/semantic/classification";
import type { ConfirmedClassification } from "@/lib/semantic/types";
import { tipoDeArtefacto } from "./tiposDeArtefacto";

/*
 * Un toque en el plano = un artefacto ubicado, con su consumo típico y su nombre.
 * En un DXF se apoya en la pared más cercana si hay una a mano; si no, queda donde se tocó.
 * Nunca frena: el gasista lo puede mover después.
 */

export type PlanoParaUbicar = {
  baseId: string;
  constraints: ManualConstraint[];
  drawing: NormalizedDrawing | null;
  fuente: "dxf" | "pdf";
  metrosPorUnidad: number | null;
  paginaPdf?: number;
  semanticAssignments: ConfirmedClassification[];
};

/** Lo que hace falta del plano de la obra para ubicar (null si todavía no hay plano). */
export function planoParaUbicar(
  base: {
    calibration: { calibration: { millimetersPerSourceUnit: number } | null };
    constraints: ManualConstraint[];
    drawing: NormalizedDrawing | null;
    id: string;
    semanticAssignments: ConfirmedClassification[];
    sourceType: "dxf" | "pdf";
    visual: { activePdfPageNumber: number };
  } | null,
): PlanoParaUbicar | null {
  if (!base) return null;
  const mm = base.calibration.calibration?.millimetersPerSourceUnit;
  return {
    baseId: base.id,
    constraints: base.constraints,
    drawing: base.drawing,
    fuente: base.sourceType,
    metrosPorUnidad: mm ? mm / 1000 : null,
    paginaPdf: base.sourceType === "pdf" ? base.visual.activePdfPageNumber : undefined,
    semanticAssignments: base.semanticAssignments,
  };
}

/** Hasta dónde busca pared alrededor del toque. */
const RADIO_PARED_M = 0.5;

/** Dónde queda el artefacto: contra la pared cercana (DXF) o donde se tocó. */
export function ubicacionEnPlano(
  plano: PlanoParaUbicar,
  tipo: EquipmentType,
  punto: Point2D,
): Pick<WorkbenchEquipment, "bodyPoint" | "connectionPoint" | "wallAnchor"> {
  if (tipo === "meter_regulator") {
    return { connectionPoint: { x: punto.x, y: punto.y } };
  }

  const altura = alturaDeConexion(tipo);
  const libre = withPointZ({ x: punto.x, y: punto.y }, altura);
  const [pared] =
    plano.fuente === "dxf"
      ? resolveEquipmentPhysicalPlacementAlternatives({
          classificationIndex: buildClassificationIndex(plano.semanticAssignments),
          constraints: plano.constraints,
          drawing: plano.drawing,
          heightMeters: altura,
          pageNumber: null,
          point: punto,
          role: "appliance",
          scaleMetersPerSourceUnit: plano.metrosPorUnidad,
          snapToleranceSource:
            plano.metrosPorUnidad && plano.metrosPorUnidad > 0
              ? RADIO_PARED_M / plano.metrosPorUnidad
              : DEFAULT_WALL_SNAP_TOLERANCE_SOURCE,
          source: "dxf",
        })
      : [];

  if (!pared) {
    return { bodyPoint: libre, connectionPoint: libre };
  }

  return {
    bodyPoint: withPointZ(pared.bodyPoint, altura),
    connectionPoint: withPointZ(pared.connectionPoint, altura),
    wallAnchor: withEquipmentWallAnchorZ(pared.wallAnchor, altura) ?? pared.wallAnchor,
  };
}

/** Un artefacto nuevo, con el consumo típico de su tipo y un nombre que no se repite. */
export function crearArtefacto(params: {
  existentes: WorkbenchEquipment[];
  id: string;
  plano: PlanoParaUbicar;
  punto: Point2D;
  tipo: EquipmentType;
}): WorkbenchEquipment {
  const { plano, tipo } = params;
  const datos = tipoDeArtefacto(tipo);
  const lugar = ubicacionEnPlano(plano, tipo, params.punto);
  const comun = {
    ...lugar,
    id: params.id,
    name: nombreSugerido(tipo, params.existentes),
    planBaseId: plano.baseId,
    ...(plano.fuente === "pdf" ? { pdfPageNumber: plano.paginaPdf ?? 1 } : {}),
    source: "manual" as const,
    type: tipo,
  };

  if (tipo === "meter_regulator") {
    return { ...comun, elevation: DEFAULT_UNVERIFIED_ELEVATION, role: "supply" };
  }

  return {
    ...comun,
    ...(datos.kcalPorHora === null ? {} : { demandUnit: "kcal_h" as const, demandValue: datos.kcalPorHora }),
    role: "appliance",
    terminalConfig: createSuggestedEquipmentTerminalConfig(tipo),
  };
}

/** El mismo artefacto en otro lugar; todo lo demás queda igual. */
export function moverArtefacto(
  plano: PlanoParaUbicar,
  artefacto: WorkbenchEquipment,
  punto: Point2D,
): WorkbenchEquipment {
  const { bodyPoint: _cuerpo, wallAnchor: _pared, ...resto } = artefacto;
  return { ...resto, ...ubicacionEnPlano(plano, artefacto.type, punto) };
}

/** "Cocina", y si ya hay una, "Cocina 2". */
export function nombreSugerido(tipo: EquipmentType, existentes: WorkbenchEquipment[]) {
  const nombre = tipoDeArtefacto(tipo).nombre;
  const usados = new Set(existentes.map((item) => item.name.trim().toLocaleLowerCase("es-AR")));

  if (!usados.has(nombre.toLocaleLowerCase("es-AR"))) {
    return nombre;
  }

  for (let numero = 2; ; numero += 1) {
    const candidato = `${nombre} ${numero}`;
    if (!usados.has(candidato.toLocaleLowerCase("es-AR"))) return candidato;
  }
}

function alturaDeConexion(tipo: EquipmentType) {
  const config = createSuggestedEquipmentTerminalConfig(tipo);
  return terminalEndHeightMeters(config) ?? config.connectionHeightMeters ?? 0;
}
