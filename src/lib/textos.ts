/** Utilidades de texto para mostrar, sin tocar el dato guardado. */

/** "reina fecundada" → "Reina fecundada": la primera letra en mayúscula
 *  (con la regla del español) y el resto tal cual. Solo para mostrar: el
 *  nombre se guarda como lo cargaron. */
export function capitalizar(texto: string): string {
  const limpio = texto.trimStart()
  if (!limpio) return texto
  const [primera] = limpio
  return `${primera.toLocaleUpperCase('es-AR')}${limpio.slice(primera.length)}`
}
