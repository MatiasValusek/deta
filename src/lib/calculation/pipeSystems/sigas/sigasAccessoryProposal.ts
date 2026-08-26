import type {
  AccessoryProposal,
  AccessoryProposalSystemMatch,
} from "@/lib/routing/routeAccessoryProposals";
import {
  SIGAS_ACCESSORY_EQUIVALENT_LENGTHS,
  type SigasAccessoryEquivalentLengthRow,
} from "./sigasData";

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
