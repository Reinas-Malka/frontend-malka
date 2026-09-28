import type { Health } from '../types/health'

interface StatusCardProps {
  health: Health
}

function StatusCard({ health }: StatusCardProps) {
  return (
    <dl>
      <dt>Estado</dt>
      <dd>{health.estado}</dd>

      <dt>Versión</dt>
      <dd>{health.version}</dd>

      <dt>Entorno</dt>
      <dd>{health.entorno}</dd>

      <dt>Momento</dt>
      <dd>{new Date(health.momento).toLocaleString()}</dd>
    </dl>
  )
}

export default StatusCard
