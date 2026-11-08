/** Tandas (backend #27) y sus operaciones por lote (#28). No es un catálogo:
 *  no se edita ni se da de baja, el alta devuelve más que la tanda (el
 *  consumo de cúpulas, el stock que queda y la advertencia de stock
 *  negativo) y las celdas cambian de estado solo con operaciones por lote.
 *  Mismo esquema que api/embarques.ts: real y simulado con la misma firma,
 *  un solo swap por VITE_DATOS_SIMULADOS. */
import { ApiError, esApiError, request } from '@/api/client'
import type { Pagina } from '@/api/recurso'
import { bancos, nucleos, parques } from '@/api/recursos'
import { usaDatosSimulados } from '@/datos/cliente'
import { DATOS_SIMULADOS } from '@/datos/simulados'
import { esDomingo, hoyEnArgentina } from '@/lib/fechas'
import {
  MAXIMO_CELDAS_POR_OPERACION,
  fechaDeSalidaEstimada,
  repartir,
} from '@/lib/tandas'
import {
  CUPULAS_POR_CUADRO,
  type Banco,
  type Celda,
  type EstadoCelda,
  type EstadoTanda,
  type Material,
  type Nucleo,
  type OperacionCrear,
  type OperacionRealizada,
  type Parque,
  type IntroduccionDeTanda,
  type Raza,
  type ResultadoDeTanda,
  type Tanda,
  type TandaCreada,
  type TandaCrear,
  type TandaDetalle,
} from '@/tipos/dominio'

/** Filtros de GET /api/v1/tandas: raza, rango de fecha de traslarve y
 *  estado (en curso o cosechada; sin él, todas). ?estado lo suma el backend
 *  en feat/observaciones-produccion: hasta entonces lo ignora y la pantalla
 *  filtra la página que llega (TandasPage). */
export type FiltrosDeTandas = {
  raza_id?: string
  desde?: string
  hasta?: string
  estado?: EstadoTanda
}

export interface ApiTandas {
  listar(filtros?: FiltrosDeTandas, cursor?: string): Promise<Pagina<Tanda>>
  /** La tanda con sus celdas por estado y dónde están (núcleos y bancos). */
  obtener(id: string): Promise<TandaDetalle>
  crear(datos: TandaCrear, claveIdempotencia?: string): Promise<TandaCreada>
  /** Una operación por lote: descartar, introducir, cosechar o pasar a
   *  banco. Con la misma clave, un reintento devuelve lo ya hecho. */
  operar(
    id: string,
    operacion: OperacionCrear,
    claveIdempotencia?: string,
  ): Promise<OperacionRealizada>
}

const RUTA = '/api/v1/tandas'
/** Las tandas crecen sin tope: se piden de a una página ("Cargar más"). */
export const LIMITE_TANDAS = 50

export function tandasHttp(): ApiTandas {
  const de = (id: string) => `${RUTA}/${encodeURIComponent(id)}`
  return {
    listar: (filtros = {}, cursor) =>
      request<Pagina<Tanda>>(RUTA, {
        query: { ...filtros, limite: LIMITE_TANDAS, cursor },
      }),
    obtener: (id) => request<TandaDetalle>(de(id)),
    crear: (datos, claveIdempotencia) =>
      request<TandaCreada>(RUTA, {
        metodo: 'POST',
        cuerpo: datos,
        claveIdempotencia,
      }),
    operar: (id, operacion, claveIdempotencia) =>
      request<OperacionRealizada>(`${de(id)}/operaciones`, {
        metodo: 'POST',
        cuerpo: operacion,
        claveIdempotencia,
      }),
  }
}

/** De dónde lee la simulación parques, núcleos y bancos; undefined si no
 *  existe. */
export type CatalogosDeProduccion = {
  parque(id: string): Promise<Parque | undefined>
  banco(id: string): Promise<Banco | undefined>
  /** Todos, también los dados de baja. */
  nucleos(): Promise<Nucleo[]>
}

/** Catálogos fijos de una lista: los de la semilla, para los tests. */
export function catalogosDe(
  datos: Pick<
    typeof DATOS_SIMULADOS,
    'parques' | 'bancos' | 'nucleos'
  > = DATOS_SIMULADOS,
): CatalogosDeProduccion {
  return {
    parque: async (id) => datos.parques.find((p) => p.id === id),
    banco: async (id) => datos.bancos.find((b) => b.id === id),
    nucleos: async () => [...datos.nucleos],
  }
}

