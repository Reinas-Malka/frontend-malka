import { Navigate, Outlet, useLocation } from 'react-router'
import { CargaInicial } from '@/app/ErrorDeRuta'
import { useSesion } from '@/auth/useSesion'
import { ErrorDePantalla } from '@/components/ui/estados'

/** Guard de sesión (#4/#6): sin sesión, al login recordando la pantalla. Es
 *  comodidad de UI: la protección real es el backend (401 sin token). */
export function RutaPrivada() {
  const { identidad, estado, error } = useSesion()
  const { pathname, search } = useLocation()

  if (estado === 'cargando') return <CargaInicial />
  if (estado === 'error') {
    return (
      <div className="min-h-dvh bg-fondo p-6">
        <ErrorDePantalla
          error={{
            codigo: 'sin_configuracion',
            mensaje: error ?? 'No se pudo configurar el login.',
          }}
        />
      </div>
    )
  }
  if (!identidad) {
    return (
      <Navigate
        to={`/login?volver=${encodeURIComponent(pathname + search)}`}
        replace
      />
    )
  }
  return <Outlet />
}
