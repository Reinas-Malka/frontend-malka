import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalido?: boolean
}

/** Texto largo. Mismos estados que Input: normal, focus, disabled, inválido. */
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(
  function Textarea({ className, invalido, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalido || undefined}
        className={cn(
          'w-full rounded-control border bg-carbon-900/60 px-3 py-2 text-base text-texto placeholder:text-texto-suave sm:text-sm',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acento',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalido ? 'border-peligro-texto' : 'border-borde-control',
          className,
        )}
        {...props}
      />
    )
  },
)
