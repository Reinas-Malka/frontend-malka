/** Asistente simulado para la demo sin backend (VITE_DATOS_SIMULADOS).
 *  Determinista y sin red: responde a unas pocas frases (disponibilidad,
 *  pedidos, "crear un pedido…") con los datos simulados de las pantallas, y
 *  confirmar una propuesta la ejecuta con la API simulada de cada módulo
 *  (el pedido creado aparece en Pedidos, como si lo hubiera hecho el
 *  backend). Nada de esto llama a un modelo. */
import type {
  ApiAsistente,
  ConsultaDelAsistente,
  Propuesta,
  RespuestaAsistente,
} from '@/api/asistente'
import { borradores } from '@/api/borradores'
import { ApiError } from '@/api/client'
import { disponibilidad } from '@/api/disponibilidad'
import { pedidos } from '@/api/pedidos'
import { clientes, itemsVendibles, razas } from '@/api/recursos'
import { tandas } from '@/api/tandas'
import {
  esPropuestaEjecutable,
  idDeLaRuta,
  propuestaInvalida,
} from '@/lib/asistente'
import { hoyEnArgentina } from '@/lib/fechas'
import {
  NOMBRE_DE_ESTADO_PEDIDO,
  type Cliente,
  type ClienteCrear,
  type DisponibilidadReinas,
  type ItemVendible,
  type OperacionCrear,
  type Pedido,
  type PedidoCrear,
  type Raza,
  type TandaCrear,
} from '@/tipos/dominio'

/** De dónde lee y dónde escribe la simulación. */
export type FuentesDelAsistente = {
  disponibilidad(): Promise<DisponibilidadReinas[]>
  pedidos(): Promise<Pedido[]>
  clientes(): Promise<Cliente[]>
  items(): Promise<ItemVendible[]>
  razas(): Promise<Raza[]>
  /** Ejecuta una propuesta confirmada. */
  ejecutar(propuesta: Propuesta): Promise<unknown>
}

const LIMITE_CATALOGO = 100
const PEDIDOS_A_MOSTRAR = 5
const CANTIDAD_POR_DEFECTO = 10
const CANTIDAD_MAXIMA = 500
const PRECIO_DE_EJEMPLO = '15000.00'
const DIAS_HASTA_LA_ENTREGA = 7
const ROLES_VENTAS = ['admin', 'ventas']

const cuerpoComo = <T>(propuesta: Propuesta): T =>
  (propuesta.cuerpo ?? {}) as unknown as T

const idDe = (propuesta: Propuesta): string => {
  const id = idDeLaRuta(propuesta.ruta)
  if (!id) throw propuestaInvalida()
  return id
}

/** Las mismas APIs simuladas que usan las pantallas, con la propuesta como
 *  Idempotency-Key: confirmar dos veces no duplica. */
const fuentesDeLaDemo: FuentesDelAsistente = {
  disponibilidad: () => disponibilidad.listar(),
  pedidos: async () => (await pedidos.listar()).items,
  clientes: async () =>
    (await clientes.listar({ limite: LIMITE_CATALOGO })).items,
  items: async () =>
    (await itemsVendibles.listar({ limite: LIMITE_CATALOGO })).items,
  razas: async () => (await razas.listar({ limite: LIMITE_CATALOGO })).items,
  ejecutar: (p) => {
    switch (p.accion) {
      case 'crear_cliente':
        return clientes.crear(cuerpoComo<ClienteCrear>(p), p.id)
      case 'crear_pedido':
        return pedidos.crear(cuerpoComo<PedidoCrear>(p), p.id)
      case 'reservar_pedido':
        return pedidos.reservar(idDe(p), p.id)
      case 'crear_tanda':
        return tandas.crear(cuerpoComo<TandaCrear>(p), p.id)
      case 'operar_tanda':
        return tandas.operar(idDe(p), cuerpoComo<OperacionCrear>(p), p.id)
      case 'pedir_borrador':
        return borradores.pedir(
          String(cuerpoComo<{ pedido_id: string }>(p).pedido_id),
          p.id,
        )
      default:
        return Promise.reject(propuestaInvalida())
    }
  },
}

