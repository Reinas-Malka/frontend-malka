/** Reglas del asistente sin React: qué propuesta se puede ejecutar, qué
 *  historial se manda y adónde lleva lo que se creó. */
import type {
  AccionPropuesta,
  MensajeAlAsistente,
  Propuesta,
} from '@/api/asistente'
import { ApiError } from '@/api/client'

/** Topes del backend (app/schemas/asistente.py): hasta 20 mensajes de hasta
 *  2000 caracteres. */
export const MAX_MENSAJES = 20
export const MAX_CARACTERES = 2000

const UUID =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

/** Marcador del id que todavía no existe: el que va a devolver otro paso
 *  del mismo plan ({{ref:<id de esa propuesta>.id}}). */
const REFERENCIA = `\\{\\{ref:(${UUID})\\.id\\}\\}`
const REFERENCIAS = new RegExp(REFERENCIA, 'g')

/** Las rutas que puede tener cada acción (las arma el servidor). `ID` es
 *  donde va un id: en un plan puede llegar un marcador, pero solo ahí. Si
 *  llega otra cosa, la propuesta no se confirma: el front nunca llama a una
 *  ruta que no sea la escritura que dice la tarjeta. */
const ID = '{id}'
const PLANTILLA_DE_ACCION: Record<AccionPropuesta, string> = {
  crear_cliente: '/api/v1/clientes',
  crear_pedido: '/api/v1/pedidos',
  reservar_pedido: `/api/v1/pedidos/${ID}/reservas`,
  crear_tanda: '/api/v1/tandas',
  operar_tanda: `/api/v1/tandas/${ID}/operaciones`,
  pedir_borrador: '/api/v1/documentos/borradores',
  crear_parque: '/api/v1/parques',
  crear_nucleos: `/api/v1/parques/${ID}/nucleos`,
  crear_banco: '/api/v1/bancos',
  crear_raza: '/api/v1/razas',
  crear_producto: '/api/v1/items-vendibles',
  crear_material: '/api/v1/materiales',
  registrar_movimiento_material: `/api/v1/materiales/${ID}/movimientos`,
  cancelar_pedido: `/api/v1/pedidos/${ID}/estado`,
}

const regexDe = (plantilla: string, id: string) =>
  new RegExp(
    `^${plantilla
      .split(ID)
      .map((parte) => parte.replace(/[.*+?^$()|[\]\\/-]/g, '\\$&'))
      .join(id)}$`,
  )

/** Ruta lista para llamar: el id es un uuid. */
const RUTA_RESUELTA = Object.fromEntries(
  Object.entries(PLANTILLA_DE_ACCION).map(([a, p]) => [a, regexDe(p, UUID)]),
) as Record<string, RegExp | undefined>
/** Ruta de un paso de un plan: el id puede ser todavía un marcador. */
const RUTA_DE_PLAN = Object.fromEntries(
  Object.entries(PLANTILLA_DE_ACCION).map(([a, p]) => [
    a,
    regexDe(p, `(?:${UUID}|${REFERENCIA})`),
  ]),
) as Record<string, RegExp | undefined>

/** ¿Es una de las escrituras conocidas, con su ruta y su método? Acepta un
 *  marcador en la posición del id (se reemplaza antes de llamar). */
export function esPropuestaEjecutable(propuesta: Propuesta): boolean {
  const patron = RUTA_DE_PLAN[propuesta.accion]
  return (
    propuesta.metodo === 'POST' &&
    patron !== undefined &&
    patron.test(propuesta.ruta)
  )
}

/** ¿Se puede llamar ya? Ruta exacta con un uuid y sin marcadores en el
 *  cuerpo: lo último que se mira antes de ir a la red. */
export function estaListaParaEjecutar(propuesta: Propuesta): boolean {
  const patron = RUTA_RESUELTA[propuesta.accion]
  return (
    propuesta.metodo === 'POST' &&
    patron !== undefined &&
    patron.test(propuesta.ruta) &&
    referenciasDe(propuesta).length === 0
  )
}

/** Los ids de propuesta que nombran los marcadores de la ruta y el cuerpo. */
export function referenciasDe(propuesta: Propuesta): string[] {
  const texto = `${propuesta.ruta} ${JSON.stringify(propuesta.cuerpo ?? null)}`
  return [...new Set([...texto.matchAll(REFERENCIAS)].map((m) => m[1]))]
}

