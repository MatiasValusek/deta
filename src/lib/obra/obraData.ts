export type DatosObra = {
  propietario: string;
  calle: string;
  numero: string;
  entreCalle1: string;
  entreCalle2: string;
  localidad: string;
  partido: string;
  /** Croquis de ubicación: la calle de atrás de la manzana. */
  calleContrafrente: string;
  /** Metros desde el terreno hasta la esquina con la primera entre calle. */
  distanciaEsquina1: string;
  /** Metros desde el terreno hasta la esquina con la segunda entre calle. */
  distanciaEsquina2: string;
  /** Hacia dónde queda el norte en el croquis, en grados (0 = arriba, 90 = derecha). */
  norteGrados: string;
};

export type CategoriaInstalador = "" | "1" | "2" | "3";

export type DatosInstalador = {
  nombre: string;
  matricula: string;
  categoria: CategoriaInstalador;
};

export type RotuloContenido = {
  titulo: string;
  propietario: string;
  calleNumero: string;
  entreCalles: string;
  localidad: string;
  partido: string;
  instalador: string;
  matricula: string;
  categoria: string;
  firmas: [string, string];
};

export const OBRA_VACIA: DatosObra = {
  propietario: "",
  calle: "",
  numero: "",
  entreCalle1: "",
  entreCalle2: "",
  localidad: "",
  partido: "",
  calleContrafrente: "",
  distanciaEsquina1: "",
  distanciaEsquina2: "",
  norteGrados: "",
};

export const INSTALADOR_VACIO: DatosInstalador = {
  nombre: "",
  matricula: "",
  categoria: "",
};

const AVISOS_OBRA: Array<[keyof DatosObra, string]> = [
  ["propietario", "Falta el propietario. Escribilo en Datos de la obra."],
  ["calle", "Falta la calle. Escribila en Datos de la obra."],
  ["numero", "Falta el número de la calle. Escribilo en Datos de la obra."],
  ["entreCalle1", "Falta la primera entre calle. Escribila en Datos de la obra."],
  ["entreCalle2", "Falta la segunda entre calle. Escribila en Datos de la obra."],
  ["localidad", "Falta la localidad. Escribila en Datos de la obra."],
  ["partido", "Falta el partido. Escribilo en Datos de la obra."],
];

const AVISOS_INSTALADOR: Array<[keyof DatosInstalador, string]> = [
  ["nombre", "Falta el nombre del instalador. Escribilo en Datos del instalador."],
  ["matricula", "Falta la matrícula. Escribila en Datos del instalador."],
  ["categoria", "Falta la categoría. Elegila en Datos del instalador."],
];

export function normalizarObra(valor: unknown): DatosObra {
  const datos = comoRegistro(valor);

  return {
    propietario: comoTexto(datos.propietario),
    calle: comoTexto(datos.calle),
    numero: comoTexto(datos.numero),
    entreCalle1: comoTexto(datos.entreCalle1),
    entreCalle2: comoTexto(datos.entreCalle2),
    localidad: comoTexto(datos.localidad),
    partido: comoTexto(datos.partido),
    calleContrafrente: comoTexto(datos.calleContrafrente),
    distanciaEsquina1: comoTexto(datos.distanciaEsquina1),
    distanciaEsquina2: comoTexto(datos.distanciaEsquina2),
    norteGrados: comoTexto(datos.norteGrados),
  };
}

export function normalizarInstalador(valor: unknown): DatosInstalador {
  const datos = comoRegistro(valor);
  const categoria = datos.categoria;

  return {
    nombre: comoTexto(datos.nombre),
    matricula: comoTexto(datos.matricula),
    categoria:
      categoria === "1" || categoria === "2" || categoria === "3"
        ? categoria
        : "",
  };
}

export function obraTieneDatos(obra: DatosObra) {
  return Object.values(obra).some((valor) => valor.trim() !== "");
}

export function avisosDatosFaltantes(
  obra: DatosObra,
  instalador: DatosInstalador,
) {
  return [
    ...AVISOS_OBRA.filter(([campo]) => obra[campo].trim() === ""),
    ...AVISOS_INSTALADOR.filter(([campo]) => instalador[campo].trim() === ""),
  ].map(([, aviso]) => aviso);
}

