export type DatosObra = {
  propietario: string;
  calle: string;
  numero: string;
  entreCalle1: string;
  entreCalle2: string;
  localidad: string;
  partido: string;
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
  matriculaCategoria: string;
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

export function crearRotulo(
  obra: DatosObra,
  instalador: DatosInstalador,
): RotuloContenido {
  const calle = obra.calle.trim();
  const numero = obra.numero.trim();
  const entre = [obra.entreCalle1.trim(), obra.entreCalle2.trim()]
    .filter(Boolean)
    .join(" y ");
  const matricula = instalador.matricula.trim();
  const categoria = instalador.categoria ? `Cat. ${instalador.categoria}°` : "";

  return {
    titulo: "INSTALACIÓN PARA GAS NATURAL",
    propietario: obra.propietario.trim(),
    calleNumero: [calle, numero ? `N° ${numero}` : ""].filter(Boolean).join(" "),
    entreCalles: entre ? `entre ${entre}` : "",
    localidad: obra.localidad.trim(),
    partido: obra.partido.trim(),
    instalador: instalador.nombre.trim(),
    matriculaCategoria: [matricula, categoria].filter(Boolean).join(" "),
    firmas: ["Propietario", "Instalador"],
  };
}

function comoRegistro(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null
    ? (valor as Record<string, unknown>)
    : {};
}

function comoTexto(valor: unknown) {
  return typeof valor === "string" ? valor : "";
}
