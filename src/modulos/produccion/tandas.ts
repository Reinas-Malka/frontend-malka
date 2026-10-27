/** Tandas (backend #27): reglas de la pantalla, sin React. La tanda se
 *  identifica por su raza (madre opcional, dominio del 16/10), lleva la
 *  ubicación de la continuadora y se da de alta con cuadros: las celdas las
 *  crea el backend, una por cúpula. */
import type { Rol } from '@/auth/identidad'
import type { Campo, Opcion, Valores } from '@/components/catalogo/campos'
import { diasEntre, esDomingo, hoyEnArgentina } from '@/lib/fechas'
import {
  CUPULAS_POR_CUADRO,
  type EstadoCelda,
  type Madre,
  type Material,
  type Raza,
  type Tanda,
  type TandaCrear,
} from '@/tipos/dominio'

export const CLAVE_TANDAS = 'tandas'

/** Escriben admin y producción (backend: require_role). */
export const ROLES_PRODUCCION: readonly Rol[] = ['admin', 'produccion']

export const CUADROS = [1, 2, 3] as const

/** Topes de app/schemas/produccion.py (Ordinal). */
const MAXIMO_UBICACION = 1000

const SIN_MADRE = 'sin_madre'

/** Días desde el traslarve (D0), con el "hoy" de Argentina. */
export function edadEnDias(tanda: Tanda, hoy: string = hoyEnArgentina()) {
  return diasEntre(tanda.fecha_traslarve, hoy)
}

export function cupulasDe(cuadros: number): number {
  return cuadros * CUPULAS_POR_CUADRO
}

/** Cómo se llama cada estado en el campo (dominio del 23/10). */
export const ETAPA: Record<
  EstadoCelda,
  { nombre: string; tono: 'neutro' | 'miel' | 'ok' | 'aviso' | 'peligro' }
> = {
  trasladada: { nombre: 'Trasladadas', tono: 'neutro' },
  introducida: { nombre: 'En el parque', tono: 'miel' },
  nacida: { nombre: 'Nacidas', tono: 'miel' },
  madura: { nombre: 'Maduras', tono: 'miel' },
  fecundada: { nombre: 'Fecundadas', tono: 'miel' },
  enjaulada: { nombre: 'Cosechadas', tono: 'ok' },
  despachada: { nombre: 'Despachadas', tono: 'ok' },
  descartada: { nombre: 'Descartadas', tono: 'peligro' },
  extraviada: { nombre: 'Extraviadas', tono: 'peligro' },
}

/** Orden en que se muestran: el del ciclo, de la traslarvada a la pérdida. */
const ORDEN: readonly EstadoCelda[] = [
  'trasladada',
  'introducida',
  'nacida',
  'madura',
  'fecundada',
  'enjaulada',
  'despachada',
  'descartada',
  'extraviada',
]

/** Las celdas de la tanda por estado, solo los que tienen alguna. */
export function etapasDe(
  tanda: Tanda,
): { estado: EstadoCelda; cantidad: number }[] {
  return ORDEN.filter((e) => (tanda.celdas_por_estado[e] ?? 0) > 0).map(
    (estado) => ({ estado, cantidad: tanda.celdas_por_estado[estado] }),
  )
}

const activas = <T extends { activo: boolean }>(filas: readonly T[]) =>
  filas.filter((f) => f.activo)

/** El material de cúpulas, si hay uno solo que lo parezca: se propone. */
export function materialDeCupulas(
  materiales: readonly Material[],
): Material | undefined {
  const candidatos = activas(materiales).filter((m) =>
    /c[uú]pula/i.test(m.nombre),
  )
  return candidatos.length === 1 ? candidatos[0] : undefined
}

const entero = (v: string) => /^\d+$/.test(v.trim())

