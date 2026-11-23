/** Asistente conversacional (backend #156). El servidor no guarda la
 *  conversación: el front manda el historial en cada pedido y recibe el
 *  texto, lo que se consultó y las propuestas de escritura.
 *
 *  Una propuesta NO se ejecutó: confirmarla es llamar al endpoint REST que
 *  indica (`metodo` + `ruta` + `cuerpo`) con el token del usuario y la
 *  Idempotency-Key = id de la propuesta. Así pasa por las mismas
 *  validaciones, roles e idempotencia que cualquier otra escritura, y un
 *  reintento no duplica nada.
 *
 *  Mismo esquema que api/borradores.ts: real y simulado con la misma firma,
 *  un solo swap por VITE_DATOS_SIMULADOS. */
import { request } from '@/api/client'
import type { components } from '@/api/esquema'
import { asistenteSimulado } from '@/api/asistenteSimulado'
import { usaDatosSimulados } from '@/datos/cliente'
import { esPropuestaEjecutable, propuestaInvalida } from '@/lib/asistente'

type Esquemas = components['schemas']

export type MensajeAlAsistente = Esquemas['MensajeAsistente']
export type ConsultaDelAsistente = Esquemas['Consulta']
/** `cuerpo` es "cualquier objeto JSON" (dict[str, Any] en el backend), pero
 *  openapi-typescript genera Record<string, never> para un object sin
 *  propiedades: se corrige acá, sin tocar el esquema generado. */
export type Propuesta = Omit<Esquemas['Propuesta'], 'cuerpo'> & {
  cuerpo: Record<string, unknown> | null
}
export type RespuestaAsistente = Omit<
  Esquemas['RespuestaAsistente'],
  'propuestas'
> & { propuestas: Propuesta[] }
export type AccionPropuesta = Esquemas['AccionPropuesta']
export type ParResumen = Esquemas['ParResumen']

export interface ApiAsistente {
  /** 1 a 20 mensajes, el último del usuario. 429 limite_ia_por_minuto o
   *  limite_ia_diario (con Retry-After), 503 asistente_no_disponible, 422
   *  si el historial no valida. */
  conversar(mensajes: MensajeAlAsistente[]): Promise<RespuestaAsistente>
  /** Ejecuta la propuesta con su id como Idempotency-Key: la misma
   *  propuesta confirmada dos veces se guarda una sola. */
  confirmar(propuesta: Propuesta): Promise<unknown>
}

const RUTA = '/api/v1/asistente'
/** El backend se corta a los 22 s y API Gateway a los 29: el timeout por
 *  defecto del cliente (15 s) cortaría respuestas válidas. */
const TIMEOUT_CONVERSAR_MS = 30_000

export function asistenteHttp(): ApiAsistente {
  return {
    conversar: (mensajes) =>
      request<RespuestaAsistente>(RUTA, {
        metodo: 'POST',
        cuerpo: { mensajes },
        timeoutMs: TIMEOUT_CONVERSAR_MS,
      }),
    confirmar: async (propuesta) => {
      if (!esPropuestaEjecutable(propuesta)) throw propuestaInvalida()
      return request<unknown>(propuesta.ruta, {
        metodo: propuesta.metodo,
        // Reservar un pedido no lleva cuerpo: va sin body, como en api/pedidos.ts.
        cuerpo: propuesta.cuerpo ?? undefined,
        claveIdempotencia: propuesta.id,
      })
    },
  }
}

export const asistente: ApiAsistente = usaDatosSimulados(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
  ? asistenteSimulado()
  : asistenteHttp()
