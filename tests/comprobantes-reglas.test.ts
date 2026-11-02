import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/api/client'
import { comprobantesSimulados } from '../src/api/comprobantes'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import {
  errorDeComprobante,
  errorDeFechaDeEmision,
  errorDeNumero,
  errorDePuntoDeVenta,
  formatearTipoDeCambio,
  leerEntero,
  letraEsperada,
  monedasDeLaLetra,
  nombreDeComprobante,
  normalizarImporte,
  normalizarTipoDeCambio,
  numeroImpreso,
} from '../src/lib/comprobantes'
import {
  BORRADOR_VACIO,
  aComprobanteCrear,
  borradorParaCliente,
  erroresDelAlta,
  mensajeDelAlta,
  validarComprobante,
} from '../src/modulos/ventas/comprobantes'
import type { Cliente, ComprobanteCrear } from '../src/tipos/dominio'

const TENANT = '11111111-1111-4111-8111-111111111111'
const [INSCRIPTO, EXTERIOR, MONOTRIBUTO] = DATOS_SIMULADOS.clientes
const pdf = () => new File(['%PDF'], 'factura.pdf', { type: 'application/pdf' })

describe('formato impreso', () => {
  it('punto de venta y número se rellenan con ceros solo al mostrar', () => {
    expect(numeroImpreso(1, 45)).toBe('0001-00000045')
    expect(numeroImpreso(12345, 99999999)).toBe('12345-99999999')
  })

  it('el nombre es el que figura en el PDF', () => {
    expect(nombreDeComprobante({ tipo: 'A', punto_venta: 1, numero: 45 })).toBe(
      'Factura A 0001-00000045',
    )
  })

  it('el tipo de cambio no muestra los ceros de la columna', () => {
    expect(formatearTipoDeCambio('1180.000000')).toBe('1.180,00')
    expect(formatearTipoDeCambio('1180.125000')).toBe('1.180,125')
  })
})

describe('letra según el cliente (letra_esperada del backend)', () => {
  it.each([
    ['exterior', EXTERIOR, 'E'],
    ['responsable inscripto', INSCRIPTO, 'A'],
    ['monotributo', MONOTRIBUTO, 'B'],
  ] as const)('%s → %s', (_, cliente, letra) => {
    expect(letraEsperada(cliente)).toBe(letra)
  })

  it('exento y consumidor final también son B', () => {
    for (const condicion_iva of ['exento', 'consumidor_final'] as const)
      expect(letraEsperada({ tipo: 'nacional', condicion_iva })).toBe('B')
  })

  it('un cliente de exportación es E aunque no diga exterior', () => {
    expect(
      letraEsperada({
        tipo: 'exportacion',
        condicion_iva: 'responsable_inscripto',
      }),
    ).toBe('E')
  })

  it('al elegir el cliente se sugieren la letra y la moneda', () => {
    const nacional = borradorParaCliente(BORRADOR_VACIO, INSCRIPTO)
    expect(nacional).toMatchObject({ tipo: 'A', moneda: 'ARS' })
    const exportacion = borradorParaCliente(nacional, EXTERIOR)
    expect(exportacion).toMatchObject({ tipo: 'E', moneda: 'USD' })
    // Vuelve a un nacional: pesos y sin tipo de cambio.
    expect(
      borradorParaCliente({ ...exportacion, tipo_cambio: '1180' }, MONOTRIBUTO),
    ).toMatchObject({ tipo: 'B', moneda: 'ARS', tipo_cambio: '' })
  })
})

