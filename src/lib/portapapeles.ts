/** Copiar texto al portapapeles. navigator.clipboard solo existe en un
 *  contexto seguro (HTTPS o localhost) y puede no tener permiso: en ese
 *  caso se usa el método viejo, un textarea fuera de la vista y
 *  execCommand('copy'). Devuelve si se pudo copiar. */
export async function copiarTexto(texto: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto)
      return true
    } catch {
      // Sin permiso o sin foco: se prueba con el método viejo.
    }
  }
  return copiarConTextarea(texto)
}

function copiarConTextarea(texto: string): boolean {
  const area = document.createElement('textarea')
  area.value = texto
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.focus()
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
