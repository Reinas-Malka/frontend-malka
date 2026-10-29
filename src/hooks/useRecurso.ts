import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Recurso } from '@/api/recurso'

/** Máximo que acepta el backend por página (app/paginacion.py). */
const LIMITE_MAXIMO = 100

/** Listado COMPLETO de un catálogo: pide páginas por cursor hasta el final.
 *  Los catálogos son chicos (decenas o cientos de filas) y así la búsqueda y
 *  el orden de la tabla ven todas las filas, no solo la primera página. */
export function useListado<T, C, A>(
  clave: string,
  recurso: Recurso<T, C, A>,
  filtros?: Record<string, string>,
) {
  const consulta = useInfiniteQuery({
    // La clave empieza por el recurso: invalidar [clave] refresca todos sus
    // listados, con y sin filtros.
    queryKey: filtros ? [clave, filtros] : [clave],
    queryFn: ({ pageParam }) =>
      recurso.listar({ cursor: pageParam, limite: LIMITE_MAXIMO, filtros }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.siguiente ?? undefined,
  })
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = consulta

  // Sincroniza con el servidor (efecto legítimo): sigue pidiendo mientras haya cursor.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage])

  const filas = consulta.data?.pages.flatMap((pagina) => pagina.items) ?? []
  return { ...consulta, filas, completo: !hasNextPage }
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
