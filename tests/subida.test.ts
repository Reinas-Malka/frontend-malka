import { describe, expect, it } from 'vitest'
import {
  ErrorDeSubida,
  esUrlVencida,
} from '../src/documentos/subirPorUrlPrefermada'

describe('esUrlVencida', () => {
  it('es true cuando S3 rechaza con 403 (firmas vencidas)', () => {
    expect(esUrlVencida(new ErrorDeSubida('S3 rechazó la subida.', 403))).toBe(
      true,
    )
  })

  it('es false ante otros estados: reintentar no serviría de nada', () => {
    expect(esUrlVencida(new ErrorDeSubida('S3 rechazó la subida.', 500))).toBe(
      false,
    )
  })

  it('es false ante errores de red u otros errores', () => {
    expect(esUrlVencida(new ErrorDeSubida('Falló la conexión.', null))).toBe(
      false,
    )
    expect(esUrlVencida(new Error('otra cosa'))).toBe(false)
  })
})
