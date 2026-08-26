import type {
  PipeAccessoryEquivalentLengthContext,
  PipeDiameterReference,
  PipeSegmentSizingContext,
  PipeSegmentSizingResult,
  PipeSystem,
  PipeSystemResolution,
} from "../../pipeSystem";
import type { RouteAccessoryType } from "../../../routing/types";
import {
  SIGAS_ACCESSORY_EQUIVALENT_LENGTHS,
  SIGAS_DIAMETERS,
  SIGAS_NATURAL_GAS_CAPACITY_TABLE,
  SIGAS_TABLES_SOURCE,
  type SigasAccessoryEquivalentLengthRow,
  type SigasDiameter,
  type SigasNaturalGasCapacityRow,
} from "./sigasData";

const EPSILON = 0.000001;

const DIAMETERS_BY_ID = new Map(
  SIGAS_DIAMETERS.map((diameter) => [diameter.id, diameter]),
);
const ACCESSORIES_BY_CODE = new Map(
  SIGAS_ACCESSORY_EQUIVALENT_LENGTHS.map((row) => [row.code, row]),
);
const ACCESSORY_FAMILY_ROWS_BY_CODE = createAccessoryFamilyRowsByCode();

export const SIGAS_PIPE_SYSTEM: PipeSystem = {
  getAvailableDiameters: () => ({
    explanation:
      "Diametros exteriores/interiores cargados desde la Tabla No 4 de SIGAS.",
    status: "resolved",
    value: SIGAS_DIAMETERS.map(toPipeDiameterReference),
  }),
  identity: {
    id: "sigas-thermofusion",
    name: "Sigas Thermofusion",
  },
  resolveAccessoryEquivalentLength: (
    context: PipeAccessoryEquivalentLengthContext,
  ) =>
    resolveSigasAccessoryEquivalentLength({
      accessoryType: context.accessory.type,
      catalogCode: context.accessory.catalogCode,
      catalogFamilyId: context.accessory.catalogFamilyId,
      diameter: context.pipe?.diameter,
    }),
  sizeSegment: (context: PipeSegmentSizingContext) => {
    if (context.calculationLengthMeters === null) {
      return {
        reason: "Falta longitud de calculo resuelta para dimensionar el tramo.",
        status: "unresolved",
      };
    }

    if (context.accumulatedFlow === null) {
      return {
        reason: "Falta caudal acumulado para dimensionar el tramo.",
        status: "unresolved",
      };
    }

    if (context.accumulatedFlowUnit === null) {
      return {
        reason: "Falta unidad de caudal acumulado para dimensionar el tramo.",
        status: "unresolved",
      };
    }

    if (context.accumulatedFlowUnit !== "m3_h") {
      return {
        reason:
          "La Tabla No 4 de SIGAS esta cargada en m3/h y no se convierte desde otras unidades en esta tanda.",
        status: "unsupported",
      };
    }

    return lookupSigasNaturalGasDiameter({
      flowM3h: context.accumulatedFlow,
      lengthMeters: context.calculationLengthMeters,
    });
  },
};