const reemplazarEn = (valor: unknown, ids: Record<string, string>): unknown => {
  if (typeof valor === 'string')
    return valor.replace(REFERENCIAS, (marca, id: string) => ids[id] ?? marca)
  if (Array.isArray(valor)) return valor.map((v) => reemplazarEn(v, ids))
  if (typeof valor === 'object' && valor !== null)
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, reemplazarEn(v, ids)]),
    )
  return valor
}

/** La propuesta con cada marcador cambiado por el id que devolvió el paso
 *  del que depende. Si falta alguno, o lo que queda no es una ruta exacta,
 *  error claro y no se llama a nada. */
export function conReferencias(
  propuesta: Propuesta,
  ids: Record<string, string>,
): Propuesta {
  const faltan = referenciasDe(propuesta).filter((id) => !ids[id])
  if (faltan.length > 0)
    throw new ApiError({
      codigo: 'referencia_sin_id',
      mensaje:
        'Falta el id de un paso anterior del que depende: confirmá primero ese paso.',
    })
  const resuelta: Propuesta = {
    ...propuesta,
    ruta: reemplazarEn(propuesta.ruta, ids) as string,
    cuerpo: reemplazarEn(propuesta.cuerpo, ids) as Propuesta['cuerpo'],
  }
  if (!estaListaParaEjecutar(resuelta)) throw propuestaInvalida()
  return resuelta
}

/** Lo que se tira si alguien intenta ejecutar una propuesta que no lo es. */
export const propuestaInvalida = () =>
  new ApiError({
    codigo: 'propuesta_invalida',
    mensaje: 'Esta propuesta no se puede confirmar desde acá.',
  })

/** El id que va en la ruta (/api/v1/pedidos/{id}/reservas), o null. */
export function idDeLaRuta(ruta: string): string | null {
  return new RegExp(`/(${UUID})/`).exec(ruta)?.[1] ?? null
}

export const TITULO_DE_ACCION: Record<AccionPropuesta, string> = {
  crear_cliente: 'Crear cliente',
  crear_pedido: 'Crear pedido',
  reservar_pedido: 'Reservar pedido',
  crear_tanda: 'Crear tanda',
  operar_tanda: 'Operar tanda',
  pedir_borrador: 'Pedir borrador del documento',
  crear_parque: 'Crear parque',
  crear_nucleos: 'Agregar núcleos al parque',
  crear_banco: 'Crear banco',
  crear_raza: 'Crear raza',
  crear_producto: 'Crear producto',
  crear_material: 'Crear material',
  registrar_movimiento_material: 'Registrar movimiento de material',
  cancelar_pedido: 'Cancelar pedido',
}

/** Las que no tienen vuelta atrás: la tarjeta va con tono de advertencia. */
const ACCIONES_FINALES: readonly string[] = ['cancelar_pedido']
export const esAccionFinal = (accion: string) =>
  ACCIONES_FINALES.includes(accion)

/** Una acción que este front no conoce (backend más nuevo) igual tiene título. */
export function tituloDeAccion(accion: string): string {
  return (
    (TITULO_DE_ACCION as Record<string, string | undefined>)[accion] ??
    'Propuesta'
  )
}

/** Mensajes del chat con lo mínimo para el historial que va al backend. */
type ConRolYTexto = { rol: MensajeAlAsistente['rol']; texto: string }

/** Los últimos 20 mensajes (los más viejos se recortan), cada uno dentro
 *  del largo que acepta el backend. */
export function historialParaEnviar(
  mensajes: readonly ConRolYTexto[],
): MensajeAlAsistente[] {
  return mensajes.slice(-MAX_MENSAJES).map(({ rol, texto }) => ({
    rol,
    texto: texto.slice(0, MAX_CARACTERES),
  }))
}

export type Enlace = { a: string; texto: string }

const textoDe = (valor: unknown, clave: string): string | null => {
  if (typeof valor !== 'object' || valor === null) return null
  const campo = (valor as Record<string, unknown>)[clave]
  return typeof campo === 'string' && campo !== '' ? campo : null
}

const pedido = (id: string | null): Enlace | null =>
  id ? { a: `/ventas/pedidos/${id}`, texto: 'Ver el pedido' } : null
const tanda = (id: string | null): Enlace | null =>
  id ? { a: `/produccion/tandas/${id}`, texto: 'Ver la tanda' } : null

