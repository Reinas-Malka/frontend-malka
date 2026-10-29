/** Importes: el Decimal del backend viaja como texto ("1500.50") y nunca
 *  pasa por un float, que pierde centavos. Las cuentas se hacen en
 *  centavos con BigInt. */
import type { Pedido, PedidoItem } from '@/tipos/dominio'

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

// --- totales del pedido: solo para la API simulada y la semilla ---
// Las pantallas muestran neto, IVA y total tal como los manda el backend:
// el front no calcula importes fiscales.

/** "0.105" → 105n: la alícuota en milésimas, para multiplicar en enteros. */
const enMilesimas = (alicuota: string): bigint =>
  BigInt(Math.round(Number(alicuota) * 1000))

/** valor / 1000 redondeado a centavos con ROUND_HALF_UP (como redondear()
 *  de importes.py). Solo para valores no negativos. */
const milesimasACentavos = (valor: bigint): bigint => (valor + 500n) / 1000n

type LineaConImporte = Pick<
  PedidoItem,
  'cantidad' | 'precio_unitario' | 'alicuota'
>

/** calcular_totales_pedido de app/services/documentos/importes.py (#113):
 *  el neto de cada línea redondeado a centavos, el IVA una vez por
 *  alícuota sobre la suma de sus netos, y 0% en exportación. En la moneda
 *  del pedido, sin tipo de cambio. */
export function totalesDelPedido(
  lineas: readonly LineaConImporte[],
  exportacion: boolean,
) {
  const netos = lineas.map(
    (l) => aCentavos(l.precio_unitario) * BigInt(l.cantidad),
  )
  const netoPorAlicuota = new Map<bigint, bigint>()
  lineas.forEach((l, n) => {
    const alicuota = exportacion ? 0n : enMilesimas(l.alicuota)
    netoPorAlicuota.set(
      alicuota,
      (netoPorAlicuota.get(alicuota) ?? 0n) + netos[n],
    )
  })
  let neto = 0n
  let iva = 0n
  for (const [alicuota, netoAlicuota] of netoPorAlicuota) {
    neto += netoAlicuota
    iva += milesimasACentavos(netoAlicuota * alicuota)
  }
  return {
    lineas: netos.map(deCentavos),
    neto: deCentavos(neto),
    iva: deCentavos(iva),
    total: deCentavos(neto + iva),
  }
}

/** Un pedido antes de calcular sus importes: lo que arma la simulación. */
export type PedidoSinTotales = Omit<
  Pedido,
  'neto' | 'iva' | 'total' | 'items'
> & {
  items: Omit<PedidoItem, 'neto'>[]
}

/** El pedido como lo devuelve el backend: con el neto de cada línea y los
 *  totales. Exportación si y solo si no es en pesos, como en el backend. */
export function conTotales(pedido: PedidoSinTotales): Pedido {
  const totales = totalesDelPedido(pedido.items, pedido.moneda !== 'ARS')
  return {
    ...pedido,
    items: pedido.items.map((l, n) => ({ ...l, neto: totales.lineas[n] })),
    neto: totales.neto,
    iva: totales.iva,
    total: totales.total,
  }
}
