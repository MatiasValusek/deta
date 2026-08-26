import type {
  AccessoryProposal,
  AccessoryProposalDiameterBySegmentId,
  AccessoryProposalOwnerResolution,
  AccessoryProposalSystemMatch,
} from "@/lib/routing/routeAccessoryProposals";
import type {
  AccessoryCatalogCandidate,
  AccessoryCatalogCandidateStatus,
} from "@/lib/calculation/accessoryCatalogCandidates";
import type { DiameterTransitionProposal } from "@/lib/calculation/diameterTransitionProposals";
import {
  SIGAS_ACCESSORY_EQUIVALENT_LENGTHS,
  SIGAS_DIAMETERS,
  type SigasAccessoryEquivalentLengthRow,
} from "./sigasData";

const SIGAS_PIPE_SYSTEM_IDENTITY = {
  id: "sigas-thermofusion",
  name: "Sigas Thermofusion",
};

type SigasAccessoryFamily = {
  angleFamily?: "45" | "90";
  familyId: string;
  label: string;
  rows: SigasAccessoryEquivalentLengthRow[];
  type: "elbow" | "tee";
};

type SigasTransitionFamily = {
  familyId: string;
  label: string;
  rows: SigasAccessoryEquivalentLengthRow[];
  transitionKind: "inline_reduction" | "reduced_tee";
  type: "other" | "tee";
};

type TransitionDiameterPair = {
  largerExternalMillimeters: number;
  smallerExternalMillimeters: number;
};

export function matchSigasAccessoryProposal(
  proposal: AccessoryProposal,
): AccessoryProposalSystemMatch {
  if (proposal.kind === "elbow") {
    const angle = proposal.evidence.angleDegrees;
    const angleFamily = sigasElbowAngleFamily(angle);

    if (!angleFamily) {
      return {
        compatibleFamilyKeys: [],
        domainAccessory: {
          equivalentLengthSource: "unresolved",
          reason: "El angulo del codo no coincide con una familia SIGAS cargada.",
          type: "elbow",
        },
        reason: "El angulo del codo no coincide con una familia SIGAS cargada.",
        status: "unsupported",
      };
    }

    return matchFamilySet({
      fallbackReason:
        "La geometria detecta codo, pero SIGAS contiene varias familias compatibles.",
      familyKeys: uniqueFamilyKeys(
        SIGAS_ACCESSORY_EQUIVALENT_LENGTHS.filter(
          (row) =>
            row.genericType === "elbow" &&
            familyKeyForSigasAccessory(row)?.includes(angleFamily),
        ),
      ),
      type: "elbow",
    });
  }

  if (proposal.kind === "tee") {
    return matchFamilySet({
      fallbackReason:
        "La geometria detecta tee, pero falta confirmar flujo a 90/a traves y posibles reducciones.",
      familyKeys: uniqueFamilyKeys(
        SIGAS_ACCESSORY_EQUIVALENT_LENGTHS.filter(
          (row) => row.genericType === "tee",
        ),
      ),
      type: "tee",
    });
  }

  return {
    compatibleFamilyKeys: [],
    reason: "La propuesta no corresponde a una familia SIGAS automatizable.",
    status: "unsupported",
  };
}

export function getSigasAccessoryCatalogCandidates(params: {
  diameterBySegmentId?: AccessoryProposalDiameterBySegmentId;
  hasManualAccessory?: boolean;
  ownerResolution: AccessoryProposalOwnerResolution;
  proposal: AccessoryProposal;
}): AccessoryCatalogCandidate[] {
  const families = sigasAccessoryFamiliesForProposal(params.proposal);

  return families.map((family) =>
    createSigasCandidate({
      diameterBySegmentId: params.diameterBySegmentId,
      family,
      hasManualAccessory: params.hasManualAccessory ?? false,
      ownerResolution: params.ownerResolution,
    }),
  );
}

export function getSigasDiameterTransitionCatalogCandidates(
  proposal: DiameterTransitionProposal,
): AccessoryCatalogCandidate[] {
  const pair = transitionDiameterPairForProposal(proposal);

  if (!pair) {
    return [];
  }

  return sigasTransitionFamiliesForProposal(proposal)
    .filter((family) => transitionFamilyHasPair(family, pair))
    .map((family) =>
      createSigasDiameterTransitionCandidate({
        family,
        pair,
        proposal,
      }),
    );
}

