import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Insignia de estado. Incluye los estados del ciclo de la celda (dominio C.3). */
const variantes = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tono: {
        neutro: 'border-borde bg-panel text-texto-suave',
        miel: 'border-miel-600/40 bg-miel-500/15 text-miel-300',
        ok: 'border-ok/40 bg-ok/15 text-ok',
        aviso: 'border-aviso/40 bg-aviso/15 text-aviso',
        peligro: 'border-peligro/40 bg-peligro/15 text-peligro',
      },
    },
    defaultVariants: { tono: 'neutro' },
  },
)

export function Badge({ className, tono, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof variantes>) {
  return <span className={cn(variantes({ tono }), className)} {...props} />
}
