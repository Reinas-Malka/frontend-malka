import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { Recurso } from '@/api/recurso'

/** Listado de un recurso con la paginación por cursor del backend: junta
 *  las páginas cargadas y expone "cargar más". La clave identifica la caché. */
export function useListado<T, C, A>(clave: string, recurso: Recurso<T, C, A>) {
  const consulta = useInfiniteQuery({
    queryKey: [clave],
    queryFn: ({ pageParam }) => recurso.listar({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.siguiente ?? undefined,
  })
  const filas = consulta.data?.pages.flatMap((pagina) => pagina.items) ?? []
  return { ...consulta, filas }
}

/** Alta, edición y baja de un recurso; cada una invalida su listado. */
export function useMutacionesDe<T, C, A>(
  clave: string,
  recurso: Recurso<T, C, A>,
) {
  const cliente = useQueryClient()
  const alTerminar = () => cliente.invalidateQueries({ queryKey: [clave] })

  const crear = useMutation({
    mutationFn: ({
      datos,
      claveIdempotencia,
    }: {
      datos: C
      claveIdempotencia: string
    }) => recurso.crear(datos, claveIdempotencia),
    onSuccess: alTerminar,
  })
  const actualizar = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: A }) =>
      recurso.actualizar(id, datos),
    onSuccess: alTerminar,
  })
  const desactivar = useMutation({
    mutationFn: (id: string) => recurso.desactivar(id),
    onSuccess: alTerminar,
  })
  return { crear, actualizar, desactivar }
}
