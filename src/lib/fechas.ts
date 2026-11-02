/** Fecha y hora para mostrar. Reloj de 24 h explícito: el formato es-AR por
 *  defecto usa 12 h y en algunos navegadores pierde el "p. m." (14:47 se veía
 *  como 02:47). El huso es el del navegador salvo que se pase otro. */
export function formatearFechaHora(
  fecha: string | Date,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(fecha))
}

/** Un date del backend (AAAA-MM-DD) para mostrar: dd/mm/aaaa, como se lee
 *  en Argentina. Se arma del texto, sin Date: así no se corre de día por el
 *  huso del navegador. */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

/** La cabaña opera en Argentina: "hoy" es el de Buenos Aires, aunque el
 *  navegador esté en otro huso (igual que app/fechas.py del backend). */
export const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires'

/** Fecha de hoy en Argentina como AAAA-MM-DD, el `date` del backend. */
export function hoyEnArgentina(ahora: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_ARGENTINA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

/** Segundos que faltan para la medianoche de Argentina: cuando se renueva
 *  el límite diario de la IA (limites.py del backend). Entre 1 y 86 400. */
export function segundosHastaMedianocheEnArgentina(
  ahora: Date = new Date(),
): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_ARGENTINA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora)
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0)
  return (
    86_400 - (parte('hour') * 3600 + parte('minute') * 60 + parte('second'))
  )
}

/** Días entre dos fechas AAAA-MM-DD (hasta − desde). Sin horas ni husos:
 *  las dos se toman como medianoche UTC. */
export function diasEntre(desde: string, hasta: string): number {
  const dia = (fecha: string) => Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`)
  return Math.round((dia(hasta) - dia(desde)) / 86_400_000)
}

/** Domingo para una fecha AAAA-MM-DD (sin depender del huso del navegador). */
export function esDomingo(fecha: string): boolean {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0
}

/** ¿Es una fecha AAAA-MM-DD que existe? Para lo que llega de la URL: un
 *  texto cualquiera se ignora en vez de mandarlo y recibir un 422. */
export function esFechaValida(texto: string | null | undefined): boolean {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false
  const fecha = new Date(`${texto}T12:00:00Z`)
  return (
    !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto
  )
}

/** Un período por fecha de traslarve, con los dos días incluidos. */
export type Periodo = { desde?: string; hasta?: string }

/** El error de un período para mostrar, o null si está bien. El backend
 *  responde 422 periodo_invalido si termina antes de empezar: se avisa antes
 *  de pedirlo. */
export function errorDePeriodo({ desde, hasta }: Periodo): string | null {
  if (desde && hasta && hasta < desde)
    return 'La fecha final no puede ser anterior a la inicial.'
  return null
}

/** El período de la URL (?desde=&hasta=): una fecha mal escrita se ignora. */
export function leerPeriodo(params: URLSearchParams): Periodo {
  const desde = params.get('desde')
  const hasta = params.get('hasta')
  return {
    desde: esFechaValida(desde) ? (desde ?? undefined) : undefined,
    hasta: esFechaValida(hasta) ? (hasta ?? undefined) : undefined,
  }
}
