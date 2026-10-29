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
