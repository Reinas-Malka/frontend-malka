import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import {
  AVISO_OTRA_MONEDA,
  AVISO_OTRO_TIPO,
  decodificarBase64,
  leerQrDeArca,
  type DatosDelQr,
} from '../src/lib/qrDeArca'
import {
  BORRADOR_VACIO,
  borradorConQr,
  borradorInicial,
  clientePorDocumento,
  documentoDelCliente,
  leerAltaDeLaUrl,
  quienLoCargo,
  urlParaRegistrarFactura,
} from '../src/modulos/ventas/comprobantes'

const [DON_EMILIO, BEE_KINGDOM, MIEL_DEL_DELTA] = DATOS_SIMULADOS.clientes

/** El JSON de un QR de ARCA (RG 4892), con los valores de una factura A. */
const FACTURA_A = {
  ver: 1,
  fecha: '2026-10-20',
  cuit: 30712345671,
  ptoVta: 1,
  tipoCmp: 1,
  nroCmp: 45,
  importe: 12100,
  moneda: 'PES',
  ctz: 1,
  tipoDocRec: 80,
  nroDocRec: 20305211894,
  tipoCodAut: 'E',
  codAut: 74123456789012,
}

const qr = (
  json: unknown,
  base = 'https://www.afip.gob.ar/fe/qr/?p=',
): string => `${base}${btoa(JSON.stringify(json))}`

function datos(texto: string): DatosDelQr {
  const leido = leerQrDeArca(texto)
  if (!leido.valido) throw new Error(`QR inválido: ${leido.motivo}`)
  return leido.datos
}

