import { describe, expect, it } from 'vitest'
import { catalogosDe, pedidosSimulados } from '../src/api/pedidos'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { hoyEnArgentina } from '../src/lib/fechas'
import {
  errorDeCantidad,
  errorDeDespacho,
  errorDeFormatoDeDespacho,
  errorDePedido,
  normalizarPrecio,
  puedePasar,
} from '../src/lib/pedidos'
import type { PedidoCrear } from '../src/tipos/dominio'

const [PARA_RESERVAR, RESERVADO, SIN_STOCK, CANCELADO] = DATOS_SIMULADOS.pedidos
const [B01, B02] = DATOS_SIMULADOS.bancos
const [NACIONAL, EXPORTACION, DADO_DE_BAJA] = DATOS_SIMULADOS.clientes
const [CARNIOLA] = DATOS_SIMULADOS.razas
const [FECUNDADA] = DATOS_SIMULADOS.itemsVendibles

describe('reglas del pedido (validar_pedido del backend)', () => {
  it('nacional: ARS, sin destino ni incoterm', () => {
    expect(errorDePedido('nacional', 'ARS', null, null)).toBeNull()
    expect(errorDePedido('nacional', 'USD', null, null)).toMatch(/ARS/)
    expect(errorDePedido('nacional', 'ARS', 'CL', null)).toMatch(/destino/)
    expect(errorDePedido('nacional', 'ARS', null, 'FOB')).toMatch(/incoterm/)
  })

  it('exportación: USD o EUR, destino de 2 letras distinto de AR', () => {
    expect(errorDePedido('exportacion', 'EUR', 'DE', null)).toBeNull()
    expect(errorDePedido('exportacion', 'USD', 'NZ', 'CPT')).toBeNull()
    expect(errorDePedido('exportacion', 'USD', null, null)).toMatch(/destino/)
    expect(errorDePedido('exportacion', 'USD', 'nz', null)).toMatch(/2 letras/)
    expect(errorDePedido('exportacion', 'USD', 'AR', null)).toMatch(/Argentina/)
    expect(errorDePedido('exportacion', 'ARS', 'CL', null)).toMatch(/USD o EUR/)
  })

  it.each([
    ['1500', '1500'],
    ['1500.5', '1500.5'],
    ['1500,50', '1500.50'],
    ['1.500,50', '1500.50'],
    [' 0 ', '0'],
  ])('el precio %s viaja como el texto %s', (entrada, esperado) => {
    expect(normalizarPrecio(entrada)).toBe(esperado)
  })

  it.each(['', '-1', '1,505', '1e3', 'abc', '1234567890123'])(
    'el precio %s no se manda',
    (entrada) => {
      expect(normalizarPrecio(entrada)).toBeNull()
    },
  )

  it('la cantidad es un entero mayor a 0 que entra en un Integer', () => {
    expect(errorDeCantidad('12')).toBeNull()
    expect(errorDeCantidad('0')).toMatch(/mayor a 0/)
    expect(errorDeCantidad('1,5')).toMatch(/entero/)
    expect(errorDeCantidad('2147483648')).toMatch(/grande/)
  })

  it('solo las transiciones de la matriz del backend', () => {
    expect(puedePasar('borrador', 'reservado')).toBe(true)
    expect(puedePasar('borrador', 'cancelado')).toBe(true)
    expect(puedePasar('borrador', 'entregado')).toBe(false)
    expect(puedePasar('reservado', 'entregado')).toBe(true)
    expect(puedePasar('entregado', 'cancelado')).toBe(false)
    expect(puedePasar('cancelado', 'borrador')).toBe(false)
  })
})

