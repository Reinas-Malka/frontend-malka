import { cn } from '@/lib/utils'

/** Barra de progreso accesible (role="progressbar" con aria-valuenow). */
export function BarraDeProgreso({
  valor,
  etiqueta,
  className,
}: {
  valor: number
  etiqueta: string
  className?: string
}) {
  const acotado = Math.max(0, Math.min(100, Math.round(valor)))
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex justify-between text-xs text-texto-suave">
        <span>{etiqueta}</span>
        <span className="font-mono tabular-nums">{acotado}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={acotado}
        className="h-2 overflow-hidden rounded-full bg-carbon-900/60"
      >
        <div
          className="h-full rounded-full bg-acento transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${acotado}%` }}
        />
      </div>
    </div>
  )
}
