import * as Toast from '@radix-ui/react-toast'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tono = 'ok' | 'aviso' | 'peligro'

/** Toast accesible (Radix): cierra solo, con rol y foco safe. */
export function ToastAviso({ titulo, descripcion, tono = 'ok' }: { titulo: string; descripcion?: string; tono?: Tono }) {
  const [abierto, setAbierto] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setAbierto(false), 5000)
    return () => clearTimeout(t)
  }, [])
  return (
    <Toast.Root
      open={abierto}
      onOpenChange={setAbierto}
      className={cn(
        'rounded-control border bg-panel-alto p-3 shadow-xl',
        tono === 'ok' && 'border-ok/50',
        tono === 'aviso' && 'border-aviso/50',
        tono === 'peligro' && 'border-peligro/50',
      )}
    >
      <Toast.Title className="text-sm font-medium text-texto">{titulo}</Toast.Title>
      {descripcion ? <Toast.Description className="mt-0.5 text-xs text-texto-suave">{descripcion}</Toast.Description> : null}
    </Toast.Root>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider swipeDirection="right">
      {children}
      <Toast.Viewport className="fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2" />
    </Toast.Provider>
  )
}