describe('reglas del despacho (Entregar y validar_despacho)', () => {
  const linea = (banco: string | null, cantidad: number) => ({
    pedido_item_id: 'l1',
    bancos: [{ banco_id: banco, cantidad }],
  })

  it('el despacho cubre exactamente lo reservado de cada línea', () => {
    const reservadas = new Map([['l1', 12]])
    expect(errorDeDespacho(reservadas, new Map([['l1', 12]]))).toBeNull()
    expect(errorDeDespacho(reservadas, new Map([['l1', 8]]))).toMatch(
      /8 en el despacho pero 12/,
    )
    expect(errorDeDespacho(reservadas, new Map())).toMatch(/no está/)
    expect(
      errorDeDespacho(
        reservadas,
        new Map([
          ['l1', 12],
          ['l2', 1],
        ]),
      ),
    ).toMatch(/no es de este pedido/)
  })

  it('no repite líneas ni bancos, y "sin banco" va una sola vez', () => {
    expect(
      errorDeFormatoDeDespacho({ lineas: [linea('b1', 3), linea('b2', 3)] }),
    ).toMatch(/línea del pedido aparece dos veces/)
    expect(
      errorDeFormatoDeDespacho({
        lineas: [
          {
            pedido_item_id: 'l1',
            bancos: [
              { banco_id: null, cantidad: 1 },
              { banco_id: null, cantidad: 2 },
            ],
          },
        ],
      }),
    ).toMatch(/banco aparece dos veces/)
  })

  it('cantidades enteras positivas y fecha no futura', () => {
    expect(errorDeFormatoDeDespacho({ lineas: [linea('b1', 0)] })).toMatch(
      /mayor a 0/,
    )
    expect(
      errorDeFormatoDeDespacho(
        { fecha: '2026-10-28', lineas: [linea('b1', 1)] },
        '2026-10-27',
      ),
    ).toMatch(/futura/)
    expect(
      errorDeFormatoDeDespacho(
        { fecha: '2026-10-20', lineas: [linea('b1', 1)] },
        '2026-10-27',
      ),
    ).toBeNull()
  })

  it('hoy es el de Argentina, no el de UTC', () => {
    // 23:30 del 31/10 en Buenos Aires = 02:30 del 1/11 en UTC.
    expect(hoyEnArgentina(new Date('2026-11-01T02:30:00Z'))).toBe('2026-10-31')
  })
})

const alta = (cambios: Partial<PedidoCrear> = {}): PedidoCrear => ({
  cliente_id: NACIONAL.id,
  moneda: 'ARS',
  fecha_entrega_solicitada: '2026-11-15',
  items: [
    {
      item_vendible_id: FECUNDADA.id,
      raza_id: CARNIOLA.id,
      cantidad: 12,
      precio_unitario: '45000.00',
    },
  ],
  ...cambios,
})

