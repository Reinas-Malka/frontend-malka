import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { describirError } from '@/api/client'
import { movimientos, type MovimientoCrear } from '@/api/movimientos'
import { materiales } from '@/api/recursos'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import type { Campo, Valores } from '@/components/catalogo/campos'
import { FormularioRecurso } from '@/components/catalogo/FormularioRecurso'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { Modal, ModalContenido } from '@/components/ui/modal'
import { DataTable, type Columna } from '@/components/ui/table'
import type { MovimientoMaterial } from '@/tipos/dominio'

const CANTIDAD = /^-?\d{1,9}(\.\d{1,3})?$/ // numeric(12, 3) de la 0004

const TONO = { compra: 'ok', consumo: 'miel', ajuste: 'aviso' } as const

const columnas: Columna<MovimientoMaterial>[] = [
  {
    clave: 'fecha',
    titulo: 'Fecha',
    render: (m) => <span className="font-mono tabular-nums">{m.fecha}</span>,
    orden: (a, b) => a.fecha.localeCompare(b.fecha),
  },
  {
    clave: 'tipo',
    titulo: 'Tipo',
    render: (m) => <Badge tono={TONO[m.tipo]}>{m.tipo}</Badge>,
  },
  {
    clave: 'cantidad',
    titulo: 'Cantidad',
    render: (m) => (
      <span className="font-mono tabular-nums">
        {Number(m.cantidad) > 0 ? '+' : ''}
        {Number(m.cantidad).toLocaleString('es-AR')}
      </span>
    ),
  },
  {
    clave: 'motivo',
    titulo: 'Motivo',
    render: (m) =>
      m.motivo ?? (m.tanda_id ? 'Consumo del alta de una tanda' : '—'),
  },
]

const campos: readonly Campo[] = [
  {
    nombre: 'tipo',
    etiqueta: 'Tipo',
    tipo: 'seleccion',
    requerido: true,
    opciones: () => [
      { valor: 'compra', etiqueta: 'Compra (suma stock)' },
      { valor: 'ajuste', etiqueta: 'Ajuste (con signo y motivo)' },
    ],
    ayuda: 'El consumo no se carga a mano: lo registra el alta de tanda.',
  },
  {
    nombre: 'cantidad',
    etiqueta: 'Cantidad',
    requerido: true,
    placeholder: '1000',
    validar: (v, valores) => {
      if (!CANTIDAD.test(v)) return 'Usá un número, con hasta 3 decimales.'
      if (Number(v) === 0) return 'La cantidad no puede ser 0.'
      if (valores.tipo === 'compra' && Number(v) < 0)
        return 'Una compra suma stock: va en positivo.'
      return null
    },
  },
  {
    nombre: 'motivo',
    etiqueta: 'Motivo',
    max: 200,
    visible: (v) => v.tipo === 'ajuste',
    requerido: true,
  },
  { nombre: 'fecha', etiqueta: 'Fecha (opcional)', tipo: 'fecha' },
]

const aMovimiento = (v: Valores): MovimientoCrear => ({
  tipo: v.tipo as MovimientoCrear['tipo'],
  cantidad: v.cantidad.trim(),
  motivo: v.tipo === 'ajuste' ? v.motivo.trim() : null,
  fecha: v.fecha || null,
})

/** Detalle de un material: su stock y sus movimientos (backend #30). */
export default function MaterialPage() {
  const { id = '' } = useParams()
  const { identidad } = useSesion()
  const escribe = puede(identidad, ['admin', 'produccion'])
  const cliente = useQueryClient()
  const [alta, setAlta] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const material = useQuery({
    queryKey: ['materiales', id],
    queryFn: () => materiales.obtener(id),
  })
  const listado = useQuery({
    queryKey: ['materiales', id, 'movimientos'],
    queryFn: () => movimientos.listar(id),
  })
  const registrar = useMutation({
    mutationFn: ({ valores, clave }: { valores: Valores; clave: string }) =>
      movimientos.registrar(id, aMovimiento(valores), clave),
    onSuccess: (guardado) => {
      void cliente.invalidateQueries({ queryKey: ['materiales'] })
      setAlta(null)
      setAviso(
        guardado.advertencias.some((a) => a.code === 'stock_negativo')
          ? `Registrado. El stock quedó negativo (${guardado.stock}): revisá si falta cargar una compra.`
          : `Registrado. Stock actual: ${guardado.stock}.`,
      )
    },
  })

  const volver = (
    <Link
      to="/produccion/materiales"
      className="inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto focus-visible:outline-2 focus-visible:outline-acento"
    >
      <ArrowLeft className="size-4" aria-hidden /> Materiales
    </Link>
  )

  if (material.isPending || listado.isPending)
    return (
      <section className="space-y-seccion">
        {volver}
        <Cargando columnas={4} />
      </section>
    )
  const error = material.error ?? listado.error
  if (error || !material.data || !listado.data)
    return (
      <section className="space-y-seccion">
        {volver}
        <ErrorDePantalla
          error={describirError(error)}
          reintentar={() => {
            void material.refetch()
            void listado.refetch()
          }}
        />
      </section>
    )

  const m = material.data
  const nuevo = (
    <Button onClick={() => setAlta(crypto.randomUUID())}>
      <Plus className="size-4" aria-hidden /> Registrar compra o ajuste
    </Button>
  )

  return (
    <section className="space-y-seccion">
      {volver}
      <EncabezadoDePagina
        titulo={m.nombre}
        descripcion={`Stock: ${Number(m.stock).toLocaleString('es-AR')} ${m.unidad}. Es la suma de los movimientos: nunca se edita a mano.`}
        acciones={escribe ? nuevo : undefined}
      />
      {aviso ? (
        <p
          role="status"
          className="rounded-control border border-borde bg-panel p-3 text-sm text-texto"
        >
          {aviso}
        </p>
      ) : null}
      <DataTable
        columnas={columnas}
        filas={listado.data.items}
        vacio={
          <Vacio titulo="Sin movimientos todavía">
            La primera compra suma el stock; los consumos los registra el alta
            de cada tanda.
          </Vacio>
        }
      />
      <Modal
        open={alta !== null}
        onOpenChange={(abierto) =>
          !abierto && !registrar.isPending && setAlta(null)
        }
      >
        {alta ? (
          <ModalContenido titulo={`Movimiento de ${m.nombre}`}>
            <FormularioRecurso
              key={alta}
              campos={campos}
              iniciales={{ tipo: 'compra' }}
              textoGuardar="Registrar"
              alGuardar={(valores) =>
                registrar.mutateAsync({ valores, clave: alta })
              }
              alCancelar={() => !registrar.isPending && setAlta(null)}
            />
          </ModalContenido>
        ) : null}
      </Modal>
    </section>
  )
}
