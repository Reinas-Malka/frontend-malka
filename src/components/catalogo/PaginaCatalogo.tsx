import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
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
import { puede, type Rol } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'

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
  /** El PATCH que vuelve a activar una fila dada de baja: { activo: true }. */
  reactivacion: A
  /** Roles que pueden dar de alta, editar y dar de baja: los mismos que el
   *  require_role del router del backend. Leer, pueden todos. */
  rolesEscritura: readonly Rol[]
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
  const { identidad } = useSesion()
  const escribe = puede(identidad, config.rolesEscritura)
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
  const guardando = crear.isPending || actualizar.isPending

  const abrirBaja = (fila: T) => {
    desactivar.reset() // que no aparezca el error de una baja anterior
    setADarDeBaja(fila)
  }

  const reactivar = (fila: T) =>
    actualizar.mutate(
      { id: fila.id, datos: config.reactivacion },
      {
        onSuccess: () => setAviso(`Se reactivó ${config.nombreDeFila(fila)}.`),
      },
    )

  const columnas: Columna<T>[] = [
    ...config.columnas,
    {
      clave: 'activo',
      titulo: 'Estado',
      render: (f) => <Estado activo={f.activo} femenino={config.femenino} />,
    },
  ]
  // Sin permiso de escritura no hay columna de acciones ni botón de alta.
  if (escribe) {
    columnas.push({
      clave: 'id',
      titulo: 'Acciones',
      className: 'text-right',
      enTarjeta: 'acciones',
      render: (fila) => (
        <AccionesDeFila
          nombre={config.nombreDeFila(fila)}
          activo={fila.activo}
          alEditar={() => setEdicion({ modo: 'edicion', fila })}
          alDarDeBaja={() => abrirBaja(fila)}
          alReactivar={() => reactivar(fila)}
        />
      ),
    })
  }

  async function guardar(valores: Valores) {
    const enCurso = edicion
    if (enCurso?.modo === 'edicion') {
      await actualizar.mutateAsync({
        id: enCurso.fila.id,
        datos: config.aActualizar(valores),
      })
    } else if (enCurso?.modo === 'alta') {
      await crear.mutateAsync({
        datos: config.aCrear(valores),
        claveIdempotencia: enCurso.clave,
      })
    }
    setAviso('Cambios guardados.')
    // Solo cierra el modal que inició este guardado.
    setEdicion((actual) => (actual === enCurso ? null : actual))
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
        acciones={escribe ? agregar : undefined}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          aria-label={`Buscar ${config.titulo.toLowerCase()}`}
          placeholder="Buscar…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-sm"
        />
        <p role="status" className="text-sm text-ok-texto">
          {aviso}
        </p>
      </div>

      {listado.isPending ? (
        <Cargando columnas={columnas.length} />
      ) : listado.isError && listado.filas.length === 0 ? (
        <ErrorDePantalla
          error={describirError(listado.error)}
          reintentar={() => void listado.refetch()}
        />
      ) : (
        <>
          {/* Hay datos pero falló un refresco: se avisa sin esconder la tabla. */}
          {listado.isError ? (
            <ErrorDePantalla
              error={describirError(listado.error)}
              reintentar={() => void listado.refetch()}
            />
          ) : null}
          {actualizar.isError && !edicion ? (
            <ErrorDePantalla error={describirError(actualizar.error)} />
          ) : null}
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
                  : `Cargá el primero con "Agregar ${singular}".`}
              </Vacio>
            }
          />
          {listado.completo ? null : (
            <p role="status" className="text-xs text-texto-suave">
              Cargando el resto de las filas…
            </p>
          )}
        </>
      )}

      <Modal
        open={edicion !== null}
        // Mientras guarda no se cierra: el resultado tiene que verse.
        onOpenChange={(abierto) => !abierto && !guardando && setEdicion(null)}
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
              alCancelar={() => !guardando && setEdicion(null)}
            />
          </ModalContenido>
        ) : null}
      </Modal>

      <ModalDeBaja
        fila={aDarDeBaja}
        nombreDeFila={config.nombreDeFila}
        pendiente={desactivar.isPending}
        error={desactivar.isError ? describirError(desactivar.error) : null}
        alCerrar={() => {
          desactivar.reset()
          setADarDeBaja(null)
        }}
        alConfirmar={(fila) =>
          desactivar.mutate(fila.id, {
            onSuccess: () => {
              setAviso(`Se dio de baja ${config.nombreDeFila(fila)}.`)
              // Solo cierra si sigue abierto el modal de ESTA fila.
              setADarDeBaja((actual) =>
                actual?.id === fila.id ? null : actual,
              )
            },
          })
        }
      />
    </section>
  )
}

function Estado({ activo, femenino }: { activo: boolean; femenino?: boolean }) {
  const sufijo = femenino ? 'a' : 'o'
  return activo ? (
    <Badge tono="ok">{`Activ${sufijo}`}</Badge>
  ) : (
    <Badge>{`Inactiv${sufijo}`}</Badge>
  )
}

function AccionesDeFila({
  nombre,
  activo,
  alEditar,
  alDarDeBaja,
  alReactivar,
}: {
  nombre: string
  activo: boolean
  alEditar: () => void
  alDarDeBaja: () => void
  alReactivar: () => void
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variante="fantasma"
        tamano="chico"
        aria-label={`Editar ${nombre}`}
        onClick={alEditar}
      >
        <Pencil aria-hidden className="size-4" />
      </Button>
      {activo ? (
        <Button
          variante="fantasma"
          tamano="chico"
          aria-label={`Dar de baja ${nombre}`}
          onClick={alDarDeBaja}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      ) : (
        <Button
          variante="fantasma"
          tamano="chico"
          aria-label={`Reactivar ${nombre}`}
          onClick={alReactivar}
        >
          <RotateCcw aria-hidden className="size-4" />
        </Button>
      )}
    </div>
  )
}

function ModalDeBaja<T>({
  fila,
  nombreDeFila,
  pendiente,
  error,
  alCerrar,
  alConfirmar,
}: {
  fila: T | null
  nombreDeFila: (fila: T) => string
  pendiente: boolean
  error: ReturnType<typeof describirError> | null
  alCerrar: () => void
  alConfirmar: (fila: T) => void
}) {
  return (
    <Modal
      open={fila !== null}
      onOpenChange={(abierto) => !abierto && !pendiente && alCerrar()}
    >
      {fila ? (
        <ModalContenido
          titulo={`¿Dar de baja ${nombreDeFila(fila)}?`}
          descripcion="No se borra: queda inactivo, se conserva en el historial y se puede reactivar."
        >
          {error ? <ErrorDePantalla error={error} /> : null}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variante="secundario"
              disabled={pendiente}
              onClick={alCerrar}
            >
              Cancelar
            </Button>
            <Button
              variante="peligro"
              cargando={pendiente}
              onClick={() => alConfirmar(fila)}
            >
              Dar de baja
            </Button>
          </div>
        </ModalContenido>
      ) : null}
    </Modal>
  )
}
