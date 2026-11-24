import { importDxf } from "@/lib/dxf/importDxf";
import { createSuggestedEquipmentTerminalConfig } from "@/lib/equipment/terminalConfig";
import type { EquipmentType, WorkbenchEquipment } from "@/lib/equipment/types";
import type { Point2D } from "@/lib/geometry/types";
import type { DatosInstalador, DatosObra } from "@/lib/obra/obraData";
import { INSTALADOR_STORAGE_KEY, OBRA_STORAGE_KEY } from "@/lib/obra/obraStore";
import type { AccessoryProposalDecision } from "@/lib/routing/routeAccessoryProposals";
import type { ManualRouteNetwork, RouteSegment } from "@/lib/routing/types";
import {
  createPersistedWorkbenchProject,
  WORKBENCH_PROJECT_STORAGE_KEY,
  type PersistedWorkbenchProject,
} from "./persistence";

/*
 * Obra de ejemplo con datos inventados, para abrir la lámina A3 sin cargar todo a mano.
 * Casa de 10 × 8 m dibujada en mm. Medidor en el frente, tres derivaciones (A, B, C)
 * y cuatro artefactos; el calefactor del dormitorio es la boca taponada.
 */

const BASE_ID = "obra-ejemplo-planta";
const ARCHIVO = "obra-ejemplo.dxf";

export const OBRA_EJEMPLO: DatosObra = {
  propietario: "Juan Ejemplo",
  calle: "Calle Falsa",
  numero: "123",
  entreCalle1: "Calle Uno",
  entreCalle2: "Calle Dos",
  localidad: "Pueblo Ejemplo",
  partido: "Partido Ejemplo",
  calleContrafrente: "Calle Tres",
  distanciaEsquina1: "30,50",
  distanciaEsquina2: "56,20",
  norteGrados: "315",
};

export const INSTALADOR_EJEMPLO: DatosInstalador = {
  nombre: "Instalador Ejemplo",
  matricula: "00000",
  categoria: "1",
};

type Linea = [number, number, number, number];

/** Paredes (en mm): contorno, tabique living/cocina, baño y dormitorio. */
const PAREDES: Linea[] = [
  [0, 0, 10000, 0],
  [10000, 0, 10000, 8000],
  [10000, 8000, 0, 8000],
  [0, 8000, 0, 0],
  [5000, 0, 5000, 2200],
  [5000, 3800, 5000, 8000],
  [5000, 5000, 8000, 5000],
  [8000, 5000, 8000, 8000],
];

const TEXTOS: Array<[string, number, number]> = [
  ["Living / Comedor", 1200, 5500],
  ["Cocina", 6000, 6500],
  ["Lavadero", 8400, 6500],
  ["Dormitorio", 6800, 2000],
  ["Vereda", 4000, -900],
];

function dxfEjemplo() {
  const grupos: Array<string | number> = [
    0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 4, 0, "ENDSEC",
    0, "SECTION", 2, "ENTITIES",
  ];

  for (const [x1, y1, x2, y2] of PAREDES) {
    grupos.push(0, "LINE", 8, "PAREDES", 10, x1, 20, y1, 30, 0, 11, x2, 21, y2, 31, 0);
  }

  for (const [texto, x, y] of TEXTOS) {
    grupos.push(0, "TEXT", 8, "TEXTOS", 10, x, 20, y, 30, 0, 40, 250, 1, texto);
  }

  grupos.push(0, "ENDSEC", 0, "EOF");
  return grupos.join("\n");
}

function artefacto(
  id: string,
  type: EquipmentType,
  name: string,
  connectionPoint: Point2D,
  kcalPorHora?: number,
  notes?: string,
): WorkbenchEquipment {
  const esMedidor = type === "meter_regulator";

  return {
    connectionPoint,
    id,
    name,
    planBaseId: BASE_ID,
    role: esMedidor ? "supply" : "appliance",
    source: "manual",
    type,
    ...(esMedidor
      ? {}
      : {
          demandUnit: "kcal_h" as const,
          demandValue: kcalPorHora,
          terminalConfig: createSuggestedEquipmentTerminalConfig(type),
        }),
    ...(notes ? { notes } : {}),
  };
}

export const ARTEFACTOS_EJEMPLO: WorkbenchEquipment[] = [
  artefacto("ej-medidor", "meter_regulator", "Medidor", { x: 1000, y: 200 }),
  artefacto("ej-estufa", "space_heater", "Estufa", { x: 200, y: 3000 }, 3000),
  artefacto("ej-cocina", "stove", "Cocina", { x: 6000, y: 7700 }, 9000),
  artefacto("ej-calefon", "instant_water_heater", "Calefón", { x: 9000, y: 7700 }, 20000),
  artefacto("ej-calefactor", "space_heater", "Calefactor", { x: 9800, y: 3000 }, 3000, "Boca taponada"),
];

/** Tes ya confirmadas en cada derivación (A, B y C), como las deja el paso Calcular. */
const TES: Array<{ nodo: string; hash: string; tramo: string; geometryKey: string }> = [
  { nodo: "n-a", hash: "66oae3", tramo: "t-medidor-a", geometryKey: "n-a|tee|1000,3000|t-a-b,t-a-estufa,t-medidor-a|n-b,n-estufa,n-medidor||branch" },
  { nodo: "n-b", hash: "nhqoco", tramo: "t-a-b", geometryKey: "n-b|tee|6000,3000|t-a-b,t-b-c,t-b-cocina|n-a,n-c,n-cocina||branch" },
  { nodo: "n-c", hash: "rs45qj", tramo: "t-b-c", geometryKey: "n-c|tee|9000,3000|t-b-c,t-c-calefactor,t-c-calefon|n-b,n-calefactor,n-calefon||branch" },
];
const FAMILIA_TE = "te-normal-flujo-a-90";
const propuestaTe = (te: (typeof TES)[number]) => `accessory-proposal:${te.nodo}:tee:${te.hash}`;

