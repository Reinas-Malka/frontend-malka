/** Borradores de documentos con IA (backend #40). El POST responde 202 con
 *  el borrador en `generando`; el worker lo resuelve en segundos y el front
 *  consulta GET /{id} hasta que sale de ese estado. Mismo esquema que
 *  api/pedidos.ts: dos implementaciones con la misma firma y un solo swap
 *  por VITE_DATOS_SIMULADOS. */
import { ApiError, esApiError, request } from '@/api/client'
import { pedidos } from '@/api/pedidos'
import type { Pagina } from '@/api/recurso'
import { clientes, itemsVendibles, razas } from '@/api/recursos'
import { usaDatosSimulados } from '@/datos/cliente'
import {
  formatearFecha,
  hoyEnArgentina,
  segundosHastaMedianocheEnArgentina,
} from '@/lib/fechas'
import { nombreDePais } from '@/lib/paises'
import type {
  Borrador,
  BorradorPedido,
  ContenidoDeBorrador,
  MotivoRechazo,
  Pedido,
} from '@/tipos/dominio'

export interface ApiBorradores {
  /** 202 con el borrador en generando. Con la misma clave, un reintento
   *  devuelve el mismo borrador y no gasta otra llamada a la IA. 422
   *  pedido_inexistente; 429 limite_ia_por_minuto o limite_ia_diario, con
   *  Retry-After. */
  pedir(pedidoId: string, claveIdempotencia?: string): Promise<Borrador>
  /** 404 borrador_no_encontrado. */
  obtener(id: string): Promise<Borrador>
  /** Los del pedido, del más nuevo al más viejo. */
  listar(pedidoId: string, cursor?: string): Promise<Pagina<Borrador>>
}

const RUTA = '/api/v1/documentos/borradores'
/** Un pedido tiene pocos borradores: se muestran los más nuevos. */
export const LIMITE_BORRADORES = 20

export function borradoresHttp(): ApiBorradores {
  return {
    pedir: (pedidoId, claveIdempotencia) =>
      request<Borrador>(RUTA, {
        metodo: 'POST',
        cuerpo: { pedido_id: pedidoId } satisfies BorradorPedido,
        claveIdempotencia,
      }),
    obtener: (id) => request<Borrador>(`${RUTA}/${encodeURIComponent(id)}`),
    listar: (pedidoId, cursor) =>
      request<Pagina<Borrador>>(RUTA, {
        query: { pedido_id: pedidoId, limite: LIMITE_BORRADORES, cursor },
      }),
  }
}

/** Lo que el sistema le pasa al modelo: datos del pedido con nombres, nunca
 *  importes (los valores fiscales no los escribe la IA). */
export type ContextoDePedido = {
  cliente: string
  fechaEntrega: string
  /** Nombre del país de destino; null en una venta nacional. */
  destino: string | null
  lineas: { cantidad: number; item: string; raza: string }[]
}

/** De dónde saca la simulación el contexto; undefined si no existe. */
export type FuenteDeContexto = (
  pedidoId: string,
) => Promise<ContextoDePedido | undefined>

/** El texto que "redacta" la simulación. Solo prosa con datos del pedido
 *  (cantidades y fechas copiadas): ni montos, ni IVA, ni comprobante. */
export function contenidoDeEjemplo(c: ContextoDePedido): ContenidoDeBorrador {
  const lineas = c.lineas.map(
    (l) => `- ${l.cantidad} × ${l.item}, raza ${l.raza}.`,
  )
  return {
    encabezado: `Remito de venta a ${c.cliente}`,
    cuerpo: [
      `Se deja constancia de la entrega a ${c.cliente} de las reinas que se detallan, con fecha de entrega solicitada el ${formatearFecha(c.fechaEntrega)}.`,
      '',
      ...lineas,
    ].join('\n'),
    notas: c.destino
      ? `Exportación a ${c.destino}: la documentación aduanera se completa aparte.`
      : '',
  }
}

const SEGUNDOS_POR_MINUTO = 60
const MS_POR_MINUTO = SEGUNDOS_POR_MINUTO * 1000

type OpcionesSimuladas = {
  contexto?: FuenteDeContexto
  /** Lo que tarda el "worker" en resolver el borrador. */
  demoraMs?: number
  /** Los topes por criadero de limites.py del backend. */
  porMinuto?: number
  porDia?: number
  /** Si se fija, el worker rechaza con este motivo en lugar de redactar. */
  rechazarCon?: MotivoRechazo
}

/** En memoria para la demo sin backend. Repite lo que hace el backend: 422
 *  si el pedido no existe, 429 al pasarse de los topes (sin gastar la
 *  llamada), Idempotency-Key, y el borrador pasa de generando a borrador
 *  (o rechazado) unos segundos después. */
