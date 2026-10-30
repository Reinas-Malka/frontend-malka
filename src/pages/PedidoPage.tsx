import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, PackageCheck, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { describirError, esApiError } from '@/api/client'
import { disponibilidad } from '@/api/disponibilidad'
import { pedidos } from '@/api/pedidos'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'
import { Modal, ModalContenido } from '@/components/ui/modal'
import { DataTable, type Columna } from '@/components/ui/table'
import { formatearImporte } from '@/lib/importes'
import { nombreDePais } from '@/lib/paises'
import { puedePasar } from '@/lib/pedidos'
import { DespachoDePedido } from '@/modulos/ventas/DespachoDePedido'
import { EstadoDePedido } from '@/modulos/ventas/insignias'
import { TrazabilidadDePedido } from '@/modulos/ventas/TrazabilidadDePedido'
import {
  CLAVE_CLIENTES_CON_BAJAS,
  CLAVE_DISPONIBILIDAD,
  CLAVE_ITEMS_CON_BAJAS,
  CLAVE_PEDIDOS,
  CLAVE_RAZAS_CON_BAJAS,
  ROLES_VENTAS,
  clientesConBajas,
  type DesdeElListado,
  type DisponibleDeLinea,
  disponiblePorLinea,
  faltantesDeStock,
  itemsConBajas,
  razasConBajas,
  resumenDeLineas,
} from '@/modulos/ventas/pedidos'
import type { Despacho, Moneda, Pedido, PedidoItem } from '@/tipos/dominio'

const ALERTA =
  'rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto'

/** Una línea con el disponible de su raza; undefined fuera de un borrador
 *  o mientras se lee. */
type FilaDeLinea = PedidoItem & { disponible?: DisponibleDeLinea }

/** El disponible de la raza de la línea. Si no alcanza lo dice con texto,
 *  no solo con color. */
function Disponible({ de }: { de: DisponibleDeLinea | undefined }) {
  if (!de) return <span className="text-texto-suave">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      {de.disponible}
      {de.faltan > 0 ? <Badge tono="peligro">Faltan {de.faltan}</Badge> : null}
    </span>
  )
}

function columnas(
  nombreDeItem: (id: string) => string,
  nombreDeRaza: (id: string) => string,
  moneda: Moneda,
  conDisponible: boolean,
): Columna<FilaDeLinea>[] {
  const disponible: Columna<FilaDeLinea>[] = conDisponible
    ? [
        {
          clave: 'disponible',
          titulo: 'Disponible',
          className: 'text-right font-mono tabular-nums',
          render: (l) => <Disponible de={l.disponible} />,
        },
      ]
    : []
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
    ...disponible,
    {
      clave: 'precio_unitario',
      titulo: `Precio (${moneda})`,
      className: 'text-right font-mono tabular-nums',
      render: (l) => formatearImporte(l.precio_unitario),
    },
    {
      clave: 'neto',
      titulo: 'Neto',
      className: 'text-right font-mono tabular-nums',
      render: (l) => formatearImporte(l.neto),
    },
  ]
}

/** El 409 stock_insuficiente, raza por raza. El flujo para resolverlo
 *  (ver la disponibilidad, achicar el pedido) es del #14. Con reintentar,
 *  ofrece volver a intentar con la misma Idempotency-Key. */
