import { cn } from '@/lib/utils'

/** Skeleton: la pantalla de carga muestra forma, no un spinner pelado. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-control bg-carbon-700/70', className)} {...props} />
}

export function SkeletonTabla({ filas = 5, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Cargando">
      {Array.from({ length: filas }).map((_, f) => (
        <div key={f} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columnas}, 1fr)` }}>
          {Array.from({ length: columnas }).map((_, c) => (
            <Skeleton key={c} className="h-8" />
          ))}
        </div>
      ))}
    </div>
  )
}
