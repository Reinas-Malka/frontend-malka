// Subida directa a S3 por URL prefirmada. Se usa XMLHttpRequest porque
// fetch todavía no reporta progreso de subida.

import type { SubidaPreparada } from '../types/documentos'

export class ErrorDeSubida extends Error {
  readonly estado: number | null

  constructor(message: string, estado: number | null = null) {
    super(message)
    this.name = 'ErrorDeSubida'
    this.estado = estado
  }
}

// Una prefirmada vencida o mal firmada responde 403: en ese caso conviene
// pedir otra URL y reintentar, el archivo no cambió.
export function esUrlVencida(error: unknown): boolean {
  return error instanceof ErrorDeSubida && error.estado === 403
}

export function subirPorUrlPrefermada(
  subida: SubidaPreparada,
  archivo: File,
  alAvanzar: (progreso: number) => void,
): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', subida.url_subida)
    xhr.setRequestHeader('Content-Type', archivo.type)

    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable) {
        alAvanzar(Math.round((evento.loaded / evento.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolver()
      } else {
        rechazar(
          new ErrorDeSubida(
            `S3 rechazó la subida (estado ${xhr.status}).`,
            xhr.status,
          ),
        )
      }
    }
    xhr.onerror = () =>
      rechazar(
        new ErrorDeSubida('Falló la conexión con S3 durante la subida.', null),
      )
    xhr.onabort = () =>
      rechazar(new ErrorDeSubida('La subida fue cancelada.', null))

    xhr.send(archivo)
  })
}
