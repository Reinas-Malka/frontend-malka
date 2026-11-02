import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, ExternalLink, Info } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { describirError, esApiError } from '@/api/client'
import { comprobantes } from '@/api/comprobantes'
import { pedirDescarga } from '@/api/documentos'
import { useSesion } from '@/auth/useSesion'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Button } from '@/components/ui/button'
import { Card, CardTitulo } from '@/components/ui/card'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { formatearTipoDeCambio, nombreDeComprobante } from '@/lib/comprobantes'
import { formatearFecha, formatearFechaHora } from '@/lib/fechas'
import { formatearImporte } from '@/lib/importes'
import {
  CLAVE_COMPROBANTES,
  documentoDelCliente,
  NOMBRE_DE_MONEDA,
  quienLoCargo,
} from '@/modulos/ventas/comprobantes'
import {
  CLAVE_CLIENTES_CON_BAJAS,
  clientesConBajas,
  type DesdeElListado,
} from '@/modulos/ventas/pedidos'
import type { Comprobante } from '@/tipos/dominio'

const ALERTA =
  'rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto'
const ENLACE =
  'text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento'

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-texto-suave">{nombre}</dt>
      <dd className="min-w-0 break-words text-texto">{children}</dd>
    </div>
  )
}

/** Abrir o bajar el PDF. La URL vence en 2 minutos: se pide recién al tocar. */
function PdfDelComprobante({ comprobante }: { comprobante: Comprobante }) {
  const [enCurso, setEnCurso] = useState<'abrir' | 'descargar' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function abrir() {
    setError(null)
    setEnCurso('abrir')
    // La pestaña se abre ya, en el clic: abierta después de esperar la URL,
    // el navegador la bloquea como ventana emergente.
    const pestana = window.open('', '_blank')
    try {
      const { url_descarga } = await pedirDescarga(comprobante.archivo_s3_key, {
        enLinea: true,
      })
      if (pestana) {
        pestana.opener = null
        pestana.location.href = url_descarga
      } else window.open(url_descarga, '_blank', 'noopener')
    } catch (e) {
      pestana?.close()
      setError(describirError(e).mensaje)
    } finally {
      setEnCurso(null)
    }
  }

  async function descargar() {
    setError(null)
    setEnCurso('descargar')
    try {
      const { url_descarga } = await pedirDescarga(comprobante.archivo_s3_key)
      window.location.assign(url_descarga)
    } catch (e) {
      setError(describirError(e).mensaje)
    } finally {
      setEnCurso(null)
    }
  }

  const nombre = nombreDeComprobante(comprobante)
  return (
    <Card className="space-y-3">
      <CardTitulo>PDF del comprobante</CardTitulo>
      <p className="text-sm text-texto-suave">
        El que emitió ARCA y se subió al cargarlo.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variante="secundario"
          aria-label={`Abrir el PDF de la ${nombre} en otra pestaña`}
          cargando={enCurso === 'abrir'}
          disabled={enCurso !== null}
          onClick={() => void abrir()}
        >
          <ExternalLink className="size-4" aria-hidden /> Abrir
        </Button>
        <Button
          variante="secundario"
          aria-label={`Descargar el PDF de la ${nombre}`}
          cargando={enCurso === 'descargar'}
          disabled={enCurso !== null}
          onClick={() => void descargar()}
        >
          <Download className="size-4" aria-hidden /> Descargar
        </Button>
      </div>
      {error ? (
        <p role="alert" className={ALERTA}>
          {error}
        </p>
      ) : null}
    </Card>
  )
}

