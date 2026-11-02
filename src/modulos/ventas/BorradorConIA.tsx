import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { borradores } from '@/api/borradores'
import { describirError, esApiError } from '@/api/client'
import type { Pagina } from '@/api/recurso'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { formatearFechaHora, ZONA_ARGENTINA } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import {
  CLAVE_BORRADORES,
  claveDeBorrador,
  formatearEspera,
  NOMBRE_DE_ESTADO_BORRADOR,
  type PedidoDelDocumento,
  segundosDeEspera,
} from '@/modulos/ventas/borradores'
import { DetalleDeBorrador } from '@/modulos/ventas/DetalleDeBorrador'
import { ROLES_VENTAS } from '@/modulos/ventas/pedidos'
import type { Borrador, EstadoBorrador } from '@/tipos/dominio'

const TONO_DE_BORRADOR: Record<EstadoBorrador, 'aviso' | 'ok' | 'peligro'> = {
  generando: 'aviso',
  borrador: 'ok',
  rechazado: 'peligro',
}

/** Después de un 429: hasta cuándo esperar y la hora del último tic. */
type Espera = { hasta: number; ahora: number; diario: boolean }

/** El borrador del documento del pedido, redactado por la IA (#16). Lo
 *  piden admin y ventas; lo leen todos. Aprobarlo es del #17: acá solo se
 *  genera, se espera y se revisa. */