function matchFamilySet(params: {
  fallbackReason: string;
  familyKeys: string[];
  type: "elbow" | "tee";
}): AccessoryProposalSystemMatch {
  if (params.familyKeys.length === 0) {
    return {
      compatibleFamilyKeys: [],
      domainAccessory: {
        equivalentLengthSource: "unresolved",
        reason: "No hay familia SIGAS compatible cargada.",
        type: params.type,
      },
      reason: "No hay familia SIGAS compatible cargada.",
      status: "unsupported",
    };
  }

  if (params.familyKeys.length === 1) {
    const [catalogCode] = params.familyKeys;

    return {
      compatibleFamilyKeys: params.familyKeys,
      domainAccessory: {
        catalogCode,
        equivalentLengthSource: "pipe_system",
        type: params.type,
      },
      reason: "Familia SIGAS compatible unica.",
      status: "resolved",
      suggestedCatalogCode: catalogCode,
    };
  }

  return {
    compatibleFamilyKeys: params.familyKeys,
    domainAccessory: {
      equivalentLengthSource: "unresolved",
      reason: params.fallbackReason,
      type: params.type,
    },
    reason: params.fallbackReason,
    status: "needs_review",
  };
}

function sigasElbowAngleFamily(angleDegrees: number | undefined) {
  if (angleDegrees === undefined) {
    return null;
  }

  const turnAngle = Math.min(angleDegrees, 180 - angleDegrees);

  if (Math.abs(turnAngle - 90) <= 5) {
    return "90";
  }

  if (Math.abs(turnAngle - 45) <= 5) {
    return "45";
  }

  return null;
}

function sigasAccessoryFamiliesForProposal(
  proposal: AccessoryProposal,
): SigasAccessoryFamily[] {
  const families = createSigasAccessoryFamilies();

  if (proposal.kind === "elbow") {
    const angleFamily = sigasElbowAngleFamily(proposal.evidence.angleDegrees);

    if (!angleFamily) {
      return [];
    }

    return families.filter(
      (family) =>
        family.type === "elbow" && family.angleFamily === angleFamily,
    );
  }

  if (proposal.kind === "tee") {
    return families.filter((family) => family.type === "tee");
  }

  return [];
}

function createSigasCandidate(params: {
  diameterBySegmentId?: AccessoryProposalDiameterBySegmentId;
  family: SigasAccessoryFamily;
  hasManualAccessory: boolean;
  ownerResolution: AccessoryProposalOwnerResolution;
}): AccessoryCatalogCandidate {
  const compatibleDiameterIds = compatibleDiameterIdsForFamily(params.family);
  const ownerDiameter =
    params.ownerResolution.status === "unambiguous"
      ? getDiameter(params.diameterBySegmentId, params.ownerResolution.ownerSegmentId)
      : null;
  const status = candidateStatus({
    compatibleDiameterIds,
    family: params.family,
    hasManualAccessory: params.hasManualAccessory,
    ownerDiameter,
    ownerResolution: params.ownerResolution,
  });
  const reason = candidateReason({
    compatibleDiameterIds,
    family: params.family,
    hasManualAccessory: params.hasManualAccessory,
    ownerDiameter,
    ownerResolution: params.ownerResolution,
    status,
  });

  return {
    compatibleDiameterIds,
    diameterCompatibility: status,
    familyId: params.family.familyId,
    geometryCompatibility: "compatible",
    id: `${SIGAS_PIPE_SYSTEM_IDENTITY.id}:${params.family.familyId}`,
    label: params.family.label,
    originalLabels: params.family.rows.map((row) => row.label).sort(),
    pipeSystem: SIGAS_PIPE_SYSTEM_IDENTITY,
    reason,
    requiredInformation:
      status === "compatible" ? [] : [reason],
    status,
    type: params.family.type,
  };
}

function candidateStatus(params: {
  compatibleDiameterIds: string[];
  family: SigasAccessoryFamily;
  hasManualAccessory: boolean;
  ownerDiameter: { id: string } | null;
  ownerResolution: AccessoryProposalOwnerResolution;
}): AccessoryCatalogCandidateStatus {
  if (params.hasManualAccessory) {
    return "requires_more_information";
  }

  if (params.ownerResolution.status !== "unambiguous") {
    return "requires_more_information";
  }

  if (!params.ownerDiameter) {
    return "requires_more_information";
  }

  return params.compatibleDiameterIds.includes(params.ownerDiameter.id)
    ? "compatible"
    : "incompatible";
}