function ErrorDeReserva({
  error,
  nombreDeRaza,
  reintentar,
}: {
  error: unknown
  nombreDeRaza: (id: string) => string
  /** Solo si el pedido sigue en borrador y quien mira puede reservar. */
  reintentar?: () => void
}) {
  const faltantes = faltantesDeStock(error)
  if (!faltantes)
    return (
      <ErrorDePantalla error={describirError(error)} reintentar={reintentar} />
    )
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
      {reintentar ? (
        <>
          <p className="mt-1 text-texto-suave">
            Otra reserva pudo haberse adelantado: el disponible de cada línea ya
            está actualizado.
          </p>
          <Button variante="secundario" className="mt-2" onClick={reintentar}>
            Reintentar
          </Button>
        </>
      ) : null}
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
  // Lo mismo para la entrega: la clave del despacho en curso, o null.
  const [entrega, setEntrega] = useState<string | null>(null)
  // Y para la reserva: se fija en el primer intento y se repite en cada
  // reintento hasta que reserva. Si la respuesta se perdió, el backend
  // devuelve las reservas ya hechas en lugar de un 409.
  const [intentoDeReserva, setIntentoDeReserva] = useState<string | null>(null)
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
  // Al lado de cada línea de un borrador, el disponible de su raza (#14). Es
  // la consulta del despacho: reservar, entregar y cancelar la refrescan.
  const stock = useQuery({
    queryKey: [CLAVE_DISPONIBILIDAD],
    queryFn: () => disponibilidad.listar(),
    enabled: pedido.data?.estado === 'borrador',
  })

  // Un cambio de estado refresca el detalle, todas las vistas del listado y
  // la disponibilidad (reservar, entregar y cancelar la cambian).
  const alCambiar = () =>
    Promise.all([
      consultas.invalidateQueries({ queryKey: [CLAVE_PEDIDOS] }),
      consultas.invalidateQueries({ queryKey: [CLAVE_DISPONIBILIDAD] }),
    ])
  const reservar = useMutation({
    mutationFn: (clave: string) => pedidos.reservar(id, clave),
    // Un 409 dice que el pedido o el stock ya no están como se ven (otra
    // reserva se adelantó): se refrescan para reintentar con lo nuevo.
    onError: (error) => {
      if (esApiError(error) && error.status === 409) void alCambiar()
    },
    onSuccess: async (reservas) => {
      await alCambiar()
      setIntentoDeReserva(null)
      const reinas = reservas.reduce((total, r) => total + r.cantidad, 0)
      setAviso(`Pedido reservado: ${reinas} reinas apartadas.`)
    },
  })
  const intentarReserva = () => {
    const clave = intentoDeReserva ?? crypto.randomUUID()
    setIntentoDeReserva(clave)
    reservar.mutate(clave)
  }
  const cancelar = useMutation({
    mutationFn: (clave: string) => pedidos.cancelar(id, clave),
    onSuccess: async () => {
      await alCambiar()
      setCancelacion(null)
      setAviso('Pedido cancelado.')
    },
  })
  const entregar = useMutation({
    mutationFn: ({ despacho, clave }: { despacho: Despacho; clave: string }) =>
      pedidos.entregar(id, despacho, clave),
    onSuccess: async (entregado) => {
      await alCambiar()
      setEntrega(null)
      const reinas = entregado.items.reduce((total, l) => total + l.cantidad, 0)
      setAviso(`Pedido entregado: ${reinas} reinas despachadas.`)
    },
  })
  const cerrarEntrega = () => !entregar.isPending && setEntrega(null)

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
  const ocupado = reservar.isPending || entregar.isPending || cancelar.isPending
  const lineas = [...p.items].sort((a, b) => a.numero_linea - b.numero_linea)
  const borrador = p.estado === 'borrador'
  const porLinea =
    borrador && stock.data ? disponiblePorLinea(p, stock.data) : null
  const filas: FilaDeLinea[] = lineas.map((l) => ({
    ...l,
    disponible: porLinea?.get(l.id),
  }))
  const nombreDeLinea = (pedidoItemId: string) => {
    const linea = lineas.find((l) => l.id === pedidoItemId)
    return linea
      ? `Línea ${linea.numero_linea} · ${nombreDeItem(linea.item_vendible_id)} · ${nombreDeRaza(linea.raza_id)}`
      : 'Línea desconocida'
  }
  // Los calcula el backend en cada lectura (#113): acá solo se muestran.
  const importes = [
    { nombre: 'Neto', valor: p.neto },
    { nombre: 'IVA', valor: p.iva },
    { nombre: 'Total', valor: p.total },
  ]
  const destino = p.destino_pais
    ? `${nombreDePais(p.destino_pais)}${p.incoterm ? ` · ${p.incoterm}` : ''}`
    : 'Nacional'

  const acciones = escribe ? (
    <>
      {puedePasar(p.estado, 'entregado') ? (
        <Button
          disabled={ocupado}
          onClick={() => setEntrega(crypto.randomUUID())}
        >
          <Truck className="size-4" aria-hidden /> Entregar
        </Button>
      ) : null}
      {puedePasar(p.estado, 'reservado') ? (
        <Button
          cargando={reservar.isPending}
          disabled={ocupado}
          onClick={intentarReserva}
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
        <ErrorDeReserva
          error={reservar.error}
          nombreDeRaza={nombreDeRaza}
          reintentar={
            escribe && puedePasar(p.estado, 'reservado')
              ? intentarReserva
              : undefined
          }
        />
      ) : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Líneas</h2>
        {/* Falla por su cuenta: sin el disponible, el pedido se sigue viendo. */}
        {borrador && stock.isError ? (
          <ErrorDePantalla
            error={describirError(stock.error)}
            reintentar={() => void stock.refetch()}
          />
        ) : null}
        <DataTable
          columnas={columnas(nombreDeItem, nombreDeRaza, p.moneda, borrador)}
          // En el orden en que se cargaron.
          filas={filas}
          porPagina={Math.max(p.items.length, 1)}
          // Un pedido tiene al menos una línea (min_length=1 del backend).
          vacio={null}
        />
        <dl className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
          {importes.map(({ nombre, valor }) => (
            <div key={nombre} className="contents">
              <dt
                className={
                  nombre === 'Total'
                    ? 'font-semibold text-texto'
                    : 'text-texto-suave'
                }
              >
                {nombre}
              </dt>
              <dd className="text-right font-mono tabular-nums text-texto">
                {p.moneda} {formatearImporte(valor)}
              </dd>
            </div>
          ))}
        </dl>
        {/* Como el backend: exportación si y solo si no es en pesos. */}
        {p.moneda !== 'ARS' ? (
          <p className="text-right text-xs text-texto-suave">
            Exportación: sin IVA.
          </p>
        ) : null}
      </div>

      <TrazabilidadDePedido pedido={p} nombreDeLinea={nombreDeLinea} />

      <Modal
        open={entrega !== null}
        // Mientras guarda no se cierra: el resultado tiene que verse.
        onOpenChange={(abierto) => !abierto && cerrarEntrega()}
      >
        {entrega ? (
          <ModalContenido
            titulo="Entregar el pedido"
            descripcion="Por cada línea, de qué bancos salen las reinas. Sale todo lo reservado: no hay entrega parcial."
            className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
          >
            <DespachoDePedido
              key={entrega}
              pedido={p}
              nombreDeItem={nombreDeItem}
              nombreDeRaza={nombreDeRaza}
              alGuardar={(despacho) =>
                entregar.mutateAsync({ despacho, clave: entrega })
              }
              alCancelar={cerrarEntrega}
            />
          </ModalContenido>
        ) : null}
      </Modal>

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
