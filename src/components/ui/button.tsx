import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Botón base. Estados: normal, hover, focus-visible, disabled y cargando. */
const variantes = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variante: {
        primario: 'bg-acento text-carbon-900 hover:bg-acento-hover',
        secundario: 'bg-panel text-texto hover:bg-panel-alto border border-borde',
        fantasma: 'text-texto hover:bg-panel',
        peligro: 'bg-peligro text-texto hover:opacity-90',
      },
      tamano: { chico: 'h-8 px-3 text-xs', normal: 'h-10 px-4 text-sm', grande: 'h-12 px-6 text-base' },
    },
    defaultVariants: { variante: 'primario', tamano: 'normal' },
  },
)

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variantes> & { cargando?: boolean; comoHijo?: boolean }

export function Button({ className, variante, tamano, cargando = false, comoHijo = false, disabled, children, ...props }: Props) {
  const Comp = comoHijo ? Slot : 'button'
  return (
    <Comp
      data-cargando={cargando || undefined}
      className={cn(variantes({ variante, tamano }), className)}
      disabled={disabled || cargando}
      {...props}
    >
      {cargando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </Comp>
  )
}
