import { QueryClient } from '@tanstack/react-query'
import { esApiError } from '@/api/client'

const MAX_REINTENTOS = 2

/** Reintentos acotados (issue #5): solo lecturas, y solo si reintentar
 *  puede servir (sin conexión, tiempo agotado o 5xx). Un 4xx no cambia
 *  por reintentar. Las altas no se reintentan solas: llevan Idempotency-Key
 *  y las repite la persona. */
export function debeReintentar(intentos: number, error: unknown): boolean {
  if (intentos >= MAX_REINTENTOS) return false
  if (!esApiError(error)) return false
  if (error.status === null) return error.codigo !== 'sin_configuracion'
  return error.status >= 500
}

export function crearClienteDeConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: debeReintentar,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}
