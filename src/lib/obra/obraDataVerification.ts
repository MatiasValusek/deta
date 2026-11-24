import {
  INSTALADOR_VACIO,
  OBRA_VACIA,
  avisosDatosFaltantes,
  crearRotulo,
  normalizarInstalador,
  normalizarObra,
  obraTieneDatos,
  type DatosInstalador,
  type DatosObra,
} from "./obraData";

export type ObraDataVerificationResult = {
  name: string;
  status: "passed";
};

const OBRA_FICTICIA: DatosObra = {
  propietario: " Persona de Prueba ",
  calle: "Calle Uno",
  numero: "100",
  entreCalle1: "Calle Dos",
  entreCalle2: "Calle Tres",
  localidad: "Localidad Ejemplo",
  partido: "Partido Ejemplo",
  calleContrafrente: "Calle Cuatro",
  distanciaEsquina1: "30,50",
  distanciaEsquina2: "56",
  norteGrados: "315",
};
const INSTALADOR_FICTICIO: DatosInstalador = {
  nombre: "Instalador de Prueba",
  matricula: "00000",
  categoria: "2",
};

export function runObraDataVerifications() {
  const results: ObraDataVerificationResult[] = [];

  verify(results, "el rótulo arma las líneas con el formato presentado", () => {
    const rotulo = crearRotulo(OBRA_FICTICIA, INSTALADOR_FICTICIO);

    assertEqual(rotulo.titulo, "INSTALACIÓN PARA GAS NATURAL");
    assertEqual(rotulo.propietario, "Persona de Prueba");
    assertEqual(rotulo.calleNumero, "Calle Uno N°100");
    assertEqual(rotulo.entreCalles, "entre CALLE DOS y CALLE TRES");
    assertEqual(rotulo.localidad, "LOCALIDAD EJEMPLO");
    assertEqual(rotulo.partido, "PARTIDO EJEMPLO");
    assertEqual(rotulo.instalador, "INSTALADOR DE PRUEBA");
    assertEqual(rotulo.matricula, "00000");
    assertEqual(rotulo.categoria, "Cat. 2°");
    assertEqual(rotulo.firmas.join(","), "Propietario,Instalador");
  });

  verify(results, "el rótulo no deja conectores sueltos con datos vacíos", () => {
    const rotulo = crearRotulo(OBRA_VACIA, INSTALADOR_VACIO);

    assertEqual(rotulo.calleNumero, "");
    assertEqual(rotulo.entreCalles, "");
    assertEqual(rotulo.matricula, "");
    assertEqual(rotulo.categoria, "");
  });

  verify(results, "cada dato faltante genera un aviso con qué hacer", () => {
    assertEqual(avisosDatosFaltantes(OBRA_VACIA, INSTALADOR_VACIO).length, 10);
    assertEqual(
      avisosDatosFaltantes(OBRA_FICTICIA, INSTALADOR_FICTICIO).length,
      0,
    );
    assertEqual(
      avisosDatosFaltantes({ ...OBRA_FICTICIA, partido: "  " }, INSTALADOR_FICTICIO)[0],
      "Falta el partido. Escribilo en Datos de la obra.",
    );
  });

  verify(results, "los datos guardados dañados no rompen la carga", () => {
    assertEqual(normalizarObra(null).propietario, "");
    assertEqual(normalizarObra({ calle: 12 }).calle, "");
    assertEqual(normalizarInstalador({ categoria: "9" }).categoria, "");
    assertEqual(normalizarInstalador({ categoria: "3" }).categoria, "3");
    assertEqual(obraTieneDatos(OBRA_VACIA), false);
    assertEqual(obraTieneDatos(OBRA_FICTICIA), true);
  });

  return results;
}

function verify(
  results: ObraDataVerificationResult[],
  name: string,
  run: () => void,
) {
  run();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
