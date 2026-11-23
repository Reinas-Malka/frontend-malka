import { Bot, Loader2, RotateCcw, Search, Send, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { asistente, type ApiAsistente } from '@/api/asistente'
import { useSesion } from '@/auth/useSesion'
import { Button } from '@/components/ui/button'
import { usePantallaAncha } from '@/hooks/usePantallaAncha'
import { MAX_CARACTERES } from '@/lib/asistente'
import {
  claveDelHistorial,
  type MensajeDelChat,
} from '@/modulos/asistente/conversacion'
import { TarjetaDePropuesta } from '@/modulos/asistente/TarjetaDePropuesta'
import { TextoDelAsistente } from '@/modulos/asistente/TextoDelAsistente'
import { useConversacion } from '@/modulos/asistente/useConversacion'

const SUGERENCIAS = [
  '¿Qué disponibilidad de reinas hay?',
  '¿Cómo vienen los pedidos?',
  'Crear un pedido de 10 reinas',
]

type Props = {
  abierto: boolean
  alCerrar: () => void
  /** La API (real o simulada); los tests pasan una propia. */
  api?: ApiAsistente
}

/** Panel de chat con el asistente: cajón a la derecha en escritorio,
 *  pantalla completa en el teléfono. Una vez abierto queda montado (oculto
 *  al cerrar): así no se pierde una respuesta en camino. */
export default function PanelAsistente({
  abierto,
  alCerrar,
  api = asistente,
}: Props) {
  const { identidad } = useSesion()
  const clave = claveDelHistorial(
    identidad?.email ?? '',
    identidad?.tenantId ?? '',
  )
  const chat = useConversacion(api, clave)
  const [texto, setTexto] = useState('')
  const entrada = useRef<HTMLTextAreaElement>(null)
  const fin = useRef<HTMLDivElement>(null)
  const ancha = usePantallaAncha()

  // Al abrir, el foco va al campo de texto.
  useEffect(() => {
    if (abierto) entrada.current?.focus()
  }, [abierto])

  // Lo nuevo queda a la vista (jsdom no tiene scrollIntoView).
  const cantidad = chat.historial.length
  useEffect(() => {
    fin.current?.scrollIntoView?.({ block: 'end' })
  }, [cantidad, chat.pensando])

  const enviar = () => {
    if (!texto.trim() || chat.pensando) return
    chat.mandar(texto)
    setTexto('')
  }
  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      enviar()
    }
  }
  const nueva = () => {
    chat.nuevaConversacion()
    setTexto('')
    entrada.current?.focus()
  }

  return (
    <section
      id="panel-asistente"
      role="dialog"
      aria-labelledby="titulo-asistente"
      hidden={!abierto}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          alCerrar()
        }
      }}
      className="fixed inset-0 z-50 flex flex-col bg-panel text-texto shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[28rem] md:border-l md:border-borde"
    >
      <header className="flex items-center gap-2 border-b border-borde px-3 py-2">
        <Bot aria-hidden className="size-5 text-miel-400" />
        <h2 id="titulo-asistente" className="flex-1 font-semibold">
          Asistente
        </h2>
        <Button
          variante="fantasma"
          tamano="chico"
          onClick={nueva}
          disabled={cantidad === 0 && !chat.pensando}
        >
          <RotateCcw aria-hidden className="size-4" />
          Nueva conversación
        </Button>
        <button
          type="button"
          aria-label="Cerrar el asistente"
          onClick={alCerrar}
          className="inline-flex size-10 items-center justify-center rounded-control text-texto hover:bg-panel-alto focus-visible:outline-2 focus-visible:outline-acento"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      <p className="border-b border-borde bg-miel-500/10 px-3 py-2 text-xs text-texto-suave">
        El asistente propone; nada se guarda hasta que confirmás.
      </p>

      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversación con el asistente"
        className="flex-1 space-y-4 overflow-y-auto px-3 py-4"
      >
        {cantidad === 0 ? (
          <Bienvenida
            deshabilitado={chat.pensando}
            alElegir={(sugerencia) => chat.mandar(sugerencia)}
          />
        ) : null}
        {chat.historial.map((mensaje) => (
          <Mensaje
            key={mensaje.id}
            mensaje={mensaje}
            alConfirmar={(id) => void chat.confirmar(id)}
            alDescartar={chat.descartar}
            alNavegar={() => {
              if (!ancha) alCerrar()
            }}
          />
        ))}
        <div ref={fin} />
      </div>

      {chat.pensando ? (
        <p
          role="status"
          className="flex items-center gap-2 px-3 pb-2 text-sm text-texto-suave"
        >
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Pensando…
        </p>
      ) : null}

      {chat.error ? (
        <div
          role="alert"
          className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-control border border-peligro/40 bg-peligro/10 p-2 text-sm"
        >
          <p className="flex-1">{chat.error.mensaje}</p>
          {chat.error.reintentable ? (
            <Button
              variante="secundario"
              tamano="chico"
              onClick={chat.reintentar}
            >
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex items-end gap-2 border-t border-borde p-3"
        onSubmit={(e) => {
          e.preventDefault()
          enviar()
        }}
      >
        <label htmlFor="mensaje-asistente" className="sr-only">
          Mensaje para el asistente
        </label>
        <textarea
          id="mensaje-asistente"
          ref={entrada}
          value={texto}
          rows={2}
          maxLength={MAX_CARACTERES}
          placeholder="Preguntá o pedí algo… (Enter envía, Shift+Enter baja de línea)"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alTeclear}
          className="min-h-10 flex-1 resize-none rounded-control border border-borde bg-fondo px-3 py-2 text-base text-texto placeholder:text-texto-suave focus-visible:outline-2 focus-visible:outline-acento md:text-sm"
        />
        <Button
          type="submit"
          aria-label="Enviar"
          disabled={!texto.trim() || chat.pensando}
          className="size-10 shrink-0 px-0"
        >
          <Send aria-hidden className="size-4" />
        </Button>
      </form>
    </section>
  )
}

function Bienvenida({
  deshabilitado,
  alElegir,
}: {
  deshabilitado: boolean
  alElegir: (texto: string) => void
}) {
  return (
    <div className="space-y-3 text-sm text-texto-suave">
      <p>
        Preguntame por la disponibilidad, los pedidos o las tandas, o pedime que
        arme un pedido: te lo muestro para que lo confirmes.
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGERENCIAS.map((s) => (
          <Button
            key={s}
            variante="secundario"
            tamano="chico"
            disabled={deshabilitado}
            onClick={() => alElegir(s)}
          >
            {s}
          </Button>
        ))}
      </div>
    </div>
  )
}

