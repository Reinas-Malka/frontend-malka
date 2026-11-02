/** Reglas de las operaciones por lote que no necesitan la base, copiadas de
 *  app/services/produccion/operaciones.py del backend (#28). Las usa la
 *  simulación de api/tandas.ts para comportarse igual que la API. */

/** Tope de una operación (MAXIMO_CELDAS_POR_OPERACION del backend): alcanza
 *  de sobra para 3 cuadros (405 celdas). */
export const MAXIMO_CELDAS_POR_OPERACION = 10_000

/** Un núcleo activo del parque y cuántas celdas tiene sin cosechar. */
export type NucleoOcupado = {
  id: string
  fila: number
  posicion: number
  ocupadas: number
}

const antes = (a: NucleoOcupado, b: NucleoOcupado) =>
  a.fila - b.fila || a.posicion - b.posicion

/** Cuántas celdas nuevas va a cada núcleo. De a una celda por vez, siempre
 *  al núcleo con menos celdas (las que tenía más las que va recibiendo); a
 *  igual cantidad, el de menor fila y posición. Sin tope por núcleo.
 *  Devuelve solo los que reciben alguna, en orden de fila y posición. */
export function repartir(
  nucleos: readonly NucleoOcupado[],
  cantidad: number,
): { nucleo: NucleoOcupado; celdas: number }[] {
  if (nucleos.length === 0) throw new Error('No hay núcleos para repartir.')
  const recibe = new Map(nucleos.map((n) => [n.id, 0]))
  const carga = (n: NucleoOcupado) => n.ocupadas + (recibe.get(n.id) ?? 0)
  for (let i = 0; i < cantidad; i++) {
    const elegido = nucleos.reduce((mejor, n) =>
      carga(n) < carga(mejor) ||
      (carga(n) === carga(mejor) && antes(n, mejor) < 0)
        ? n
        : mejor,
    )
    recibe.set(elegido.id, (recibe.get(elegido.id) ?? 0) + 1)
  }
  return [...nucleos]
    .sort(antes)
    .map((nucleo) => ({ nucleo, celdas: recibe.get(nucleo.id) ?? 0 }))
    .filter((r) => r.celdas > 0)
}
