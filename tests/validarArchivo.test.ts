import { describe, expect, it } from 'vitest'
import { validarArchivo } from '../src/documentos/validarArchivo'

describe('validarArchivo', () => {
  it('acepta un PDF chico', () => {
    const pdf = new File(['abc'], 'doc.pdf', { type: 'application/pdf' })
    expect(validarArchivo(pdf)).toBeNull()
  })

  it('acepta JPG y PNG', () => {
    const jpg = new File(['abc'], 'foto.jpg', { type: 'image/jpeg' })
    const png = new File(['abc'], 'foto.png', { type: 'image/png' })
    expect(validarArchivo(jpg)).toBeNull()
    expect(validarArchivo(png)).toBeNull()
  })

  it('rechaza tipos no permitidos', () => {
    const exe = new File(['abc'], 'troyano.exe', {
      type: 'application/x-msdownload',
    })
    expect(validarArchivo(exe)).toContain('no permitido')
  })

  it('rechaza tamaños por encima del máximo', () => {
    const pesado = new File(['abc'], 'grande.pdf', { type: 'application/pdf' })
    Object.defineProperty(pesado, 'size', { value: 11 * 1024 * 1024 })
    expect(validarArchivo(pesado)).toContain('10 MB')
  })
})
