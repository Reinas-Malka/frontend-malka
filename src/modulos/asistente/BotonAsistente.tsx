import { Loader2, MessageCircle } from 'lucide-react'
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/** El panel baja su código recién la primera vez que se abre: no suma al
 *  chunk inicial. */
const PanelAsistente = lazy(() => import('@/modulos/asistente/PanelAsistente'))

/** Botón flotante "Asistente" (abajo a la derecha, en toda pantalla con
 *  sesión) y el panel de chat. Al cerrar, el foco vuelve al botón. */
export function BotonAsistente() {
  const [abierto, setAbierto] = useState(false)
  const [montado, setMontado] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const yaSeAbrio = useRef(false)

  useEffect(() => {
    if (abierto) yaSeAbrio.current = true
    else if (yaSeAbrio.current) boton.current?.focus()
  }, [abierto])

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={montado ? 'panel-asistente' : undefined}
        onClick={() => {
          setMontado(true)
          setAbierto(true)
        }}
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-acento px-4 text-sm font-medium text-carbon-900 shadow-lg hover:bg-acento-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
      >
        <MessageCircle aria-hidden className="size-5" />
        Asistente
      </button>
      {montado ? (
        <SiNoCarga abierto={abierto}>
          <Suspense fallback={abierto ? <PanelCargando /> : null}>
            <PanelAsistente
              abierto={abierto}
              alCerrar={() => setAbierto(false)}
            />
          </Suspense>
        </SiNoCarga>
      ) : null}
    </>
  )
}

function PanelCargando() {
  return (
    <div
      role="status"
      className="fixed inset-0 z-50 flex items-center justify-center gap-2 bg-panel text-sm text-texto-suave md:left-auto md:w-[28rem] md:border-l md:border-borde"
    >
      <Loader2 aria-hidden className="size-4 animate-spin" />
      Abriendo el asistente…
    </div>
  )
}

/** Si el código del panel no baja (sin conexión, deploy nuevo), avisa sin
 *  romper la pantalla de atrás. */
class SiNoCarga extends Component<
  { abierto: boolean; children: ReactNode },
  { fallo: boolean }
> {
  state = { fallo: false }
  static getDerivedStateFromError() {
    return { fallo: true }
  }
  render() {
    if (!this.state.fallo) return this.props.children
    if (!this.props.abierto) return null
    return (
      <p
        role="alert"
        className="fixed bottom-20 right-4 z-50 max-w-xs rounded-control border border-peligro/40 bg-panel p-3 text-sm text-texto shadow-lg"
      >
        No se pudo abrir el asistente. Recargá la página e intentá de nuevo.
      </p>
    )
  }
}
