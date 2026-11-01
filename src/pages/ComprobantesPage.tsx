import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { describirError } from '@/api/client'
import { comprobantes } from '@/api/comprobantes'
import { pedirDescarga } from '@/api/documentos'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { Field } from '@/components/ui/label'
import { Modal, ModalContenido } from '@/components/ui/modal'
import {
  Select,
  SelectContenido,
  SelectOpcion,
  SelectTrigger,
  SelectValor,
} from '@/components/ui/select'
import { DataTable, type Columna } from '@/components/ui/table'
import { formatearTipoDeCambio, nombreDeComprobante } from '@/lib/comprobantes'
import { formatearFecha } from '@/lib/fechas'
import { formatearImporte } from '@/lib/importes'
import {
  CLAVE_COMPROBANTES,
  leerFiltrosDeComprobantes,
} from '@/modulos/ventas/comprobantes'
import { FormularioDeComprobante } from '@/modulos/ventas/FormularioDeComprobante'
import {
  CLAVE_CLIENTES_CON_BAJAS,
  ROLES_VENTAS,
  TODOS,
  clientesConBajas,
} from '@/modulos/ventas/pedidos'
import type { Comprobante, ComprobanteCrear } from '@/tipos/dominio'

type Descarga = {
  enCurso: string | null
  descargar: (c: Comprobante) => void
}

