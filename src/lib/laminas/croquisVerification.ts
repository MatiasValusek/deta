import { PDFDocument, StandardFonts } from "pdf-lib";
import { OBRA_VACIA, avisosCroquis, crearDatosCroquis, type DatosObra } from "@/lib/obra/obraData";
import { dibujarCroquisPdf, formatoMetros, manzanaCroquis, posicionTerreno } from "./croquisPdf";
import { armarPlanoInstalacion } from "./planoInstalacionArmado";

type Resultado = { name: string; status: "passed" };

const OBRA: DatosObra = {
  ...OBRA_VACIA,
  calle: "Calle Uno",
  entreCalle1: "Calle Dos",
  entreCalle2: "Calle Tres",
  calleContrafrente: "Calle Cuatro",
  distanciaEsquina1: "30,50",
  distanciaEsquina2: "10",
  norteGrados: "315",
};

export async function runCroquisVerifications() {
  const results: Resultado[] = [];
  const check = (name: string, ok: () => boolean) => {
    if (!ok()) throw new Error(`Croquis: ${name}`);
    results.push({ name, status: "passed" });
  };

  const datos = crearDatosCroquis(OBRA);

  check("con los datos completos no hay avisos", () => avisosCroquis(OBRA).length === 0);
  check("lee metros con coma decimal", () => datos?.distanciaIzquierda === 30.5);
  check("sin la calle de atrás no se dibuja y avisa qué hacer", () =>
    crearDatosCroquis({ ...OBRA, calleContrafrente: "" }) === null &&
    avisosCroquis({ ...OBRA, calleContrafrente: "" })[0].includes("Datos de la obra"),
  );
  check("metros que no son número dan aviso", () =>
    avisosCroquis({ ...OBRA, distanciaEsquina2: "diez" }).some((aviso) => aviso.includes("número")),
  );
  check("las distancias se escriben como en el plano", () => formatoMetros(83.05) === "83,05");

  const zona = armarPlanoInstalacion({ conCroquis: true }).find((r) => r.id === "croquis")!;
  const manzana = manzanaCroquis(zona);

  check("la manzana entra en el recuadro", () =>
    manzana.x1 > zona.x1 && manzana.x2 < zona.x2 && manzana.y1 > zona.y1 && manzana.y2 < zona.y2,
  );
  check("el terreno queda más cerca de la esquina más próxima", () => {
    const x = posicionTerreno(datos!, manzana.x1, manzana.x2);
    return x > (manzana.x1 + manzana.x2) / 2 && x < manzana.x2;
  });

  const doc = await PDFDocument.create();
  const page = doc.addPage([1190.55, 841.89]);
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  dibujarCroquisPdf({ datos: datos!, fuente, page, zona });
  check("se dibuja en el PDF", () => true);

  return results;
}
