/** Embarques y sus documentos (backend #109). No es un catálogo: no tiene
 *  baja (se cancela con un PATCH) y tiene sub-recursos, así que no usa
 *  Recurso. Mismo esquema que api/recursos.ts: dos implementaciones con la
 *  misma firma y un solo swap por VITE_DATOS_SIMULADOS. */
import { ApiError, request } from '@/api/client'
import type { Pagina } from '@/api/recurso'
import { usaDatosSimulados } from '@/datos/cliente'
import { DATOS_SIMULADOS } from '@/datos/simulados'
import { normalizarAwb } from '@/lib/awb'
import {
  DOCUMENTOS_DEL_EMBARQUE,
  type Completitud,
  type DocumentoCrear,
  type DocumentoEmbarque,
  type Embarque,
  type EmbarqueActualizar,
  type EmbarqueCrear,
  type TipoDocumentoEmbarque,
} from '@/tipos/dominio'

export interface ApiEmbarques {
  listar(cursor?: string): Promise<Pagina<Embarque>>
  obtener(id: string): Promise<Embarque>
  crear(datos: EmbarqueCrear, claveIdempotencia?: string): Promise<Embarque>
  actualizar(id: string, datos: EmbarqueActualizar): Promise<Embarque>
  listarDocumentos(id: string): Promise<Pagina<DocumentoEmbarque>>
  agregarDocumento(
    id: string,
    datos: DocumentoCrear,
    claveIdempotencia?: string,
  ): Promise<DocumentoEmbarque>
  completitud(id: string): Promise<Completitud>
}

const RUTA = '/api/v1/embarques'
const LIMITE_MAXIMO = 100

export function embarquesHttp(): ApiEmbarques {
  const de = (id: string) => `${RUTA}/${encodeURIComponent(id)}`
  return {
    listar: (cursor) =>
      request<Pagina<Embarque>>(RUTA, {
        query: { limite: LIMITE_MAXIMO, cursor },
      }),
    obtener: (id) => request<Embarque>(de(id)),
    crear: (datos, claveIdempotencia) =>
      request<Embarque>(RUTA, {
        metodo: 'POST',
        cuerpo: datos,
        claveIdempotencia,
      }),
    actualizar: (id, datos) =>
      request<Embarque>(de(id), { metodo: 'PATCH', cuerpo: datos }),
    listarDocumentos: (id) =>
      request<Pagina<DocumentoEmbarque>>(`${de(id)}/documentos`),
    agregarDocumento: (id, datos, claveIdempotencia) =>
      request<DocumentoEmbarque>(`${de(id)}/documentos`, {
        metodo: 'POST',
        cuerpo: datos,
        claveIdempotencia,
      }),
    completitud: (id) => request<Completitud>(`${de(id)}/completitud`),
  }
}

/** Qué documentos tiene el embarque y cuáles faltan, en el orden fijo de
 *  los 6 (igual que completitud() del backend). */
export function calcularCompletitud(
  embarqueId: string,
  tipos: readonly TipoDocumentoEmbarque[],
): Completitud {
  const cargados = new Set(tipos)
  const presentes = DOCUMENTOS_DEL_EMBARQUE.filter((t) => cargados.has(t))
  const faltantes = DOCUMENTOS_DEL_EMBARQUE.filter((t) => !cargados.has(t))
  return {
    embarque_id: embarqueId,
    completo: faltantes.length === 0,
    presentes,
    faltantes,
  }
}

const conflicto = (codigo: string, mensaje: string) =>
  new ApiError({ status: 409, codigo, mensaje })

/** En memoria para la demo sin backend. Repite las reglas del repositorio
 *  del backend, así la pantalla se comporta igual que con la API. */