/** Catálogos sin detalle: se va al listado. */
const CATALOGO_DE_ACCION: Partial<Record<AccionPropuesta, Enlace>> = {
  crear_parque: { a: '/produccion/parques', texto: 'Ver los parques' },
  crear_banco: { a: '/produccion/bancos', texto: 'Ver los bancos' },
  crear_raza: { a: '/produccion/razas', texto: 'Ver las razas' },
  crear_producto: { a: '/ventas/items-vendibles', texto: 'Ver los productos' },
  crear_material: { a: '/produccion/materiales', texto: 'Ver los materiales' },
}

/** Adónde ir a ver lo que se acaba de guardar, si se puede saber. */
export function enlaceDelResultado(
  propuesta: Propuesta,
  resultado: unknown,
): Enlace | null {
  switch (propuesta.accion) {
    case 'crear_cliente': {
      const id = textoDe(resultado, 'id')
      return id
        ? { a: `/ventas/clientes/${id}`, texto: 'Ver el cliente' }
        : null
    }
    case 'crear_pedido':
      return pedido(textoDe(resultado, 'id'))
    case 'reservar_pedido':
      return pedido(idDeLaRuta(propuesta.ruta))
    case 'crear_tanda':
      return tanda(textoDe(resultado, 'id'))
    case 'operar_tanda':
      return tanda(idDeLaRuta(propuesta.ruta))
    case 'pedir_borrador':
      // El borrador se ve (y se sigue redactando) en el detalle del pedido.
      return pedido(
        textoDe(resultado, 'pedido_id') ??
          textoDe(propuesta.cuerpo, 'pedido_id'),
      )
    case 'crear_nucleos': {
      const parque =
        textoDe(resultado, 'parque_id') ?? idDeLaRuta(propuesta.ruta)
      return parque
        ? {
            a: `/produccion/nucleos?parque=${encodeURIComponent(parque)}`,
            texto: 'Ver los núcleos del parque',
          }
        : { a: '/produccion/parques', texto: 'Ver los parques' }
    }
    case 'registrar_movimiento_material': {
      const material =
        textoDe(resultado, 'material_id') ?? idDeLaRuta(propuesta.ruta)
      return material
        ? { a: `/produccion/materiales/${material}`, texto: 'Ver el material' }
        : null
    }
    case 'cancelar_pedido':
      return pedido(textoDe(resultado, 'id') ?? idDeLaRuta(propuesta.ruta))
    default:
      return CATALOGO_DE_ACCION[propuesta.accion] ?? null
  }
}

/** El id de lo que se creó (si la respuesta trae uno). */
export const idDelResultado = (resultado: unknown): string | null =>
  textoDe(resultado, 'id')

/** Lo que pasó con una propuesta, para el mensaje rol "resultado". */
export type Desenlace =
  | { tipo: 'confirmada'; respuesta: unknown }
  | { tipo: 'fallida'; mensaje: string }
  | { tipo: 'descartada' }

const conId = (texto: string, id: string | null) =>
  id ? `${texto} (id ${id})` : texto

const numeroDe = (valor: unknown, clave: string): number | null => {
  if (typeof valor !== 'object' || valor === null) return null
  const campo = (valor as Record<string, unknown>)[clave]
  return typeof campo === 'number' ? campo : null
}

/** Qué se guardó, con el nombre y el id que devolvió el endpoint: el
 *  asistente los usa para el paso siguiente (los núcleos del parque nuevo). */
