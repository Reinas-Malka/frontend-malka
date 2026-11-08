import { Navigate } from 'react-router'
import { primerDestino } from '@/app/navegacion'
import { useSesion } from '@/auth/useSesion'

/** El inicio no es una pantalla propia: lleva a Indicadores (admin,
 *  producción y lectura) o a lo primero que el rol abre (Pedidos para
 *  ventas). El logo trae acá. Sin rol, el layout ya muestra el aviso y acá
 *  no se navega. */
export function Inicio() {
  const { identidad } = useSesion()
  const destino = primerDestino(identidad)
  return destino ? <Navigate to={destino} replace /> : null
}
