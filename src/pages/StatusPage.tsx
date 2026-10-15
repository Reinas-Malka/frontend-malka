import { useQuery } from '@tanstack/react-query'
import { describirError } from '@/api/client'
import { getDisponibilidad, getHealth } from '@/api/health'
import StatusCard from '@/components/StatusCard'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'

function StatusPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth })
  // Independiente de /health: si la base falla, la API igual se muestra viva.
  const disponibilidad = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: getDisponibilidad,
  })

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo="Estado del sistema"
        descripcion="Si la API y la base responden, el resto de las pantallas puede trabajar."
      />
      {health.isPending ? (
        <Cargando columnas={2} filas={3} />
      ) : health.isError ? (
        <ErrorDePantalla
          error={describirError(health.error)}
          reintentar={() => void health.refetch()}
        />
      ) : (
        <StatusCard health={health.data} disponibilidad={disponibilidad.data} />
      )}
      {disponibilidad.isError && health.isSuccess ? (
        <ErrorDePantalla
          error={describirError(disponibilidad.error)}
          reintentar={() => void disponibilidad.refetch()}
        />
      ) : null}
    </section>
  )
}

export default StatusPage
