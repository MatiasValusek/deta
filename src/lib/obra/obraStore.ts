import {
  INSTALADOR_VACIO,
  OBRA_VACIA,
  normalizarInstalador,
  normalizarObra,
  obraTieneDatos,
  type DatosInstalador,
  type DatosObra,
} from "./obraData";

export const OBRA_STORAGE_KEY = "deta.obra.v1";
// Separado de la obra: el instalador sobrevive cuando se empieza un trabajo nuevo.
export const INSTALADOR_STORAGE_KEY = "deta.instalador.v1";

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
  const obra = { ...leerObraSnapshot().obra, ...cambios };
  publicar({ obra, errorAlGuardar: guardar(OBRA_STORAGE_KEY, obra) });
}

export function actualizarInstalador(cambios: Partial<DatosInstalador>) {
  const instalador = { ...leerObraSnapshot().instalador, ...cambios };
  publicar({
    instalador,
    errorAlGuardar: guardar(INSTALADOR_STORAGE_KEY, instalador),
  });
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
