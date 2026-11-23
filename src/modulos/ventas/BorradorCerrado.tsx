import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  Download,
  ExternalLink,
  FilePlus2,
  History,
  Lock,
  Sparkles,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { borradores } from '@/api/borradores'
import { describirError } from '@/api/client'
import { comprobantes } from '@/api/comprobantes'
import { useSesion } from '@/auth/useSesion'
import { Button } from '@/components/ui/button'
import { abrirEnOtraPestana, bajarArchivo } from '@/documentos/abrirDescarga'
import { nombreDeComprobante } from '@/lib/comprobantes'
import { formatearFechaHora, ZONA_ARGENTINA } from '@/lib/fechas'
import {
  claveDeBorrador,
  claveDeRevisiones,
  diaYMes,
  type PedidoDelDocumento,
  versionCorta,
} from '@/modulos/ventas/borradores'
import { CLAVE_COMPROBANTES, quienLoCargo } from '@/modulos/ventas/comprobantes'
import type { AccionDeGenerar } from '@/modulos/ventas/DetalleDeBorrador'
import { DocumentoDelBorrador } from '@/modulos/ventas/DocumentoDelBorrador'
import type { Borrador, EntradaDeBitacora } from '@/tipos/dominio'

const ALERTA =
  'rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto'
const ENLACE =
  'text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento'

const fechaHora = (fecha: string) => formatearFechaHora(fecha, ZONA_ARGENTINA)

/** La bitácora del borrador (quién aprobó o descartó, cuándo y sobre qué
 *  versión). La comparten la vista del cerrado y el historial. */
function useRevisiones(id: string) {
  return useQuery({
    queryKey: claveDeRevisiones(id),
    queryFn: () => borradores.revisiones(id),
  })
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-texto-suave">{nombre}</dt>
      <dd className="min-w-0 break-words text-texto">{children}</dd>
    </div>
  )
}

/** "Corrige al borrador del 01/11": el aprobado que este reemplaza, con un
 *  botón para verlo si la lista lo permite. */
export function AvisoDeCorreccion({
  corrigeA,
  alElegir,
}: {
  corrigeA: string
  alElegir?: (id: string) => void
}) {
  const original = useQuery({
    queryKey: claveDeBorrador(corrigeA),
    queryFn: () => borradores.obtener(corrigeA),
  })
  const texto = original.data
    ? `Corrige al borrador del ${diaYMes(original.data.creado_en)}`
    : 'Corrige a un borrador aprobado'
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-control border border-miel-600/40 bg-miel-500/10 px-3 py-2 text-sm text-texto">
      <FilePlus2 className="size-4 text-miel-300" aria-hidden />
      <span>{texto}.</span>
      {alElegir ? (
        <button
          type="button"
          className={ENLACE}
          onClick={() => alElegir(corrigeA)}
        >
          Ver el original
        </button>
      ) : null}
    </p>
  )
}

/** Abrir o bajar el PDF interno del aprobado. La URL es nueva cada vez y
 *  vence en minutos: se pide recién al tocar. */
