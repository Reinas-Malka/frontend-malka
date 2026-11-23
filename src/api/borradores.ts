/** Borradores de documentos con IA (backend #40) y su aprobación (#42). El
 *  POST responde 202 con el borrador en `generando`; el worker lo resuelve
 *  en segundos y el front consulta GET /{id} hasta que sale de ese estado.
 *  Después lo aprueba una persona con rol admin (nunca la IA) o lo descarta
 *  alguien de administración o ventas. Mismo esquema que api/pedidos.ts:
 *  dos implementaciones con la misma firma y un solo swap por
 *  VITE_DATOS_SIMULADOS. */
import { ApiError, esApiError, request } from '@/api/client'
import { comprobantes } from '@/api/comprobantes'
import { pedidos } from '@/api/pedidos'
import type { Pagina } from '@/api/recurso'
import { clientes, itemsVendibles, razas } from '@/api/recursos'
import { usaDatosSimulados } from '@/datos/cliente'
import {
  formatearFecha,
  formatearFechaHora,
  hoyEnArgentina,
  segundosHastaMedianocheEnArgentina,
  ZONA_ARGENTINA,
} from '@/lib/fechas'
import { nombreDePais } from '@/lib/paises'
import { armarPdf } from '@/lib/pdfSimple'
import type {
  Aprobacion,
  Borrador,
  BorradorPedido,
  Comprobante,
  ContenidoDeBorrador,
  DescargaPreparada,
  Descarte,
  EntradaDeBitacora,
  MotivoRechazo,
  Pedido,
} from '@/tipos/dominio'

export type OpcionesDePedido = {
  /** El borrador aprobado del mismo pedido que este corrige. */
  corrigeA?: string
}

export interface ApiBorradores {
  /** 202 con el borrador en generando. Con la misma clave, un reintento
   *  devuelve el mismo borrador y no gasta otra llamada a la IA. 422
   *  pedido_inexistente o correccion_invalida; 429 limite_ia_por_minuto o
   *  limite_ia_diario, con Retry-After. */
  pedir(
    pedidoId: string,
    claveIdempotencia?: string,
    opciones?: OpcionesDePedido,
  ): Promise<Borrador>
  /** 404 borrador_no_encontrado. */
  obtener(id: string): Promise<Borrador>
  /** Los del pedido, del más nuevo al más viejo. */
  listar(pedidoId: string, cursor?: string): Promise<Pagina<Borrador>>
  /** Solo admin. 409 transicion_invalida, version_desactualizada o
   *  borrador_inmutable; 422 comprobante_inexistente o
   *  comprobante_de_otro_cliente; 503 almacenamiento_no_disponible. */
  aprobar(
    id: string,
    datos: Aprobacion,
    claveIdempotencia: string,
  ): Promise<Borrador>
  /** POST .../rechazar: queda descartado con su motivo. Admin y ventas.
   *  409 transicion_invalida o borrador_inmutable; 422 validacion. */
  descartar(
    id: string,
    datos: Descarte,
    claveIdempotencia: string,
  ): Promise<Borrador>
  /** La bitácora del borrador, en orden. */
  revisiones(id: string): Promise<EntradaDeBitacora[]>
  /** URL prefirmada nueva del PDF interno aprobado. 409 pdf_no_disponible. */
  pdf(id: string, opciones?: { enLinea?: boolean }): Promise<DescargaPreparada>
}

const RUTA = '/api/v1/documentos/borradores'
/** Un pedido tiene pocos borradores: se muestran los más nuevos. */
export const LIMITE_BORRADORES = 20

const rutaDe = (id: string) => `${RUTA}/${encodeURIComponent(id)}`

