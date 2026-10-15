// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// UserManager de mentira: registra en qué orden se llama cada cosa.
const llamadas: string[] = []
const eventos = {
  addUserLoaded: vi.fn(),
  addUserUnloaded: vi.fn(),
  addSilentRenewError: vi.fn(),
  removeUserLoaded: vi.fn(),
  removeUserUnloaded: vi.fn(),
  removeSilentRenewError: vi.fn(),
}
let usuarioGuardado: { id_token: string } | null = { id_token: 'jwt-secreto' }
let argsDelLogout:
  | { extraQueryParams?: Record<string, string>; id_token_hint?: string }
  | undefined

vi.mock('oidc-client-ts', async (original) => {
  const real = await original<typeof import('oidc-client-ts')>()
  class UserManagerFalso {
    events = eventos
    getUser = async () => null
    revokeTokens = async (tipos: string[]) => {
      llamadas.push(`revocar:${tipos.join(',')}`)
    }
    removeUser = async () => {
      llamadas.push('borrar-local')
      usuarioGuardado = null
    }
    signoutRedirect = async (args: typeof argsDelLogout) => {
      llamadas.push(`logout:token=${usuarioGuardado ? 'presente' : 'ausente'}`)
      argsDelLogout = args
    }
  }
  return { ...real, UserManager: UserManagerFalso }
})

const { destinoSeguro, useSesion } = await import('../src/auth/useSesion')
const { ProveedorDeSesion } = await import('../src/auth/sesion')

describe('destinoSeguro: ?volver= solo lleva a rutas internas', () => {
  it.each(['/ventas/clientes', '/produccion/razas?x=1', '/'])(
    'acepta %s',
    (ruta) => {
      expect(destinoSeguro(ruta)).toBe(ruta)
    },
  )

  it.each([
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    'ventas',
    '',
    null,
  ])('rechaza %j', (destino) => {
    expect(destinoSeguro(destino)).toBe('/')
  })
})

describe('salir', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'false')
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_ABC')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'cliente')
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'malka.auth.us-east-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_REGION', 'us-east-1')
    llamadas.length = 0
    usuarioGuardado = { id_token: 'jwt-secreto' }
    argsDelLogout = undefined
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  it('revoca el refresh token, borra la sesión local y no manda el ID token en la URL', async () => {
    let salir: () => Promise<void> = async () => {}
    function Captura() {
      salir = useSesion().salir
      return null
    }
    render(
      <ProveedorDeSesion>
        <Captura />
      </ProveedorDeSesion>,
    )

    await act(() => salir())

    expect(llamadas).toEqual([
      'revocar:refresh_token',
      'borrar-local',
      'logout:token=ausente',
    ])
    expect(argsDelLogout?.id_token_hint).toBeUndefined()
    expect(JSON.stringify(argsDelLogout)).not.toContain('jwt-secreto')
    expect(argsDelLogout?.extraQueryParams?.logout_uri).toBe(
      `${window.location.origin}/`,
    )
  })
})
