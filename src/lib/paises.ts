/** Países por su código ISO 3166-1 alfa-2, que es lo que guarda la API
 *  ('NZ'). Los nombres los da el navegador (Intl.DisplayNames): no hay
 *  traducciones que mantener. Lo usan clientes, embarques y pedidos. */

/** Un cliente nacional es de acá; uno de exportación, nunca. */
export const PAIS_LOCAL = 'AR'

const CODIGOS_ISO = `
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
  BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
  CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
  DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
  HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
  KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
  MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
  NA NC NE NF NG NI NL NO NP NR NU NZ OM
  PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
  SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
  TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
  VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`
  .trim()
  .split(/\s+/)

const regiones = new Intl.DisplayNames(['es'], { type: 'region' })

/** "Chile (CL)". Un código que el navegador no conoce se muestra tal cual. */
export function nombreDePais(codigo: string): string {
  try {
    const nombre = regiones.of(codigo)
    return nombre && nombre !== codigo ? `${nombre} (${codigo})` : codigo
  } catch {
    return codigo
  }
}

export type Pais = { codigo: string; nombre: string }

/** Los países de una exportación (todos menos AR), ordenados por nombre. */
export const PAISES_EXTRANJEROS: readonly Pais[] = CODIGOS_ISO.filter(
  (codigo) => codigo !== PAIS_LOCAL,
)
  .map((codigo) => ({ codigo, nombre: nombreDePais(codigo) }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
