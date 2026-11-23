import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { describirError } from '@/api/client'
import { madres, materiales, razas } from '@/api/recursos'
import { tandas } from '@/api/tandas'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import type { Valores } from '@/components/catalogo/campos'
import { FormularioRecurso } from '@/components/catalogo/FormularioRecurso'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Modal, ModalContenido } from '@/components/ui/modal'
import {
  Select,
  SelectContenido,
  SelectOpcion,
  SelectTrigger,
  SelectValor,
} from '@/components/ui/select'
import { DataTable, type Columna } from '@/components/ui/table'
import { useListado } from '@/hooks/useRecurso'
import {
  CLAVE_TANDAS,
  ETAPA,
  FILTRO_DE_ESTADO_POR_DEFECTO,
  OPCIONES_DE_ESTADO,
  ROLES_PRODUCCION,
  aTandaCrear,
  camposDelAlta,
  edadEnDias,
  etapasDe,
  leerFiltroDeEstado,
  leerFiltrosDeTandas,
  textoDeSalida,
  valoresIniciales,
} from '@/modulos/produccion/tandas'
import {
  estaAtrasada,
  estadoDeTanda,
  fechaDeSalidaEstimada,
} from '@/lib/tandas'
import { TODOS } from '@/modulos/ventas/pedidos'
import type { Tanda, TandaCreada } from '@/tipos/dominio'
import { errorDePeriodo, formatearFecha } from '@/lib/fechas'

