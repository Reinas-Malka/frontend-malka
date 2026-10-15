import { Hexagon, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { NAVEGACION } from '@/app/navegacion'
import { BannerDatosSimulados } from '@/datos/BannerDatosSimulados'
import { cn } from '@/lib/utils'

/** Estructura de toda pantalla: banner de datos simulados, menú lateral
 *  (cajón en el teléfono) y el contenido de la ruta. */
export function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false)

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
          onClick={() => setMenuAbierto((abierto) => !abierto)}
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
