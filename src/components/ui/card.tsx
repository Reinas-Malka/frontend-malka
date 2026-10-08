import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Tarjeta base (panel con borde y radio propio). */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-tarjeta border border-borde bg-panel p-4', className)} {...props} />
}

export function CardTitulo({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-tarjeta-titulo font-semibold text-texto', className)} {...props} />
}
