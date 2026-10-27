/** Insignias de los pedidos: el estado, con el mismo tono que los embarques. */
import { Badge } from '@/components/ui/badge'
import { NOMBRE_DE_ESTADO_PEDIDO, type EstadoPedido } from '@/tipos/dominio'

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
