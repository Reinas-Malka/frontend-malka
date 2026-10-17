import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
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
        descripcion="El PDF va directo a S3 con una URL prefirmada; el sistema solo registra la metadata."
      />
      <p>
        El archivo va directo al almacenamiento del sistema mediante un enlace
        temporario; no pasa por la API.
      </p>

      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        disabled={ocupado}
        onChange={(evento) => {
          const archivo = evento.target.files?.[0]
          void manejarSeleccion(archivo)
          evento.target.value = ''
        }}
      />

      {estado.status === 'preparando' && <p>Preparando el enlace de subida…</p>}

      {estado.status === 'subiendo' && (
        <p>
          Subiendo… <progress max={100} value={estado.progreso} />{' '}
          {estado.progreso}%
        </p>
      )}

      {estado.status === 'listo' && (
        <p role="status">
          Listo: el documento quedó en <code>{estado.clave}</code>.
        </p>
      )}

      {estado.status === 'error' && (
        <p role="alert">
          {estado.mensaje}{' '}
          <button onClick={() => setEstado({ status: 'inactivo' })}>
            Reintentar
          </button>
        </p>
      )}
    </section>
  )
}

export default SubidaDocumentoPage
