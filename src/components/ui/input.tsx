import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Props = InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }

/** Input base. Estados: normal, focus, disabled, inválido (aria-invalid). */
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, invalido, ...props }, ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalido || undefined}
      className={cn(
        'h-10 w-full rounded-control border bg-carbon-900/60 px-3 text-sm text-texto placeholder:text-texto-suave',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acento',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalido ? 'border-peligro' : 'border-borde',
        className,
      )}
      {...props}
    />
  )
})
