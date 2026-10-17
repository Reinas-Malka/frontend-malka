import { CircleCheck } from 'lucide-react'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BarraDeProgreso } from '@/components/ui/progreso'
import { SelectorDeArchivo } from '@/components/ui/selector-de-archivo'
import { useState } from 'react'
import { useSesion } from '@/auth/useSesion'
import { subirArchivo } from '@/documentos/subirArchivo'
import { validarArchivo } from '@/documentos/validarArchivo'

type EstadoSubida =
  | { status: 'inactivo' }
  | { status: 'preparando' }
  | { status: 'subiendo'; progreso: number }
  | { status: 'listo'; clave: string }
  | { status: 'error'; mensaje: string }

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido'
}

function SubidaDocumentoPage() {
  const [estado, setEstado] = useState<EstadoSubida>({ status: 'inactivo' })

  const { identidad } = useSesion()

  async function manejarSeleccion(archivo: File | undefined) {
    if (!archivo) return

    const invalido = validarArchivo(archivo)
    if (invalido) {
      setEstado({ status: 'error', mensaje: invalido })
      return
    }

    setEstado({ status: 'preparando' })
    try {
      const clave = await subirArchivo(archivo, {
        tenantId: identidad?.tenantId ?? '',
        alAvanzar: (progreso) => setEstado({ status: 'subiendo', progreso }),
      })
      setEstado({ status: 'listo', clave })
    } catch (error) {
      setEstado({ status: 'error', mensaje: mensajeDe(error) })
    }
  }

  const ocupado = estado.status === 'preparando' || estado.status === 'subiendo'

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo="Subir documento"
        descripcion="El archivo va directo al almacenamiento con un enlace temporario, sin pasar por la API. El sistema registra solo sus datos."
      />

      <Card className="max-w-xl space-y-4">
        <SelectorDeArchivo
          archivo={null}
          aceptar=".pdf,.jpg,.jpeg,.png"
          ayuda="PDF, JPG o PNG de hasta 10 MB."
          deshabilitado={ocupado}
          invalido={estado.status === 'error'}
          alElegir={(archivo) => void manejarSeleccion(archivo ?? undefined)}
        />

        {estado.status === 'preparando' ? (
          <p role="status" className="text-sm text-texto-suave">
            Preparando el enlace de subida…
          </p>
        ) : null}

        {estado.status === 'subiendo' ? (
          <BarraDeProgreso valor={estado.progreso} etiqueta="Subiendo" />
        ) : null}

        {estado.status === 'listo' ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-control border border-ok/40 bg-ok/10 p-3 text-sm text-texto"
          >
            <CircleCheck
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-ok-texto"
            />
            <p className="min-w-0">
              Listo: el documento quedó guardado en{' '}
              <code className="break-all font-mono text-xs text-texto-suave">
                {estado.clave}
              </code>
              .
            </p>
          </div>
        ) : null}

        {estado.status === 'error' ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
          >
            <p>{estado.mensaje}</p>
            <Button
              variante="secundario"
              tamano="chico"
              onClick={() => setEstado({ status: 'inactivo' })}
            >
              Elegir otro archivo
            </Button>
          </div>
        ) : null}
      </Card>
    </section>
  )
}

export default SubidaDocumentoPage