function candidateReason(params: {
  compatibleDiameterIds: string[];
  family: SigasAccessoryFamily;
  hasManualAccessory: boolean;
  ownerDiameter: { id: string; label?: string } | null;
  ownerResolution: AccessoryProposalOwnerResolution;
  status: AccessoryCatalogCandidateStatus;
}) {
  if (params.hasManualAccessory) {
    return "Ya existe un accesorio manual compatible en un tramo incidente.";
  }

  if (params.ownerResolution.status !== "unambiguous") {
    return params.ownerResolution.reason;
  }

  if (!params.ownerDiameter) {
    return "Falta diametro calculado para evaluar la familia.";
  }

  if (params.status === "incompatible") {
    return `La familia ${params.family.label} no posee variante compatible con ${params.ownerDiameter.label ?? params.ownerDiameter.id}.`;
  }

  return `Compatible con ${params.ownerDiameter.label ?? params.ownerDiameter.id}.`;
}

function compatibleDiameterIdsForFamily(family: SigasAccessoryFamily) {
  const externalMeters = new Set(
    family.rows.map((row) => row.externalDiameterMeters),
  );

  return SIGAS_DIAMETERS.filter((diameter) =>
    externalMeters.has(diameter.externalDiameterMillimeters / 1000),
  ).map((diameter) => diameter.id);
}

function getDiameter(
  diameterBySegmentId: AccessoryProposalDiameterBySegmentId | undefined,
  segmentId: string,
) {
  if (!diameterBySegmentId) {
    return null;
  }

  return diameterBySegmentId instanceof Map
    ? diameterBySegmentId.get(segmentId) ?? null
    : diameterBySegmentId[segmentId] ?? null;
}

function createSigasDiameterTransitionCandidate(params: {
  family: SigasTransitionFamily;
  pair: TransitionDiameterPair;
  proposal: DiameterTransitionProposal;
}): AccessoryCatalogCandidate {
  const status = transitionCandidateStatus(params.proposal);
  const reason = transitionCandidateReason({
    family: params.family,
    pair: params.pair,
    proposal: params.proposal,
    status,
  });

  return {
    compatibleDiameterIds: transitionFamilyCompatibleDiameterIds(params.family),
    diameterCompatibility: status,
    familyId: params.family.familyId,
    geometryCompatibility: "compatible",
    id: `${SIGAS_PIPE_SYSTEM_IDENTITY.id}:${params.family.familyId}`,
    label: params.family.label,
    originalLabels: params.family.rows.map((row) => row.label).sort(),
    pipeSystem: SIGAS_PIPE_SYSTEM_IDENTITY,
    reason,
    requiredInformation: status === "compatible" ? [] : [reason],
    status,
    type: params.family.type,
  };
}

function transitionCandidateStatus(
  proposal: DiameterTransitionProposal,
): AccessoryCatalogCandidateStatus {
  if (proposal.state === "unresolved") {
    return "requires_more_information";
  }

  if (proposal.state === "unsupported") {
    return "incompatible";
  }

  if (
    proposal.kind === "simple_transition" &&
    proposal.direction === "expanding"
  ) {
    return "requires_more_information";
  }

  if (proposal.direction === "unknown") {
    return "requires_more_information";
  }

  return "compatible";
}

function transitionCandidateReason(params: {
  family: SigasTransitionFamily;
  pair: TransitionDiameterPair;
  proposal: DiameterTransitionProposal;
  status: AccessoryCatalogCandidateStatus;
}) {
  const pairLabel = `${params.pair.largerExternalMillimeters} a ${params.pair.smallerExternalMillimeters} mm`;

  if (params.status === "requires_more_information") {
    if (params.proposal.kind === "simple_transition") {
      return `La Tabla No 3 contiene ${params.family.label} para ${pairLabel}, pero el sentido actual es expansivo y requiere confirmacion profesional.`;
    }

    return `La Tabla No 3 contiene ${params.family.label} para ${pairLabel}, pero falta confirmar orientacion hidraulica.`;
  }

  if (params.status === "incompatible") {
    return `La familia ${params.family.label} no aplica a esta configuracion de transicion.`;
  }

  return `Compatible con transicion ${pairLabel} segun Tabla No 3 SIGAS.`;
}

