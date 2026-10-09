import { useState } from 'react'
import { pedirSubida } from '@/api/documentos'
import {
  esUrlVencida,
  subirPorUrlPrefermada,
} from '@/documentos/subirPorUrlPrefermada'
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

  async function subirUnaVez(
    archivo: File,
    alAvanzar: (progreso: number) => void,
  ) {
    const subida = await pedirSubida({
      nombre: archivo.name,
      tipo: archivo.type,
      tamano: archivo.size,
    })
    setEstado({ status: 'subiendo', progreso: 0 })
    await subirPorUrlPrefermada(subida, archivo, alAvanzar)
    return subida.clave
  }

  async function manejarSeleccion(archivo: File | undefined) {
    if (!archivo) return

    const invalido = validarArchivo(archivo)
    if (invalido) {
      setEstado({ status: 'error', mensaje: invalido })
      return
    }

    setEstado({ status: 'preparando' })
    try {
      const clave = await subirUnaVez(archivo, (progreso) =>
        setEstado({ status: 'subiendo', progreso }),
      )
      setEstado({ status: 'listo', clave })
    } catch (error) {
      if (!esUrlVencida(error)) {
        setEstado({ status: 'error', mensaje: mensajeDe(error) })
        return
      }
      // La prefirmada venció: se pide otra y se reintenta una sola vez.
      try {
        const clave = await subirUnaVez(archivo, (progreso) =>
          setEstado({ status: 'subiendo', progreso }),
        )
        setEstado({ status: 'listo', clave })
      } catch (segundoError) {
        setEstado({ status: 'error', mensaje: mensajeDe(segundoError) })
      }
    }
  }

  const ocupado = estado.status === 'preparando' || estado.status === 'subiendo'

  return (
    <main>
      <h1>Subir documento</h1>
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
    </main>
  )
}

export default SubidaDocumentoPage