function CeldasPorEtapa({ tanda }: { tanda: Tanda }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Celdas por estado">
      {etapasDe(tanda).map(({ estado, cantidad }) => (
        <li key={estado}>
          <Badge tono={ETAPA[estado].tono}>
            <span className="font-mono tabular-nums">{cantidad}</span>{' '}
            {ETAPA[estado].nombre.toLowerCase()}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

/** Lo que se le dice a quien cargó la tanda: cuántas celdas se crearon y,
 *  si las cúpulas no alcanzaban, que el stock quedó negativo (no bloquea). */
function resumenDelAlta(creada: TandaCreada): string {
  const base = `Tanda creada con ${creada.celdas} celdas trasladadas. ${textoDeSalida(creada)}.`
  return creada.advertencias.some((a) => a.code === 'stock_negativo')
    ? `${base} El stock de cúpulas quedó negativo (${Number(creada.stock).toLocaleString('es-AR')}): revisá si falta cargar una compra.`
    : `${base} Quedan ${Number(creada.stock).toLocaleString('es-AR')} cúpulas.`
}

/** Tandas del criadero (backend #27) y su alta por cuadros. */
export default function TandasPage() {
  const { identidad } = useSesion()
  const escribe = puede(identidad, ROLES_PRODUCCION)
  const cliente = useQueryClient()
  const [alta, setAlta] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; negativo: boolean }>()
  const [params, setParams] = useSearchParams()
  const filtros = leerFiltrosDeTandas(params)
  const estado = leerFiltroDeEstado(params)
  const errorDelPeriodo = errorDePeriodo(filtros)
  const hayFiltros = Boolean(
    filtros.raza_id || filtros.desde || filtros.hasta || filtros.estado,
  )

  // De a una página: las siguientes llegan con "Cargar más". Los filtros los
  // aplica el backend: cada combinación es otra consulta.
  const listado = useInfiniteQuery({
    queryKey: [CLAVE_TANDAS, 'listado', filtros],
    queryFn: ({ pageParam }) => tandas.listar(filtros, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.siguiente ?? undefined,
    // Un período al revés no se pide.
    enabled: errorDelPeriodo === null,
  })
  const filtrar = (
    clave: 'raza' | 'desde' | 'hasta' | 'estado',
    valor: string,
  ) =>
    setParams(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        // En curso es lo que se ve sin ?estado: no hace falta en la URL.
        if (
          !valor ||
          valor === TODOS ||
          (clave === 'estado' && valor === FILTRO_DE_ESTADO_POR_DEFECTO)
        )
          nuevos.delete(clave)
        else nuevos.set(clave, valor)
        return nuevos
      },
      { replace: true },
    )
  // "Todas" de verdad: sin ?estado volvería a mostrar solo las en curso.
  const limpiar = () => setParams({ estado: 'todas' }, { replace: true })
  const listaRazas = useListado('razas', razas)
  const listaMateriales = useListado('materiales', materiales)
  const listaMadres = useListado('madres', madres)

  const crear = useMutation({
    mutationFn: ({ valores, clave }: { valores: Valores; clave: string }) =>
      tandas.crear(aTandaCrear(valores), clave),
    onSuccess: (creada) => {
      // El alta descuenta cúpulas: el stock de materiales también cambia.
      void cliente.invalidateQueries({ queryKey: [CLAVE_TANDAS] })
      void cliente.invalidateQueries({ queryKey: ['materiales'] })
      setAlta(null)
      setAviso({
        texto: resumenDelAlta(creada),
        negativo: creada.advertencias.length > 0,
      })
    },
  })

  const nombreDeRaza = useMemo(
    () => new Map(listaRazas.filas.map((r) => [r.id, r.nombre])),
    [listaRazas.filas],
  )

  const columnas: Columna<Tanda>[] = [
    {
      clave: 'fecha_traslarve',
      titulo: 'Traslarve',
      render: (t) => (
        <span className="tabular-nums">
          <Link
            to={`/produccion/tandas/${t.id}`}
            className="font-medium text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
          >
            {formatearFecha(t.fecha_traslarve)}
          </Link>
          {t.retroactivo ? (
            <span className="ml-2 font-sans text-xs text-texto-suave">
              (retroactiva)
            </span>
          ) : null}
          {estaAtrasada(t) ? (
            <Badge tono="aviso" className="ml-2">
              Atrasada
            </Badge>
          ) : null}
        </span>
      ),
      orden: (a, b) => a.fecha_traslarve.localeCompare(b.fecha_traslarve),
    },
    {
      clave: 'raza_id',
      titulo: 'Raza',
      render: (t) => nombreDeRaza.get(t.raza_id) ?? '—',
    },
    {
      clave: 'id',
      titulo: 'Edad',
      render: (t) => <span className="tabular-nums">{edadEnDias(t)} días</span>,
      orden: (a, b) => edadEnDias(a) - edadEnDias(b),
    },
    {
      clave: 'fecha_salida_estimada',
      titulo: 'Sale aprox.',
      render: (t) =>
        estadoDeTanda(t) === 'cosechada' ? (
          <span className="text-texto-suave">Cosechada</span>
        ) : (
          <span className="tabular-nums">
            {formatearFecha(fechaDeSalidaEstimada(t))}
          </span>
        ),
      orden: (a, b) =>
        fechaDeSalidaEstimada(a).localeCompare(fechaDeSalidaEstimada(b)),
    },
    {
      clave: 'celdas',
      titulo: 'Celdas',
      render: (t) => (
        <div className="space-y-1.5">
          <span className="font-mono tabular-nums">{t.celdas}</span>
          <CeldasPorEtapa tanda={t} />
        </div>
      ),
      orden: (a, b) => a.celdas - b.celdas,
    },
    {
      clave: 'fila_continuadora',
      titulo: 'Continuadora',
      render: (t) =>
        t.fila_continuadora !== null ? (
          <span className="tabular-nums">
            Fila {t.fila_continuadora} · posición {t.posicion_continuadora}
          </span>
        ) : (
          <span className="text-texto-suave">Sin cargar</span>
        ),
    },
  ]

  const listas = [listado, listaRazas, listaMateriales, listaMadres]
  const cargando =
    (errorDelPeriodo === null && listado.isPending) ||
    listas.slice(1).some((l) => l.isPending)
  // Si falla una página siguiente, las ya cargadas se siguen viendo.
  const error =
    (!listado.data && listado.error) ||
    listas.slice(1).find((l) => l.isError)?.error
  // El backend filtra por ?estado desde feat/observaciones-produccion; hasta
  // entonces lo ignora y se filtra acá la página que llegó (con el estado
  // derivado de las celdas). Con el backend nuevo esto no saca nada.
  const filas = (
    listado.data?.pages.flatMap((pagina) => pagina.items) ?? []
  ).filter((t) => !filtros.estado || estadoDeTanda(t) === filtros.estado)

  const nuevo = (
    <Button onClick={() => setAlta(crypto.randomUUID())}>
      <Plus className="size-4" aria-hidden /> Nueva tanda
    </Button>
  )

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo="Tandas"
        descripcion="Cada traslarve, con la raza, su edad, cuándo sale (≈ día 26) y cuántas celdas hay en cada estado. Se ven las en curso: cambiá el estado para ver las cosechadas o todas. Se da de alta por cuadros: el sistema crea una celda por cúpula."
        acciones={escribe ? nuevo : undefined}
      />

      {aviso ? (
        <p
          role="status"
          className={
            aviso.negativo
              ? 'rounded-control border border-aviso/40 bg-aviso/10 p-3 text-sm text-texto'
              : 'rounded-control border border-borde bg-panel p-3 text-sm text-texto'
          }
        >
          {aviso.texto}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-4xl lg:grid-cols-4">
        <Field label="Estado" htmlFor="filtro-estado">
          <Select value={estado} onValueChange={(v) => filtrar('estado', v)}>
            <SelectTrigger id="filtro-estado">
              <SelectValor />
            </SelectTrigger>
            <SelectContenido>
              {OPCIONES_DE_ESTADO.map((o) => (
                <SelectOpcion key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </SelectOpcion>
              ))}
            </SelectContenido>
          </Select>
        </Field>
        <Field label="Raza" htmlFor="filtro-raza">
          <Select
            value={filtros.raza_id ?? TODOS}
            onValueChange={(v) => filtrar('raza', v)}
          >
            <SelectTrigger id="filtro-raza">
              <SelectValor />
            </SelectTrigger>
            <SelectContenido>
              <SelectOpcion value={TODOS}>Todas las razas</SelectOpcion>
              {listaRazas.filas.map((r) => (
                <SelectOpcion key={r.id} value={r.id}>
                  {r.nombre}
                </SelectOpcion>
              ))}
            </SelectContenido>
          </Select>
        </Field>
        <Field label="Traslarve desde" htmlFor="filtro-desde">
          <Input
            id="filtro-desde"
            type="date"
            value={filtros.desde ?? ''}
            max={filtros.hasta}
            onChange={(e) => filtrar('desde', e.target.value)}
          />
        </Field>
        <Field
          label="Traslarve hasta"
          htmlFor="filtro-hasta"
          error={errorDelPeriodo ?? undefined}
        >
          <Input
            id="filtro-hasta"
            type="date"
            value={filtros.hasta ?? ''}
            min={filtros.desde}
            invalido={errorDelPeriodo !== null}
            aria-describedby={
              errorDelPeriodo ? 'filtro-hasta-error' : undefined
            }
            onChange={(e) => filtrar('hasta', e.target.value)}
          />
        </Field>
      </div>

      {errorDelPeriodo ? (
        <Vacio titulo="Revisá el período">
          Corregí las fechas para ver las tandas.
        </Vacio>
      ) : cargando ? (
        <Cargando columnas={6} />
      ) : error ? (
        <ErrorDePantalla
          error={describirError(error)}
          reintentar={() => listas.forEach((l) => void l.refetch())}
        />
      ) : (
        <div className="space-y-3">
          <DataTable
            columnas={columnas}
            filas={filas}
            // Una sola página en pantalla: las siguientes llegan con "Cargar más".
            porPagina={Math.max(filas.length, 1)}
            vacio={
              hayFiltros ? (
                <Vacio
                  titulo={
                    filtros.estado === 'en_curso' &&
                    !(filtros.raza_id || filtros.desde || filtros.hasta)
                      ? 'No hay tandas en curso'
                      : 'Ninguna tanda con estos filtros'
                  }
                  accion={
                    <Button variante="secundario" onClick={limpiar}>
                      Ver todas las tandas
                    </Button>
                  }
                />
              ) : (
                <Vacio
                  titulo="Todavía no hay tandas"
                  accion={escribe ? nuevo : undefined}
                >
                  Una tanda es un traslarve: se carga la raza, la fecha y
                  cuántos cuadros de madera se usaron.
                </Vacio>
              )
            }
          />
          {listado.isFetchNextPageError ? (
            <p
              role="alert"
              className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
            >
              {describirError(listado.error).mensaje}
            </p>
          ) : null}
          {listado.hasNextPage ? (
            <Button
              variante="secundario"
              cargando={listado.isFetchingNextPage}
              onClick={() => void listado.fetchNextPage()}
            >
              Cargar más tandas
            </Button>
          ) : null}
        </div>
      )}

      <Modal
        open={alta !== null}
        onOpenChange={(abierto) =>
          !abierto && !crear.isPending && setAlta(null)
        }
      >
        {alta ? (
          <ModalContenido
            titulo="Nueva tanda"
            descripcion="Las celdas se crean solas, una por cúpula, y las cúpulas se descuentan del material elegido."
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <FormularioRecurso
              key={alta}
              campos={camposDelAlta(
                listaRazas.filas,
                listaMateriales.filas,
                listaMadres.filas,
              )}
              iniciales={valoresIniciales(listaMateriales.filas)}
              textoGuardar="Crear tanda"
              alGuardar={(valores) =>
                crear.mutateAsync({ valores, clave: alta })
              }
              alCancelar={() => !crear.isPending && setAlta(null)}
            />
          </ModalContenido>
        ) : null}
      </Modal>
    </section>
  )
}
