import type { EquipmentType } from "@/lib/equipment/types";

/*
 * Los botones del paso Artefactos: uno por tipo, con el consumo típico ya cargado.
 * El gasista lo cambia en la tarjeta del artefacto si el suyo consume otra cosa.
 */

export type TipoDeArtefacto = {
  /** Lo que se lee en el botón. */
  boton: string;
  /** Sigla del dibujo en el plano (la misma que usa el marcador). */
  sigla: string;
  /** Nombre que toma el artefacto al ubicarlo ("Cocina", "Calefactor 2"…). */
  nombre: string;
  /** Consumo típico en kcal/h; null si no hay uno típico (Otro). */
  kcalPorHora: number | null;
  tipo: EquipmentType;
};

export const MEDIDOR: TipoDeArtefacto = {
  boton: "Medidor",
  kcalPorHora: null,
  nombre: "Medidor",
  sigla: "M",
  tipo: "meter_regulator",
};

export const TIPOS_DE_ARTEFACTO: TipoDeArtefacto[] = [
  { boton: "Cocina", kcalPorHora: 9000, nombre: "Cocina", sigla: "COC", tipo: "stove" },
  { boton: "Horno", kcalPorHora: 3000, nombre: "Horno", sigla: "HOR", tipo: "oven" },
  { boton: "Calefón", kcalPorHora: 20000, nombre: "Calefón", sigla: "CF", tipo: "instant_water_heater" },
  { boton: "Termotanque", kcalPorHora: 6500, nombre: "Termotanque", sigla: "TT", tipo: "storage_water_heater" },
  { boton: "Caldera", kcalPorHora: 30000, nombre: "Caldera", sigla: "CLD", tipo: "boiler" },
  { boton: "Estufa / Calefactor", kcalPorHora: 3000, nombre: "Calefactor", sigla: "EST", tipo: "space_heater" },
  { boton: "Secarropas", kcalPorHora: 4000, nombre: "Secarropas", sigla: "SEC", tipo: "gas_dryer" },
  { boton: "Otro", kcalPorHora: null, nombre: "Artefacto", sigla: "OTR", tipo: "other" },
];

/** Medidor primero y después los artefactos, en el orden de los botones. */
export const BOTONES_DE_ARTEFACTOS: TipoDeArtefacto[] = [MEDIDOR, ...TIPOS_DE_ARTEFACTO];

export function tipoDeArtefacto(tipo: EquipmentType): TipoDeArtefacto {
  return BOTONES_DE_ARTEFACTOS.find((item) => item.tipo === tipo) ?? TIPOS_DE_ARTEFACTO[TIPOS_DE_ARTEFACTO.length - 1];
}

const MILES = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

/** "9.000 kcal/h", o "Escribí el consumo" si no hay uno típico. */
export function consumoTipicoTexto(tipo: TipoDeArtefacto) {
  return tipo.kcalPorHora === null ? "Escribí el consumo" : `${MILES.format(tipo.kcalPorHora)} kcal/h`;
}

export function formatearNumero(valor: number) {
  return MILES.format(valor);
}
