/** KPIs de producción (docs/dominio.md, redefinidos el 23/10), sin React.
 *  Repite app/services/produccion/repositorio_kpis.py del backend para la
 *  demo sin backend, y formatea los % para mostrarlos.
 *
 *  - introducidas: celdas con fecha de introducción (entraron a un núcleo).
 *  - cosechadas: de esas, enjauladas o despachadas.
 *  - pérdidas: de esas, descartadas con núcleo (el resto de la cosecha).
 *  - en el parque: introducidas que todavía no se cosecharon.
 *  - % de cosecha = cosechadas / introducidas; % de pérdida = pérdidas /
 *    introducidas. Con un decimal y null sin introducidas: nunca un 0 que
 *    parezca un dato. Por raza se suman las celdas y después se divide. */
import type { Periodo } from '@/lib/fechas'
import type {
  AgrupacionKpi,
  Celda,
  KpiProduccion,
  Raza,
  Tanda,
} from '@/tipos/dominio'

/** parte / total en %, con un decimal y redondeo half-up (el
 *  ROUND_HALF_UP de kpis.py), como texto: "79.2". null si total es 0. */
export function porcentaje(parte: number, total: number): string | null {
  if (total === 0) return null
  // En décimas y con enteros: sin errores de coma flotante en el .5.
  const decimas = Math.floor((2000 * parte + total) / (2 * total))
  return `${Math.floor(decimas / 10)}.${decimas % 10}`
}

type Conteos = Pick<
  KpiProduccion,
  'introducidas' | 'cosechadas' | 'perdidas' | 'en_parque'
>

const SIN_CELDAS: Conteos = {
  introducidas: 0,
  cosechadas: 0,
  perdidas: 0,
  en_parque: 0,
}

/** Lo que aporta una celda a cada conteo. Cosechadas y pérdidas exigen
 *  haber entrado al núcleo, como el denominador: ningún % pasa de 100. */
function sumar(conteos: Conteos, c: Celda): Conteos {
  const entro = c.fecha_introduccion !== null
  return {
    introducidas: conteos.introducidas + (entro ? 1 : 0),
    cosechadas:
      conteos.cosechadas +
      (entro && (c.estado === 'enjaulada' || c.estado === 'despachada')
        ? 1
        : 0),
    perdidas:
      conteos.perdidas +
      (entro && c.estado === 'descartada' && c.nucleo_id !== null ? 1 : 0),
    en_parque: conteos.en_parque + (c.estado === 'introducida' ? 1 : 0),
  }
}

const conPorcentajes = (
  fila: Omit<KpiProduccion, 'porcentaje_cosecha' | 'porcentaje_perdida'>,
): KpiProduccion => ({
  ...fila,
  porcentaje_cosecha: porcentaje(fila.cosechadas, fila.introducidas),
  porcentaje_perdida: porcentaje(fila.perdidas, fila.introducidas),
})

export type TandaParaKpis = Pick<Tanda, 'id' | 'raza_id' | 'fecha_traslarve'>

export type ParametrosDeKpis = Periodo & { agrupar?: AgrupacionKpi }

/** Los KPIs de las tandas traslarvadas en el período. `tandas` va en el
 *  orden de carga: a igual fecha de traslarve, la cargada después va
 *  primero (el ORDER BY ... creado_en DESC del backend). */
export function calcularKpis(
  tandas: readonly TandaParaKpis[],
  celdas: readonly Celda[],
  razas: readonly Pick<Raza, 'id' | 'nombre'>[],
  { agrupar = 'tanda', desde, hasta }: ParametrosDeKpis = {},
): KpiProduccion[] {
  const nombreDeRaza = new Map(razas.map((r) => [r.id, r.nombre]))
  const delPeriodo = tandas
    .map((t, orden) => ({ t, orden }))
    .filter(
      ({ t }) =>
        (!desde || t.fecha_traslarve >= desde) &&
        (!hasta || t.fecha_traslarve <= hasta),
    )
    .sort(
      (a, b) =>
        b.t.fecha_traslarve.localeCompare(a.t.fecha_traslarve) ||
        b.orden - a.orden,
    )
    .map(({ t }) => t)

  const porTanda = new Map<string, Conteos>()
  for (const c of celdas)
    porTanda.set(c.tanda_id, sumar(porTanda.get(c.tanda_id) ?? SIN_CELDAS, c))
  const conteosDe = (tandaId: string) => porTanda.get(tandaId) ?? SIN_CELDAS

  if (agrupar === 'tanda')
    return delPeriodo.map((t) =>
      conPorcentajes({
        tanda_id: t.id,
        fecha_traslarve: t.fecha_traslarve,
        raza_id: t.raza_id,
        raza: nombreDeRaza.get(t.raza_id) ?? '',
        tandas: 1,
        ...conteosDe(t.id),
      }),
    )

  // Por raza: solo las que tienen alguna tanda en el período.
  const porRaza = new Map<string, { tandas: number; conteos: Conteos }>()
  for (const t of delPeriodo) {
    const previo = porRaza.get(t.raza_id) ?? { tandas: 0, conteos: SIN_CELDAS }
    const deLaTanda = conteosDe(t.id)
    porRaza.set(t.raza_id, {
      tandas: previo.tandas + 1,
      conteos: {
        introducidas: previo.conteos.introducidas + deLaTanda.introducidas,
        cosechadas: previo.conteos.cosechadas + deLaTanda.cosechadas,
        perdidas: previo.conteos.perdidas + deLaTanda.perdidas,
        en_parque: previo.conteos.en_parque + deLaTanda.en_parque,
      },
    })
  }
  return [...porRaza]
    .map(([razaId, { tandas: cantidad, conteos }]) =>
      conPorcentajes({
        tanda_id: null,
        fecha_traslarve: null,
        raza_id: razaId,
        raza: nombreDeRaza.get(razaId) ?? '',
        tandas: cantidad,
        ...conteos,
      }),
    )
    .sort(
      (a, b) =>
        a.raza.localeCompare(b.raza) || a.raza_id.localeCompare(b.raza_id),
    )
}

/** "79,2 %" para mostrar; null (sin introducidas) no es un número. */
export function formatearPorcentaje(valor: string | null): string | null {
  if (valor === null) return null
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return null
  return `${numero.toFixed(1).replace('.', ',')} %`
}

/** El % como número entre 0 y 100 para dibujar la barra. */
export function anchoDeBarra(valor: string | null): number {
  const numero = Number(valor)
  if (valor === null || !Number.isFinite(numero)) return 0
  return Math.max(0, Math.min(100, numero))
}
