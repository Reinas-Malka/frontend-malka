import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/api/client'
import { debeReintentar } from '../src/app/consultas'
import {
  erroresDelBackend,
  validarValores,
  type Campo,
} from '../src/components/catalogo/campos'

const CAMPOS: Campo[] = [
  { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, max: 5 },
  {
    nombre: 'capacidad',
    etiqueta: 'Capacidad',
    tipo: 'numero',
    min: 1,
    max: 10,
  },
  {
    nombre: 'pais',
    etiqueta: 'País',
    requerido: true,
    visible: (v) => v.tipo === 'exportacion',
  },
  {
    nombre: 'tipo',
    etiqueta: 'Tipo',
    tipo: 'seleccion',
    codigosDeError: ['cliente_con_pedidos'],
    opciones: () => [
      { valor: 'nacional', etiqueta: 'Nacional' },
      { valor: 'exportacion', etiqueta: 'Exportación' },
    ],
  },
]

describe('validarValores', () => {
  it('marca obligatorios, largo máximo y rango numérico', () => {
    expect(
      validarValores(CAMPOS, { nombre: '', capacidad: '11', tipo: 'nacional' }),
    ).toEqual({
      nombre: 'Nombre es obligatorio.',
      capacidad: 'Capacidad no puede ser mayor a 10.',
    })
    expect(
      validarValores(CAMPOS, { nombre: 'Carniola', tipo: 'nacional' }).nombre,
    ).toMatch(/hasta 5/)
    expect(
      validarValores(CAMPOS, { nombre: 'A', capacidad: 'x', tipo: 'nacional' })
        .capacidad,
    ).toMatch(/número/)
  })

  it('un campo oculto no bloquea; visible, sí', () => {
    expect(validarValores(CAMPOS, { nombre: 'A', tipo: 'nacional' })).toEqual(
      {},
    )
    expect(
      validarValores(CAMPOS, { nombre: 'A', tipo: 'exportacion' }),
    ).toEqual({ pais: 'País es obligatorio.' })
  })

  it('una selección fuera de las opciones es inválida', () => {
    expect(validarValores(CAMPOS, { nombre: 'A', tipo: 'otro' }).tipo).toMatch(
      /opción válida/,
    )
  })
})

describe('erroresDelBackend', () => {
  it('asigna cada error del 422 a su campo por el último segmento', () => {
    const error = new ApiError({
      status: 422,
      codigo: 'validacion',
      mensaje: 'Los datos enviados no son validos.',
      detalles: {
        campos: [
          {
            campo: 'body.nombre',
            mensaje: 'Muy largo',
            tipo: 'string_too_long',
          },
          { campo: 'body.desconocido', mensaje: 'x', tipo: 'x' },
        ],
      },
    })

    expect(erroresDelBackend(error, CAMPOS)).toEqual({ nombre: 'Muy largo' })
  })

  it('sin details.campos no inventa errores de campo', () => {
    expect(
      erroresDelBackend(
        new ApiError({ codigo: 'conflicto', mensaje: 'Ya existe.' }),
        CAMPOS,
      ),
    ).toEqual({})
    expect(erroresDelBackend(new Error('otro'), CAMPOS)).toEqual({})
  })

  it('un código declarado en codigosDeError va a ese campo', () => {
    const error = new ApiError({
      status: 409,
      codigo: 'cliente_con_pedidos',
      mensaje: 'El cliente tiene pedidos: no puede cambiar de tipo.',
    })

    expect(erroresDelBackend(error, CAMPOS)).toEqual({
      tipo: 'El cliente tiene pedidos: no puede cambiar de tipo.',
    })
  })
})

describe('debeReintentar (lecturas)', () => {
  const error = (status: number | null, codigo = 'x') =>
    new ApiError({ status, codigo, mensaje: '' })

  it('reintenta sin conexión y 5xx, hasta dos veces', () => {
    expect(debeReintentar(0, error(null, 'sin_conexion'))).toBe(true)
    expect(debeReintentar(1, error(503))).toBe(true)
    expect(debeReintentar(2, error(503))).toBe(false)
  })

  it('no reintenta 4xx, falta de configuración ni errores ajenos a la API', () => {
    expect(debeReintentar(0, error(404))).toBe(false)
    expect(debeReintentar(0, error(422))).toBe(false)
    expect(debeReintentar(0, error(null, 'sin_configuracion'))).toBe(false)
    expect(debeReintentar(0, new Error('bug'))).toBe(false)
  })
})
