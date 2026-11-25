import {
  INSTALADOR_VACIO,
  OBRA_VACIA,
  normalizarInstalador,
  normalizarObra,
  obraTieneDatos,
  type DatosInstalador,
  type DatosObra,
} from "./obraData";
import {
  normalizarPartidos,
  partidoAlCambiarLocalidad,
  recordarPartido,
} from "./partidosUsados";

export const OBRA_STORAGE_KEY = "deta.obra.v1";
// Separado de la obra: el instalador sobrevive cuando se empieza un trabajo nuevo.
export const INSTALADOR_STORAGE_KEY = "deta.instalador.v1";
// Partido usado para cada localidad, para sugerirlo en las obras siguientes.
export const PARTIDOS_STORAGE_KEY = "deta.partidos.v1";

export type ObraSnapshot = {
  obra: DatosObra;
  instalador: DatosInstalador;
  errorAlGuardar: string | null;
};

const SNAPSHOT_SERVIDOR: ObraSnapshot = {
  obra: OBRA_VACIA,
  instalador: INSTALADOR_VACIO,
  errorAlGuardar: null,
};
const ERROR_AL_GUARDAR =
  "No se pudieron guardar los datos en este navegador. Revisá que el almacenamiento no esté bloqueado y volvé a intentar.";

const oyentes = new Set<() => void>();
let snapshot: ObraSnapshot | null = null;

export function suscribirObra(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function leerObraSnapshot() {
  snapshot ??= cargar();
  return snapshot;
}

export function leerObraSnapshotServidor() {
  return SNAPSHOT_SERVIDOR;
}

export function actualizarObra(cambios: Partial<DatosObra>) {
  const anterior = leerObraSnapshot().obra;
  const obra = { ...anterior, ...cambios };
  if (cambios.localidad !== undefined && cambios.partido === undefined) {
    obra.partido = partidoAlCambiarLocalidad({
      localidadAnterior: anterior.localidad,
      localidadNueva: obra.localidad,
      partido: anterior.partido,
      partidos: normalizarPartidos(leerJson(PARTIDOS_STORAGE_KEY)),
    });
  }
  publicar({ obra, errorAlGuardar: guardar(OBRA_STORAGE_KEY, obra) });
}

export function actualizarInstalador(cambios: Partial<DatosInstalador>) {
  const instalador = { ...leerObraSnapshot().instalador, ...cambios };
  publicar({
    instalador,
    errorAlGuardar: guardar(INSTALADOR_STORAGE_KEY, instalador),
  });
}

/** Recuerda el partido de la localidad de esta obra para sugerirlo en las siguientes. */
export function recordarPartidoDeLaObra() {
  const { obra } = leerObraSnapshot();
  const partidos = normalizarPartidos(leerJson(PARTIDOS_STORAGE_KEY));
  const nuevos = recordarPartido(partidos, obra.localidad, obra.partido);
  if (nuevos !== partidos) guardar(PARTIDOS_STORAGE_KEY, nuevos);
}

/** Borra solo la obra actual. Los datos del instalador se conservan. */
export function borrarObra() {
  let errorAlGuardar: string | null = null;

  try {
    window.localStorage.removeItem(OBRA_STORAGE_KEY);
  } catch {
    errorAlGuardar = ERROR_AL_GUARDAR;
  }

  publicar({ obra: OBRA_VACIA, errorAlGuardar });
}

export function hayObraCargada() {
  return obraTieneDatos(leerObraSnapshot().obra);
}

function publicar(cambios: Partial<ObraSnapshot>) {
  snapshot = { ...leerObraSnapshot(), ...cambios };
  oyentes.forEach((oyente) => oyente());
}

function cargar(): ObraSnapshot {
  return {
    obra: normalizarObra(leerJson(OBRA_STORAGE_KEY)),
    instalador: normalizarInstalador(leerJson(INSTALADOR_STORAGE_KEY)),
    errorAlGuardar: null,
  };
}

function leerJson(clave: string): unknown {
  try {
    const texto = window.localStorage.getItem(clave);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
    return null;
  } catch {
    return ERROR_AL_GUARDAR;
  }
}
