import { useSyncExternalStore } from 'react'

/** El breakpoint `sm` de Tailwind: desde acá entra una tabla cómoda. */
const CONSULTA = '(min-width: 640px)'

function suscribir(avisar: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const consulta = window.matchMedia(CONSULTA)
  consulta.addEventListener('change', avisar)
  return () => consulta.removeEventListener('change', avisar)
}

/** Sin matchMedia (tests, render en servidor) se asume pantalla ancha. */
function leer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia(CONSULTA).matches
}

/** true en tablet y escritorio, false en el teléfono. */
export function usePantallaAncha(): boolean {
  return useSyncExternalStore(suscribir, leer, () => true)
}
