import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Download, Pencil, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { describirError } from '@/api/client'
import { pedirDescarga } from '@/api/documentos'
import { embarques } from '@/api/embarques'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import type { Valores } from '@/components/catalogo/campos'
import { FormularioRecurso } from '@/components/catalogo/FormularioRecurso'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'
import { Modal, ModalContenido } from '@/components/ui/modal'
import { nombreDePais } from '@/lib/paises'
import { CargaDeDocumento } from '@/modulos/exportacion/CargaDeDocumento'
import {
  CAMPOS_EDICION,
  CLAVE_EMBARQUES,
  ROLES_EXPORTACION,
  SIGUIENTE_PASO,
  aEmbarqueActualizar,
  sePuedeCancelar,
  valoresDeEmbarque,
} from '@/modulos/exportacion/embarques'
import { EstadoDeEmbarque } from '@/modulos/exportacion/insignias'
import {
  DOCUMENTO_DEL_EMBARQUE,
  DOCUMENTOS_DEL_EMBARQUE,
  type Completitud,
  type DocumentoCrear,
  type DocumentoEmbarque,
  type EstadoEmbarque,
  type TipoDocumentoEmbarque,
} from '@/tipos/dominio'
import { formatearFecha } from '@/lib/fechas'

type Dialogo =
  | { tipo: 'edicion' }
  | { tipo: 'cancelacion' }
  | { tipo: 'carga'; documento: TipoDocumentoEmbarque; clave: string }

function ResumenDeCompletitud({ completitud }: { completitud: Completitud }) {
  const total = DOCUMENTOS_DEL_EMBARQUE.length
  const cargados = completitud.presentes.length
  return (
    <div
      role="status"
      className={
        completitud.completo
          ? 'rounded-tarjeta border border-ok/40 bg-ok/10 p-4'
          : 'rounded-tarjeta border border-aviso/40 bg-aviso/10 p-4'
      }
    >
      <p className="text-2xl font-semibold text-texto">
        <span className="font-mono tabular-nums">
          {cargados} de {total}
        </span>{' '}
        documentos
      </p>
      <p className="mt-1 text-sm text-texto-suave">
        {completitud.completo
          ? 'Tiene los 6 documentos: el envío está completo.'
          : `Faltan: ${completitud.faltantes
              .map((t) => DOCUMENTO_DEL_EMBARQUE[t].nombre)
              .join(', ')}.`}
      </p>
    </div>
  )
}

