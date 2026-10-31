/** Insignias de los pedidos: el estado, con el mismo tono que los embarques. */
import { Badge } from '@/components/ui/badge'
import {
  NOMBRE_DE_ESTADO_PEDIDO,
  NOMBRE_DE_ESTADO_RESERVA,
  type EstadoPedido,
  type EstadoReserva,
} from '@/tipos/dominio'

const TONO_DE_ESTADO: Record<
  EstadoPedido,
  'neutro' | 'miel' | 'ok' | 'peligro'
> = {
  borrador: 'neutro',
  reservado: 'miel',
  entregado: 'ok',
  cancelado: 'peligro',
}

export function EstadoDePedido({ estado }: { estado: EstadoPedido }) {
  return (
    <Badge tono={TONO_DE_ESTADO[estado]}>
      {NOMBRE_DE_ESTADO_PEDIDO[estado]}
    </Badge>
  )
}

/** Activa mientras el pedido espera; consumida al entregar; liberada al
 *  cancelar. */
const TONO_DE_RESERVA: Record<EstadoReserva, 'neutro' | 'miel' | 'ok'> = {
  activa: 'miel',
  consumida: 'ok',
  liberada: 'neutro',
}

export function EstadoDeReserva({ estado }: { estado: EstadoReserva }) {
  return (
    <Badge tono={TONO_DE_RESERVA[estado]}>
      {NOMBRE_DE_ESTADO_RESERVA[estado]}
    </Badge>
  )
}

/** Disponible de una raza. Negativo si se perdieron enjauladas ya
 *  reservadas (una extraviada): se marca para que no pase como un número más. */
export function Disponible({ valor }: { valor: number }) {
  if (valor < 0)
    return (
      <Badge tono="peligro" title="Hay más reservadas que enjauladas">
        <span className="font-mono tabular-nums">{valor}</span>
      </Badge>
    )
  return (
    <span className="font-mono font-medium tabular-nums text-miel-300">
      {valor}
    </span>
  )
}
