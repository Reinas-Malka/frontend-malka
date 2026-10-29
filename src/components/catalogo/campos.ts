/** Definición declarativa de los campos de un formulario de catálogo. Los
 *  valores viajan como texto (como en un <input>); cada catálogo los
 *  convierte a su *Crear / *Actualizar en aCrear / aActualizar. */
import { esApiError } from '@/api/client'

export type Valores = Record<string, string>

export type Opcion = { valor: string; etiqueta: string }

export type Campo = {
  nombre: string
  etiqueta: string
  /** 'fecha' viaja como AAAA-MM-DD, el `date` del backend. */
  tipo?: 'texto' | 'texto-largo' | 'numero' | 'seleccion' | 'fecha'
  requerido?: boolean
  /** Largo máximo (texto) o valor máximo (número). */
  max?: number
  min?: number
  ayuda?: string
  placeholder?: string
  opciones?: (valores: Valores) => Opcion[]
  /** Campos condicionales: p. ej. la condición de IVA según el tipo de cliente. */
  visible?: (valores: Valores) => boolean
  validar?: (valor: string, valores: Valores) => string | null
  /** Códigos de error del backend que se muestran debajo de este campo y no
   *  arriba del formulario: p. ej. el 409 cliente_con_pedidos va en el tipo. */
  codigosDeError?: readonly string[]
}

export type Errores = Record<string, string>

export function camposVisibles(
  campos: readonly Campo[],
  valores: Valores,
): Campo[] {
  return campos.filter((c) => !c.visible || c.visible(valores))
}

function errorDeCampo(
  campo: Campo,
  valor: string,
  valores: Valores,
): string | null {
  const limpio = valor.trim()
  if (!limpio)
    return campo.requerido ? `${campo.etiqueta} es obligatorio.` : null
  if (campo.tipo === 'fecha') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio))
      return `${campo.etiqueta} tiene que ser una fecha.`
  } else if (campo.tipo === 'numero') {
    const n = Number(limpio)
    if (!Number.isFinite(n)) return `${campo.etiqueta} tiene que ser un número.`
    if (campo.min !== undefined && n < campo.min)
      return `${campo.etiqueta} no puede ser menor a ${campo.min}.`
    if (campo.max !== undefined && n > campo.max)
      return `${campo.etiqueta} no puede ser mayor a ${campo.max}.`
  } else if (campo.max !== undefined && limpio.length > campo.max) {
    return `${campo.etiqueta} admite hasta ${campo.max} caracteres.`
  }
  if (campo.tipo === 'seleccion' && campo.opciones) {
    const validas = campo.opciones(valores).map((o) => o.valor)
    if (!validas.includes(limpio))
      return `Elegí una opción válida de ${campo.etiqueta.toLowerCase()}.`
  }
  return campo.validar?.(limpio, valores) ?? null
}

/** Valida solo los campos visibles: un campo oculto no bloquea el alta. */
export function validarValores(
  campos: readonly Campo[],
  valores: Valores,
): Errores {
  const errores: Errores = {}
  for (const campo of camposVisibles(campos, valores)) {
    const error = errorDeCampo(campo, valores[campo.nombre] ?? '', valores)
    if (error) errores[campo.nombre] = error
  }
  return errores
}

type CampoDelBackend = { campo?: unknown; mensaje?: unknown }

/** Un 422 del backend trae details.campos = [{ campo: "body.nombre", mensaje }].
 *  Se asigna cada mensaje al campo del formulario por su último segmento.
 *  Un error con un código que un campo declara en codigosDeError (un 409 de
 *  negocio, sin details.campos) va entero a ese campo. */
export function erroresDelBackend(
  error: unknown,
  campos: readonly Campo[],
): Errores {
  if (!esApiError(error)) return {}
  const errores: Errores = {}
  const delCodigo = campos.find((c) => c.codigosDeError?.includes(error.codigo))
  if (delCodigo) errores[delCodigo.nombre] = error.mensaje
  if (!Array.isArray(error.detalles.campos)) return errores
  const nombres = new Set(campos.map((c) => c.nombre))
  for (const item of error.detalles.campos as CampoDelBackend[]) {
    const nombre =
      String(item.campo ?? '')
        .split('.')
        .pop() ?? ''
    if (nombres.has(nombre))
      errores[nombre] = String(item.mensaje ?? 'Valor inválido.')
  }
  return errores
}
