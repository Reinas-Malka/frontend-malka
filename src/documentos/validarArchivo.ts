// Validación de archivos antes de pedir la URL prefirmada: fallar acá
// es más barato y más claro que fallar contra S3.

const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png']
const TAMANO_MAXIMO_MB = 10

export function validarArchivo(archivo: File): string | null {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return 'Tipo de archivo no permitido. Se aceptan PDF, JPG y PNG.'
  }
  if (archivo.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
    return `El archivo supera el máximo de ${TAMANO_MAXIMO_MB} MB.`
  }
  return null
}
