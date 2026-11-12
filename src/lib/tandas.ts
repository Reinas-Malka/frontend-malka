/** Reglas de las tandas que no necesitan la base: el ciclo de cría (la
 *  fecha de salida y si está atrasada) y las operaciones por lote copiadas
 *  de app/services/produccion/operaciones.py del backend (#28). Las usan
 *  las pantallas y la simulación de api/tandas.ts. */
import { hoyEnArgentina, sumarDias } from '@/lib/fechas'
import type { EstadoTanda } from '@/tipos/dominio'

/** Eje B de docs/dominio.md ("Ciclo de cría"): la celda se introduce al
 *  núcleo ~D10 (I0) y a I0+16 queda enjaulada, lista para despacho o para
 *  pasar a un banco: ≈ D26 contado desde el traslarve (D0). Es una
 *  estimación para planificar, no una fecha registrada: la real es la de la
 *  cosecha. Mismo valor que DIAS_HASTA_LA_SALIDA del backend. */
export const DIAS_HASTA_LA_SALIDA = 26

type TandaParaElCiclo = {
  fecha_traslarve: string
  celdas_por_estado: Record<string, number>
  /** Si el backend ya la manda (feat/observaciones-produccion), manda esa. */
  fecha_salida_estimada?: string | null
  estado?: EstadoTanda | null
}

/** Cuándo sale aprox. la tanda: la que calcula el backend si la trae; si
 *  no, el traslarve más DIAS_HASTA_LA_SALIDA. */
export function fechaDeSalidaEstimada(
  tanda: Pick<TandaParaElCiclo, 'fecha_traslarve' | 'fecha_salida_estimada'>,
): string {
  return (
    tanda.fecha_salida_estimada ??
    sumarDias(tanda.fecha_traslarve, DIAS_HASTA_LA_SALIDA)
  )
}

const contar = (tanda: TandaParaElCiclo, estado: string) =>
  tanda.celdas_por_estado[estado] ?? 0

/** En curso o cosechada. Si el backend no lo trae todavía, sale de las
 *  celdas: hay reinas cosechadas (enjauladas o despachadas). Una cosecha de
 *  0 reinas no deja rastro en los conteos: ahí manda el backend. */
export function estadoDeTanda(tanda: TandaParaElCiclo): EstadoTanda {
  if (tanda.estado) return tanda.estado
  return contar(tanda, 'enjaulada') + contar(tanda, 'despachada') > 0
    ? 'cosechada'
    : 'en_curso'
}

/** ¿Pasó el día de salida y la tanda sigue sin cosechar, con celdas por
 *  introducir o en el parque? Pasa con una carga retroactiva o con una
 *  tanda que se olvidó cosechar: es un dato real, se muestra, pero marcado. */
export function estaAtrasada(
  tanda: TandaParaElCiclo,
  hoy: string = hoyEnArgentina(),
): boolean {
  const pendientes = contar(tanda, 'trasladada') + contar(tanda, 'introducida')
  return (
    estadoDeTanda(tanda) === 'en_curso' &&
    pendientes > 0 &&
    hoy > fechaDeSalidaEstimada(tanda)
  )
}

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