export default function EmbarquePage() {
  const { id = '' } = useParams()
  const { identidad } = useSesion()
  const cliente = useQueryClient()
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [descargando, setDescargando] = useState<string | null>(null)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)

  // La URL vence en 2 minutos: se pide recién al tocar, nunca antes.
  async function descargar(doc: DocumentoEmbarque) {
    setDescargando(doc.id)
    setErrorDescarga(null)
    try {
      const { url_descarga } = await pedirDescarga(doc.archivo_s3_key)
      window.location.assign(url_descarga)
    } catch (error) {
      setErrorDescarga(describirError(error).mensaje)
    } finally {
      setDescargando(null)
    }
  }

  const embarque = useQuery({
    queryKey: [CLAVE_EMBARQUES, id],
    queryFn: () => embarques.obtener(id),
  })
  const documentos = useQuery({
    queryKey: [CLAVE_EMBARQUES, id, 'documentos'],
    queryFn: () => embarques.listarDocumentos(id),
  })
  const completitud = useQuery({
    queryKey: [CLAVE_EMBARQUES, id, 'completitud'],
    queryFn: () => embarques.completitud(id),
  })

  // Cualquier cambio refresca el embarque, sus documentos y el listado ("4/6").
  const alCambiar = () => {
    void cliente.invalidateQueries({ queryKey: [CLAVE_EMBARQUES] })
    setDialogo(null)
  }
  const editar = useMutation({
    mutationFn: (valores: Valores) =>
      embarques.actualizar(id, aEmbarqueActualizar(valores)),
    onSuccess: alCambiar,
  })
  // El estado avanza con botones, como el pedido: nunca desde el formulario.
  const cambiarEstado = useMutation({
    mutationFn: (estado: EstadoEmbarque) =>
      embarques.actualizar(id, { estado }),
    onSuccess: alCambiar,
  })
  const cargar = useMutation({
    mutationFn: ({ datos, clave }: { datos: DocumentoCrear; clave: string }) =>
      embarques.agregarDocumento(id, datos, clave),
    onSuccess: alCambiar,
  })

  const volver = (
    <Link
      to="/exportacion/embarques"
      className="inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto focus-visible:outline-2 focus-visible:outline-acento"
    >
      <ArrowLeft className="size-4" aria-hidden /> Embarques
    </Link>
  )

  if (embarque.isPending || documentos.isPending || completitud.isPending)
    return (
      <section className="space-y-seccion">
        {volver}
        <Cargando columnas={3} filas={6} />
      </section>
    )
  const error = embarque.error ?? documentos.error ?? completitud.error
  if (error || !embarque.data || !documentos.data || !completitud.data)
    return (
      <section className="space-y-seccion">
        {volver}
        <ErrorDePantalla
          error={describirError(error)}
          reintentar={() => {
            void embarque.refetch()
            void documentos.refetch()
            void completitud.refetch()
          }}
        />
      </section>
    )

  const e = embarque.data
  const cancelado = e.estado === 'cancelado'
  const escribe = puede(identidad, ROLES_EXPORTACION) && !cancelado
  const porTipo = new Map<TipoDocumentoEmbarque, DocumentoEmbarque>(
    documentos.data.items.map((d) => [d.tipo, d]),
  )
  const ocupado =
    editar.isPending || cargar.isPending || cambiarEstado.isPending
  const siguiente = escribe ? SIGUIENTE_PASO[e.estado] : undefined
  // Tránsito y entregado piden la guía aérea (CHECK de la 0010).
  const faltaGuia = siguiente !== undefined && !e.awb

  return (
    <section className="space-y-seccion">
      {volver}
      <EncabezadoDePagina
        titulo={`Embarque a ${nombreDePais(e.destino_pais)}`}
        descripcion={`Vuelo del ${formatearFecha(e.fecha_vuelo)} · Guía aérea ${e.awb ?? 'sin asignar'}`}
        acciones={
          escribe ? (
            <>
              {siguiente ? (
                <Button
                  disabled={ocupado || faltaGuia}
                  cargando={cambiarEstado.isPending}
                  onClick={() => cambiarEstado.mutate(siguiente.estado)}
                >
                  {siguiente.texto}
                </Button>
              ) : null}
              <Button
                variante="secundario"
                disabled={ocupado}
                onClick={() => setDialogo({ tipo: 'edicion' })}
              >
                <Pencil className="size-4" aria-hidden /> Editar embarque
              </Button>
              {sePuedeCancelar(e.estado) ? (
                <Button
                  variante="secundario"
                  disabled={ocupado}
                  onClick={() => setDialogo({ tipo: 'cancelacion' })}
                >
                  <Ban className="size-4" aria-hidden /> Cancelar embarque
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <EstadoDeEmbarque estado={e.estado} />
        {cancelado ? (
          <span className="text-sm text-texto-suave">
            Cancelado: ya no se edita ni recibe documentos.
          </span>
        ) : faltaGuia ? (
          <span className="text-sm text-texto-suave">
            Cargá la guía aérea para pasar a tránsito.
          </span>
        ) : null}
      </div>
      {cambiarEstado.isError && dialogo === null ? (
        <ErrorDePantalla error={describirError(cambiarEstado.error)} />
      ) : null}

      <ResumenDeCompletitud completitud={completitud.data} />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Los 6 documentos</h2>
        <ul className="divide-y divide-borde rounded-tarjeta border border-borde bg-panel">
          {DOCUMENTOS_DEL_EMBARQUE.map((tipo) => {
            const { nombre, emisor } = DOCUMENTO_DEL_EMBARQUE[tipo]
            const doc = porTipo.get(tipo)
            return (
              <li
                key={tipo}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-texto">{nombre}</p>
                  <p className="text-xs text-texto-suave">Lo emite: {emisor}</p>
                  {doc ? (
                    <p className="break-all font-mono text-xs text-texto-suave">
                      N.º {doc.numero} · {formatearFecha(doc.fecha)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {doc ? (
                    <Badge tono="ok">Cargado</Badge>
                  ) : (
                    <Badge tono="aviso">Falta</Badge>
                  )}
                  {doc ? (
                    <Button
                      tamano="chico"
                      variante="secundario"
                      aria-label={`Descargar ${nombre}`}
                      cargando={descargando === doc.id}
                      onClick={() => void descargar(doc)}
                    >
                      <Download className="size-4" aria-hidden /> Descargar
                    </Button>
                  ) : null}
                  {!doc && escribe ? (
                    <Button
                      tamano="chico"
                      aria-label={`Cargar ${nombre}`}
                      onClick={() =>
                        setDialogo({
                          tipo: 'carga',
                          documento: tipo,
                          clave: crypto.randomUUID(),
                        })
                      }
                    >
                      <Upload className="size-4" aria-hidden /> Cargar
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
        {errorDescarga ? (
          <p
            role="alert"
            className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
          >
            {errorDescarga}
          </p>
        ) : null}
      </div>

      <Modal
        open={dialogo !== null}
        onOpenChange={(abierto) => !abierto && !ocupado && setDialogo(null)}
      >
        {dialogo?.tipo === 'edicion' ? (
          <ModalContenido titulo="Editar embarque">
            <FormularioRecurso
              campos={CAMPOS_EDICION}
              iniciales={valoresDeEmbarque(e)}
              alGuardar={(valores) => editar.mutateAsync(valores)}
              alCancelar={() => !ocupado && setDialogo(null)}
            />
          </ModalContenido>
        ) : dialogo?.tipo === 'cancelacion' ? (
          <ModalContenido
            titulo="¿Cancelar el embarque?"
            descripcion="Un embarque cancelado ya no se edita ni recibe documentos. No se puede deshacer."
          >
            {cambiarEstado.isError ? (
              <ErrorDePantalla error={describirError(cambiarEstado.error)} />
            ) : null}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variante="secundario"
                disabled={cambiarEstado.isPending}
                onClick={() => setDialogo(null)}
              >
                Volver
              </Button>
              <Button
                variante="peligro"
                cargando={cambiarEstado.isPending}
                onClick={() => cambiarEstado.mutate('cancelado')}
              >
                Cancelar embarque
              </Button>
            </div>
          </ModalContenido>
        ) : dialogo?.tipo === 'carga' ? (
          <ModalContenido
            titulo={`Cargar ${DOCUMENTO_DEL_EMBARQUE[dialogo.documento].nombre}`}
            descripcion={`Lo emite: ${DOCUMENTO_DEL_EMBARQUE[dialogo.documento].emisor}. Se registra el número tal como figura en el documento.`}
          >
            <CargaDeDocumento
              key={dialogo.clave}
              tipo={dialogo.documento}
              alGuardar={(datos) =>
                cargar.mutateAsync({ datos, clave: dialogo.clave })
              }
              alCancelar={() => !ocupado && setDialogo(null)}
            />
          </ModalContenido>
        ) : null}
      </Modal>
    </section>
  )
}
