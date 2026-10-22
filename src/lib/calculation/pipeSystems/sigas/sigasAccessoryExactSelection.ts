import type { PipeDiameterReference } from "@/lib/calculation/pipeSystem";
import type { TechnicalCalculationResult } from "@/lib/calculation/technicalTree";
import type {
  ManualRouteNetwork,
  RouteSegmentAccessory,
} from "@/lib/routing/types";
import { SIGAS_DIAMETERS } from "./sigasData";
import {
  getSigasAccessoryEquivalentLengthRow,
  getSigasAccessoryExactCatalogRows,
  getSigasAccessoryFamilyCatalogRows,
} from "./sigasPipeSystem";

export type SigasAccessoryExactSelectionCandidate = {
  catalogCode: string;
  choiceLabel: string;
  label: string;
};

export type SigasAccessoryExactSelectionDecision = {
  accessoryId: string;
  candidates: SigasAccessoryExactSelectionCandidate[];
  catalogFamilyId: string;
  diameter: PipeDiameterReference;
  fieldLabel: string;
  id: string;
  reason: string;
  segmentId: string;
};

type DiameterBySegmentId =
  | Map<string, PipeDiameterReference | null | undefined>
  | Record<string, PipeDiameterReference | null | undefined>;

export function createSigasAccessoryExactSelectionDecisions(params: {
  diameterBySegmentId: DiameterBySegmentId;
  network: ManualRouteNetwork;
}): SigasAccessoryExactSelectionDecision[] {
  const decisions: SigasAccessoryExactSelectionDecision[] = [];

  for (const segment of params.network.segments) {
    const diameter = indexValue(params.diameterBySegmentId, segment.id);

    if (!diameter) {
      continue;
    }

    for (const accessory of segment.accessories ?? []) {
      const familyId = accessory.catalogFamilyId;

      if (!familyId || accessory.equivalentLengthSource !== "pipe_system") {
        continue;
      }

      const candidates = decisionCandidates(familyId, diameter);
      const selectedCandidate = selectedCandidateForAccessory(
        accessory,
        candidates,
      );

      if (
        selectedCandidate ||
        (familyId !== "codo-90-rosca-hembra" && candidates.length <= 1) ||
        candidates.length === 0
      ) {
        continue;
      }

      decisions.push({
        accessoryId: accessory.id,
        candidates,
        catalogFamilyId: familyId,
        diameter,
        fieldLabel:
          familyId === "codo-90-rosca-hembra"
            ? "Diámetro roscado"
            : "Variante SIGAS",
        id: `${segment.id}:${accessory.id}`,
        reason:
          familyId === "codo-90-rosca-hembra"
            ? "Indicá únicamente el diámetro de la conexión roscada del artefacto."
            : "La familia y el diámetro del tramo no identifican una única fila SIGAS.",
        segmentId: segment.id,
      });
    }
  }

  return decisions.sort(
    (first, second) =>
      first.segmentId.localeCompare(second.segmentId) ||
      first.accessoryId.localeCompare(second.accessoryId),
  );
}

export function createSigasAccessorySelectionDiameterIndex(params: {
  diameterBySegmentId: DiameterBySegmentId;
  result: TechnicalCalculationResult | null;
}) {
  const index = new Map<string, PipeDiameterReference>();

  if (params.diameterBySegmentId instanceof Map) {
    for (const [segmentId, diameter] of params.diameterBySegmentId) {
      if (diameter) {
        index.set(segmentId, diameter);
      }
    }
  } else {
    for (const [segmentId, diameter] of Object.entries(
      params.diameterBySegmentId,
    )) {
      if (diameter) {
        index.set(segmentId, diameter);
      }
    }
  }

  for (const segment of params.result?.segments ?? []) {
    const data =
      segment.dimensioningResolution.status === "resolved"
        ? null
        : segment.dimensioningResolution.data;
    const matchingRows = data?.matchingRows;
    const pipeDiameterId = data?.pipeDiameterId;

    if (
      data?.requiredInformation !== "threaded_connection_diameter" &&
      (!Array.isArray(matchingRows) || matchingRows.length <= 1)
    ) {
      continue;
    }

    if (typeof pipeDiameterId !== "string") {
      continue;
    }

    const diameter = SIGAS_DIAMETERS.find((item) => item.id === pipeDiameterId);

    if (diameter) {
      index.set(segment.segmentId, diameter);
    }
  }

  return index;
}

export function reconcileSigasAccessoryExactCatalogRows(params: {
  diameterBySegmentId: DiameterBySegmentId;
  network: ManualRouteNetwork;
}): ManualRouteNetwork {
  let changed = false;
  const segments = params.network.segments.map((segment) => {
    const diameter = indexValue(params.diameterBySegmentId, segment.id);

    if (!diameter) {
      return segment;
    }

    let segmentChanged = false;
    const accessories = (segment.accessories ?? []).map((accessory) => {
      const familyId = accessory.catalogFamilyId;

      if (!familyId || accessory.equivalentLengthSource !== "pipe_system") {
        return accessory;
      }

      const candidates = exactCandidates(familyId, diameter);
      const selectedCandidate = selectedCandidateForAccessory(
        accessory,
        candidates,
      );

      if (
        familyId === "codo-90-rosca-hembra" &&
        !getSelectedFemaleThread(accessory)
      ) {
        return accessory;
      }

      if (
        (!selectedCandidate && candidates.length !== 1) ||
        (selectedCandidate !== null &&
          selectedCandidate.catalogCode === accessory.catalogCode) ||
        (!selectedCandidate &&
          candidates[0]?.catalogCode === accessory.catalogCode)
      ) {
        return accessory;
      }

      const catalogCode =
        selectedCandidate?.catalogCode ?? candidates[0]?.catalogCode;

      if (!catalogCode) {
        return accessory;
      }

      segmentChanged = true;
      changed = true;
      return {
        ...accessory,
        catalogCode,
      };
    });

    return segmentChanged ? { ...segment, accessories } : segment;
  });

  return changed ? { ...params.network, segments } : params.network;
}

