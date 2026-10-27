/** Pedidos (backend #34), sus reservas (#35) y sus estados (#36). No es un
 *  catálogo: no tiene PATCH ni baja, y el estado cambia con acciones. Mismo
 *  esquema que api/embarques.ts: dos implementaciones con la misma firma y
 *  un solo swap por VITE_DATOS_SIMULADOS. */
import { ApiError, esApiError, request } from '@/api/client'
import type { Pagina } from '@/api/recurso'
import { clientes, itemsVendibles, razas } from '@/api/recursos'
import { usaDatosSimulados } from '@/datos/cliente'
import { DATOS_SIMULADOS } from '@/datos/simulados'
import {
  errorDeDespacho,
  errorDeFormatoDeDespacho,
  errorDePedido,
  puedePasar,
} from '@/lib/pedidos'
import type {
  Banco,
  Cancelar,
  Celda,
  Cliente,
  Despacho,
  Entregar,
  EstadoPedido,
  ItemVendible,
  Pedido,
  PedidoCrear,
  Raza,
  Reserva,
  Tanda,
} from '@/tipos/dominio'

export type FiltrosDePedidos = {
  estado?: EstadoPedido
  cliente_id?: string
}

export interface ApiPedidos {
  listar(filtros?: FiltrosDePedidos, cursor?: string): Promise<Pagina<Pedido>>
  obtener(id: string): Promise<Pedido>
  crear(datos: PedidoCrear, claveIdempotencia?: string): Promise<Pedido>
  /** Reserva todas las líneas o ninguna. Sin Idempotency-Key en el
   *  backend: un reintento responde 409 pedido_no_reservable. */
  reservar(id: string): Promise<Reserva[]>
  entregar(
    id: string,
    despacho: Despacho,
    claveIdempotencia?: string,
  ): Promise<Pedido>
  cancelar(id: string, claveIdempotencia?: string): Promise<Pedido>
}

const RUTA = '/api/v1/pedidos'
/** Los pedidos crecen sin tope: se piden de a una página ("Cargar más"). */
export const LIMITE_PEDIDOS = 50

export function pedidosHttp(): ApiPedidos {
  const de = (id: string) => `${RUTA}/${encodeURIComponent(id)}`
  const cambiarEstado = (
    id: string,
    cuerpo: Entregar | Cancelar,
    claveIdempotencia?: string,
  ) =>
    request<Pedido>(`${de(id)}/estado`, {
      metodo: 'POST',
      cuerpo,
      claveIdempotencia,
    })
  return {
    listar: (filtros = {}, cursor) =>
      request<Pagina<Pedido>>(RUTA, {
        query: { ...filtros, limite: LIMITE_PEDIDOS, cursor },
      }),
    obtener: (id) => request<Pedido>(de(id)),
    crear: (datos, claveIdempotencia) =>
      request<Pedido>(RUTA, {
        metodo: 'POST',
        cuerpo: datos,
        claveIdempotencia,
      }),
    reservar: (id) =>
      request<Reserva[]>(`${de(id)}/reservas`, { metodo: 'POST' }),
    entregar: (id, despacho, claveIdempotencia) =>
      cambiarEstado(
        id,
        { estado: 'entregado', ...despacho },
        claveIdempotencia,
      ),
    cancelar: (id, claveIdempotencia) =>
      cambiarEstado(id, { estado: 'cancelado' }, claveIdempotencia),
  }
}

/** De dónde lee la API simulada los catálogos; undefined si no existe. */
export type Catalogos = {
  cliente(id: string): Promise<Cliente | undefined>
  itemVendible(id: string): Promise<ItemVendible | undefined>
  raza(id: string): Promise<Raza | undefined>
}

/** Catálogos fijos de una lista: los de la semilla, para los tests. */
export function catalogosDe(datos = DATOS_SIMULADOS): Catalogos {
  const de =
    <T extends { id: string }>(filas: readonly T[]) =>
    async (id: string) =>
      filas.find((f) => f.id === id)
  return {
    cliente: de(datos.clientes),
    itemVendible: de(datos.itemsVendibles),
    raza: de(datos.razas),
  }
}