function PdfDelBorrador({ borrador }: { borrador: Borrador }) {
  const [enCurso, setEnCurso] = useState<'abrir' | 'descargar' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function hacer(accion: 'abrir' | 'descargar') {
    setError(null)
    setEnCurso(accion)
    try {
      if (accion === 'abrir')
        await abrirEnOtraPestana(
          async () =>
            (await borradores.pdf(borrador.id, { enLinea: true })).url_descarga,
        )
      else {
        const { url_descarga } = await borradores.pdf(borrador.id)
        bajarArchivo(
          url_descarga,
          `borrador-aprobado-${diaYMes(borrador.aprobado_en ?? borrador.creado_en).replace('/', '-')}.pdf`,
        )
      }
    } catch (e) {
      setError(describirError(e).mensaje)
    } finally {
      setEnCurso(null)
    }
  }

  if (!borrador.pdf_disponible)
    return (
      <p className="text-sm text-texto-suave">
        El PDF todavía no está disponible.
      </p>
    )
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variante="secundario"
          cargando={enCurso === 'abrir'}
          disabled={enCurso !== null}
          onClick={() => void hacer('abrir')}
        >
          <ExternalLink className="size-4" aria-hidden /> Abrir PDF
        </Button>
        <Button
          variante="secundario"
          cargando={enCurso === 'descargar'}
          disabled={enCurso !== null}
          onClick={() => void hacer('descargar')}
        >
          <Download className="size-4" aria-hidden /> Descargar PDF
        </Button>
      </div>
      <p className="text-xs text-texto-suave">
        PDF interno del borrador aprobado. No es un comprobante fiscal: la
        factura la emite ARCA.
      </p>
      {error ? (
        <p role="alert" className={ALERTA}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** El comprobante vinculado al aprobar, con enlace a su detalle. */
function ComprobanteVinculado({ id }: { id: string }) {
  const comprobante = useQuery({
    queryKey: [CLAVE_COMPROBANTES, 'detalle', id],
    queryFn: () => comprobantes.obtener(id),
  })
  return (
    <Link to={`/ventas/comprobantes/${id}`} className={ENLACE}>
      {comprobante.data
        ? nombreDeComprobante(comprobante.data)
        : 'Ver el comprobante'}
    </Link>
  )
}

/** Un aprobado: quién y cuándo, el comprobante vinculado, el PDF interno y
 *  el texto congelado. No se edita: se corrige con un borrador nuevo. */
export function BorradorAprobado({
  borrador,
  origen,
  generar,
}: {
  borrador: Borrador
  origen: PedidoDelDocumento
  generar?: AccionDeGenerar
}) {
  const { identidad } = useSesion()
  return (
    <div className="space-y-4 rounded-tarjeta border border-ok/40 bg-panel p-4">
      <div className="space-y-1">
        <h3 className="font-semibold text-ok-texto">Borrador aprobado</h3>
        <p className="flex items-start gap-2 text-sm text-texto-suave">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Lo aprobado quedó congelado: no se puede editar. Si hay que
            cambiarlo, generá una corrección.
          </span>
        </p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <Dato nombre="Aprobado por">
          {borrador.aprobado_por
            ? quienLoCargo(borrador.aprobado_por, identidad)
            : 'Sin dato'}
        </Dato>
        <Dato nombre="Cuándo">
          {borrador.aprobado_en ? fechaHora(borrador.aprobado_en) : 'Sin dato'}
        </Dato>
        <Dato nombre="Comprobante">
          {borrador.comprobante_id ? (
            <ComprobanteVinculado id={borrador.comprobante_id} />
          ) : (
            'Sin comprobante vinculado'
          )}
        </Dato>
        <Dato nombre="Versión">
          <span className="font-mono text-xs">
            {versionCorta(borrador.hash_contenido)}
          </span>
        </Dato>
      </dl>
      <PdfDelBorrador borrador={borrador} />
      {generar ? (
        <Button
          variante="secundario"
          cargando={generar.cargando}
          disabled={generar.deshabilitado}
          onClick={() => generar.alGenerar(borrador.id)}
        >
          <FilePlus2 className="size-4" aria-hidden /> Generar corrección
        </Button>
      ) : null}
      {borrador.contenido ? (
        <DocumentoDelBorrador contenido={borrador.contenido} origen={origen} />
      ) : null}
      <HistorialDelBorrador borrador={borrador} />
    </div>
  )
}

/** Un descartado: el motivo, quién y cuándo (de la bitácora) y la opción
 *  de generar otro. El texto queda guardado, pero ya no se aprueba. */
export function BorradorDescartado({
  borrador,
  origen,
  generar,
}: {
  borrador: Borrador
  origen: PedidoDelDocumento
  generar?: AccionDeGenerar
}) {
  const { identidad } = useSesion()
  const revisiones = useRevisiones(borrador.id)
  const descarte = [...(revisiones.data ?? [])]
    .reverse()
    .find((r) => r.accion === 'descartado')
  return (
    <div className="space-y-4 rounded-tarjeta border border-borde bg-panel p-4">
      <h3 className="font-semibold text-texto">Borrador descartado</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <Dato nombre="Motivo">{borrador.motivo_descarte ?? 'Sin motivo'}</Dato>
        <Dato nombre="Descartado por">
          {descarte
            ? quienLoCargo(descarte.usuario, identidad)
            : revisiones.isPending
              ? 'Cargando…'
              : 'Sin dato'}
        </Dato>
        <Dato nombre="Cuándo">
          {fechaHora(descarte?.momento ?? borrador.actualizado_en)}
        </Dato>
      </dl>
      {generar ? (
        <div className="space-y-2">
          <p className="text-sm text-texto-suave">Podés generar uno nuevo.</p>
          <Button
            variante="secundario"
            cargando={generar.cargando}
            disabled={generar.deshabilitado}
            onClick={() => generar.alGenerar()}
          >
            <Sparkles className="size-4" aria-hidden /> Generar uno nuevo
          </Button>
        </div>
      ) : null}
      {borrador.contenido ? (
        <DocumentoDelBorrador contenido={borrador.contenido} origen={origen} />
      ) : null}
      <HistorialDelBorrador borrador={borrador} />
    </div>
  )
}

const NOMBRE_DE_ACCION: Record<EntradaDeBitacora['accion'], string> = {
  aprobado: 'Aprobado',
  descartado: 'Descartado',
}

/** El historial plegable: cuándo lo redactó la IA y cada fila de la
 *  bitácora (append-only en el backend). */
export function HistorialDelBorrador({ borrador }: { borrador: Borrador }) {
  const ids = useId()
  const { identidad } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const revisiones = useRevisiones(borrador.id)
  return (
    <section
      aria-labelledby={`${ids}-titulo`}
      className="border-t border-borde pt-3"
    >
      <h4 id={`${ids}-titulo`}>
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={`${ids}-contenido`}
          onClick={() => setAbierto((previo) => !previo)}
          className="flex items-center gap-2 rounded-control text-sm font-medium text-texto focus-visible:outline-2 focus-visible:outline-acento"
        >
          <History className="size-4" aria-hidden /> Historial
          <ChevronDown
            className={`size-4 transition-transform ${abierto ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      </h4>
      {abierto ? (
        <div id={`${ids}-contenido`} className="mt-2">
          {revisiones.isError ? (
            <p role="alert" className={ALERTA}>
              No se pudo traer el historial.{' '}
              <button
                type="button"
                className={ENLACE}
                onClick={() => void revisiones.refetch()}
              >
                Reintentar
              </button>
            </p>
          ) : (
            <ol
              aria-label="Historial del borrador"
              className="space-y-2 text-sm"
            >
              <li className="rounded-control border border-borde px-3 py-2">
                <p className="font-medium text-texto">Redactado por la IA</p>
                <p className="text-texto-suave">
                  {fechaHora(borrador.creado_en)}
                  {borrador.version_prompt
                    ? ` · prompt ${borrador.version_prompt}`
                    : ''}
                </p>
              </li>
              {(revisiones.data ?? []).map((r) => (
                <li
                  key={r.id}
                  className="rounded-control border border-borde px-3 py-2"
                >
                  <p className="font-medium text-texto">
                    {NOMBRE_DE_ACCION[r.accion]} por{' '}
                    {quienLoCargo(r.usuario, identidad)}
                  </p>
                  <p className="text-texto-suave">
                    {fechaHora(r.momento)} · versión{' '}
                    <span className="font-mono text-xs">
                      {versionCorta(r.hash_contenido)}
                    </span>
                  </p>
                  {r.motivo ? (
                    <p className="text-texto">Motivo: {r.motivo}</p>
                  ) : null}
                  {r.comprobante_id ? (
                    <p className="text-texto-suave">
                      Con comprobante vinculado
                    </p>
                  ) : null}
                </li>
              ))}
              {revisiones.isPending ? (
                <li className="text-texto-suave">Cargando el historial…</li>
              ) : null}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  )
}
