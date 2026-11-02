import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { describirError } from '@/api/client'
import { kpis } from '@/api/kpis'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { DataTable, type Columna } from '@/components/ui/table'
import { errorDePeriodo, formatearFecha } from '@/lib/fechas'
import {
  ExplicacionDeKpis,
  Porcentaje,
} from '@/modulos/produccion/IndicadoresDeProduccion'
import { CLAVE_KPIS, leerFiltrosDeKpis } from '@/modulos/produccion/kpis'
import type { AgrupacionKpi, KpiProduccion } from '@/tipos/dominio'

/** La tabla pide un id por fila: la tanda, o la raza al agrupar por raza. */
type Fila = KpiProduccion & { id: string }

const AGRUPACION: Record<AgrupacionKpi, string> = {
  tanda: 'Por tanda',
  raza: 'Por raza',
}

const numero = (clave: keyof KpiProduccion & string, titulo: string) => ({
  clave,
  titulo,
  render: (k: Fila) => (
    <span className="font-mono tabular-nums">{String(k[clave] ?? '')}</span>
  ),
  orden: (a: Fila, b: Fila) => Number(a[clave]) - Number(b[clave]),
})

// null (sin introducidas) va al final al ordenar de menor a mayor.
const segunPorcentaje =
  (clave: 'porcentaje_cosecha' | 'porcentaje_perdida') => (a: Fila, b: Fila) =>
    (a[clave] === null ? Infinity : Number(a[clave])) -
    (b[clave] === null ? Infinity : Number(b[clave]))

const PORCENTAJES: Columna<Fila>[] = [
  {
    clave: 'porcentaje_cosecha',
    titulo: '% cosecha',
    render: (k) => <Porcentaje valor={k.porcentaje_cosecha} tipo="cosecha" />,
    orden: segunPorcentaje('porcentaje_cosecha'),
  },
  {
    clave: 'porcentaje_perdida',
    titulo: '% pérdida',
    render: (k) => <Porcentaje valor={k.porcentaje_perdida} tipo="perdida" />,
    orden: segunPorcentaje('porcentaje_perdida'),
  },
]

const CONTEOS: Columna<Fila>[] = [
  numero('introducidas', 'Introducidas'),
  numero('cosechadas', 'Cosechadas'),
  numero('perdidas', 'Pérdidas'),
  numero('en_parque', 'En el parque'),
]

const raza: Columna<Fila> = {
  clave: 'raza',
  titulo: 'Raza',
  orden: (a, b) => a.raza.localeCompare(b.raza),
}

function columnasDe(agrupar: AgrupacionKpi): Columna<Fila>[] {
  if (agrupar === 'raza')
    return [raza, numero('tandas', 'Tandas'), ...CONTEOS, ...PORCENTAJES]
  return [
    {
      clave: 'fecha_traslarve',
      titulo: 'Tanda',
      render: (k) =>
        k.tanda_id && k.fecha_traslarve ? (
          <Link
            to={`/produccion/tandas/${k.tanda_id}`}
            className="font-medium tabular-nums text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
          >
            {formatearFecha(k.fecha_traslarve)}
          </Link>
        ) : (
          '—'
        ),
      orden: (a, b) =>
        (a.fecha_traslarve ?? '').localeCompare(b.fecha_traslarve ?? ''),
    },
    raza,
    ...CONTEOS,
    ...PORCENTAJES,
  ]
}

/** Indicadores de producción (backend #31): % de cosecha y % de pérdida en
 *  el parque, por tanda o por raza, en un período de traslarve. */
