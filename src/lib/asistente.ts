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

/** Las rutas que puede tener cada acción (las arma el servidor). Si llega
 *  otra cosa, la propuesta no se confirma: el front nunca llama a una ruta
 *  que no sea la escritura que dice la tarjeta. */
const RUTA_DE_ACCION: Record<AccionPropuesta, RegExp> = {
  crear_cliente: /^\/api\/v1\/clientes$/,
  crear_pedido: /^\/api\/v1\/pedidos$/,
  reservar_pedido: new RegExp(`^/api/v1/pedidos/${UUID}/reservas$`),
  crear_tanda: /^\/api\/v1\/tandas$/,
  operar_tanda: new RegExp(`^/api/v1/tandas/${UUID}/operaciones$`),
  pedir_borrador: /^\/api\/v1\/documentos\/borradores$/,
}

/** ¿Es una de las escrituras conocidas, con su ruta y su método? */
export function esPropuestaEjecutable(propuesta: Propuesta): boolean {
  const patron = (RUTA_DE_ACCION as Record<string, RegExp | undefined>)[
    propuesta.accion
  ]
  return (
    propuesta.metodo === 'POST' &&
    patron !== undefined &&
    patron.test(propuesta.ruta)
  )
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
}

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
    default:
      return null
  }
}

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