describe('leer el QR de ARCA', () => {
  it('una factura A en pesos: letra, punto de venta, número, fecha e importe con 2 decimales', () => {
    const leido = leerQrDeArca(qr(FACTURA_A))

    expect(leido).toEqual({
      valido: true,
      avisos: [],
      datos: {
        tipo: 'A',
        punto_venta: 1,
        numero: 45,
        fecha_emision: '2026-10-20',
        moneda: 'ARS',
        importe: '12100.00',
        // En pesos no hay tipo de cambio aunque el QR traiga ctz 1.
        tipo_cambio: null,
        cuit_emisor: '30712345671',
        documento_receptor: '20305211894',
      },
    })
  })

  it('una factura B (tipoCmp 6)', () => {
    expect(
      datos(qr({ ...FACTURA_A, tipoCmp: 6, importe: 96000.5 })),
    ).toMatchObject({
      tipo: 'B',
      importe: '96000.50',
    })
  })

  it('una factura E en dólares trae el tipo de cambio', () => {
    const e = datos(
      qr({
        ...FACTURA_A,
        tipoCmp: 19,
        ptoVta: 3,
        nroCmp: 41,
        importe: 4820.5,
        moneda: 'DOL',
        ctz: 1180,
      }),
    )
    expect(e).toMatchObject({
      tipo: 'E',
      punto_venta: 3,
      numero: 41,
      moneda: 'USD',
      importe: '4820.50',
      tipo_cambio: '1180',
    })
  })

  it('euros es el código 060 y el tipo de cambio conserva sus decimales', () => {
    expect(
      datos(qr({ ...FACTURA_A, tipoCmp: 19, moneda: '060', ctz: 1290.125 })),
    ).toMatchObject({ moneda: 'EUR', tipo_cambio: '1290.125' })
  })

  it('otra moneda no se completa y lo avisa', () => {
    const leido = leerQrDeArca(qr({ ...FACTURA_A, moneda: '012', ctz: 300 }))
    expect(leido.valido && leido.datos.moneda).toBeNull()
    expect(leido.valido && leido.datos.tipo_cambio).toBeNull()
    expect(leido.valido && leido.avisos).toEqual([AVISO_OTRA_MONEDA])
  })

  it.each([3, 8, 21, 11])(
    'una nota de crédito u otro tipo (%i) no completa la letra y lo avisa',
    (tipoCmp) => {
      const leido = leerQrDeArca(qr({ ...FACTURA_A, tipoCmp }))
      expect(leido.valido && leido.datos.tipo).toBeNull()
      expect(leido.valido && leido.avisos).toEqual([AVISO_OTRO_TIPO])
      expect(AVISO_OTRO_TIPO).toBe(
        'Este comprobante es una nota de crédito u otro tipo; por ahora se cargan facturas A, B y E.',
      )
    },
  )

  it('acepta el dominio de ARCA y los números como texto', () => {
    expect(
      datos(
        qr(
          {
            ...FACTURA_A,
            ptoVta: '00002',
            nroCmp: '00000046',
            importe: '150.5',
          },
          'https://www.arca.gob.ar/fe/qr/?p=',
        ),
      ),
    ).toMatchObject({ punto_venta: 2, numero: 46, importe: '150.50' })
  })

  it('un "+" del base64 que la URL convirtió en espacio se recupera', () => {
    // "~~~" en base64 es "fn5+": tiene un "+".
    const json = JSON.stringify({ ...FACTURA_A, codAut: '~~~' })
    const base64 = btoa(json)
    expect(base64).toContain('+')
    const texto = `https://www.afip.gob.ar/fe/qr/?p=${base64.replace(/\+/g, ' ')}`

    expect(datos(texto).numero).toBe(45)
  })

  it('base64url sin relleno también se lee', () => {
    const base64url = btoa(JSON.stringify(FACTURA_A))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(decodificarBase64(base64url)).toBe(JSON.stringify(FACTURA_A))
  })

  it.each([
    ['otro sitio', `https://example.com/fe/qr/?p=${btoa('{}')}`],
    ['sin https', qr(FACTURA_A, 'http://www.afip.gob.ar/fe/qr/?p=')],
    [
      'un dominio que se hace pasar',
      qr(FACTURA_A, 'https://afip.gob.ar.example.com/fe/qr/?p='),
    ],
    ['texto que no es una URL', 'hola'],
  ])('%s no es un QR de ARCA', (_, texto) => {
    expect(leerQrDeArca(texto)).toEqual({
      valido: false,
      motivo: 'no_es_de_arca',
    })
  })

  it.each([
    ['sin el parámetro p', 'https://www.afip.gob.ar/fe/qr/'],
    ['base64 inválido', 'https://www.afip.gob.ar/fe/qr/?p=%%%no-es-base64'],
    [
      'base64 que no es JSON',
      `https://www.afip.gob.ar/fe/qr/?p=${btoa('no es json')}`,
    ],
    [
      'bytes que no son UTF-8',
      `https://www.afip.gob.ar/fe/qr/?p=${btoa('\xff\xfe')}`,
    ],
  ])('%s es ilegible', (_, texto) => {
    expect(leerQrDeArca(texto)).toEqual({ valido: false, motivo: 'ilegible' })
  })

  it.each([
    ['sin fecha', { ...FACTURA_A, fecha: undefined }],
    ['fecha con otra forma', { ...FACTURA_A, fecha: '20/10/2026' }],
    ['sin número', { ...FACTURA_A, nroCmp: undefined }],
    ['número con decimales', { ...FACTURA_A, nroCmp: 4.5 }],
    ['punto de venta en 0', { ...FACTURA_A, ptoVta: 0 }],
    ['punto de venta de 6 dígitos', { ...FACTURA_A, ptoVta: 100000 }],
    ['número de 9 dígitos', { ...FACTURA_A, nroCmp: 100000000 }],
    ['sin tipo', { ...FACTURA_A, tipoCmp: undefined }],
    ['importe en 0', { ...FACTURA_A, importe: 0 }],
    ['importe negativo', { ...FACTURA_A, importe: -10 }],
    ['sin moneda', { ...FACTURA_A, moneda: undefined }],
    ['un arreglo', [FACTURA_A]],
    ['null', null],
  ])('JSON incompleto: %s', (_, json) => {
    expect(leerQrDeArca(qr(json))).toEqual({
      valido: false,
      motivo: 'incompleto',
    })
  })
})

describe('completar el borrador con el QR', () => {
  const clientes = DATOS_SIMULADOS.clientes

  it('el receptor es un cliente: lo elige y los datos del QR pisan la sugerencia', () => {
    const borrador = borradorConQr(
      BORRADOR_VACIO,
      datos(qr(FACTURA_A)),
      clientes,
    )
    expect(borrador).toEqual({
      cliente_id: DON_EMILIO.id,
      tipo: 'A',
      punto_venta: '1',
      numero: '45',
      fecha_emision: '2026-10-20',
      moneda: 'ARS',
      importe: '12100.00',
      tipo_cambio: '',
    })
  })

  it('el CUIT del cliente se compara sin guiones', () => {
    const conGuiones = [{ ...DON_EMILIO, cuit_o_tax_id: '20-30521189-4' }]
    expect(clientePorDocumento(conGuiones, '20305211894')?.id).toBe(
      DON_EMILIO.id,
    )
    expect(clientePorDocumento(conGuiones, null)).toBeUndefined()
    expect(clientePorDocumento(conGuiones, '20111111112')).toBeUndefined()
  })

  it('sin cliente para el receptor queda el que estaba elegido', () => {
    const elegido = { ...BORRADOR_VACIO, cliente_id: BEE_KINGDOM.id }
    const borrador = borradorConQr(
      elegido,
      datos(
        qr({
          ...FACTURA_A,
          tipoCmp: 19,
          moneda: 'DOL',
          ctz: 1180.5,
          nroDocRec: 55000002126,
        }),
      ),
      clientes,
    )
    expect(borrador).toMatchObject({
      cliente_id: BEE_KINGDOM.id,
      tipo: 'E',
      moneda: 'USD',
      tipo_cambio: '1180.5',
    })
  })

  it('una nota de crédito deja la letra sin elegir aunque el cliente sugiera una', () => {
    const borrador = borradorConQr(
      BORRADOR_VACIO,
      datos(qr({ ...FACTURA_A, tipoCmp: 3 })),
      clientes,
    )
    expect(borrador.cliente_id).toBe(DON_EMILIO.id)
    expect(borrador.tipo).toBe('')
  })
})