/** Un recurso de api/recursos.ts como catálogo: el 404 es "no existe". */
const desdeRecurso =
  <T>(recurso: { obtener(id: string): Promise<T> }) =>
  async (id: string): Promise<T | undefined> => {
    try {
      return await recurso.obtener(id)
    } catch (error) {
      if (esApiError(error) && error.status === 404) return undefined
      throw error
    }
  }

/** Los mismos catálogos que las pantallas: un parque o un banco dado de
 *  alta en la demo ya sirve para operar. */
function catalogosDeRecursos(): CatalogosDeProduccion {
  return {
    parque: desdeRecurso(parques),
    banco: desdeRecurso(bancos),
    nucleos: async () => {
      const todos: Nucleo[] = []
      let cursor: string | undefined
      do {
        const pagina = await nucleos.listar({
          cursor,
          limite: 100,
          filtros: { incluir_inactivos: 'true' },
        })
        todos.push(...pagina.items)
        cursor = pagina.siguiente ?? undefined
      } while (cursor)
      return todos
    },
  }
}

const error =
  (status: number) =>
  (codigo: string, mensaje: string, detalles: Record<string, unknown> = {}) =>
    new ApiError({ status, codigo, mensaje, detalles })
const invalido = error(422)
const conflicto = error(409)
const noEncontrado = error(404)

type TandaBase = Omit<
  Tanda,
  'celdas' | 'celdas_por_estado' | 'estado' | 'fecha_salida_estimada'
>

type Semilla = {
  tandas?: readonly Tanda[]
  /** Las celdas de las tandas: los conteos salen de acá, como en la base. */
  celdas?: readonly Celda[]
  razas?: readonly Raza[]
  materiales?: readonly Material[]
  catalogos?: CatalogosDeProduccion
}

const porId = (a: Celda, b: Celda) => a.id.localeCompare(b.id)

/** La simulación, más lo que necesitan otras simulaciones que cuentan
 *  desde las mismas celdas (los KPIs de api/kpis.ts): así una operación de
 *  la demo también mueve los indicadores, como en la base. */
export interface SimulacionDeTandas extends ApiTandas {
  /** Las tandas en orden de carga y sus celdas, tal como están ahora. */
  instantanea(): {
    tandas: readonly TandaBase[]
    celdas: readonly Celda[]
    razas: readonly Raza[]
  }
}

/** En memoria para la demo sin backend. Repite las reglas del alta (raza y
 *  material activos, domingo salvo retroactivo, una celda por cúpula y el
 *  descuento de cúpulas con su advertencia) y las de las operaciones por
 *  lote (repositorio_operaciones.py), con los mismos códigos de error, así
 *  la pantalla se comporta igual que con la API. Guarda las celdas: los
 *  conteos y el "dónde están" se cuentan al leer, como en el backend. */
