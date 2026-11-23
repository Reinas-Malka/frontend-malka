/** Abrir o bajar un archivo por URL prefirmada (vence en minutos: se pide
 *  recién al tocar el botón). */

/** Abre en otra pestaña la URL que devuelve `pedirUrl`. La pestaña se abre
 *  ya, en el clic: abierta después de esperar la URL, el navegador la
 *  bloquea como ventana emergente (igual que en ComprobantePage). */
export async function abrirEnOtraPestana(
  pedirUrl: () => Promise<string>,
): Promise<void> {
  const pestana = window.open('', '_blank')
  try {
    const url = await pedirUrl()
    if (pestana) {
      pestana.opener = null
      pestana.location.href = url
    } else window.open(url, '_blank', 'noopener')
  } catch (error) {
    pestana?.close()
    throw error
  }
}

/** Baja el archivo sin salir de la pantalla. Con una prefirmada de S3 manda
 *  el Content-Disposition del backend; con un blob (la demo), `download`. */
export function bajarArchivo(url: string, nombre: string): void {
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.rel = 'noopener'
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
}