export type DatosCroquis = {
  frente: string;
  izquierda: string;
  derecha: string;
  atras: string;
  /** Metros hasta la esquina izquierda (primera entre calle) y derecha (segunda). */
  distanciaIzquierda: number;
  distanciaDerecha: number;
  norteGrados: number;
};

const AVISOS_CROQUIS: Array<[keyof DatosObra, string]> = [
  ["calle", "Falta la calle. Escribila en Datos de la obra."],
  ["entreCalle1", "Falta la primera entre calle. Escribila en Datos de la obra."],
  ["entreCalle2", "Falta la segunda entre calle. Escribila en Datos de la obra."],
  ["calleContrafrente", "Falta la calle de atrás para el croquis. Escribila en Datos de la obra."],
  ["distanciaEsquina1", "Faltan los metros hasta la primera esquina. Escribilos en Datos de la obra."],
  ["distanciaEsquina2", "Faltan los metros hasta la segunda esquina. Escribilos en Datos de la obra."],
  ["norteGrados", "Falta indicar dónde queda el norte. Elegilo en Datos de la obra."],
];

/** Lee un número escrito como "83,05" o "83.05". */
export function leerMetros(valor: string) {
  const numero = Number(valor.trim().replace(",", "."));
  return valor.trim() !== "" && Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export function avisosCroquis(obra: DatosObra) {
  const avisos = AVISOS_CROQUIS.filter(([campo]) => obra[campo].trim() === "").map(
    ([, aviso]) => aviso,
  );

  for (const campo of ["distanciaEsquina1", "distanciaEsquina2"] as const) {
    if (obra[campo].trim() !== "" && leerMetros(obra[campo]) === null) {
      avisos.push("Los metros hasta la esquina tienen que ser un número, por ejemplo 25,40.");
    }
  }

  return [...new Set(avisos)];
}

/** Datos listos para dibujar el croquis, o null si falta algo (ver avisosCroquis). */
export function crearDatosCroquis(obra: DatosObra): DatosCroquis | null {
  const distanciaIzquierda = leerMetros(obra.distanciaEsquina1);
  const distanciaDerecha = leerMetros(obra.distanciaEsquina2);
  const norteGrados = Number(obra.norteGrados);

  if (avisosCroquis(obra).length > 0 || distanciaIzquierda === null || distanciaDerecha === null) {
    return null;
  }

  return {
    frente: obra.calle.trim(),
    izquierda: obra.entreCalle1.trim(),
    derecha: obra.entreCalle2.trim(),
    atras: obra.calleContrafrente.trim(),
    distanciaIzquierda,
    distanciaDerecha,
    norteGrados: Number.isFinite(norteGrados) ? norteGrados : 0,
  };
}

export function crearRotulo(
  obra: DatosObra,
  instalador: DatosInstalador,
): RotuloContenido {
  const calle = obra.calle.trim();
  const numero = obra.numero.trim();
  const entre = [obra.entreCalle1, obra.entreCalle2]
    .map(mayusculas)
    .filter(Boolean)
    .join(" y ");

  return {
    titulo: "INSTALACIÓN PARA GAS NATURAL",
    propietario: obra.propietario.trim(),
    calleNumero: [calle, numero ? `N°${numero}` : ""].filter(Boolean).join(" "),
    entreCalles: entre ? `entre ${entre}` : "",
    localidad: mayusculas(obra.localidad),
    partido: mayusculas(obra.partido),
    instalador: mayusculas(instalador.nombre),
    matricula: instalador.matricula.trim(),
    categoria: instalador.categoria ? `Cat. ${instalador.categoria}°` : "",
    firmas: ["Propietario", "Instalador"],
  };
}

function mayusculas(valor: string) {
  return valor.trim().toLocaleUpperCase("es-AR");
}

function comoRegistro(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null
    ? (valor as Record<string, unknown>)
    : {};
}

function comoTexto(valor: unknown) {
  return typeof valor === "string" ? valor : "";
}