export function lookupSigasNaturalGasDiameter(params: {
  flowM3h: number;
  lengthMeters: number;
}): PipeSystemResolution<PipeSegmentSizingResult> {
  if (!Number.isFinite(params.lengthMeters) || params.lengthMeters <= 0) {
    return {
      reason: "La longitud de calculo debe ser mayor a cero.",
      status: "unresolved",
    };
  }

  if (!Number.isFinite(params.flowM3h) || params.flowM3h <= 0) {
    return {
      reason: "El caudal requerido debe ser mayor a cero.",
      status: "unresolved",
    };
  }

  const tableRow = findCapacityRowForLength(params.lengthMeters);

  if (!tableRow) {
    const maxLength =
      SIGAS_NATURAL_GAS_CAPACITY_TABLE[
        SIGAS_NATURAL_GAS_CAPACITY_TABLE.length - 1
      ]?.lengthMeters;

    return {
      data: {
        maxTabulatedLengthMeters: maxLength,
        requestedLengthMeters: params.lengthMeters,
        sourceFile: SIGAS_TABLES_SOURCE.fileName,
        sourceTable: SIGAS_TABLES_SOURCE.naturalGasCapacityTable,
      },
      reason: "La longitud de calculo supera el maximo tabulado por SIGAS.",
      status: "unresolved",
    };
  }

  const selectedIndex = tableRow.capacitiesM3h.findIndex(
    (capacity) => capacity + EPSILON >= params.flowM3h,
  );

  if (selectedIndex < 0) {
    return {
      data: {
        maxCapacityM3h:
          tableRow.capacitiesM3h[tableRow.capacitiesM3h.length - 1] ?? null,
        requestedFlowM3h: params.flowM3h,
        requestedLengthMeters: params.lengthMeters,
        sourceFile: SIGAS_TABLES_SOURCE.fileName,
        sourceTable: SIGAS_TABLES_SOURCE.naturalGasCapacityTable,
        tabulatedLengthMeters: tableRow.lengthMeters,
      },
      reason:
        "El caudal requerido supera la capacidad del mayor diametro tabulado.",
      status: "unresolved",
    };
  }

  const selectedDiameter = SIGAS_DIAMETERS[selectedIndex];
  const capacityM3h = tableRow.capacitiesM3h[selectedIndex] as number;
  const explanation =
    `SIGAS selecciona ${selectedDiameter.nominalDiameter} para ` +
    `${params.flowM3h} m3/h usando ${tableRow.lengthMeters} m tabulados.`;

  return {
    explanation,
    status: "resolved",
    value: {
      explanation,
      selectedDiameter: toPipeDiameterReference(selectedDiameter),
      usedData: {
        capacityM3h,
        requestedFlowM3h: params.flowM3h,
        requestedLengthMeters: params.lengthMeters,
        sourceFile: SIGAS_TABLES_SOURCE.fileName,
        sourcePage: SIGAS_TABLES_SOURCE.naturalGasCapacityPage,
        sourceTable: SIGAS_TABLES_SOURCE.naturalGasCapacityTable,
        tabulatedLengthMeters: tableRow.lengthMeters,
      },
    },
  };
}

export function resolveSigasAccessoryEquivalentLength(params: {
  accessoryType: RouteAccessoryType;
  catalogCode?: string;
  catalogFamilyId?: string;
  diameter?: PipeDiameterReference;
}): PipeSystemResolution<number> {
  const diameter = resolveSigasDiameter(params.diameter);

  if (!diameter) {
    return {
      reason:
        "Falta un diametro SIGAS reconocido para resolver la longitud equivalente.",
      status: "unresolved",
    };
  }

  const catalogLookup = params.catalogFamilyId ?? params.catalogCode;

  if (catalogLookup) {
    const rows = findAccessoryRowsForCatalogCode(catalogLookup);

    if (rows.length === 0) {
      return {
        data: {
          catalogCode: params.catalogCode,
          catalogFamilyId: params.catalogFamilyId,
          sourceFile: SIGAS_TABLES_SOURCE.fileName,
          sourceTable: SIGAS_TABLES_SOURCE.accessoryEquivalentLengthTable,
        },
        reason: "El codigo de accesorio no existe en la Tabla No 3 de SIGAS.",
        status: "unsupported",
      };
    }

    const matchingRows = rows.filter((row) =>
      accessoryRowMatchesDiameter(row, diameter),
    );

    if (matchingRows.length === 0) {
      return {
        data: {
          catalogCode: params.catalogCode,
          catalogFamilyId: params.catalogFamilyId,
          pipeDiameterId: diameter.id,
          sourceFile: SIGAS_TABLES_SOURCE.fileName,
          sourceTable: SIGAS_TABLES_SOURCE.accessoryEquivalentLengthTable,
        },
        reason:
          params.catalogFamilyId
            ? "La familia SIGAS confirmada no posee variante compatible con el diametro del tramo."
            : "El accesorio SIGAS indicado no corresponde al diametro del tramo.",
        status: "unsupported",
      };
    }

    if (matchingRows.length > 1) {
      return {
        data: {
          catalogCode: params.catalogCode,
          catalogFamilyId: params.catalogFamilyId,
          matchingRows: matchingRows.map((row) => row.code),
          pipeDiameterId: diameter.id,
          sourceFile: SIGAS_TABLES_SOURCE.fileName,
          sourceTable: SIGAS_TABLES_SOURCE.accessoryEquivalentLengthTable,
        },
        reason: "El codigo de accesorio coincide con mas de una fila SIGAS.",
        status: "unsupported",
      };
    }

    return createResolvedAccessory(
      matchingRows[0] as SigasAccessoryEquivalentLengthRow,
      diameter,
    );
  }

  if (params.accessoryType === "valve") {
    const valveRows = SIGAS_ACCESSORY_EQUIVALENT_LENGTHS.filter(
      (row) =>
        row.genericType === "valve" && accessoryRowMatchesDiameter(row, diameter),
    );

    if (valveRows.length === 1) {
      return createResolvedAccessory(valveRows[0] as SigasAccessoryEquivalentLengthRow, diameter);
    }
  }

  return {
    data: {
      accessoryType: params.accessoryType,
      diameterId: diameter.id,
      externalDiameterMeters: diameter.externalDiameterMillimeters / 1000,
      sourceFile: SIGAS_TABLES_SOURCE.fileName,
      sourceTable: SIGAS_TABLES_SOURCE.accessoryEquivalentLengthTable,
    },
    reason:
      "El tipo generico de accesorio no identifica una fila SIGAS unica; indique catalogCode.",
    status: "unsupported",
  };
}

