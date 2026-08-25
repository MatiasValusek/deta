import {
  getSigasAccessoryEquivalentLengthRow,
  getSigasNaturalGasCapacity,
  lookupSigasNaturalGasDiameter,
  resolveSigasAccessoryEquivalentLength,
} from "./sigasPipeSystem";
import {
  SIGAS_ACCESSORY_EQUIVALENT_LENGTHS,
  SIGAS_DIAMETERS,
  SIGAS_NATURAL_GAS_CAPACITY_TABLE,
} from "./sigasData";

export type SigasVerificationResult = {
  name: string;
  status: "passed";
};

export function runSigasPipeSystemVerifications() {
  const results: SigasVerificationResult[] = [];

  verify(results, "Caso A - coincidencia exacta", () => {
    const sizing = assertResolved(
      lookupSigasNaturalGasDiameter({ flowM3h: 3.5, lengthMeters: 10 }),
    );

    assertEqual(sizing.selectedDiameter.id, "sigas-25");
    assertEqual(sizing.usedData?.tabulatedLengthMeters, 10);
    assertEqual(sizing.usedData?.capacityM3h, 3.914);
  });

  verify(results, "Caso B - longitud intermedia", () => {
    const sizing = assertResolved(
      lookupSigasNaturalGasDiameter({ flowM3h: 3.573, lengthMeters: 10.7 }),
    );

    assertEqual(sizing.selectedDiameter.id, "sigas-25");
    assertEqual(sizing.usedData?.tabulatedLengthMeters, 12);
    assertEqual(sizing.usedData?.capacityM3h, 3.573);
  });

  verify(results, "Caso C - frontera de capacidad", () => {
    const sizing = assertResolved(
      lookupSigasNaturalGasDiameter({ flowM3h: 5.594, lengthMeters: 1 }),
    );

    assertEqual(sizing.selectedDiameter.id, "sigas-20");
    assertEqual(sizing.usedData?.capacityM3h, 5.594);
  });

  verify(results, "Caso D - diametro insuficiente", () => {
    const sizing = assertResolved(
      lookupSigasNaturalGasDiameter({ flowM3h: 0.792, lengthMeters: 50 }),
    );

    assertEqual(sizing.selectedDiameter.id, "sigas-25");
    assertEqual(sizing.usedData?.capacityM3h, 1.75);
  });

  verify(results, "Caso E - fuera de longitud maxima", () => {
    const resolution = lookupSigasNaturalGasDiameter({
      flowM3h: 1,
      lengthMeters: 201,
    });

    assertEqual(resolution.status, "unresolved");
  });

  verify(results, "Caso F - caudal demasiado grande", () => {
    const resolution = lookupSigasNaturalGasDiameter({
      flowM3h: 752,
      lengthMeters: 1,
    });

    assertEqual(resolution.status, "unresolved");
  });

  verify(results, "Caso G - accesorio SIGAS reconocido", () => {
    const resolution = assertResolved(
      resolveSigasAccessoryEquivalentLength({
        accessoryType: "elbow",
        catalogCode: "codo-normal-a-90-20-mm",
        diameter: { id: "sigas-20", label: "Sigas 20 mm" },
      }),
    );

    assertEqual(resolution, 0.953);
  });

  verify(results, "Caso H - accesorio ambiguo no soportado", () => {
    const resolution = resolveSigasAccessoryEquivalentLength({
      accessoryType: "elbow",
      diameter: { id: "sigas-20", label: "Sigas 20 mm" },
    });

    assertEqual(resolution.status, "unsupported");
  });

  verify(results, "Transcripcion - dimensiones y conteos", () => {
    assertEqual(SIGAS_DIAMETERS.length, 9);
    assertEqual(SIGAS_NATURAL_GAS_CAPACITY_TABLE.length, 60);
    assertEqual(SIGAS_ACCESSORY_EQUIVALENT_LENGTHS.length, 179);
    assertNoDuplicateCodes();
  });

  verify(results, "Transcripcion - Tabla No 4", () => {
    assertEqual(getSigasNaturalGasCapacity(1, "sigas-20"), 5.594);
    assertEqual(getSigasNaturalGasCapacity(50, "sigas-63"), 27.624);
    assertEqual(getSigasNaturalGasCapacity(200, "sigas-110"), 53.129);
  });

  verify(results, "Transcripcion - Tabla No 3", () => {
    assertEqual(
      getSigasAccessoryEquivalentLengthRow("union-normal-20-mm")
        ?.equivalentLengthMeters,
      0.369,
    );
    assertEqual(
      getSigasAccessoryEquivalentLengthRow("codo-normal-a-90-110-mm")
        ?.equivalentLengthMeters,
      2.115,
    );
    assertEqual(
      getSigasAccessoryEquivalentLengthRow(
        "te-reduc-central-75-x-63-flujo-a-traves",
      )?.equivalentLengthMeters,
      0.297,
    );
    assertEqual(
      getSigasAccessoryEquivalentLengthRow("reductor-anular-75-32")
        ?.equivalentLengthMeters,
      0.78698,
    );
  });

  return results;
}

function verify(
  results: SigasVerificationResult[],
  name: string,
  check: () => void,
) {
  check();
  results.push({ name, status: "passed" });
}

function assertResolved<T>(resolution: { status: string; value?: T }) {
  assert(
    resolution.status === "resolved",
    `Expected resolved, got ${resolution.status}`,
  );

  return resolution.value as T;
}

function assertEqual(actual: unknown, expected: unknown) {
  assert(
    actual === expected,
    `Expected ${String(expected)}, got ${String(actual)}`,
  );
}

function assertNoDuplicateCodes() {
  const codes = new Set<string>();

  for (const row of SIGAS_ACCESSORY_EQUIVALENT_LENGTHS) {
    assert(!codes.has(row.code), `Duplicate accessory code ${row.code}`);
    codes.add(row.code);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

declare const require: { main: unknown } | undefined;
declare const module: unknown;

if (typeof require !== "undefined" && require.main === module) {
  console.log(JSON.stringify(runSigasPipeSystemVerifications(), null, 2));
}
