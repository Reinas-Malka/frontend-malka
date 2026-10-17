import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { usePantallaAncha } from '@/hooks/usePantallaAncha'

export type Columna<T> = {
  clave: keyof T & string
  titulo: string
  render?: (fila: T) => ReactNode
  /** omitilo para columnas no ordenables */
  orden?: (a: T, b: T) => number
  className?: string
  /** Cómo aparece en el teléfono, donde cada fila es una tarjeta: la
   *  primera columna es el título salvo que se diga otra cosa. */
  enTarjeta?: 'titulo' | 'dato' | 'acciones' | 'oculta'
}

function rolEnTarjeta<T>(c: Columna<T>, indice: number) {
  return c.enTarjeta ?? (indice === 0 ? 'titulo' : 'dato')
}

/** En el teléfono: una tarjeta por fila, con las acciones a la vista.
 *  Sin scroll horizontal (la clienta carga datos con una sola mano). */
function ListaDeTarjetas<T extends { id: string }>({
  columnas,
  filas,
}: {
  columnas: Columna<T>[]
  filas: T[]
}) {
  const valor = (c: Columna<T>, fila: T) =>
    c.render ? c.render(fila) : String(fila[c.clave] ?? '')
  const con = (rol: string) =>
    columnas.filter((c, i) => rolEnTarjeta(c, i) === rol)
  return (
    <ul className="space-y-2">
      {filas.map((fila) => (
        <li
          key={fila.id}
          className="space-y-3 rounded-tarjeta border border-borde bg-panel p-4"
        >
          {con('titulo').map((c) => (
            <div key={c.clave} className="text-base font-medium text-texto">
              {valor(c, fila)}
            </div>
          ))}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {con('dato').map((c) => (
              <div key={c.clave} className="contents">
                <dt className="text-texto-suave">{c.titulo}</dt>
                <dd className="min-w-0 break-words text-texto">
                  {valor(c, fila)}
                </dd>
              </div>
            ))}
          </dl>
          {con('acciones').map((c) => (
            <div key={c.clave} className="border-t border-borde pt-2">
              {valor(c, fila)}
            </div>
          ))}
        </li>
      ))}
    </ul>
  )
}

/** Tabla mobile-first: en pantallas chicas se scrollea horizontal,
 *  encabezados con botones de orden y paginación accesible abajo. */
export function DataTable<T extends { id: string }>({
  columnas,
  filas,
  porPagina = 8,
  vacio,
}: {
  columnas: Columna<T>[]
  filas: T[]
  porPagina?: number
  vacio: ReactNode
}) {
  const [orden, setOrden] = useState<{ clave: string; dir: 1 | -1 } | null>(
    null,
  )
  const [pagina, setPagina] = useState(0)
  const ancha = usePantallaAncha()

  const ordenadas = useMemo(() => {
    if (!orden) return filas
    const col = columnas.find((c) => c.clave === orden.clave)
    return col?.orden
      ? [...filas].sort((a, b) => col.orden!(a, b) * orden.dir)
      : filas
  }, [filas, orden, columnas])

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / porPagina))
  // Si las filas cambian (búsqueda, baja) la página actual se recorta al total.
  const paginaActual = Math.min(pagina, totalPaginas - 1)
  const paginadas = ordenadas.slice(
    paginaActual * porPagina,
    (paginaActual + 1) * porPagina,
  )

  if (filas.length === 0) return <>{vacio}</>

  function toggleOrden(clave: string) {
    setOrden((o) =>
      o?.clave === clave
        ? { clave, dir: o.dir === 1 ? -1 : 1 }
        : { clave, dir: 1 },
    )
    setPagina(0)
  }

  return (
    <div className="space-y-3">
      {!ancha ? (
        <ListaDeTarjetas columnas={columnas} filas={paginadas} />
      ) : (
        <div className="overflow-x-auto rounded-control border border-borde">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="bg-panel-alto text-left text-texto-suave">
                {columnas.map((c) => (
                  <th
                    key={c.clave}
                    scope="col"
                    className={cn('px-3 py-2 font-medium', c.className)}
                  >
                    {c.orden ? (
                      <button
                        className="inline-flex min-h-10 items-center gap-1 hover:text-texto focus-visible:outline-2 focus-visible:outline-acento"
                        aria-label={`Ordenar por ${c.titulo}`}
                        onClick={() => toggleOrden(c.clave)}
                      >
                        {c.titulo}
                        {orden?.clave === c.clave ? (
                          orden.dir === 1 ? (
                            <ArrowUp aria-hidden className="size-3" />
                          ) : (
                            <ArrowDown aria-hidden className="size-3" />
                          )
                        ) : (
                          <ArrowUpDown
                            aria-hidden
                            className="size-3 opacity-50"
                          />
                        )}
                      </button>
                    ) : (
                      c.titulo
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginadas.map((fila) => (
                <tr
                  key={fila.id}
                  className="border-t border-borde/60 odd:bg-carbon-800/40"
                >
                  {columnas.map((c) => (
                    <td
                      key={c.clave}
                      className={cn('px-3 py-2 text-texto', c.className)}
                    >
                      {c.render ? c.render(fila) : String(fila[c.clave] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totalPaginas > 1 && (
        <nav
          aria-label="Paginación"
          className="flex items-center justify-between"
        >
          <span className="text-xs text-texto-suave">
            Página {paginaActual + 1} de {totalPaginas} · {filas.length} filas
          </span>
          <div className="flex gap-2">
            <Button
              tamano="chico"
              variante="secundario"
              disabled={paginaActual === 0}
              onClick={() => setPagina(paginaActual - 1)}
            >
              <ChevronLeft aria-hidden className="size-4" /> Anterior
            </Button>
            <Button
              tamano="chico"
              variante="secundario"
              disabled={paginaActual >= totalPaginas - 1}
              onClick={() => setPagina(paginaActual + 1)}
            >
              Siguiente <ChevronRight aria-hidden className="size-4" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
