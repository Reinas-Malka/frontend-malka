import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Breadcrumb({ items, className }: { items: { label: string; actual?: boolean }[]; className?: string }) {
  return (
    <nav aria-label="Ruta" className={cn('flex items-center gap-1 text-xs text-texto-suave', className)}>
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight aria-hidden className="size-3" />}
          <span aria-current={item.actual ? 'page' : undefined} className={item.actual ? 'text-miel-300' : undefined}>
            {item.label}
          </span>
        </span>
      ))}
    </nav>
  )
}

