/** Definición declarativa de los campos de un formulario de catálogo. Los
 *  valores viajan como texto (como en un <input>); cada catálogo los
 *  convierte a su *Crear / *Actualizar en aCrear / aActualizar. */
import { esApiError } from '@/api/client'

export type Valores = Record<string, string>

export type Opcion = { valor: string; etiqueta: string }

export type Campo = {
  nombre: string
  etiqueta: string
  tipo?: 'texto' | 'texto-largo' | 'numero' | 'seleccion'
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
  if (campo.tipo === 'numero') {
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
 *  Se asigna cada mensaje al campo del formulario por su último segmento. */
export function erroresDelBackend(
  error: unknown,
  campos: readonly Campo[],
): Errores {
  if (!esApiError(error) || !Array.isArray(error.detalles.campos)) return {}
  const nombres = new Set(campos.map((c) => c.nombre))
  const errores: Errores = {}
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
