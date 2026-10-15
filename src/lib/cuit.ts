/** Validación de CUIT, espejo de app/services/ventas/clientes.py del
 *  backend. Solo adelanta el error en el formulario: el backend vuelve a
 *  validar y es quien manda. */
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const

export function normalizarCuit(cuit: string): string {
  return cuit.trim().replace(/-/g, '')
}

export function esCuitValido(cuit: string): boolean {
  const digitos = normalizarCuit(cuit)
  if (!/^\d{11}$/.test(digitos)) return false
  const suma = PESOS_CUIT.reduce(
    (total, peso, i) => total + peso * Number(digitos[i]),
    0,
  )
  let verificador = 11 - (suma % 11)
  if (verificador === 11) verificador = 0
  if (verificador === 10) return false
  return verificador === Number(digitos[10])
}