function Mensaje({
  mensaje,
  alConfirmar,
  alDescartar,
  alNavegar,
}: {
  mensaje: MensajeDelChat
  alConfirmar: (id: string) => void
  alDescartar: (id: string) => void
  alNavegar: () => void
}) {
  if (mensaje.rol === 'usuario')
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-tarjeta bg-miel-500/15 px-3 py-2 text-sm text-texto">
          <span className="sr-only">Vos: </span>
          {mensaje.texto}
        </p>
      </div>
    )
  return (
    <div className="space-y-2">
      <span className="sr-only">Asistente: </span>
      <TextoDelAsistente texto={mensaje.texto} />
      {mensaje.consultas.length > 0 ? (
        <ul aria-label="Lo que consultó" className="flex flex-wrap gap-1.5">
          {mensaje.consultas.map((c, i) => (
            <li
              key={`${c.tool}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-borde px-2 py-0.5 text-xs text-texto-suave"
            >
              <Search aria-hidden className="size-3" />
              {c.resumen}
            </li>
          ))}
        </ul>
      ) : null}
      {mensaje.propuestas.map((item) => (
        <TarjetaDePropuesta
          key={item.propuesta.id}
          item={item}
          alConfirmar={alConfirmar}
          alDescartar={alDescartar}
          alNavegar={alNavegar}
        />
      ))}
    </div>
  )
}
