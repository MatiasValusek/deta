import {
  PROFESSIONAL_CONFIRMED_ELEVATION,
  withPointZ,
} from "@/lib/geometry/height";
import { withEquipmentWallAnchorZ } from "@/lib/equipment/wallAnchoring";
import {
  equipmentTerminalHeightIsConfirmed,
  terminalConnectionHeightMetersFromEnd,
  terminalEndHeightMeters,
} from "@/lib/equipment/terminalConfig";
import type { WorkbenchEquipment } from "@/lib/equipment/types";
import { applyConfirmedEquipmentTerminalConnection } from "@/lib/routing/terminalConnection";
import type { ManualRouteNetwork } from "@/lib/routing/types";

export type SectionRouteHeightTarget =
  | {
      kind: "node";
      nodeId: string;
    }
  | {
      kind: "segment_vertex";
      segmentId: string;
      vertexIndex: number;
    };

export type SectionRouteHeightEditResult =
  | {
      equipment: WorkbenchEquipment[];
      network: ManualRouteNetwork;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export function applySectionRouteHeightEdit(params: {
  equipment: WorkbenchEquipment[];
  heightMeters: number;
  network: ManualRouteNetwork;
  scaleMetersPerSourceUnit?: number | null;
  target: SectionRouteHeightTarget;
}): SectionRouteHeightEditResult {
  const target = params.target;

  if (!Number.isFinite(params.heightMeters)) {
    return {
      message: "La cota debe ser un numero finito.",
      ok: false,
    };
  }

  if (target.kind === "segment_vertex") {
    return applySegmentVertexHeightEdit({
      ...params,
      target,
    });
  }

  const node =
    params.network.nodes.find((candidate) => candidate.id === target.nodeId) ??
    null;

  if (!node) {
    return {
      message: "El punto seleccionado ya no existe en la red.",
      ok: false,
    };
  }

  if (node.equipmentId) {
    const equipment = params.equipment.find(
      (candidate) => candidate.id === node.equipmentId,
    );

    if (!equipment) {
      return {
        message: "El equipo conectado ya no existe.",
        ok: false,
      };
    }

    const nextEquipment = params.equipment.map((item) =>
      item.id === equipment.id
        ? withEquipmentTerminalEndHeight(item, params.heightMeters)
        : item,
    );
    const editedEquipment =
      nextEquipment.find((item) => item.id === equipment.id) ?? equipment;

    if (
      editedEquipment.role === "appliance" &&
      equipmentTerminalHeightIsConfirmed(editedEquipment.terminalConfig)
    ) {
      const terminalUpdate = applyConfirmedEquipmentTerminalConnection({
        equipment: nextEquipment,
        equipmentId: editedEquipment.id,
        network: params.network,
        scaleMetersPerSourceUnit: params.scaleMetersPerSourceUnit ?? null,
      });

      if (!terminalUpdate.ok) {
        return {
          message: terminalUpdate.message,
          ok: false,
        };
      }

      return {
        equipment: nextEquipment,
        network: terminalUpdate.network,
        ok: true,
      };
    }

    return {
      equipment: nextEquipment,
      network: params.network,
      ok: true,
    };
  }

  const nodePosition = node.position;

  if (!nodePosition) {
    return {
      message: "El nodo seleccionado no tiene posicion confirmada.",
      ok: false,
    };
  }

  return {
    equipment: params.equipment,
    network: {
      ...params.network,
      nodes: params.network.nodes.map((item) =>
        item.id === node.id
          ? {
              ...item,
              elevation: PROFESSIONAL_CONFIRMED_ELEVATION,
              position: withPointZ(nodePosition, params.heightMeters),
            }
          : item,
      ),
    },
    ok: true,
  };
}

function withEquipmentTerminalEndHeight(
  equipment: WorkbenchEquipment,
  endHeightMeters: number,
): WorkbenchEquipment {
  const terminalConfig = equipment.terminalConfig
    ? {
        ...equipment.terminalConfig,
        connectionHeightMeters: terminalConnectionHeightMetersFromEnd(
          equipment.terminalConfig,
          endHeightMeters,
        ),
        heightSource: "professional_edit" as const,
        heightStatus: "confirmed" as const,
      }
    : null;
  const resolvedEndHeightMeters = terminalConfig
    ? terminalEndHeightMeters(terminalConfig) ?? endHeightMeters
    : endHeightMeters;

  return {
    ...equipment,
    ...(!terminalConfig
      ? { elevation: PROFESSIONAL_CONFIRMED_ELEVATION }
      : {}),
    ...(equipment.bodyPoint
      ? { bodyPoint: withPointZ(equipment.bodyPoint, resolvedEndHeightMeters) }
      : {}),
    connectionPoint: withPointZ(
      equipment.connectionPoint,
      resolvedEndHeightMeters,
    ),
    ...(terminalConfig ? { terminalConfig } : {}),
    ...(equipment.wallAnchor
      ? {
          wallAnchor:
            withEquipmentWallAnchorZ(
              equipment.wallAnchor,
              resolvedEndHeightMeters,
            ) ??
            equipment.wallAnchor,
        }
      : {}),
  };
}

export function sectionRouteHeightTargetKey(
  target: SectionRouteHeightTarget | null | undefined,
) {
  if (!target) {
    return "";
  }

  return target.kind === "node"
    ? `node:${target.nodeId}`
    : `segment-vertex:${target.segmentId}:${target.vertexIndex}`;
}

export function sectionRouteHeightTargetsEqual(
  first: SectionRouteHeightTarget | null | undefined,
  second: SectionRouteHeightTarget | null | undefined,
) {
  return sectionRouteHeightTargetKey(first) === sectionRouteHeightTargetKey(second);
}

function applySegmentVertexHeightEdit(params: {
  equipment: WorkbenchEquipment[];
  heightMeters: number;
  network: ManualRouteNetwork;
  target: Extract<SectionRouteHeightTarget, { kind: "segment_vertex" }>;
}): SectionRouteHeightEditResult {
  const segment =
    params.network.segments.find(
      (candidate) => candidate.id === params.target.segmentId,
    ) ?? null;
  const vertex = segment?.vertices?.[params.target.vertexIndex] ?? null;

  if (!segment || !vertex) {
    return {
      message: "El vertice seleccionado ya no existe en la red.",
      ok: false,
    };
  }

  return {
    equipment: params.equipment,
    network: {
      ...params.network,
      segments: params.network.segments.map((item) =>
        item.id === segment.id
          ? {
              ...item,
              vertexElevations: (item.vertices ?? []).map((_, index) =>
                index === params.target.vertexIndex
                  ? PROFESSIONAL_CONFIRMED_ELEVATION
                  : item.vertexElevations?.[index] ?? null,
              ),
              vertices: (item.vertices ?? []).map((point, index) =>
                index === params.target.vertexIndex
                  ? withPointZ(point, params.heightMeters)
                  : point,
              ),
            }
          : item,
      ),
    },
    ok: true,
  };
}
