// @vitest-environment jsdom
// Prueba del 07/11: "Aparece este error cuando se ingresa una raza
// duplicada: Error del sistema / raza_duplicada · <request id>". Un dato
// duplicado no es una falla del sistema: va el mensaje solo, en su campo.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ApiError,
  describirError,
  detalleTecnico,
  esErrorEsperable,
} from '../src/api/client'
import { recursoSimulado } from '../src/api/recurso'
import { ProveedorDeSesionFijo } from '../src/auth/sesion'
import { PaginaCatalogo } from '../src/components/catalogo/PaginaCatalogo'
import { ErrorDePantalla } from '../src/components/ui/estados'
import { catalogoRazas } from '../src/modulos/produccion/catalogos'
import type { Raza } from '../src/tipos/dominio'

afterEach(cleanup)

const duplicada = new ApiError({
  status: 409,
  codigo: 'raza_duplicada',
  mensaje: 'Ya hay una raza con ese nombre.',
  requestId: 'GccM1hV6oAMESVQ=',
})
const interno = new ApiError({
  status: 500,
  codigo: 'error_interno',
  mensaje: 'Falló la base.',
  requestId: 'req-77',
})

describe('qué error es esperable', () => {
  it('un *_duplicado y los 4xx sí; los 5xx y los de red no', () => {
    expect(esErrorEsperable(duplicada)).toBe(true)
    expect(
      esErrorEsperable(
        new ApiError({ codigo: 'banco_duplicado', mensaje: 'x', status: null }),
      ),
    ).toBe(true)
    expect(
      esErrorEsperable(
        new ApiError({ status: 409, codigo: 'banco_lleno', mensaje: 'x' }),
      ),
    ).toBe(true)
    expect(esErrorEsperable(interno)).toBe(false)
    expect(
      esErrorEsperable(
        new ApiError({ codigo: 'tiempo_agotado', mensaje: 'x', status: null }),
      ),
    ).toBe(false)
    expect(esErrorEsperable(new Error('red'))).toBe(false)
  })

  it('el esperable se describe sin código ni request id', () => {
    expect(describirError(duplicada)).toEqual({
      mensaje: 'Ya hay una raza con ese nombre.',
      esperable: true,
    })
    expect(detalleTecnico(duplicada)).toBeNull()
    expect(describirError(interno)).toMatchObject({
      codigo: 'error_interno',
      requestId: 'req-77',
    })
    expect(detalleTecnico(interno)).toBe('error_interno · req-77')
  })

  it('ErrorDePantalla muestra el esperable sin códigos ni "reportalo"', () => {
    render(<ErrorDePantalla error={describirError(duplicada)} />)
    const alerta = screen.getByRole('alert')
    expect(alerta.textContent).toBe('Ya hay una raza con ese nombre.')
    cleanup()

    render(<ErrorDePantalla error={describirError(interno)} />)
    expect(screen.getByRole('alert').textContent).toContain('req-77')
  })
})

type Config = typeof catalogoRazas
type RazaCrear = ReturnType<Config['aCrear']>
type RazaActualizar = ReturnType<Config['aActualizar']>

function montarConAltaQueFalla(error: unknown, config: Config = catalogoRazas) {
  const base = recursoSimulado<Raza, RazaCrear, RazaActualizar>(
    [{ id: 'r1', nombre: 'Carniola', descripcion: null, activo: true }],
    (d, id) => ({
      id,
      nombre: d.nombre,
      descripcion: d.descripcion ?? null,
      activo: true,
    }),
  )
  render(
    <ProveedorDeSesionFijo
      identidad={{ email: 'x@malka.test', roles: ['admin'], tenantId: 't' }}
    >
      <QueryClientProvider client={new QueryClient()}>
        <PaginaCatalogo
          config={{
            ...config,
            recurso: { ...base, crear: () => Promise.reject(error) },
          }}
        />
      </QueryClientProvider>
    </ProveedorDeSesionFijo>,
  )
  return userEvent.setup()
}

async function altaDeCarniola(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(
    await screen.findByRole('button', { name: 'Agregar raza' }),
  )
  const dialogo = within(await screen.findByRole('dialog'))
  await usuario.type(dialogo.getByLabelText('Nombre'), 'Carniola')
  await usuario.click(dialogo.getByRole('button', { name: 'Guardar' }))
  return dialogo
}

describe('formulario de catálogo ante un dato duplicado', () => {
  it('la raza duplicada va debajo del nombre, sin código ni request id', async () => {
    const usuario = montarConAltaQueFalla(duplicada)
    const dialogo = await altaDeCarniola(usuario)

    const campo = dialogo.getByLabelText('Nombre')
    expect(
      await dialogo.findByText('Ya hay una raza con ese nombre.'),
    ).toBeTruthy()
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    const texto = document.body.textContent ?? ''
    expect(texto).not.toContain('raza_duplicada')
    expect(texto).not.toContain('GccM1hV6oAMESVQ=')
    // Un solo aviso: el del campo, no uno general arriba de los botones.
    expect(dialogo.getAllByRole('alert').map((a) => a.id)).toEqual([
      'campo-nombre-error',
    ])
  })

  it('un duplicado que ningún campo declara va arriba, también sin código', async () => {
    const sinCampo: Config = {
      ...catalogoRazas,
      campos: catalogoRazas.campos.map((c) => ({
        ...c,
        codigosDeError: undefined,
      })),
    }
    const usuario = montarConAltaQueFalla(duplicada, sinCampo)
    const dialogo = await altaDeCarniola(usuario)

    expect((await dialogo.findByRole('alert')).textContent).toBe(
      'Ya hay una raza con ese nombre.',
    )
  })

  it('un 500 sí muestra el código y el request id para reportarlo', async () => {
    const usuario = montarConAltaQueFalla(interno)
    const dialogo = await altaDeCarniola(usuario)

    const alerta = await dialogo.findByRole('alert')
    expect(alerta.textContent).toContain('Falló la base.')
    expect(alerta.textContent).toContain('error_interno · req-77')
  })
})
