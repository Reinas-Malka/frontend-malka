// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '../src/api/client'
import type { components } from '../src/api/esquema'
import { recursoSimulado, type Recurso } from '../src/api/recurso'
import type { Rol } from '../src/auth/identidad'
import { ProveedorDeSesionFijo } from '../src/auth/sesion'
import { PaginaCatalogo } from '../src/components/catalogo/PaginaCatalogo'
import { catalogoClientes } from '../src/modulos/ventas/catalogos'
import type { Cliente, CondicionIva } from '../src/tipos/dominio'

type Esquemas = components['schemas']
type RecursoClientes = Recurso<
  Cliente,
  Esquemas['ClienteCrear'],
  Esquemas['ClienteActualizar']
>

// El Select de Radix usa APIs de puntero y scroll que jsdom no implementa.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
})

const semilla: Cliente[] = [
  {
    id: 'c1',
    nombre: 'Apícola Don Emilio',
    pais: 'AR',
    tipo: 'nacional',
    condicion_iva: 'responsable_inscripto',
    cuit_o_tax_id: '20305211894',
    activo: true,
    tipo_documento_por_defecto: 'factura_a',
  },
  {
    id: 'c2',
    nombre: 'Bee Kingdom NZ Ltd',
    pais: 'NZ',
    tipo: 'exportacion',
    condicion_iva: 'cliente_exterior',
    cuit_o_tax_id: 'NZ-9429038',
    activo: true,
    tipo_documento_por_defecto: 'factura_e',
  },
]

// En la API real la factura sugerida la calcula el backend.
const facturaDe = (c: CondicionIva): Cliente['tipo_documento_por_defecto'] =>
  c === 'cliente_exterior'
    ? 'factura_e'
    : c === 'responsable_inscripto'
      ? 'factura_a'
      : 'factura_b'

const recursoEnMemoria = (): RecursoClientes =>
  recursoSimulado(semilla, (d, id) => ({
    id,
    ...d,
    activo: true,
    tipo_documento_por_defecto: facturaDe(d.condicion_iva),
  }))

function montar(
  recurso: RecursoClientes = recursoEnMemoria(),
  rol: Rol = 'ventas',
) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <ProveedorDeSesionFijo
      identidad={{ email: `${rol}@malka.test`, roles: [rol], tenantId: 't' }}
    >
      <QueryClientProvider client={cliente}>
        <PaginaCatalogo config={{ ...catalogoClientes, recurso }} />
      </QueryClientProvider>
    </ProveedorDeSesionFijo>,
  )
  return userEvent.setup()
}

type Usuario = ReturnType<typeof userEvent.setup>

async function elegir(usuario: Usuario, campo: string, opcion: string) {
  await usuario.click(screen.getByRole('combobox', { name: campo }))
  await usuario.click(await screen.findByRole('option', { name: opcion }))
}

const filaDe = async (nombre: string) =>
  (await screen.findByRole('cell', { name: nombre })).closest(
    'tr',
  ) as HTMLElement

afterEach(cleanup)

