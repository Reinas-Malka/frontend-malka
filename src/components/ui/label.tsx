import * as LabelRadix from '@radix-ui/react-label'
import type { LabelHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Label asociado a control (a11y): htmlFor explícito, foco visible. */
export function Label({ className, children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <LabelRadix.Root className={cn('text-sm font-medium text-texto', className)} {...props}>
      {children}
    </LabelRadix.Root>
  )
}

/** Campo de formulario con label, ayuda y error de campo (aria-describedby). */
export function Field({
  label, htmlFor, error, ayuda, children,
}: { label: string; htmlFor: string; error?: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-peligro">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${htmlFor}-ayuda`} className="text-xs text-texto-suave">{ayuda}</p>
      ) : null}
    </div>
  )
}
