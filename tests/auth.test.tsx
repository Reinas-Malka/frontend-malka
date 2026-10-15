// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fijarAlNoAutenticado, request } from '../src/api/client'
import { recursoSimulado } from '../src/api/recurso'
import {
  configuracionCognito,
  ConfiguracionIncompleta,
} from '../src/auth/config'
import { identidadDesdePerfil, puede } from '../src/auth/identidad'
import { ProveedorDeSesionFijo } from '../src/auth/sesion'
import {
  PaginaCatalogo,
  type ConfigCatalogo,
} from '../src/components/catalogo/PaginaCatalogo'

const ENTORNO = {
  VITE_COGNITO_USER_POOL_ID: 'us-east-1_ABC123',
  VITE_COGNITO_CLIENT_ID: 'cliente-spa',
  VITE_COGNITO_DOMAIN: 'malka.auth.us-east-1.amazoncognito.com',
  VITE_COGNITO_REGION: 'us-east-1',
}

describe('configuracionCognito', () => {
  it('arma Authorization Code + PKCE con redirects derivados del origen (contrato del #6)', () => {
    const config = configuracionCognito(
      ENTORNO,
      'https://app.malka.test',
      window.sessionStorage,
    )

    expect(config.authority).toBe(
      'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC123',
    )
    expect(config.client_id).toBe('cliente-spa')
    expect(config.response_type).toBe('code')
    expect(config.redirect_uri).toBe('https://app.malka.test/auth/callback')
    expect(config.post_logout_redirect_uri).toBe('https://app.malka.test/')
    expect(config.metadata?.authorization_endpoint).toBe(
      'https://malka.auth.us-east-1.amazoncognito.com/oauth2/authorize',
    )
    expect(config.metadata?.end_session_endpoint).toBe(
      'https://malka.auth.us-east-1.amazoncognito.com/logout',
    )
  })

  it('sin las variables falla con un error que dice cuáles faltan', () => {
    expect(() =>
      configuracionCognito(
        { ...ENTORNO, VITE_COGNITO_CLIENT_ID: '' },
        'https://x',
        window.sessionStorage,
      ),
    ).toThrow(ConfiguracionIncompleta)
    expect(() =>
      configuracionCognito(
        { ...ENTORNO, VITE_COGNITO_DOMAIN: undefined },
        'https://x',
        window.sessionStorage,
      ),
    ).toThrow(/VITE_COGNITO_DOMAIN/)
  })
})

describe('identidad del ID token', () => {
  it('toma email, grupos de Cognito y tenant', () => {
    const identidad = identidadDesdePerfil({
      email: 'ventas@tenant-a.malka.test',
      'cognito:groups': ['ventas', 'otro-grupo'],
      'custom:tenant_id': '1111',
    })

    expect(identidad).toEqual({
      email: 'ventas@tenant-a.malka.test',
      roles: ['ventas'],
      tenantId: '1111',
    })
  })

  it('sin grupos no tiene permisos de escritura', () => {
    const identidad = identidadDesdePerfil({
      email: 'x@y',
      'custom:tenant_id': '1',
    })

    expect(identidad.roles).toEqual([])
    expect(puede(identidad, ['admin', 'ventas'])).toBe(false)
    expect(puede(null, ['admin'])).toBe(false)
  })
})

describe('sesión vencida', () => {
  beforeEach(() => vi.stubEnv('VITE_API_BASE_URL', 'https://api.malka.test'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fijarAlNoAutenticado(() => {})
  })

  it('un 401 del backend avisa al módulo de sesión para volver a ingresar', async () => {
    const alNoAutenticado = vi.fn()
    fijarAlNoAutenticado(alNoAutenticado)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'token_invalido',
              message: 'El token no es valido.',
            },
          }),
          {
            status: 401,
          },
        ),
      ),
    )

    await expect(request('/api/v1/razas')).rejects.toMatchObject({
      status: 401,
    })
    expect(alNoAutenticado).toHaveBeenCalledOnce()
  })
})

type Raza = { id: string; nombre: string; activo: boolean }
const configRazas: ConfigCatalogo<
  Raza,
  { nombre: string },
  { nombre?: string; activo?: boolean }
> = {
  clave: 'razas-permisos',
  titulo: 'Razas',
  singular: 'raza',
  femenino: true,
  recurso: recursoSimulado(
    [{ id: 'r1', nombre: 'Carniola', activo: true }],
    (d, id) => ({ id, ...d, activo: true }),
  ),
  rolesEscritura: ['admin', 'produccion'],
  columnas: [{ clave: 'nombre', titulo: 'Nombre' }],
  campos: [{ nombre: 'nombre', etiqueta: 'Nombre', requerido: true }],
  nombreDeFila: (r) => r.nombre,
  valoresDeFila: (r) => ({ nombre: r.nombre }),
  aCrear: (v) => ({ nombre: v.nombre }),
  aActualizar: (v) => ({ nombre: v.nombre }),
  reactivacion: { activo: true },
}

function montarComo(roles: ('admin' | 'produccion' | 'ventas' | 'lectura')[]) {
  render(
    <ProveedorDeSesionFijo
      identidad={{ email: 'x@malka.test', roles, tenantId: 't' }}
    >
      <QueryClientProvider client={new QueryClient()}>
        <PaginaCatalogo config={configRazas} />
      </QueryClientProvider>
    </ProveedorDeSesionFijo>,
  )
}

describe('permisos por rol en los catálogos (mismos que el backend)', () => {
  afterEach(cleanup)

  it('lectura ve los datos pero no las acciones de escritura', async () => {
    montarComo(['lectura'])

    expect(await screen.findByRole('cell', { name: 'Carniola' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /agregar raza/i })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /editar carniola/i }),
    ).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
  })

  it('producción puede escribir en producción', async () => {
    montarComo(['produccion'])

    expect(
      await screen.findByRole('button', { name: /agregar raza/i }),
    ).toBeTruthy()
    // El encabezado aparece antes que las filas: hay que esperar la tabla.
    expect(
      await screen.findByRole('button', { name: /editar carniola/i }),
    ).toBeTruthy()
  })
})
