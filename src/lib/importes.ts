/** Importes: el Decimal del backend viaja como texto ("1500.50") y nunca
 *  pasa por un float, que pierde centavos. Las cuentas se hacen en
 *  centavos con BigInt. */

/** "1500.5" → 150050n. Solo para importes que ya validó el backend. */
function aCentavos(importe: string): bigint {
  const [enteros, decimales = ''] = importe.trim().split('.')
  return BigInt(enteros + decimales.padEnd(2, '0').slice(0, 2))
}

function deCentavos(centavos: bigint): string {
  const signo = centavos < 0n ? '-' : ''
  const digitos = (centavos < 0n ? -centavos : centavos)
    .toString()
    .padStart(3, '0')
  return `${signo}${digitos.slice(0, -2)}.${digitos.slice(-2)}`
}

/** "1500.5" → "1.500,50": miles con punto y siempre dos decimales. */
export function formatearImporte(importe: string): string {
  const [enteros, decimales] = deCentavos(aCentavos(importe)).split('.')
  const conMiles = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${conMiles},${decimales}`
}

/** Precio unitario × cantidad, exacto. */
export const importeDeLinea = (precio: string, cantidad: number): string =>
  deCentavos(aCentavos(precio) * BigInt(cantidad))

export const sumarImportes = (importes: readonly string[]): string =>
  deCentavos(importes.reduce((total, i) => total + aCentavos(i), 0n))