export function getSigasNaturalGasCapacity(
  lengthMeters: number,
  diameterId: string,
) {
  const row = SIGAS_NATURAL_GAS_CAPACITY_TABLE.find((item) =>
    sameNumber(item.lengthMeters, lengthMeters),
  );
  const diameterIndex = SIGAS_DIAMETERS.findIndex(
    (diameter) => diameter.id === diameterId,
  );

  if (!row || diameterIndex < 0) {
    return null;
  }

  return row.capacitiesM3h[diameterIndex] ?? null;
}

export function getSigasAccessoryEquivalentLengthRow(code: string) {
  return ACCESSORIES_BY_CODE.get(code) ?? null;
}

function findAccessoryRowsForCatalogCode(catalogCode: string) {
  const exactRow = ACCESSORIES_BY_CODE.get(catalogCode);

  if (exactRow) {
    return [exactRow];
  }

  return ACCESSORY_FAMILY_ROWS_BY_CODE.get(catalogCode) ?? [];
}

function createAccessoryFamilyRowsByCode() {
  const map = new Map<string, SigasAccessoryEquivalentLengthRow[]>();

  for (const row of SIGAS_ACCESSORY_EQUIVALENT_LENGTHS) {
    const familyCode = accessoryFamilyCode(row);

    if (!familyCode) {
      continue;
    }

    const current = map.get(familyCode) ?? [];
    current.push(row);
    map.set(familyCode, current);
  }

  return map;
}

function accessoryFamilyCode(row: SigasAccessoryEquivalentLengthRow) {
  if (row.label.startsWith("Union Normal ")) {
    return "union-normal";
  }

  if (row.label.startsWith("Codo Normal a 45 ")) {
    return "codo-normal-a-45";
  }

  if (row.label.startsWith("Codo Normal a 90 ")) {
    return "codo-normal-a-90";
  }

  if (row.label.startsWith("Codo MH a 45 ")) {
    return "codo-mh-a-45";
  }

  if (row.label.startsWith("Codo MH a 90 ")) {
    return "codo-mh-a-90";
  }

  if (row.label.startsWith("Codo 90 con rosca hembra")) {
    return "codo-90-rosca-hembra";
  }

  if (row.label.startsWith("Te Normal ") && row.label.includes("flujo a 90")) {
    return "te-normal-flujo-a-90";
  }

  if (
    row.label.startsWith("Te Normal ") &&
    row.label.includes("flujo a traves")
  ) {
    return "te-normal-flujo-a-traves";
  }

  if (row.label.startsWith("Llave Esferica ")) {
    return "llave-esferica";
  }

  if (row.label.startsWith("Cupla Electrofusion ")) {
    return "cupla-electrofusion";
  }

  if (row.label.startsWith("Curva de Sobrepasaje ")) {
    return "curva-de-sobrepasaje";
  }

  if (row.label.startsWith("Niple corto con tope ")) {
    return "niple-corto-con-tope";
  }

  return null;
}

