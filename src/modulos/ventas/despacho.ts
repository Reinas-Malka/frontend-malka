/** Entregar un pedido (backend #36): de qué bancos salen las reinas de cada
 *  línea. Las reglas que copian al backend están en lib/pedidos.ts
 *  (errorDeDespacho, errorDeFormatoDeDespacho); acá va el formulario. */
import { esApiError } from '@/api/client'
import type { Errores } from '@/components/catalogo/campos'
import { errorDeCantidad } from '@/lib/pedidos'
import type { Despacho, DisponibilidadReinas, Pedido } from '@/tipos/dominio'

/** El valor de "sin banco": reinas enjauladas que todavía no pasaron a
 *  ningún banco (banco_id null). El Select de Radix no acepta ''. */
export const SIN_BANCO = 'sin-banco'

/** Una fila del formulario: de qué banco y cuántas. En texto, como en el
 *  <input>; banco es un banco_id, SIN_BANCO o '' (sin elegir). */
export type Salida = { clave: string; banco: string; cantidad: string }

/** Las filas de cada línea, por pedido_item_id. */
export type Salidas = Record<string, Salida[]>

export const salidaVacia = (): Salida => ({
  clave: crypto.randomUUID(),
  banco: '',
  cantidad: '',
})

export const salidasIniciales = (pedido: Pedido): Salidas =>
  Object.fromEntries(pedido.items.map((l) => [l.id, [salidaVacia()]]))

/** Un banco con reinas enjauladas de una raza: lo más que puede salir de
 *  ahí para esa raza, sumando todas las líneas. */
export type Existencia = { banco: string; nombre: string; reinas: number }

/** raza_id → dónde hay reinas enjauladas de esa raza. */
export function existenciasPorRaza(
  lista: readonly DisponibilidadReinas[],
): Map<string, Existencia[]> {
  return new Map(
    lista.map((d) => [
      d.raza_id,
      d.bancos
        .filter((b) => b.reinas > 0)
        .map((b) => ({
          banco: b.banco_id ?? SIN_BANCO,
          nombre: b.identificador ?? 'Sin banco',
          reinas: b.reinas,
        })),
    ]),
  )
}

/** Lo asignado a una línea: el 8 de "8 de 12". Una cantidad inválida no
 *  suma; su error ya está en su campo. */
export const asignadas = (salidas: readonly Salida[]): number =>
  salidas.reduce(
    (total, s) =>
      total + (errorDeCantidad(s.cantidad) ? 0 : Number(s.cantidad.trim())),
    0,
  )

/** Dónde va el error de una fila: pedido_item_id.n.campo. El de la línea
 *  entera (lo que falta o sobra) va bajo el pedido_item_id solo. */
export const claveDeSalida = (
  lineaId: string,
  n: number,
  campo: 'banco' | 'cantidad',
) => `${lineaId}.${n}.${campo}`

/** Lo que el formulario marca antes de mandar:
 *  - cada línea sale entera: lo reservado de la línea es su cantidad (una
 *    reserva por línea) y no hay entrega parcial;
 *  - un banco va una sola vez por línea;
 *  - un banco no da más reinas de una raza de las que tiene enjauladas,
 *    sumando todas las líneas de esa raza (como el 409 del backend). */
export function validarDespacho(
  pedido: Pedido,
  salidas: Salidas,
  existencias: ReadonlyMap<string, readonly Existencia[]>,
): Errores {
  const errores: Errores = {}
  // raza|banco → cuántas salen de ahí entre todas las líneas.
  const pedidas = new Map<string, number>()
  const deRaza = (razaId: string, banco: string) => `${razaId}|${banco}`

  for (const linea of pedido.items) {
    const filas = salidas[linea.id] ?? []
    const vistos = new Set<string>()
    filas.forEach((s, n) => {
      if (!s.banco)
        errores[claveDeSalida(linea.id, n, 'banco')] = 'Elegí el banco.'
      else if (vistos.has(s.banco))
        errores[claveDeSalida(linea.id, n, 'banco')] =
          'Ese banco ya está en esta línea.'
      vistos.add(s.banco)

      const cantidad = errorDeCantidad(s.cantidad)
      if (cantidad) errores[claveDeSalida(linea.id, n, 'cantidad')] = cantidad
      else if (s.banco) {
        const clave = deRaza(linea.raza_id, s.banco)
        pedidas.set(
          clave,
          (pedidas.get(clave) ?? 0) + Number(s.cantidad.trim()),
        )
      }
    })
    const total = asignadas(filas)
    if (total < linea.cantidad)
      errores[linea.id] = `Faltan ${linea.cantidad - total} por asignar.`
    else if (total > linea.cantidad)
      errores[linea.id] =
        `Sobran ${total - linea.cantidad}: la línea lleva ${linea.cantidad}.`
  }

  // El tope de cada banco, una vez sumadas todas las líneas.
  for (const linea of pedido.items)
    (salidas[linea.id] ?? []).forEach((s, n) => {
      const clave = claveDeSalida(linea.id, n, 'cantidad')
      if (!s.banco || errores[clave]) return
      const existencia = existencias
        .get(linea.raza_id)
        ?.find((e) => e.banco === s.banco)
      const hay = existencia?.reinas ?? 0
      if ((pedidas.get(deRaza(linea.raza_id, s.banco)) ?? 0) > hay)
        errores[clave] =
          `${existencia?.nombre ?? 'Ese banco'} tiene ${hay} de esta raza.`
    })
  return errores
}

/** El cuerpo de la entrega. Solo después de validarDespacho. La fecha
 *  vacía la completa el backend con hoy. */
export function aDespacho(
  pedido: Pedido,
  salidas: Salidas,
  fecha: string,
): Despacho {
  return {
    fecha: fecha || null,
    lineas: pedido.items.map((l) => ({
      pedido_item_id: l.id,
      bancos: (salidas[l.id] ?? []).map((s) => ({
        banco_id: s.banco === SIN_BANCO ? null : s.banco,
        cantidad: Number(s.cantidad.trim()),
      })),
    })),
  }
}

/** Los 409 y 422 de la entrega que se pueden ubicar en una fila: el banco
 *  no tiene tantas reinas, o ya no existe. Lo demás va arriba de los
 *  botones. */
export function erroresDelDespacho(error: unknown, salidas: Salidas): Errores {
  if (!esApiError(error)) return {}
  const errores: Errores = {}
  const { detalles } = error
  const marcar = (lineaId: string | null, bancoId: unknown, texto: string) => {
    const banco = bancoId === null ? SIN_BANCO : String(bancoId)
    for (const [linea, filas] of Object.entries(salidas)) {
      if (lineaId !== null && linea !== lineaId) continue
      filas.forEach((s, n) => {
        if (s.banco === banco)
          errores[claveDeSalida(linea, n, 'cantidad')] = texto
      })
    }
  }

  if (error.codigo === 'stock_insuficiente_en_banco')
    marcar(
      String(detalles.pedido_item_id),
      detalles.banco_id,
      `${error.mensaje} Hay ${String(detalles.hay)}.`,
    )
  else if (error.codigo === 'banco_no_encontrado')
    marcar(null, detalles.banco_id, error.mensaje)
  return errores
}
