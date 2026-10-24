/** Movimientos de un material (backend #30). El stock no se guarda: es la
 *  suma de compras, consumos y ajustes (docs/dominio.md, "Materiales y
 *  consumo"). El consumo lo registra el alta de tanda; a mano entran solo
 *  compras y ajustes. Mismo esquema que api/embarques.ts: real y simulado
 *  con la misma firma, un solo swap por VITE_DATOS_SIMULADOS. */
import { request } from '@/api/client'
import type { components } from '@/api/esquema'
import type { Pagina } from '@/api/recurso'
import { usaDatosSimulados } from '@/datos/cliente'
import { DATOS_SIMULADOS } from '@/datos/simulados'
import type { MovimientoMaterial } from '@/tipos/dominio'

type Esquemas = components['schemas']
export type MovimientoCrear = Esquemas['MovimientoCrear']
export type MovimientoGuardado = Esquemas['MovimientoGuardado']

export interface ApiMovimientos {
  listar(materialId: string): Promise<Pagina<MovimientoMaterial>>
  registrar(
    materialId: string,
    datos: MovimientoCrear,
    claveIdempotencia?: string,
  ): Promise<MovimientoGuardado>
}

const LIMITE_MAXIMO = 100
const de = (id: string) =>
  `/api/v1/materiales/${encodeURIComponent(id)}/movimientos`

export function movimientosHttp(): ApiMovimientos {
  return {
    listar: (id) =>
      request<Pagina<MovimientoMaterial>>(de(id), {
        query: { limite: LIMITE_MAXIMO },
      }),
    registrar: (id, datos, claveIdempotencia) =>
      request<MovimientoGuardado>(de(id), {
        metodo: 'POST',
        cuerpo: datos,
        claveIdempotencia,
      }),
  }
}

/** En memoria para la demo: el stock sale de sumar los movimientos, como en
 *  el backend, y con stock negativo vuelve la misma advertencia. */
export function movimientosSimulados(
  semilla: readonly MovimientoMaterial[] = DATOS_SIMULADOS.movimientos,
): ApiMovimientos {
  let filas = semilla.map((m) => ({ ...m }))
  const stock = (id: string) =>
    filas
      .filter((m) => m.material_id === id)
      .reduce((total, m) => total + Number(m.cantidad), 0)
  return {
    listar: async (id) => ({
      items: filas
        .filter((m) => m.material_id === id)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
      siguiente: null,
    }),
    registrar: async (id, datos) => {
      const nuevo: MovimientoMaterial = {
        id: crypto.randomUUID(),
        material_id: id,
        tipo: datos.tipo,
        cantidad: String(datos.cantidad),
        tanda_id: null,
        motivo: datos.motivo ?? null,
        fecha: datos.fecha ?? new Date().toISOString().slice(0, 10),
      }
      filas = [...filas, nuevo]
      const total = stock(id)
      return {
        ...nuevo,
        stock: String(total),
        advertencias:
          total < 0
            ? [
                {
                  code: 'stock_negativo',
                  message: 'El stock del material quedó negativo.',
                  details: {},
                },
              ]
            : [],
      }
    },
  }
}

export const movimientos: ApiMovimientos = usaDatosSimulados(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
  ? movimientosSimulados()
  : movimientosHttp()
