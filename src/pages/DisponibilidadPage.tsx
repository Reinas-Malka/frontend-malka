import { useQuery } from '@tanstack/react-query'
import { Warehouse } from 'lucide-react'
import { Link } from 'react-router'
import { describirError } from '@/api/client'
import { disponibilidad } from '@/api/disponibilidad'
import { puedeAbrir } from '@/app/navegacion'
import { useSesion } from '@/auth/useSesion'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { DataTable, type Columna } from '@/components/ui/table'
import {
  aFilas,
  type FilaDeDisponibilidad,
} from '@/modulos/ventas/disponibilidad'
import { ExistenciaPorBanco } from '@/modulos/ventas/ExistenciaPorBanco'
import { Disponible } from '@/modulos/ventas/insignias'
import { CLAVE_DISPONIBILIDAD } from '@/modulos/ventas/pedidos'

const RUTA_BANCOS = '/produccion/bancos'

const cantidad = (n: number) => (
  <span className="font-mono tabular-nums">{n}</span>
)

const columnas: Columna<FilaDeDisponibilidad>[] = [
  {
    clave: 'raza',
    titulo: 'Raza',
    orden: (a, b) => a.raza.localeCompare(b.raza),
  },
  {
    clave: 'enjauladas',
    titulo: 'Enjauladas',
    render: (d) => cantidad(d.enjauladas),
    orden: (a, b) => a.enjauladas - b.enjauladas,
  },
  {
    clave: 'reservadas',
    titulo: 'Reservadas',
    render: (d) => cantidad(d.reservadas),
    orden: (a, b) => a.reservadas - b.reservadas,
  },
  {
    clave: 'disponible',
    titulo: 'Disponible',
    render: (d) => <Disponible valor={d.disponible} />,
    orden: (a, b) => a.disponible - b.disponible,
  },
  {
    clave: 'bancos',
    titulo: 'Dónde están',
    render: (d) => <ExistenciaPorBanco bancos={d.bancos} />,
  },
]

export default function DisponibilidadPage() {
  const { identidad } = useSesion()
  // La misma clave que el despacho: reservar, entregar o cancelar un pedido
  // la invalida y esta pantalla se actualiza sola.
  const listado = useQuery({
    queryKey: [CLAVE_DISPONIBILIDAD],
    queryFn: () => disponibilidad.listar(),
    select: aFilas,
  })

  // Ventas no abre Producción (ACCESOS): sin el botón, no cae en un aviso.
  const verBancos = puedeAbrir(identidad, RUTA_BANCOS) ? (
    <Button comoHijo variante="secundario">
      <Link to={RUTA_BANCOS}>
        <Warehouse className="size-4" aria-hidden /> Ver bancos
      </Link>
    </Button>
  ) : undefined

  return (
    <section className="space-y-seccion">
      <EncabezadoDePagina
        titulo="Disponibilidad"
        descripcion="Reinas enjauladas por raza, menos las reservadas para pedidos. Es el saldo de hoy. Dónde están es solo ubicación: lo disponible se cuenta por raza."
        acciones={verBancos}
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
          filas={listado.data}
          vacio={
            <Vacio titulo="Todavía no hay razas">
              Cada raza activa aparece acá aunque no tenga reinas. Se cargan en
              Producción, en Razas.
            </Vacio>
          }
        />
      )}
    </section>
  )
}
