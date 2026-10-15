/** Sesión del usuario (issue #6). Un solo lugar sabe de Cognito: el resto de
 *  la app pregunta `useSesion()` y el cliente HTTP recibe el token por
 *  fijarProveedorDeToken. Con VITE_DATOS_SIMULADOS=true no hay login: la demo
 *  corre con un usuario de ejemplo (y el banner fijo). */
import { ErrorResponse, UserManager, type User } from 'oidc-client-ts'
import { useEffect, useState, type ReactNode } from 'react'
import { fijarAlNoAutenticado, fijarProveedorDeToken } from '@/api/client'
import { configuracionCognito } from '@/auth/config'
import { identidadDesdePerfil, type Identidad } from '@/auth/identidad'
import {
  ContextoDeSesion,
  destinoSeguro,
  type EstadoDeSesion,
  type ValorDeSesion,
} from '@/auth/useSesion'
import { usaDatosSimulados } from '@/datos/cliente'

const IDENTIDAD_DEMO: Identidad = {
  email: 'demo@malka.test',
  roles: ['admin'],
  tenantId: '11111111-1111-4111-8111-111111111111',
}

export function ProveedorDeSesion({ children }: { children: ReactNode }) {
  return usaDatosSimulados(import.meta.env.VITE_DATOS_SIMULADOS) ? (
    <ProveedorDeSesionFijo identidad={IDENTIDAD_DEMO}>
      {children}
    </ProveedorDeSesionFijo>
  ) : (
    <ProveedorDeSesionCognito>{children}</ProveedorDeSesionCognito>
  )
}

/** Sesión fija: demo con datos simulados y tests. */
export function ProveedorDeSesionFijo({
  identidad,
  children,
}: {
  identidad: Identidad
  children: ReactNode
}) {
  const valor: ValorDeSesion = {
    identidad,
    estado: 'listo',
    error: null,
    ingresar: async () => {},
    completarIngreso: async () => '/',
    salir: async () => {},
  }
  return (
    <ContextoDeSesion.Provider value={valor}>
      {children}
    </ContextoDeSesion.Provider>
  )
}

type Gestor = { gestor: UserManager } | { error: string }

/** Crea el UserManager y conecta el cliente HTTP. Se hace al crear (no en un
 *  efecto): los efectos de los hijos corren antes que los del padre y la
 *  primera consulta saldría sin token. */
function crearGestor(): Gestor {
  try {
    const config = configuracionCognito(
      import.meta.env,
      window.location.origin,
      window.sessionStorage,
    )
    const gestor = new UserManager(config)
    fijarProveedorDeToken(async () => {
      const usuario = await gestor.getUser()
      if (usuario && !usuario.expired) return usuario.id_token ?? null
      // Vencido: se renueva con el refresh token; si no se puede, sin token
      // → el backend responde 401 → se vuelve al login.
      const renovado = await gestor.signinSilent().catch(() => null)
      return renovado?.id_token ?? null
    })
    // El backend rechazó el token (vencido o revocado): se descarta la sesión
    // y RutaPrivada manda al login, recordando la pantalla.
    fijarAlNoAutenticado(() => void gestor.removeUser())
    return { gestor }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'No se pudo configurar el login.',
    }
  }
}

function ProveedorDeSesionCognito({ children }: { children: ReactNode }) {
  const [creado] = useState(crearGestor)
  const [usuario, setUsuario] = useState<User | null>(null)
  const [estado, setEstado] = useState<EstadoDeSesion>(
    'error' in creado ? 'error' : 'cargando',
  )

  // Sincroniza con un sistema externo (UserManager): efecto legítimo.
  useEffect(() => {
    if ('error' in creado) return
    const { gestor } = creado
    let vigente = true
    void gestor.getUser().then((u) => {
      if (!vigente) return
      setUsuario(u && !u.expired ? u : null)
      setEstado('listo')
    })
    const alCargar = (u: User) => setUsuario(u)
    const alDescargar = () => setUsuario(null)
    // Un corte de red no cierra la sesión: solo si Cognito rechaza el
    // refresh token (vencido o revocado) se descarta y se vuelve al login.
    const alFallarRenovacion = (error: Error) => {
      if (error instanceof ErrorResponse && error.error === 'invalid_grant')
        void gestor.removeUser()
    }
    gestor.events.addUserLoaded(alCargar)
    gestor.events.addUserUnloaded(alDescargar)
    gestor.events.addSilentRenewError(alFallarRenovacion)
    return () => {
      vigente = false
      gestor.events.removeUserLoaded(alCargar)
      gestor.events.removeUserUnloaded(alDescargar)
      gestor.events.removeSilentRenewError(alFallarRenovacion)
    }
  }, [creado])

  if ('error' in creado) {
    const conError: ValorDeSesion = {
      identidad: null,
      estado: 'error',
      error: creado.error,
      ingresar: async () => {},
      completarIngreso: async () => '/',
      salir: async () => {},
    }
    return (
      <ContextoDeSesion.Provider value={conError}>
        {children}
      </ContextoDeSesion.Provider>
    )
  }

  const { gestor } = creado
  const valor: ValorDeSesion = {
    identidad: usuario ? identidadDesdePerfil(usuario.profile) : null,
    estado,
    error: null,
    ingresar: (volverA = '/') =>
      gestor.signinRedirect({ state: { volverA: destinoSeguro(volverA) } }),
    completarIngreso: async () => {
      const u = await gestor.signinRedirectCallback()
      setUsuario(u)
      return destinoSeguro(
        (u.state as { volverA?: unknown } | undefined)?.volverA,
      )
    },
    // Al salir: 1) se revoca el refresh token en Cognito (si no, sirve 30
    // días más); 2) se borra la sesión local, así el ID token no viaja como
    // id_token_hint en la URL del logout; 3) se cierra la sesión del hosted
    // UI (/logout pide client_id, que la librería agrega sola, y logout_uri).
    salir: async () => {
      await gestor.revokeTokens(['refresh_token']).catch(() => undefined)
      await gestor.removeUser()
      await gestor.signoutRedirect({
        extraQueryParams: { logout_uri: `${window.location.origin}/` },
      })
    },
  }
  return (
    <ContextoDeSesion.Provider value={valor}>
      {children}
    </ContextoDeSesion.Provider>
  )
}