describe('API de pedidos simulada (mismas respuestas que el backend)', () => {
  it('el alta crea en borrador y copia la alícuota del ítem', async () => {
    const api = pedidosSimulados()
    const p = await api.crear(alta())
    expect(p).toMatchObject({ estado: 'borrador', destino_pais: null })
    expect(p.items[0]).toMatchObject({ numero_linea: 1, alicuota: '0.21' })
    const { items } = await api.listar()
    expect(items[0].id).toBe(p.id)
  })

  it('la misma clave de idempotencia crea un solo pedido', async () => {
    const api = pedidosSimulados()
    const a = await api.crear(alta(), 'clave-1')
    const b = await api.crear(alta(), 'clave-1')
    expect(b.id).toBe(a.id)
  })

  it('cliente dado de baja, incoherente o con ítem inexistente es 422', async () => {
    const api = pedidosSimulados()
    await expect(
      api.crear(alta({ cliente_id: DADO_DE_BAJA.id })),
    ).rejects.toMatchObject({ status: 422, codigo: 'cliente_inactivo' })
    await expect(
      api.crear(alta({ cliente_id: EXPORTACION.id })),
    ).rejects.toMatchObject({ status: 422, codigo: 'pedido_incoherente' })
    await expect(
      api.crear(
        alta({
          items: [{ ...alta().items[0], item_vendible_id: 'no-existe' }],
        }),
      ),
    ).rejects.toMatchObject({
      codigo: 'item_vendible_inexistente',
      detalles: { ids: ['no-existe'] },
    })
  })

  it('filtra por estado y por cliente', async () => {
    const api = pedidosSimulados()
    const reservados = await api.listar({ estado: 'reservado' })
    expect(reservados.items.map((p) => p.id)).toEqual([RESERVADO.id])
    const deExportacion = await api.listar({ cliente_id: EXPORTACION.id })
    expect(
      deExportacion.items.every((p) => p.cliente_id === EXPORTACION.id),
    ).toBe(true)
  })

  it('reservar sin reinas de la raza es 409 stock_insuficiente con el detalle', async () => {
    const api = pedidosSimulados()
    await expect(api.reservar(SIN_STOCK.id)).rejects.toMatchObject({
      status: 409,
      codigo: 'stock_insuficiente',
      detalles: {
        razas: [{ pedidas: 30, disponible: 0, faltan: 30 }],
      },
    })
  })

  it('reservar dos veces es 409 pedido_no_reservable', async () => {
    const api = pedidosSimulados()
    const reservas = await api.reservar(PARA_RESERVAR.id)
    expect(reservas).toHaveLength(1)
    expect(reservas[0]).toMatchObject({ cantidad: 20, estado: 'activa' })
    expect((await api.obtener(PARA_RESERVAR.id)).estado).toBe('reservado')
    await expect(api.reservar(PARA_RESERVAR.id)).rejects.toMatchObject({
      status: 409,
      codigo: 'pedido_no_reservable',
    })
  })

  it('DoD: se reserva y se entrega repartido entre dos bancos', async () => {
    const api = pedidosSimulados()
    const [linea] = PARA_RESERVAR.items
    await api.reservar(PARA_RESERVAR.id)
    const entregado = await api.entregar(PARA_RESERVAR.id, {
      lineas: [
        {
          pedido_item_id: linea.id,
          bancos: [
            { banco_id: B01.id, cantidad: 12 },
            { banco_id: B02.id, cantidad: 8 },
          ],
        },
      ],
    })
    expect(entregado.estado).toBe('entregado')
    // Final: ya no se cancela.
    await expect(api.cancelar(PARA_RESERVAR.id)).rejects.toMatchObject({
      status: 409,
      codigo: 'transicion_invalida',
    })
  })

  it('entregar con otra cantidad que la reservada es 422 despacho_invalido', async () => {
    const api = pedidosSimulados()
    const [linea] = RESERVADO.items
    await expect(
      api.entregar(RESERVADO.id, {
        lineas: [
          {
            pedido_item_id: linea.id,
            bancos: [{ banco_id: B01.id, cantidad: 49 }],
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 422, codigo: 'despacho_invalido' })
  })

  it('un banco que no alcanza es 409 y no despacha nada', async () => {
    const api = pedidosSimulados()
    const [linea] = RESERVADO.items
    // Las 50 reinas no están en un solo banco: B-01 tiene la mitad de 240.
    const todoDeUno = {
      lineas: [
        {
          pedido_item_id: linea.id,
          bancos: [{ banco_id: null, cantidad: 50 }],
        },
      ],
    }
    await expect(api.entregar(RESERVADO.id, todoDeUno)).rejects.toMatchObject({
      status: 409,
      codigo: 'stock_insuficiente_en_banco',
      detalles: { banco_id: null, pedidas: 50, hay: 0 },
    })
    expect((await api.obtener(RESERVADO.id)).estado).toBe('reservado')
  })

  it('cancelar libera la reserva: lo reservado vuelve a estar disponible', async () => {
    // Una semilla donde la reserva del pedido de exportación deja justo 0.
    const celdas = DATOS_SIMULADOS.celdas
      .filter((c) => c.estado === 'enjaulada')
      .slice(0, 50)
    const api = pedidosSimulados({ celdas, catalogos: catalogosDe() })
    await expect(api.reservar(PARA_RESERVAR.id)).rejects.toMatchObject({
      codigo: 'stock_insuficiente',
    })
    await api.cancelar(RESERVADO.id)
    await expect(api.reservar(PARA_RESERVAR.id)).resolves.toHaveLength(1)
  })

  it('un pedido cancelado no se reserva ni se entrega', async () => {
    const api = pedidosSimulados()
    await expect(api.reservar(CANCELADO.id)).rejects.toMatchObject({
      codigo: 'pedido_no_reservable',
    })
    await expect(
      api.entregar(CANCELADO.id, {
        lineas: [
          {
            pedido_item_id: CANCELADO.items[0].id,
            bancos: [{ banco_id: B01.id, cantidad: 15 }],
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 409, codigo: 'transicion_invalida' })
  })
})