export function tandasSimuladas({
  tandas: semilla = DATOS_SIMULADOS.tandas,
  celdas: celdasSemilla = DATOS_SIMULADOS.celdas,
  razas = DATOS_SIMULADOS.razas,
  materiales = DATOS_SIMULADOS.materiales,
  catalogos = catalogosDe(),
}: Semilla = {}): SimulacionDeTandas {
  // Sin los conteos: salen de las celdas en cada lectura.
  let tandas: TandaBase[] = semilla.map((t) => ({
    id: t.id,
    raza_id: t.raza_id,
    madre_id: t.madre_id,
    fecha_traslarve: t.fecha_traslarve,
    retroactivo: t.retroactivo,
    fila_continuadora: t.fila_continuadora,
    posicion_continuadora: t.posicion_continuadora,
  }))
  let celdas = celdasSemilla.map((c) => ({ ...c }))
  const stock = new Map(materiales.map((m) => [m.id, Number(m.stock)]))
  const porClave = new Map<string, unknown>()

  const buscar = (id: string): TandaBase => {
    const tanda = tandas.find((t) => t.id === id)
    if (!tanda) throw noEncontrado('tanda_no_encontrada', 'No existe la tanda.')
    return tanda
  }
  const deLaTanda = (id: string, estado?: EstadoCelda) =>
    celdas.filter(
      (c) => c.tanda_id === id && (estado === undefined || c.estado === estado),
    )
  /** Alguna celda ya pasó por el parque y salió (YA_COSECHADA del backend):
   *  vale también para una cosecha de 0. */
  const yaCosechada = (id: string) =>
    deLaTanda(id).some(
      (c) => c.nucleo_id !== null && c.estado !== 'introducida',
    )
  const estadoDe = (id: string): EstadoTanda =>
    yaCosechada(id) ? 'cosechada' : 'en_curso'
  // Como el backend de feat/observaciones-produccion: el estado y la fecha
  // de salida estimada se calculan al leer.
  const conCeldas = (tanda: TandaBase): Tanda => {
    const celdas_por_estado: Record<string, number> = {}
    const propias = deLaTanda(tanda.id)
    for (const c of propias)
      celdas_por_estado[c.estado] = (celdas_por_estado[c.estado] ?? 0) + 1
    return {
      ...tanda,
      celdas: propias.length,
      celdas_por_estado,
      estado: estadoDe(tanda.id),
      fecha_salida_estimada: fechaDeSalidaEstimada(tanda),
    }
  }
  /** Cambia esas celdas; todo lo demás queda igual. */
  const cambiar = (ids: Celda[], cambio: (c: Celda) => Celda) => {
    const elegidas = new Set(ids.map((c) => c.id))
    celdas = celdas.map((c) => (elegidas.has(c.id) ? cambio(c) : c))
  }
  // Como el backend: con Idempotency-Key, un reintento devuelve lo mismo.
  // Solo se guarda lo que salió bien: después de un error, la misma clave
  // vuelve a intentar.
  const unaVez = async <T>(
    clave: string | undefined,
    alcance: string,
    cambio: () => Promise<T>,
  ): Promise<T> => {
    const previa = clave ? porClave.get(`${alcance}:${clave}`) : undefined
    if (previa) return previa as T
    const resultado = await cambio()
    if (clave) porClave.set(`${alcance}:${clave}`, resultado)
    return resultado
  }

  const excedida = (pedidas: number, hay: number, estado: string): never => {
    throw conflicto(
      'cantidad_excedida',
      `Se pidieron ${pedidas} celdas y hay ${hay} en estado ${estado}.`,
      { pedidas, disponibles: hay, estado },
    )
  }
  const noAntesDe = (fecha: string, minima: string, paso: string) => {
    if (fecha < minima)
      throw invalido(
        'fecha_anterior',
        `La fecha no puede ser anterior a ${paso}.`,
        { fecha, minima },
      )
  }
  /** Lo que valida el schema del backend antes del repositorio. */
  const validarFormato = (op: OperacionCrear) => {
    const minimo = op.accion === 'cosechar' ? 0 : 1
    if (
      !Number.isInteger(op.cantidad) ||
      op.cantidad < minimo ||
      op.cantidad > MAXIMO_CELDAS_POR_OPERACION
    )
      throw invalido(
        'validacion',
        `La cantidad tiene que ser un número entero entre ${minimo} y ${MAXIMO_CELDAS_POR_OPERACION}.`,
      )
    if ('fecha' in op && op.fecha > hoyEnArgentina())
      throw invalido('validacion', 'La fecha no puede ser futura.')
  }

  const resultado = (
    tanda: TandaBase,
    op: OperacionCrear,
    extra: Partial<OperacionRealizada> = {},
  ): OperacionRealizada => ({
    accion: op.accion,
    cantidad: op.cantidad,
    tanda: conCeldas(tanda),
    reparto: null,
    descartadas_en_cosecha: null,
    ...extra,
  })

  async function operar(
    tanda: TandaBase,
    op: OperacionCrear,
  ): Promise<OperacionRealizada> {
    validarFormato(op)
    switch (op.accion) {
      case 'descartar': {
        noAntesDe(op.fecha, tanda.fecha_traslarve, 'el traslarve')
        const hay = deLaTanda(tanda.id, 'trasladada').sort(porId)
        if (op.cantidad > hay.length)
          excedida(op.cantidad, hay.length, 'trasladada')
        // Sin núcleo: nunca se introdujeron.
        cambiar(hay.slice(0, op.cantidad), (c) => ({
          ...c,
          estado: 'descartada',
          fecha_descarte: op.fecha,
        }))
        return resultado(tanda, op)
      }
      case 'introducir': {
        if (yaCosechada(tanda.id))
          throw conflicto(
            'transicion_invalida',
            'La tanda ya se cosechó: no se le pueden introducir más celdas.',
          )
        noAntesDe(op.fecha, tanda.fecha_traslarve, 'el traslarve')
        const hay = deLaTanda(tanda.id, 'trasladada').sort(porId)
        if (op.cantidad > hay.length)
          excedida(op.cantidad, hay.length, 'trasladada')
        const parque = await catalogos.parque(op.parque_id)
        if (!parque)
          throw noEncontrado('parque_no_encontrado', 'No existe el parque.')
        if (!parque.activo)
          throw conflicto(
            'parque_inactivo',
            'El parque está dado de baja: no admite celdas.',
          )
        // Ocupadas: las introducidas que todavía no se cosecharon, de
        // cualquier tanda.
        const delParque = (await catalogos.nucleos())
          .filter((n) => n.parque_id === parque.id && n.activo)
          .map((n) => ({
            id: n.id,
            fila: n.fila,
            posicion: n.posicion,
            ocupadas: celdas.filter(
              (c) => c.nucleo_id === n.id && c.estado === 'introducida',
            ).length,
          }))
        if (delParque.length === 0)
          throw conflicto(
            'parque_sin_nucleos',
            'El parque no tiene núcleos activos: no hay dónde introducir.',
          )
        const reparto = repartir(delParque, op.cantidad)
        // Una entrada por celda: el núcleo repetido tantas veces como recibe.
        const destinos = reparto.flatMap((r) =>
          Array.from({ length: r.celdas }, () => r.nucleo.id),
        )
        const elegidas = hay.slice(0, op.cantidad)
        const nucleoDe = new Map(elegidas.map((c, i) => [c.id, destinos[i]]))
        cambiar(elegidas, (c) => ({
          ...c,
          estado: 'introducida',
          nucleo_id: nucleoDe.get(c.id) ?? null,
          fecha_introduccion: op.fecha,
        }))
        return resultado(tanda, op, {
          reparto: reparto.map((r) => ({
            nucleo_id: r.nucleo.id,
            fila: r.nucleo.fila,
            posicion: r.nucleo.posicion,
            celdas: r.celdas,
          })),
        })
      }
      case 'cosechar': {
        if (yaCosechada(tanda.id))
          throw conflicto(
            'tanda_cosechada',
            'La tanda ya se cosechó: se cosecha una sola vez.',
          )
        const enParque = deLaTanda(tanda.id, 'introducida').sort(porId)
        if (enParque.length === 0)
          throw conflicto(
            'transicion_invalida',
            'La tanda no tiene celdas en el parque: primero hay que introducirlas.',
          )
        if (op.cantidad > enParque.length)
          excedida(op.cantidad, enParque.length, 'introducida')
        const ultima = enParque
          .map((c) => c.fecha_introduccion ?? '')
          .reduce((a, b) => (a > b ? a : b))
        noAntesDe(op.fecha, ultima, 'la última introducción')
        cambiar(enParque.slice(0, op.cantidad), (c) => ({
          ...c,
          estado: 'enjaulada',
          fecha_enjaulado: op.fecha,
        }))
        // El resto conserva el núcleo: así se distingue de las descartadas
        // antes de introducir (docs/dominio.md).
        cambiar(enParque.slice(op.cantidad), (c) => ({
          ...c,
          estado: 'descartada',
          fecha_descarte: op.fecha,
        }))
        return resultado(tanda, op, {
          descartadas_en_cosecha: enParque.length - op.cantidad,
        })
      }
      case 'pasar_a_banco': {
        const sinBanco = deLaTanda(tanda.id, 'enjaulada')
          .filter((c) => c.banco_id === null)
          .sort(
            (a, b) =>
              (a.fecha_enjaulado ?? '').localeCompare(
                b.fecha_enjaulado ?? '',
              ) || porId(a, b),
          )
        if (op.cantidad > sinBanco.length)
          excedida(op.cantidad, sinBanco.length, 'enjaulada sin banco')
        const banco = await catalogos.banco(op.banco_id)
        if (!banco)
          throw noEncontrado('banco_no_encontrado', 'No existe el banco.')
        if (!banco.activo)
          throw conflicto(
            'banco_inactivo',
            'El banco está dado de baja: no admite reinas.',
          )
        // Las reinas del banco se cuentan desde las celdas, como en la base.
        const reinas = celdas.filter(
          (c) => c.banco_id === banco.id && c.estado === 'enjaulada',
        ).length
        const caben = banco.capacidad_max - reinas
        if (op.cantidad > caben)
          throw conflicto(
            'banco_lleno',
            `En el banco caben ${caben} reinas más.`,
            { caben, capacidad_max: banco.capacidad_max },
          )
        cambiar(sinBanco.slice(0, op.cantidad), (c) => ({
          ...c,
          banco_id: banco.id,
        }))
        return resultado(tanda, op)
      }
    }
  }

  /** Dónde y cuándo se introdujo: por parque y fecha, desde el núcleo y la
   *  fecha que la celda conserva después de la cosecha (como el backend de
   *  feat/observaciones-produccion). */
  async function introduccionesDe(
    id: string,
    todos: ReadonlyMap<string, Nucleo>,
  ): Promise<IntroduccionDeTanda[]> {
    const grupos = new Map<
      string,
      { parque_id: string; fecha: string; nucleos: Set<string>; celdas: number }
    >()
    for (const c of deLaTanda(id)) {
      const nucleo = c.nucleo_id ? todos.get(c.nucleo_id) : undefined
      if (!nucleo || !c.fecha_introduccion) continue
      const clave = `${nucleo.parque_id}|${c.fecha_introduccion}`
      const grupo = grupos.get(clave) ?? {
        parque_id: nucleo.parque_id,
        fecha: c.fecha_introduccion,
        nucleos: new Set<string>(),
        celdas: 0,
      }
      grupo.nucleos.add(nucleo.id)
      grupo.celdas += 1
      grupos.set(clave, grupo)
    }
    const lista = await Promise.all(
      [...grupos.values()].map(async (g) => ({
        parque_id: g.parque_id,
        parque_nombre: (await catalogos.parque(g.parque_id))?.nombre ?? '',
        fecha_introduccion: g.fecha,
        nucleos: g.nucleos.size,
        celdas: g.celdas,
      })),
    )
    return lista.sort(
      (a, b) =>
        a.fecha_introduccion.localeCompare(b.fecha_introduccion) ||
        a.parque_nombre.localeCompare(b.parque_nombre),
    )
  }

  /** Qué salió de lo introducido, contado desde las celdas. */
  function resultadoDe(id: string): ResultadoDeTanda {
    const propias = deLaTanda(id)
    const cuantas = (filtro: (c: Celda) => boolean) =>
      propias.filter(filtro).length
    const conNucleo = (c: Celda) => c.nucleo_id !== null
    const enjauladas = cuantas((c) => c.estado === 'enjaulada')
    const despachadas = cuantas((c) => c.estado === 'despachada')
    const cosecha = propias.find(
      (c) =>
        conNucleo(c) &&
        (c.estado === 'enjaulada' ||
          c.estado === 'despachada' ||
          c.estado === 'descartada'),
    )
    return {
      introducidas: cuantas(conNucleo),
      en_parque: cuantas((c) => c.estado === 'introducida'),
      cosechadas: enjauladas + despachadas,
      enjauladas,
      enjauladas_sin_banco: cuantas(
        (c) => c.estado === 'enjaulada' && c.banco_id === null,
      ),
      despachadas,
      descartadas_con_nucleo: cuantas(
        (c) => c.estado === 'descartada' && conNucleo(c),
      ),
      descartadas_sin_nucleo: cuantas(
        (c) => c.estado === 'descartada' && !conNucleo(c),
      ),
      fecha_cosecha: cosecha
        ? (cosecha.fecha_enjaulado ?? cosecha.fecha_descarte)
        : null,
    }
  }

  async function detalle(id: string): Promise<TandaDetalle> {
    const tanda = conCeldas(buscar(id))
    const enParque = new Map<string, number>()
    const enBanco = new Map<string, number>()
    for (const c of deLaTanda(id)) {
      if (c.estado === 'introducida' && c.nucleo_id)
        enParque.set(c.nucleo_id, (enParque.get(c.nucleo_id) ?? 0) + 1)
      if (c.estado === 'enjaulada' && c.banco_id)
        enBanco.set(c.banco_id, (enBanco.get(c.banco_id) ?? 0) + 1)
    }
    const todos = new Map((await catalogos.nucleos()).map((n) => [n.id, n]))
    const nucleosDeLaTanda = [...enParque].flatMap(([nucleoId, n]) => {
      const nucleo = todos.get(nucleoId)
      return nucleo
        ? [
            {
              nucleo_id: nucleo.id,
              parque_id: nucleo.parque_id,
              fila: nucleo.fila,
              posicion: nucleo.posicion,
              celdas: n,
            },
          ]
        : []
    })
    const bancosDeLaTanda = await Promise.all(
      [...enBanco].map(async ([bancoId, reinas]) => ({
        banco_id: bancoId,
        identificador: (await catalogos.banco(bancoId))?.identificador ?? '',
        reinas,
      })),
    )
    return {
      ...tanda,
      introducciones: await introduccionesDe(id, todos),
      resultado: resultadoDe(id),
      // ORDER BY parque_id, fila, posicion e identificador, como el backend.
      nucleos: nucleosDeLaTanda.sort(
        (a, b) =>
          a.parque_id.localeCompare(b.parque_id) ||
          a.fila - b.fila ||
          a.posicion - b.posicion,
      ),
      bancos: bancosDeLaTanda.sort((a, b) =>
        a.identificador.localeCompare(b.identificador),
      ),
    }
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
    const base: TandaBase = {
      id: crypto.randomUUID(),
      raza_id: datos.raza_id,
      madre_id: datos.madre_id ?? null,
      fecha_traslarve: datos.fecha_traslarve,
      retroactivo: datos.retroactivo ?? false,
      fila_continuadora: datos.fila_continuadora ?? null,
      posicion_continuadora: datos.posicion_continuadora ?? null,
    }
    // Una celda por cúpula, todas trasladadas.
    const nuevas = Array.from({ length: cupulas }, (): Celda => ({
      id: crypto.randomUUID(),
      tenant_id: celdas[0]?.tenant_id ?? '',
      tanda_id: base.id,
      nucleo_id: null,
      estado: 'trasladada',
      fecha_introduccion: null,
      fecha_nacimiento: null,
      fecha_fecundacion: null,
      fecha_enjaulado: null,
      banco_id: null,
      fecha_descarte: null,
      fecha_extravio: null,
    }))
    tandas = [...tandas, base]
    celdas = [...celdas, ...nuevas]
    return {
      ...conCeldas(base),
      consumo: {
        id: crypto.randomUUID(),
        material_id: material.id,
        tipo: 'consumo',
        cantidad: String(-cupulas),
        tanda_id: base.id,
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
    instantanea: () => ({ tandas, celdas, razas }),
    listar: async ({ raza_id, desde, hasta, estado } = {}, cursor) => {
      // Como el backend: la tanda más nueva primero; a igual fecha, la
      // cargada después.
      const filtradas = tandas
        .map((t, orden) => ({ t, orden }))
        .filter(
          ({ t }) =>
            (!raza_id || t.raza_id === raza_id) &&
            (!desde || t.fecha_traslarve >= desde) &&
            (!hasta || t.fecha_traslarve <= hasta) &&
            (!estado || estadoDe(t.id) === estado),
        )
        .sort(
          (a, b) =>
            b.t.fecha_traslarve.localeCompare(a.t.fecha_traslarve) ||
            b.orden - a.orden,
        )
        .map(({ t }) => conCeldas(t))
      const inicio = cursor ? Number(cursor) : 0
      const fin = inicio + LIMITE_TANDAS
      return {
        items: filtradas.slice(inicio, fin),
        siguiente: fin < filtradas.length ? String(fin) : null,
      }
    },
    obtener: detalle,
    crear: (datos, clave) =>
      unaVez(clave, 'crear', async () => {
        if (datos.fecha_traslarve > hoyEnArgentina())
          throw invalido(
            'validacion',
            'La fecha de traslarve no puede ser futura.',
          )
        return crear(datos)
      }),
    operar: (id, operacion, clave) =>
      unaVez(clave, `operar:${id}`, () => operar(buscar(id), operacion)),
  }
}

/** La simulación en uso, o null con la API real. */
export const simulacionDeTandas: SimulacionDeTandas | null = usaDatosSimulados(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
  ? tandasSimuladas({ catalogos: catalogosDeRecursos() })
  : null

export const tandas: ApiTandas = simulacionDeTandas ?? tandasHttp()
