import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { describirError } from '@/api/client'
import { parques } from '@/api/recursos'
import { PaginaCatalogo } from '@/components/catalogo/PaginaCatalogo'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { Field } from '@/components/ui/label'
import {
  Select,
  SelectContenido,
  SelectOpcion,
  SelectTrigger,
  SelectValor,
} from '@/components/ui/select'
import { useListado } from '@/hooks/useRecurso'
import { catalogoNucleos } from '@/modulos/produccion/catalogos'
import { TODOS } from '@/modulos/ventas/pedidos'

/** Núcleos de los parques. Primero se cargan los parques: el catálogo los
 *  necesita para el selector y para mostrar a cuál pertenece cada núcleo.
 *  El parque elegido vive en la URL (?parque=) y lo filtra el backend
 *  (?parque_id=): desde Parques se llega con el filtro puesto. */
export default function NucleosPage() {
  const listado = useListado('parques', parques)
  const [params, setParams] = useSearchParams()
  const pedido = params.get('parque') ?? undefined
  // Un parque que no existe (o dado de baja) no filtra: se ven todos.
  const parqueId = listado.filas.some((p) => p.id === pedido)
    ? pedido
    : undefined
  const config = useMemo(
    () => catalogoNucleos(listado.filas, parqueId),
    [listado.filas, parqueId],
  )

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

  const filtro = (
    <div className="sm:max-w-xs">
      <Field label="Parque" htmlFor="filtro-parque">
        <Select
          value={parqueId ?? TODOS}
          onValueChange={(v) =>
            setParams(v === TODOS ? {} : { parque: v }, { replace: true })
          }
        >
          <SelectTrigger id="filtro-parque">
            <SelectValor />
          </SelectTrigger>
          <SelectContenido>
            <SelectOpcion value={TODOS}>Todos los parques</SelectOpcion>
            {listado.filas.map((p) => (
              <SelectOpcion key={p.id} value={p.id}>
                {p.nombre}
              </SelectOpcion>
            ))}
          </SelectContenido>
        </Select>
      </Field>
    </div>
  )
  return <PaginaCatalogo config={config} controles={filtro} />
}