export default function KpisPage() {
  const [params, setParams] = useSearchParams()
  const filtros = leerFiltrosDeKpis(params)
  const errorDelPeriodo = errorDePeriodo(filtros)
  const hayPeriodo = Boolean(filtros.desde || filtros.hasta)

  const consulta = useQuery({
    queryKey: [...CLAVE_KPIS, filtros],
    queryFn: () => kpis.produccion(filtros),
    // Un período al revés no se pide: el backend respondería 422.
    enabled: errorDelPeriodo === null,
  })

  const cambiar = (clave: 'agrupar' | 'desde' | 'hasta', valor: string) =>
    setParams(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        // Por tanda es lo que se ve sin elegir: no hace falta en la URL.
        if (!valor || (clave === 'agrupar' && valor === 'tanda'))
          nuevos.delete(clave)
        else nuevos.set(clave, valor)
        return nuevos
      },
      { replace: true },
    )
  const limpiarPeriodo = () =>
    setParams(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        nuevos.delete('desde')
        nuevos.delete('hasta')
        return nuevos
      },
      { replace: true },
    )

  const filas: Fila[] =
    consulta.data?.map((k) => ({ ...k, id: k.tanda_id ?? k.raza_id })) ?? []

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo="Indicadores de producción"
        descripcion="Cuánto se cosecha y cuánto se pierde en el parque de lo que se introduce, por tanda o por raza. Se cuenta desde las celdas cada vez que abrís la pantalla."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="space-y-1.5">
          <p id="agrupar-titulo" className="text-sm font-medium text-texto">
            Ver
          </p>
          <div
            role="group"
            aria-labelledby="agrupar-titulo"
            className="flex gap-2"
          >
            {(Object.keys(AGRUPACION) as AgrupacionKpi[]).map((a) => (
              <Button
                key={a}
                variante={filtros.agrupar === a ? 'primario' : 'secundario'}
                aria-pressed={filtros.agrupar === a}
                onClick={() => cambiar('agrupar', a)}
              >
                {AGRUPACION[a]}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md lg:flex-1">
          <Field
            label="Traslarve desde"
            htmlFor="kpis-desde"
            ayuda="Incluye ese día."
          >
            <Input
              id="kpis-desde"
              type="date"
              value={filtros.desde ?? ''}
              max={filtros.hasta}
              aria-describedby="kpis-desde-ayuda"
              onChange={(e) => cambiar('desde', e.target.value)}
            />
          </Field>
          <Field
            label="Traslarve hasta"
            htmlFor="kpis-hasta"
            error={errorDelPeriodo ?? undefined}
            ayuda="Incluye ese día."
          >
            <Input
              id="kpis-hasta"
              type="date"
              value={filtros.hasta ?? ''}
              min={filtros.desde}
              invalido={errorDelPeriodo !== null}
              aria-describedby={
                errorDelPeriodo ? 'kpis-hasta-error' : 'kpis-hasta-ayuda'
              }
              onChange={(e) => cambiar('hasta', e.target.value)}
            />
          </Field>
        </div>
        {hayPeriodo ? (
          <Button
            variante="fantasma"
            className="lg:mt-7"
            onClick={limpiarPeriodo}
          >
            Ver todo el historial
          </Button>
        ) : null}
      </div>

      {errorDelPeriodo ? (
        <Vacio titulo="Revisá el período">
          Corregí las fechas para ver los indicadores.
        </Vacio>
      ) : consulta.isPending ? (
        <Cargando columnas={8} />
      ) : consulta.isError ? (
        <ErrorDePantalla
          error={describirError(consulta.error)}
          reintentar={() => void consulta.refetch()}
        />
      ) : (
        <DataTable
          // Al cambiar de agrupación, la tabla arranca sin el orden anterior.
          key={filtros.agrupar}
          columnas={columnasDe(filtros.agrupar)}
          filas={filas}
          porPagina={Math.max(filas.length, 1)}
          vacio={
            hayPeriodo ? (
              <Vacio
                titulo="No hay tandas traslarvadas en ese período"
                accion={
                  <Button variante="secundario" onClick={limpiarPeriodo}>
                    Quitar el período
                  </Button>
                }
              />
            ) : (
              <Vacio
                titulo="Todavía no hay tandas"
                accion={
                  <Link
                    to="/produccion/tandas"
                    className="text-sm font-medium text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
                  >
                    Ir a Tandas
                  </Link>
                }
              >
                Los indicadores salen de las celdas de cada tanda: aparecen
                cuando cargues la primera.
              </Vacio>
            )
          }
        />
      )}

      {/* Después de los datos: en el teléfono, lo primero es el número. */}
      <ExplicacionDeKpis />
    </section>
  )
}