/** Un recurso de api/recursos.ts como catálogo: el 404 es "no existe". */
const desdeRecurso =
  <T>(recurso: { obtener(id: string): Promise<T> }) =>
  async (id: string): Promise<T | undefined> => {
    try {
      return await recurso.obtener(id)
    } catch (error) {
      if (esApiError(error) && error.status === 404) return undefined
      throw error
    }
  }

const validacion = (codigo: string, mensaje: string, detalles = {}) =>
  new ApiError({ status: 422, codigo, mensaje, detalles })
const conflicto = (codigo: string, mensaje: string, detalles = {}) =>
  new ApiError({ status: 409, codigo, mensaje, detalles })

type Semilla = {
  pedidos?: readonly Pedido[]
  reservas?: readonly Reserva[]
  celdas?: readonly Celda[]
  tandas?: readonly Tanda[]
  bancos?: readonly Banco[]
  catalogos?: Catalogos
}

/** En memoria para la demo sin backend. Repite las reglas de los
 *  repositorios de pedidos, reservas y transiciones del backend, así la
 *  pantalla se comporta igual que con la API. El stock sale de las celdas
 *  enjauladas, como en el backend (ADR 0014). */
export function pedidosSimulados({
  pedidos: semilla = DATOS_SIMULADOS.pedidos,
  reservas: reservasSemilla = DATOS_SIMULADOS.reservas,
  celdas: celdasSemilla = DATOS_SIMULADOS.celdas,
  tandas = DATOS_SIMULADOS.tandas,
  bancos = DATOS_SIMULADOS.bancos,
  catalogos = catalogosDe(),
}: Semilla = {}): ApiPedidos {
  let pedidos = semilla.map((p) => ({ ...p, items: [...p.items] }))
  let reservas = reservasSemilla.map((r) => ({ ...r }))
  let celdas = celdasSemilla.map((c) => ({ ...c }))
  const razaDeTanda = new Map(tandas.map((t) => [t.id, t.raza_id]))
  const bancosExistentes = new Set(bancos.map((b) => b.id))
  const porClave = new Map<string, Pedido>()

  const buscar = (id: string): Pedido => {
    const pedido = pedidos.find((p) => p.id === id)
    if (!pedido)
      throw new ApiError({
        status: 404,
        codigo: 'pedido_no_encontrado',
        mensaje: 'No existe el pedido.',
      })
    return pedido
  }
  const guardar = (pedido: Pedido): Pedido => {
    pedidos = pedidos.map((p) => (p.id === pedido.id ? pedido : p))
    return pedido
  }
  // Como el backend: con Idempotency-Key, un reintento devuelve lo mismo.
  const unaVez = async (
    clave: string | undefined,
    alcance: string,
    cambio: () => Promise<Pedido>,
  ): Promise<Pedido> => {
    const previa = clave ? porClave.get(`${alcance}:${clave}`) : undefined
    if (previa) return previa
    const resultado = await cambio()
    if (clave) porClave.set(`${alcance}:${clave}`, resultado)
    return resultado
  }

  const enjauladas = (razaId: string, bancoId?: string | null) =>
    celdas.filter(
      (c) =>
        c.estado === 'enjaulada' &&
        razaDeTanda.get(c.tanda_id) === razaId &&
        (bancoId === undefined || c.banco_id === bancoId),
    )
  // Disponible = enjauladas − reservas activas (repositorio_disponibilidad).
  const disponible = (razaId: string) =>
    enjauladas(razaId).length -
    reservas
      .filter((r) => r.estado === 'activa' && r.raza_id === razaId)
      .reduce((total, r) => total + r.cantidad, 0)

  const transicion = (pedido: Pedido, hacia: EstadoPedido) => {
    if (!puedePasar(pedido.estado, hacia))
      throw conflicto(
        'transicion_invalida',
        `Un pedido ${pedido.estado} no puede pasar a ${hacia}.`,
        { desde: pedido.estado, hacia },
      )
  }
  const activasDe = (pedido: Pedido) => {
    const lineas = new Set(pedido.items.map((l) => l.id))
    return reservas.filter(
      (r) => r.estado === 'activa' && lineas.has(r.pedido_item_id),
    )
  }
  const cerrarReservas = (pedido: Pedido, estado: Reserva['estado']) => {
    const activas = new Set(activasDe(pedido).map((r) => r.id))
    reservas = reservas.map((r) => (activas.has(r.id) ? { ...r, estado } : r))
  }

  return {
    listar: async ({ estado, cliente_id } = {}, cursor) => {
      // pedidos va del más nuevo al más viejo, como el ORDER BY del backend.
      const filtrados = pedidos.filter(
        (p) =>
          (!estado || p.estado === estado) &&
          (!cliente_id || p.cliente_id === cliente_id),
      )
      const desde = cursor ? Number(cursor) : 0
      const hasta = desde + LIMITE_PEDIDOS
      return {
        items: filtrados.slice(desde, hasta),
        siguiente: hasta < filtrados.length ? String(hasta) : null,
      }
    },
    obtener: async (id) => buscar(id),
    crear: (datos, clave) =>
      unaVez(clave, 'crear', async () => {
        const cliente = await catalogos.cliente(datos.cliente_id)
        if (!cliente)
          throw validacion('cliente_inexistente', 'No existe el cliente.')
        if (!cliente.activo)
          throw validacion(
            'cliente_inactivo',
            'El cliente está dado de baja: no se le pueden tomar pedidos.',
          )
        const incoherente = errorDePedido(
          cliente.tipo,
          datos.moneda,
          datos.destino_pais,
          datos.incoterm,
        )
        if (incoherente) throw validacion('pedido_incoherente', incoherente)

        const items = await Promise.all(
          datos.items.map((l) => catalogos.itemVendible(l.item_vendible_id)),
        )
        const sinItem = datos.items
          .filter((_, n) => !items[n]?.activo)
          .map((l) => l.item_vendible_id)
        if (sinItem.length)
          throw validacion(
            'item_vendible_inexistente',
            'Algún ítem vendible no existe o está dado de baja.',
            { ids: [...new Set(sinItem)].sort() },
          )
        const lasRazas = await Promise.all(
          datos.items.map((l) => catalogos.raza(l.raza_id)),
        )
        const sinRaza = datos.items
          .filter((_, n) => !lasRazas[n]?.activo)
          .map((l) => l.raza_id)
        if (sinRaza.length)
          throw validacion(
            'raza_inexistente',
            'Alguna raza no existe o está dada de baja.',
            { ids: [...new Set(sinRaza)].sort() },
          )

        const nuevo: Pedido = {
          id: crypto.randomUUID(),
          cliente_id: datos.cliente_id,
          estado: 'borrador',
          moneda: datos.moneda,
          destino_pais: datos.destino_pais ?? null,
          incoterm: datos.incoterm ?? null,
          fecha_entrega_solicitada: datos.fecha_entrega_solicitada,
          items: datos.items.map((l, n) => ({
            id: crypto.randomUUID(),
            numero_linea: n + 1,
            item_vendible_id: l.item_vendible_id,
            raza_id: l.raza_id,
            cantidad: l.cantidad,
            precio_unitario: String(l.precio_unitario),
            // La alícuota no se recibe: se copia del ítem vendible.
            alicuota: items[n]!.alicuota,
          })),
        }
        pedidos = [nuevo, ...pedidos]
        return nuevo
      }),
    reservar: async (id) => {
      const pedido = buscar(id)
      if (pedido.estado !== 'borrador')
        throw conflicto(
          'pedido_no_reservable',
          'Solo se puede reservar un pedido en borrador.',
          { estado: pedido.estado },
        )
      // Lo pedido se suma por raza: dos líneas de Carniola compiten juntas.
      const pedidas = new Map<string, number>()
      for (const l of pedido.items)
        pedidas.set(l.raza_id, (pedidas.get(l.raza_id) ?? 0) + l.cantidad)
      const faltan = [...pedidas]
        .map(([raza_id, cantidad]) => ({
          raza_id,
          pedidas: cantidad,
          disponible: disponible(raza_id),
        }))
        .filter((r) => r.pedidas > r.disponible)
        .map((r) => ({ ...r, faltan: r.pedidas - r.disponible }))
        .sort((a, b) => a.raza_id.localeCompare(b.raza_id))
      if (faltan.length)
        throw conflicto(
          'stock_insuficiente',
          'No hay reinas suficientes para reservar el pedido.',
          { razas: faltan },
        )

      const nuevas: Reserva[] = pedido.items.map((l) => ({
        id: crypto.randomUUID(),
        pedido_item_id: l.id,
        raza_id: l.raza_id,
        cantidad: l.cantidad,
        estado: 'activa',
      }))
      reservas = [...reservas, ...nuevas]
      guardar({ ...pedido, estado: 'reservado' })
      return nuevas
    },
    entregar: (id, despacho, clave) =>
      unaVez(clave, `estado:${id}`, async () => {
        // El schema corre antes que el repositorio: el formato va primero.
        const formato = errorDeFormatoDeDespacho(despacho)
        if (formato) throw validacion('validacion', formato)
        const pedido = buscar(id)
        transicion(pedido, 'entregado')

        const activas = activasDe(pedido)
        const invalido = errorDeDespacho(
          new Map(activas.map((r) => [r.pedido_item_id, r.cantidad])),
          new Map(
            despacho.lineas.map((l) => [
              l.pedido_item_id,
              l.bancos.reduce((total, b) => total + b.cantidad, 0),
            ]),
          ),
        )
        if (invalido) throw validacion('despacho_invalido', invalido)
        const sinBanco = despacho.lineas
          .flatMap((l) => l.bancos.map((b) => b.banco_id))
          .filter((b): b is string => b !== null && !bancosExistentes.has(b))
          .sort()
        if (sinBanco.length)
          throw validacion('banco_no_encontrado', 'No existe el banco.', {
            banco_id: sinBanco[0],
          })

        // Se eligen todas las celdas antes de tocar nada: si un banco no
        // alcanza, no se despacha ninguna (la transacción del backend).
        const razaDeLinea = new Map(
          activas.map((r) => [r.pedido_item_id, r.raza_id]),
        )
        const elegidas = new Set<string>()
        for (const linea of despacho.lineas) {
          for (const salida of linea.bancos) {
            const libres = enjauladas(
              razaDeLinea.get(linea.pedido_item_id)!,
              salida.banco_id,
            ).filter((c) => !elegidas.has(c.id))
            if (libres.length < salida.cantidad)
              throw conflicto(
                'stock_insuficiente_en_banco',
                'El banco no tiene tantas reinas enjauladas de la raza de la línea.',
                {
                  pedido_item_id: linea.pedido_item_id,
                  banco_id: salida.banco_id,
                  pedidas: salida.cantidad,
                  hay: libres.length,
                },
              )
            for (const c of libres.slice(0, salida.cantidad)) elegidas.add(c.id)
          }
        }
        celdas = celdas.map((c) =>
          elegidas.has(c.id) ? { ...c, estado: 'despachada' } : c,
        )
        cerrarReservas(pedido, 'consumida')
        return guardar({ ...pedido, estado: 'entregado' })
      }),
    cancelar: (id, clave) =>
      unaVez(clave, `estado:${id}`, async () => {
        const pedido = buscar(id)
        transicion(pedido, 'cancelado')
        cerrarReservas(pedido, 'liberada')
        return guardar({ ...pedido, estado: 'cancelado' })
      }),
  }
}

export const pedidos: ApiPedidos = usaDatosSimulados(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
  ? // Los mismos catálogos que las pantallas: un cliente dado de alta en
    // la demo ya puede tener pedidos.
    pedidosSimulados({
      catalogos: {
        cliente: desdeRecurso(clientes),
        itemVendible: desdeRecurso(itemsVendibles),
        raza: desdeRecurso(razas),
      },
    })
  : pedidosHttp()
