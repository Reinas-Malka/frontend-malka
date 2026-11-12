/** Identificador automático del banco, para la simulación (api/recursos.ts):
 *  la misma regla que services/produccion/bancos.py del backend (#155), que
 *  es quien lo asigna de verdad. La serie es B-01, B-02, … del criadero: el
 *  número más alto ya usado más uno, sin rellenar huecos (un banco nunca se
 *  borra: reusar un número confundiría a quien ya lo vio en el campo). */

const PREFIJO = 'B-'
/** Al menos dos dígitos (B-01); desde el 100 crece solo (B-100). */
const DIGITOS_MINIMOS = 2
/** Los que cuentan para la serie: "B-" y solo dígitos (hasta 9, como el
 *  backend). "Banco norte" o "B-7a" no la mueven. */
const DE_LA_SERIE = /^B-(\d{1,9})$/

export function siguienteIdentificadorDeBanco(
  bancos: readonly { identificador: string }[],
): string {
  const mayor = bancos.reduce((max, { identificador }) => {
    const numero = DE_LA_SERIE.exec(identificador.trim())
    return numero ? Math.max(max, Number(numero[1])) : max
  }, 0)
  return `${PREFIJO}${String(mayor + 1).padStart(DIGITOS_MINIMOS, '0')}`
}
