import { FileText, Upload, X } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { cn } from '@/lib/utils'

/** Elegir un archivo: zona grande para tocar con el pulgar (también se
 *  puede arrastrar) en lugar del botón nativo, que cambia según el
 *  navegador y no sigue el tema. El <input> sigue estando, así el label,
 *  el teclado y los lectores de pantalla funcionan igual que siempre. */
export function SelectorDeArchivo({
  id,
  archivo,
  alElegir,
  aceptar,
  ayuda,
  invalido,
  deshabilitado,
  describedBy,
}: {
  id?: string
  archivo: File | null
  alElegir: (archivo: File | null) => void
  aceptar: string
  ayuda: string
  invalido?: boolean
  deshabilitado?: boolean
  describedBy?: string
}) {
  const propio = useId()
  const idInput = id ?? propio
  const input = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)

  function soltar(evento: DragEvent<HTMLLabelElement>) {
    evento.preventDefault()
    setArrastrando(false)
    if (deshabilitado) return
    alElegir(evento.dataTransfer.files[0] ?? null)
  }

  if (archivo)
    return (
      <div
        className={cn(
          'flex min-h-14 items-center gap-3 rounded-control border bg-carbon-900/60 px-3',
          invalido ? 'border-peligro-texto' : 'border-borde-control',
        )}
      >
        <FileText aria-hidden className="size-5 shrink-0 text-miel-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-texto">{archivo.name}</p>
          <p className="text-xs text-texto-suave">
            {(archivo.size / 1024).toFixed(0)} KB
          </p>
        </div>
        <button
          type="button"
          disabled={deshabilitado}
          aria-label={`Quitar ${archivo.name}`}
          onClick={() => {
            alElegir(null)
            if (input.current) input.current.value = ''
          }}
          className="inline-flex size-10 items-center justify-center rounded-control text-texto-suave hover:bg-panel hover:text-texto focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-50"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    )

  return (
    <label
      htmlFor={idInput}
      onDragOver={(e) => {
        e.preventDefault()
        setArrastrando(true)
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
      className={cn(
        'flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed px-4 py-4 text-center',
        'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-acento',
        invalido ? 'border-peligro-texto' : 'border-borde-control',
        arrastrando
          ? 'bg-miel-500/10'
          : 'bg-carbon-900/40 hover:bg-carbon-900/60',
        deshabilitado && 'cursor-not-allowed opacity-50',
      )}
    >
      <Upload aria-hidden className="size-5 text-miel-300" />
      <span className="text-sm font-medium text-texto">
        Tocá para elegir el archivo
      </span>
      <span className="text-xs text-texto-suave">{ayuda}</span>
      <input
        ref={input}
        id={idInput}
        type="file"
        accept={aceptar}
        disabled={deshabilitado}
        aria-invalid={invalido || undefined}
        aria-describedby={describedBy}
        className="sr-only"
        onChange={(e) => alElegir(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}