export function borradoresHttp(): ApiBorradores {
  return {
    pedir: (pedidoId, claveIdempotencia, { corrigeA } = {}) =>
      request<Borrador>(RUTA, {
        metodo: 'POST',
        cuerpo: {
          pedido_id: pedidoId,
          ...(corrigeA ? { corrige_a: corrigeA } : {}),
        } satisfies BorradorPedido,
        claveIdempotencia,
      }),
    obtener: (id) => request<Borrador>(rutaDe(id)),
    listar: (pedidoId, cursor) =>
      request<Pagina<Borrador>>(RUTA, {
        query: { pedido_id: pedidoId, limite: LIMITE_BORRADORES, cursor },
      }),
    aprobar: (id, datos, claveIdempotencia) =>
      request<Borrador>(`${rutaDe(id)}/aprobar`, {
        metodo: 'POST',
        cuerpo: datos,
        claveIdempotencia,
      }),
    descartar: (id, datos, claveIdempotencia) =>
      request<Borrador>(`${rutaDe(id)}/rechazar`, {
        metodo: 'POST',
        cuerpo: datos,
        claveIdempotencia,
      }),
    revisiones: (id) =>
      request<EntradaDeBitacora[]>(`${rutaDe(id)}/revisiones`),
    pdf: (id, { enLinea = false } = {}) =>
      request<DescargaPreparada>(`${rutaDe(id)}/pdf`, {
        query: { en_linea: enLinea ? 'true' : undefined },
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
  incoterm: string | null
  lineas: { cantidad: number; item: string; raza: string }[]
}

/** De dónde saca la simulación el contexto; undefined si no existe. */
export type FuenteDeContexto = (
  pedidoId: string,
) => Promise<ContextoDePedido | undefined>

const reinas = (cantidad: number) => (cantidad === 1 ? 'reina' : 'reinas')

/** El texto que "redacta" la simulación, con la forma del prompt
 *  borrador_v3 del backend: Nota de venta o Proforma de exportación, con
 *  secciones. Solo prosa con datos del pedido (cantidades y fechas
 *  copiadas): ni montos, ni IVA, ni comprobante. */
export function contenidoDeEjemplo(c: ContextoDePedido): ContenidoDeBorrador {
  const lineas = c.lineas.map(
    (l) =>
      `- ${l.cantidad} ${reinas(l.cantidad)} de raza ${l.raza} (producto ${l.item}).`,
  )
  const destino = c.destino
    ? `con destino a ${c.destino}${c.incoterm ? `, en condición ${c.incoterm}` : ''}`
    : 'dentro de Argentina'
  return {
    encabezado: `${c.destino ? 'Proforma de exportación' : 'Nota de venta'} de reinas a ${c.cliente}`,
    cuerpo: [
      'PARTES',
      `Por medio de la presente, el criadero vendedor deja constancia del pedido realizado por ${c.cliente}, en carácter de comprador.`,
      'OBJETO',
      [
        'El objeto de este documento son reinas vivas, según el siguiente detalle:',
        ...lineas,
      ].join('\n'),
      'Los precios y los importes figuran en el detalle del pedido que acompaña este documento, calculado por el sistema.',
      'CONDICIONES DE ENTREGA',
      `La entrega se solicita para el ${formatearFecha(c.fechaEntrega)}, ${destino}.`,
      'CIERRE',
      'Este documento resume el pedido y queda sujeto a confirmación. La facturación se realiza por separado, con la factura que emite ARCA. Saludamos a usted muy atentamente.',
    ].join('\n\n'),
    notas: [
      'Se recomienda recibir las reinas apenas lleguen, mantenerlas a la sombra y lejos del calor y del frío extremos, e introducirlas en la colmena cuanto antes.',
      ...(c.destino
        ? [
            `Exportación a ${c.destino}: la documentación sanitaria y aduanera se gestiona aparte.`,
          ]
        : []),
    ].join(' '),
  }
}

const SEGUNDOS_POR_MINUTO = 60
const MS_POR_MINUTO = SEGUNDOS_POR_MINUTO * 1000

/** Un hash de 64 hex (la forma del SHA-256 del backend) del contenido,
 *  sincrónico: en la demo solo importa que cambie si cambia el texto. */
export function hashDeContenido(contenido: ContenidoDeBorrador): string {
  const texto = JSON.stringify([
    contenido.encabezado,
    contenido.cuerpo,
    contenido.notas,
  ])
  let hash = ''
  for (let semilla = 0; semilla < 8; semilla++) {
    // FNV-1a de 32 bits con una semilla distinta por cada tramo.
    let h = (0x811c9dc5 ^ (semilla * 0x9e3779b9)) >>> 0
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    hash += h.toString(16).padStart(8, '0')
  }
  return hash
}

/** Las líneas del PDF interno simulado: el texto aprobado y el pie que pone
 *  el backend (quién, cuándo, versión y "No es un comprobante fiscal"). */
export function lineasDelPdf(borrador: Borrador): string[] {
  const { contenido } = borrador
  return [
    contenido?.encabezado ?? '',
    '',
    contenido?.cuerpo ?? '',
    '',
    contenido?.notas ?? '',
    '',
    `Documento interno aprobado por ${borrador.aprobado_por ?? '-'} el ${
      borrador.aprobado_en
        ? formatearFechaHora(borrador.aprobado_en, ZONA_ARGENTINA)
        : '-'
    }. Version ${(borrador.hash_contenido ?? '').slice(0, 12)}.`,
    'No es un comprobante fiscal.',
  ]
}

/** URL del PDF simulado: un blob en el navegador; sin URL.createObjectURL
 *  (jsdom), un data: con el mismo contenido. */
function urlDePdf(pdf: string): string {
  if (typeof URL.createObjectURL === 'function')
    return URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))
  return `data:application/pdf;base64,${btoa(pdf)}`
}

const MOTIVO_MINIMO = 3
const MOTIVO_MAXIMO = 500
/** Lo que vence una URL prefirmada del PDF en el backend. */
const EXPIRA_PDF_SEGUNDOS = 120

type OpcionesSimuladas = {
  contexto?: FuenteDeContexto
  /** El cliente del pedido; undefined si el pedido no existe. */
  clienteDelPedido?: (pedidoId: string) => Promise<string | undefined>
  /** Un comprobante transcripto; undefined si no existe. */
  comprobante?: (id: string) => Promise<Comprobante | undefined>
  /** Quién queda como autor en la bitácora (el sub del token en el backend). */
  usuario?: string
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
 *  (o rechazado) unos segundos después. Aprobar y descartar siguen las
 *  reglas de app/services/ia/aprobacion.py, en el mismo orden. */
export function borradoresSimulados({
  contexto = contextoDeLaDemo,
  clienteDelPedido = clienteDelPedidoDeLaDemo,
  comprobante = comprobanteDeLaDemo,
  usuario = 'demo@malka.test',
  demoraMs = 2000,
  porMinuto = 10,
  porDia = 200,
  rechazarCon,
}: OpcionesSimuladas = {}): ApiBorradores {
  // Del más nuevo al más viejo, como el ORDER BY del backend.
  let borradores: Borrador[] = []
  let bitacora: EntradaDeBitacora[] = []
  let llamadas: { en: number; dia: string }[] = []
  const porClave = new Map<string, Borrador>()
  // Las claves de aprobar y descartar: solo se guarda lo que salió bien.
  const decisiones = new Map<string, Borrador>()

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
        : (() => {
            const contenido = contenidoDeEjemplo(datos)
            return {
              estado: 'borrador' as const,
              contenido,
              hash_contenido: hashDeContenido(contenido),
              version_prompt: 'borrador_v3',
            }
          })()),
      actualizado_en: new Date().toISOString(),
    })
  }

  /** Solo un borrador en revisión cambia de estado; uno cerrado es 409. */
  const enRevision = (borrador: Borrador) => {
    if (borrador.estado !== 'borrador')
      throw new ApiError({
        status: 409,
        codigo: 'transicion_invalida',
        mensaje: 'El borrador no está en revisión.',
        detalles: { desde: borrador.estado },
      })
  }
  const anotar = (
    borrador: Borrador,
    entrada: Pick<EntradaDeBitacora, 'accion' | 'motivo' | 'comprobante_id'>,
    momento: string,
  ) => {
    bitacora = [
      ...bitacora,
      {
        id: crypto.randomUUID(),
        borrador_id: borrador.id,
        usuario,
        momento,
        hash_contenido: borrador.hash_contenido ?? '',
        hash_snapshot:
          entrada.accion === 'aprobado' ? borrador.hash_contenido : null,
        version_prompt: borrador.version_prompt,
        ...entrada,
      },
    ]
  }

  return {
    pedir: async (pedidoId, clave, { corrigeA } = {}) => {
      const previo = clave ? porClave.get(clave) : undefined
      if (previo) return previo
      const datos = await contexto(pedidoId)
      if (!datos)
        throw new ApiError({
          status: 422,
          codigo: 'pedido_inexistente',
          mensaje: 'No existe el pedido.',
        })
      if (corrigeA) {
        const original = borradores.find((b) => b.id === corrigeA)
        if (
          !original ||
          original.pedido_id !== pedidoId ||
          original.estado !== 'aprobado'
        )
          throw new ApiError({
            status: 422,
            codigo: 'correccion_invalida',
            mensaje: 'Solo se corrige un borrador aprobado del mismo pedido.',
          })
      }
      reservarLlamada()
      const ahora = new Date().toISOString()
      const nuevo: Borrador = {
        id: crypto.randomUUID(),
        pedido_id: pedidoId,
        estado: 'generando',
        contenido: null,
        hash_contenido: null,
        motivo_rechazo: null,
        motivo_descarte: null,
        version_prompt: null,
        corrige_a: corrigeA ?? null,
        comprobante_id: null,
        aprobado_por: null,
        aprobado_en: null,
        pdf_disponible: false,
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
    aprobar: async (id, { hash_contenido, comprobante_id }, clave) => {
      const previa = decisiones.get(clave)
      if (previa) return previa
      const borrador = buscar(id)
      enRevision(borrador)
      if (hash_contenido !== borrador.hash_contenido)
        throw new ApiError({
          status: 409,
          codigo: 'version_desactualizada',
          mensaje: 'El borrador cambió desde que se cargó.',
        })
      if (comprobante_id) {
        const vinculado = await comprobante(comprobante_id)
        if (!vinculado)
          throw new ApiError({
            status: 422,
            codigo: 'comprobante_inexistente',
            mensaje: 'No existe el comprobante.',
          })
        if (
          vinculado.cliente_id !== (await clienteDelPedido(borrador.pedido_id))
        )
          throw new ApiError({
            status: 422,
            codigo: 'comprobante_de_otro_cliente',
            mensaje: 'El comprobante es de otro cliente.',
          })
      }
      const ahora = new Date().toISOString()
      const aprobado: Borrador = {
        ...borrador,
        estado: 'aprobado',
        comprobante_id: comprobante_id ?? null,
        aprobado_por: usuario,
        aprobado_en: ahora,
        pdf_disponible: true,
        actualizado_en: ahora,
      }
      guardar(aprobado)
      anotar(
        aprobado,
        {
          accion: 'aprobado',
          motivo: null,
          comprobante_id: comprobante_id ?? null,
        },
        ahora,
      )
      decisiones.set(clave, aprobado)
      return aprobado
    },
    descartar: async (id, { motivo }, clave) => {
      const previa = decisiones.get(clave)
      if (previa) return previa
      const texto = motivo.trim()
      if (texto.length < MOTIVO_MINIMO || texto.length > MOTIVO_MAXIMO)
        throw new ApiError({
          status: 422,
          codigo: 'validacion',
          mensaje: `El motivo tiene que tener entre ${MOTIVO_MINIMO} y ${MOTIVO_MAXIMO} caracteres.`,
        })
      const borrador = buscar(id)
      enRevision(borrador)
      const ahora = new Date().toISOString()
      const descartado: Borrador = {
        ...borrador,
        estado: 'descartado',
        motivo_descarte: texto,
        actualizado_en: ahora,
      }
      guardar(descartado)
      anotar(
        descartado,
        { accion: 'descartado', motivo: texto, comprobante_id: null },
        ahora,
      )
      decisiones.set(clave, descartado)
      return descartado
    },
    revisiones: async (id) => {
      buscar(id)
      return bitacora.filter((r) => r.borrador_id === id)
    },
    pdf: async (id) => {
      const borrador = buscar(id)
      if (!borrador.pdf_disponible)
        throw new ApiError({
          status: 409,
          codigo: 'pdf_no_disponible',
          mensaje: 'El borrador no tiene PDF: todavía no está aprobado.',
        })
      return {
        url_descarga: urlDePdf(armarPdf(lineasDelPdf(borrador))),
        expira_en_segundos: EXPIRA_PDF_SEGUNDOS,
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

/** El cliente del pedido simulado, o undefined si no existe. */
const clienteDelPedidoDeLaDemo = async (pedidoId: string) => {
  try {
    return (await pedidos.obtener(pedidoId)).cliente_id
  } catch (error) {
    if (esApiError(error) && error.status === 404) return undefined
    throw error
  }
}

/** Un comprobante de la demo (los que se cargan en Comprobantes también). */
const comprobanteDeLaDemo = async (id: string) => {
  try {
    return await comprobantes.obtener(id)
  } catch (error) {
    if (esApiError(error) && error.status === 404) return undefined
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
  const item = nombreDe(itemsVendibles, 'Producto desconocido')
  const raza = nombreDe(razas, 'Raza desconocida')
  const lineas = [...pedido.items].sort(
    (a, b) => a.numero_linea - b.numero_linea,
  )
  return {
    cliente: await cliente(pedido.cliente_id),
    fechaEntrega: pedido.fecha_entrega_solicitada,
    destino: pedido.destino_pais ? nombreDePais(pedido.destino_pais) : null,
    incoterm: pedido.incoterm,
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
