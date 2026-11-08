/** Operaciones por lote sobre una tanda (backend #28), sin React: qué se
 *  puede hacer según cómo está la tanda, la validación previa del
 *  formulario y cómo se cuentan el resultado y los errores. El usuario
 *  nunca elige celdas ni núcleos: carga una cantidad (dominio del 23/10). */
import { esApiError } from '@/api/client'
import type { Errores, Valores } from '@/components/catalogo/campos'
import { formatearFecha, hoyEnArgentina } from '@/lib/fechas'
import { MAXIMO_CELDAS_POR_OPERACION } from '@/lib/tandas'
import type {
  AccionDeTanda,
  Banco,
  OperacionCrear,
  OperacionRealizada,
  TandaDetalle,
} from '@/tipos/dominio'

/** Lo que importa para operar, contado desde las celdas por estado. */
export type ResumenDeTanda = {
  /** Sin introducir: se pueden descartar o introducir. */
  trasladadas: number
  /** En el parque, esperando la cosecha. */
  enParque: number
  /** Cosechadas: enjauladas más las que ya se despacharon. */
  cosechadas: number
  enBancos: number
  /** Cosechadas que todavía no pasaron a ningún banco. */
  sinBanco: number
  /** La cosecha vacía el parque y se hace una sola vez. */
  cosechada: boolean
}

export function resumenDe(tanda: TandaDetalle): ResumenDeTanda {
  const n = (estado: string) => tanda.celdas_por_estado[estado] ?? 0
  const enBancos = tanda.bancos.reduce((total, b) => total + b.reinas, 0)
  const cosechadas = n('enjaulada') + n('despachada')
  return {
    trasladadas: n('trasladada'),
    enParque: n('introducida'),
    cosechadas,
    enBancos,
    sinBanco: Math.max(0, n('enjaulada') - enBancos),
    // Una cosecha de 0 no deja rastro en los conteos: si pasa, el backend
    // responde y la pantalla lo explica.
    cosechada: cosechadas > 0,
  }
}

export const ACCIONES: Record<
  AccionDeTanda,
  { boton: string; titulo: string; descripcion: string; guardar: string }
> = {
  descartar: {
    boton: 'Descartar',
    titulo: 'Descartar celdas',
    descripcion:
      'Las celdas que no se van a introducir (no opercularon o se perdieron). Quedan descartadas sin núcleo.',
    guardar: 'Descartar celdas',
  },
  introducir: {
    // El parque se elige acá: que se lea en el botón (prueba del 07/11).
    boton: 'Introducir en un parque',
    titulo: 'Introducir en un parque',
    descripcion:
      'Elegís el parque y la cantidad: el sistema reparte las celdas parejo entre sus núcleos activos, primero los más libres.',
    guardar: 'Introducir celdas',
  },
  cosechar: {
    boton: 'Cosechar',
    titulo: 'Cosechar la tanda',
    descripcion:
      'Se cosecha una sola vez. Cargás cuántas reinas se cosecharon: las demás celdas del parque quedan descartadas.',
    guardar: 'Cosechar',
  },
  pasar_a_banco: {
    boton: 'Pasar a banco',
    titulo: 'Pasar reinas a un banco',
    descripcion:
      'Las reinas cosechadas que todavía no están en ningún banco. No se puede pasar la capacidad del banco.',
    guardar: 'Pasar a banco',
  },
}

/** Las operaciones que tienen sentido ahora, en el orden del ciclo. */
export function accionesPosibles(r: ResumenDeTanda): AccionDeTanda[] {
  const posibles: Record<AccionDeTanda, boolean> = {
    descartar: r.trasladadas > 0,
    introducir: r.trasladadas > 0 && !r.cosechada,
    cosechar: r.enParque > 0,
    pasar_a_banco: r.sinBanco > 0,
  }
  return (Object.keys(posibles) as AccionDeTanda[]).filter((a) => posibles[a])
}

/** Cuántas reinas más entran en el banco. */
export const cabenEn = (banco: Banco) =>
  Math.max(0, banco.capacidad_max - banco.reinas_en_banco)

/** Cuántas celdas hay para la operación (sin contar la capacidad). */
export function disponiblesPara(
  accion: AccionDeTanda,
  r: ResumenDeTanda,
): number {
  if (accion === 'cosechar') return r.enParque
  if (accion === 'pasar_a_banco') return r.sinBanco
  return r.trasladadas
}

export const conFecha = (accion: AccionDeTanda) => accion !== 'pasar_a_banco'

/** Introducir propone todas las que quedan; el resto arranca vacío. */
export function valoresIniciales(
  accion: AccionDeTanda,
  r: ResumenDeTanda,
  hoy: string = hoyEnArgentina(),
): Valores {
  return {
    cantidad: accion === 'introducir' ? String(r.trasladadas) : '',
    ...(conFecha(accion) ? { fecha: hoy } : {}),
    parque_id: '',
    banco_id: '',
  }
}

