import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { Modal, ModalContenido } from '@/components/ui/modal'
import { DataTable, type Columna } from '@/components/ui/table'
import { useListado } from '@/hooks/useRecurso'
import {
  CLAVE_TANDAS,
  ETAPA,
  ROLES_PRODUCCION,
  aTandaCrear,
  camposDelAlta,
  edadEnDias,
  etapasDe,
  valoresIniciales,
} from '@/modulos/produccion/tandas'
import type { Tanda, TandaCreada } from '@/tipos/dominio'
import { formatearFecha } from '@/lib/fechas'

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
  const base = `Tanda creada con ${creada.celdas} celdas trasladadas.`
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

  const listado = useQuery({
    queryKey: [CLAVE_TANDAS],
    queryFn: () => tandas.listar(),
  })
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
          {formatearFecha(t.fecha_traslarve)}
          {t.retroactivo ? (
            <span className="ml-2 font-sans text-xs text-texto-suave">
              (retroactiva)
            </span>
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
  const cargando = listas.some((l) => l.isPending)
  const error = listas.find((l) => l.isError)?.error

  const nuevo = (
    <Button onClick={() => setAlta(crypto.randomUUID())}>
      <Plus className="size-4" aria-hidden /> Nueva tanda
    </Button>
  )

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo="Tandas"
        descripcion="Cada traslarve, con la raza, su edad y cuántas celdas hay en cada estado. Se da de alta por cuadros: el sistema crea una celda por cúpula."
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

      {cargando ? (
        <Cargando columnas={5} />
      ) : error ? (
        <ErrorDePantalla
          error={describirError(error)}
          reintentar={() => listas.forEach((l) => void l.refetch())}
        />
      ) : (
        <DataTable
          columnas={columnas}
          filas={listado.data?.items ?? []}
          vacio={
            <Vacio
              titulo="Todavía no hay tandas"
              accion={escribe ? nuevo : undefined}
            >
              Una tanda es un traslarve: se carga la raza, la fecha y cuántos
              cuadros de madera se usaron.
            </Vacio>
          }
        />
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