export function camposDelAlta(
  razas: readonly Raza[],
  materiales: readonly Material[],
  madres: readonly Madre[],
): Campo[] {
  const opcionesDe = <T extends { id: string; activo: boolean }>(
    filas: readonly T[],
    etiqueta: (f: T) => string,
  ): Opcion[] =>
    activas(filas).map((f) => ({ valor: f.id, etiqueta: etiqueta(f) }))

  const continuadora = (otro: string, nombre: string) => ({
    tipo: 'numero' as const,
    min: 1,
    max: MAXIMO_UBICACION,
    validar: (v: string, valores: Valores) => {
      if (!entero(v)) return `${nombre} tiene que ser un número entero.`
      if (!valores[otro]?.trim())
        return 'Fila y posición de la continuadora van las dos o ninguna.'
      return null
    },
  })

  return [
    {
      nombre: 'raza_id',
      etiqueta: 'Raza',
      tipo: 'seleccion',
      requerido: true,
      opciones: () => opcionesDe(razas, (r) => r.nombre),
      ayuda: 'La tanda se identifica por su raza.',
    },
    {
      nombre: 'fecha_traslarve',
      etiqueta: 'Fecha de traslarve',
      tipo: 'fecha',
      requerido: true,
      validar: (v, valores) => {
        if (v > hoyEnArgentina()) return 'La fecha no puede ser futura.'
        if (esDomingo(v) && valores.retroactivo !== 'si')
          return 'El traslarve no se hace los domingos. Si es la carga tardía de una tanda ya hecha, marcala como retroactiva.'
        return null
      },
    },
    {
      nombre: 'retroactivo',
      etiqueta: '¿Es una carga tardía?',
      tipo: 'seleccion',
      requerido: true,
      opciones: () => [
        { valor: 'no', etiqueta: 'No, se hizo en la fecha indicada' },
        { valor: 'si', etiqueta: 'Sí, es una tanda ya hecha (retroactiva)' },
      ],
      validar: (v, valores) =>
        v === 'si' && valores.fecha_traslarve === hoyEnArgentina()
          ? 'Una carga retroactiva lleva una fecha pasada.'
          : null,
    },
    {
      nombre: 'cuadros',
      etiqueta: 'Cuadros de madera',
      tipo: 'seleccion',
      requerido: true,
      opciones: () =>
        CUADROS.map((n) => ({
          valor: String(n),
          etiqueta: `${n} ${n === 1 ? 'cuadro' : 'cuadros'} · ${cupulasDe(n)} cúpulas`,
        })),
      ayuda: `Cada cuadro son ${CUPULAS_POR_CUADRO} cúpulas: el sistema crea una celda por cúpula.`,
    },
    {
      nombre: 'material_id',
      etiqueta: 'Material de cúpulas',
      tipo: 'seleccion',
      requerido: true,
      opciones: () =>
        opcionesDe(materiales, (m) => `${m.nombre} (stock ${m.stock})`),
      ayuda: 'Se descuentan las cúpulas de este material.',
    },
    {
      nombre: 'fila_continuadora',
      etiqueta: 'Fila de la continuadora (opcional)',
      ...continuadora('posicion_continuadora', 'La fila'),
    },
    {
      nombre: 'posicion_continuadora',
      etiqueta: 'Posición de la continuadora (opcional)',
      ...continuadora('fila_continuadora', 'La posición'),
    },
    {
      nombre: 'madre_id',
      etiqueta: 'Madre (opcional)',
      tipo: 'seleccion',
      opciones: () => [
        { valor: SIN_MADRE, etiqueta: 'Sin madre' },
        ...opcionesDe(madres, (m) => m.identificacion),
      ],
    },
  ]
}

export function valoresIniciales(materiales: readonly Material[]): Valores {
  return {
    fecha_traslarve: hoyEnArgentina(),
    retroactivo: 'no',
    cuadros: '2',
    material_id: materialDeCupulas(materiales)?.id ?? '',
    madre_id: SIN_MADRE,
  }
}

const numeroOpcional = (v: string | undefined) =>
  v?.trim() ? Number(v.trim()) : null

export function aTandaCrear(v: Valores): TandaCrear {
  return {
    raza_id: v.raza_id,
    fecha_traslarve: v.fecha_traslarve,
    cuadros: Number(v.cuadros),
    material_id: v.material_id,
    retroactivo: v.retroactivo === 'si',
    fila_continuadora: numeroOpcional(v.fila_continuadora),
    posicion_continuadora: numeroOpcional(v.posicion_continuadora),
    madre_id: v.madre_id && v.madre_id !== SIN_MADRE ? v.madre_id : null,
  }
}