export const celdas = (n: number) => `${n} ${n === 1 ? 'celda' : 'celdas'}`
export const reinas = (n: number) => `${n} ${n === 1 ? 'reina' : 'reinas'}`

const QUE_HAY: Record<AccionDeTanda, (n: number) => string> = {
  descartar: (n) => `Hay ${celdas(n)} sin introducir.`,
  introducir: (n) => `Hay ${celdas(n)} sin introducir.`,
  cosechar: (n) => `Hay ${celdas(n)} en el parque.`,
  pasar_a_banco: (n) => `Hay ${reinas(n)} cosechadas sin banco.`,
}

export type ContextoDeOperacion = {
  tanda: TandaDetalle
  /** Los bancos del catálogo, para la capacidad. */
  bancos: readonly Banco[]
  hoy?: string
}

/** La validación previa: lo que el backend rechazaría seguro. La capacidad
 *  del banco y las cantidades se vuelven a controlar allá. */
export function validarOperacion(
  accion: AccionDeTanda,
  v: Valores,
  { tanda, bancos, hoy = hoyEnArgentina() }: ContextoDeOperacion,
): Errores {
  const errores: Errores = {}
  const r = resumenDe(tanda)
  const hay = disponiblesPara(accion, r)
  const minimo = accion === 'cosechar' ? 0 : 1
  const texto = (v.cantidad ?? '').trim()

  if (accion === 'introducir' && !v.parque_id)
    errores.parque_id = 'Elegí el parque.'
  const banco = bancos.find((b) => b.id === v.banco_id)
  if (accion === 'pasar_a_banco' && !banco) errores.banco_id = 'Elegí el banco.'

  if (!/^\d+$/.test(texto))
    errores.cantidad = 'La cantidad tiene que ser un número entero.'
  else {
    const cantidad = Number(texto)
    if (cantidad < minimo)
      errores.cantidad = 'La cantidad tiene que ser al menos 1.'
    else if (cantidad > Math.min(hay, MAXIMO_CELDAS_POR_OPERACION))
      errores.cantidad = `No pueden ser más de ${hay}: ${QUE_HAY[accion](hay).toLowerCase()}`
    else if (banco && cantidad > cabenEn(banco))
      errores.cantidad = `En el banco ${banco.identificador} caben ${reinas(cabenEn(banco))} más.`
  }

  if (conFecha(accion)) {
    const fecha = v.fecha ?? ''
    if (!fecha) errores.fecha = 'Cargá la fecha.'
    else if (fecha > hoy) errores.fecha = 'La fecha no puede ser futura.'
    else if (fecha < tanda.fecha_traslarve)
      errores.fecha = `La fecha no puede ser anterior al traslarve (${formatearFecha(tanda.fecha_traslarve)}).`
  }
  return errores
}

/** Ayuda del campo cantidad: cuántas hay y, al cosechar, cuántas quedarían
 *  descartadas con lo que se cargó. */
export function ayudaDeCantidad(
  accion: AccionDeTanda,
  r: ResumenDeTanda,
  cantidad: string,
  banco?: Banco,
): string {
  const hay = QUE_HAY[accion](disponiblesPara(accion, r))
  const n = /^\d+$/.test(cantidad.trim()) ? Number(cantidad) : null
  if (accion === 'cosechar' && n !== null && n <= r.enParque)
    return `${hay} Las otras ${celdas(r.enParque - n)} quedan descartadas.`
  if (accion === 'pasar_a_banco' && banco)
    return `${hay} En ${banco.identificador} caben ${reinas(cabenEn(banco))} más.`
  return hay
}

/** El formulario como el cuerpo de POST /tandas/{id}/operaciones. */
export function aOperacion(accion: AccionDeTanda, v: Valores): OperacionCrear {
  const cantidad = Number(v.cantidad.trim())
  switch (accion) {
    case 'descartar':
      return { accion, cantidad, fecha: v.fecha }
    case 'introducir':
      return { accion, cantidad, fecha: v.fecha, parque_id: v.parque_id }
    case 'cosechar':
      return { accion, cantidad, fecha: v.fecha }
    case 'pasar_a_banco':
      return { accion, cantidad, banco_id: v.banco_id }
  }
}

export type ErrorDeOperacion = {
  /** El campo al que va el mensaje, o null si es de toda la operación. */
  campo: 'cantidad' | 'fecha' | 'parque_id' | 'banco_id' | null
  mensaje: string
}

/** Cómo se llama en el campo cada estado de origen de cantidad_excedida. */
const ORIGEN: Record<string, string> = {
  trasladada: 'sin introducir',
  introducida: 'en el parque',
  'enjaulada sin banco': 'cosechadas sin banco',
}

