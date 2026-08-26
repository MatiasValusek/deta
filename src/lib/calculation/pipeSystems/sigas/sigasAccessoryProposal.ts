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
