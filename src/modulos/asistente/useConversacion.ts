import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ApiAsistente, MensajeAlAsistente } from '@/api/asistente'
import {
  conReferencias,
  enlaceDelResultado,
  historialParaEnviar,
  idDelResultado,
  SEGUIR,
  textoDeResultado,
} from '@/lib/asistente'
import {
  buscarPropuesta,
  conPropuesta,
  errorAlConfirmar,
  errorAlConversar,
  guardarHistorial,
  leerHistorial,
  mensajeDe,
  mensajeDelAsistente,
  mensajeDelUsuario,
  mensajeDeResultado,
  type MensajeDelChat,
} from '@/modulos/asistente/conversacion'
import {
  bloqueoDelPaso,
  esPlan,
  idsCreados,
  planAbierto,
  proximoPaso,
  textoDelPlan,
} from '@/modulos/asistente/plan'
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
  'parques',
  'nucleos',
  'bancos',
  'razas',
  'items-vendibles',
  'movimientos',
] as const

const estaAbierta = (estado: string) =>
  estado === 'pendiente' || estado === 'fallida'

/** La conversación: historial (en memoria y en sessionStorage), el envío
 *  al asistente y la confirmación de propuestas, sueltas o en un plan. */
export function useConversacion(api: ApiAsistente, claveDelHistorial: string) {
  const consultas = useQueryClient()
  const [historial, setHistorial] = useState<MensajeDelChat[]>(() =>
    leerHistorial(claveDelHistorial),
  )
  // El historial al día para las confirmaciones en cadena (un plan corre
  // varios pasos seguidos y cada uno necesita el id del anterior).
  const actual = useRef(historial)
  const cambiar = (cambio: (h: MensajeDelChat[]) => MensajeDelChat[]) => {
    actual.current = cambio(actual.current)
    setHistorial(actual.current)
  }
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
      cambiar((h) => [...h, mensajeDelAsistente(respuesta)])
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
    cambiar((h) => [...h, mensajeDelUsuario(limpio)])
    pedir(actual.current)
  }

  const reintentar = () => {
    if (!enviar.isPending && historial.at(-1)?.rol === 'usuario')
      pedir(historial)
  }

  const nuevaConversacion = () => {
    vuelta.current += 1
    enviar.reset()
    cambiar(() => [])
  }

  const agregarResultado = (texto: string) =>
    cambiar((h) => [...h, mensajeDeResultado(texto)])

  // Las que se están mandando: un doble clic no ejecuta dos veces.
  const enCurso = useRef(new Set<string>())

  /** Ejecuta una propuesta con los ids de los pasos de los que depende.
   *  'nada' si no correspondía (ya cerrada o en curso). */
  const correr = async (id: string): Promise<'ok' | 'fallo' | 'nada'> => {
    const item = buscarPropuesta(actual.current, id)
    const mensaje = mensajeDe(actual.current, id)
    if (!item || !mensaje || enCurso.current.has(id)) return 'nada'
    if (!estaAbierta(item.estado)) return 'nada'
    enCurso.current.add(id)
    cambiar((h) => conPropuesta(h, id, { estado: 'confirmando', error: null }))
    try {
      const resuelta = conReferencias(
        item.propuesta,
        idsCreados(mensaje.propuestas),
      )
      const resultado = await api.confirmar(resuelta)
      cambiar((h) =>
        conPropuesta(h, id, {
          estado: 'confirmada',
          enlace: enlaceDelResultado(resuelta, resultado),
          idCreado: idDelResultado(resultado),
          detalle: textoDeResultado(resuelta, {
            tipo: 'confirmada',
            respuesta: resultado,
          }),
        }),
      )
      for (const clave of CONSULTAS_AFECTADAS)
        void consultas.invalidateQueries({ queryKey: [clave] })
      return 'ok'
    } catch (error) {
      const fallo = errorAlConfirmar(error)
      cambiar((h) =>
        conPropuesta(h, id, {
          estado: 'fallida',
          error: fallo,
          detalle: textoDeResultado(item.propuesta, {
            tipo: 'fallida',
            mensaje: fallo.mensaje,
          }),
        }),
      )
      return 'fallo'
    } finally {
      enCurso.current.delete(id)
    }
  }

  /** El resultado de un plan va una sola vez, cuando termina o se frena. */
  const cerrarPlan = (idDeUnPaso: string) => {
    const mensaje = mensajeDe(actual.current, idDeUnPaso)
    if (mensaje) agregarResultado(textoDelPlan(mensaje.propuestas))
  }

  /** Una propuesta suelta, o el paso que sigue de un plan. */
  const confirmar = async (id: string) => {
    const mensaje = mensajeDe(actual.current, id)
    if (!mensaje) return
    if (!esPlan(mensaje)) {
      if ((await correr(id)) === 'nada') return
      const item = buscarPropuesta(actual.current, id)
      if (item?.detalle) agregarResultado(item.detalle)
      return
    }
    if (bloqueoDelPaso(mensaje.propuestas, id) !== null) return
    const desenlace = await correr(id)
    if (desenlace === 'nada') return
    const despues = mensajeDe(actual.current, id)
    if (desenlace === 'fallo' || (despues && !planAbierto(despues.propuestas)))
      cerrarPlan(id)
  }

  /** Todo el plan en orden, desde el primer paso sin confirmar. Se frena en
   *  el primer error: reintentar retoma desde ahí, con las mismas
   *  Idempotency-Key, así lo ya guardado no se duplica. */
  const confirmarTodo = async (idDeUnPaso: string) => {
    for (;;) {
      const mensaje = mensajeDe(actual.current, idDeUnPaso)
      const siguiente = mensaje && proximoPaso(mensaje.propuestas)
      if (!siguiente || !estaAbierta(siguiente.estado)) break
      if ((await correr(siguiente.propuesta.id)) !== 'ok') break
    }
    cerrarPlan(idDeUnPaso)
  }

  const descartar = (id: string) => {
    const mensaje = mensajeDe(actual.current, id)
    const item = buscarPropuesta(actual.current, id)
    if (!mensaje || !item || enCurso.current.has(id)) return
    if (!estaAbierta(item.estado)) return
    if (!esPlan(mensaje)) {
      cambiar((h) => conPropuesta(h, id, { estado: 'descartada' }))
      agregarResultado(textoDeResultado(item.propuesta, { tipo: 'descartada' }))
      return
    }
    // Un plan se descarta entero: lo ya confirmado queda como está.
    const abiertas = mensaje.propuestas.filter((p) => estaAbierta(p.estado))
    if (abiertas.some((p) => enCurso.current.has(p.propuesta.id))) return
    cambiar((h) =>
      abiertas.reduce(
        (acumulado, p) =>
          conPropuesta(acumulado, p.propuesta.id, { estado: 'descartada' }),
        h,
      ),
    )
    cerrarPlan(id)
  }

  /** Después de un resultado, el asistente sigue sin que haya que escribir. */
  const puedeSeguir = !enviar.isPending && historial.at(-1)?.rol === 'resultado'
  const seguir = () => {
    if (puedeSeguir) mandar(SEGUIR)
  }

  return {
    historial,
    pensando: enviar.isPending,
    error: enviar.isError ? errorAlConversar(enviar.error) : null,
    mandar,
    reintentar,
    nuevaConversacion,
    confirmar,
    confirmarTodo,
    descartar,
    puedeSeguir,
    seguir,
  }
}
