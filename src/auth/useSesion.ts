/** El contexto de sesión y su hook, separados de los proveedores (sesion.tsx)
 *  para que el fast refresh de Vite siga funcionando. */
import { createContext, useContext } from 'react'
import type { Identidad } from '@/auth/identidad'

export type EstadoDeSesion = 'cargando' | 'listo' | 'error'

export type ValorDeSesion = {
  identidad: Identidad | null
  estado: EstadoDeSesion
  error: string | null
  /** Va al hosted UI de Cognito; al volver, abre `volverA`. */
  ingresar: (volverA?: string) => Promise<void>
  /** Canjea el código de /auth/callback y devuelve adónde volver. */
  completarIngreso: () => Promise<string>
  salir: () => Promise<void>
}

export const ContextoDeSesion = createContext<ValorDeSesion | null>(null)

export function useSesion(): ValorDeSesion {
  const valor = useContext(ContextoDeSesion)
  if (!valor) throw new Error('useSesion se usa dentro de <ProveedorDeSesion>.')
  return valor
}

/** Solo rutas internas: evita usar el login como redirector abierto. Los
 *  navegadores tratan "\\" como "/" e ignoran tabs y saltos de línea en una
 *  URL ("/\\evil.com" y "/\t/evil.com" llevan a evil.com): se rechazan y,
 *  además, la ruta tiene que resolver en el mismo origen. */
export function destinoSeguro(destino: unknown): string {
  if (typeof destino !== 'string' || !destino.startsWith('/')) return '/'
  if (/[\\\u0000-\u001f\u007f]/.test(destino)) return '/'
  const base = 'https://malka.invalid'
  const url = new URL(destino, base)
  return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : '/'
}