function sigasTransitionFamiliesForProposal(
  proposal: DiameterTransitionProposal,
) {
  const families = createSigasTransitionFamilies();

  if (
    proposal.kind === "simple_reduction" ||
    proposal.kind === "simple_transition"
  ) {
    return families.filter(
      (family) => family.transitionKind === "inline_reduction",
    );
  }

  if (proposal.kind === "branch_transition") {
    return families.filter(
      (family) => family.transitionKind === "reduced_tee",
    );
  }

  return [];
}

function createSigasTransitionFamilies() {
  const byFamily = new Map<string, SigasTransitionFamily>();

  for (const row of SIGAS_ACCESSORY_EQUIVALENT_LENGTHS) {
    const family = sigasTransitionFamilyForRow(row);

    if (!family) {
      continue;
    }

    const current = byFamily.get(family.familyId);

    if (!current) {
      byFamily.set(family.familyId, family);
      continue;
    }

    current.rows.push(row);
  }

  return [...byFamily.values()].sort((first, second) =>
    first.label.localeCompare(second.label),
  );
}

function sigasTransitionFamilyForRow(
  row: SigasAccessoryEquivalentLengthRow,
): SigasTransitionFamily | null {
  const label = normalizeLabel(row.label);

  if (label.startsWith("cupla reduccion hh")) {
    return transitionFamily(
      "cupla-reduccion-hh",
      "Cupla Reduccion HH",
      "inline_reduction",
      "other",
      row,
    );
  }

  if (label.startsWith("buje reduccion mh")) {
    return transitionFamily(
      "buje-reduccion-mh",
      "Buje Reduccion MH",
      "inline_reduction",
      "other",
      row,
    );
  }

  if (label.startsWith("reductor anular")) {
    return transitionFamily(
      "reductor-anular",
      "Reductor Anular",
      "inline_reduction",
      "other",
      row,
    );
  }

  if (label.startsWith("te reduc. central") && label.includes("flujo a 90")) {
    return transitionFamily(
      "te-reduc-central-flujo-a-90",
      "Te Reduc. Central, flujo a 90",
      "reduced_tee",
      "tee",
      row,
    );
  }

  if (
    label.startsWith("te reduc. central") &&
    label.includes("flujo a traves")
  ) {
    return transitionFamily(
      "te-reduc-central-flujo-a-traves",
      "Te Reduc. Central, flujo a traves",
      "reduced_tee",
      "tee",
      row,
    );
  }

  return null;
}

function transitionFamily(
  familyId: string,
  label: string,
  transitionKind: SigasTransitionFamily["transitionKind"],
  type: SigasTransitionFamily["type"],
  row: SigasAccessoryEquivalentLengthRow,
): SigasTransitionFamily {
  return {
    familyId,
    label,
    rows: [row],
    transitionKind,
    type,
  };
}

function transitionFamilyHasPair(
  family: SigasTransitionFamily,
  pair: TransitionDiameterPair,
) {
  return family.rows.some((row) => {
    const rowPair = transitionPairForRow(row);

    return (
      rowPair !== null &&
      rowPair.largerExternalMillimeters === pair.largerExternalMillimeters &&
      rowPair.smallerExternalMillimeters === pair.smallerExternalMillimeters
    );
  });
}

function transitionFamilyCompatibleDiameterIds(family: SigasTransitionFamily) {
  const externalMillimeters = new Set<number>();

  for (const row of family.rows) {
    const pair = transitionPairForRow(row);

    if (!pair) {
      continue;
    }

    externalMillimeters.add(pair.largerExternalMillimeters);
    externalMillimeters.add(pair.smallerExternalMillimeters);
  }

  return SIGAS_DIAMETERS.filter((diameter) =>
    externalMillimeters.has(diameter.externalDiameterMillimeters),
  ).map((diameter) => diameter.id);
}

function transitionDiameterPairForProposal(
  proposal: DiameterTransitionProposal,
): TransitionDiameterPair | null {
  const values = proposal.incidentSegments
    .map((segment) => transitionDiameterMillimeters(segment.diameter))
    .filter((value): value is number => value !== null);

  if (values.length !== proposal.incidentSegments.length) {
    return null;
  }

  const uniqueValues = [...new Set(values)].sort((first, second) => first - second);

  if (uniqueValues.length !== 2) {
    return null;
  }

  return {
    largerExternalMillimeters: uniqueValues[1] as number,
    smallerExternalMillimeters: uniqueValues[0] as number,
  };
}

