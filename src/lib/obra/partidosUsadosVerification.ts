import { INSTALADOR_VACIO } from "./obraData";
import {
  instaladorCompleto,
  normalizarPartidos,
  partidoAlCambiarLocalidad,
  recordarPartido,
  sugerirPartido,
} from "./partidosUsados";

type Resultado = { name: string; status: "passed" };

export function runPartidosUsadosVerifications() {
  const results: Resultado[] = [];
  const partidos = recordarPartido({}, "Villa Ejemplo", "Partido Uno");

  verify(results, "sugiere el partido usado antes, sin importar tildes ni mayúsculas", () => {
    assertEqual(sugerirPartido(partidos, " VILLA EJÉMPLO "), "Partido Uno");
    assertEqual(sugerirPartido(partidos, "Otra"), null);
    assertEqual(sugerirPartido(partidos, ""), null);
  });

  verify(results, "completa el partido vacío al escribir una localidad conocida", () => {
    assertEqual(
      partidoAlCambiarLocalidad({
        localidadAnterior: "Villa Ejempl",
        localidadNueva: "Villa Ejemplo",
        partido: "",
        partidos,
      }),
      "Partido Uno",
    );
  });

  verify(results, "si la localidad cambia, saca el partido que había puesto la app", () => {
    assertEqual(
      partidoAlCambiarLocalidad({
        localidadAnterior: "Villa Ejemplo",
        localidadNueva: "Villa Ejemplo Norte",
        partido: "Partido Uno",
        partidos,
      }),
      "",
    );
  });

  verify(results, "no toca el partido que escribió el gasista", () => {
    assertEqual(
      partidoAlCambiarLocalidad({
        localidadAnterior: "Villa",
        localidadNueva: "Villa Ejemplo",
        partido: "Partido Propio",
        partidos,
      }),
      "Partido Propio",
    );
  });

  verify(results, "datos guardados dañados no rompen la carga", () => {
    assertEqual(Object.keys(normalizarPartidos(null)).length, 0);
    assertEqual(Object.keys(normalizarPartidos({ a: 3, b: "x" })).join(","), "b");
  });

  verify(results, "el instalador está completo con nombre, matrícula y categoría", () => {
    assertEqual(instaladorCompleto(INSTALADOR_VACIO), false);
    assertEqual(instaladorCompleto({ categoria: "2", matricula: "00000", nombre: "Prueba" }), true);
    assertEqual(instaladorCompleto({ categoria: "", matricula: "00000", nombre: "Prueba" }), false);
  });

  return results;
}

function verify(results: Resultado[], name: string, run: () => void) {
  run();
  results.push({ name, status: "passed" });
}

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
