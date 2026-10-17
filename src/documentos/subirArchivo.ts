// Sube un archivo a S3 y devuelve su key (la que el backend registra como
// archivo_s3_key). Pide la URL prefirmada, sube directo y, si la URL venció,
// pide otra y reintenta una sola vez: el archivo no cambió.

import { pedirSubida } from '@/api/documentos'
import { usaDatosSimulados } from '@/datos/cliente'
import {
  esUrlVencida,
  subirPorUrlPrefermada,
} from '@/documentos/subirPorUrlPrefermada'

type AlAvanzar = (progreso: number) => void

async function subirUnaVez(archivo: File, alAvanzar: AlAvanzar) {
  const subida = await pedirSubida({
    nombre: archivo.name,
    tipo: archivo.type,
    tamano: archivo.size,
  })
  alAvanzar(0)
  await subirPorUrlPrefermada(subida, archivo, alAvanzar)
  return subida.clave
}

/** La key de la demo: bajo el prefijo del criadero, como la arma el backend
 *  (documentos/<tenant_id>/...) y como exige el CHECK de la migración 0010. */
export function claveSimulada(tenantId: string, nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
  return `documentos/${tenantId}/${crypto.randomUUID()}-${limpio}`
}

export async function subirArchivo(
  archivo: File,
  { tenantId, alAvanzar }: { tenantId: string; alAvanzar: AlAvanzar },
): Promise<string> {
  if (usaDatosSimulados(import.meta.env.VITE_DATOS_SIMULADOS)) {
    alAvanzar(100)
    return claveSimulada(tenantId, archivo.name)
  }
  try {
    return await subirUnaVez(archivo, alAvanzar)
  } catch (error) {
    if (!esUrlVencida(error)) throw error
    return subirUnaVez(archivo, alAvanzar)
  }
}