function transitionPairForRow(
  row: SigasAccessoryEquivalentLengthRow,
): TransitionDiameterPair | null {
  const label = normalizeLabel(row.label);
  const match = label.match(/(\d{2,3})\s*(?:a|x|-)\s*(\d{2,3})/);

  if (!match) {
    return null;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  return {
    largerExternalMillimeters: Math.max(first, second),
    smallerExternalMillimeters: Math.min(first, second),
  };
}

function transitionDiameterMillimeters(
  diameter: { externalDiameterMillimeters?: number; label: string; id: string } | null,
) {
  if (!diameter) {
    return null;
  }

  if (
    diameter.externalDiameterMillimeters !== undefined &&
    Number.isFinite(diameter.externalDiameterMillimeters)
  ) {
    return diameter.externalDiameterMillimeters;
  }

  return parseMillimeters(diameter.label) ?? parseMillimeters(diameter.id);
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

function createSigasAccessoryFamilies() {
  const byFamily = new Map<string, SigasAccessoryFamily>();

  for (const row of SIGAS_ACCESSORY_EQUIVALENT_LENGTHS) {
    const family = sigasAccessoryFamilyForRow(row);

    if (!family) {
      continue;
    }

    const current = byFamily.get(family.familyId) ?? family;
    current.rows.push(row);
    byFamily.set(family.familyId, current);
  }

  return [...byFamily.values()].sort((first, second) =>
    first.label.localeCompare(second.label),
  );
}

function sigasAccessoryFamilyForRow(
  row: SigasAccessoryEquivalentLengthRow,
): SigasAccessoryFamily | null {
  const familyId = familyKeyForSigasAccessory(row);

  if (!familyId) {
    return null;
  }

  if (familyId === "codo-normal-a-45") {
    return family("codo-normal-a-45", "Codo Normal a 45", "elbow", row, "45");
  }

  if (familyId === "codo-normal-a-90") {
    return family("codo-normal-a-90", "Codo Normal a 90", "elbow", row, "90");
  }

  if (familyId === "codo-mh-a-45") {
    return family("codo-mh-a-45", "Codo MH a 45", "elbow", row, "45");
  }

  if (familyId === "codo-mh-a-90") {
    return family("codo-mh-a-90", "Codo MH a 90", "elbow", row, "90");
  }

  if (familyId === "codo-90-rosca-hembra") {
    return family(
      "codo-90-rosca-hembra",
      "Codo 90 con rosca hembra",
      "elbow",
      row,
      "90",
    );
  }

  if (familyId === "te-normal-flujo-a-90") {
    return family(
      "te-normal-flujo-a-90",
      "Te Normal, flujo a 90",
      "tee",
      row,
    );
  }

  if (familyId === "te-normal-flujo-a-traves") {
    return family(
      "te-normal-flujo-a-traves",
      "Te Normal, flujo a traves",
      "tee",
      row,
    );
  }

  return null;
}

function family(
  familyId: string,
  label: string,
  type: "elbow" | "tee",
  row: SigasAccessoryEquivalentLengthRow,
  angleFamily?: "45" | "90",
): SigasAccessoryFamily {
  return {
    angleFamily,
    familyId,
    label,
    rows: [row],
    type,
  };
}

function uniqueFamilyKeys(rows: SigasAccessoryEquivalentLengthRow[]) {
  return [...new Set(rows.map(familyKeyForSigasAccessory).filter(Boolean))]
    .sort() as string[];
}

function familyKeyForSigasAccessory(row: SigasAccessoryEquivalentLengthRow) {
  const label = normalizeLabel(row.label);

  if (label.startsWith("codo normal a 45")) {
    return "codo-normal-a-45";
  }

  if (label.startsWith("codo normal a 90")) {
    return "codo-normal-a-90";
  }

  if (label.startsWith("codo mh a 45")) {
    return "codo-mh-a-45";
  }

  if (label.startsWith("codo mh a 90")) {
    return "codo-mh-a-90";
  }

  if (label.startsWith("codo 90 con rosca hembra")) {
    return "codo-90-rosca-hembra";
  }

  if (label.startsWith("te normal") && label.includes("flujo a 90")) {
    return "te-normal-flujo-a-90";
  }

  if (label.startsWith("te normal") && label.includes("flujo a traves")) {
    return "te-normal-flujo-a-traves";
  }

  if (label.startsWith("te reduc. central") && label.includes("flujo a 90")) {
    return "te-reduc-central-flujo-a-90";
  }

  if (
    label.startsWith("te reduc. central") &&
    label.includes("flujo a traves")
  ) {
    return "te-reduc-central-flujo-a-traves";
  }

  return null;
}

function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}
