import type { ReactNode } from 'react'
import { SkeletonTabla } from './skeleton'

/** Los tres estados que separan un front serio de una demo. */

export function Cargando({ columnas = 4, filas = 5 }: { columnas?: number; filas?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando datos">
      <div className="flex items-center gap-3">
        <SkeletonTabla filas={1} columnas={1} />
      </div>
      <SkeletonTabla filas={filas} columnas={columnas} />
    </div>
  )
}

export function Vacio({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-tarjeta border border-dashed border-borde bg-panel/50 px-4 py-10 text-center">
      <p className="text-sm font-medium text-texto">{titulo}</p>
      {children ? <p className="max-w-sm text-xs text-texto-suave">{children}</p> : null}
      {accion}
    </div>
  )
}

/** Error con el formato único del backend (issue #5): { codigo, mensaje, detalles }. */
export function ErrorDePantalla({
  error, reintentar,
}: { error: { codigo?: string; mensaje: string } | null; reintentar?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-tarjeta border border-peligro/40 bg-peligro/10 p-4">
      <p className="text-sm font-medium text-texto">
        {error?.codigo ? <span className="font-mono text-xs text-peligro">{error.codigo} · </span> : null}
        {error?.mensaje ?? 'Algo falló al cargar.'}
      </p>
      <p className="text-xs text-texto-suave">Revisá la conexión y volvé a intentar; si sigue, el codigo queda para reportar.</p>
      {reintentar ? (
        <button onClick={reintentar} className="text-xs font-medium text-miel-300 underline focus-visible:outline-2 focus-visible:outline-acento">
          Reintentar
        </button>
      ) : null}
    </div>
  )
}
