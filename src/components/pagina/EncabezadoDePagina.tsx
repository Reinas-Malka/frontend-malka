import { useEffect, type ReactNode } from 'react'

/** Encabezado común de toda pantalla: título (h1), bajada y acciones. En el
 *  teléfono las acciones bajan debajo del título, a lo ancho. */
export function EncabezadoDePagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string
  descripcion?: string
  acciones?: ReactNode
}) {
  // La pestaña dice en qué pantalla se está, y un lector de pantalla lo
  // anuncia al navegar.
  useEffect(() => {
    document.title = `${titulo} · Malka Suite`
  }, [titulo])

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-texto">
          {titulo}
        </h1>
        {descripcion ? (
          <p className="max-w-prose text-sm text-texto-suave">{descripcion}</p>
        ) : null}
      </div>
      {acciones ? <div className="flex flex-wrap gap-2">{acciones}</div> : null}
    </header>
  )
}
