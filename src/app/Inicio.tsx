import { Navigate } from 'react-router'
import { primerDestino } from '@/app/navegacion'
import { useSesion } from '@/auth/useSesion'

/** El inicio no es una pantalla propia: lleva a la primera sección que el
 *  rol abre (Tandas para producción, Pedidos para ventas). Sin rol, el
 *  layout ya muestra el aviso y acá no se navega. */
export function Inicio() {
  const { identidad } = useSesion()
  const destino = primerDestino(identidad)
  return destino ? <Navigate to={destino} replace /> : null
}
