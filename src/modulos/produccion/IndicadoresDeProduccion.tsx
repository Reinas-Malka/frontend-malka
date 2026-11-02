import { useQuery } from '@tanstack/react-query'
import { describirError } from '@/api/client'
import { kpis } from '@/api/kpis'
import { Card } from '@/components/ui/card'
import { anchoDeBarra, formatearPorcentaje } from '@/lib/kpis'
import { cn } from '@/lib/utils'
import {
  CLAVE_KPIS,
  EXPLICACION,
  SIN_INTRODUCIDAS,
} from '@/modulos/produccion/kpis'
import type { KpiProduccion } from '@/tipos/dominio'

type Tipo = 'cosecha' | 'perdida'

const COLOR: Record<Tipo, string> = {
  cosecha: 'bg-ok',
  perdida: 'bg-peligro',
}

/** Un % con su barra. La barra es decorativa: el número es lo que se lee
 *  (y lo que anuncia un lector de pantalla). Sin introducidas, "—" y por
 *  qué, nunca un 0 que parezca un dato. */
export function Porcentaje({
  valor,
  tipo,
  className,
}: {
  valor: string | null
  tipo: Tipo
  className?: string
}) {
  const texto = formatearPorcentaje(valor)
  if (texto === null)
    return (
      <span className={cn('inline-flex flex-col', className)}>
        <span aria-hidden className="font-mono text-texto-suave">
          —
        </span>
        <span className="text-xs text-texto-suave">{SIN_INTRODUCIDAS}</span>
      </span>
    )
  return (
    <span className={cn('inline-flex min-w-24 flex-col gap-1', className)}>
      <span className="font-mono tabular-nums text-texto">{texto}</span>
      <span
        aria-hidden
        className="block h-1.5 w-full overflow-hidden rounded-full bg-carbon-900/60"
      >
        <span
          className={cn('block h-full rounded-full', COLOR[tipo])}
          style={{ width: `${anchoDeBarra(valor)}%` }}
        />
      </span>
    </span>
  )
}

/** Qué significa cada indicador, para el apicultor. */
export function ExplicacionDeKpis() {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Card className="space-y-1">
        <dt className="text-sm font-medium text-texto">% de cosecha</dt>
        <dd className="text-sm text-texto-suave">{EXPLICACION.cosecha}</dd>
      </Card>
      <Card className="space-y-1">
        <dt className="text-sm font-medium text-texto">
          % de pérdida en el parque
        </dt>
        <dd className="text-sm text-texto-suave">
          {EXPLICACION.perdida} {EXPLICACION.enCurso}
        </dd>
      </Card>
    </dl>
  )
}

function Indicador({
  titulo,
  valor,
  tipo,
  detalle,
}: {
  titulo: string
  valor: string | null
  tipo: Tipo
  detalle: string
}) {
  return (
    <Card className="space-y-2">
      <h3 className="text-sm font-medium text-texto">{titulo}</h3>
      <Porcentaje valor={valor} tipo={tipo} className="w-full text-xl" />
      <p className="text-xs text-texto-suave">{detalle}</p>
    </Card>
  )
}

const celdas = (n: number) => `${n} ${n === 1 ? 'celda' : 'celdas'}`

/** Los dos % de una tanda, en su detalle. Usa el mismo endpoint que la
 *  pantalla de indicadores, filtrado al día del traslarve, y toma la fila
 *  de esta tanda. Si falla, la tanda se sigue viendo. */
export function IndicadoresDeTanda({
  tandaId,
  fechaTraslarve,
}: {
  tandaId: string
  fechaTraslarve: string
}) {
  const consulta = useQuery({
    queryKey: [...CLAVE_KPIS, 'tanda', tandaId, fechaTraslarve],
    queryFn: () =>
      kpis.produccion({
        agrupar: 'tanda',
        desde: fechaTraslarve,
        hasta: fechaTraslarve,
      }),
  })
  const fila: KpiProduccion | undefined = consulta.data?.find(
    (k) => k.tanda_id === tandaId,
  )

  return (
    <section aria-labelledby="indicadores-de-tanda" className="space-y-3">
      <h2
        id="indicadores-de-tanda"
        className="text-lg font-semibold text-texto"
      >
        Indicadores
      </h2>
      {consulta.isPending ? (
        <p className="text-sm text-texto-suave">Calculando los indicadores…</p>
      ) : consulta.isError ? (
        <p
          role="alert"
          className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
        >
          No se pudieron calcular los indicadores:{' '}
          {describirError(consulta.error).mensaje}
        </p>
      ) : !fila ? (
        <p className="text-sm text-texto-suave">
          No hay indicadores para esta tanda.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Indicador
            titulo="% de cosecha"
            valor={fila.porcentaje_cosecha}
            tipo="cosecha"
            detalle={`${celdas(fila.cosechadas)} cosechadas de ${fila.introducidas} introducidas. ${EXPLICACION.cosecha}`}
          />
          <Indicador
            titulo="% de pérdida en el parque"
            valor={fila.porcentaje_perdida}
            tipo="perdida"
            detalle={`${celdas(fila.perdidas)} perdidas de ${fila.introducidas} introducidas${fila.en_parque > 0 ? `; ${celdas(fila.en_parque)} siguen en el parque` : ''}. ${EXPLICACION.perdida}`}
          />
        </div>
      )}
    </section>
  )
}
