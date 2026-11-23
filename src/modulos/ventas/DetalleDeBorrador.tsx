import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Loader2, Pencil, RotateCcw, Sparkles } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { borradores } from '@/api/borradores'
import { describirError } from '@/api/client'
import type { Pagina } from '@/api/recurso'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  claveDeBorrador,
  CONSULTA_CADA_MS,
  EXPLICACION_DE_RECHAZO,
  LARGO_MAXIMO,
  type PedidoDelDocumento,
  TOPE_DE_CONSULTAS,
} from '@/modulos/ventas/borradores'
import {
  AvisoDeCorreccion,
  BorradorAprobado,
  BorradorDescartado,
} from '@/modulos/ventas/BorradorCerrado'
import { DecisionDelBorrador } from '@/modulos/ventas/DecisionDelBorrador'
import { DocumentoDelBorrador } from '@/modulos/ventas/DocumentoDelBorrador'
import type { Borrador, ContenidoDeBorrador } from '@/tipos/dominio'

/** Generar otro (desde un rechazo o un descarte) o una corrección de un
 *  aprobado (con su id); undefined si quien mira no puede. */
export type AccionDeGenerar = {
  alGenerar: (corrigeA?: string) => void
  cargando: boolean
  deshabilitado: boolean
}

/** Un borrador: mientras se redacta lo consulta cada 2 s (con tope), y
 *  después muestra el documento para revisar (con aprobar y descartar),
 *  por qué se rechazó, o cómo quedó aprobado o descartado. */
export function DetalleDeBorrador({
  id,
  claveDelListado,
  origen,
  generar,
  alElegir,
}: {
  id: string
  /** El listado del pedido: se actualiza con el estado que llega. */
  claveDelListado: readonly unknown[]
  /** El pedido: de ahí sale el detalle calculado por el sistema. */
  origen: PedidoDelDocumento
  generar?: AccionDeGenerar
  /** Mirar otro borrador del pedido (el original de una corrección). */
  alElegir?: (id: string) => void
}) {
  const consultas = useQueryClient()
  // Desde qué consulta se cuenta el tope: "Seguir esperando" lo corre.
  const [desde, setDesde] = useState(0)
  // Un aviso que sobrevive a la recarga: el borrador cambió o ya se cerró.
  const [aviso, setAviso] = useState<string | null>(null)
  const detalle = useQuery({
    queryKey: claveDeBorrador(id),
    queryFn: async () => {
      const borrador = await borradores.obtener(id)
      consultas.setQueryData<Pagina<Borrador>>(
        claveDelListado,
        (pagina) =>
          pagina && {
            ...pagina,
            items: pagina.items.map((b) => (b.id === id ? borrador : b)),
          },
      )
      return borrador
    },
    // Un render por consulta aunque el borrador llegue igual: el contador
    // del tope se lee en el render.
    notifyOnChangeProps: 'all',
    refetchInterval: (consulta) =>
      consulta.state.data?.estado === 'generando' &&
      consulta.state.dataUpdateCount - desde < TOPE_DE_CONSULTAS
        ? CONSULTA_CADA_MS
        : false,
  })

  if (detalle.isPending) return <Cargando columnas={1} filas={3} />
  if (detalle.isError && !detalle.data)
    return (
      <ErrorDePantalla
        error={describirError(detalle.error)}
        reintentar={() => void detalle.refetch()}
      />
    )
  const borrador = detalle.data
  // Cuántas veces llegó el borrador: el mismo contador que usa el intervalo.
  const consultadas =
    consultas.getQueryState(claveDeBorrador(id))?.dataUpdateCount ?? 0
  const marco = (vista: ReactNode) => (
    <div className="space-y-3">
      {aviso ? (
        <div
          role="alert"
          className="flex flex-wrap items-start justify-between gap-2 rounded-control border border-aviso/40 bg-aviso/10 p-3 text-sm text-texto"
        >
          <p>{aviso}</p>
          <Button
            variante="fantasma"
            tamano="chico"
            onClick={() => setAviso(null)}
          >
            Entendido
          </Button>
        </div>
      ) : null}
      {borrador.corrige_a ? (
        <AvisoDeCorreccion corrigeA={borrador.corrige_a} alElegir={alElegir} />
      ) : null}
      {vista}
    </div>
  )

  if (borrador.estado === 'generando') {
    const agotado = consultadas - desde >= TOPE_DE_CONSULTAS
    return marco(
      <div
        role="status"
        className="flex flex-col items-start gap-2 rounded-tarjeta border border-borde bg-panel p-4 text-sm text-texto"
      >
        {agotado ? (
          <>
            <p className="font-medium">Está tardando más de lo normal.</p>
            <p className="text-texto-suave">
              Puede seguir redactándose: volvé a consultar en un rato.
            </p>
            <Button
              variante="secundario"
              onClick={() => {
                setDesde(consultadas)
                void detalle.refetch()
              }}
            >
              Seguir esperando
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-acento" aria-hidden />
            La IA está redactando el borrador. Tarda unos segundos.
          </p>
        )}
      </div>,
    )
  }

  if (borrador.estado === 'rechazado')
    return marco(
      <div className="flex flex-col items-start gap-2 rounded-tarjeta border border-peligro/40 bg-peligro/10 p-4 text-sm text-texto">
        <h3 className="font-semibold">No se pudo generar este borrador</h3>
        <p>
          {borrador.motivo_rechazo
            ? EXPLICACION_DE_RECHAZO[borrador.motivo_rechazo]
            : 'La IA no pudo redactarlo.'}{' '}
          No se guardó ningún texto.
        </p>
        {generar ? (
          <>
            <p className="text-texto-suave">Podés generar otro.</p>
            <Button
              variante="secundario"
              cargando={generar.cargando}
              disabled={generar.deshabilitado}
              onClick={() => generar.alGenerar()}
            >
              <Sparkles className="size-4" aria-hidden /> Generar otro borrador
            </Button>
          </>
        ) : null}
      </div>,
    )

  if (!borrador.contenido)
    return (
      <ErrorDePantalla
        error={{ mensaje: 'El borrador llegó sin texto.' }}
        reintentar={() => void detalle.refetch()}
      />
    )
  if (borrador.estado === 'aprobado')
    return marco(
      <BorradorAprobado
        borrador={borrador}
        origen={origen}
        generar={generar}
      />,
    )
  if (borrador.estado === 'descartado')
    return marco(
      <BorradorDescartado
        borrador={borrador}
        origen={origen}
        generar={generar}
      />,
    )
  return marco(
    <RevisionDeBorrador
      // Si el texto cambió en el servidor, la revisión arranca de nuevo.
      key={`${borrador.id}-${borrador.hash_contenido ?? ''}`}
      contenido={borrador.contenido}
      origen={origen}
      editable={generar !== undefined}
      decision={(conCambiosLocales) => (
        <DecisionDelBorrador
          borrador={borrador}
          clienteId={origen.pedido.cliente_id}
          conCambiosLocales={conCambiosLocales}
          alRecargar={(mensaje) => {
            setAviso(mensaje)
            void detalle.refetch()
          }}
        />
      )}
    />,
  )
}

