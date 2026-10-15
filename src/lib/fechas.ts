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
