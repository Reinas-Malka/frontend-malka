import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Modal accesible (Radix Dialog): foco atrapado, Esc cierra, tab ordenado. */
export const Modal = Dialog.Root
export const ModalTrigger = Dialog.Trigger

export function ModalContenido({
  titulo, descripcion, children, className,
}: { titulo: string; descripcion?: string; children: ReactNode; className?: string }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-carbon-900/70 backdrop-blur-sm" />
      <Dialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
          'rounded-tarjeta border border-borde bg-panel p-5 shadow-2xl',
          'focus-visible:outline-2 focus-visible:outline-acento',
          className,
        )}
      >
        <Dialog.Title className="text-tarjeta-titulo font-semibold text-texto">{titulo}</Dialog.Title>
        {descripcion ? (
          <Dialog.Description className="mt-1 text-sm text-texto-suave">{descripcion}</Dialog.Description>
        ) : null}
        <div className="mt-4">{children}</div>
        <Dialog.Close
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-control p-1 text-texto-suave hover:bg-panel focus-visible:outline-2 focus-visible:outline-acento"
        >
          <X className="size-4" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  )
}
