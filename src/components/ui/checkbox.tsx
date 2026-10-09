import * as Radix from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Checkbox accesible (Radix): estados normal, disabled, foco visible. */
export function Checkbox({ className, disabled, ...props }: Radix.CheckboxProps) {
  return (
    <Radix.Root
      disabled={disabled}
      className={cn(
        'peer size-5 shrink-0 rounded-control border border-borde bg-carbon-900/60',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
        'data-[state=checked]:border-acento data-[state=checked]:bg-acento',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Radix.Indicator className="flex items-center justify-center text-carbon-900">
        <Check className="size-3.5" strokeWidth={3} />
      </Radix.Indicator>
    </Radix.Root>
  )
}
