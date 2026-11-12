// @vitest-environment jsdom
// Prueba del 07/11: "Ítems vendibles" no se entendía (ahora Productos) y el
// banco dejaba editar la capacidad y pedía el identificador.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { recursoSimulado, type Recurso } from '../src/api/recurso'
import { NAVEGACION } from '../src/app/navegacion'
import type { Rol } from '../src/auth/identidad'
import { ProveedorDeSesionFijo } from '../src/auth/sesion'
import {
  PaginaCatalogo,
  type ConfigCatalogo,
} from '../src/components/catalogo/PaginaCatalogo'
import { siguienteIdentificadorDeBanco } from '../src/lib/bancos'
import { capitalizar } from '../src/lib/textos'
import { catalogoBancos } from '../src/modulos/produccion/catalogos'
import { catalogoItemsVendibles } from '../src/modulos/ventas/catalogos'
import type {
  Banco,
  BancoActualizar,
  BancoCrear,
  ItemVendible,
} from '../src/tipos/dominio'

afterEach(cleanup)

function montar<T extends { id: string; activo: boolean }, C, A>(
  config: ConfigCatalogo<T, C, A>,
  roles: Rol[] = ['admin'],
) {
  render(
    <ProveedorDeSesionFijo
      identidad={{ email: 'x@malka.test', roles, tenantId: 't' }}
    >
      <QueryClientProvider client={new QueryClient()}>
        <PaginaCatalogo config={config} />
      </QueryClientProvider>
    </ProveedorDeSesionFijo>,
  )
  return userEvent.setup()
}

describe('capitalizar', () => {
  it('pone la primera letra en mayúscula y deja el resto', () => {
    expect(capitalizar('reina fecundada')).toBe('Reina fecundada')
    expect(capitalizar('élite')).toBe('Élite')
    expect(capitalizar('Reina F1')).toBe('Reina F1')
    expect(capitalizar('')).toBe('')
  })
})

describe('Productos (antes "Ítems vendibles")', () => {
  const items: ItemVendible[] = [
    { id: 'i1', nombre: 'reina fecundada', alicuota: '0.21', activo: true },
  ]

  it('el menú y la pantalla dicen Productos, con la explicación', async () => {
    const ventas = NAVEGACION.find((g) => g.titulo === 'Ventas')!
    expect(ventas.enlaces.map((e) => e.texto)).toContain('Productos')
    expect(ventas.enlaces.map((e) => e.texto)).not.toContain('Ítems vendibles')

    montar({
      ...catalogoItemsVendibles,
      recurso: recursoSimulado(items, () => items[0]),
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Productos' }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        /Los nombres con los que vendés las reinas, por ejemplo Reina fecundada o Reina virgen; cada línea de un pedido lleva un producto y una raza/,
      ),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Agregar producto' }),
    ).toBeTruthy()
  })

  it('muestra el nombre con mayúscula inicial sin cambiar el dato', async () => {
    const usuario = montar({
      ...catalogoItemsVendibles,
      recurso: recursoSimulado(items, () => items[0]),
    })

    expect(
      await screen.findByRole('cell', { name: 'Reina fecundada' }),
    ).toBeTruthy()
    // Al editar, el dato tal cual se cargó.
    await usuario.click(
      screen.getByRole('button', { name: 'Editar Reina fecundada' }),
    )
    const dialogo = within(await screen.findByRole('dialog'))
    expect((dialogo.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
      'reina fecundada',
    )
  })
})

describe('Bancos: identificador automático y capacidad fija', () => {
  const semilla: Banco[] = [
    {
      id: 'b1',
      identificador: 'B-01',
      capacidad_max: 276,
      reinas_en_banco: 40,
      activo: true,
    },
  ]

  function conEspias() {
    const base = recursoSimulado<Banco, BancoCrear, BancoActualizar>(
      semilla,
      (d, id, existentes) => ({
        id,
        identificador:
          d.identificador ?? siguienteIdentificadorDeBanco(existentes),
        capacidad_max: d.capacidad_max ?? 276,
        reinas_en_banco: 0,
        activo: true,
      }),
    )
    const crear = vi.fn(base.crear)
    const actualizar = vi.fn(base.actualizar)
    const recurso: Recurso<Banco, BancoCrear, BancoActualizar> = {
      ...base,
      crear,
      actualizar,
    }
    return { recurso, crear, actualizar }
  }

  it('la capacidad se muestra, pero no se pide ni en el alta ni al editar', async () => {
    const { recurso, crear } = conEspias()
    const usuario = montar({ ...catalogoBancos, recurso })

    expect(await screen.findByRole('cell', { name: '276 reinas' })).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Agregar banco' }))
    const alta = within(await screen.findByRole('dialog'))
    // Ni identificador ni capacidad: los pone el sistema, y lo explica.
    expect(alta.queryByRole('textbox')).toBeNull()
    expect(alta.queryByLabelText(/capacidad/i)).toBeNull()
    expect(
      alta.getByText(
        /siguiente identificador \(B-01, B-02…\) y capacidad para 276 reinas/,
      ),
    ).toBeTruthy()
    await usuario.click(alta.getByRole('button', { name: 'Guardar' }))

    // Se manda vacío: el backend asigna B-NN y 276.
    expect(crear).toHaveBeenCalledWith({}, expect.any(String))
    expect(await screen.findByRole('cell', { name: 'B-02' })).toBeTruthy()
  })

  it('al editar solo se renombra: nunca viaja capacidad_max', async () => {
    const { recurso, actualizar } = conEspias()
    const usuario = montar({ ...catalogoBancos, recurso })

    await usuario.click(
      await screen.findByRole('button', { name: 'Editar B-01' }),
    )
    const edicion = within(await screen.findByRole('dialog'))
    expect(edicion.queryByLabelText(/capacidad/i)).toBeNull()
    const identificador = edicion.getByLabelText('Identificador')
    await usuario.clear(identificador)
    await usuario.type(identificador, 'Banco del galpón')
    await usuario.click(edicion.getByRole('button', { name: 'Guardar' }))

    expect(actualizar).toHaveBeenCalledWith('b1', {
      identificador: 'Banco del galpón',
    })
  })
})

describe('identificador B-NN de la simulación (misma regla que el backend)', () => {
  it('el número más alto de la serie más uno, sin rellenar huecos', () => {
    expect(siguienteIdentificadorDeBanco([])).toBe('B-01')
    expect(
      siguienteIdentificadorDeBanco([
        { identificador: 'B-01' },
        { identificador: 'B-07' },
        { identificador: 'Banco norte' },
        { identificador: 'B-7a' },
      ]),
    ).toBe('B-08')
    expect(siguienteIdentificadorDeBanco([{ identificador: 'B-99' }])).toBe(
      'B-100',
    )
  })
})
