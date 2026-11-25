import type { DatosInstalador } from "./obraData";

/*
 * Partido sugerido según la localidad: la app recuerda qué partido se escribió para cada
 * localidad en obras anteriores y lo completa solo la próxima vez.
 */

export type PartidosUsados = Record<string, string>;

/** "San Martín " y "san martin" son la misma localidad. */
export function claveLocalidad(localidad: string) {
  return localidad
    .trim()
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function sugerirPartido(partidos: PartidosUsados, localidad: string) {
  const clave = claveLocalidad(localidad);
  return clave ? (partidos[clave] ?? null) : null;
}

export function recordarPartido(
  partidos: PartidosUsados,
  localidad: string,
  partido: string,
): PartidosUsados {
  const clave = claveLocalidad(localidad);
  const valor = partido.trim();
  if (!clave || !valor || partidos[clave] === valor) return partidos;
  return { ...partidos, [clave]: valor };
}

/**
 * Qué partido queda al cambiar la localidad: si el partido está vacío o lo había puesto la
 * app para la localidad anterior, se reemplaza por el sugerido. Lo que escribió el gasista
 * no se toca.
 */
export function partidoAlCambiarLocalidad(params: {
  localidadAnterior: string;
  localidadNueva: string;
  partido: string;
  partidos: PartidosUsados;
}) {
  const anterior = sugerirPartido(params.partidos, params.localidadAnterior);
  const loPusoLaApp = params.partido.trim() === "" || params.partido === anterior;
  if (!loPusoLaApp) return params.partido;
  return sugerirPartido(params.partidos, params.localidadNueva) ?? "";
}

export function normalizarPartidos(valor: unknown): PartidosUsados {
  if (typeof valor !== "object" || valor === null) return {};
  return Object.fromEntries(
    Object.entries(valor).filter(
      (entrada): entrada is [string, string] => typeof entrada[1] === "string",
    ),
  );
}

/** Nombre, matrícula y categoría: lo que pide el rótulo del instalador. */
export function instaladorCompleto(instalador: DatosInstalador) {
  return (
    instalador.nombre.trim() !== "" &&
    instalador.matricula.trim() !== "" &&
    instalador.categoria !== ""
  );
}
