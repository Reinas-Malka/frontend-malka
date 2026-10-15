import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { describirError } from '@/api/client'
import type { Recurso } from '@/api/recurso'
import type { Campo, Valores } from '@/components/catalogo/campos'
import { FormularioRecurso } from '@/components/catalogo/FormularioRecurso'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { Input } from '@/components/ui/input'
import { Modal, ModalContenido } from '@/components/ui/modal'
import { DataTable, type Columna } from '@/components/ui/table'
import { useListado, useMutacionesDe } from '@/hooks/useRecurso'

type Fila = { id: string; activo: boolean }

/** Todo lo que distingue un catálogo de otro. La pantalla es una sola. */
export type ConfigCatalogo<T extends Fila, C, A> = {
  /** Clave de la caché de TanStack Query: una por recurso. */
  clave: string
  titulo: string
  descripcion?: string
  /** "raza", "cliente": arma "Agregar raza", "Editar Carniola"… */
  singular: string
  /** Para concordar "Activa / Inactiva". */
  femenino?: boolean
  recurso: Recurso<T, C, A>
  columnas: Columna<T>[]
  campos: readonly Campo[]
  nombreDeFila: (fila: T) => string
  /** Texto donde busca el buscador; por defecto, el nombre de la fila. */
  textoDeBusqueda?: (fila: T) => string
  valoresIniciales?: Valores
  valoresDeFila: (fila: T) => Valores
  aCrear: (valores: Valores) => C
  aActualizar: (valores: Valores) => A
}

