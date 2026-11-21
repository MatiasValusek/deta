import type { RotuloContenido } from "@/lib/obra/obraData";

export function Rotulo({ contenido }: { contenido: RotuloContenido }) {
  return (
    <section
      aria-label="Rótulo"
      className="w-full max-w-[420px] border-2 border-black bg-white text-[13px] leading-snug text-black"
    >
      <h3 className="border-b-2 border-black px-3 py-2 text-center text-sm font-bold">
        {contenido.titulo}
      </h3>
      <div className="border-b border-black">
        <Linea etiqueta="Propietario" valor={contenido.propietario} />
        <Linea etiqueta="Calle" valor={contenido.calleNumero} />
        <p className="min-h-7 px-3 py-1 text-center">{contenido.entreCalles}</p>
        <Linea etiqueta="Localidad" valor={contenido.localidad} />
        <Linea etiqueta="Partido" valor={contenido.partido} />
      </div>
      <p className="flex min-h-8 justify-between gap-3 border-b border-black px-3 py-1.5">
        <span className="min-w-0 break-words">
          <span className="font-semibold">Instalador: </span>
          {contenido.instalador}
        </span>
        <span className="shrink-0">{contenido.matriculaCategoria}</span>
      </p>
      <div className="grid grid-cols-2">
        {contenido.firmas.map((firma, indice) => (
          <div
            className={`flex h-20 items-end justify-center pb-1 ${
              indice === 0 ? "border-r border-black" : ""
            }`}
            key={firma}
          >
            {firma}
          </div>
        ))}
      </div>
    </section>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p className="min-h-7 break-words px-3 py-1">
      <span className="font-semibold">{etiqueta}: </span>
      {valor}
    </p>
  );
}
