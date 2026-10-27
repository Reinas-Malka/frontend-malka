import { useMemo } from 'react'
import { Link } from 'react-router'
import { describirError } from '@/api/client'
import { parques } from '@/api/recursos'
import { PaginaCatalogo } from '@/components/catalogo/PaginaCatalogo'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { useListado } from '@/hooks/useRecurso'
import { catalogoNucleos } from '@/modulos/produccion/catalogos'

/** Núcleos de los parques. Primero se cargan los parques: el catálogo los
 *  necesita para el selector y para mostrar a cuál pertenece cada núcleo. */
export default function NucleosPage() {
  const listado = useListado('parques', parques)
  const config = useMemo(() => catalogoNucleos(listado.filas), [listado.filas])

  if (listado.isPending)
    return (
      <section className="space-y-seccion">
        <EncabezadoDePagina titulo="Núcleos" />
        <Cargando columnas={3} />
      </section>
    )
  if (listado.isError)
    return (
      <section className="space-y-seccion">
        <EncabezadoDePagina titulo="Núcleos" />
        <ErrorDePantalla
          error={describirError(listado.error)}
          reintentar={() => void listado.refetch()}
        />
      </section>
    )
  if (listado.filas.length === 0)
    return (
      <section className="space-y-seccion">
        <EncabezadoDePagina titulo="Núcleos" />
        <Vacio
          titulo="Todavía no hay parques"
          accion={
            <Link
              to="/produccion/parques"
              className="text-sm font-medium text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
            >
              Ir a Parques
            </Link>
          }
        >
          Cada núcleo es un baby nuc de un parque de fecundación: primero creá
          el parque.
        </Vacio>
      </section>
    )
  return <PaginaCatalogo config={config} />
}
