import { Hexagon, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { NAVEGACION } from '@/app/navegacion'
import { NOMBRE_DE_ROL } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import { Button } from '@/components/ui/button'
import { BannerDatosSimulados } from '@/datos/BannerDatosSimulados'
import { cn } from '@/lib/utils'

/** Estructura de toda pantalla: banner de datos simulados, menú lateral
 *  (cajón en el teléfono) y el contenido de la ruta. */
export function AppLayout() {
  const { pathname } = useLocation()
  // El menú queda abierto solo en la ruta donde se abrió: cualquier
  // navegación (enlace, atrás, adelante) lo cierra sin efectos.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null)
  const menuAbierto = abiertoEn === pathname
  const setMenuAbierto = (abrir: boolean) =>
    setAbiertoEn(abrir ? pathname : null)

  return (
    <div className="min-h-dvh bg-fondo text-texto">
      <BannerDatosSimulados />
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-acento focus:px-3 focus:py-2 focus:text-carbon-900"
      >
        Saltar al contenido
      </a>

      <header className="flex h-14 items-center justify-between border-b border-borde bg-panel px-4 md:hidden">
        <Marca />
        <button
          type="button"
          aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuAbierto}
          aria-controls="menu-principal"
          onClick={() => setMenuAbierto(!menuAbierto)}
          className="inline-flex size-10 items-center justify-center rounded-control text-texto hover:bg-panel-alto focus-visible:outline-2 focus-visible:outline-acento"
        >
          {menuAbierto ? (
            <X aria-hidden className="size-5" />
          ) : (
            <Menu aria-hidden className="size-5" />
          )}
        </button>
      </header>

      <div className="md:grid md:grid-cols-[15rem_1fr]">
        <nav
          id="menu-principal"
          onKeyDown={(e) => e.key === 'Escape' && setMenuAbierto(false)}
          aria-label="Principal"
          className={cn(
            'border-b border-borde bg-panel px-3 py-4 md:sticky md:top-0 md:block md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r',
            menuAbierto ? 'block' : 'hidden',
          )}
        >
          <div className="mb-6 hidden px-2 md:block">
            <Marca />
          </div>
          {NAVEGACION.map((grupo) => (
            <div key={grupo.titulo} className="mb-5">
              <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-texto-suave">
                {grupo.titulo}
              </p>
              <ul className="space-y-0.5">
                {grupo.enlaces.map(({ a, texto, icono: Icono }) => (
                  <li key={a}>
                    <NavLink
                      to={a}
                      end={a === '/'}
                      onClick={() => setMenuAbierto(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex min-h-10 items-center gap-2.5 rounded-control px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-acento',
                          isActive
                            ? 'bg-miel-500/15 font-medium text-miel-300'
                            : 'text-texto-suave hover:bg-panel-alto hover:text-texto',
                        )
                      }
                    >
                      <Icono aria-hidden className="size-4" />
                      {texto}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <UsuarioActual />
        </nav>

        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Marca() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-texto">
      <Hexagon aria-hidden className="size-5 fill-miel-500/20 text-miel-400" />
      Malka Suite
    </span>
  )
}

/** Quién está conectado, con qué rol, y la salida (cierra también la sesión
 *  del hosted UI de Cognito). */
function UsuarioActual() {
  const { identidad, salir } = useSesion()
  const [saliendo, setSaliendo] = useState(false)
  if (!identidad) return null
  const roles =
    identidad.roles.map((rol) => NOMBRE_DE_ROL[rol]).join(', ') ||
    'Sin rol asignado'
  return (
    <div className="mt-6 space-y-2 border-t border-borde px-2 pt-4">
      <p className="truncate text-sm text-texto" title={identidad.email}>
        {identidad.email}
      </p>
      <p className="text-xs text-texto-suave">{roles}</p>
      <Button
        variante="secundario"
        className="w-full"
        cargando={saliendo}
        onClick={() => {
          setSaliendo(true)
          void salir().catch(() => setSaliendo(false))
        }}
      >
        <LogOut aria-hidden className="size-4" /> Salir
      </Button>
    </div>
  )
}
