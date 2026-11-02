import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { describirError, esApiError } from '@/api/client'
import { clientes } from '@/api/recursos'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Badge } from '@/components/ui/badge'
import { Card, CardTitulo } from '@/components/ui/card'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { nombreDePais } from '@/lib/paises'
import { documentoDelCliente } from '@/modulos/ventas/comprobantes'
import type { Cliente, CondicionIva } from '@/tipos/dominio'

const ENLACE =
  'text-sm font-medium text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento'

const CONDICION: Record<CondicionIva, string> = {
  responsable_inscripto: 'Responsable inscripto',
  monotributo: 'Monotributo',
  exento: 'Exento',
  consumidor_final: 'Consumidor final',
  cliente_exterior: 'Cliente del exterior',
}

const FACTURA: Record<Cliente['tipo_documento_por_defecto'], string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_e: 'Factura E',
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-texto-suave">{nombre}</dt>
      <dd className="min-w-0 break-words text-texto">{children}</dd>
    </div>
  )
}

/** Un cliente (GET /api/v1/clientes/{id}): sus datos fiscales y el acceso
 *  a sus pedidos y comprobantes, ya filtrados. Se edita desde Clientes. */
export default function ClientePage() {
  const { id = '' } = useParams()
  const consulta = useQuery({
    queryKey: ['clientes', 'detalle', id],
    queryFn: () => clientes.obtener(id),
  })

  const volver = (
    <Link
      to="/ventas/clientes"
      className="inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto focus-visible:outline-2 focus-visible:outline-acento"
    >
      <ArrowLeft className="size-4" aria-hidden /> Clientes
    </Link>
  )

  if (consulta.isPending)
    return (
      <section className="space-y-seccion">
        {volver}
        <Cargando columnas={2} filas={5} />
      </section>
    )
  if (esApiError(consulta.error) && consulta.error.status === 404)
    return (
      <section className="space-y-seccion">
        {volver}
        <Vacio titulo="No encontramos este cliente">
          Puede que el enlace esté mal o que sea de otro criadero.
        </Vacio>
      </section>
    )
  if (consulta.isError)
    return (
      <section className="space-y-seccion">
        {volver}
        <ErrorDePantalla
          error={describirError(consulta.error)}
          reintentar={() => void consulta.refetch()}
        />
      </section>
    )

  const c = consulta.data
  const filtro = `?cliente=${encodeURIComponent(c.id)}`
  return (
    <section className="space-y-seccion">
      {volver}
      <EncabezadoDePagina
        titulo={c.nombre}
        descripcion={
          c.tipo === 'exportacion'
            ? `Cliente de exportación en ${nombreDePais(c.pais)}.`
            : 'Cliente nacional.'
        }
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="space-y-3">
          <CardTitulo>Datos fiscales</CardTitulo>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Dato nombre="Estado">
              {c.activo ? (
                <Badge tono="ok">Activo</Badge>
              ) : (
                <Badge>Dado de baja</Badge>
              )}
            </Dato>
            <Dato nombre="País">{nombreDePais(c.pais)}</Dato>
            <Dato nombre="Condición frente al IVA">
              {CONDICION[c.condicion_iva]}
            </Dato>
            <Dato nombre="Identificación">
              <span className="tabular-nums">{documentoDelCliente(c)}</span>
            </Dato>
            <Dato nombre="Factura sugerida">
              {FACTURA[c.tipo_documento_por_defecto]}
              <span className="block text-xs text-texto-suave">
                La letra la asigna ARCA: acá solo se sugiere.
              </span>
            </Dato>
          </dl>
        </Card>

        <Card className="space-y-3">
          <CardTitulo>Movimientos</CardTitulo>
          <ul className="space-y-2">
            <li>
              <Link
                to={{ pathname: '/ventas/pedidos', search: filtro }}
                className={ENLACE}
              >
                Ver sus pedidos
              </Link>
            </li>
            <li>
              <Link
                to={{ pathname: '/ventas/comprobantes', search: filtro }}
                className={ENLACE}
              >
                Ver sus comprobantes
              </Link>
            </li>
          </ul>
        </Card>
      </div>
    </section>
  )
}
