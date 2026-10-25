/** Tandas (backend #27). No es un catálogo: no se edita ni se da de baja, y
 *  el alta devuelve más que la tanda (el consumo de cúpulas, el stock que
 *  queda y la advertencia de stock negativo). Mismo esquema que
 *  api/embarques.ts: real y simulado con la misma firma, un solo swap por
 *  VITE_DATOS_SIMULADOS. */
import { ApiError, request } from '@/api/client'
import type { Pagina } from '@/api/recurso'
import { usaDatosSimulados } from '@/datos/cliente'
import { DATOS_SIMULADOS } from '@/datos/simulados'
import { esDomingo, hoyEnArgentina } from '@/lib/fechas'
import {
    CUPULAS_POR_CUADRO,
    type Material,
    type Raza,
    type Tanda,
    type TandaCreada,
    type TandaCrear,
} from '@/tipos/dominio'

/** Filtros de GET /api/v1/tandas: raza y rango de fecha de traslarve. */
export type FiltrosDeTandas = {
    raza_id?: string
    desde?: string
    hasta?: string
}

export interface ApiTandas {
    listar(filtros?: FiltrosDeTandas): Promise<Pagina<Tanda>>
    obtener(id: string): Promise<Tanda>
    crear(datos: TandaCrear, claveIdempotencia?: string): Promise<TandaCreada>
}

const RUTA = '/api/v1/tandas'
const LIMITE_MAXIMO = 100

export function tandasHttp(): ApiTandas {
return {
    listar: (filtros = {}) =>
        request<Pagina<Tanda>>(RUTA, {
        query: { limite: LIMITE_MAXIMO, ...filtros },
    }),
    obtener: (id) => request<Tanda>(`${RUTA}/${encodeURIComponent(id)}`),
    crear: (datos, claveIdempotencia) =>
        request<TandaCreada>(RUTA, {
        metodo: 'POST',
        cuerpo: datos,
        claveIdempotencia,
    }),
}
}

const invalido = (codigo: string, mensaje: string, detalles = {}) =>
    new ApiError({ status: 422, codigo, mensaje, detalles })

/** En memoria para la demo sin backend. Repite las reglas del alta del
 *  backend (raza y material activos, domingo salvo retroactivo, una celda
 *  por cúpula y el descuento de cúpulas con su advertencia), así la
 *  pantalla se comporta igual que con la API. */
export function tandasSimuladas(
    semilla: readonly Tanda[] = DATOS_SIMULADOS.tandas,
    razas: readonly Raza[] = DATOS_SIMULADOS.razas,
    materiales: readonly Material[] = DATOS_SIMULADOS.materiales,
): ApiTandas {
    let tandas = semilla.map((t) => ({ ...t }))
    const stock = new Map(materiales.map((m) => [m.id, Number(m.stock)]))
    const porClave = new Map<string, TandaCreada>()

    const buscar = (id: string): Tanda => {
    const tanda = tandas.find((t) => t.id === id)
    if (!tanda)
        throw new ApiError({
        status: 404,
        codigo: 'tanda_no_encontrada',
        mensaje: 'No existe la tanda.',
    })
    return tanda
}

function crear(datos: TandaCrear): TandaCreada {
    if (esDomingo(datos.fecha_traslarve) && !datos.retroactivo)
    throw invalido(
        'fecha_no_laborable',
        'El traslarve no se hace los domingos. Si es la carga tardía de una tanda ya hecha, marcala como retroactiva.',
        { fecha_traslarve: datos.fecha_traslarve },
    )
    const raza = razas.find((r) => r.id === datos.raza_id)
    if (!raza?.activo)
    throw invalido(
        raza ? 'raza_inactiva' : 'raza_inexistente',
        'La raza no existe o está dada de baja.',
    )
    const material = materiales.find((m) => m.id === datos.material_id)
    if (!material?.activo)
    throw invalido(
        material ? 'material_inactivo' : 'material_inexistente',
        'El material no existe o está dado de baja.',
    )

    const cupulas = datos.cuadros * CUPULAS_POR_CUADRO
    const queda = (stock.get(material.id) ?? 0) - cupulas
    stock.set(material.id, queda)
    const tanda: Tanda = {
        id: crypto.randomUUID(),
        raza_id: datos.raza_id,
        madre_id: datos.madre_id ?? null,
        fecha_traslarve: datos.fecha_traslarve,
        retroactivo: datos.retroactivo ?? false,
        fila_continuadora: datos.fila_continuadora ?? null,
        posicion_continuadora: datos.posicion_continuadora ?? null,
        celdas: cupulas,
        celdas_por_estado: { trasladada: cupulas },
    }
    tandas = [...tandas, tanda]
    return {
        ...tanda,
        consumo: {
        id: crypto.randomUUID(),
        material_id: material.id,
        tipo: 'consumo',
        cantidad: String(-cupulas),
        tanda_id: tanda.id,
        motivo: null,
        fecha: datos.fecha_traslarve,
    },
    stock: String(queda),
    advertencias:
        queda < 0
        ? [
            {
                code: 'stock_negativo',
                message: 'El stock del material quedó negativo.',
                details: {},
            },
            ]
        : [],
    }
}

return {
    listar: async ({ raza_id, desde, hasta } = {}) => ({
      // Como el backend: la tanda más nueva primero.
    items: tandas
        .filter(
        (t) =>
            (!raza_id || t.raza_id === raza_id) &&
            (!desde || t.fecha_traslarve >= desde) &&
            (!hasta || t.fecha_traslarve <= hasta),
        )
        .sort((a, b) => b.fecha_traslarve.localeCompare(a.fecha_traslarve)),
    siguiente: null,
    }),
    obtener: async (id) => buscar(id),
    crear: async (datos, clave) => {
    const previa = clave ? porClave.get(clave) : undefined
    if (previa) return previa
    if (datos.fecha_traslarve > hoyEnArgentina())
        throw invalido(
        'validacion',
        'La fecha de traslarve no puede ser futura.',
        )
    const creada = crear(datos)
    if (clave) porClave.set(clave, creada)
    return creada
    },
    }
}

export const tandas: ApiTandas = usaDatosSimulados(
import.meta.env.VITE_DATOS_SIMULADOS,
)
? tandasSimuladas()
: tandasHttp()