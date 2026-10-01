// Contrato propuesto con el backend para la subida por URL prefirmada
// (backend #38: la API firma, el navegador sube directo a S3).
// Ajustar cuando el backend publique el endpoint definitivo.
export interface SubidaPreparada {
  url_subida: string
  clave: string
  expira_en_segundos: number
}

export interface PedidoDeSubida {
  nombre: string
  tipo: string
  tamano: number
}