const sinAcentos = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const reinas = (n: number) => (n === 1 ? 'reina' : 'reinas')

const sumarDias = (fecha: string, dias: number): string => {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const razaMencionada = (lista: readonly Raza[], texto: string) =>
  lista.find((r) => texto.includes(sinAcentos(r.nombre)))

const respuesta = (
  texto: string,
  consultas: ConsultaDelAsistente[] = [],
  propuestas: Propuesta[] = [],
): RespuestaAsistente => ({ texto, consultas, propuestas })

async function contarDisponibilidad(
  texto: string,
  fuentes: FuentesDelAsistente,
): Promise<RespuestaAsistente> {
  const [filas, lista] = await Promise.all([
    fuentes.disponibilidad(),
    fuentes.razas(),
  ])
  const raza = razaMencionada(lista, texto)
  const elegidas = raza ? filas.filter((f) => f.raza_id === raza.id) : filas
  const consulta = {
    tool: 'ver_disponibilidad',
    resumen: `Consulté la disponibilidad${raza ? ` (${raza.nombre})` : ''}`,
  }
  if (elegidas.length === 0)
    return respuesta(
      `No hay reinas${raza ? ` ${raza.nombre}` : ''} enjauladas por ahora.`,
      [consulta],
    )
  return respuesta(
    [
      'Esto es lo disponible para vender hoy, por raza:',
      ...elegidas.map(
        (f) =>
          `- ${f.raza}: ${f.disponible} ${reinas(f.disponible)} (${f.enjauladas} enjauladas, ${f.reservadas} reservadas)`,
      ),
      '',
      'Lo disponible es lo enjaulado menos lo reservado.',
    ].join('\n'),
    [consulta],
  )
}

async function listarPedidos(
  fuentes: FuentesDelAsistente,
): Promise<RespuestaAsistente> {
  const [lista, delCriadero] = await Promise.all([
    fuentes.pedidos(),
    fuentes.clientes(),
  ])
  const consulta = { tool: 'buscar_pedidos', resumen: 'Consulté los pedidos' }
  if (lista.length === 0)
    return respuesta('Todavía no hay pedidos cargados.', [consulta])
  const nombre = (id: string) =>
    delCriadero.find((c) => c.id === id)?.nombre ?? 'Cliente desconocido'
  return respuesta(
    [
      'Estos son los últimos pedidos:',
      ...lista.slice(0, PEDIDOS_A_MOSTRAR).map((p) => {
        const total = p.items.reduce((suma, l) => suma + l.cantidad, 0)
        return `- ${nombre(p.cliente_id)}: ${NOMBRE_DE_ESTADO_PEDIDO[p.estado]}, ${total} ${reinas(total)}, entrega ${p.fecha_entrega_solicitada}`
      }),
    ].join('\n'),
    [consulta],
  )
}

function cantidadPedida(texto: string): number {
  const numero = Number(
    /\b(\d{1,3})\b/.exec(texto)?.[1] ?? CANTIDAD_POR_DEFECTO,
  )
  return Math.min(Math.max(numero, 1), CANTIDAD_MAXIMA)
}

async function proponerPedido(
  texto: string,
  fuentes: FuentesDelAsistente,
): Promise<RespuestaAsistente> {
  const [delCriadero, items, todas, filas] = await Promise.all([
    fuentes.clientes(),
    fuentes.items(),
    fuentes.razas(),
    fuentes.disponibilidad(),
  ])
  const activas = todas.filter((r) => r.activo)
  const masDisponible = [...filas].sort(
    (a, b) => b.disponible - a.disponible,
  )[0]
  const raza =
    razaMencionada(activas, texto) ??
    activas.find((r) => r.id === masDisponible?.raza_id) ??
    activas[0]
  const cliente = delCriadero.find((c) => c.activo && c.tipo === 'nacional')
  const item = items.find((i) => i.activo)
  const consultas = [
    { tool: 'buscar_clientes', resumen: 'Busqué el cliente' },
    {
      tool: 'ver_disponibilidad',
      resumen: `Consulté la disponibilidad${raza ? ` (${raza.nombre})` : ''}`,
    },
  ]
  if (!cliente || !item || !raza)
    return respuesta(
      'No encontré un cliente nacional, un ítem y una raza activos para armar el pedido.',
      consultas,
    )
  const cantidad = cantidadPedida(texto)
  const entrega = sumarDias(hoyEnArgentina(), DIAS_HASTA_LA_ENTREGA)
  const cuerpo: PedidoCrear = {
    cliente_id: cliente.id,
    moneda: 'ARS',
    fecha_entrega_solicitada: entrega,
    items: [
      {
        item_vendible_id: item.id,
        raza_id: raza.id,
        cantidad,
        precio_unitario: PRECIO_DE_EJEMPLO,
      },
    ],
  }
  const propuesta: Propuesta = {
    id: crypto.randomUUID(),
    accion: 'crear_pedido',
    metodo: 'POST',
    ruta: '/api/v1/pedidos',
    cuerpo,
    resumen: [
      { etiqueta: 'Cliente', valor: cliente.nombre },
      { etiqueta: 'Moneda', valor: 'ARS' },
      { etiqueta: 'Entrega solicitada', valor: entrega },
      {
        etiqueta: 'Línea 1',
        valor: `${cantidad} ${reinas(cantidad)} ${raza.nombre} (${item.nombre}) a ${PRECIO_DE_EJEMPLO} ARS c/u`,
      },
    ],
    roles_permitidos: ROLES_VENTAS,
  }
  return respuesta(
    `Te armé el pedido para ${cliente.nombre}: ${cantidad} ${reinas(cantidad)} ${raza.nombre} con entrega el ${entrega}.\nRevisalo en la tarjeta: no se guarda nada hasta que lo confirmes.`,
    consultas,
    [propuesta],
  )
}

const AYUDA = [
  'Soy el asistente de la demo: respondo con los datos de ejemplo.',
  'Probá con:',
  '- ¿Qué disponibilidad hay de Carniola?',
  '- ¿Cómo vienen los pedidos?',
  '- Crear un pedido de 10 reinas Buckfast',
].join('\n')

const PIDE_PEDIDO =
  /\b(crea|crear|creame|carga|cargar|cargame|arma|armar|armame|hace|hacer|haceme|registra|registrar|nuevo)\b.*\bpedido|\bpedido nuevo\b/
const PIDE_DISPONIBILIDAD = /disponib|stock|cuantas reinas|hay reinas|enjaulad/

function responder(
  texto: string,
  fuentes: FuentesDelAsistente,
): Promise<RespuestaAsistente> {
  if (PIDE_PEDIDO.test(texto)) return proponerPedido(texto, fuentes)
  if (PIDE_DISPONIBILIDAD.test(texto))
    return contarDisponibilidad(texto, fuentes)
  if (/\bpedidos?\b/.test(texto)) return listarPedidos(fuentes)
  return Promise.resolve(respuesta(AYUDA))
}

const esperar = (ms: number) =>
  ms > 0 ? new Promise((listo) => setTimeout(listo, ms)) : Promise.resolve()

type OpcionesSimuladas = {
  fuentes?: FuentesDelAsistente
  /** Lo que "piensa" la simulación, para ver el estado Pensando…. */
  demoraMs?: number
}

export function asistenteSimulado({
  fuentes = fuentesDeLaDemo,
  demoraMs = 700,
}: OpcionesSimuladas = {}): ApiAsistente {
  return {
    conversar: async (mensajes) => {
      const ultimo = mensajes.at(-1)
      if (!ultimo || ultimo.rol !== 'usuario')
        throw new ApiError({
          status: 422,
          codigo: 'ultimo_mensaje_no_es_del_usuario',
          mensaje: 'El último mensaje tiene que ser del usuario.',
        })
      await esperar(demoraMs)
      return responder(sinAcentos(ultimo.texto), fuentes)
    },
    confirmar: async (propuesta) => {
      if (!esPropuestaEjecutable(propuesta)) throw propuestaInvalida()
      await esperar(demoraMs / 2)
      return fuentes.ejecutar(propuesta)
    },
  }
}