export function borradoresSimulados({
  contexto = contextoDeLaDemo,
  demoraMs = 2000,
  porMinuto = 10,
  porDia = 200,
  rechazarCon,
}: OpcionesSimuladas = {}): ApiBorradores {
  // Del más nuevo al más viejo, como el ORDER BY del backend.
  let borradores: Borrador[] = []
  let llamadas: { en: number; dia: string }[] = []
  const porClave = new Map<string, Borrador>()

  const buscar = (id: string): Borrador => {
    const borrador = borradores.find((b) => b.id === id)
    if (!borrador)
      throw new ApiError({
        status: 404,
        codigo: 'borrador_no_encontrado',
        mensaje: 'No existe el borrador.',
      })
    return borrador
  }
  const guardar = (borrador: Borrador) => {
    borradores = borradores.map((b) => (b.id === borrador.id ? borrador : b))
  }

  // reservar_llamada: primero el tope diario, después el del minuto.
  const reservarLlamada = () => {
    const ahora = Date.now()
    const hoy = hoyEnArgentina(new Date(ahora))
    if (llamadas.filter((l) => l.dia === hoy).length >= porDia)
      throw new ApiError({
        status: 429,
        codigo: 'limite_ia_diario',
        mensaje:
          'El criadero ya usó hoy todas las llamadas a la IA que tiene. Se renuevan a la medianoche.',
        detalles: { tope: porDia },
        reintentarEn: segundosHastaMedianocheEnArgentina(new Date(ahora)),
      })
    if (
      llamadas.filter((l) => ahora - l.en < MS_POR_MINUTO).length >= porMinuto
    )
      throw new ApiError({
        status: 429,
        codigo: 'limite_ia_por_minuto',
        mensaje: 'Demasiadas llamadas a la IA seguidas. Esperá un minuto.',
        detalles: { tope: porMinuto },
        reintentarEn: SEGUNDOS_POR_MINUTO,
      })
    llamadas = [...llamadas, { en: ahora, dia: hoy }]
  }

  const resolver = (id: string, datos: ContextoDePedido) => {
    const actual = borradores.find((b) => b.id === id)
    if (!actual || actual.estado !== 'generando') return
    guardar({
      ...actual,
      ...(rechazarCon
        ? { estado: 'rechazado', motivo_rechazo: rechazarCon }
        : {
            estado: 'borrador',
            contenido: contenidoDeEjemplo(datos),
            version_prompt: 'borrador_v2',
          }),
      actualizado_en: new Date().toISOString(),
    })
  }

  return {
    pedir: async (pedidoId, clave) => {
      const previo = clave ? porClave.get(clave) : undefined
      if (previo) return previo
      const datos = await contexto(pedidoId)
      if (!datos)
        throw new ApiError({
          status: 422,
          codigo: 'pedido_inexistente',
          mensaje: 'No existe el pedido.',
        })
      reservarLlamada()
      const ahora = new Date().toISOString()
      const nuevo: Borrador = {
        id: crypto.randomUUID(),
        pedido_id: pedidoId,
        estado: 'generando',
        contenido: null,
        motivo_rechazo: null,
        version_prompt: null,
        creado_en: ahora,
        actualizado_en: ahora,
      }
      borradores = [nuevo, ...borradores]
      if (clave) porClave.set(clave, nuevo)
      setTimeout(() => resolver(nuevo.id, datos), demoraMs)
      return nuevo
    },
    obtener: async (id) => buscar(id),
    listar: async (pedidoId, cursor) => {
      const delPedido = borradores.filter((b) => b.pedido_id === pedidoId)
      const desde = cursor ? Number(cursor) : 0
      const hasta = desde + LIMITE_BORRADORES
      return {
        items: delPedido.slice(desde, hasta),
        siguiente: hasta < delPedido.length ? String(hasta) : null,
      }
    },
  }
}

/** Un recurso como nombre; si no se encuentra, el texto de reemplazo. */
const nombreDe =
  (
    recurso: { obtener(id: string): Promise<{ nombre: string }> },
    otro: string,
  ) =>
  async (id: string): Promise<string> => {
    try {
      return (await recurso.obtener(id)).nombre
    } catch (error) {
      if (esApiError(error) && error.status === 404) return otro
      throw error
    }
  }

/** El contexto con los pedidos y catálogos simulados de las pantallas. */
const contextoDeLaDemo: FuenteDeContexto = async (pedidoId) => {
  let pedido: Pedido
  try {
    pedido = await pedidos.obtener(pedidoId)
  } catch (error) {
    if (esApiError(error) && error.status === 404) return undefined
    throw error
  }
  const cliente = nombreDe(clientes, 'Cliente desconocido')
  const item = nombreDe(itemsVendibles, 'Ítem desconocido')
  const raza = nombreDe(razas, 'Raza desconocida')
  const lineas = [...pedido.items].sort(
    (a, b) => a.numero_linea - b.numero_linea,
  )
  return {
    cliente: await cliente(pedido.cliente_id),
    fechaEntrega: pedido.fecha_entrega_solicitada,
    destino: pedido.destino_pais ? nombreDePais(pedido.destino_pais) : null,
    lineas: await Promise.all(
      lineas.map(async (l) => ({
        cantidad: l.cantidad,
        item: await item(l.item_vendible_id),
        raza: await raza(l.raza_id),
      })),
    ),
  }
}

export const borradores: ApiBorradores = usaDatosSimulados(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
  ? borradoresSimulados()
  : borradoresHttp()