export function embarquesSimulados(
  semilla: readonly Embarque[] = DATOS_SIMULADOS.embarques,
  documentosSemilla: readonly DocumentoEmbarque[] = DATOS_SIMULADOS.documentosEmbarque,
): ApiEmbarques {
  let embarques = semilla.map((e) => ({ ...e }))
  let documentos = documentosSemilla.map((d) => ({ ...d }))
  const porClave = new Map<string, Embarque | DocumentoEmbarque>()

  const conConteo = (e: Embarque): Embarque => ({
    ...e,
    documentos_cargados: documentos.filter((d) => d.embarque_id === e.id)
      .length,
  })
  const buscar = (id: string): Embarque => {
    const embarque = embarques.find((e) => e.id === id)
    if (!embarque)
      throw new ApiError({
        status: 404,
        codigo: 'embarque_no_encontrado',
        mensaje: 'No existe el embarque.',
      })
    return conConteo(embarque)
  }
  const abierto = (id: string): Embarque => {
    const embarque = buscar(id)
    if (embarque.estado === 'cancelado')
      throw conflicto(
        'embarque_cancelado',
        'El embarque está cancelado: ya no se modifica.',
      )
    return embarque
  }
  const awbRepetida = (awb: string | null | undefined, propio?: string) =>
    awb != null && embarques.some((e) => e.awb === awb && e.id !== propio)
  const unaVez = <T extends Embarque | DocumentoEmbarque>(
    clave: string | undefined,
    alta: () => T,
  ): T => {
    const previa = clave ? porClave.get(clave) : undefined
    if (previa) return previa as T
    const nueva = alta()
    if (clave) porClave.set(clave, nueva)
    return nueva
  }

  return {
    listar: async () => ({
      // Como el backend: el vuelo más nuevo primero.
      items: [...embarques]
        .sort((a, b) => b.fecha_vuelo.localeCompare(a.fecha_vuelo))
        .map(conConteo),
      siguiente: null,
    }),
    obtener: async (id) => buscar(id),
    crear: async (datos, clave) =>
      unaVez(clave, () => {
        const awb = datos.awb ? normalizarAwb(datos.awb) : null
        if (awbRepetida(awb))
          throw conflicto(
            'awb_duplicado',
            'Ya hay un embarque con esa guía aérea.',
          )
        const nuevo: Embarque = {
          id: crypto.randomUUID(),
          destino_pais: datos.destino_pais.trim().toUpperCase(),
          fecha_vuelo: datos.fecha_vuelo,
          awb,
          estado: 'en_preparacion',
          documentos_cargados: 0,
        }
        embarques = [...embarques, nuevo]
        return nuevo
      }),
    actualizar: async (id, datos) => {
      const actual = abierto(id)
      const awb =
        datos.awb === undefined
          ? actual.awb
          : datos.awb && normalizarAwb(datos.awb)
      const estado = datos.estado ?? actual.estado
      if (!awb && (estado === 'en_transito' || estado === 'entregado'))
        throw new ApiError({
          status: 422,
          codigo: 'validacion',
          mensaje:
            'Un embarque en tránsito o entregado necesita la guía aérea.',
        })
      if (awbRepetida(awb, id))
        throw conflicto(
          'awb_duplicado',
          'Ya hay un embarque con esa guía aérea.',
        )
      const nuevo: Embarque = {
        ...actual,
        destino_pais: datos.destino_pais ?? actual.destino_pais,
        fecha_vuelo: datos.fecha_vuelo ?? actual.fecha_vuelo,
        awb: awb ?? null,
        estado,
      }
      embarques = embarques.map((e) => (e.id === id ? nuevo : e))
      return conConteo(nuevo)
    },
    listarDocumentos: async (id) => {
      buscar(id)
      const orden = (d: DocumentoEmbarque) =>
        DOCUMENTOS_DEL_EMBARQUE.indexOf(d.tipo)
      return {
        items: documentos
          .filter((d) => d.embarque_id === id)
          .sort((a, b) => orden(a) - orden(b)),
        siguiente: null,
      }
    },
    agregarDocumento: async (id, datos, clave) =>
      unaVez(clave, () => {
        abierto(id)
        if (
          documentos.some((d) => d.embarque_id === id && d.tipo === datos.tipo)
        )
          throw conflicto(
            'documento_duplicado',
            'El embarque ya tiene un documento de ese tipo.',
          )
        const nuevo: DocumentoEmbarque = {
          id: crypto.randomUUID(),
          embarque_id: id,
          ...datos,
          numero: datos.numero.trim(),
        }
        documentos = [...documentos, nuevo]
        return nuevo
      }),
    completitud: async (id) => {
      buscar(id)
      return calcularCompletitud(
        id,
        documentos.filter((d) => d.embarque_id === id).map((d) => d.tipo),
      )
    },
  }
}

export const embarques: ApiEmbarques = usaDatosSimulados(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
  ? embarquesSimulados()
  : embarquesHttp()