/** Todo lo que se transcribió de un comprobante, tal como quedó. */
export default function ComprobantePage() {
  const { id = '' } = useParams()
  const { state } = useLocation()
  const { identidad } = useSesion()

  const comprobante = useQuery({
    queryKey: [CLAVE_COMPROBANTES, 'detalle', id],
    queryFn: () => comprobantes.obtener(id),
  })
  // Con las bajas: un cliente dado de baja conserva su facturación.
  const clientes = useQuery({
    queryKey: CLAVE_CLIENTES_CON_BAJAS,
    queryFn: clientesConBajas,
  })

  const filtros = (state as DesdeElListado | null)?.filtros
  const volver = (
    <Link
      to={{ pathname: '/ventas/comprobantes', search: filtros }}
      className="inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto focus-visible:outline-2 focus-visible:outline-acento"
    >
      <ArrowLeft className="size-4" aria-hidden /> Comprobantes
    </Link>
  )

  if (comprobante.isPending || clientes.isPending)
    return (
      <section className="space-y-seccion">
        {volver}
        <Cargando columnas={2} filas={6} />
      </section>
    )
  if (esApiError(comprobante.error) && comprobante.error.status === 404)
    return (
      <section className="space-y-seccion">
        {volver}
        <Vacio titulo="No encontramos este comprobante">
          Puede que el enlace esté mal o que sea de otro criadero.
        </Vacio>
      </section>
    )
  const fallo = comprobante.error ?? clientes.error
  if (fallo || !comprobante.data || !clientes.data)
    return (
      <section className="space-y-seccion">
        {volver}
        <ErrorDePantalla
          error={describirError(fallo)}
          reintentar={() => {
            void comprobante.refetch()
            void clientes.refetch()
          }}
        />
      </section>
    )

  const c = comprobante.data
  const cliente = clientes.data.find((cl) => cl.id === c.cliente_id)
  const nombre = nombreDeComprobante(c)
  const documento = cliente ? documentoDelCliente(cliente) : null

  return (
    <section className="space-y-seccion">
      {volver}
      <EncabezadoDePagina
        titulo={nombre}
        descripcion={`Emitida el ${formatearFecha(c.fecha_emision)}${cliente ? ` a ${cliente.nombre}` : ''}.`}
      />

      <p className="flex items-start gap-2 rounded-control border border-borde bg-panel p-3 text-sm text-texto-suave">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        Los comprobantes no se editan: si hay un error, se corrige en ARCA con
        una nota de crédito.
      </p>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="space-y-3">
          <CardTitulo>Datos transcriptos</CardTitulo>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Dato nombre="Comprobante">
              <span className="tabular-nums">{nombre}</span>
            </Dato>
            <Dato nombre="Cliente">
              {cliente ? (
                <>
                  <span className="block font-medium">
                    {cliente.nombre}
                    {cliente.activo ? '' : ' (dado de baja)'}
                  </span>
                  {documento ? (
                    <span className="block tabular-nums text-texto-suave">
                      {documento}
                    </span>
                  ) : null}
                  <Link
                    to={{
                      pathname: '/ventas/comprobantes',
                      search: `?cliente=${encodeURIComponent(cliente.id)}`,
                    }}
                    className={ENLACE}
                  >
                    Ver sus comprobantes
                  </Link>
                </>
              ) : (
                'Cliente desconocido'
              )}
            </Dato>
            <Dato nombre="Fecha de emisión">
              <span className="tabular-nums">
                {formatearFecha(c.fecha_emision)}
              </span>
            </Dato>
            <Dato nombre="Moneda">{NOMBRE_DE_MONEDA[c.moneda]}</Dato>
            <Dato nombre="Importe total">
              <span className="tabular-nums">
                {c.moneda} {formatearImporte(c.importe)}
              </span>
            </Dato>
            {c.tipo_cambio ? (
              <Dato nombre="Tipo de cambio">
                <span className="tabular-nums">
                  {formatearTipoDeCambio(c.tipo_cambio)} pesos por {c.moneda}
                </span>
              </Dato>
            ) : null}
            <Dato nombre="Cargado">
              por {quienLoCargo(c.cargado_por, identidad)} el{' '}
              <span className="tabular-nums">
                {formatearFechaHora(c.creado_en)}
              </span>
            </Dato>
          </dl>
        </Card>

        <PdfDelComprobante comprobante={c} />
      </div>
    </section>
  )
}
