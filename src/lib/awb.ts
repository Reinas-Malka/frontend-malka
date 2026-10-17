/** Guía aérea IATA (AWB): prefijo de la aerolínea, 7 dígitos de serie y un
 *  dígito verificador = serie mod 7. Misma regla que normalizar_awb del
 *  backend (app/services/exportacion/embarques.py): acá solo adelanta el
 *  error en el formulario; el backend valida igual. */
const AWB = /^(\d{3})[\s-]?(\d{7})(\d)$/

/** La guía como NNN-NNNNNNNN, o null si no es válida. */
export function normalizarAwb(valor: string): string | null {
  const partes = AWB.exec(valor.trim())
  if (!partes) return null
  const [, prefijo, serie, verificador] = partes
  if (Number(serie) % 7 !== Number(verificador)) return null
  return `${prefijo}-${serie}${verificador}`
}

export function errorDeAwb(valor: string): string | null {
  if (!AWB.test(valor.trim()))
    return 'La guía aérea tiene el formato NNN-NNNNNNNN.'
  return normalizarAwb(valor)
    ? null
    : 'El dígito verificador de la guía aérea no coincide.'
}
