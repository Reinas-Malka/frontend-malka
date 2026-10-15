import { describe, expect, it } from 'vitest'
import { recursoSimulado } from '../src/api/recurso'

type Raza = { id: string; nombre: string; activo: boolean }
type RazaCrear = { nombre: string }

const semilla: Raza[] = Array.from({ length: 5 }, (_, i) => ({
  id: `r${i}`,
  nombre: `Raza ${i}`,
  activo: true,
}))

const nuevo = () =>
  recursoSimulado<Raza, RazaCrear, Partial<RazaCrear>>(semilla, (datos, id) => ({
    id,
    activo: true,
    ...datos,
  }))

describe('recursoSimulado', () => {
  it('pagina con cursor como el backend', async () => {
    const razas = nuevo()

    const primera = await razas.listar({ limite: 2 })
    const segunda = await razas.listar({ limite: 2, cursor: primera.siguiente ?? undefined })
    const ultima = await razas.listar({ limite: 2, cursor: segunda.siguiente ?? undefined })

    expect(primera.items.map((r) => r.id)).toEqual(['r0', 'r1'])
    expect(segunda.items.map((r) => r.id)).toEqual(['r2', 'r3'])
    expect(ultima.items.map((r) => r.id)).toEqual(['r4'])
    expect(ultima.siguiente).toBeNull()
  })

  it('da de alta, edita y da de baja sin tocar la semilla', async () => {
    const razas = nuevo()

    const creada = await razas.crear({ nombre: 'Buckfast' })
    const editada = await razas.actualizar(creada.id, { nombre: 'Buckfast F1' })
    await razas.desactivar(creada.id)

    expect(editada.nombre).toBe('Buckfast F1')
    expect((await razas.obtener(creada.id)).activo).toBe(false)
    expect(semilla).toHaveLength(5)
  })

  it('un id inexistente responde como el backend: 404', async () => {
    await expect(nuevo().obtener('no-existe')).rejects.toMatchObject({
      status: 404,
      codigo: 'no_encontrado',
    })
  })
})
