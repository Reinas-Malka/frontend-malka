import type { Disponibilidad } from '@/api/health'
import { Badge } from '@/components/ui/badge'
import { Card, CardTitulo } from '@/components/ui/card'
import { formatearFechaHora } from '@/lib/fechas'
import type { Health } from '@/types/health'

type Props = { health: Health; disponibilidad?: Disponibilidad }

const tono = (estado: string) => (estado === 'ok' ? 'ok' : 'peligro')

function StatusCard({ health, disponibilidad }: Props) {
  const filas: [string, string][] = [
    ['Versión', health.version],
    ['Entorno', health.entorno],
    ['Respondió', formatearFechaHora(health.momento)],
  ]
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitulo>API</CardTitulo>
        <Badge tono={tono(health.estado)}>{health.estado}</Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {filas.map(([titulo, valor]) => (
          <div key={titulo} className="contents">
            <dt className="text-texto-suave">{titulo}</dt>
            <dd className="text-texto">{valor}</dd>
          </div>
        ))}
        {Object.entries(disponibilidad?.dependencias ?? {}).map(
          ([dependencia, estado]) => (
            <div key={dependencia} className="contents">
              <dt className="text-texto-suave">
                {dependencia.replaceAll('_', ' ')}
              </dt>
              <dd>
                <Badge tono={tono(estado)}>{estado}</Badge>
              </dd>
            </div>
          ),
        )}
      </dl>
    </Card>
  )
}

export default StatusCard
