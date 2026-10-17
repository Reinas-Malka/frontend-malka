/** Insignias de los embarques: el estado y el "4/6" de documentos. */
import { Badge } from '@/components/ui/badge'
import {
  DOCUMENTOS_DEL_EMBARQUE,
  NOMBRE_DE_ESTADO_EMBARQUE,
  type EstadoEmbarque,
} from '@/tipos/dominio'

const TONO_DE_ESTADO: Record<
  EstadoEmbarque,
  'neutro' | 'miel' | 'ok' | 'peligro'
> = {
  en_preparacion: 'neutro',
  en_transito: 'miel',
  entregado: 'ok',
  cancelado: 'peligro',
}

export function EstadoDeEmbarque({ estado }: { estado: EstadoEmbarque }) {
  return (
    <Badge tono={TONO_DE_ESTADO[estado]}>
      {NOMBRE_DE_ESTADO_EMBARQUE[estado]}
    </Badge>
  )
}

/** "4/6": cuántos de los 6 documentos tiene. Completo en verde. */
export function IndicadorDeDocumentos({ cargados }: { cargados: number }) {
  const total = DOCUMENTOS_DEL_EMBARQUE.length
  const completo = cargados >= total
  return (
    <Badge
      tono={completo ? 'ok' : 'aviso'}
      aria-label={`${cargados} de ${total} documentos`}
    >
      <span className="font-mono tabular-nums">
        {cargados}/{total}
      </span>
      {completo ? 'completo' : 'faltan'}
    </Badge>
  )
}