const numero = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null
const texto = (valor: unknown): string | null =>
  typeof valor === 'string' && valor ? valor : null

/** Un error del backend en lenguaje del campo: se decide por el código,
 *  nunca por el texto, y no se muestran códigos. */
export function errorDeOperacion(
  error: unknown,
  accion: AccionDeTanda,
): ErrorDeOperacion {
  if (!esApiError(error))
    return {
      campo: null,
      mensaje:
        'No se pudo hacer la operación. Revisá la conexión y volvé a intentar.',
    }
  const d = error.detalles
  switch (error.codigo) {
    case 'cantidad_excedida': {
      const hay = numero(d.disponibles)
      const origen = ORIGEN[texto(d.estado) ?? ''] ?? 'disponibles'
      return {
        campo: 'cantidad',
        mensaje:
          hay === null
            ? 'No hay tantas celdas para esta operación.'
            : `Hay ${hay} ${origen}: pediste más. Puede que alguien haya operado la tanda recién; los números ya se actualizaron.`,
      }
    }
    case 'banco_lleno': {
      const caben = numero(d.caben)
      return {
        campo: 'cantidad',
        mensaje:
          caben === null || caben <= 0
            ? 'El banco está lleno: elegí otro.'
            : `En el banco caben ${reinas(caben)} más.`,
      }
    }
    case 'fecha_anterior': {
      const minima = texto(d.minima)
      const paso =
        accion === 'cosechar' ? 'la última introducción' : 'el traslarve'
      return {
        campo: 'fecha',
        mensaje: minima
          ? `La fecha no puede ser anterior a ${paso} (${formatearFecha(minima)}).`
          : `La fecha no puede ser anterior a ${paso}.`,
      }
    }
    case 'tanda_cosechada':
      return {
        campo: null,
        mensaje: 'Esta tanda ya se cosechó: se cosecha una sola vez.',
      }
    case 'transicion_invalida':
      return {
        campo: null,
        mensaje:
          accion === 'cosechar'
            ? 'La tanda no tiene celdas en el parque: primero hay que introducirlas.'
            : 'La tanda ya se cosechó: no se le pueden introducir más celdas.',
      }
    case 'parque_sin_nucleos':
      return {
        campo: 'parque_id',
        mensaje:
          'El parque no tiene núcleos activos: cargale núcleos o elegí otro parque.',
      }
    case 'parque_inactivo':
      return {
        campo: 'parque_id',
        mensaje: 'El parque está dado de baja: elegí otro.',
      }
    case 'parque_no_encontrado':
      return {
        campo: 'parque_id',
        mensaje: 'El parque ya no existe: elegí otro.',
      }
    case 'banco_inactivo':
      return {
        campo: 'banco_id',
        mensaje: 'El banco está dado de baja: elegí otro.',
      }
    case 'banco_no_encontrado':
      return {
        campo: 'banco_id',
        mensaje: 'El banco ya no existe: elegí otro.',
      }
    case 'tanda_no_encontrada':
      return { campo: null, mensaje: 'La tanda ya no existe.' }
    case 'validacion':
      return {
        campo: null,
        mensaje:
          'Revisá los datos: la cantidad tiene que ser un número entero y la fecha no puede ser futura.',
      }
    default:
      return { campo: null, mensaje: error.mensaje }
  }
}

/** Lo que se le cuenta a quien operó, con lo que devolvió el sistema. */
export function resumenDeOperacion(
  r: OperacionRealizada,
  nombres: { parque?: string; banco?: string } = {},
): string {
  switch (r.accion) {
    case 'descartar':
      return r.cantidad === 1
        ? 'Se descartó 1 celda.'
        : `Se descartaron ${r.cantidad} celdas.`
    case 'introducir': {
      const nucleos = r.reparto?.length ?? 0
      const donde = nombres.parque ? ` en ${nombres.parque}` : ''
      return `Se ${r.cantidad === 1 ? 'introdujo' : 'introdujeron'} ${celdas(r.cantidad)}${donde}, repartidas en ${nucleos} ${nucleos === 1 ? 'núcleo' : 'núcleos'}.`
    }
    case 'cosechar': {
      const descartadas = r.descartadas_en_cosecha ?? 0
      const cosecha =
        r.cantidad === 1
          ? 'Se cosechó 1 reina.'
          : `Se cosecharon ${r.cantidad} reinas.`
      return descartadas === 0
        ? `${cosecha} No quedó ninguna celda descartada.`
        : `${cosecha} Las otras ${celdas(descartadas)} del parque quedaron descartadas.`
    }
    case 'pasar_a_banco': {
      const donde = nombres.banco ? ` al banco ${nombres.banco}` : ' al banco'
      return `${r.cantidad === 1 ? 'Pasó' : 'Pasaron'} ${reinas(r.cantidad)}${donde}.`
    }
    default:
      return 'Listo.'
  }
}
