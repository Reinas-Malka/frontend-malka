import { describirError } from '@/api/client'
import { Button } from '@/components/ui/button'

/** Lo que usa de un useInfiniteQuery: sin atarse al tipo de las filas. */
export type ConsultaPaginada = {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  isRefetchError: boolean
  error: unknown
  fetchNextPage: () => Promise<unknown>
}

/** Pie de un listado paginado por cursor: el botón para traer la página
 *  siguiente (solo si el backend dijo que hay más) y, si esa página o un
 *  refresco fallan, el error sin perder las filas ya cargadas. */
export function CargarMas({
  consulta,
  texto,
}: {
  consulta: ConsultaPaginada
  texto: string
}) {
  return (
    <>
      {consulta.isFetchNextPageError || consulta.isRefetchError ? (
        <p
          role="alert"
          className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
        >
          {describirError(consulta.error).mensaje}
        </p>
      ) : null}
      {consulta.hasNextPage ? (
        <Button
          variante="secundario"
          cargando={consulta.isFetchingNextPage}
          onClick={() => void consulta.fetchNextPage()}
        >
          {texto}
        </Button>
      ) : null}
    </>
  )
}