type Edicion<T> = { modo: 'alta'; clave: string } | { modo: 'edicion'; fila: T }

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function PaginaCatalogo<T extends Fila, C, A>({
  config,
}: {
  config: ConfigCatalogo<T, C, A>
}) {
  const { clave, recurso, singular } = config
  const listado = useListado(clave, recurso)
  const { crear, actualizar, desactivar } = useMutacionesDe(clave, recurso)
  const [busqueda, setBusqueda] = useState('')
  const [edicion, setEdicion] = useState<Edicion<T> | null>(null)
  const [aDarDeBaja, setADarDeBaja] = useState<T | null>(null)
  const [aviso, setAviso] = useState('')

  const textoDe = config.textoDeBusqueda ?? config.nombreDeFila
  const filas = busqueda
    ? listado.filas.filter((f) =>
        normalizar(textoDe(f)).includes(normalizar(busqueda)),
      )
    : listado.filas

  const estado = (activo: boolean) => {
    const sufijo = config.femenino ? 'a' : 'o'
    return activo ? (
      <Badge tono="ok">{`Activ${sufijo}`}</Badge>
    ) : (
      <Badge>{`Inactiv${sufijo}`}</Badge>
    )
  }

  const columnas: Columna<T>[] = [
    ...config.columnas,
    { clave: 'activo', titulo: 'Estado', render: (f) => estado(f.activo) },
    {
      clave: 'id',
      titulo: 'Acciones',
      className: 'text-right',
      render: (fila) => (
        <div className="flex justify-end gap-1">
          <Button
            variante="fantasma"
            tamano="chico"
            aria-label={`Editar ${config.nombreDeFila(fila)}`}
            onClick={() => setEdicion({ modo: 'edicion', fila })}
          >
            <Pencil aria-hidden className="size-4" />
          </Button>
          {fila.activo ? (
            <Button
              variante="fantasma"
              tamano="chico"
              aria-label={`Dar de baja ${config.nombreDeFila(fila)}`}
              onClick={() => setADarDeBaja(fila)}
            >
              <Trash2 aria-hidden className="size-4" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  async function guardar(valores: Valores) {
    if (edicion?.modo === 'edicion') {
      await actualizar.mutateAsync({
        id: edicion.fila.id,
        datos: config.aActualizar(valores),
      })
    } else if (edicion?.modo === 'alta') {
      await crear.mutateAsync({
        datos: config.aCrear(valores),
        claveIdempotencia: edicion.clave,
      })
    }
    setAviso('Cambios guardados.')
    setEdicion(null)
  }

  function confirmarBaja() {
    if (!aDarDeBaja) return
    const nombre = config.nombreDeFila(aDarDeBaja)
    // Si falla, el modal queda abierto y muestra el error (desactivar.isError).
    desactivar.mutate(aDarDeBaja.id, {
      onSuccess: () => {
        setAviso(`Se dio de baja ${nombre}.`)
        setADarDeBaja(null)
      },
    })
  }

  const agregar = (
    // La clave de idempotencia se fija al abrir el alta: si el guardado se
    // reintenta, el backend devuelve la misma respuesta en lugar de duplicar.
    <Button
      onClick={() => setEdicion({ modo: 'alta', clave: crypto.randomUUID() })}
    >
      <Plus aria-hidden className="size-4" /> {`Agregar ${singular}`}
    </Button>
  )

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo={config.titulo}
        descripcion={config.descripcion}
        acciones={agregar}
      />

      <Input
        type="search"
        aria-label={`Buscar ${config.titulo.toLowerCase()}`}
        placeholder="Buscar…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="max-w-sm"
      />

      <p role="status" className="sr-only">
        {aviso}
      </p>

      {listado.isPending ? (
        <Cargando columnas={columnas.length} />
      ) : listado.isError ? (
        <ErrorDePantalla
          error={describirError(listado.error)}
          reintentar={() => void listado.refetch()}
        />
      ) : (
        <>
          <DataTable
            columnas={columnas}
            filas={filas}
            vacio={
              <Vacio
                titulo={
                  busqueda
                    ? 'No hay resultados para esa búsqueda.'
                    : `Todavía no hay ${config.titulo.toLowerCase()}.`
                }
              >
                {busqueda
                  ? 'Probá con otro texto.'
                  : `Cargá la primera con "Agregar ${singular}".`}
              </Vacio>
            }
          />
          {listado.hasNextPage ? (
            <Button
              variante="secundario"
              cargando={listado.isFetchingNextPage}
              onClick={() => void listado.fetchNextPage()}
            >
              Cargar más
            </Button>
          ) : null}
        </>
      )}

      <Modal
        open={edicion !== null}
        onOpenChange={(abierto) => !abierto && setEdicion(null)}
      >
        {edicion ? (
          <ModalContenido
            titulo={
              edicion.modo === 'alta'
                ? `Agregar ${singular}`
                : `Editar ${config.nombreDeFila(edicion.fila)}`
            }
          >
            <FormularioRecurso
              key={edicion.modo === 'alta' ? edicion.clave : edicion.fila.id}
              campos={config.campos}
              iniciales={
                edicion.modo === 'alta'
                  ? (config.valoresIniciales ?? {})
                  : config.valoresDeFila(edicion.fila)
              }
              alGuardar={guardar}
              alCancelar={() => setEdicion(null)}
            />
          </ModalContenido>
        ) : null}
      </Modal>

      <Modal
        open={aDarDeBaja !== null}
        onOpenChange={(abierto) => !abierto && setADarDeBaja(null)}
      >
        {aDarDeBaja ? (
          <ModalContenido
            titulo={`¿Dar de baja ${config.nombreDeFila(aDarDeBaja)}?`}
            descripcion="No se borra: queda inactivo y se conserva en el historial."
          >
            {desactivar.isError ? (
              <ErrorDePantalla error={describirError(desactivar.error)} />
            ) : null}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variante="secundario" onClick={() => setADarDeBaja(null)}>
                Cancelar
              </Button>
              <Button
                variante="peligro"
                cargando={desactivar.isPending}
                onClick={confirmarBaja}
              >
                Dar de baja
              </Button>
            </div>
          </ModalContenido>
        ) : null}
      </Modal>
    </section>
  )
}
