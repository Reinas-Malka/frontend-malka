import { isRouteErrorResponse, useRouteError } from 'react-router'
import { describirError } from '@/api/client'
import { BannerDatosSimulados } from '@/datos/BannerDatosSimulados'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'

/** Si falla una pantalla (p. ej. no baja su chunk después de un deploy),
 *  se muestra el error con el formato de la app y la opción de recargar. */
export function ErrorDeRuta() {
  const error = useRouteError()
  const mostrable = isRouteErrorResponse(error)
    ? {
        codigo: `http_${error.status}`,
        mensaje: error.statusText || 'No se pudo abrir la pantalla.',
      }
    : describirError(error)
  return (
    <div className="min-h-dvh bg-fondo p-6 text-texto">
      <BannerDatosSimulados />
      <ErrorDePantalla
        error={mostrable}
        reintentar={() => window.location.reload()}
      />
    </div>
  )
}

/** Mientras baja el chunk de la primera pantalla: banner + esqueleto. */
export function CargaInicial() {
  return (
    <div className="min-h-dvh bg-fondo p-6">
      <BannerDatosSimulados />
      <Cargando />
    </div>
  )
}