describe('clientes', () => {
  it('da de alta un nacional: rechaza un CUIT inválido y sugiere factura A', async () => {
    const usuario = montar()
    await usuario.click(
      await screen.findByRole('button', { name: /agregar cliente/i }),
    )

    // Nacional: no se pregunta el país (es AR) y sí la condición de IVA.
    expect(screen.queryByRole('combobox', { name: 'País' })).toBeNull()
    await usuario.type(
      screen.getByLabelText('Nombre o razón social'),
      'Granja Norte',
    )
    await elegir(
      usuario,
      'Condición frente al IVA',
      'Responsable inscripto (Factura A)',
    )
    await usuario.type(screen.getByLabelText('CUIT o Tax ID'), '20-12345678-7')
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El CUIT no es válido.')).toBeTruthy()

    await usuario.clear(screen.getByLabelText('CUIT o Tax ID'))
    await usuario.type(screen.getByLabelText('CUIT o Tax ID'), '20-12345678-6')
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

    const fila = await filaDe('Granja Norte')
    expect(within(fila).getByRole('cell', { name: 'Nacional' })).toBeTruthy()
    // Se guarda sin guiones, como en el backend.
    expect(within(fila).getByRole('cell', { name: '20123456786' })).toBeTruthy()
    expect(within(fila).getByRole('cell', { name: 'A' })).toBeTruthy()
  })

  it('da de alta uno de exportación: país sin AR, tax id libre y factura E', async () => {
    const usuario = montar()
    await usuario.click(
      await screen.findByRole('button', { name: /agregar cliente/i }),
    )

    await usuario.type(
      screen.getByLabelText('Nombre o razón social'),
      'Bienenzucht GmbH',
    )
    await elegir(usuario, 'Tipo de cliente', 'Exportación')

    // Exportación: se pregunta el país y la condición es siempre exterior.
    expect(
      screen.queryByRole('combobox', { name: 'Condición frente al IVA' }),
    ).toBeNull()
    await usuario.click(screen.getByRole('combobox', { name: 'País' }))
    expect(screen.queryByRole('option', { name: /Argentina/ })).toBeNull()
    await usuario.click(screen.getByRole('option', { name: 'Alemania (DE)' }))

    await usuario.type(screen.getByLabelText('CUIT o Tax ID'), 'DE 123/456-789')
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

    const fila = await filaDe('Bienenzucht GmbH')
    expect(
      within(fila).getByRole('cell', { name: 'Exportación · Alemania (DE)' }),
    ).toBeTruthy()
    expect(
      within(fila).getByRole('cell', { name: 'DE 123/456-789' }),
    ).toBeTruthy()
    expect(within(fila).getByRole('cell', { name: 'E' })).toBeTruthy()
  })

  it('exportación sin país no se guarda', async () => {
    const usuario = montar()
    await usuario.click(
      await screen.findByRole('button', { name: /agregar cliente/i }),
    )

    await usuario.type(
      screen.getByLabelText('Nombre o razón social'),
      'Sin país',
    )
    await elegir(usuario, 'Tipo de cliente', 'Exportación')
    await usuario.type(screen.getByLabelText('CUIT o Tax ID'), 'X-1')
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('País es obligatorio.')).toBeTruthy()
    expect(screen.queryByRole('cell', { name: 'Sin país' })).toBeNull()
  })

  it('con pedidos no cambia de tipo: el 409 se muestra en el tipo de cliente', async () => {
    const recurso: RecursoClientes = {
      ...recursoEnMemoria(),
      actualizar: async () => {
        throw new ApiError({
          status: 409,
          codigo: 'cliente_con_pedidos',
          mensaje:
            'El cliente tiene pedidos: no puede cambiar entre nacional y exportacion.',
        })
      },
    }
    const usuario = montar(recurso)
    await usuario.click(
      within(await filaDe('Apícola Don Emilio')).getByRole('button', {
        name: 'Editar Apícola Don Emilio',
      }),
    )

    await elegir(usuario, 'Tipo de cliente', 'Exportación')
    // El país arranca vacío: el AR del nacional no se hereda.
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('País es obligatorio.')).toBeTruthy()

    await elegir(usuario, 'País', 'Uruguay (UY)')
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

    const tipo = screen.getByRole('combobox', { name: 'Tipo de cliente' })
    await waitFor(() =>
      expect(tipo.getAttribute('aria-describedby')).toBe('campo-tipo-error'),
    )
    expect(document.getElementById('campo-tipo-error')?.textContent).toMatch(
      /tiene pedidos/,
    )
    // Va en el campo, no en el recuadro general del formulario.
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('busca por el nombre del país', async () => {
    const usuario = montar()
    await screen.findByRole('cell', { name: 'Apícola Don Emilio' })

    await usuario.type(
      screen.getByRole('searchbox', { name: /buscar/i }),
      'zelanda',
    )

    expect(
      screen.queryByRole('cell', { name: 'Apícola Don Emilio' }),
    ).toBeNull()
    expect(
      screen.getByRole('cell', { name: 'Bee Kingdom NZ Ltd' }),
    ).toBeTruthy()
  })

  it('producción solo lee: sin alta ni edición', async () => {
    montar(recursoEnMemoria(), 'produccion')

    expect(
      await screen.findByRole('cell', { name: 'Apícola Don Emilio' }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /agregar cliente/i }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull()
  })
})
