import { useQuery } from '@tanstack/react-query'
import { describirError } from '@/api/client'
import { pedidos } from '@/api/pedidos'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'
import { DataTable, type Columna } from '@/components/ui/table'
import { EstadoDeReserva } from '@/modulos/ventas/insignias'
import { CLAVE_PEDIDOS } from '@/modulos/ventas/pedidos'
import type { DespachoDeLinea, Pedido, Reserva } from '@/tipos/dominio'

type FilaDeDespacho = DespachoDeLinea & { id: string }

/** Qué se reservó para el pedido y qué salió de cada banco (backend: GET
 *  /pedidos/{id}/reservas y /despachos). Carga y falla por su cuenta: un
 *  error acá no tapa el resto del detalle. */
export function TrazabilidadDePedido({
  pedido,
  nombreDeLinea,
}: {
  pedido: Pedido
  /** "Línea 1 · Reina fecundada · Carniola", por pedido_item_id. */
  nombreDeLinea: (pedidoItemId: string) => string
}) {
  // Bajo la clave del detalle: reservar, entregar o cancelar la refrescan.
  const reservas = useQuery({
    queryKey: [CLAVE_PEDIDOS, 'detalle', pedido.id, 'reservas'],
    queryFn: () => pedidos.listarReservas(pedido.id),
  })
  const despachos = useQuery({
    queryKey: [CLAVE_PEDIDOS, 'detalle', pedido.id, 'despachos'],
    queryFn: () => pedidos.listarDespachos(pedido.id),
  })

  const columnasDeReservas: Columna<Reserva>[] = [
    {
      clave: 'pedido_item_id',
      titulo: 'Línea',
      render: (r) => nombreDeLinea(r.pedido_item_id),
    },
    {
      clave: 'cantidad',
      titulo: 'Reinas',
      className: 'text-right font-mono tabular-nums',
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      render: (r) => <EstadoDeReserva estado={r.estado} />,
    },
  ]
  const columnasDeDespachos: Columna<FilaDeDespacho>[] = [
    {
      clave: 'pedido_item_id',
      titulo: 'Línea',
      render: (d) => nombreDeLinea(d.pedido_item_id),
    },
    {
      clave: 'identificador',
      titulo: 'Banco',
      render: (d) => d.identificador ?? 'Sin banco',
    },
    {
      clave: 'fecha_despacho',
      titulo: 'Fecha',
      className: 'font-mono tabular-nums',
    },
    {
      clave: 'cantidad',
      titulo: 'Reinas',
      className: 'text-right font-mono tabular-nums',
    },
  ]

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-texto">Trazabilidad</h2>

      <h3 className="text-sm font-medium text-texto">Reservas</h3>
      {reservas.isPending ? (
        <Cargando columnas={3} filas={1} />
      ) : reservas.isError ? (
        <ErrorDePantalla
          error={describirError(reservas.error)}
          reintentar={() => void reservas.refetch()}
        />
      ) : reservas.data.length === 0 ? (
        <p className="text-sm text-texto-suave">Todavía no se reservó.</p>
      ) : (
        <DataTable
          columnas={columnasDeReservas}
          filas={reservas.data}
          porPagina={reservas.data.length}
          vacio={null}
        />
      )}

      <h3 className="text-sm font-medium text-texto">Despachos</h3>
      {despachos.isPending ? (
        <Cargando columnas={4} filas={1} />
      ) : despachos.isError ? (
        <ErrorDePantalla
          error={describirError(despachos.error)}
          reintentar={() => void despachos.refetch()}
        />
      ) : despachos.data.length === 0 ? (
        <p className="text-sm text-texto-suave">Todavía no se entregó.</p>
      ) : (
        <DataTable
          columnas={columnasDeDespachos}
          // Sin id en la respuesta: línea, banco y día la identifican.
          filas={despachos.data.map((d) => ({
            ...d,
            id: `${d.pedido_item_id}|${d.banco_id ?? 'sin-banco'}|${d.fecha_despacho}`,
          }))}
          porPagina={despachos.data.length}
          vacio={null}
        />
      )}
    </div>
  )
}
