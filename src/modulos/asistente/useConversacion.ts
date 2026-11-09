import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ApiAsistente, MensajeAlAsistente } from '@/api/asistente'
import { enlaceDelResultado, historialParaEnviar } from '@/lib/asistente'
import {
  buscarPropuesta,
  conPropuesta,
  errorAlConfirmar,
  errorAlConversar,
  guardarHistorial,
  leerHistorial,
  mensajeDelAsistente,
  mensajeDelUsuario,
  type MensajeDelChat,
} from '@/modulos/asistente/conversacion'
import { CLAVE_TANDAS } from '@/modulos/produccion/tandas'
import { CLAVE_BORRADORES } from '@/modulos/ventas/borradores'
import { CLAVE_DISPONIBILIDAD, CLAVE_PEDIDOS } from '@/modulos/ventas/pedidos'

/** Lo que una escritura del asistente puede cambiar: después de confirmar,
 *  esas pantallas se vuelven a pedir. Materiales por el consumo de cúpulas
 *  de una tanda nueva. */
const CONSULTAS_AFECTADAS = [
  CLAVE_PEDIDOS,
  CLAVE_TANDAS,
  'clientes',
  CLAVE_DISPONIBILIDAD,
  CLAVE_BORRADORES,
  'materiales',
] as const

/** La conversación: historial (en memoria y en sessionStorage), el envío
 *  al asistente y la confirmación de propuestas. */
export function useConversacion(api: ApiAsistente, claveDelHistorial: string) {
  const consultas = useQueryClient()
  const [historial, setHistorial] = useState<MensajeDelChat[]>(() =>
    leerHistorial(claveDelHistorial),
  )
  useEffect(
    () => guardarHistorial(claveDelHistorial, historial),
    [claveDelHistorial, historial],
  )

  // Cada "Nueva conversación" cambia la vuelta: una respuesta que llega
  // tarde de la conversación anterior se descarta.
  const vuelta = useRef(0)
  const enviar = useMutation({
    mutationFn: ({
      mensajes,
    }: {
      mensajes: MensajeAlAsistente[]
      de: number
    }) => api.conversar(mensajes),
    onSuccess: (respuesta, { de }) => {
      if (de !== vuelta.current) return
      setHistorial((h) => [...h, mensajeDelAsistente(respuesta)])
    },
  })

  const pedir = (conMensajes: readonly MensajeDelChat[]) =>
    enviar.mutate({
      mensajes: historialParaEnviar(conMensajes),
      de: vuelta.current,
    })

  const mandar = (texto: string) => {
    const limpio = texto.trim()
    if (!limpio || enviar.isPending) return
    const nuevo = [...historial, mensajeDelUsuario(limpio)]
    setHistorial(nuevo)
    pedir(nuevo)
  }

  const reintentar = () => {
    if (!enviar.isPending && historial.at(-1)?.rol === 'usuario')
      pedir(historial)
  }

  const nuevaConversacion = () => {
    vuelta.current += 1
    enviar.reset()
    setHistorial([])
  }

  // Las que se están mandando: un doble clic no ejecuta dos veces.
  const enCurso = useRef(new Set<string>())
  const confirmar = async (id: string) => {
    const item = buscarPropuesta(historial, id)
    if (!item || enCurso.current.has(id)) return
    if (item.estado !== 'pendiente' && item.estado !== 'fallida') return
    enCurso.current.add(id)
    setHistorial((h) =>
      conPropuesta(h, id, { estado: 'confirmando', error: null }),
    )
    try {
      const resultado = await api.confirmar(item.propuesta)
      setHistorial((h) =>
        conPropuesta(h, id, {
          estado: 'confirmada',
          enlace: enlaceDelResultado(item.propuesta, resultado),
        }),
      )
      for (const clave of CONSULTAS_AFECTADAS)
        void consultas.invalidateQueries({ queryKey: [clave] })
    } catch (error) {
      setHistorial((h) =>
        conPropuesta(h, id, {
          estado: 'fallida',
          error: errorAlConfirmar(error),
        }),
      )
    } finally {
      enCurso.current.delete(id)
    }
  }

  const descartar = (id: string) => {
    const item = buscarPropuesta(historial, id)
    if (!item || enCurso.current.has(id)) return
    if (item.estado !== 'pendiente' && item.estado !== 'fallida') return
    setHistorial((h) => conPropuesta(h, id, { estado: 'descartada' }))
  }

  return {
    historial,
    pensando: enviar.isPending,
    error: enviar.isError ? errorAlConversar(enviar.error) : null,
    mandar,
    reintentar,
    nuevaConversacion,
    confirmar,
    descartar,
  }
}