/** El documento para leer y, quien vende, retocar el texto para copiarlo.
 *  Los cambios quedan solo en la pantalla (el backend no guarda ediciones):
 *  lo que se aprueba es el texto guardado, así que con cambios no se
 *  aprueba. Copiar copia lo que se ve, con los cambios. */
function RevisionDeBorrador({
  contenido,
  origen,
  editable,
  decision,
}: {
  contenido: ContenidoDeBorrador
  origen: PedidoDelDocumento
  editable: boolean
  /** Aprobar y descartar, sabiendo si hay cambios locales. */
  decision: (conCambiosLocales: boolean) => ReactNode
}) {
  const ids = useId()
  const [texto, setTexto] = useState(contenido)
  const [editando, setEditando] = useState(false)
  const cambiado =
    texto.encabezado !== contenido.encabezado ||
    texto.cuerpo !== contenido.cuerpo ||
    texto.notas !== contenido.notas
  const cambiar =
    (campo: keyof ContenidoDeBorrador) =>
    (evento: { target: { value: string } }) =>
      setTexto((previo) => ({ ...previo, [campo]: evento.target.value }))

  return (
    <div className="space-y-3 rounded-tarjeta border border-borde bg-panel p-4">
      <p className="flex items-start gap-2 text-sm text-aviso-texto">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Revisá el texto antes de aprobarlo. Si lo cambiás acá, el cambio queda
          solo en esta pantalla para copiarlo: se aprueba el texto guardado.
        </span>
      </p>
      {cambiado ? <Badge tono="aviso">Con cambios sin guardar</Badge> : null}

      {editando ? (
        <div className="space-y-3">
          <Field label="Encabezado" htmlFor={`${ids}-encabezado`}>
            <Input
              id={`${ids}-encabezado`}
              value={texto.encabezado}
              maxLength={LARGO_MAXIMO.encabezado}
              onChange={cambiar('encabezado')}
            />
          </Field>
          <Field label="Cuerpo" htmlFor={`${ids}-cuerpo`}>
            <Textarea
              id={`${ids}-cuerpo`}
              rows={16}
              value={texto.cuerpo}
              maxLength={LARGO_MAXIMO.cuerpo}
              onChange={cambiar('cuerpo')}
            />
          </Field>
          <Field label="Notas" htmlFor={`${ids}-notas`}>
            <Textarea
              id={`${ids}-notas`}
              value={texto.notas}
              maxLength={LARGO_MAXIMO.notas}
              onChange={cambiar('notas')}
            />
          </Field>
        </div>
      ) : (
        <DocumentoDelBorrador contenido={texto} origen={origen} />
      )}

      {editable ? (
        <div className="flex flex-wrap gap-2">
          {editando ? (
            <Button variante="secundario" onClick={() => setEditando(false)}>
              Listo
            </Button>
          ) : (
            <Button variante="secundario" onClick={() => setEditando(true)}>
              <Pencil className="size-4" aria-hidden /> Editar texto
            </Button>
          )}
          {cambiado ? (
            <Button variante="fantasma" onClick={() => setTexto(contenido)}>
              <RotateCcw className="size-4" aria-hidden /> Volver al texto de la
              IA
            </Button>
          ) : null}
        </div>
      ) : null}
      {decision(cambiado)}
    </div>
  )
}