function columnas(
  nombreDe: (id: string) => string,
  { enCurso, descargar }: Descarga,
): Columna<Comprobante>[] {
  return [
    {
      clave: 'numero',
      titulo: 'Comprobante',
      render: (c) => (
        <span className="whitespace-nowrap font-medium tabular-nums">
          {nombreDeComprobante(c)}
        </span>
      ),
    },
    {
      clave: 'fecha_emision',
      titulo: 'Emisión',
      render: (c) => (
        <span className="tabular-nums">{formatearFecha(c.fecha_emision)}</span>
      ),
      orden: (a, b) => a.fecha_emision.localeCompare(b.fecha_emision),
    },
    {
      clave: 'cliente_id',
      titulo: 'Cliente',
      render: (c) => nombreDe(c.cliente_id),
      orden: (a, b) =>
        nombreDe(a.cliente_id).localeCompare(nombreDe(b.cliente_id)),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      render: (c) => (
        <span className="tabular-nums">
          {c.moneda} {formatearImporte(c.importe)}
          {c.tipo_cambio ? (
            <span className="block text-xs text-texto-suave">
              Tipo de cambio {formatearTipoDeCambio(c.tipo_cambio)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      clave: 'archivo_s3_key',
      titulo: 'PDF',
      enTarjeta: 'acciones',
      render: (c) => (
        <Button
          tamano="chico"
          variante="secundario"
          aria-label={`Descargar el PDF de la ${nombreDeComprobante(c)}`}
          cargando={enCurso === c.id}
          onClick={() => descargar(c)}
        >
          <Download className="size-4" aria-hidden /> Descargar
        </Button>
      ),
    },
  ]
}

export default function ComprobantesPage() {
  const [params, setParams] = useSearchParams()
  const filtros = leerFiltrosDeComprobantes(params)
  const { identidad } = useSesion()
  const escribe = puede(identidad, ROLES_VENTAS)
  // La clave de idempotencia del alta en curso, o null si no hay modal. Se
  // fija al abrir: si el guardado se reintenta, el backend no duplica.
  const [alta, setAlta] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [descargando, setDescargando] = useState<string | null>(null)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)

  const clientes = useQuery({
    queryKey: CLAVE_CLIENTES_CON_BAJAS,
    queryFn: clientesConBajas,
  })
  // El filtro lo aplica el backend; cada cliente es otra consulta.
  const listado = useInfiniteQuery({
    queryKey: [CLAVE_COMPROBANTES, filtros],
    queryFn: ({ pageParam }) => comprobantes.listar(filtros, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.siguiente ?? undefined,
  })

  const consultas = useQueryClient()
  const crear = useMutation({
    mutationFn: ({
      datos,
      clave,
    }: {
      datos: ComprobanteCrear
      clave: string
    }) => comprobantes.crear(datos, clave),
    onSuccess: () =>
      consultas.invalidateQueries({ queryKey: [CLAVE_COMPROBANTES] }),
  })

  async function guardar(datos: ComprobanteCrear) {
    const enCurso = alta
    if (!enCurso) return
    const creado = await crear.mutateAsync({ datos, clave: enCurso })
    setAviso(`${nombreDeComprobante(creado)} cargada.`)
    // Solo cierra el modal que inició este guardado.
    setAlta((actual) => (actual === enCurso ? null : actual))
  }
  const cerrarAlta = () => !crear.isPending && setAlta(null)

  // La URL vence en 2 minutos: se pide recién al tocar, nunca antes.
  async function descargar(c: Comprobante) {
    setDescargando(c.id)
    setErrorDescarga(null)
    try {
      const { url_descarga } = await pedirDescarga(c.archivo_s3_key)
      window.location.assign(url_descarga)
    } catch (error) {
      setErrorDescarga(describirError(error).mensaje)
    } finally {
      setDescargando(null)
    }
  }

  const filtrarPorCliente = (valor: string) =>
    setParams(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        if (valor === TODOS) nuevos.delete('cliente')
        else nuevos.set('cliente', valor)
        return nuevos
      },
      { replace: true },
    )

  const nombres = new Map(clientes.data?.map((c) => [c.id, c.nombre]))
  const nombreDe = (id: string) => nombres.get(id) ?? 'Cliente desconocido'
  const filas = listado.data?.pages.flatMap((pagina) => pagina.items) ?? []
  const error = (!listado.data && listado.error) || clientes.error

  const nuevo = (
    <Button onClick={() => setAlta(crypto.randomUUID())}>
      <Plus aria-hidden className="size-4" /> Cargar comprobante
    </Button>
  )

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo="Comprobantes"
        descripcion="Las facturas A, B y E que ya emitió ARCA, transcriptas con su PDF. De la emisión más nueva a la más vieja."
        acciones={escribe ? nuevo : undefined}
      />

      <div className="lg:max-w-sm">
        <Field label="Cliente" htmlFor="filtro-cliente">
          <Select
            value={filtros.cliente_id ?? TODOS}
            onValueChange={filtrarPorCliente}
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

      <p role="status" className="text-sm text-ok-texto">
        {aviso}
      </p>

      {listado.isPending || clientes.isPending ? (
        <Cargando columnas={5} />
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
            columnas={columnas(nombreDe, {
              enCurso: descargando,
              descargar: (c) => void descargar(c),
            })}
            filas={filas}
            // Una sola página en pantalla: las siguientes llegan con "Cargar más".
            porPagina={Math.max(filas.length, 1)}
            vacio={
              filtros.cliente_id ? (
                <Vacio
                  titulo="Este cliente todavía no tiene comprobantes"
                  accion={
                    <Button
                      variante="secundario"
                      onClick={() => filtrarPorCliente(TODOS)}
                    >
                      Ver todos los comprobantes
                    </Button>
                  }
                />
              ) : (
                <Vacio
                  titulo="Todavía no hay comprobantes"
                  accion={escribe ? nuevo : undefined}
                >
                  Cada factura se emite en ARCA y acá se transcribe: letra,
                  punto de venta, número, importe y el PDF.
                </Vacio>
              )
            }
          />
          {errorDescarga ? (
            <p
              role="alert"
              className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
            >
              {errorDescarga}
            </p>
          ) : null}
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
              Cargar más comprobantes
            </Button>
          ) : null}
        </div>
      )}

      <Modal
        open={alta !== null}
        // Mientras guarda no se cierra: el resultado tiene que verse.
        onOpenChange={(abierto) => !abierto && cerrarAlta()}
      >
        {alta ? (
          <ModalContenido
            titulo="Cargar comprobante"
            descripcion="Copiá los datos tal como figuran en el comprobante que emitió ARCA. Una vez cargado no se edita."
            className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
          >
            <FormularioDeComprobante
              key={alta}
              alGuardar={guardar}
              alCancelar={cerrarAlta}
            />
          </ModalContenido>
        ) : null}
      </Modal>
    </section>
  )
}
