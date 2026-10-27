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

/** Hoy como `date` del backend (AAAA-MM-DD), con la hora de Argentina como
 *  hoy() de app/fechas.py: a las 22 h del 31 en AR ya es el 1 en UTC. */
export function hoyEnArgentina(ahora: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(ahora)
}