describe('alta pedida por la URL (desde el pedido)', () => {
  it('lee el cliente y la moneda; una moneda desconocida se ignora', () => {
    expect(
      leerAltaDeLaUrl(
        new URLSearchParams({ alta: '1', cliente: 'c1', moneda: 'USD' }),
      ),
    ).toEqual({ cliente_id: 'c1', moneda: 'USD' })
    expect(
      leerAltaDeLaUrl(new URLSearchParams({ alta: '1', moneda: 'BTC' })),
    ).toEqual({ cliente_id: undefined, moneda: undefined })
    expect(leerAltaDeLaUrl(new URLSearchParams({ cliente: 'c1' }))).toBeNull()
  })

  it('arma la URL con el cliente y la moneda del pedido', () => {
    const url = urlParaRegistrarFactura({ cliente_id: 'c-1', moneda: 'EUR' })
    expect(url).toBe('/ventas/comprobantes?alta=1&cliente=c-1&moneda=EUR')
  })

  it('el borrador inicial trae la letra del cliente y la moneda si la admite', () => {
    const clientes = DATOS_SIMULADOS.clientes
    expect(
      borradorInicial({ cliente_id: BEE_KINGDOM.id, moneda: 'EUR' }, clientes),
    ).toMatchObject({ cliente_id: BEE_KINGDOM.id, tipo: 'E', moneda: 'EUR' })
    // Un cliente nacional no factura en dólares: queda en pesos.
    expect(
      borradorInicial({ cliente_id: DON_EMILIO.id, moneda: 'USD' }, clientes),
    ).toMatchObject({ tipo: 'A', moneda: 'ARS' })
    expect(borradorInicial({ cliente_id: 'otro' }, clientes)).toEqual(
      BORRADOR_VACIO,
    )
    expect(borradorInicial(undefined, clientes)).toEqual(BORRADOR_VACIO)
  })
})

describe('detalle', () => {
  const yo = {
    email: 'ventas@malka.test',
    roles: ['ventas' as const],
    tenantId: 't',
    sub: '6c1e9d2a-0b7f-4d51-9a3e-2f8c4b7a1d00',
  }

  it('quién lo cargó: "vos" si es el usuario actual, nunca el sub de otro', () => {
    expect(quienLoCargo(yo.sub, yo)).toBe('vos')
    expect(quienLoCargo('ventas@malka.test', yo)).toBe('vos')
    expect(quienLoCargo('b2d7c3a1-1111-4222-8333-944455556666', yo)).toBe(
      'otra persona del equipo',
    )
    expect(quienLoCargo('admin@tenant-a.malka.test', null)).toBe(
      'admin@tenant-a.malka.test',
    )
  })

  it('el documento del cliente: CUIT con guiones o tax id tal cual', () => {
    expect(documentoDelCliente(DON_EMILIO)).toBe('CUIT 20-30521189-4')
    expect(documentoDelCliente(MIEL_DEL_DELTA)).toBe('CUIT 27-23456789-1')
    expect(documentoDelCliente(BEE_KINGDOM)).toBe('Tax ID NZ-9429038')
  })
})

describe('pdf.js con la CSP de producción', () => {
  it.each(['pdf.mjs', 'pdf.worker.min.mjs'])(
    '%s no usa eval ni new Function (script-src sin unsafe-eval)',
    (archivo) => {
      const codigo = readFileSync(
        new URL(`../node_modules/pdfjs-dist/build/${archivo}`, import.meta.url),
        'utf8',
      )
      expect(codigo).not.toMatch(/\bnew Function\(|[^.\w]eval\(/)
    },
  )
})