export function selectSigasAccessoryExactCatalogRow(params: {
  accessoryId: string;
  catalogCode: string;
  diameter: PipeDiameterReference;
  network: ManualRouteNetwork;
  segmentId: string;
}):
  | { network: ManualRouteNetwork; ok: true }
  | { message: string; ok: false } {
  const segment = params.network.segments.find(
    (candidate) => candidate.id === params.segmentId,
  );
  const accessory = segment?.accessories?.find(
    (candidate) => candidate.id === params.accessoryId,
  );

  if (!segment || !accessory?.catalogFamilyId) {
    return {
      message: "El accesorio SIGAS ya no existe en el tramo indicado.",
      ok: false,
    };
  }

  const candidate = decisionCandidates(
    accessory.catalogFamilyId,
    params.diameter,
  )
    .find((item) => item.catalogCode === params.catalogCode);

  if (!candidate) {
    return {
      message: "La variante seleccionada no pertenece a la familia SIGAS pendiente.",
      ok: false,
    };
  }

  return {
    network: {
      ...params.network,
      segments: params.network.segments.map((item) =>
        item.id !== segment.id
          ? item
          : {
              ...item,
              accessories: item.accessories?.map((current) =>
                current.id === accessory.id
                  ? withExactCatalogCode(current, candidate.catalogCode)
                  : current,
              ),
            },
      ),
    },
    ok: true,
  };
}

function exactCandidates(
  catalogFamilyId: string,
  diameter: PipeDiameterReference,
): SigasAccessoryExactSelectionCandidate[] {
  return getSigasAccessoryExactCatalogRows({ catalogFamilyId, diameter }).map(
    (row) => ({
      catalogCode: row.catalogCode,
      choiceLabel: exactChoiceLabel(catalogFamilyId, row.label),
      label: row.label,
    }),
  );
}

function decisionCandidates(
  catalogFamilyId: string,
  diameter: PipeDiameterReference,
): SigasAccessoryExactSelectionCandidate[] {
  if (catalogFamilyId !== "codo-90-rosca-hembra") {
    return exactCandidates(catalogFamilyId, diameter);
  }

  const byThread = new Map<string, SigasAccessoryExactSelectionCandidate>();

  for (const row of getSigasAccessoryFamilyCatalogRows(catalogFamilyId)) {
    const choiceLabel = exactChoiceLabel(catalogFamilyId, row.label);

    if (!byThread.has(choiceLabel)) {
      byThread.set(choiceLabel, {
        catalogCode: row.catalogCode,
        choiceLabel,
        label: row.label,
      });
    }
  }

  return [...byThread.values()];
}

function exactChoiceLabel(catalogFamilyId: string, label: string) {
  if (catalogFamilyId === "codo-90-rosca-hembra") {
    const threadedDiameter = label.match(/\bx\s+(.+)$/i)?.[1]?.trim();

    if (threadedDiameter) {
      return threadedDiameter;
    }
  }

  return label;
}

function selectedCandidateForAccessory(
  accessory: RouteSegmentAccessory,
  candidates: SigasAccessoryExactSelectionCandidate[],
) {
  const direct = candidates.find(
    (candidate) => candidate.catalogCode === accessory.catalogCode,
  );

  if (direct || accessory.catalogFamilyId !== "codo-90-rosca-hembra") {
    return direct ?? null;
  }

  const selectedThread = getSelectedFemaleThread(accessory);

  if (!selectedThread) {
    return null;
  }

  const matching = candidates.filter(
    (candidate) => candidate.choiceLabel === selectedThread,
  );

  return matching.length === 1 ? matching[0] ?? null : null;
}

function getSelectedFemaleThread(accessory: RouteSegmentAccessory) {
  const selectedRow = accessory.catalogCode
    ? getSigasAccessoryEquivalentLengthRow(accessory.catalogCode)
    : null;

  return selectedRow && accessory.catalogFamilyId
    ? exactChoiceLabel(accessory.catalogFamilyId, selectedRow.label)
    : null;
}

function withExactCatalogCode(
  accessory: RouteSegmentAccessory,
  catalogCode: string,
): RouteSegmentAccessory {
  return {
    ...accessory,
    catalogCode,
  };
}

function indexValue(
  index: DiameterBySegmentId,
  segmentId: string,
): PipeDiameterReference | null {
  if (index instanceof Map) {
    return index.get(segmentId) ?? null;
  }

  return index[segmentId] ?? null;
}
