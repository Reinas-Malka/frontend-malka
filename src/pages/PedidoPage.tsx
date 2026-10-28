import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { describirError } from '@/api/client'
import { pedidos } from '@/api/pedidos'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'
import { Modal, ModalContenido } from '@/components/ui/modal'
import { DataTable, type Columna } from '@/components/ui/table'
import { formatearImporte, importeDeLinea, sumarImportes } from '@/lib/importes'
import { nombreDePais } from '@/lib/paises'
import { puedePasar } from '@/lib/pedidos'
import { EstadoDePedido } from '@/modulos/ventas/insignias'
import {
  CLAVE_CLIENTES_CON_BAJAS,
  CLAVE_ITEMS_CON_BAJAS,
  CLAVE_PEDIDOS,
  CLAVE_RAZAS_CON_BAJAS,
  ROLES_VENTAS,
  clientesConBajas,
  type DesdeElListado,
  faltantesDeStock,
  itemsConBajas,
  razasConBajas,
  resumenDeLineas,
} from '@/modulos/ventas/pedidos'
import type { Moneda, Pedido, PedidoItem } from '@/tipos/dominio'

const ALERTA =
  'rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto'

function columnas(
  nombreDeItem: (id: string) => string,
  nombreDeRaza: (id: string) => string,
  moneda: Moneda,
): Columna<PedidoItem>[] {
  return [
    {
      clave: 'item_vendible_id',
      titulo: 'Ítem',
      render: (l) => (
        <span className="font-medium text-texto">
          {nombreDeItem(l.item_vendible_id)}
        </span>
      ),
    },
    {
      clave: 'raza_id',
      titulo: 'Raza',
      render: (l) => nombreDeRaza(l.raza_id),
    },
    {
      clave: 'cantidad',
      titulo: 'Cantidad',
      className: 'text-right font-mono tabular-nums',
    },
    {
      clave: 'precio_unitario',
      titulo: `Precio (${moneda})`,
      className: 'text-right font-mono tabular-nums',
      render: (l) => formatearImporte(l.precio_unitario),
    },
    {
      clave: 'id',
      titulo: 'Subtotal',
      className: 'text-right font-mono tabular-nums',
      render: (l) =>
        formatearImporte(importeDeLinea(l.precio_unitario, l.cantidad)),
    },
  ]
}

/** El 409 stock_insuficiente, raza por raza. El flujo para resolverlo
 *  (ver la disponibilidad, achicar el pedido) es del #14. */
function ErrorDeReserva({
  error,
  nombreDeRaza,
}: {
  error: unknown
  nombreDeRaza: (id: string) => string
}) {
  const faltantes = faltantesDeStock(error)
  if (!faltantes) return <ErrorDePantalla error={describirError(error)} />
  return (
    <div role="alert" className={ALERTA}>
      <p className="font-medium">
        No hay reinas suficientes para reservar el pedido.
      </p>
      <ul className="mt-1 list-disc pl-5">
        {faltantes.map((f) => (
          <li key={f.raza_id}>
            {nombreDeRaza(f.raza_id)}: pide {f.pedidas}, hay {f.disponible}{' '}
            (faltan {f.faltan}).
          </li>
        ))}
      </ul>
      <p className="mt-1 text-texto-suave">
        No se reservó nada: se reserva todo el pedido o nada.
      </p>
    </div>
  )
}

