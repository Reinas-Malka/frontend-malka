import { request } from './client'
import type { PedidoDeSubida, SubidaPreparada } from '../types/documentos'

// El backend no expone el endpoint todavia (issue #38): en desarrollo se
// puede usar VITE_URL_SUBIDA_FICTICIA con una prefirmada generada a mano
// por la CLI, como sugiere el propio issue.
export function pedirSubida(pedido: PedidoDeSubida): Promise<SubidaPreparada> {
  const urlFicticia = import.meta.env.VITE_URL_SUBIDA_FICTICIA
  if (urlFicticia) {
    return Promise.resolve({
      url_subida: urlFicticia,
      clave: `documentos/dev/${pedido.nombre}`,
      expira_en_segundos: 300,
    })
  }

  return request<SubidaPreparada>('/api/v1/documentos/subidas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido),
  })
}