function loQueSeGuardo(propuesta: Propuesta, r: unknown): string {
  const id = textoDe(r, 'id')
  const nombre = textoDe(r, 'nombre') ?? ''
  const idRuta = idDeLaRuta(propuesta.ruta)
  switch (propuesta.accion) {
    case 'crear_parque':
      return conId(`se creó el parque ${nombre}`, id)
    case 'crear_banco':
      return conId(`se creó el banco ${textoDe(r, 'identificador') ?? ''}`, id)
    case 'crear_raza':
      return conId(`se creó la raza ${nombre}`, id)
    case 'crear_producto':
      return conId(`se creó el producto ${nombre}`, id)
    case 'crear_material':
      return conId(`se creó el material ${nombre}`, id)
    case 'crear_cliente':
      return conId(`se creó el cliente ${nombre}`, id)
    case 'crear_pedido':
      return conId('se creó el pedido en borrador', id)
    case 'crear_tanda':
      return conId('se creó la tanda', id)
    case 'crear_nucleos': {
      const creados = numeroDe(r, 'creados')
      const activos = numeroDe(r, 'nucleos_activos')
      const capacidad = numeroDe(r, 'capacidad_max')
      const ocupacion =
        activos !== null && capacidad !== null
          ? `; el parque tiene ${activos} de ${capacidad}`
          : ''
      return (
        conId(
          `se crearon ${creados ?? 'los'} núcleos en el parque`,
          textoDe(r, 'parque_id') ?? idRuta,
        ) + ocupacion
      )
    }
    case 'registrar_movimiento_material': {
      const stock = textoDe(r, 'stock')
      return (
        conId(
          `se registró ${textoDe(r, 'tipo') ?? 'el movimiento'} de ${textoDe(r, 'cantidad') ?? ''} en el material`,
          textoDe(r, 'material_id') ?? idRuta,
        ) + (stock ? `; stock ${stock}` : '')
      )
    }
    case 'cancelar_pedido':
      return conId('el pedido quedó cancelado', id ?? idRuta)
    case 'reservar_pedido':
      return conId('se reservó el pedido', idRuta)
    case 'operar_tanda':
      return conId('se registró la operación en la tanda', idRuta)
    case 'pedir_borrador':
      return conId('se pidió el borrador', id)
    default:
      return conId('se guardó', id)
  }
}

/** El texto breve que el front agrega al historial (rol "resultado") tras
 *  confirmar, fallar o descartar: viaja en el próximo pedido al asistente
 *  para que siga con el paso siguiente. */
export function textoDeResultado(
  propuesta: Propuesta,
  desenlace: Desenlace,
): string {
  const accion = propuesta.accion
  const texto =
    desenlace.tipo === 'confirmada'
      ? `Confirmado ${accion}: ${loQueSeGuardo(propuesta, desenlace.respuesta)}`
      : desenlace.tipo === 'fallida'
        ? `Falló ${accion}: ${desenlace.mensaje}`
        : `El usuario descartó la propuesta ${accion}`
  return texto.replace(/\s+/g, ' ').trim().slice(0, MAX_CARACTERES)
}

/** Lo que manda el botón "Seguir" después de un resultado. */
export const SEGUIR = 'Seguí con el siguiente paso'

/** Un bloque del texto del asistente: un párrafo (con sus saltos de línea)
 *  o una lista simple. Nunca HTML: el texto del modelo se muestra como
 *  texto, y React lo escapa. */
export type BloqueDeTexto =
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'lista'; ordenada: boolean; items: string[] }

const VINETA = /^\s*[-*•]\s+/
const NUMERO = /^\s*\d+[.)]\s+/

/** "**negrita**" sin los asteriscos: el modelo a veces escribe Markdown. */
const sinMarcas = (texto: string) => texto.replace(/\*\*(.+?)\*\*/g, '$1')

type Linea = { tipo: 'texto' | 'vineta' | 'numero'; texto: string }

const clasificar = (linea: string): Linea =>
  VINETA.test(linea)
    ? { tipo: 'vineta', texto: linea.replace(VINETA, '') }
    : NUMERO.test(linea)
      ? { tipo: 'numero', texto: linea.replace(NUMERO, '') }
      : { tipo: 'texto', texto: linea }

/** Separa el texto en párrafos y listas simples: las líneas seguidas que
 *  empiezan con "- ", "• " o "1. " forman una lista; las demás, párrafos
 *  (una línea en blanco corta el párrafo; un salto simple se respeta). */
export function bloquesDelTexto(texto: string): BloqueDeTexto[] {
  const bloques: BloqueDeTexto[] = []
  let actual: Linea['tipo'] | 'nada' = 'nada'
  for (const cruda of sinMarcas(texto.replace(/\r\n?/g, '\n')).split('\n')) {
    if (cruda.trim() === '') {
      actual = 'nada'
      continue
    }
    const linea = clasificar(cruda.trimEnd())
    const ultimo = bloques.at(-1)
    if (linea.tipo === actual && ultimo) {
      if (ultimo.tipo === 'lista') ultimo.items.push(linea.texto)
      else ultimo.texto += `\n${linea.texto}`
    } else {
      bloques.push(
        linea.tipo === 'texto'
          ? { tipo: 'parrafo', texto: linea.texto }
          : {
              tipo: 'lista',
              ordenada: linea.tipo === 'numero',
              items: [linea.texto],
            },
      )
    }
    actual = linea.tipo
  }
  return bloques
}