export function BorradorConIA(origen: PedidoDelDocumento) {
  const { pedido } = origen
  const { identidad } = useSesion()
  const escribe = puede(identidad, ROLES_VENTAS)
  const consultas = useQueryClient()
  const claveDelListado = [CLAVE_BORRADORES, pedido.id] as const
  const listado = useQuery({
    queryKey: claveDelListado,
    queryFn: () => borradores.listar(pedido.id),
  })
  // El que se mira; si no se eligió ninguno, el más nuevo.
  const [elegido, setElegido] = useState<string | null>(null)
  const [espera, setEspera] = useState<Espera | null>(null)
  // La clave se fija en el primer intento y se repite hasta que sale bien:
  // si una respuesta se perdió, el backend devuelve el mismo borrador y no
  // gasta otra llamada a la IA. Y un doble clic no manda dos pedidos.
  const clave = useRef<string | null>(null)
  const enCurso = useRef(false)

  const generar = useMutation({
    mutationFn: (conClave: string) => borradores.pedir(pedido.id, conClave),
    onSuccess: (nuevo) => {
      clave.current = null
      consultas.setQueryData(claveDeBorrador(nuevo.id), nuevo)
      consultas.setQueryData<Pagina<Borrador>>(
        claveDelListado,
        (pagina) =>
          pagina && {
            ...pagina,
            items: [nuevo, ...pagina.items.filter((b) => b.id !== nuevo.id)],
          },
      )
      setElegido(nuevo.id)
    },
    onError: (error) => {
      const segundos = segundosDeEspera(error)
      if (segundos === null) return
      const ahora = Date.now()
      setEspera({
        hasta: ahora + segundos * 1000,
        ahora,
        diario: esApiError(error) && error.codigo === 'limite_ia_diario',
      })
    },
    onSettled: () => {
      enCurso.current = false
    },
  })
  const pedirBorrador = () => {
    if (enCurso.current) return
    enCurso.current = true
    clave.current ??= crypto.randomUUID()
    generar.mutate(clave.current)
  }

  // La cuenta regresiva del 429: un tic por segundo hasta que se puede.
  const hastaCuando = espera?.hasta
  useEffect(() => {
    if (hastaCuando === undefined) return
    const reloj = setInterval(() => {
      const ahora = Date.now()
      setEspera((previa) =>
        !previa || ahora >= previa.hasta ? null : { ...previa, ahora },
      )
    }, 1000)
    return () => clearInterval(reloj)
  }, [hastaCuando])
  const restantes = espera
    ? Math.max(0, Math.ceil((espera.hasta - espera.ahora) / 1000))
    : 0
  const esperando = restantes > 0

  const errorAlGenerar =
    generar.isError && segundosDeEspera(generar.error) === null
      ? generar.error
      : null
  const items = listado.data?.items ?? []
  const seleccionado =
    items.find((b) => b.id === elegido)?.id ?? items[0]?.id ?? null
  const accion = escribe
    ? {
        alGenerar: pedirBorrador,
        cargando: generar.isPending,
        deshabilitado: esperando,
      }
    : undefined

  return (
    <section aria-labelledby="titulo-borrador-ia" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="titulo-borrador-ia"
          className="text-lg font-semibold text-texto"
        >
          Borrador con IA
        </h2>
        {escribe ? (
          <Button
            variante="secundario"
            cargando={generar.isPending}
            disabled={esperando}
            onClick={pedirBorrador}
          >
            <Sparkles className="size-4" aria-hidden /> Generar borrador
          </Button>
        ) : null}
      </div>
      <p className="flex items-start gap-2 text-sm text-texto-suave">
        <Bot className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          El texto lo redacta una IA a partir del pedido. Los números fiscales
          de la factura (número, CAE, IVA y total facturados) los carga una
          persona desde el comprobante de ARCA.
        </span>
      </p>

      {esperando && espera ? (
        <div className="rounded-control border border-aviso/40 bg-aviso/10 p-3 text-sm text-texto">
          <p role="status">
            {espera.diario
              ? 'Ya se usaron todos los borradores con IA de hoy: se renuevan a la medianoche.'
              : 'Se pidieron muchos borradores seguidos.'}
          </p>
          <p>Esperá {formatearEspera(restantes)} para generar otro.</p>
        </div>
      ) : null}
      {errorAlGenerar ? <ErrorAlGenerar error={errorAlGenerar} /> : null}

      {listado.isPending ? (
        <Cargando columnas={2} filas={2} />
      ) : listado.isError ? (
        <ErrorDePantalla
          error={describirError(listado.error)}
          reintentar={() => void listado.refetch()}
        />
      ) : seleccionado === null ? (
        <Vacio titulo="Todavía no hay borradores de este pedido.">
          {escribe
            ? 'Generá uno: la IA lo redacta en unos segundos.'
            : 'Los generan administración y ventas.'}
        </Vacio>
      ) : (
        <div className="grid gap-3 md:grid-cols-[16rem_1fr]">
          <ul aria-label="Borradores del pedido" className="space-y-1">
            {items.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  aria-pressed={b.id === seleccionado}
                  onClick={() => setElegido(b.id)}
                  className={cn(
                    'flex w-full flex-wrap items-center justify-between gap-2 rounded-control border px-3 py-2 text-left text-sm text-texto focus-visible:outline-2 focus-visible:outline-acento',
                    b.id === seleccionado
                      ? 'border-acento bg-panel-alto'
                      : 'border-borde bg-panel hover:bg-panel-alto',
                  )}
                >
                  <span className="font-mono text-xs tabular-nums">
                    {formatearFechaHora(b.creado_en, ZONA_ARGENTINA)}
                  </span>
                  <Badge tono={TONO_DE_BORRADOR[b.estado]}>
                    {NOMBRE_DE_ESTADO_BORRADOR[b.estado]}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          <DetalleDeBorrador
            key={seleccionado}
            id={seleccionado}
            claveDelListado={claveDelListado}
            origen={origen}
            generar={accion}
          />
        </div>
      )}
    </section>
  )
}

/** Un error al pedir que no es el límite: el pedido ya no existe, o la API
 *  no respondió. El mensaje del backend ya está en castellano. */
function ErrorAlGenerar({ error }: { error: unknown }) {
  const mensaje =
    esApiError(error) && error.codigo === 'pedido_inexistente'
      ? 'Este pedido ya no existe: no se puede redactar su documento.'
      : `${describirError(error).mensaje} Volvé a intentar en un rato.`
  return (
    <div
      role="alert"
      className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
    >
      <p className="font-medium">No se pudo pedir el borrador.</p>
      <p>{mensaje}</p>
    </div>
  )
}
