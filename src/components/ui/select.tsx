import * as Radix from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Select accesible (Radix): teclado completo, estados normal/disabled/focus. */
export const Select = Radix.Root
export const SelectGroup = Radix.Group

export function SelectTrigger({ className, children, ...props }: Radix.SelectTriggerProps) {
  return (
    <Radix.Trigger
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-control border border-borde bg-carbon-900/60 px-3 text-sm text-texto',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acento',
        'data-[placeholder]:text-texto-suave disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <Radix.Icon asChild><ChevronDown aria-hidden className="size-4 text-texto-suave" /></Radix.Icon>
    </Radix.Trigger>
  )
}

export function SelectContenido({ className, children, ...props }: Radix.SelectContentProps) {
  return (
    <Radix.Portal>
      <Radix.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-auto rounded-control border border-borde bg-panel-alto p-1 text-sm shadow-xl',
          className,
        )}
        {...props}
      >
        <Radix.Viewport>{children}</Radix.Viewport>
      </Radix.Content>
    </Radix.Portal>
  )
}

export function SelectOpcion({ className, children, ...props }: Radix.SelectItemProps) {
  return (
    <Radix.Item
      className={cn(
        'flex cursor-pointer select-none items-center justify-between rounded-control px-2 py-1.5 text-texto outline-none',
        'data-[highlighted]:bg-panel data-[state=checked]:text-miel-300',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <Radix.ItemText>{children}</Radix.ItemText>
      <Radix.ItemIndicator><Check className="size-4" /></Radix.ItemIndicator>
    </Radix.Item>
  )
}

export const SelectValor = Radix.Value