export default function PedidoPage() {
  const { id = '' } = useParams()
  const { state } = useLocation()
  const { identidad } = useSesion()
  const consultas = useQueryClient()
  // La clave de idempotencia de la cancelación en curso, o null si no se
  // está confirmando. Se fija al abrir, como en las altas.
  const [cancelacion, setCancelacion] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  const pedido = useQuery({
    queryKey: [CLAVE_PEDIDOS, 'detalle', id],
    queryFn: () => pedidos.obtener(id),
  })
  const clientes = useQuery({
    queryKey: CLAVE_CLIENTES_CON_BAJAS,
    queryFn: clientesConBajas,
  })
  const items = useQuery({
    queryKey: CLAVE_ITEMS_CON_BAJAS,
    queryFn: itemsConBajas,
  })
  const razas = useQuery({
    queryKey: CLAVE_RAZAS_CON_BAJAS,
    queryFn: razasConBajas,
  })

  // Un cambio de estado refresca el detalle y todas las vistas del listado.
  const alCambiar = () =>
    consultas.invalidateQueries({ queryKey: [CLAVE_PEDIDOS] })
  const reservar = useMutation({
    mutationFn: () => pedidos.reservar(id),
    onSuccess: async (reservas) => {
      await alCambiar()
      const reinas = reservas.reduce((total, r) => total + r.cantidad, 0)
      setAviso(`Pedido reservado: ${reinas} reinas apartadas.`)
    },
  })
  const cancelar = useMutation({
    mutationFn: (clave: string) => pedidos.cancelar(id, clave),
    onSuccess: async () => {
      await alCambiar()
      setCancelacion(null)
      setAviso('Pedido cancelado.')
    },
  })
  const abrirCancelacion = () => {
    // Que no queden a la vista errores de intentos anteriores.
    cancelar.reset()
    reservar.reset()
    setCancelacion(crypto.randomUUID())
  }
  const cerrarCancelacion = () => !cancelar.isPending && setCancelacion(null)

  const filtros = (state as DesdeElListado | null)?.filtros
  const volver = (
    <Link
      to={{ pathname: '/ventas/pedidos', search: filtros }}
      className="inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto focus-visible:outline-2 focus-visible:outline-acento"
    >
      <ArrowLeft className="size-4" aria-hidden /> Pedidos
    </Link>
  )

  const todas = [pedido, clientes, items, razas]
  if (todas.some((c) => c.isPending))
    return (
      <section className="space-y-seccion">
        {volver}
        <Cargando columnas={5} filas={3} />
      </section>
    )
  const fallo = todas.find((c) => c.isError)
  if (fallo || !pedido.data)
    return (
      <section className="space-y-seccion">
        {volver}
        <ErrorDePantalla
          error={describirError(fallo?.error)}
          reintentar={() => todas.forEach((c) => void c.refetch())}
        />
      </section>
    )

  const p: Pedido = pedido.data
  const nombre = <T extends { id: string; nombre: string }>(
    filas: readonly T[] | undefined,
    otro: string,
  ) => {
    const nombres = new Map(filas?.map((f) => [f.id, f.nombre]))
    return (id: string) => nombres.get(id) ?? otro
  }
  const nombreDeCliente = nombre(clientes.data, 'Cliente desconocido')
  const nombreDeItem = nombre(items.data, 'Ítem desconocido')
  const nombreDeRaza = nombre(razas.data, 'Raza desconocida')

  const escribe = puede(identidad, ROLES_VENTAS)
  const ocupado = reservar.isPending || cancelar.isPending
  const total = sumarImportes(
    p.items.map((l) => importeDeLinea(l.precio_unitario, l.cantidad)),
  )
  const destino = p.destino_pais
    ? `${nombreDePais(p.destino_pais)}${p.incoterm ? ` · ${p.incoterm}` : ''}`
    : 'Nacional'

  // Entregar (con los bancos de cada línea) llega con DespachoDePedido.
  const acciones = escribe ? (
    <>
      {puedePasar(p.estado, 'reservado') ? (
        <Button
          cargando={reservar.isPending}
          disabled={ocupado}
          onClick={() => reservar.mutate()}
        >
          <PackageCheck className="size-4" aria-hidden /> Reservar
        </Button>
      ) : null}
      {puedePasar(p.estado, 'cancelado') ? (
        <Button
          variante="secundario"
          disabled={ocupado}
          onClick={abrirCancelacion}
        >
          <Ban className="size-4" aria-hidden /> Cancelar pedido
        </Button>
      ) : null}
    </>
  ) : undefined

  return (
    <section className="space-y-seccion">
      {volver}
      <EncabezadoDePagina
        titulo={`Pedido de ${nombreDeCliente(p.cliente_id)}`}
        descripcion={`Entrega solicitada: ${p.fecha_entrega_solicitada} · ${destino} · ${p.moneda}`}
        acciones={acciones}
      />
      <div className="flex flex-wrap items-center gap-2">
        <EstadoDePedido estado={p.estado} />
        <span className="text-sm text-texto-suave">{resumenDeLineas(p)}</span>
        <p role="status" className="text-sm text-ok-texto">
          {aviso}
        </p>
      </div>

      {reservar.isError ? (
        <ErrorDeReserva error={reservar.error} nombreDeRaza={nombreDeRaza} />
      ) : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Líneas</h2>
        <DataTable
          columnas={columnas(nombreDeItem, nombreDeRaza, p.moneda)}
          // En el orden en que se cargaron.
          filas={[...p.items].sort((a, b) => a.numero_linea - b.numero_linea)}
          porPagina={Math.max(p.items.length, 1)}
          // Un pedido tiene al menos una línea (min_length=1 del backend).
          vacio={null}
        />
        <p className="text-right text-sm text-texto">
          Total sin IVA:{' '}
          <span className="font-mono font-semibold tabular-nums">
            {p.moneda} {formatearImporte(total)}
          </span>
        </p>
      </div>

      <Modal
        open={cancelacion !== null}
        onOpenChange={(abierto) => !abierto && cerrarCancelacion()}
      >
        {cancelacion ? (
          <ModalContenido
            titulo="¿Cancelar el pedido?"
            descripcion={
              p.estado === 'reservado'
                ? 'Se liberan las reinas reservadas. No se puede deshacer.'
                : 'No se puede deshacer.'
            }
          >
            {cancelar.isError ? (
              <ErrorDePantalla error={describirError(cancelar.error)} />
            ) : null}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variante="secundario"
                disabled={cancelar.isPending}
                onClick={cerrarCancelacion}
              >
                Volver
              </Button>
              <Button
                variante="peligro"
                cargando={cancelar.isPending}
                onClick={() => cancelar.mutate(cancelacion)}
              >
                Cancelar pedido
              </Button>
            </div>
          </ModalContenido>
        ) : null}
      </Modal>
    </section>
  )
}