function findCapacityRowForLength(lengthMeters: number) {
  return (
    SIGAS_NATURAL_GAS_CAPACITY_TABLE.find(
      (row) => row.lengthMeters + EPSILON >= lengthMeters,
    ) ?? null
  );
}

function createResolvedAccessory(
  row: SigasAccessoryEquivalentLengthRow,
  diameter: SigasDiameter,
): PipeSystemResolution<number> {
  return {
    data: createAccessoryData(row, diameter),
    explanation:
      `Longitud equivalente SIGAS ${row.equivalentLengthMeters} m para ${row.label}.`,
    status: "resolved",
    value: row.equivalentLengthMeters,
  };
}

function createAccessoryData(
  row: SigasAccessoryEquivalentLengthRow,
  diameter: SigasDiameter,
) {
  return {
    catalogCode: row.code,
    catalogFamilyId: accessoryFamilyCode(row) ?? row.code,
    equivalentDiameterCount: row.equivalentDiameterCount,
    externalDiameterMeters: row.externalDiameterMeters,
    pipeDiameterId: diameter.id,
    sourceFile: SIGAS_TABLES_SOURCE.fileName,
    sourcePage: row.sourcePage,
    sourceTable: SIGAS_TABLES_SOURCE.accessoryEquivalentLengthTable,
    tableLabel: row.label,
  };
}

function accessoryRowMatchesDiameter(
  row: SigasAccessoryEquivalentLengthRow,
  diameter: SigasDiameter,
) {
  return sameNumber(
    row.externalDiameterMeters,
    diameter.externalDiameterMillimeters / 1000,
  );
}

function resolveSigasDiameter(reference?: PipeDiameterReference) {
  if (!reference) {
    return null;
  }

  const byId = DIAMETERS_BY_ID.get(reference.id);

  if (byId) {
    return byId;
  }

  if (reference.externalDiameterMillimeters !== undefined) {
    const byExternalDiameter = findDiameterByExternalMillimeters(
      reference.externalDiameterMillimeters,
    );

    if (byExternalDiameter) {
      return byExternalDiameter;
    }
  }

  if (reference.internalDiameterMillimeters !== undefined) {
    const byInternalDiameter = SIGAS_DIAMETERS.find((diameter) =>
      sameNumber(
        diameter.internalDiameterMillimeters,
        reference.internalDiameterMillimeters as number,
      ),
    );

    if (byInternalDiameter) {
      return byInternalDiameter;
    }
  }

  const parsedDiameter =
    parseMillimeters(reference.nominalDiameter) ??
    parseMillimeters(reference.label) ??
    parseMillimeters(reference.id);

  return parsedDiameter === null
    ? null
    : findDiameterByExternalMillimeters(parsedDiameter);
}

function findDiameterByExternalMillimeters(externalDiameterMillimeters: number) {
  return (
    SIGAS_DIAMETERS.find((diameter) =>
      sameNumber(
        diameter.externalDiameterMillimeters,
        externalDiameterMillimeters,
      ),
    ) ?? null
  );
}

function toPipeDiameterReference(
  diameter: SigasDiameter,
): PipeDiameterReference {
  return {
    externalDiameterMillimeters: diameter.externalDiameterMillimeters,
    id: diameter.id,
    internalDiameterMillimeters: diameter.internalDiameterMillimeters,
    label: `${diameter.label} (DI ${diameter.internalDiameterMillimeters} mm)`,
    nominalDiameter: diameter.nominalDiameter,
  };
}

function parseMillimeters(value: string | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/(?:^|[^0-9])([0-9]{2,3})(?:\s*mm)?(?:$|[^0-9])/i);

  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);

  return Number.isFinite(parsed) ? parsed : null;
}

function sameNumber(first: number, second: number) {
  return Math.abs(first - second) <= EPSILON;
}
