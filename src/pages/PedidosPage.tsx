import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { describirError } from '@/api/client'
import { pedidos } from '@/api/pedidos'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { Field } from '@/components/ui/label'
import {
  Select,
  SelectContenido,
  SelectOpcion,
  SelectTrigger,
  SelectValor,
} from '@/components/ui/select'
import { DataTable, type Columna } from '@/components/ui/table'
import { nombreDePais } from '@/lib/paises'
import { EstadoDePedido } from '@/modulos/ventas/insignias'
import {
  CLAVE_CLIENTES_CON_BAJAS,
  CLAVE_PEDIDOS,
  TODOS,
  type DesdeElListado,
  clientesConBajas,
  leerFiltros,
  resumenDeLineas,
} from '@/modulos/ventas/pedidos'
import {
  ESTADOS_PEDIDO,
  NOMBRE_DE_ESTADO_PEDIDO,
  type Pedido,
} from '@/tipos/dominio'

function columnas(
  nombreDe: (id: string) => string,
  desde: DesdeElListado,
): Columna<Pedido>[] {
  return [
    {
      clave: 'cliente_id',
      titulo: 'Cliente',
      render: (p) => (
        <Link
          to={`/ventas/pedidos/${p.id}`}
          state={desde}
          className="font-medium text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
        >
          {nombreDe(p.cliente_id)}
        </Link>
      ),
      orden: (a, b) =>
        nombreDe(a.cliente_id).localeCompare(nombreDe(b.cliente_id)),
    },
    {
      clave: 'fecha_entrega_solicitada',
      titulo: 'Entrega',
      render: (p) => (
        <span className="font-mono tabular-nums">
          {p.fecha_entrega_solicitada}
        </span>
      ),
      orden: (a, b) =>
        a.fecha_entrega_solicitada.localeCompare(b.fecha_entrega_solicitada),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      render: (p) => <EstadoDePedido estado={p.estado} />,
    },
    {
      clave: 'destino_pais',
      titulo: 'Destino',
      render: (p) =>
        p.destino_pais
          ? `${nombreDePais(p.destino_pais)}${p.incoterm ? ` · ${p.incoterm}` : ''}`
          : 'Nacional',
    },
    {
      clave: 'items',
      titulo: 'Tamaño',
      render: resumenDeLineas,
    },
    { clave: 'moneda', titulo: 'Moneda' },
  ]
}

export default function PedidosPage() {
  const [params, setParams] = useSearchParams()
  const filtros = leerFiltros(params)
  const hayFiltros = Boolean(filtros.estado || filtros.cliente_id)

  const clientes = useQuery({
    queryKey: CLAVE_CLIENTES_CON_BAJAS,
    queryFn: clientesConBajas,
  })
  // Los filtros los aplica el backend; cada combinación es otra consulta.
  const listado = useInfiniteQuery({
    queryKey: [CLAVE_PEDIDOS, filtros],
    queryFn: ({ pageParam }) => pedidos.listar(filtros, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.siguiente ?? undefined,
  })

  const filtrar = (clave: 'estado' | 'cliente', valor: string) =>
    setParams(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        if (valor === TODOS) nuevos.delete(clave)
        else nuevos.set(clave, valor)
        return nuevos
      },
      { replace: true },
    )
  const limpiar = () => setParams({}, { replace: true })

  const nombres = new Map(clientes.data?.map((c) => [c.id, c.nombre]))
  const nombreDe = (id: string) => nombres.get(id) ?? 'Cliente desconocido'
  const filas = listado.data?.pages.flatMap((pagina) => pagina.items) ?? []
  const error = (!listado.data && listado.error) || clientes.error

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo="Pedidos"
        descripcion="Del más nuevo al más viejo. Filtrá por estado o por cliente."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <Field label="Estado" htmlFor="filtro-estado">
          <Select
            value={filtros.estado ?? TODOS}
            onValueChange={(v) => filtrar('estado', v)}
          >
            <SelectTrigger id="filtro-estado">
              <SelectValor />
            </SelectTrigger>
            <SelectContenido>
              <SelectOpcion value={TODOS}>Todos los estados</SelectOpcion>
              {ESTADOS_PEDIDO.map((e) => (
                <SelectOpcion key={e} value={e}>
                  {NOMBRE_DE_ESTADO_PEDIDO[e]}
                </SelectOpcion>
              ))}
            </SelectContenido>
          </Select>
        </Field>
        <Field label="Cliente" htmlFor="filtro-cliente">
          <Select
            value={filtros.cliente_id ?? TODOS}
            onValueChange={(v) => filtrar('cliente', v)}
          >
            <SelectTrigger id="filtro-cliente">
              <SelectValor />
            </SelectTrigger>
            <SelectContenido>
              <SelectOpcion value={TODOS}>Todos los clientes</SelectOpcion>
              {clientes.data?.map((c) => (
                <SelectOpcion key={c.id} value={c.id}>
                  {c.activo ? c.nombre : `${c.nombre} (dado de baja)`}
                </SelectOpcion>
              ))}
            </SelectContenido>
          </Select>
        </Field>
      </div>

      {listado.isPending || clientes.isPending ? (
        <Cargando columnas={6} />
      ) : error ? (
        <ErrorDePantalla
          error={describirError(error)}
          reintentar={() => {
            void listado.refetch()
            void clientes.refetch()
          }}
        />
      ) : (
        <div className="space-y-3">
          <DataTable
            // El detalle recibe los filtros para volver a esta misma vista.
            columnas={columnas(nombreDe, {
              filtros: params.size ? `?${params}` : undefined,
            })}
            filas={filas}
            // Una sola página en pantalla: las siguientes llegan con "Cargar más".
            porPagina={Math.max(filas.length, 1)}
            vacio={
              hayFiltros ? (
                <Vacio
                  titulo="Ningún pedido con estos filtros"
                  accion={
                    <Button variante="secundario" onClick={limpiar}>
                      Ver todos los pedidos
                    </Button>
                  }
                />
              ) : (
                <Vacio titulo="Todavía no hay pedidos">
                  Un pedido lleva el cliente y sus líneas (ítem, raza, cantidad
                  y precio). Arranca en borrador.
                </Vacio>
              )
            }
          />
          {listado.isFetchNextPageError ? (
            <p
              role="alert"
              className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
            >
              {describirError(listado.error).mensaje}
            </p>
          ) : null}
          {listado.hasNextPage ? (
            <Button
              variante="secundario"
              cargando={listado.isFetchingNextPage}
              onClick={() => void listado.fetchNextPage()}
            >
              Cargar más pedidos
            </Button>
          ) : null}
        </div>
      )}
    </section>
  )
}
