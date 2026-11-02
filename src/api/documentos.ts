import { ApiError, request } from '@/api/client'
import { usaDatosSimulados } from '@/datos/cliente'
import type { DescargaPreparada } from '@/tipos/dominio'
import type { PedidoDeSubida, SubidaPreparada } from '@/types/documentos'

// Subida y descarga por URL prefirmada (backend #102): los bytes van directo
// entre el navegador y S3, nunca por la API. En desarrollo,
// VITE_URL_SUBIDA_FICTICIA permite probar la subida con una prefirmada
// generada a mano por la CLI.
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
    metodo: 'POST',
    cuerpo: pedido,
  })
}

/** URL para bajar un documento del criadero. Vence en 2 minutos: se pide
 *  recién cuando la persona toca "Descargar". Con enLinea el navegador lo
 *  muestra en la pestaña en vez de bajarlo ("Abrir"). */
export function pedirDescarga(
  clave: string,
  { enLinea = false }: { enLinea?: boolean } = {},
): Promise<DescargaPreparada> {
  if (usaDatosSimulados(import.meta.env.VITE_DATOS_SIMULADOS)) {
    return Promise.reject(
      new ApiError({
        codigo: 'descarga_no_disponible',
        mensaje: 'En la demo con datos de ejemplo no hay archivos para bajar.',
      }),
    )
  }
  return request<DescargaPreparada>('/api/v1/documentos/descarga', {
    query: { clave, en_linea: enLinea ? 'true' : undefined },
  })
}