describe('moneda y tipo de cambio', () => {
  const base = { tipo: 'A', fecha_emision: '2026-10-01' } as const

  it('la E va en USD o EUR; la A y la B, en pesos', () => {
    expect(monedasDeLaLetra('E')).toEqual(['USD', 'EUR'])
    expect(monedasDeLaLetra('A')).toEqual(['ARS'])
    expect(monedasDeLaLetra('B')).toEqual(['ARS'])
  })

  it('en pesos no lleva tipo de cambio', () => {
    expect(
      errorDeComprobante(
        { ...base, moneda: 'ARS', tipo_cambio: '1000' },
        '2026-11-01',
      ),
    ).toMatch(/no lleva tipo de cambio/)
  })

  it('fuera de pesos es obligatorio', () => {
    expect(
      errorDeComprobante(
        { ...base, tipo: 'E', moneda: 'USD', tipo_cambio: null },
        '2026-11-01',
      ),
    ).toBe('Falta el tipo de cambio de USD.')
  })

  it('una A en dólares o una E en pesos no existen', () => {
    expect(
      errorDeComprobante(
        { ...base, moneda: 'USD', tipo_cambio: '1180' },
        '2026-11-01',
      ),
    ).toMatch(/factura E va en USD o EUR/)
    expect(
      errorDeComprobante(
        { ...base, tipo: 'E', moneda: 'ARS', tipo_cambio: null },
        '2026-11-01',
      ),
    ).toMatch(/factura E va en USD o EUR/)
  })

  it('el tipo de cambio admite 6 decimales y el importe 2', () => {
    expect(normalizarTipoDeCambio('1180,123456')).toBe('1180.123456')
    expect(normalizarTipoDeCambio('1180,1234567')).toBeNull()
    expect(normalizarImporte('640.500,00')).toBe('640500.00')
    expect(normalizarImporte('10,005')).toBeNull()
    expect(normalizarImporte('0')).toBeNull()
  })
})

describe('punto de venta y número son enteros', () => {
  it('se leen tal como se escriben, con o sin ceros adelante', () => {
    expect(leerEntero('0001')).toBe(1)
    expect(leerEntero(' 00000045 ')).toBe(45)
  })

  it('el texto impreso, un decimal o letras no son un entero', () => {
    for (const valor of ['0001-00000045', '1.5', '12a', ''])
      expect(leerEntero(valor)).toBeNull()
    expect(errorDeNumero('0001-00000045')).toMatch(/entero/)
  })

  it('respeta los topes de ARCA', () => {
    expect(errorDePuntoDeVenta('99999')).toBeNull()
    expect(errorDePuntoDeVenta('100000')).toMatch(/5 dígitos/)
    expect(errorDeNumero('99999999')).toBeNull()
    expect(errorDeNumero('100000000')).toMatch(/8 dígitos/)
    expect(errorDeNumero('0')).toMatch(/mayor a 0/)
  })
})

describe('validación del alta', () => {
  const completo = {
    ...borradorParaCliente(BORRADOR_VACIO, INSCRIPTO),
    punto_venta: '1',
    numero: '45',
    fecha_emision: '2026-10-01',
    importe: '1.500,50',
  }

  it('sin nada marca cada campo obligatorio', () => {
    const errores = validarComprobante(BORRADOR_VACIO, undefined, null)
    expect(Object.keys(errores).sort()).toEqual(
      [
        'archivo',
        'cliente_id',
        'fecha_emision',
        'importe',
        'numero',
        'punto_venta',
        'tipo',
      ].sort(),
    )
  })

  it('la fecha de emisión no puede ser futura', () => {
    expect(errorDeFechaDeEmision('2026-11-02', '2026-11-01')).toMatch(/futura/)
    expect(errorDeFechaDeEmision('2026-11-01', '2026-11-01')).toBeNull()
  })

  it('el PDF es obligatorio y tiene que ser PDF', () => {
    expect(validarComprobante(completo, INSCRIPTO, null).archivo).toMatch(/PDF/)
    const imagen = new File(['x'], 'f.png', { type: 'image/png' })
    expect(validarComprobante(completo, INSCRIPTO, imagen).archivo).toMatch(
      /va en PDF/,
    )
    expect(validarComprobante(completo, INSCRIPTO, pdf())).toEqual({})
  })

  it('fuera de pesos pide el tipo de cambio', () => {
    const exportacion = {
      ...completo,
      ...borradorParaCliente(completo, EXTERIOR),
    }
    expect(
      validarComprobante(exportacion, EXTERIOR, pdf()).tipo_cambio,
    ).toBeTruthy()
  })

  it('el cuerpo lleva enteros y decimales en texto, sin tipo de cambio en pesos', () => {
    expect(aComprobanteCrear(completo, 'clave')).toEqual({
      tipo: 'A',
      cliente_id: INSCRIPTO.id,
      punto_venta: 1,
      numero: 45,
      fecha_emision: '2026-10-01',
      moneda: 'ARS',
      importe: '1500.50',
      tipo_cambio: null,
      archivo_s3_key: 'clave',
    })
  })
})

