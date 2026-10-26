import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { describirError } from '@/api/client'
import { embarques } from '@/api/embarques'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import type { Valores } from '@/components/catalogo/campos'
import { FormularioRecurso } from '@/components/catalogo/FormularioRecurso'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { Modal, ModalContenido } from '@/components/ui/modal'
import { DataTable, type Columna } from '@/components/ui/table'
import { nombreDePais } from '@/lib/paises'
import {
  CAMPOS_ALTA,
  CLAVE_EMBARQUES,
  ROLES_EXPORTACION,
  aEmbarqueCrear,
} from '@/modulos/exportacion/embarques'
import {
  EstadoDeEmbarque,
  IndicadorDeDocumentos,
} from '@/modulos/exportacion/insignias'
import type { Embarque } from '@/tipos/dominio'

const columnas: Columna<Embarque>[] = [
  {
    clave: 'destino_pais',
    titulo: 'Destino',
    render: (e) => (
      <Link
        to={`/exportacion/embarques/${e.id}`}
        className="font-medium text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
      >
        {nombreDePais(e.destino_pais)}
      </Link>
    ),
    orden: (a, b) => a.destino_pais.localeCompare(b.destino_pais),
  },
  {
    clave: 'fecha_vuelo',
    titulo: 'Vuelo',
    render: (e) => (
      <span className="font-mono tabular-nums">{e.fecha_vuelo}</span>
    ),
    orden: (a, b) => a.fecha_vuelo.localeCompare(b.fecha_vuelo),
  },
  {
    clave: 'awb',
    titulo: 'Guía aérea',
    render: (e) =>
      e.awb ? (
        <span className="font-mono">{e.awb}</span>
      ) : (
        <span className="text-texto-suave">Sin asignar</span>
      ),
  },
  {
    clave: 'estado',
    titulo: 'Estado',
    render: (e) => <EstadoDeEmbarque estado={e.estado} />,
  },
  {
    clave: 'documentos_cargados',
    titulo: 'Documentos',
    render: (e) => <IndicadorDeDocumentos cargados={e.documentos_cargados} />,
    orden: (a, b) => a.documentos_cargados - b.documentos_cargados,
  },
]

export default function EmbarquesPage() {
  const { identidad } = useSesion()
  const escribe = puede(identidad, ROLES_EXPORTACION)
  const cliente = useQueryClient()
  const [alta, setAlta] = useState<string | null>(null)

  const listado = useQuery({
    queryKey: [CLAVE_EMBARQUES],
    queryFn: () => embarques.listar(),
  })
  const crear = useMutation({
    mutationFn: ({ valores, clave }: { valores: Valores; clave: string }) =>
      embarques.crear(aEmbarqueCrear(valores), clave),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: [CLAVE_EMBARQUES] })
      setAlta(null)
    },
  })

  const nuevo = (
    <Button onClick={() => setAlta(crypto.randomUUID())}>
      <Plus className="size-4" aria-hidden /> Nuevo embarque
    </Button>
  )

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo="Embarques"
        descripcion="Cada envío de exportación y sus 6 documentos. Entrá a uno para ver qué falta y cargarlo."
        acciones={escribe ? nuevo : undefined}
      />

      {listado.isPending ? (
        <Cargando columnas={5} />
      ) : listado.isError ? (
        <ErrorDePantalla
          error={describirError(listado.error)}
          reintentar={() => void listado.refetch()}
        />
      ) : (
        <DataTable
          columnas={columnas}
          filas={listado.data.items}
          vacio={
            <Vacio
              titulo="Todavía no hay embarques"
              accion={escribe ? nuevo : undefined}
            >
              Un embarque agrupa el envío y sus 6 documentos: factura E, permiso
              de embarque, guía aérea, lista de empaque, DTe y shipper&apos;s
              certificate.
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
            titulo="Nuevo embarque"
            descripcion="Arranca en preparación. Los documentos se cargan desde su detalle."
          >
            <FormularioRecurso
              key={alta}
              campos={CAMPOS_ALTA}
              iniciales={{}}
              textoGuardar="Crear embarque"
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
