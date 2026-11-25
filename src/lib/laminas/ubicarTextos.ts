/*
 * Ubicación de textos en las láminas sin pisar el dibujo.
 *
 * Cada texto prueba varios lugares (en el orden preferido) y se queda con el primero que no
 * toca nada ya dibujado: caños, llaves, el medidor u otros textos. Todo en puntos PDF.
 * Las figuras son polígonos convexos (rectángulos, también girados); un caño es un
 * rectángulo fino a lo largo de la línea.
 */

export type Punto = { x: number; y: number };
export type Figura = Punto[];

/** Rectángulo con la esquina de abajo a la izquierda en `origen`, girado `angulo` radianes. */
export function rectangulo(origen: Punto, ancho: number, alto: number, angulo = 0): Figura {
  const c = Math.cos(angulo);
  const s = Math.sin(angulo);
  const punto = (a: number, b: number) => ({ x: origen.x + a * c - b * s, y: origen.y + a * s + b * c });
  return [punto(0, 0), punto(ancho, 0), punto(ancho, alto), punto(0, alto)];
}

/** Caño (o cualquier línea) como rectángulo fino de `grosor` puntos. */
export function linea(desde: Punto, hasta: Punto, grosor: number): Figura {
  const dx = hasta.x - desde.x;
  const dy = hasta.y - desde.y;
  const largo = Math.hypot(dx, dy) || 1;
  const n = { x: (-dy / largo) * (grosor / 2), y: (dx / largo) * (grosor / 2) };
  return [
    { x: desde.x + n.x, y: desde.y + n.y },
    { x: hasta.x + n.x, y: hasta.y + n.y },
    { x: hasta.x - n.x, y: hasta.y - n.y },
    { x: desde.x - n.x, y: desde.y - n.y },
  ];
}

/** Cuadrado centrado en `centro`. */
export function cuadrado(centro: Punto, lado: number): Figura {
  return rectangulo({ x: centro.x - lado / 2, y: centro.y - lado / 2 }, lado, lado);
}

/** Dos polígonos convexos se tocan (separación por ejes). */
export function seTocan(a: Figura, b: Figura) {
  for (const figura of [a, b]) {
    for (let i = 0; i < figura.length; i += 1) {
      const p = figura[i];
      const q = figura[(i + 1) % figura.length];
      const eje = { x: -(q.y - p.y), y: q.x - p.x };
      if (Math.hypot(eje.x, eje.y) < 1e-12) continue;
      const proyectar = (f: Figura) => f.map((punto) => punto.x * eje.x + punto.y * eje.y);
      const pa = proyectar(a);
      const pb = proyectar(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) {
        return false;
      }
    }
  }
  return true;
}

/** Lo ya dibujado en una zona de la lámina. */
export class Ocupado {
  readonly figuras: Figura[] = [];

  agregar(figura: Figura) {
    this.figuras.push(figura);
  }

  /** Cuántas figuras toca (0 = lugar libre). */
  choques(figura: Figura) {
    return this.figuras.filter((otra) => seTocan(figura, otra)).length;
  }
}

/**
 * Elige el primer lugar libre de la lista; si ninguno está libre, el que menos toca.
 * Con `soloLibre`, devuelve null si no hay ninguno libre. El lugar elegido queda ocupado.
 */
export function elegirLugar<T extends { figura: Figura }>(
  ocupado: Ocupado,
  lugares: T[],
  opciones: { soloLibre?: boolean } = {},
): T | null {
  let mejor: { lugar: T; choques: number } | null = null;

  for (const lugar of lugares) {
    const choques = ocupado.choques(lugar.figura);
    if (choques === 0) {
      ocupado.agregar(lugar.figura);
      return lugar;
    }
    if (!mejor || choques < mejor.choques) {
      mejor = { lugar, choques };
    }
  }

  if (!mejor || opciones.soloLibre) {
    return null;
  }

  ocupado.agregar(mejor.lugar.figura);
  return mejor.lugar;
}

export type Direccion = "NE" | "N" | "NO" | "E" | "O" | "SE" | "S" | "SO";

/**
 * Lugares para un texto horizontal alrededor de un punto, en el orden de `direcciones` y
 * alejándose de a poco. Devuelve la esquina de abajo a la izquierda de cada lugar.
 */
export function lugaresAlrededor(params: {
  ancho: number;
  alto: number;
  centro: Punto;
  direcciones?: Direccion[];
  separacion: number;
  vueltas?: number;
}): Array<{ figura: Figura; origen: Punto }> {
  const { ancho, alto, centro } = params;
  const direcciones = params.direcciones ?? ["NE", "N", "NO", "E", "O", "SE", "S", "SO"];
  const lugares: Array<{ figura: Figura; origen: Punto }> = [];

  for (let vuelta = 1; vuelta <= (params.vueltas ?? 3); vuelta += 1) {
    const g = params.separacion * vuelta;
    for (const direccion of direcciones) {
      const x = direccion.endsWith("E")
        ? centro.x + g
        : direccion.endsWith("O")
          ? centro.x - g - ancho
          : centro.x - ancho / 2;
      const y = direccion.startsWith("N")
        ? centro.y + g
        : direccion.startsWith("S")
          ? centro.y - g - alto
          : centro.y - alto / 2;
      const origen = { x, y };
      lugares.push({ figura: rectangulo(origen, ancho, alto), origen });
    }
  }

  return lugares;
}