describe('errores del backend en su campo', () => {
  const datos: ComprobanteCrear = {
    tipo: 'B',
    cliente_id: INSCRIPTO.id,
    punto_venta: 1,
    numero: 128,
    fecha_emision: '2026-10-01',
    moneda: 'ARS',
    importe: '10.00',
    archivo_s3_key: `documentos/${TENANT}/f.pdf`,
  }
  const error = (codigo: string, detalles = {}, status = 422) =>
    new ApiError({ status, codigo, mensaje: 'texto del backend', detalles })

  it('letra_incoherente va en la letra con la esperada', () => {
    expect(
      erroresDelAlta(error('letra_incoherente', { esperada: 'A' }), datos).tipo,
    ).toMatch(/le emite factura A, no B/)
  })

  it('comprobante_duplicado va en el número, con el formato impreso', () => {
    expect(
      erroresDelAlta(error('comprobante_duplicado', {}, 409), datos).numero,
    ).toMatch(/factura B 0001-00000128/)
  })

  it('cliente_inexistente y archivo_inexistente van en su campo', () => {
    expect(erroresDelAlta(error('cliente_inexistente'), datos)).toHaveProperty(
      'cliente_id',
    )
    expect(erroresDelAlta(error('archivo_inexistente'), datos)).toHaveProperty(
      'archivo',
    )
  })

  it('un 422 de Pydantic cae en su campo por la ruta', () => {
    const pydantic = error('validacion', {
      campos: [{ campo: 'body.importe', mensaje: 'Importe inválido.' }],
    })
    expect(erroresDelAlta(pydantic, datos)).toEqual({
      importe: 'Importe inválido.',
    })
  })

  it('la coherencia de la fila llega sin campo: se muestra su mensaje, no el genérico', () => {
    const fila = new ApiError({
      status: 422,
      codigo: 'validacion',
      mensaje: 'Los datos enviados no son validos.',
      detalles: {
        campos: [
          {
            campo: 'body',
            mensaje: 'Value error, La fecha de emision no puede ser futura.',
          },
        ],
      },
    })
    expect(erroresDelAlta(fila, datos)).toEqual({})
    expect(mensajeDelAlta(fila)).toBe(
      'La fecha de emision no puede ser futura.',
    )
  })
})