export const DECISIONES_EJEMPLO: AccessoryProposalDecision[] = TES.map((te) => ({
  accessoryId: `route-accessory:${propuestaTe(te)}`,
  catalogFamilyId: FAMILIA_TE,
  decidedAt: 0,
  geometryKey: te.geometryKey,
  origin: "user_confirmed",
  ownerSegmentId: te.tramo,
  pipeSystemId: "sigas-thermofusion",
  proposalId: propuestaTe(te),
  status: "confirmed",
}));

const tramo = (id: string, fromNodeId: string, toNodeId: string): RouteSegment => {
  const te = TES.find((item) => item.tramo === id);

  return {
    fromNodeId,
    id,
    origin: "manual",
    toNodeId,
    ...(te
      ? {
          accessories: [
            {
              // Sin medida fija: el motor elige la te del diámetro de cada tramo.
              catalogFamilyId: FAMILIA_TE,
              equivalentLengthMetersPerUnit: null,
              equivalentLengthSource: "pipe_system" as const,
              id: `route-accessory:${propuestaTe(te)}`,
              origin: "user_confirmed" as const,
              quantity: 1,
              segmentId: id,
              type: "tee" as const,
            },
          ],
        }
      : {}),
  };
};

export const CANERIA_EJEMPLO: ManualRouteNetwork = {
  nodes: [
    { equipmentId: "ej-medidor", id: "n-medidor", kind: "supply", origin: "manual" },
    { id: "n-a", kind: "route", origin: "manual", position: { x: 1000, y: 3000 } },
    { id: "n-b", kind: "route", origin: "manual", position: { x: 6000, y: 3000 } },
    { id: "n-c", kind: "route", origin: "manual", position: { x: 9000, y: 3000 } },
    { equipmentId: "ej-estufa", id: "n-estufa", kind: "appliance", origin: "manual" },
    { equipmentId: "ej-cocina", id: "n-cocina", kind: "appliance", origin: "manual" },
    { equipmentId: "ej-calefon", id: "n-calefon", kind: "appliance", origin: "manual" },
    { equipmentId: "ej-calefactor", id: "n-calefactor", kind: "appliance", origin: "manual" },
  ],
  segments: [
    tramo("t-medidor-a", "n-medidor", "n-a"),
    tramo("t-a-estufa", "n-a", "n-estufa"),
    tramo("t-a-b", "n-a", "n-b"),
    tramo("t-b-cocina", "n-b", "n-cocina"),
    tramo("t-b-c", "n-b", "n-c"),
    tramo("t-c-calefon", "n-c", "n-calefon"),
    tramo("t-c-calefactor", "n-c", "n-calefactor"),
  ],
};

/** Escala: el frente de la casa mide 10 m (1 unidad del plano = 1 mm). */
const ESCALA = {
  status: "confirmed" as const,
  points: { start: { x: 0, y: 0 }, end: { x: 10000, y: 0 } },
  distanceOriginal: 10,
  unit: "m" as const,
  distanceMillimeters: 10000,
  sourceDistance: 10000,
  millimetersPerSourceUnit: 1,
};

export function crearProyectoEjemplo(): PersistedWorkbenchProject {
  const drawing = importDxf(ARCHIVO, dxfEjemplo());

  return createPersistedWorkbenchProject({
    activeBaseId: BASE_ID,
    bases: [
      {
        adoptedDiameterDecisions: [],
        calibration: {
          calibration: ESCALA,
          draft: { status: "pending", points: [], distanceOriginal: "", unit: "m" },
        },
        constraints: [],
        createdAt: 0,
        diameterTransitionDecisions: [],
        drawing,
        equipment: ARTEFACTOS_EJEMPLO,
        id: BASE_ID,
        name: "Planta",
        originalFileName: ARCHIVO,
        proposals: [],
        routeAccessoryProposalDecisions: DECISIONES_EJEMPLO,
        routeIntentConnections: [],
        routeNetwork: CANERIA_EJEMPLO,
        semanticAssignments: [],
        semanticInspection: null,
        semanticViewMode: "original",
        showConstraints: true,
        showEquipment: true,
        showRoute: true,
        sourceType: "dxf",
        type: "plan",
        visibleLayers: Object.fromEntries(drawing.layers.map((layer) => [layer.name, true])),
        visual: { activePdfPageNumber: 1 },
      },
    ],
    nextSectionNumber: 1,
    routeProposal: null,
    routeProposalMarginInput: "",
    routeProposalMode: null,
    sectionPlanLinks: [],
  });
}

/** Reemplaza el trabajo guardado por la obra de ejemplo. El que llama recarga la página. */
export function guardarObraEjemplo(storage: Pick<Storage, "setItem"> = window.localStorage) {
  storage.setItem(WORKBENCH_PROJECT_STORAGE_KEY, JSON.stringify(crearProyectoEjemplo()));
  storage.setItem(OBRA_STORAGE_KEY, JSON.stringify(OBRA_EJEMPLO));
  storage.setItem(INSTALADOR_STORAGE_KEY, JSON.stringify(INSTALADOR_EJEMPLO));
}