describe('comprobantes simulados con las reglas del backend', () => {
  const HOY = '2026-11-01'
  const api = () => comprobantesSimulados({ hoy: () => HOY })
  const nuevo: ComprobanteCrear = {
    tipo: 'A',
    cliente_id: INSCRIPTO.id,
    punto_venta: 2,
    numero: 45,
    fecha_emision: '2026-10-30',
    moneda: 'ARS',
    importe: '1500.50',
    tipo_cambio: null,
    archivo_s3_key: `documentos/${TENANT}/factura.pdf`,
  }

  it('lista de la emisión más nueva a la más vieja y filtra por cliente', async () => {
    const { items, siguiente } = await api().listar()
    const fechas = items.map((c) => c.fecha_emision)
    expect(fechas).toEqual([...fechas].sort().reverse())
    expect(siguiente).toBeNull()
    const delExterior = await api().listar({ cliente_id: EXTERIOR.id })
    expect(delExterior.items.map((c) => c.tipo)).toEqual(['E'])
  })

  it('registra lo transcripto tal cual y la misma clave no duplica', async () => {
    const simulada = api()
    const a = await simulada.crear(nuevo, 'clave-1')
    const b = await simulada.crear(nuevo, 'clave-1')
    expect(b.id).toBe(a.id)
    expect(a).toMatchObject({ punto_venta: 2, numero: 45, tipo_cambio: null })
    expect((await simulada.listar()).items[0].id).toBe(a.id)
  })

  it('(tipo, punto de venta, número) repetido es 409 comprobante_duplicado', async () => {
    const simulada = api()
    await simulada.crear(nuevo)
    await expect(simulada.crear(nuevo)).rejects.toMatchObject({
      status: 409,
      codigo: 'comprobante_duplicado',
    })
  })

  it('la letra que no corresponde al cliente es 422 con la esperada', async () => {
    await expect(api().crear({ ...nuevo, tipo: 'B' })).rejects.toMatchObject({
      status: 422,
      codigo: 'letra_incoherente',
      detalles: { esperada: 'A' },
    })
  })

  it('un cliente que no existe es 422 cliente_inexistente', async () => {
    await expect(
      api().crear({ ...nuevo, cliente_id: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 422, codigo: 'cliente_inexistente' })
  })

  it('un PDF que no se subió es 422 archivo_inexistente', async () => {
    const sinArchivo = comprobantesSimulados({
      hoy: () => HOY,
      archivoSubido: () => false,
    })
    await expect(sinArchivo.crear(nuevo)).rejects.toMatchObject({
      status: 422,
      codigo: 'archivo_inexistente',
    })
  })

  it('el cliente dado de baja conserva su facturación', async () => {
    const b = await api().crear({
      ...nuevo,
      tipo: 'B',
      cliente_id: MONOTRIBUTO.id,
    })
    expect(b.tipo).toBe('B')
  })

  it('fecha futura, E en pesos o falta de tipo de cambio son 422 antes que todo', async () => {
    for (const malo of [
      { ...nuevo, fecha_emision: '2026-11-02' },
      { ...nuevo, tipo: 'E' as const, cliente_id: EXTERIOR.id },
      { ...nuevo, moneda: 'USD' as const },
    ])
      await expect(api().crear(malo)).rejects.toMatchObject({
        status: 422,
        codigo: 'validacion',
      })
  })

  it('otro id responde 404 comprobante_no_encontrado', async () => {
    await expect(api().obtener('no-existe')).rejects.toMatchObject({
      status: 404,
      codigo: 'comprobante_no_encontrado',
    })
  })
})

describe('semilla de comprobantes coherente con el backend', () => {
  const clientes = new Map<string, Cliente>(
    DATOS_SIMULADOS.clientes.map((c) => [c.id, c]),
  )

  it('hay una de cada letra y cada una es la que le toca a su cliente', () => {
    const letras = DATOS_SIMULADOS.comprobantes.map((c) => c.tipo).sort()
    expect(letras).toEqual(['A', 'B', 'E'])
    for (const c of DATOS_SIMULADOS.comprobantes) {
      const cliente = clientes.get(c.cliente_id)
      expect(cliente, c.id).toBeTruthy()
      expect(c.tipo).toBe(letraEsperada(cliente!))
    }
  })

  it('cumple los CHECK de la 0014: moneda, tipo de cambio, fecha y key', () => {
    for (const c of DATOS_SIMULADOS.comprobantes) {
      expect(
        errorDeComprobante(c, '2026-11-01'),
        nombreDeComprobante(c),
      ).toBeNull()
      expect(c.fecha_emision).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(c.archivo_s3_key.startsWith(`documentos/${TENANT}/`)).toBe(true)
      expect(typeof c.importe).toBe('string')
    }
  })
})
